# Glowfall

A zen, bioluminescent 2D marble run. Stack parts into a single column, drop the marbles in, and watch them drift down through the dark.

**Play:** https://jkastl.github.io/gbc/ (built for iPad in landscape, also fine on desktop)

The sliders button (top right) sets **speed** (0.25×–3×), **gravity** (0.3×–2×) and **bounce** (0–2×). Changes apply live, even mid-run, and are remembered.

**Install it:** in Safari on the iPad, Share → Add to Home Screen. It opens full-screen and works offline.

## Develop

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # physics harness: every part must pass marbles through its ports
npm run build        # outputs the GitHub Pages site into /docs
```

`tests/feel.test.ts` runs every part and every starter track at the four corners of the gravity/bounce range.

Dev preview of a single part: `/?solo=<partId>&marbles=20&t=8` (where `t` fast-forwards the sim).

## Adding a part

Drop a file in `src/parts/` that default-exports a `PartDef` (see `src/engine/types.ts`, and use `src/parts/switchback.ts` as the reference). Marbles enter through the top port (x 3.9–6.1) and must leave through the bottom port. `npm test` checks that.

## Versioning

[Semver](https://semver.org/), in `package.json`, with every release listed in [`CHANGELOG.md`](CHANGELOG.md) and tagged `vX.Y.Z` in git. The build stamps the version and the commit into the app (`src/version.ts`), shown under the title in the builder panel. Bump by hand in the same commit as the change:

- **Patch**: fixes and tuning.
- **Minor**: new parts, controls or features.
- **Major**: a redesign, or a change that breaks saved tracks.

## Offline and updates

`sw/sw.js` is the service worker. At build time the `glowfall-sw` plugin in `vite.config.ts` writes it to `docs/sw.js`, filled in with the version and commit and with the list of files to precache. Each build is its own cache, so every deploy counts as a new version.

- The app checks for a new `sw.js` when it launches, whenever it comes back to the foreground, and hourly.
- A new version downloads in the background and waits. The app shows "New version ready · Update" in the builder or after a run finishes, never mid-run (`src/pwa.ts`).
- Tapping it activates the new version and reloads. The track and settings live in localStorage, so they survive.
- If nobody taps it, the new version takes over the next time every Glowfall window is closed. On iPad, that means swiping the app away in the app switcher.
- After an update, "Updated to vX.Y.Z" shows briefly. Old caches are deleted.

The service worker only registers in production builds, so `npm run dev` never caches anything. The icons are rendered from `public/icon.svg` with `NODE_PATH=$(npm root -g) node tools/icons.cjs`.

## Deploying

GitHub Pages serves `main`. Commit the source, then run `tools/deploy-build.sh` (it builds from the committed HEAD into `docs/`), commit `docs/`, and push.

If Pages is set to serve the repo root, `index.html` redirects visitors to `docs/`, so the address ends in `/gbc/docs/`. Set **Settings → Pages → Branch → folder** to `/docs` to serve the app straight from `/gbc/`. Do this before installing the app on a device: an installed copy stays tied to the address it was installed from, so it would stop receiving updates if the folder changed later. Otherwise everything works either way: the canonical link, preview image (`og.png`, kept at both the root and in `public/`) and visit counting all use `/gbc/`.

Visits are counted with GoatCounter (`src/stats.ts`, same site code as jkastl.github.io). It only runs on github.io.
