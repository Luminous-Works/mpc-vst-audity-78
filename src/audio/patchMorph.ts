import { AudityPatch, ModMatrixRoute, WaveMorphBlend } from '../types/synth';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpLog(a: number, b: number, t: number, floor = 0.001): number {
  const safeA = Math.max(floor, a);
  const safeB = Math.max(floor, b);
  return safeA * Math.pow(safeB / safeA, t);
}

function mergeModRoutes(
  routesA: ModMatrixRoute[],
  routesB: ModMatrixRoute[],
  t: number
): ModMatrixRoute[] {
  const map = new Map<string, ModMatrixRoute>();

  for (const r of routesA) {
    if (!r.enabled) continue;
    const key = `${r.source}:${r.target}`;
    const scaled = r.amount * (1 - t);
    const prev = map.get(key);
    map.set(key, {
      id: prev?.id ?? r.id,
      source: r.source,
      target: r.target,
      amount: (prev?.amount ?? 0) + scaled,
      enabled: true,
    });
  }

  for (const r of routesB) {
    if (!r.enabled) continue;
    const key = `${r.source}:${r.target}`;
    const scaled = r.amount * t;
    const prev = map.get(key);
    map.set(key, {
      id: prev?.id ?? `m-${r.id}`,
      source: r.source,
      target: r.target,
      amount: (prev?.amount ?? 0) + scaled,
      enabled: true,
    });
  }

  return Array.from(map.values())
    .filter((r) => Math.abs(r.amount) > 0.005)
    .map((r) => ({ ...r, amount: clamp(Number(r.amount.toFixed(3)), -1, 1) }))
    .slice(0, 6);
}

/**
 * Smoothly interpolates every synthesis, filter, TG1/TG2 envelope, LFO,
 * and DSP effect parameter between Patch A (t = 0) and Patch B (t = 1).
 * Frequency & envelope time constants use perceptual logarithmic interpolation.
 */
export function interpolateAudityPatches(
  patchA: AudityPatch,
  patchB: AudityPatch,
  rawT: number
): AudityPatch {
  const t = clamp(rawT, 0, 1);

  if (t <= 0.0001) {
    return {
      ...patchA,
      id: 'morph-live',
      name: `${patchA.name} ↔ ${patchB.name}`,
      bank: 'USER',
      slot: 0,
    };
  }
  if (t >= 0.9999) {
    return {
      ...patchB,
      id: 'morph-live',
      name: `${patchA.name} ↔ ${patchB.name}`,
      bank: 'USER',
      slot: 0,
    };
  }

  const pctA = Math.round((1 - t) * 100);
  const pctB = Math.round(t * 100);

  return {
    id: 'morph-live',
    name: `${patchA.name.slice(0, 13)} ↔ ${patchB.name.slice(0, 13)}`,
    bank: 'USER',
    slot: 0,
    category: t < 0.5 ? patchA.category : patchB.category,
    author: 'Audity Morph',
    description: `${pctA}% ${patchA.name} / ${pctB}% ${patchB.name}`,

    voiceMode: t < 0.5 ? patchA.voiceMode : patchB.voiceMode,
    glide: lerp(patchA.glide, patchB.glide, t),
    masterTune: lerp(patchA.masterTune, patchB.masterTune, t),
    masterVolume: lerp(patchA.masterVolume, patchB.masterVolume, t),
    unisonDetune: lerp(patchA.unisonDetune, patchB.unisonDetune, t),

    vco1WaveId: t < 0.5 ? patchA.vco1WaveId : patchB.vco1WaveId,
    vco1Morph: lerp(patchA.vco1Morph, patchB.vco1Morph, t),
    vco1Octave: t < 0.5 ? patchA.vco1Octave : patchB.vco1Octave,
    vco1Tune: Math.round(lerp(patchA.vco1Tune, patchB.vco1Tune, t)),
    vco1Fine: lerp(patchA.vco1Fine, patchB.vco1Fine, t),
    vco1Level: lerp(patchA.vco1Level, patchB.vco1Level, t),
    vco1Pwm: lerp(patchA.vco1Pwm, patchB.vco1Pwm, t),

    vco2WaveId: t < 0.5 ? patchA.vco2WaveId : patchB.vco2WaveId,
    vco2Morph: lerp(patchA.vco2Morph, patchB.vco2Morph, t),
    vco2Octave: t < 0.5 ? patchA.vco2Octave : patchB.vco2Octave,
    vco2Tune: Math.round(lerp(patchA.vco2Tune, patchB.vco2Tune, t)),
    vco2Fine: lerp(patchA.vco2Fine, patchB.vco2Fine, t),
    vco2Level: lerp(patchA.vco2Level, patchB.vco2Level, t),
    vco2Sync: t < 0.5 ? patchA.vco2Sync : patchB.vco2Sync,
    crossModFm: lerp(patchA.crossModFm, patchB.crossModFm, t),

    noiseLevel: lerp(patchA.noiseLevel, patchB.noiseLevel, t),
    noiseColor: lerp(patchA.noiseColor, patchB.noiseColor, t),
    ringModLevel: lerp(patchA.ringModLevel, patchB.ringModLevel, t),

    hpfCutoff: Math.round(lerpLog(patchA.hpfCutoff, patchB.hpfCutoff, t, 20)),
    hpfResonance: lerp(patchA.hpfResonance, patchB.hpfResonance, t),
    lpfCutoff: Math.round(lerpLog(patchA.lpfCutoff, patchB.lpfCutoff, t, 30)),
    lpfResonance: lerp(patchA.lpfResonance, patchB.lpfResonance, t),
    lpfDrive: lerp(patchA.lpfDrive, patchB.lpfDrive, t),
    lpfEnvAmount: lerp(patchA.lpfEnvAmount, patchB.lpfEnvAmount, t),
    lpfKeyTrack: lerp(patchA.lpfKeyTrack, patchB.lpfKeyTrack, t),

    tg1Attack: Number(lerpLog(patchA.tg1Attack, patchB.tg1Attack, t, 0.002).toFixed(3)),
    tg1Decay: Number(lerpLog(patchA.tg1Decay, patchB.tg1Decay, t, 0.01).toFixed(3)),
    tg1Sustain: lerp(patchA.tg1Sustain, patchB.tg1Sustain, t),
    tg1Release: Number(lerpLog(patchA.tg1Release, patchB.tg1Release, t, 0.01).toFixed(3)),

    tg2Attack: Number(lerpLog(patchA.tg2Attack, patchB.tg2Attack, t, 0.002).toFixed(3)),
    tg2Decay: Number(lerpLog(patchA.tg2Decay, patchB.tg2Decay, t, 0.01).toFixed(3)),
    tg2Sustain: lerp(patchA.tg2Sustain, patchB.tg2Sustain, t),
    tg2Release: Number(lerpLog(patchA.tg2Release, patchB.tg2Release, t, 0.01).toFixed(3)),
    vcaVelocitySens: lerp(patchA.vcaVelocitySens, patchB.vcaVelocitySens, t),

    lfoShape: t < 0.5 ? patchA.lfoShape : patchB.lfoShape,
    lfoRate: Number(lerpLog(patchA.lfoRate, patchB.lfoRate, t, 0.05).toFixed(2)),
    lfoDelay: lerp(patchA.lfoDelay, patchB.lfoDelay, t),
    lfoToPitch: lerp(patchA.lfoToPitch, patchB.lfoToPitch, t),
    lfoToFilter: lerp(patchA.lfoToFilter, patchB.lfoToFilter, t),
    lfoToMorph: lerp(patchA.lfoToMorph, patchB.lfoToMorph, t),

    chorusMix: lerp(patchA.chorusMix, patchB.chorusMix, t),
    chorusRate: lerp(patchA.chorusRate, patchB.chorusRate, t),
    delayMix: lerp(patchA.delayMix, patchB.delayMix, t),
    delayTime: lerp(patchA.delayTime, patchB.delayTime, t),
    delayFeedback: lerp(patchA.delayFeedback, patchB.delayFeedback, t),
    reverbMix: lerp(patchA.reverbMix, patchB.reverbMix, t),
    reverbDecay: lerp(patchA.reverbDecay, patchB.reverbDecay, t),

    modRoutes: mergeModRoutes(patchA.modRoutes, patchB.modRoutes, t),
    sequencerTempo: Math.round(lerp(patchA.sequencerTempo, patchB.sequencerTempo, t)),
    sequencerSteps: t < 0.5 ? patchA.sequencerSteps : patchB.sequencerSteps,
  };
}

export function buildWaveMorphBlend(
  patchA: AudityPatch,
  patchB: AudityPatch,
  t: number
): WaveMorphBlend {
  return {
    t: clamp(t, 0, 1),
    vco1WaveIdA: patchA.vco1WaveId,
    vco1MorphA: patchA.vco1Morph,
    vco1WaveIdB: patchB.vco1WaveId,
    vco1MorphB: patchB.vco1Morph,
    vco2WaveIdA: patchA.vco2WaveId,
    vco2MorphA: patchA.vco2Morph,
    vco2WaveIdB: patchB.vco2WaveId,
    vco2MorphB: patchB.vco2Morph,
  };
}
