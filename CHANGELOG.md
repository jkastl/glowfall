# Changelog

All notable changes to Glowfall. Versions follow [semver](https://semver.org/); each release is tagged `vX.Y.Z`.

## 1.0.0 (2026-11-15)

- **Installable app (PWA)**: Add to Home Screen on the iPad for a full-screen app with its own icon that works offline.
- **Updates**: new releases download in the background. A "New version ready · Update" pill appears while building (never mid-run); tapping it switches over in a second and keeps your track and settings. Ignore it and the update applies the next time the app is fully closed and reopened. After an update, a short "Updated to vX.Y.Z" note confirms it.
- **Speed slider** (0.25×–3×) joins gravity and bounce in the run settings panel.
- A real Glowfall icon and favicon, replacing Vite's default.

## 0.2.0 (2026-11-15)

- **Gravity and bounce sliders** in a new panel (top-right sliders button): gravity 0.3×–2×, bounce 0–2×, each with a detent and a tick at 1×. They apply live, even mid-run, and are remembered on this device.
- The anti-jam is more patient in low gravity, where everything moves slower.
- New test `tests/feel.test.ts`: every part and starter track at the four corners of the range. All pass with no rescues.
- Versioning: the version and commit are shown under the title, with this changelog and git tags.
- Link previews and search: description, canonical link, Open Graph and Twitter tags, a 1200×630 preview image, and JSON-LD.
- Visit counting with GoatCounter (no cookies), only on github.io.

## 0.1.0 (2026-11-15)

- First release: builder with drag-to-reorder track and part palette, 13 parts, 4 starter tracks, 30-marble runs with a following camera, bioluminescent renderer with bloom, generative pentatonic audio, anti-jam, and the GitHub Pages deploy.
