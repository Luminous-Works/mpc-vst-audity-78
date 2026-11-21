# Audity '78: VST3 / desktop handoff

For whoever builds the desktop VST3 and desktop app (planned after the MPC catalogue release). The framework is **iPlug2**. Everything here was checked against the code on `main` (2026-11-21). Nothing in this repo builds a VST3 yet.

## Read this first: warnings

**iPlug2 (hard rules, learned the hard way on other plugins)**

1. **Use an iPlug2 checkout that serves only Audity '78.** Never edit a shared iPlug2 checkout for this project's benefit: a change there silently changes what every other plugin compiled from it becomes. If this project needs an SDK change, make it in this project's own checkout or override it inside the project.
2. **Never build another project's product** from a shared checkout (not to verify a change, not as a smoke test). If you feel you need to, the change is in the wrong place: move it.
3. **One owner per project at a time.** Work in your own git worktree on your own branch. Two agents in one tree overwrite each other.
4. **Do not revert a shared resource to undo your own mistake.** Isolate the damage and ask first.
5. **A rebuild is a new artifact.** Even from identical source, a rebuilt binary is not the binary that was tested. Never rebuild something already verified unless you re-verify it; ship the verified build.
6. **Build outside Dropbox** (sync locks files mid-build and corrupts output). Keep build trees on a local, non-synced path.
7. **Commit and push after every working change, with a full description** (what, where, why, file and line references). An uncommitted change is one the next person can lose or misread.
8. **Verify before you report.** Cite the file, the line, the output. "I think" is not a status.

**Compiler warnings**

- The MPC build compiles with `-Wall -Wextra` and has **0 warnings**. Keep the desktop build at 0 warnings with the same flags (plus the platform equivalents, `/W4` on MSVC). Fix warnings in the code; do not silence them.
- Do not add per-sample libm calls (`sin`, `tanh`, `exp`, `pow`, `tan`) to the core's inner loops: the MPC build shares this core and its CPU budget is a few percent of one ARM core.
- Do not allocate, lock or do I/O in the audio callback (`process`). `prepare()` may allocate.

**Content and legal**

- No third-party sample or ROM data is in this repo: every wavetable is synthesised in `src/data/wavetables.ts`. Keep it that way, or record the licence of anything added. The MPC catalogue rejects sound content you have no right to share.
- Steinberg's VST3 SDK and iPlug2 carry their own licences. Check them against the intended distribution (MIT repo, commercial or free release) before shipping.
- Keep this repo public-safe: no local paths, serials or private product names in docs or code.

## What you are porting

The sound already exists as portable C++:

| File | What it is |
|---|---|
| `src/lumina/audity_core.hpp` | The DSP core. Header-only, standard library only, no plugin SDK. Class `audity::Synth`. This is what the iPlug2 plugin should call. |
| `src/lumina/generated_data.hpp` | Generated. 12 wavetables (128 samples, two morph frames), 45 continuous parameter definitions (id, range, default, log flag, unit), 16 factory programs (bank A). Do not edit; regenerate (below). |
| `src/Audity78.cpp` | The MPC VST2 wrapper. **The template for a wrapper**: parameter table, how parameters map to `audity::Settings`, MIDI routing, programs. |
| `tools/export_data.mjs` | Regenerates `generated_data.hpp` from the TypeScript reference. `node tools/export_data.mjs` (Node 22.6+, no npm install). |
| `tools/host_test.cpp` | Native check of the core alone: `g++ -std=c++17 -O2 -I src/lumina tools/host_test.cpp -o build/host_test && build/host_test` renders all 16 programs and fails on NaN, silence or clipping. Currently PASSED. |
| `src/` (TypeScript), `src/audio/AudityEngine.ts` | The WebAudio reference: the sound to match by ear and by test. |

Keep the core as the single DSP implementation for both builds. If the core is ever replaced (for example by a FAUST-generated one), keep the same `Settings` and parameter set so the MPC and desktop builds stay identical.

## The core's API (what the iPlug2 plugin calls)

```cpp
audity::Synth synth;
synth.prepare(sampleRate);                 // allocates (delay/reverb buffers). Not in the audio callback.
synth.reset();                             // on resume / after a preset load
synth.setSettings(audity::Settings s);     // every block is fine (plain struct copy)
synth.noteOn(note, velocity01);  synth.noteOff(note);  synth.allNotesOff();
synth.pitchBend(semitones);                // MPC wrapper maps +-8192 to +-2 semitones
synth.modWheel(value01);                   // CC1; adds to LFO->pitch depth
synth.process(float* left, float* right, int numFrames);   // overwrites; any block length; allocation-free
```

In iPlug2 terms: `OnReset()` calls `prepare`/`reset`, `ProcessMidiMsg` calls `noteOn`/`noteOff`/`pitchBend`/`modWheel`, `OnParamChange` fills a `Settings`, `ProcessBlock` calls `process`. Split the block at MIDI event offsets as `Audity78.cpp` does so notes start sample-accurately.

`audity::Settings` holds 45 floats in plain units (`p[]`, indexed by the `audity::P` enum, same order as `kParams`) plus 7 discrete values: `voiceMode` (0 Poly, 1 Unison, 2 Mono), `vco1Wave`, `vco2Wave` (index into `kWaves`), `vco1Oct`, `vco2Oct` (-2..2), `vco2Sync` (0/1), `lfoShape` (0 Sine, 1 Triangle, 2 Saw, 3 Square, 4 S&H). `Settings::defaults()` and `Settings::fromProgram(kPrograms[i])` build one.

**Units gotcha:** reference "percent" parameters are **0..1** in `Settings`. The MPC wrapper shows them as 0..100 % and divides by 100 (`isPct()` in `Audity78.cpp`). Do the same, or expose 0..1; never pass 0..100 to the core.

## Parameters (52)

The native order is the table `kNative[]` in `src/Audity78.cpp`: Volume first, then the VCO, MIX, FILTER, ENV, LFO and FX pages. Ids are the reference `ParamKey` names (`masterVolume`, `vco1Morph`, `lpfCutoff`, ...). Ranges, defaults, log curves and units are in `kParams[]` in `generated_data.hpp` (source: `PARAMETER_DESCRIPTORS` in `src/data/wavetables.ts`). Generate the iPlug2 parameter list from those tables; do not retype them.

Rules that carry over: ids never change after release, order never changes, new parameters append at the end. Keep the same ids as the MPC build so presets can move between builds. Store state by id, not by index.

Desktop display names can be longer than the MPC's (`Audity78.cpp` keeps them near 12 characters for the small screen).

## Factory presets

Only **bank A (16 programs)** is exported to C++. The reference has 128 patches (banks A to H, 16 each: `src/data/presets.ts`, `presets_banks_eh.ts`). To ship all 128, extend `tools/export_data.mjs` (it already loads both files; `bankA` is a filter on `bank === 'A'`) and size `kPrograms` to match. The MPC build would grow too, so keep the two in sync. Names were renamed to L.A. wording on 2026-11-21 (for example "L.A. Dyno Tines", "Proton Steel Arp").

## Known gaps in the core (fix these for desktop)

1. **Wavetables are not band-limited.** Linear interpolation of 128-sample tables: bright tables alias on high notes. Fix: mip-mapped per-octave low-passed copies built in `prepare()`, chosen by note frequency. Desktop users will hear this.
2. **8 voices** (`AUDITY_MAX_VOICES`, default 8, chosen for MPC CPU). The reference has 16. Define `AUDITY_MAX_VOICES=16` for desktop. Unison uses 3 voices per note.
3. **Not implemented:** the mod matrix (`modRoutes`) and the step sequencer (`sequencerSteps`, `sequencerTempo`). The reference app has them; the core and the MPC build do not.
4. **VCO2 Sync is true hard sync** in the core; the reference approximates it with a pitch shift. Pick one and make both agree.
5. **SSM2040 filter** is a 4-pole cascade with tanh drive and resonance feedback, not a circuit model. Cutoff is clamped to 0.2 x sample rate and 16 kHz for stability.
6. **Parameter smoothing:** only master volume is smoothed. Pitch and filter coefficients update every 16 samples from per-block settings, so automation of cutoff or morph can zipper. Add smoothing in the wrapper or core.
7. **No denormal protection.** Add FTZ/DAZ (or a tiny DC offset) in the desktop wrapper.
8. The MPC runs 44.1 kHz only. The core takes any rate in `prepare()` and scales delay, reverb and chorus lengths, but it has only been tested at 44.1 kHz. Test 48k, 96k and 192k.
9. CPU shortcuts (control-rate coefficients, approximate sine and tanh) exist for the MPC. Desktop can afford better (oversampled drive, exact tanh) if you want to track the reference more closely.

## Verify a port

- The native core check above must print PASSED.
- Render the same note and program from the WebAudio reference and from the native build and compare. There is no null-test harness yet; the tolerance is undecided.
- The MPC build is the working example of a complete wrapper: `python <sdk>/tools/build.py "<this folder>"` and the SDK's `host_sim` (19 checks, 0 failures at 0.1.0).
- Run the desktop build in a real host (and a VST3 validator) before reporting it done, and re-verify after any rebuild.

## Decisions not made yet

- Whether the first desktop release includes the mod matrix and sequencer.
- Whether the desktop and MPC builds share a version number.
- The desktop GUI: the web reference panel carries the "L.A." mark; the iPlug2 GUI is a redesign. Native, not a web view, for the audio and the controls.

## Naming and identity

- Display name: **Audity '78**. The MPC build's internal name and folder are "Audity 78" (the MPC installer is a shell script; an apostrophe in a path is a quoting hazard). The desktop plugin can pick its own safe identifier.
- MPC uid is `AU78` (do not reuse it with a different meaning).
- Repo: `Luminous-Works/mpc-vst-audity-78`. MIT, Lumina Aerospace LLC.
