# Publishing Audity 78 (nothing here has been run)

Follows the F4 Phantom / Sunflower flow. Do these only after a device smoke test.

1. Repo: `Luminous-Works/mpc-vst-audity-78` already exists and holds this project. The sibling plugins use the name pattern `mpc-vst-<name>`; renaming to `mpc-vst-audity-78` is optional and is the repo owner's call (the catalog entry just needs the real name in `repo`).
2. Add `docs/screenshots/audity-78.png` (a screenshot of the MPC screen, ideally close to 2:1) so the card image resolves.
3. Package: `python <sdk>/tools/package.py "<this folder>"`, then the open-mpc release tools (`tools/release.py`, `tools/catalog_check.py --catalog`; see docs/MPC-RELEASE.md).
4. Tag and release: `gh release create v0.1.0 <zips> --notes-file <notes>`.
5. Pull request to `open-mpc/mpc-vst-plugins` adding `catalog/plugins/audity-78.json` (the contents of `publish/catalog-entry.json`).
6. After any device test, add `tested.json` at the repo root.
