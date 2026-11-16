# Glowfall: ideas for later

v1 is deliberately simple: build a column of parts, release 30 marbles, watch them settle (or, since v1.1.0, circle endlessly). Here's the pile of "wouldn't it be nice", roughly grouped and ordered by bang-for-buck within each group.

## Run controls
- ~~**Speed control**~~: done in v1.0.0 (0.25×–3×).
- ~~**Gravity slider**~~ and ~~**bounciness**~~: done in v0.2.0 (0.3×–2× gravity, 0–2× bounce, live mid-run).
- **Friction**: a global multiplier, like bounce. Needs the same extremes sweep (`tests/feel.test.ts`).
- **Marble count & release rate**: 5 → 100, trickle vs. flood.
- **Marble size**: a few sizes, possibly mixed in one run (the port is ~4 diameters wide, so this caps out around 1.5×).
- ~~**Loop mode**~~: done in v1.1.0 as "Endless loop". Instead of a lift, the column wraps around: marbles leaving the last part re-enter the source, and the camera follows them down forever. Still open: a "lead marble" camera mode and a slow auto-drift camera (see Camera modes).
- **Step / scrub**: single-step physics, or rewind via recorded snapshots.

## Look & feel
- **Themes**: the other moods we talked about (soft pastel dusk, warm wooden toy, paper cutout), plus day/night. Renderer styles are already centralized in `drawFixture` / `Renderer.draw`, so a theme is mostly a palette + stroke recipe + background.
- **Marble palettes**: user-picked colors, gradients, "all one color", rainbow-by-order.
- **Camera modes**: follow flock (current), follow leader, follow straggler, free/manual, slow cinematic auto-pan, zoom-to-fit the whole track.
- ~~**Parallax background**~~ and wall plants/animals: done in v1.1.0. Still open: faint caustics, bubbles kicked up by fast marbles, particles on impact.
- **Part accent hues**: let users tint individual parts.
- **Performance knobs**: bloom on/off, trail length, mote count. (An auto-quality governor already drops bloom on slow frames.)
- **Haptics** on supported devices for big impacts.

## Building
- **Color Sorter escapement**: it sorts about 75% correctly. When two marbles of different colours arrive close together, the gate can only lean one way, and the second rolls off on the wrong side. Hold marbles on a little latch and release one at a time once the gate has set.
- **Part parameters**: mirror (left/right), width/height variants, peg density, number of buckets, wheel speed, sorter rule (warm/cool, by color, alternate).
- **Branching / two columns**: true GBC layouts with parallel lanes that merge, or a 2-wide grid.
- **Drag from palette** directly into a position in the stack (currently tap-to-insert), and drag parts on the canvas itself.
- **Undo / redo**.
- **Randomize track** ("surprise me") and **duplicate part**.
- **Live-edit while running**: insert/remove parts mid-run.
- **Part editor**: draw your own ramps/curves with a pen, saved as custom parts.

## Saving & sharing
- **Share via URL**: encode the track (part ids + params) in the hash; it's tiny.
- **Saved tracks list** (local), with thumbnails.
- **Export a video/GIF** of a run (MediaRecorder on the canvas stream + audio).
- **Gallery** of community tracks (needs a backend).

## Sound
- **Key / mood selector** (pentatonic major, minor, Japanese in-sen, whole-tone dream).
- **Instrument per part** (kalimba, glass, wood block, bell), and per-part volume.
- ~~**Pad level**~~: Background slider done in v1.1.0. Still open: a master volume slider.
- **Rolling sound** (soft continuous rumble based on rolling speed).

## Game-ish modes (optional, still chill)
- **Challenges**: "get all marbles sorted by color", "make it last 2 minutes", "use exactly 5 parts".
- **Timer / stats**: run duration, most-hit part, longest-airborne marble.

## Tech
- ~~**PWA / offline**~~: done in v1.0.0.
- **Physics in a Worker** if big tracks get heavy.
- **Deterministic replays** (fixed seed + recorded inputs).
- **Visual regression tests**: screenshot each part via `?solo=` and diff.

## Engine asks from the part builders
Several part agents independently asked for these. All of them worked around the gaps:
- ~~**Calm surfaces**~~: done in v1.2.0 (`Material.calm`), used by the connectors between parts. Turnstile and vortex still have their own contact listeners and could switch over.
- **`ctx.chime(note, x, y)`**: let a mechanism play a tuned note on an event (a bucket tipping, a pocket emptying), not just on impacts.
- **`ctx.marblesIn(aabb)`**: a list of marbles in a region, instead of tracking them by sensors or by circle radius.
- **Curved `funnelToOutlet`**: bell-shaped walls that arrive vertical at the port (several parts hand-roll this).
