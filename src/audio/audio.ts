import type { HitEvent } from '../engine/sim';

/**
 * Generative ambient audio. STUB — to be implemented.
 * Contract used by the app:
 *  - start(): called from a user gesture (Start button). Create/resume the AudioContext, fade in the pad.
 *  - pause()/resume(): fade the pad down/up when the run is paused.
 *  - stop(): fade everything out (returning to the builder).
 *  - hit(e): a marble struck something. Called often (dozens/sec) — must rate-limit & voice-steal internally.
 *  - finale(): all marbles have come to rest. Play a gentle resolving chord/shimmer.
 *  - setMuted(m): mute toggle.
 */
export class AmbientAudio {
  muted = false;
  start() {}
  pause() {}
  resume() {}
  stop() {}
  hit(_e: HitEvent) {}
  finale() {}
  setMuted(m: boolean) {
    this.muted = m;
  }
}
