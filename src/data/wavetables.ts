import { WavetableDefinition, ParameterDescriptor, ParamKey } from '../types/synth';

const SAMPLES_LEN = 128;

function makeWave(fn: (phase: number, i: number) => number): number[] {
  const out: number[] = [];
  for (let i = 0; i < SAMPLES_LEN; i++) {
    const phase = i / SAMPLES_LEN;
    out.push(Math.max(-1, Math.min(1, fn(phase, i))));
  }
  return normalizeWave(out);
}

export function normalizeWave(samples: number[]): number[] {
  let maxAbs = 0;
  for (const v of samples) {
    if (Math.abs(v) > maxAbs) maxAbs = Math.abs(v);
  }
  if (maxAbs < 1e-6) return samples.map(() => 0);
  // Remove DC offset first
  const mean = samples.reduce((acc, v) => acc + v, 0) / samples.length;
  const centered = samples.map((v) => v - mean);
  let peak = 0;
  for (const v of centered) {
    if (Math.abs(v) > peak) peak = Math.abs(v);
  }
  if (peak < 1e-6) return centered;
  return centered.map((v) => Number((v / peak).toFixed(4)));
}

function additiveWave(harmonics: Array<[number, number, number?]>): number[] {
  return makeWave((phase) => {
    let sum = 0;
    for (const [n, amp, phaseOffset = 0] of harmonics) {
      sum += amp * Math.sin(2 * Math.PI * n * phase + phaseOffset);
    }
    return sum;
  });
}

/**
 * E-mu Audity & mattetti/e-mu-soundbanks inspired wavetable library.
 * Models classic Emulator / Proteus / Audity single-cycle spectral primitives
 * plus warm SSM analog waveforms.
 */
export const FACTORY_WAVETABLES: WavetableDefinition[] = [
  {
    id: 'ssm-saw',
    name: 'SSM Sawtooth',
    source: 'SSM Analog',
    bankRef: 'AUDITY-78 / VCO-CORE',
    description: 'Band-limited 24-harmonic analog sawtooth with slight SSM2040 even-harmonic warmth.',
    samples: additiveWave(
      Array.from({ length: 24 }, (_, k) => {
        const n = k + 1;
        return [n, (n % 2 === 0 ? 1.04 : 0.96) / n, 0];
      })
    ),
    morphSamples: additiveWave(
      Array.from({ length: 32 }, (_, k) => [k + 1, 1 / Math.pow(k + 1, 0.72), k * 0.08])
    ),
  },
  {
    id: 'ssm-pulse',
    name: 'SSM Variable Pulse',
    source: 'SSM Analog',
    bankRef: 'AUDITY-78 / PWM-01',
    description: 'Rich hollow analog pulse that morphs from square (50%) toward razor-thin 12% duty.',
    samples: makeWave((p) => (p < 0.5 ? 0.92 : -0.92)),
    morphSamples: makeWave((p) => (p < 0.14 ? 0.95 : -0.95)),
  },
  {
    id: 'ssm-tri-fold',
    name: 'SSM Tri-Fold',
    source: 'SSM Analog',
    bankRef: 'AUDITY-78 / TRI-SHP',
    description: 'Pure triangle core morphing into West-Coast wavefolded odd harmonics.',
    samples: makeWave((p) => (p < 0.25 ? p * 4 : p < 0.75 ? 2 - p * 4 : p * 4 - 4)),
    morphSamples: makeWave((p) => Math.sin(2.4 * Math.PI * Math.sin(2 * Math.PI * p))),
  },
  {
    id: 'emu-brass-horn',
    name: 'Emulator Brass',
    source: 'E-mu ROM',
    bankRef: 'mattetti/EMU-BANK-01 / BRASS',
    description: 'Extracted harmonic profile of classic E-mu brass ensemble with 5th-harmonic bite.',
    samples: additiveWave([
      [1, 1.0],
      [2, 0.78],
      [3, 0.65],
      [4, 0.48],
      [5, 0.52],
      [6, 0.31],
      [7, 0.22],
      [8, 0.16],
      [10, 0.11],
      [12, 0.07],
    ]),
    morphSamples: additiveWave([
      [1, 0.9],
      [2, 0.95],
      [3, 0.85],
      [4, 0.72],
      [5, 0.68],
      [6, 0.54],
      [7, 0.42],
      [9, 0.3],
      [11, 0.2],
      [14, 0.14],
    ]),
  },
  {
    id: 'emu-choir-ah',
    name: 'Emulator Choir Ah',
    source: 'Emulator Bank',
    bankRef: 'mattetti/EXB-VOX / FORMANT-AH',
    description: 'Formant-sculpted vocal choir cycle morphing from warm "Oo" to open "Ah" resonance.',
    samples: additiveWave([
      [1, 1.0],
      [2, 0.62],
      [3, 0.42],
      [4, 0.14],
      [7, 0.18],
      [8, 0.1],
    ]),
    morphSamples: additiveWave([
      [1, 0.75],
      [2, 0.55],
      [3, 0.72],
      [4, 0.88],
      [5, 0.5],
      [7, 0.36],
      [9, 0.28],
      [11, 0.18],
    ]),
  },
  {
    id: 'emu-string-ens',
    name: 'E-mu Solina String',
    source: 'Emulator Bank',
    bankRef: 'mattetti/EXB-STR / ARC-ENS',
    description: 'Phase-dispersed multi-partial string waveform for lush 1978 polyphonic pads.',
    samples: additiveWave([
      [1, 1.0, 0],
      [2, 0.68, 0.4],
      [3, 0.52, 1.1],
      [4, 0.44, 0.7],
      [5, 0.36, 2.0],
      [6, 0.29, 1.5],
      [8, 0.22, 0.9],
      [11, 0.15, 2.4],
    ]),
    morphSamples: additiveWave([
      [1, 0.85, 0.3],
      [2, 0.75, 1.2],
      [3, 0.66, 2.1],
      [4, 0.55, 0.5],
      [6, 0.45, 1.7],
      [8, 0.38, 2.8],
      [10, 0.28, 0.9],
      [13, 0.2, 1.4],
    ]),
  },
  {
    id: 'emu-glass-bell',
    name: 'Proteus Glass Bell',
    source: 'E-mu ROM',
    bankRef: 'mattetti/EBL-BELL / CRYSTAL',
    description: 'Glassy FM-derived bell harmonic clusters with shimmering high upper partials.',
    samples: additiveWave([
      [1, 1.0],
      [2, 0.18],
      [4, 0.55],
      [7, 0.42],
      [11, 0.28],
      [15, 0.16],
    ]),
    morphSamples: additiveWave([
      [1, 0.6],
      [3, 0.45],
      [5, 0.7],
      [8, 0.55],
      [12, 0.42],
      [17, 0.3],
      [21, 0.2],
    ]),
  },
  {
    id: 'emu-organ-perc',
    name: 'Audity Drawbar Organ',
    source: 'E-mu ROM',
    bankRef: 'AUDITY-78 / ORGAN-16-8',
    description: 'Sub-octave + 8ft + 4ft + 2-2/3ft drawbar harmonic stack.',
    samples: additiveWave([
      [1, 0.9],
      [2, 0.85],
      [3, 0.55],
      [4, 0.65],
      [6, 0.3],
      [8, 0.25],
    ]),
    morphSamples: additiveWave([
      [1, 1.0],
      [2, 0.45],
      [3, 0.8],
      [4, 0.35],
      [6, 0.6],
      [8, 0.55],
      [12, 0.35],
    ]),
  },
  {
    id: 'emu-metal-clang',
    name: 'Emulator Steel Clang',
    source: 'Emulator Bank',
    bankRef: 'mattetti/EMU-PERC / ANVIL',
    description: 'Inharmonic metallic partial spectrum ideal for plucked leads and industrial bass.',
    samples: additiveWave([
      [1, 0.8],
      [3, 0.65, 0.8],
      [5, 0.72, 1.7],
      [9, 0.48, 0.4],
      [13, 0.38, 2.3],
      [18, 0.24, 1.1],
    ]),
    morphSamples: additiveWave([
      [1, 0.45],
      [4, 0.8, 1.1],
      [7, 0.75, 2.4],
      [11, 0.6, 0.6],
      [16, 0.48, 1.9],
      [22, 0.36, 0.2],
    ]),
  },
  {
    id: 'emu-resonant-sweep',
    name: 'SSM Resonant Peak',
    source: 'E-mu ROM',
    bankRef: 'AUDITY-78 / FORMANT-RES',
    description: 'Baked resonant filter sweep embedded directly in the wavetable cycle.',
    samples: makeWave((p) => {
      const env = Math.exp(-3.5 * p);
      return env * Math.sin(2 * Math.PI * 5 * p) + 0.4 * (1 - 2 * p);
    }),
    morphSamples: makeWave((p) => {
      const env = Math.exp(-2.8 * p);
      return env * Math.sin(2 * Math.PI * 11 * p) + 0.35 * (1 - 2 * p);
    }),
  },
  {
    id: 'emu-sub-bass',
    name: 'E-mu Moogish Sub',
    source: 'SSM Analog',
    bankRef: 'mattetti/EMU-BASS / FAT-SUB',
    description: 'Heavy fundamental with warm 2nd and 3rd harmonic saturation.',
    samples: additiveWave([
      [1, 1.0],
      [2, 0.52],
      [3, 0.28],
      [4, 0.14],
      [5, 0.08],
    ]),
    morphSamples: additiveWave([
      [1, 1.0],
      [2, 0.78],
      [3, 0.54],
      [4, 0.36],
      [5, 0.24],
      [6, 0.16],
      [7, 0.1],
    ]),
  },
  {
    id: 'emu-digital-ep',
    name: 'E-mu Tine Piano',
    source: 'Emulator Bank',
    bankRef: 'mattetti/EXB-KEYS / DYNO-EP',
    description: 'Bell-like electric piano tine attack morphing into warm fundamental sustain.',
    samples: additiveWave([
      [1, 1.0],
      [2, 0.25],
      [3, 0.12],
      [7, 0.28],
      [9, 0.18],
    ]),
    morphSamples: additiveWave([
      [1, 1.0],
      [2, 0.48],
      [3, 0.2],
      [4, 0.1],
    ]),
  },
];

/**
 * Compute Fourier cosine/sine coefficients from a 128-sample wavetable frame
 * for Web Audio API PeriodicWave construction.
 */
export function computeFourierCoefficients(samples: number[], numHarmonics = 48): {
  real: Float32Array;
  imag: Float32Array;
} {
  const N = samples.length;
  const maxH = Math.min(numHarmonics, Math.floor(N / 2));
  const real = new Float32Array(maxH + 1);
  const imag = new Float32Array(maxH + 1);

  for (let k = 1; k <= maxH; k++) {
    let sumCos = 0;
    let sumSin = 0;
    for (let n = 0; n < N; n++) {
      const angle = (2 * Math.PI * k * n) / N;
      sumCos += samples[n] * Math.cos(angle);
      sumSin += samples[n] * Math.sin(angle);
    }
    real[k] = (2 / N) * sumCos;
    imag[k] = (2 / N) * sumSin;
  }

  return { real, imag };
}

/**
 * Linearly interpolate between base samples and morphSamples at position morph (0..1)
 */
export function getMorphedSamples(wave: WavetableDefinition, morph: number): number[] {
  if (!wave.morphSamples || morph <= 0.001) return wave.samples;
  if (morph >= 0.999) return wave.morphSamples;
  const out = new Array<number>(wave.samples.length);
  for (let i = 0; i < wave.samples.length; i++) {
    out[i] = wave.samples[i] * (1 - morph) + wave.morphSamples[i] * morph;
  }
  return out;
}

/**
 * Parse an uploaded WAV audio file using AudioContext.decodeAudioData
 * and extract a clean 128-sample single-cycle wavetable frame.
 */
export async function extractWavetableFromAudioFile(
  file: File,
  audioCtx: AudioContext
): Promise<WavetableDefinition> {
  const buffer = await file.arrayBuffer();
  const decoded = await audioCtx.decodeAudioData(buffer);
  const channel = decoded.getChannelData(0);

  // Find a dense energetic window in the sample for single-cycle extraction
  let startIdx = 0;
  let bestEnergy = -1;
  const scanLimit = Math.min(channel.length - SAMPLES_LEN * 2, 48000);
  const step = Math.max(128, Math.floor(scanLimit / 40));

  for (let i = 0; i < scanLimit; i += step) {
    let e = 0;
    for (let j = 0; j < 256; j++) {
      e += Math.abs(channel[i + j] || 0);
    }
    if (e > bestEnergy) {
      bestEnergy = e;
      startIdx = i;
    }
  }

  // Align to nearest positive zero-crossing
  for (let i = startIdx; i < Math.min(channel.length - SAMPLES_LEN - 1, startIdx + 512); i++) {
    if (channel[i] <= 0 && channel[i + 1] > 0) {
      startIdx = i;
      break;
    }
  }

  // Extract 256 or 128 samples resampled cleanly
  const sliceLen = Math.min(256, Math.max(64, channel.length - startIdx));
  const raw: number[] = [];
  for (let i = 0; i < SAMPLES_LEN; i++) {
    const pos = startIdx + (i / SAMPLES_LEN) * sliceLen;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const s0 = channel[idx] ?? 0;
    const s1 = channel[idx + 1] ?? s0;
    raw.push(s0 * (1 - frac) + s1 * frac);
  }

  const cleanName = file.name.replace(/\.[^.]+$/, '').slice(0, 22);
  return {
    id: `user-wav-${Date.now()}`,
    name: cleanName || 'Imported Wave',
    source: 'User Custom',
    bankRef: 'LOCAL WAV IMPORT',
    description: `Extracted single-cycle wavetable from ${file.name} (${decoded.sampleRate} Hz).`,
    samples: normalizeWave(raw),
  };
}

/**
 * Full Audity parameter descriptor registry for UI knobs, Q-Links, and MIDI CC scaling
 */
export const PARAMETER_DESCRIPTORS: Record<ParamKey, ParameterDescriptor> = {
  glide: { key: 'glide', label: 'Portamento Glide', shortLabel: 'GLIDE', section: 'PITCH', min: 0, max: 1, step: 0.01, unit: '%', defaultValue: 0 },
  masterTune: { key: 'masterTune', label: 'Master Tune', shortLabel: 'TUNE', section: 'MASTER', min: -50, max: 50, step: 1, unit: 'ct', defaultValue: 0 },
  masterVolume: { key: 'masterVolume', label: 'Master Output', shortLabel: 'LEVEL', section: 'MASTER', min: 0, max: 1, step: 0.01, unit: '%', defaultValue: 0.78 },
  unisonDetune: { key: 'unisonDetune', label: 'Unison Spread', shortLabel: 'SPREAD', section: 'PITCH', min: 0, max: 1, step: 0.01, unit: '%', defaultValue: 0.25 },

  vco1Morph: { key: 'vco1Morph', label: 'VCO 1 Wave Morph', shortLabel: 'MORPH 1', section: 'VCO1', min: 0, max: 1, step: 0.01, unit: '%', defaultValue: 0.2 },
  vco1Tune: { key: 'vco1Tune', label: 'VCO 1 Coarse', shortLabel: 'COARSE 1', section: 'VCO1', min: -12, max: 12, step: 1, unit: 'st', defaultValue: 0 },
  vco1Fine: { key: 'vco1Fine', label: 'VCO 1 Fine', shortLabel: 'FINE 1', section: 'VCO1', min: -50, max: 50, step: 1, unit: 'ct', defaultValue: 0 },
  vco1Level: { key: 'vco1Level', label: 'VCO 1 Level', shortLabel: 'LVL 1', section: 'VCO1', min: 0, max: 1, step: 0.01, unit: '%', defaultValue: 0.8 },
  vco1Pwm: { key: 'vco1Pwm', label: 'VCO 1 Harmonic Tilt', shortLabel: 'TILT 1', section: 'VCO1', min: 0, max: 1, step: 0.01, unit: '%', defaultValue: 0.5 },

  vco2Morph: { key: 'vco2Morph', label: 'VCO 2 Wave Morph', shortLabel: 'MORPH 2', section: 'VCO2', min: 0, max: 1, step: 0.01, unit: '%', defaultValue: 0.3 },
  vco2Tune: { key: 'vco2Tune', label: 'VCO 2 Coarse', shortLabel: 'COARSE 2', section: 'VCO2', min: -12, max: 12, step: 1, unit: 'st', defaultValue: 0 },
  vco2Fine: { key: 'vco2Fine', label: 'VCO 2 Detune', shortLabel: 'FINE 2', section: 'VCO2', min: -50, max: 50, step: 1, unit: 'ct', defaultValue: 8 },
  vco2Level: { key: 'vco2Level', label: 'VCO 2 Level', shortLabel: 'LVL 2', section: 'VCO2', min: 0, max: 1, step: 0.01, unit: '%', defaultValue: 0.7 },
  crossModFm: { key: 'crossModFm', label: 'VCO Cross-Mod FM', shortLabel: 'X-MOD', section: 'VCO2', min: 0, max: 1, step: 0.01, unit: '%', defaultValue: 0 },

  noiseLevel: { key: 'noiseLevel', label: 'Noise Level', shortLabel: 'NOISE', section: 'NOISE', min: 0, max: 1, step: 0.01, unit: '%', defaultValue: 0 },
  noiseColor: { key: 'noiseColor', label: 'Noise Color', shortLabel: 'COLOR', section: 'NOISE', min: 0, max: 1, step: 0.01, unit: '%', defaultValue: 0.6 },
  ringModLevel: { key: 'ringModLevel', label: 'Ring Modulator', shortLabel: 'RING', section: 'NOISE', min: 0, max: 1, step: 0.01, unit: '%', defaultValue: 0 },

  hpfCutoff: { key: 'hpfCutoff', label: 'SSM HPF Cutoff', shortLabel: 'HPF CUT', section: 'HPF', min: 20, max: 6000, step: 1, unit: 'Hz', curve: 'log', defaultValue: 40 },
  hpfResonance: { key: 'hpfResonance', label: 'SSM HPF Resonance', shortLabel: 'HPF RES', section: 'HPF', min: 0, max: 1, step: 0.01, unit: '%', defaultValue: 0.1 },

  lpfCutoff: { key: 'lpfCutoff', label: 'SSM2040 LPF Cutoff', shortLabel: 'LPF CUT', section: 'LPF', min: 35, max: 16000, step: 1, unit: 'Hz', curve: 'log', defaultValue: 3200 },
  lpfResonance: { key: 'lpfResonance', label: 'SSM2040 Resonance', shortLabel: 'LPF RES', section: 'LPF', min: 0, max: 1, step: 0.01, unit: '%', defaultValue: 0.3 },
  lpfDrive: { key: 'lpfDrive', label: 'OTA Filter Drive', shortLabel: 'DRIVE', section: 'LPF', min: 0, max: 1, step: 0.01, unit: '%', defaultValue: 0.2 },
  lpfEnvAmount: { key: 'lpfEnvAmount', label: 'LPF Env Depth', shortLabel: 'ENV AMT', section: 'LPF', min: -1, max: 1, step: 0.01, unit: '%', defaultValue: 0.45 },
  lpfKeyTrack: { key: 'lpfKeyTrack', label: 'LPF Key Track', shortLabel: 'KYBD', section: 'LPF', min: 0, max: 1, step: 0.01, unit: '%', defaultValue: 0.5 },

  tg1Attack: { key: 'tg1Attack', label: 'Filter Env Attack', shortLabel: 'ATK 1', section: 'TG1', min: 0.002, max: 4.0, step: 0.002, unit: 's', curve: 'log', defaultValue: 0.03 },
  tg1Decay: { key: 'tg1Decay', label: 'Filter Env Decay', shortLabel: 'DEC 1', section: 'TG1', min: 0.01, max: 6.0, step: 0.01, unit: 's', curve: 'log', defaultValue: 0.65 },
  tg1Sustain: { key: 'tg1Sustain', label: 'Filter Env Sustain', shortLabel: 'SUS 1', section: 'TG1', min: 0, max: 1, step: 0.01, unit: '%', defaultValue: 0.35 },
  tg1Release: { key: 'tg1Release', label: 'Filter Env Release', shortLabel: 'REL 1', section: 'TG1', min: 0.01, max: 6.0, step: 0.01, unit: 's', curve: 'log', defaultValue: 0.55 },

  tg2Attack: { key: 'tg2Attack', label: 'Amp Env Attack', shortLabel: 'ATK 2', section: 'TG2', min: 0.002, max: 4.0, step: 0.002, unit: 's', curve: 'log', defaultValue: 0.015 },
  tg2Decay: { key: 'tg2Decay', label: 'Amp Env Decay', shortLabel: 'DEC 2', section: 'TG2', min: 0.01, max: 6.0, step: 0.01, unit: 's', curve: 'log', defaultValue: 0.45 },
  tg2Sustain: { key: 'tg2Sustain', label: 'Amp Env Sustain', shortLabel: 'SUS 2', section: 'TG2', min: 0, max: 1, step: 0.01, unit: '%', defaultValue: 0.78 },
  tg2Release: { key: 'tg2Release', label: 'Amp Env Release', shortLabel: 'REL 2', section: 'TG2', min: 0.01, max: 6.0, step: 0.01, unit: 's', curve: 'log', defaultValue: 0.45 },
  vcaVelocitySens: { key: 'vcaVelocitySens', label: 'Velocity Sensitivity', shortLabel: 'VELO', section: 'VCA', min: 0, max: 1, step: 0.01, unit: '%', defaultValue: 0.6 },

  lfoRate: { key: 'lfoRate', label: 'LFO Frequency', shortLabel: 'RATE', section: 'LFO', min: 0.05, max: 24, step: 0.05, unit: 'Hz', curve: 'log', defaultValue: 3.4 },
  lfoDelay: { key: 'lfoDelay', label: 'LFO Fade Delay', shortLabel: 'DELAY', section: 'LFO', min: 0, max: 2.5, step: 0.01, unit: 's', defaultValue: 0.15 },
  lfoToPitch: { key: 'lfoToPitch', label: 'LFO → Pitch', shortLabel: 'VIB', section: 'LFO', min: 0, max: 1, step: 0.01, unit: '%', defaultValue: 0.08 },
  lfoToFilter: { key: 'lfoToFilter', label: 'LFO → Filter', shortLabel: 'WAH', section: 'LFO', min: 0, max: 1, step: 0.01, unit: '%', defaultValue: 0.05 },
  lfoToMorph: { key: 'lfoToMorph', label: 'LFO → Wave Morph', shortLabel: 'WT MOD', section: 'LFO', min: 0, max: 1, step: 0.01, unit: '%', defaultValue: 0.18 },

  chorusMix: { key: 'chorusMix', label: 'BBD Chorus Mix', shortLabel: 'CHORUS', section: 'RF', min: 0, max: 1, step: 0.01, unit: '%', defaultValue: 0.35 },
  chorusRate: { key: 'chorusRate', label: 'BBD Chorus Rate', shortLabel: 'CH RATE', section: 'RF', min: 0.1, max: 4.0, step: 0.05, unit: 'Hz', defaultValue: 0.65 },
  delayMix: { key: 'delayMix', label: 'Tape Delay Mix', shortLabel: 'DELAY', section: 'RF', min: 0, max: 1, step: 0.01, unit: '%', defaultValue: 0.22 },
  delayTime: { key: 'delayTime', label: 'Tape Delay Time', shortLabel: 'D TIME', section: 'RF', min: 0.05, max: 1.0, step: 0.01, unit: 's', defaultValue: 0.34 },
  delayFeedback: { key: 'delayFeedback', label: 'Tape Feedback', shortLabel: 'FDBK', section: 'RF', min: 0, max: 0.85, step: 0.01, unit: '%', defaultValue: 0.38 },
  reverbMix: { key: 'reverbMix', label: 'Hall Reverb Mix', shortLabel: 'REVERB', section: 'RF', min: 0, max: 1, step: 0.01, unit: '%', defaultValue: 0.28 },
  reverbDecay: { key: 'reverbDecay', label: 'Hall Decay', shortLabel: 'SPACE', section: 'RF', min: 0.2, max: 1.0, step: 0.01, unit: '%', defaultValue: 0.55 },
};

export function formatParamValue(desc: ParameterDescriptor, value: number): string {
  if (desc.unit === 'Hz') {
    return value >= 1000 ? `${(value / 1000).toFixed(2)} kHz` : `${Math.round(value)} Hz`;
  }
  if (desc.unit === 's') {
    return value < 0.1 ? `${Math.round(value * 1000)} ms` : `${value.toFixed(2)} s`;
  }
  if (desc.unit === 'st' || desc.unit === 'ct') {
    const rounded = Math.round(value);
    return `${rounded > 0 ? '+' : ''}${rounded} ${desc.unit}`;
  }
  if (desc.unit === '%') {
    return `${Math.round(value * 100)}%`;
  }
  return value.toFixed(2);
}
