# Audity '78: VST3 port plan

The WebAudio emulator in `src/` is the reference. The VST3 must match its parameter set, ranges and patch format. Native, not web: DSP in FAUST-generated C++, JUCE (or equivalent) for the VST3 wrapper.

## Parameters to expose

All 45 automatable parameters are the `ParamKey` union in `src/types/synth.ts`; ranges, units, steps and log curves are in `PARAMETER_DESCRIPTORS` in `src/data/wavetables.ts`. That table is the source of truth: generate the VST3 parameter list from it, do not retype it.

Non-parameter state saved per patch: voice mode (poly16 / unison / mono), VCO wavetable ids, VCO octave, VCO2 sync, LFO shape, mod-matrix routes, sequencer steps and tempo.

## DSP blocks (map to `src/audio/AudityEngine.ts`)

1. Voice card x16, oldest-voice steal (engine line ~483).
2. Two 128-sample wavetable oscillators with morph between frame A and `morphSamples`; use band-limited mip-mapped tables in native code (the browser uses PeriodicWave).
3. HPF 12 dB, LPF 24 dB with drive (OTA-style saturation), key tracking, envelope amount.
4. TG1 and TG2 ADSR, velocity to VCA.
5. LFO with delay, to pitch / filter / morph.
6. Noise (coloured), ring mod, cross-mod FM, hard sync.
7. Stereo chorus, delay, reverb, output limiter.

## Open questions

- Match tolerance against the WebAudio reference (null-test thresholds) to be agreed before tuning by ear.
- The mod matrix and step sequencer exist in the data model; confirm whether the first VST3 release includes them.
- Patch import: the 128 patches live in `src/data/presets.ts` and `presets_banks_eh.ts`; plan to export them to JSON for the plugin's preset loader.
