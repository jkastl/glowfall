# Glowfall

A zen, bioluminescent 2D marble run. Stack parts into a single column, drop the marbles in, and watch them drift down through the dark.

**Play:** https://jkastl.github.io/glowfall/ (built for iPad in landscape, also fine on desktop)

The sliders button (top right) sets **speed** (0.25×–3×), **gravity** (0.3×–2×) and **bounce** (0–2×). Changes apply live, even mid-run, and are remembered.

**Endless loop**, in the same panel, turns the run into a screensaver: there is no pool, marbles that leave the last part come back in at the top, and the camera follows them down forever. It takes effect at the next Release, and the screen stays awake while a run is going.

**Install it:** in Safari on the iPad, Share → Add to Home Screen. It opens full-screen and works offline.

## Develop

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # physics harness: every part must pass marbles through its ports
npm run build        # builds the site into dist/ (tools/deploy-build.sh publishes it)
```

`tests/feel.test.ts` runs every part and every starter track at the four corners of the gravity/bounce range. `tests/loop.test.ts` soaks every starter track in endless mode (30 simulated minutes for one of them; `SOAK_MIN=240` for longer) and checks that the marbles keep circulating and that the world, the logs and the heap don't grow. `tests/loop-feel.test.ts` does the endless mode at the same four corners.

Dev preview of a single part: `/?solo=<partId>&marbles=20&t=8` (where `t` fast-forwards the sim).

## Adding a part

Drop a file in `src/parts/` that default-exports a `PartDef` (see `src/engine/types.ts`, and use `src/parts/switchback.ts` as the reference). Marbles enter through the top port (x 3.9–6.1) and must leave through the bottom port. `npm test` checks that.

## Versioning

[Semver](https://semver.org/), in `package.json`, with every release listed in [`CHANGELOG.md`](CHANGELOG.md) and tagged `vX.Y.Z` in git. The build stamps the version and the commit into the app (`src/version.ts`), shown under the title in the builder panel. Bump by hand in the same commit as the change:

- **Patch**: fixes and tuning.
- **Minor**: new parts, controls or features.
- **Major**: a redesign, or a change that breaks saved tracks.

## Offline and updates

`sw/sw.js` is the service worker. At build time the `glowfall-sw` plugin in `vite.config.ts` writes it to `sw.js` in the build, filled in with the version and commit and with the list of files to precache. Each build is its own cache, so every deploy counts as a new version.

- The app checks for a new `sw.js` when it launches, whenever it comes back to the foreground, and hourly.
- A new version downloads in the background and waits. The app shows "New version ready · Update" in the builder or after a run finishes, never mid-run (`src/pwa.ts`).
- Tapping it activates the new version and reloads. The track and settings live in localStorage, so they survive.
- If nobody taps it, the new version takes over the next time every Glowfall window is closed. On iPad, that means swiping the app away in the app switcher.
- After an update, "Updated to vX.Y.Z" shows briefly. Old caches are deleted.

The service worker only registers in production builds, so `npm run dev` never caches anything. The icons are rendered from `public/icon.svg` with `NODE_PATH=$(npm root -g) node tools/icons.cjs`.

## Deploying

GitHub Pages serves the repo root of `main` (Settings → Pages: "Deploy from a branch", `main`, `/ (root)`), at https://jkastl.github.io/glowfall/.

That's why the source page is `app.html`: the root `index.html` is the built app, along with `assets/`, `sw.js`, the manifest and the icons. Don't edit those by hand. `.deployed` lists them so each deploy can clear out the last one. `npm run dev` still serves the app at `/`.

To deploy:

1. Commit the source.
2. Run `tools/deploy-build.sh`. It builds from the committed HEAD and copies the result to the repo root.
3. Commit the built files and push.

Visits are counted with GoatCounter (`src/stats.ts`, same site code as jkastl.github.io). It only runs on github.io.
