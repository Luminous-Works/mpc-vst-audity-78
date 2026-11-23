# Audity '78: MPC release checklist (Open MPC catalogue)

Source: <https://open-mpc.github.io/workflow.html> (read 2026-11-21). Copy the layout of the three live plugins (for example `Luminous-Works/mpc-vst-sunflower`: `plugin.json`, `skins/`, `src/`, `tools/`, `docs/screenshots/`, `LICENSE`, `THIRD_PARTY_NOTICES.md`).

## Loop

1. Build: `tools/build_port.sh` (.so, skin, plugin-list entry).
2. Host test: `tools/test_port.sh`, must print PASSED.
3. Preview every skin page: `tools/studio.py preview`.
4. CPU on a device: `tools/bench.sh build/x.so <device-ip> -j | tee build/bench.txt`. Budget is about 2.9 ms per audio block shared with the whole project. 16 voices with a 24 dB filter and FX needs measuring early.
5. Package: `tools/release.py --so build/x.so --skin "build/skin/Lumina Aerospace LLC - VST - Audity78" --entry build/pluginlist-entry.xml --version 0.1.0 --bench build/bench.txt --about "..." --repo Luminous-Works/mpc-vst-audity-78 --license MIT --id audity-78 -o dist`
6. Check: `tools/catalog_check.py dist/<Name>-0.1.0-mpc-armv7.zip --catalog`.
7. Smoke test the zip on a device with its own `install.sh`; then `uninstall.sh`.
8. Publish the GitHub release (zip attached), add `tested.json` to the default branch.

## Rules that matter here

- Keep the plugin uid, the `.so` name and the catalogue id fixed forever.
- Versions X.Y.Z; Y for new parameters or pages; X breaks saved projects.
- No sound content we have no right to share: do not bundle third-party sample banks or ROM dumps.
- Do not ship Akai skins or files.

## Draft catalogue entry (PR to `open-mpc/mpc-vst-plugins`, file `catalog/plugins/audity-78.json`)

Only open this PR once a release zip passes `catalog_check.py`.

```json
{ "id": "audity-78", "name": "Audity '78", "author": "Lumina Aerospace LLC",
  "repo": "Luminous-Works/mpc-vst-audity-78", "kind": "instrument", "license": "MIT",
  "summary": "16-voice wavetable synth: two wavetable oscillators, SSM2040-style filters, 128 patches.",
  "style": "synth", "tags": ["wavetable", "polyphonic", "analog"],
  "screenshot": "https://raw.githubusercontent.com/Luminous-Works/mpc-vst-audity-78/<tag>/docs/screenshots/audity-78.png" }
```

## What was actually run for 0.1.0 (2026-11-21)

The generic loop above is the catalogue's description. This project is an Akai-format SDK project, so the real steps were:

1. Build and test with the MPC Plugin SDK (next to this repo): `python <sdk>/tools/build.py "<this folder>"`, then `<sdk>/.sdk-tools/host_sim.exe build/native/audity-78.dll test --wav build/test.wav` (19 passed, 0 failures).
2. Clone the catalogue repo (`open-mpc/mpc-vst-plugins`) somewhere outside this folder. Package per-CPU zips from the SDK build folder:
   `python tools/sdk_release.py "<this folder>/build/Lumina Aerospace LLC - VST - Audity 78" --version 0.1.0 --id audity-78 --repo Luminous-Works/mpc-vst-audity-78 --license MIT -o "<this folder>/dist"`
   This writes `Audity-78-0.1.0-mpc-armv7.zip` (Gen1) and `Audity-78-0.1.0-mpc-aarch64.zip` (Gen2).
3. Check each: `python tools/catalog_check.py <zip> --catalog` (OK, 0 warnings).
4. Screenshot: `python <sdk>/tools/ui_preview.py` crashed on the string `"empty"` entries in `ui.json` (SDK previewer bug at the time), so a temporary copy with `{"widget": "empty"}` in their place was previewed instead. Copy a tab PNG to `docs/screenshots/audity-78.png` (about 2:1).
5. Commit the screenshot to main, then `gh release create v0.1.0 <both zips> --target main --notes-file <notes>`. Notes say plainly that it is not device-tested.
6. Catalogue PR: fork `open-mpc/mpc-vst-plugins`, branch `add-audity-78`, add `catalog/plugins/audity-78.json` (a copy of `publish/catalog-entry.json`), open the PR with the `catalog_check.py` output and both zips' SHA-256 under "What and why" (PR template). Opened as open-mpc/mpc-vst-plugins#1077.
7. Device test (still to do): a tester loads the zip on a track, plays it, turns every page, saves and reloads a project. Then add `tested.json` at this repo's root:
   `[ { "version": "0.1.0", "device": "MPC Live III (Gen2)", "firmware": "<MPC OS version>", "date": "YYYY-MM-DD" } ]`

Release zip SHA-256 (0.1.0):
- armv7: `5487b7af16075cdf7c3f8ef9c3ad06486a40f691f6aff02efc61e92ad5f3d9e5`
- aarch64: `e98a42592fd6b8ccf3cd6a7f3644af1ab9f33e24c60becd690958b02a1b11d0c`

Next version: bump `plugin.json` `version` (Y for new parameters, Z for fixes), keep the uid `AU78`, the `.so` name and the catalogue id `audity-78` fixed forever, and append new parameters at the end.

## 0.2.0: the blue panel skin, and two packaging traps (2026-11-23)

- The MPC screen is now `skins/` (blue L.A. panel). It is generated, not hand-drawn: `python <sdk>/tools/gen_ui.py --params build/params.json --ui ui.json --out <tmp> --kit-cache build`, then `python tools/make_blue_skin.py <tmp> skins` (see the docstring). `tools/build.py` copies `skins/` verbatim when it exists. Re-run both after any `ui.json` change. `tools/skin_fix.py` is a helper copied from the F4 Phantom project.
- `version.xml`: bump `<version>` for a release, but **keep `<uiversion>` at `0.1.0.0`**. A higher value makes the MPC refuse to load the plugin (`<sdk>/tools/validate.py` reports it as an error). Run `validate.py` on the build folder before packaging.
- Package from a catalogue clone with `core.autocrlf=false` (or normalise `tools/release/*.sh` and `plugin_list.awk` to LF first). With `autocrlf=true` the installer scripts are CRLF and the plugin never registers on the device (this hit 0.1.0, F4 Phantom 1.1.0 and Vulcan Rotary 1.0.0). Count the CRs in the zip's scripts: it must be 0.
