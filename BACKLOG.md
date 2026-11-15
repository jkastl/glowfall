# Glowfall: ideas for later

v1 is deliberately simple: build a column of parts, release 30 marbles, watch them settle. Here's the pile of "wouldn't it be nice", roughly grouped and ordered by bang-for-buck within each group.

## Run controls
- **Speed control**: slow-mo / 1× / 2× (the sim already takes a `speed` factor; it just needs UI).
- **Gravity slider**: from moon-drift to brisk. Needs a sanity check that every part still passes the harness at the extremes.
- **Bounciness / friction**: global multipliers on restitution & friction.
- **Marble count & release rate**: 5 → 100, trickle vs. flood.
- **Marble size**: a few sizes, possibly mixed in one run (the port is ~4 diameters wide, so this caps out around 1.5×).
- **Loop mode**: an elevator/lift carries marbles from the pool back to the source so it runs forever as a screensaver. Includes a "lead marble" camera mode and an auto-drift camera.
- **Step / scrub**: single-step physics, or rewind via recorded snapshots.

## Look & feel
- **Themes**: the other moods we talked about (soft pastel dusk, warm wooden toy, paper cutout), plus day/night. Renderer styles are already centralized in `drawFixture` / `Renderer.draw`, so a theme is mostly a palette + stroke recipe + background.
- **Marble palettes**: user-picked colors, gradients, "all one color", rainbow-by-order.
- **Camera modes**: follow flock (current), follow leader, follow straggler, free/manual, slow cinematic auto-pan, zoom-to-fit the whole track.
- **Depth effects**: parallax background layers, faint caustics, bubbles kicked up by fast marbles, particles on impact.
- **Part accent hues**: let users tint individual parts.
- **Performance knobs**: bloom on/off, trail length, mote count (an auto-quality governor that watches frame time).
- **Haptics** on supported devices for big impacts.

## Building
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
- **Pad on/off** and a master volume slider.
- **Rolling sound** (soft continuous rumble based on rolling speed).

## Game-ish modes (optional, still chill)
- **Challenges**: "get all marbles sorted by color", "make it last 2 minutes", "use exactly 5 parts".
- **Timer / stats**: run duration, most-hit part, longest-airborne marble.

## Tech
- **PWA / offline**: installable on the iPad home screen, full-screen, works without network.
- **Physics in a Worker** if big tracks get heavy.
- **Deterministic replays** (fixed seed + recorded inputs).
- **Visual regression tests**: screenshot each part via `?solo=` and diff.
