# Glowfall

A zen, bioluminescent 2D marble run. Stack parts into a single column, drop the marbles in, and watch them drift down through the dark.

**Play:** https://jkastl.github.io/gbc/ (built for iPad in landscape, also fine on desktop)

## Develop

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # physics harness: every part must pass marbles through its ports
npm run build        # outputs the GitHub Pages site into /docs
```

Dev preview of a single part: `/?solo=<partId>&marbles=20&t=8` (where `t` fast-forwards the sim).

## Adding a part

Drop a file in `src/parts/` that default-exports a `PartDef` (see `src/engine/types.ts`, and use `src/parts/switchback.ts` as the reference). Marbles enter through the top port (x 3.9–6.1) and must leave through the bottom port. `npm test` checks that.
