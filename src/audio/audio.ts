import type { HitEvent } from '../engine/sim';
import { GlowEngine, type EngineStats } from './engine';

/**
 * Generative ambient audio for Glowfall (pure Web Audio, no assets). The sound graph lives in
 * ./engine.ts; this class owns the live AudioContext and its lifecycle.
 *
 * Contract used by the app:
 *  - start(): called from a user gesture (Start button). Create/resume the AudioContext, fade in the pad.
 *  - pause()/resume(): duck the pad and hush the hits while the run is paused.
 *  - stop(): fade everything out (returning to the builder).
 *  - hit(e): a marble struck something. Called often (dozens/sec) — rate-limited & voice-stolen internally.
 *  - finale(): all marbles have come to rest. Plays a gentle resolving arpeggio.
 *  - setMuted(m): mute toggle.
 *
 * Safe to import and construct without a DOM: nothing touches window/AudioContext until start().
 */

const FADE_IN = 3.5;
const FADE_OUT = 1.6;
const PAD_DUCK = 0.3;
const LOOKAHEAD = 3; // seconds of pad scheduled ahead of the clock
const TICK_MS = 500;

type Ctor = typeof AudioContext;

export class AmbientAudio {
  muted = false;

  private ctx: AudioContext | null = null;
  private engine: GlowEngine | null = null;
  private active = false; // between start() and stop()
  private paused = false;
  private hidden = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private suspendTimer: ReturnType<typeof setTimeout> | null = null;
  private listening = false;

  start() {
    const ctx = this.ensure();
    if (!ctx || !this.engine) return;
    this.active = true;
    this.paused = false;
    if (this.suspendTimer) clearTimeout(this.suspendTimer);
    this.suspendTimer = null;
    this.unlock(ctx);

    const e = this.engine;
    const t = ctx.currentTime;
    ramp(e.padBus.gain, 1, t, 0.3);
    ramp(e.hitBus.gain, 1, t, 0.05);
    ramp(e.mute.gain, this.muted ? 0 : 1, t, 0.05);
    ramp(e.out.gain, 1, t, FADE_IN / 3);
    this.pump();
    if (!this.timer) this.timer = setInterval(this.pump, TICK_MS);
  }

  pause() {
    this.paused = true;
    const e = this.engine;
    if (!e || !this.active) return;
    const t = e.ctx.currentTime;
    ramp(e.padBus.gain, PAD_DUCK, t, 0.35);
    ramp(e.hitBus.gain, 0, t, 0.09);
  }

  resume() {
    this.paused = false;
    const e = this.engine;
    if (!e || !this.active) return;
    this.wake();
    const t = e.ctx.currentTime;
    ramp(e.padBus.gain, 1, t, 0.45);
    ramp(e.hitBus.gain, 1, t, 0.06);
  }

  stop() {
    const e = this.engine;
    const ctx = this.ctx;
    this.active = false;
    this.paused = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (!e || !ctx) return;
    ramp(e.out.gain, 0, ctx.currentTime, FADE_OUT / 4);
    // once silent, park the context so an idle builder screen costs no audio CPU / battery
    if (this.suspendTimer) clearTimeout(this.suspendTimer);
    this.suspendTimer = setTimeout(() => {
      this.suspendTimer = null;
      if (!this.active && ctx.state === 'running') void ctx.suspend().catch(noop);
    }, (FADE_OUT + 4.5) * 1000);
  }

  hit(e: HitEvent) {
    const eng = this.engine;
    if (!eng || !this.active || this.paused || this.muted || this.hidden) return;
    if (eng.ctx.state !== 'running') return;
    eng.hitAt(e, eng.ctx.currentTime + 0.004);
  }

  finale() {
    const eng = this.engine;
    if (!eng || !this.active || eng.ctx.state !== 'running') return;
    eng.finaleAt(eng.ctx.currentTime + 0.05);
  }

  setMuted(m: boolean) {
    this.muted = m;
    const e = this.engine;
    if (!e) return;
    ramp(e.mute.gain, m ? 0 : 1, e.ctx.currentTime, m ? 0.06 : 0.12);
  }

  /** Dev/diagnostics only. */
  debugStats(): (EngineStats & { state: string }) | null {
    return this.engine && this.ctx ? { ...this.engine.stats(), state: this.ctx.state } : null;
  }

  // ── internals ──────────────────────────────────────────────────────────────────────────────

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (typeof window === 'undefined') return null;
    const w = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
    const AC = w.AudioContext ?? w.webkitAudioContext;
    if (!AC) return null;
    try {
      let ctx: AudioContext;
      try {
        ctx = new AC({ latencyHint: 'interactive' });
      } catch {
        ctx = new AC();
      }
      const engine = new GlowEngine(ctx);
      engine.out.gain.value = 0;
      engine.mute.gain.value = this.muted ? 0 : 1;
      this.ctx = ctx;
      this.engine = engine;
    } catch (err) {
      console.warn('[audio] unavailable', err);
      return null;
    }
    this.listen();
    return this.ctx;
  }

  /** iOS: resume inside the gesture and push one silent buffer through to open the output. */
  private unlock(ctx: AudioContext) {
    if (ctx.state !== 'running') void ctx.resume().catch(noop);
    try {
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      src.connect(ctx.destination);
      src.onended = () => src.disconnect();
      src.start();
    } catch {
      /* ignore */
    }
  }

  private wake() {
    const ctx = this.ctx;
    if (ctx && this.active && !this.hidden && ctx.state !== 'running') void ctx.resume().catch(noop);
  }

  private pump = () => {
    const ctx = this.ctx;
    if (!ctx || !this.engine || !this.active || ctx.state !== 'running') return;
    this.engine.schedulePad(ctx.currentTime + LOOKAHEAD);
  };

  /** Tab hidden → park the context; visible / next touch → bring it back (iOS "interrupted" too). */
  private listen() {
    if (this.listening || typeof document === 'undefined') return;
    this.listening = true;
    document.addEventListener('visibilitychange', () => {
      const ctx = this.ctx;
      if (!ctx) return;
      this.hidden = document.visibilityState === 'hidden';
      if (this.hidden) {
        if (ctx.state === 'running') void ctx.suspend().catch(noop);
      } else {
        this.wake();
      }
    });
    const onGesture = () => this.wake();
    for (const type of ['pointerdown', 'touchend', 'keydown'] as const) {
      window.addEventListener(type, onGesture, { passive: true, capture: true });
    }
    this.ctx?.addEventListener('statechange', () => {
      if (this.ctx?.state === 'running') this.pump();
    });
  }
}

function noop() {}

/** Click-free move of a param towards `value` from wherever it currently is. */
function ramp(p: AudioParam, value: number, t: number, tc: number) {
  p.cancelScheduledValues(t);
  p.setTargetAtTime(value, t, tc);
}
