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
