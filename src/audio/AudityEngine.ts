import { AudityPatch, WaveMorphBlend, WavetableDefinition } from '../types/synth';
import {
  FACTORY_WAVETABLES,
  computeFourierCoefficients,
  getMorphedSamples,
} from '../data/wavetables';

interface ActiveVoice {
  id: string;
  note: number;
  velocity: number;
  startedAt: number;
  osc1: OscillatorNode;
  osc2: OscillatorNode;
  subOsc: OscillatorNode;
  vco1Gain: GainNode;
  vco2Gain: GainNode;
  fmGain: GainNode;
  ringOscGain: GainNode;
  ringMixGain: GainNode;
  noiseSrc: AudioBufferSourceNode;
  noiseGain: GainNode;
  noiseTone: BiquadFilterNode;
  hpf: BiquadFilterNode;
  lpf1: BiquadFilterNode;
  lpf2: BiquadFilterNode;
  otaDrive: WaveShaperNode;
  vca: GainNode;
  panner: StereoPannerNode;
  lfoPitchGain: GainNode;
  lfoFilterGain: GainNode;
  releaseTimer?: number;
}

function midiToFreq(note: number, cents = 0): number {
  return 440 * Math.pow(2, (note - 69 + cents / 100) / 12);
}

function makeSoftClipCurve(drive: number): Float32Array<ArrayBuffer> {
  const n = 512;
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  const k = 1 + drive * 6.5;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return curve;
}

export class AudityEngine {
  private ctx: AudioContext | null = null;
  private masterGain!: GainNode;
  private limiter!: DynamicsCompressorNode;
  private analyser!: AnalyserNode;

  // Effects bus
  private voiceBus!: GainNode;
  private chorusL!: DelayNode;
  private chorusR!: DelayNode;
  private chorusLfo!: OscillatorNode;
  private chorusLfoGainL!: GainNode;
  private chorusLfoGainR!: GainNode;
  private chorusWetGain!: GainNode;
  private chorusDryGain!: GainNode;

  private delayNode!: DelayNode;
  private delayFeedback!: GainNode;
  private delayTone!: BiquadFilterNode;
  private delayWet!: GainNode;

  private reverbConvolver!: ConvolverNode;
  private reverbWet!: GainNode;

  // Global LFO
  private lfoOsc!: OscillatorNode;
  private lfoGain!: GainNode;
  private noiseBuffer!: AudioBuffer;

  private voices: Map<string, ActiveVoice> = new Map();
  private lastNotePlayed: number | null = null;
  private patch!: AudityPatch;
  private wavetables: Map<string, WavetableDefinition> = new Map();
  private periodicWaveCache: Map<string, PeriodicWave> = new Map();
  private morphBlend: WaveMorphBlend | null = null;
  private lastAppliedDrive = -1;

  private pitchBendSemis = 0;
  private modWheelValue = 0;
  private sustainPedal = false;
  private sustainedIds: Set<string> = new Set();

  constructor(initialPatch: AudityPatch, wavetables: WavetableDefinition[] = FACTORY_WAVETABLES) {
    this.patch = initialPatch;
    for (const wt of wavetables) {
      this.wavetables.set(wt.id, wt);
    }
  }

  public init(): AudioContext {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return this.ctx;
    }

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AudioCtx();

    // Master chain: voiceBus -> BBD Chorus -> Tape Delay + Hall Reverb -> Limiter -> MasterGain -> Analyser -> Destination
    this.voiceBus = this.ctx.createGain();
    this.voiceBus.gain.value = 0.72;

    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -8;
    this.limiter.knee.value = 12;
    this.limiter.ratio.value = 8;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.16;

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.patch.masterVolume;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.78;

    // BBD Stereo Chorus
    this.chorusDryGain = this.ctx.createGain();
    this.chorusWetGain = this.ctx.createGain();
    this.chorusL = this.ctx.createDelay(0.1);
    this.chorusR = this.ctx.createDelay(0.1);
    this.chorusL.delayTime.value = 0.014;
    this.chorusR.delayTime.value = 0.021;

    this.chorusLfo = this.ctx.createOscillator();
    this.chorusLfo.type = 'sine';
    this.chorusLfo.frequency.value = this.patch.chorusRate;
    this.chorusLfoGainL = this.ctx.createGain();
    this.chorusLfoGainR = this.ctx.createGain();
    this.chorusLfoGainL.gain.value = 0.0035;
    this.chorusLfoGainR.gain.value = -0.0035;
    this.chorusLfo.connect(this.chorusLfoGainL);
    this.chorusLfo.connect(this.chorusLfoGainR);
    this.chorusLfoGainL.connect(this.chorusL.delayTime);
    this.chorusLfoGainR.connect(this.chorusR.delayTime);
    this.chorusLfo.start();

    const chorusMerger = this.ctx.createChannelMerger(2);
    this.voiceBus.connect(this.chorusDryGain);
    this.voiceBus.connect(this.chorusL);
    this.voiceBus.connect(this.chorusR);
    this.chorusL.connect(chorusMerger, 0, 0);
    this.chorusR.connect(chorusMerger, 0, 1);
    chorusMerger.connect(this.chorusWetGain);

    const postChorus = this.ctx.createGain();
    this.chorusDryGain.connect(postChorus);
    this.chorusWetGain.connect(postChorus);

    // Tape Delay
    this.delayNode = this.ctx.createDelay(2.0);
    this.delayFeedback = this.ctx.createGain();
    this.delayTone = this.ctx.createBiquadFilter();
    this.delayTone.type = 'lowpass';
    this.delayTone.frequency.value = 2600;
    this.delayWet = this.ctx.createGain();

    postChorus.connect(this.delayNode);
    this.delayNode.connect(this.delayTone);
    this.delayTone.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delayNode);
    this.delayTone.connect(this.delayWet);

    // Hall Reverb
    this.reverbConvolver = this.ctx.createConvolver();
    this.reverbConvolver.buffer = this.buildImpulseResponse(this.patch.reverbDecay);
    this.reverbWet = this.ctx.createGain();
    postChorus.connect(this.reverbConvolver);
    this.reverbConvolver.connect(this.reverbWet);

    // Sum to limiter
    postChorus.connect(this.limiter);
    this.delayWet.connect(this.limiter);
    this.reverbWet.connect(this.limiter);

    this.limiter.connect(this.masterGain);
    this.masterGain.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    // Global LFO
    this.lfoOsc = this.ctx.createOscillator();
    this.lfoGain = this.ctx.createGain();
    this.lfoGain.gain.value = 1;
    this.lfoOsc.connect(this.lfoGain);
    this.lfoOsc.start();

    // Prebuild 2 seconds of white noise
    const len = this.ctx.sampleRate * 2;
    this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    this.applyEffectsAndGlobal();
    return this.ctx;
  }

  public getContext(): AudioContext | null {
    return this.ctx;
  }

  public getAnalyser(): AnalyserNode | null {
    return this.analyser ?? null;
  }

  public getActiveVoiceCount(): number {
    return this.voices.size;
  }

  public setWavetables(list: WavetableDefinition[]) {
    this.wavetables.clear();
    for (const wt of list) {
      this.wavetables.set(wt.id, wt);
    }
    this.periodicWaveCache.clear();
    this.refreshActiveVoicesWaveforms();
  }

  public updateWavetable(wt: WavetableDefinition) {
    this.wavetables.set(wt.id, wt);
    // Clear cached entries matching this wavetable id
    for (const key of Array.from(this.periodicWaveCache.keys())) {
      if (key.startsWith(`${wt.id}:`)) {
        this.periodicWaveCache.delete(key);
      }
    }
    this.refreshActiveVoicesWaveforms();
  }

  private cachePeriodicWave(key: string, pw: PeriodicWave) {
    if (this.periodicWaveCache.size > 480) {
      const oldest = this.periodicWaveCache.keys().next().value;
      if (oldest !== undefined) {
        this.periodicWaveCache.delete(oldest);
      }
    }
    this.periodicWaveCache.set(key, pw);
  }

  private getPeriodicWave(waveId: string, morph: number): PeriodicWave | null {
    if (!this.ctx) return null;
    const wt = this.wavetables.get(waveId) ?? FACTORY_WAVETABLES[0];
    const quantizedMorph = Math.round(morph * 24) / 24;
    const cacheKey = `${wt.id}:${quantizedMorph.toFixed(3)}`;
    const cached = this.periodicWaveCache.get(cacheKey);
    if (cached) return cached;

    const samples = getMorphedSamples(wt, quantizedMorph);
    const { real, imag } = computeFourierCoefficients(samples, 44);
    const pw = this.ctx.createPeriodicWave(real, imag, { disableNormalization: false });
    this.cachePeriodicWave(cacheKey, pw);
    return pw;
  }

  private getEffectivePeriodicWave(
    osc: 'vco1' | 'vco2',
    fallbackWaveId: string,
    fallbackMorph: number
  ): PeriodicWave | null {
    if (!this.ctx) return null;
    const blend = this.morphBlend;
    if (!blend) {
      return this.getPeriodicWave(fallbackWaveId, fallbackMorph);
    }

    const idA = osc === 'vco1' ? blend.vco1WaveIdA : blend.vco2WaveIdA;
    const mA = osc === 'vco1' ? blend.vco1MorphA : blend.vco2MorphA;
    const idB = osc === 'vco1' ? blend.vco1WaveIdB : blend.vco2WaveIdB;
    const mB = osc === 'vco1' ? blend.vco1MorphB : blend.vco2MorphB;

    if (idA === idB && Math.abs(mA - mB) < 0.01) {
      return this.getPeriodicWave(idA, mA);
    }

    const qt = Math.round(blend.t * 32) / 32;
    if (qt <= 0.001) return this.getPeriodicWave(idA, mA);
    if (qt >= 0.999) return this.getPeriodicWave(idB, mB);

    const qmA = Math.round(mA * 24) / 24;
    const qmB = Math.round(mB * 24) / 24;
    const cacheKey = `blend:${idA}:${qmA.toFixed(3)}:${idB}:${qmB.toFixed(3)}:${qt.toFixed(3)}`;
    const cached = this.periodicWaveCache.get(cacheKey);
    if (cached) return cached;

    const wtA = this.wavetables.get(idA) ?? FACTORY_WAVETABLES[0];
    const wtB = this.wavetables.get(idB) ?? FACTORY_WAVETABLES[0];
    const sA = getMorphedSamples(wtA, qmA);
    const sB = getMorphedSamples(wtB, qmB);
    const len = Math.min(sA.length, sB.length);
    const mixed = new Array<number>(len);
    for (let i = 0; i < len; i++) {
      mixed[i] = sA[i] * (1 - qt) + sB[i] * qt;
    }

    const { real, imag } = computeFourierCoefficients(mixed, 44);
    const pw = this.ctx.createPeriodicWave(real, imag, { disableNormalization: false });
    this.cachePeriodicWave(cacheKey, pw);
    return pw;
  }

  public setMorphWaveBlend(blend: WaveMorphBlend | null) {
    const prevT = this.morphBlend?.t;
    const wasNull = this.morphBlend === null;
    this.morphBlend = blend;
    if (!this.ctx) return;

    const shouldRefresh =
      wasNull !== (blend === null) ||
      (blend !== null && prevT !== undefined && Math.abs(blend.t - prevT) > 0.015);
    if (shouldRefresh) {
      this.refreshActiveVoicesWaveforms();
    }
  }

  public setPatch(nextPatch: AudityPatch) {
    const prevDecay = this.patch?.reverbDecay;
    const prevWave1 = this.patch?.vco1WaveId;
    const prevWave2 = this.patch?.vco2WaveId;
    const prevMorph1 = this.patch?.vco1Morph;
    const prevMorph2 = this.patch?.vco2Morph;

    this.patch = nextPatch;
    if (!this.ctx) return;

    this.applyEffectsAndGlobal();
    if (prevDecay !== undefined && Math.abs(prevDecay - nextPatch.reverbDecay) > 0.04) {
      this.reverbConvolver.buffer = this.buildImpulseResponse(nextPatch.reverbDecay);
    }

    const waveChanged =
      this.morphBlend !== null ||
      prevWave1 !== nextPatch.vco1WaveId ||
      prevWave2 !== nextPatch.vco2WaveId ||
      Math.abs((prevMorph1 ?? 0) - nextPatch.vco1Morph) > 0.02 ||
      Math.abs((prevMorph2 ?? 0) - nextPatch.vco2Morph) > 0.02;

    this.updateLiveVoiceParameters(waveChanged);
  }

  public setPitchBend(semis: number) {
    this.pitchBendSemis = semis;
    this.updateLiveVoiceParameters(false);
  }

  public setModWheel(val: number) {
    this.modWheelValue = Math.max(0, Math.min(1, val));
    this.updateLiveVoiceParameters(false);
  }

  public setSustain(down: boolean) {
    this.sustainPedal = down;
    if (!down) {
      const toRelease = Array.from(this.sustainedIds);
      this.sustainedIds.clear();
      for (const id of toRelease) {
        this.releaseVoiceById(id);
      }
    }
  }

  private applyEffectsAndGlobal() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const p = this.patch;

    this.masterGain.gain.setTargetAtTime(p.masterVolume, now, 0.02);

    this.chorusDryGain.gain.setTargetAtTime(1 - p.chorusMix * 0.45, now, 0.03);
    this.chorusWetGain.gain.setTargetAtTime(p.chorusMix * 0.72, now, 0.03);
    this.chorusLfo.frequency.setTargetAtTime(p.chorusRate, now, 0.04);

    this.delayNode.delayTime.setTargetAtTime(p.delayTime, now, 0.04);
    this.delayFeedback.gain.setTargetAtTime(Math.min(0.86, p.delayFeedback), now, 0.03);
    this.delayWet.gain.setTargetAtTime(p.delayMix * 0.7, now, 0.03);

    this.reverbWet.gain.setTargetAtTime(p.reverbMix * 0.75, now, 0.03);

    // LFO shape & frequency
    const mappedShape: OscillatorType =
      p.lfoShape === 'sampleHold' ? 'square' : p.lfoShape === 'saw' ? 'sawtooth' : p.lfoShape;
    if (this.lfoOsc.type !== mappedShape) {
      this.lfoOsc.type = mappedShape;
    }
    this.lfoOsc.frequency.setTargetAtTime(p.lfoRate, now, 0.03);
  }

  private refreshActiveVoicesWaveforms() {
    if (!this.ctx) return;
    const pw1 = this.getEffectivePeriodicWave('vco1', this.patch.vco1WaveId, this.patch.vco1Morph);
    const pw2 = this.getEffectivePeriodicWave('vco2', this.patch.vco2WaveId, this.patch.vco2Morph);
    for (const v of this.voices.values()) {
      if (pw1) v.osc1.setPeriodicWave(pw1);
      if (pw2) v.osc2.setPeriodicWave(pw2);
    }
  }

  private updateLiveVoiceParameters(refreshWaves: boolean) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const p = this.patch;
    const pw1 = refreshWaves
      ? this.getEffectivePeriodicWave('vco1', p.vco1WaveId, p.vco1Morph)
      : null;
    const pw2 = refreshWaves
      ? this.getEffectivePeriodicWave('vco2', p.vco2WaveId, p.vco2Morph)
      : null;

    const updateDrive = Math.abs(p.lpfDrive - this.lastAppliedDrive) > 0.015;
    const driveCurve = updateDrive ? makeSoftClipCurve(p.lpfDrive) : null;
    if (updateDrive) {
      this.lastAppliedDrive = p.lpfDrive;
    }

    const totalPitchVib = (p.lfoToPitch + this.modWheelValue * 0.45) * 85;
    const totalFilterLfo = p.lfoToFilter * 1600;

    for (const v of this.voices.values()) {
      const baseNote = v.note + p.masterTune / 100 + this.pitchBendSemis;
      const f1 = midiToFreq(baseNote + p.vco1Octave * 12 + p.vco1Tune, p.vco1Fine);
      const syncShift = p.vco2Sync ? 1.5 : 0;
      const f2 = midiToFreq(baseNote + p.vco2Octave * 12 + p.vco2Tune + syncShift, p.vco2Fine);

      v.osc1.frequency.setTargetAtTime(f1, now, 0.015);
      v.osc2.frequency.setTargetAtTime(f2, now, 0.015);
      v.subOsc.frequency.setTargetAtTime(f1 * 0.5, now, 0.015);

      if (pw1) v.osc1.setPeriodicWave(pw1);
      if (pw2) v.osc2.setPeriodicWave(pw2);

      v.vco1Gain.gain.setTargetAtTime(p.vco1Level * 0.45, now, 0.02);
      v.vco2Gain.gain.setTargetAtTime(p.vco2Level * 0.45, now, 0.02);
      v.fmGain.gain.setTargetAtTime(p.crossModFm * f1 * 1.4, now, 0.02);
      v.ringMixGain.gain.setTargetAtTime(p.ringModLevel * 0.45, now, 0.02);
      v.noiseGain.gain.setTargetAtTime(p.noiseLevel * 0.25, now, 0.02);
      v.noiseTone.frequency.setTargetAtTime(400 + p.noiseColor * 9500, now, 0.02);

      v.hpf.frequency.setTargetAtTime(p.hpfCutoff, now, 0.02);
      v.hpf.Q.setTargetAtTime(0.7 + p.hpfResonance * 14, now, 0.02);

      const keyTrackRatio = Math.pow(2, ((v.note - 60) / 12) * p.lpfKeyTrack);
      const targetCutoff = Math.max(30, Math.min(18500, p.lpfCutoff * keyTrackRatio));
      v.lpf1.frequency.setTargetAtTime(targetCutoff, now, 0.025);
      v.lpf2.frequency.setTargetAtTime(targetCutoff, now, 0.025);
      v.lpf1.Q.setTargetAtTime(0.6 + p.lpfResonance * 12, now, 0.025);
      v.lpf2.Q.setTargetAtTime(0.6 + p.lpfResonance * 8, now, 0.025);
      if (driveCurve) {
        v.otaDrive.curve = driveCurve;
      }

      v.lfoPitchGain.gain.setTargetAtTime(totalPitchVib, now, 0.03);
      v.lfoFilterGain.gain.setTargetAtTime(totalFilterLfo, now, 0.03);
    }
  }

  public noteOn(note: number, velocity = 0.85) {
    const ctx = this.init();
    const p = this.patch;

    if (p.voiceMode === 'mono') {
      this.allNotesOffImmediate(true);
    } else if (p.voiceMode === 'unison') {
      this.allNotesOffImmediate(true);
      this.spawnVoice(note, velocity, -p.unisonDetune * 18, -0.45, `u1-${note}`);
      this.spawnVoice(note, velocity, 0, 0, `u2-${note}`);
      this.spawnVoice(note, velocity, p.unisonDetune * 18, 0.45, `u3-${note}`);
      this.lastNotePlayed = note;
      return;
    }

    // 16-voice polyphony steal oldest if full
    if (this.voices.size >= 16) {
      let oldestId: string | null = null;
      let oldestTime = Infinity;
      for (const [id, v] of this.voices.entries()) {
        if (v.startedAt < oldestTime) {
          oldestTime = v.startedAt;
          oldestId = id;
        }
      }
      if (oldestId) {
        this.forceCleanupVoice(oldestId);
      }
    }

    const voiceId = `n-${note}`;
    if (this.voices.has(voiceId)) {
      this.forceCleanupVoice(voiceId);
    }

    // Subtle stereo spread across Audity's 16 voice cards
    const cardPan = (((note % 7) - 3) / 3) * 0.28;
    this.spawnVoice(note, velocity, 0, cardPan, voiceId);
    this.lastNotePlayed = note;
    void ctx;
  }

  private spawnVoice(
    note: number,
    velocity: number,
    extraDetuneCents: number,
    pan: number,
    voiceId: string
  ) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const p = this.patch;

    const glideTime = p.glide > 0.01 && this.lastNotePlayed !== null ? p.glide * 0.35 : 0;
    const startNote = glideTime > 0 && this.lastNotePlayed !== null ? this.lastNotePlayed : note;

    const baseNoteNow = note + p.masterTune / 100 + this.pitchBendSemis;
    const startBaseNote = startNote + p.masterTune / 100 + this.pitchBendSemis;

    const f1Start = midiToFreq(startBaseNote + p.vco1Octave * 12 + p.vco1Tune, p.vco1Fine + extraDetuneCents);
    const f1Target = midiToFreq(baseNoteNow + p.vco1Octave * 12 + p.vco1Tune, p.vco1Fine + extraDetuneCents);

    const syncShift = p.vco2Sync ? 1.5 : 0;
    const f2Start = midiToFreq(startBaseNote + p.vco2Octave * 12 + p.vco2Tune + syncShift, p.vco2Fine - extraDetuneCents);
    const f2Target = midiToFreq(baseNoteNow + p.vco2Octave * 12 + p.vco2Tune + syncShift, p.vco2Fine - extraDetuneCents);

    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const subOsc = this.ctx.createOscillator();
    subOsc.type = 'triangle';

    const pw1 = this.getEffectivePeriodicWave('vco1', p.vco1WaveId, p.vco1Morph);
    const pw2 = this.getEffectivePeriodicWave('vco2', p.vco2WaveId, p.vco2Morph);
    if (pw1) osc1.setPeriodicWave(pw1);
    if (pw2) osc2.setPeriodicWave(pw2);

    osc1.frequency.setValueAtTime(f1Start, now);
    osc2.frequency.setValueAtTime(f2Start, now);
    subOsc.frequency.setValueAtTime(f1Start * 0.5, now);

    if (glideTime > 0) {
      osc1.frequency.exponentialRampToValueAtTime(Math.max(10, f1Target), now + glideTime);
      osc2.frequency.exponentialRampToValueAtTime(Math.max(10, f2Target), now + glideTime);
      subOsc.frequency.exponentialRampToValueAtTime(Math.max(10, f1Target * 0.5), now + glideTime);
    }

    const vco1Gain = this.ctx.createGain();
    const vco2Gain = this.ctx.createGain();
    const subGain = this.ctx.createGain();
    vco1Gain.gain.value = p.vco1Level * 0.45;
    vco2Gain.gain.value = p.vco2Level * 0.45;
    subGain.gain.value = p.vco1Pwm > 0.65 ? 0.14 : 0.05;

    // Cross-Mod FM (VCO2 -> VCO1 frequency)
    const fmGain = this.ctx.createGain();
    fmGain.gain.value = p.crossModFm * f1Target * 1.4;
    osc2.connect(fmGain);
    fmGain.connect(osc1.frequency);

    // Ring Modulator (VCO1 amplitude modulated by VCO2)
    const ringOscGain = this.ctx.createGain();
    ringOscGain.gain.value = 0;
    const ringMixGain = this.ctx.createGain();
    ringMixGain.gain.value = p.ringModLevel * 0.45;
    osc1.connect(ringOscGain);
    osc2.connect(ringOscGain.gain);
    ringOscGain.connect(ringMixGain);

    // Noise Generator
    const noiseSrc = this.ctx.createBufferSource();
    noiseSrc.buffer = this.noiseBuffer;
    noiseSrc.loop = true;
    const noiseTone = this.ctx.createBiquadFilter();
    noiseTone.type = 'lowpass';
    noiseTone.frequency.value = 400 + p.noiseColor * 9500;
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.value = p.noiseLevel * 0.25;

    noiseSrc.connect(noiseTone);
    noiseTone.connect(noiseGain);

    // Dual SSM2040 Filter Stage: HPF -> LPF1 -> OTA Drive -> LPF2
    const hpf = this.ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = p.hpfCutoff;
    hpf.Q.value = 0.7 + p.hpfResonance * 14;

    const velToCutoff = p.modRoutes
      .filter((r) => r.enabled && r.source === 'velocity' && r.target === 'lpfCutoff')
      .reduce((acc, r) => acc + r.amount, 0);

    const keyTrackRatio = Math.pow(2, ((note - 60) / 12) * p.lpfKeyTrack);
    const baseLpf = Math.max(30, Math.min(18500, p.lpfCutoff * keyTrackRatio));
    const envPeak = Math.max(
      35,
      Math.min(
        18500,
        baseLpf + p.lpfEnvAmount * 8800 * (0.45 + 0.55 * velocity + velToCutoff * 0.5 * (velocity - 0.5))
      )
    );
    const envSustain = Math.max(
      35,
      Math.min(18500, baseLpf + (envPeak - baseLpf) * p.tg1Sustain)
    );

    const lpf1 = this.ctx.createBiquadFilter();
    lpf1.type = 'lowpass';
    lpf1.Q.value = 0.6 + p.lpfResonance * 12;

    const lpf2 = this.ctx.createBiquadFilter();
    lpf2.type = 'lowpass';
    lpf2.Q.value = 0.6 + p.lpfResonance * 8;

    const otaDrive = this.ctx.createWaveShaper();
    otaDrive.curve = makeSoftClipCurve(p.lpfDrive);
    otaDrive.oversample = '2x';

    // Schedule TG1 Filter Envelope (analog RC attack + exponential decay to sustain)
    const tg1Atk = Math.max(0.002, p.tg1Attack);
    const tg1Tau = Math.max(0.008, p.tg1Decay / 3.2);
    lpf1.frequency.setValueAtTime(baseLpf, now);
    lpf1.frequency.linearRampToValueAtTime(envPeak, now + tg1Atk);
    lpf1.frequency.setTargetAtTime(envSustain, now + tg1Atk, tg1Tau);

    lpf2.frequency.setValueAtTime(baseLpf, now);
    lpf2.frequency.linearRampToValueAtTime(envPeak, now + tg1Atk);
    lpf2.frequency.setTargetAtTime(envSustain, now + tg1Atk, tg1Tau);

    // Optional TG1 -> Pitch envelope (e.g. 808 Sub Boom punch)
    const tg1PitchAmt = p.modRoutes
      .filter((r) => r.enabled && r.source === 'tg1' && r.target === 'vco1Pitch')
      .reduce((acc, r) => acc + r.amount, 0);
    if (Math.abs(tg1PitchAmt) > 0.01) {
      const pitchPeak = Math.max(20, f1Target * Math.pow(2, tg1PitchAmt * 2));
      osc1.frequency.setValueAtTime(pitchPeak, now);
      osc1.frequency.exponentialRampToValueAtTime(Math.max(15, f1Target), now + Math.max(0.02, p.tg1Decay * 0.45));
    }

    // VCA & TG2 Amp Envelope
    const vca = this.ctx.createGain();
    const velScale = 1 - p.vcaVelocitySens + p.vcaVelocitySens * velocity;
    const peakAmp = 0.34 * velScale;
    const susAmp = Math.max(0.0001, peakAmp * p.tg2Sustain);
    const tg2Atk = Math.max(0.002, p.tg2Attack);
    const tg2Tau = Math.max(0.008, p.tg2Decay / 3.2);

    vca.gain.setValueAtTime(0.0001, now);
    vca.gain.linearRampToValueAtTime(peakAmp, now + tg2Atk);
    vca.gain.setTargetAtTime(susAmp, now + tg2Atk, tg2Tau);

    const panner = this.ctx.createStereoPanner();
    panner.pan.value = pan;

    // Connect LFO to Voice Pitch, Filter & Optional Tremolo with LFO Delay fade-in
    const lfoPitchGain = this.ctx.createGain();
    const targetVib = (p.lfoToPitch + this.modWheelValue * 0.45) * 85;
    if (p.lfoDelay > 0.02) {
      lfoPitchGain.gain.setValueAtTime(0.001, now);
      lfoPitchGain.gain.linearRampToValueAtTime(targetVib, now + p.lfoDelay);
    } else {
      lfoPitchGain.gain.value = targetVib;
    }

    const lfoFilterGain = this.ctx.createGain();
    lfoFilterGain.gain.value = p.lfoToFilter * 1600;

    this.lfoGain.connect(lfoPitchGain);
    this.lfoGain.connect(lfoFilterGain);
    lfoPitchGain.connect(osc1.detune);
    lfoPitchGain.connect(osc2.detune);
    lfoFilterGain.connect(lpf1.frequency);
    lfoFilterGain.connect(lpf2.frequency);

    const lfoVcaAmt = p.modRoutes
      .filter((r) => r.enabled && r.source === 'lfo' && r.target === 'vcaLevel')
      .reduce((acc, r) => acc + r.amount, 0);
    if (Math.abs(lfoVcaAmt) > 0.01) {
      const tremGain = this.ctx.createGain();
      tremGain.gain.value = lfoVcaAmt * 0.08;
      this.lfoGain.connect(tremGain);
      tremGain.connect(vca.gain);
    }

    // Signal Routing
    osc1.connect(vco1Gain);
    osc2.connect(vco2Gain);
    subOsc.connect(subGain);

    vco1Gain.connect(hpf);
    vco2Gain.connect(hpf);
    subGain.connect(hpf);
    ringMixGain.connect(hpf);
    noiseGain.connect(hpf);

    hpf.connect(lpf1);
    lpf1.connect(otaDrive);
    otaDrive.connect(lpf2);
    lpf2.connect(vca);
    vca.connect(panner);
    panner.connect(this.voiceBus);

    osc1.start(now);
    osc2.start(now);
    subOsc.start(now);
    noiseSrc.start(now);

    this.voices.set(voiceId, {
      id: voiceId,
      note,
      velocity,
      startedAt: now,
      osc1,
      osc2,
      subOsc,
      vco1Gain,
      vco2Gain,
      fmGain,
      ringOscGain,
      ringMixGain,
      noiseSrc,
      noiseGain,
      noiseTone,
      hpf,
      lpf1,
      lpf2,
      otaDrive,
      vca,
      panner,
      lfoPitchGain,
      lfoFilterGain,
    });
  }

  public noteOff(note: number) {
    if (!this.ctx) return;
    const ids = this.patch.voiceMode === 'unison'
      ? [`u1-${note}`, `u2-${note}`, `u3-${note}`]
      : [`n-${note}`];

    for (const id of ids) {
      if (this.sustainPedal) {
        this.sustainedIds.add(id);
      } else {
        this.releaseVoiceById(id);
      }
    }
  }

  private releaseVoiceById(voiceId: string) {
    if (!this.ctx) return;
    const v = this.voices.get(voiceId);
    if (!v) return;

    const now = this.ctx.currentTime;
    const rel = Math.max(0.015, this.patch.tg2Release);
    const fRel = Math.max(0.015, this.patch.tg1Release);

    v.vca.gain.cancelScheduledValues(now);
    v.vca.gain.setValueAtTime(Math.max(0.0001, v.vca.gain.value), now);
    v.vca.gain.exponentialRampToValueAtTime(0.0001, now + rel);

    const keyTrackRatio = Math.pow(2, ((v.note - 60) / 12) * this.patch.lpfKeyTrack);
    const baseLpf = Math.max(35, Math.min(18500, this.patch.lpfCutoff * keyTrackRatio));
    v.lpf1.frequency.cancelScheduledValues(now);
    v.lpf1.frequency.setValueAtTime(Math.max(35, v.lpf1.frequency.value), now);
    v.lpf1.frequency.exponentialRampToValueAtTime(baseLpf, now + fRel);

    v.lpf2.frequency.cancelScheduledValues(now);
    v.lpf2.frequency.setValueAtTime(Math.max(35, v.lpf2.frequency.value), now);
    v.lpf2.frequency.exponentialRampToValueAtTime(baseLpf, now + fRel);

    const stopAt = now + rel + 0.04;
    try {
      v.osc1.stop(stopAt);
      v.osc2.stop(stopAt);
      v.subOsc.stop(stopAt);
      v.noiseSrc.stop(stopAt);
    } catch {
      // Ignore already-stopped oscillators
    }

    this.voices.delete(voiceId);
    v.releaseTimer = window.setTimeout(() => {
      try {
        v.lfoPitchGain.disconnect();
        v.lfoFilterGain.disconnect();
        v.vca.disconnect();
        v.panner.disconnect();
      } catch {
        // Ignore disconnect errors
      }
    }, (rel + 0.08) * 1000);
  }

  private forceCleanupVoice(voiceId: string) {
    const v = this.voices.get(voiceId);
    if (!v) return;
    if (v.releaseTimer) window.clearTimeout(v.releaseTimer);
    try {
      v.osc1.stop();
      v.osc2.stop();
      v.subOsc.stop();
      v.noiseSrc.stop();
      v.lfoPitchGain.disconnect();
      v.lfoFilterGain.disconnect();
      v.vca.disconnect();
      v.panner.disconnect();
    } catch {
      // ignore
    }
    this.voices.delete(voiceId);
  }

  public allNotesOffImmediate(quickFade = false) {
    if (!this.ctx) {
      this.voices.clear();
      return;
    }
    const now = this.ctx.currentTime;
    for (const [id, v] of this.voices.entries()) {
      if (quickFade) {
        v.vca.gain.cancelScheduledValues(now);
        v.vca.gain.setValueAtTime(Math.max(0.0001, v.vca.gain.value), now);
        v.vca.gain.exponentialRampToValueAtTime(0.0001, now + 0.02);
        try {
          v.osc1.stop(now + 0.03);
          v.osc2.stop(now + 0.03);
          v.subOsc.stop(now + 0.03);
          v.noiseSrc.stop(now + 0.03);
        } catch {
          // ignore
        }
        this.voices.delete(id);
      } else {
        this.forceCleanupVoice(id);
      }
    }
    this.sustainedIds.clear();
  }

  private buildImpulseResponse(decayNormalized: number): AudioBuffer {
    const ctx = this.ctx!;
    const duration = 0.8 + decayNormalized * 2.6;
    const len = Math.floor(ctx.sampleRate * duration);
    const impulse = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const env = Math.pow(1 - t, 2.2 + (1 - decayNormalized) * 2.5);
        data[i] = (Math.random() * 2 - 1) * env;
      }
    }
    return impulse;
  }
}
