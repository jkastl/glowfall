# Changelog

All notable changes to Glowfall. Versions follow [semver](https://semver.org/); each release is tagged `vX.Y.Z`.

## 1.3.3 (2026-11-16)

- **Fixed: the camera didn't follow the marbles after loading a starter track.** Loading one asked the camera to glide to a spot above where it's allowed to go. The glide never finished, and an unfinished glide switched off following until you scrolled by hand (then it jumped). Glides now aim within the camera's limits, and a new run always starts following.

## 1.3.2 (2026-11-16)

- **The panel header no longer sits in the status bar's blur.** As an installed app on iPad, "Glowfall" and the Starter tracks menu were smeared by the soft band iPadOS draws under the clock. The header and the top-right buttons now start below it. Browser tabs and desktop are unchanged.
- The installed app's status bar is now opaque instead of see-through, so the page starts beneath it on devices that honour that.
- Phones: the bottom panel no longer reserves room for the status bar it isn't under.

## 1.3.1 (2026-11-16)

- The Starter tracks menu now looks like a menu: a glowing pill with a chevron, instead of something that reads as a text field.

## 1.3.0 (2026-11-16)

- **Starter tracks come with their own feel.** Choosing one sets speed, gravity, bounce and Endless loop along with the parts, and a note says what changed. The Background volume is left as you set it.
  - First Light: as designed.
  - Clockwork Tide: heavy and soft (gravity 1.3×, bounce 0.4×, speed 0.85×).
  - Rainfall: lively (bounce 1.6×).
  - Grand Tour: brisk (speed 1.5×).
- **Two new endless starter tracks**:
  - **Moon Garden**: low gravity and high bounce through bumpers, pegs and chimes, round and round.
  - **Night Drift**: slow and unhurried, a screensaver.
- `tests/tracks.test.ts` runs every starter track with its own feel (endless ones: every marble laps twice) and as designed.

## 1.2.1 (2026-11-16)

- No more fade across the top on the iPad. In the installed app, iOS darkens the strip behind the status bar (clock, battery) and the track was drawn underneath it. The stage now starts just below the status bar, so that strip sits over the plain background.

## 1.2.0 (2026-11-16)

- **Connectors between parts**: a small funnel and slot now sits between every two parts, like the standard ports between Great Ball Contraption modules.
  - Most parts hand marbles over fast and sideways (5–7 units/s), and marbles were flying straight past the next part's mechanism, as with Plinko and the Color Sorter.
  - The connector's calm, low-bounce glass gathers each marble into a short vertical slot, so the next part receives it gently (median sideways speed now about 0.2 units/s).
  - New `tests/handoff.test.ts` checks this after every part.
- **Calm surfaces** (engine): a material can now ask for the *lower* restitution in a contact. Box2D normally takes the higher, so the marble's own bounciness overrode any soft wall.
- Colour sorting improved from about 65% to about 75% correct. It is still not perfect when marbles of different colours arrive close together; see the backlog.

## 1.1.0 (2026-11-16)

- **Quieter background**: the pad and ocean now sit about 10 dB under a typical marble note, so the marbles and the track make the music. Bells, ticks and marble-on-marble clicks are a touch louder. A new **Background** slider in the run settings goes from off to as full as before.
- **Plinko actually plinks**:
  - An inlet funnel drops every marble from a slot onto a lone top peg. The Switchback hands marbles over fast and sideways, along the peg grid's diagonal, so on First Light every one used to thread the whole field without touching a peg.
  - Slanted nibs on the walls flick marbles that slide down the sides back into the pegs.
  - Marbles now hit about 7–8 pegs each, up from 0 on First Light. `tests/plinko.test.ts` keeps it that way.
- **Scenery**:
  - Behind the track, faint kelp sways in the far distance, while jellyfish and a small fish shoal drift nearer. Each depth scrolls at its own pace (parallax).
  - On the outside of the column walls grow sparse plants: kelp, sea fans, flowers and glowing bracket fungi. A few animals live there too: a snail inching along, a patrolling fish, a little jellyfish. Each track grows its own garden.
- **Quotes**: during a run, a quiet line fades in at the bottom of the screen now and then ("The marble does not hurry. It still arrives."). One stays with you at the finale.

- **Endless loop**: a new switch in the run settings panel. There is no pool; a marble that leaves the last part comes back in at the top, and the run goes on until you stop it. It takes effect at the next Release (the panel says so if you flip it mid-run), is remembered, and Reset turns it off.
- The track is drawn as one continuous column that repeats, so the join between the last part and the source is just another hand-over. The camera follows the flock down without end, and you can drag or scroll past the end too, also while building.
- While looping, the counter shows "↻ lap N" instead of "N / 30 at rest", there is no finale and no "Again", and the track list ends in "↻ Back to the top" instead of "Pool".
- The screen stays awake during a run (Screen Wake Lock, where the browser supports it), and is released on pause and when you go back to building.
- Built to run for hours: lap counts and the camera fold back every lap so no number keeps growing, the rescue log keeps only the latest 200 entries, and the anti-jam starts each lap fresh.
- New tests `tests/loop.test.ts` and `tests/loop-feel.test.ts`: every starter track in endless mode, one of them for 30 simulated minutes, and all of them at the four corners of the gravity/bounce range. Every marble keeps circulating with no rescues, and the body count, logs and heap stay flat.

## 1.0.1 (2026-11-15)

- New home: the repo is now `jkastl/glowfall`, and the app is at https://jkastl.github.io/glowfall/, with no more `/docs/` redirect. The built site lives at the repo root, and the source page is `app.html`.
- Canonical link, link-preview tags and visit counts all point at `/glowfall/`.
- Removed an unused file left over from the Vite starter template.

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
