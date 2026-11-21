export type WavetableSourceCategory = 'L.A. ROM' | 'SSM Analog' | 'L.A. Bank' | 'User Custom';

export interface WavetableDefinition {
  id: string;
  name: string;
  source: WavetableSourceCategory;
  bankRef: string;
  /** 128 samples in range [-1, 1] representing single-cycle waveform */
  samples: number[];
  /** Optional secondary frame for wavetable morphing */
  morphSamples?: number[];
  description: string;
}

export type LfoShape = 'sine' | 'triangle' | 'saw' | 'square' | 'sampleHold';

export type ModTarget =
  | 'vco1Pitch'
  | 'vco2Pitch'
  | 'vco1WaveMorph'
  | 'vco2WaveMorph'
  | 'lpfCutoff'
  | 'hpfCutoff'
  | 'vcaLevel'
  | 'pan';

export interface ModMatrixRoute {
  id: string;
  source: 'lfo' | 'tg1' | 'tg3' | 'velocity' | 'modWheel' | 'keyTrack';
  target: ModTarget;
  amount: number; // -1 to 1
  enabled: boolean;
}

export interface SequencerStep {
  noteOffset: number; // -24 to +24 semitones
  gate: boolean;
  accent: boolean;
  morphOffset: number; // 0 to 1
}

export interface AudityPatch {
  id: string;
  name: string;
  bank: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'USER';
  slot: number; // 1..16
  category: 'Brass' | 'Pad' | 'Bass' | 'Lead' | 'Keys' | 'Seq' | 'Wavetable' | 'FX';
  author: string;
  description: string;

  // Voice & Master Tuning
  voiceMode: 'poly16' | 'unison' | 'mono';
  glide: number; // 0..1
  masterTune: number; // -50..+50 cents
  masterVolume: number; // 0..1
  unisonDetune: number; // 0..1

  // VCO 1 (Wavetable / SSM Hybrid)
  vco1WaveId: string;
  vco1Morph: number; // 0..1
  vco1Octave: number; // -2..+2
  vco1Tune: number; // -12..+12 semitones
  vco1Fine: number; // -50..+50 cents
  vco1Level: number; // 0..1
  vco1Pwm: number; // 0..1

  // VCO 2 (Wavetable / Sync / Cross-Mod)
  vco2WaveId: string;
  vco2Morph: number; // 0..1
  vco2Octave: number; // -2..+2
  vco2Tune: number; // -12..+12 semitones
  vco2Fine: number; // -50..+50 cents
  vco2Level: number; // 0..1
  vco2Sync: boolean;
  crossModFm: number; // 0..1

  // Noise & Ring Mod
  noiseLevel: number; // 0..1
  noiseColor: number; // 0 (dark pink) .. 1 (bright white)
  ringModLevel: number; // 0..1

  // SSM2040 Dual Filter (HPF + 4-Pole LPF)
  hpfCutoff: number; // 20..8000 Hz
  hpfResonance: number; // 0..1
  lpfCutoff: number; // 30..18000 Hz
  lpfResonance: number; // 0..1
  lpfDrive: number; // 0..1 (SSM2040 OTA saturation)
  lpfEnvAmount: number; // -1..1
  lpfKeyTrack: number; // 0..1

  // Transient Generator 1 (Filter / Aux Envelope)
  tg1Attack: number; // 0.002..5 s
  tg1Decay: number; // 0.01..8 s
  tg1Sustain: number; // 0..1
  tg1Release: number; // 0.01..8 s

  // Transient Generator 2 (VCA Amp Envelope)
  tg2Attack: number; // 0.002..5 s
  tg2Decay: number; // 0.01..8 s
  tg2Sustain: number; // 0..1
  tg2Release: number; // 0.01..8 s
  vcaVelocitySens: number; // 0..1

  // LFO & Vibrato
  lfoShape: LfoShape;
  lfoRate: number; // 0.05..28 Hz
  lfoDelay: number; // 0..3 s
  lfoToPitch: number; // 0..1
  lfoToFilter: number; // 0..1
  lfoToMorph: number; // 0..1

  // RF / Master Stereo Effects (VST-Compatible DSP Stage)
  chorusMix: number; // 0..1 (BBD Stereo Ensemble)
  chorusRate: number; // 0.1..4 Hz
  delayMix: number; // 0..1
  delayTime: number; // 0.05..1.0 s
  delayFeedback: number; // 0..0.88
  reverbMix: number; // 0..1
  reverbDecay: number; // 0.2..1.0

  // Mod Matrix & Sequencer
  modRoutes: ModMatrixRoute[];
  sequencerTempo: number; // 40..220 BPM
  sequencerSteps: SequencerStep[];
}

export type ParamKey = keyof Pick<
  AudityPatch,
  | 'glide'
  | 'masterTune'
  | 'masterVolume'
  | 'unisonDetune'
  | 'vco1Morph'
  | 'vco1Tune'
  | 'vco1Fine'
  | 'vco1Level'
  | 'vco1Pwm'
  | 'vco2Morph'
  | 'vco2Tune'
  | 'vco2Fine'
  | 'vco2Level'
  | 'crossModFm'
  | 'noiseLevel'
  | 'noiseColor'
  | 'ringModLevel'
  | 'hpfCutoff'
  | 'hpfResonance'
  | 'lpfCutoff'
  | 'lpfResonance'
  | 'lpfDrive'
  | 'lpfEnvAmount'
  | 'lpfKeyTrack'
  | 'tg1Attack'
  | 'tg1Decay'
  | 'tg1Sustain'
  | 'tg1Release'
  | 'tg2Attack'
  | 'tg2Decay'
  | 'tg2Sustain'
  | 'tg2Release'
  | 'vcaVelocitySens'
  | 'lfoRate'
  | 'lfoDelay'
  | 'lfoToPitch'
  | 'lfoToFilter'
  | 'lfoToMorph'
  | 'chorusMix'
  | 'chorusRate'
  | 'delayMix'
  | 'delayTime'
  | 'delayFeedback'
  | 'reverbMix'
  | 'reverbDecay'
>;

export interface ParameterDescriptor {
  key: ParamKey;
  label: string;
  shortLabel: string;
  section: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  curve?: 'linear' | 'log';
  defaultValue: number;
}

export interface MidiCcMapping {
  cc: number; // 0..127
  param: ParamKey;
  label: string;
  min?: number;
  max?: number;
}

export type LcdPage = 'patches' | 'wave' | 'filter' | 'matrix' | 'midi' | 'openmpc';

export interface OpenMpcQLinkSlot {
  index: number; // 1..16
  param: ParamKey;
  label: string;
  cc: number;
}

export interface WaveMorphBlend {
  t: number; // 0..1 interpolation factor between A and B
  vco1WaveIdA: string;
  vco1MorphA: number;
  vco1WaveIdB: string;
  vco1MorphB: number;
  vco2WaveIdA: string;
  vco2MorphA: number;
  vco2WaveIdB: string;
  vco2MorphB: number;
}
