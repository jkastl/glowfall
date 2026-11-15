import type { HitEvent } from '../engine/sim';

/**
 * The Glowfall sound graph, built on any BaseAudioContext so the very same code can be rendered
 * offline (tools/audio-check) and played live (AmbientAudio in ./audio.ts).
 *
 * Nothing here touches globals at import time; everything is created in the constructor from the
 * context that is passed in. All methods take explicit audio-clock times.
 *
 *   hit voices ─► hitBus ─┬───────────────► pre ─► compressor ─► soft clip ─► out ─► mute ─► destination
 *                         ├─► delay (fb) ─┬─► pre
 *   pad / ocean ─► padBus ┼─► reverb send ┴─► convolver ─► pre
 *   finale ─► finaleBus ──┘
 */

// ── Key & harmony ────────────────────────────────────────────────────────────────────────────
// D major pentatonic (D E F# A B). Degree 0 = D4.
const ROOT_HZ = 293.665;
const PENTA = [0, 2, 4, 7, 9];
const midi = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

interface Chord {
  bass: number; // midi
  notes: [number, number][]; // [midi, relative gain]
}
/** Four slow chords from D major; every pentatonic note sits comfortably on all of them. */
const CHORDS: Chord[] = [
  // Gmaj9 (the Lydian-feeling home away from home)
  { bass: 43, notes: [[55, 1], [62, 0.9], [66, 0.8], [69, 0.7], [71, 0.5]] },
  // Dmaj9
  { bass: 50, notes: [[57, 1], [61, 0.45], [64, 0.8], [66, 0.8], [69, 0.6]] },
  // Bm11
  { bass: 47, notes: [[54, 0.9], [57, 0.9], [62, 0.8], [64, 0.7], [69, 0.55]] },
  // A6/9 sus
  { bass: 45, notes: [[52, 0.9], [57, 0.9], [59, 0.7], [64, 0.8], [66, 0.6]] },
];
/** D6/9 — what the finale resolves onto. */
const RESOLVE: Chord = { bass: 38, notes: [[50, 0.9], [57, 1], [62, 0.9], [64, 0.6], [66, 0.8], [71, 0.4]] };

const CHORD_SPACING = 22; // seconds between chord onsets
const CHORD_ATTACK_TC = 2.8; // time constants (≈ 3× to settle)
const CHORD_RELEASE_TC = 3.4;
const CHORD_TAIL = 17; // oscillators stop this long after the release begins

// ── Levels (tuned with tools/audio-check) ────────────────────────────────────────────────────
const PAD_NOTE_GAIN = 0.023;
const PAD_BASS_GAIN = 0.05;
const OCEAN_GAIN = 0.016;
const HIT_GAIN = 0.2;
const TICK_GAIN = 0.05;
const CLICK_GAIN = 0.022;
const FINALE_GAIN = 0.15;

// ── Polyphony / rate limits ──────────────────────────────────────────────────────────────────
const MAX_VOICES = 16; // tuned bell voices
const MAX_TICKS = 6; // short untuned ticks / clicks
const NOTE_BUCKET_RATE = 11; // tuned notes per second, sustained
const NOTE_BUCKET_BURST = 5;
const NOTE_MIN_GAP = 0.028; // s between any two tuned notes
const SAME_NOTE_GAP = 0.11; // s between retriggers of the same degree
const TICK_MIN_GAP = 0.06;
const CLICK_MIN_GAP = 0.075;
const MIN_SPEED = 0.35;

interface Voice {
  kill: GainNode;
  oscs: OscillatorNode[];
  t0: number;
  end: number;
  peak: number;
  tc: number;
  stolen: boolean;
}

export interface EngineStats {
  voices: number;
  ticks: number;
  padVoices: number;
  /** Source nodes started / ended since construction (ended is only meaningful on a live context). */
  started: number;
  ended: number;
  dropped: number;
  stolen: number;
}

export interface EngineOptions {
  /** Deterministic randomness for offline checks. */
  random?: () => number;
}

export class GlowEngine {
  readonly ctx: BaseAudioContext;
  /** Final output chain, exposed so the wrapper can fade / mute. */
  readonly out: GainNode;
  readonly mute: GainNode;
  readonly padBus: GainNode;
  readonly hitBus: GainNode;

  private rnd: () => number;
  private finaleBus: GainNode;
  private padL: BiquadFilterNode;
  private padR: BiquadFilterNode;
  private subBus: GainNode;
  private padWave: PeriodicWave;
  private subWave: PeriodicWave;
  private canPan: boolean;

  private voices: Voice[] = [];
  private tickEnds: number[] = [];
  private padVoices = 0;
  private started = 0;
  private ended = 0;
  private dropped = 0;
  private stolen = 0;

  private nextChordTime = -1;
  private chordIndex = 0;

  private bucket = NOTE_BUCKET_BURST;
  private bucketTime = 0;
  private lastNoteTime = -1;
  private lastTickTime = -1;
  private lastClickTime = -1;
  private lastByNote = new Map<number, number>();
  /** Smoothed tuned-note rate (notes/s) used to thin the gain during pile-ups. */
  private density = 0;
  private densityTime = 0;

  constructor(ctx: BaseAudioContext, opts: EngineOptions = {}) {
    this.ctx = ctx;
    this.rnd = opts.random ?? Math.random;
    this.canPan = typeof ctx.createStereoPanner === 'function';

    // ── master chain ──
    const pre = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.knee.value = 14;
    comp.ratio.value = 5;
    comp.attack.value = 0.004;
    comp.release.value = 0.28;
    const clip = ctx.createWaveShaper();
    clip.curve = softClipCurve();
    const trim = ctx.createGain();
    trim.gain.value = MASTER_TRIM;
    this.out = ctx.createGain();
    this.mute = ctx.createGain();
    pre.connect(comp);
    comp.connect(trim);
    trim.connect(clip);
    clip.connect(this.out);
    this.out.connect(this.mute);
    this.mute.connect(ctx.destination);

    // ── shared space: long dark convolution reverb + a soft feedback delay ──
    const reverbIn = ctx.createGain();
    const conv = ctx.createConvolver();
    conv.buffer = makeImpulse(ctx, 4.8, this.rnd);
    const wet = ctx.createGain();
    wet.gain.value = REVERB_WET;
    reverbIn.connect(conv);
    conv.connect(wet);
    wet.connect(pre);

    const delayIn = ctx.createGain();
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.41;
    const fb = ctx.createGain();
    fb.gain.value = 0.36;
    const fbTone = ctx.createBiquadFilter();
    fbTone.type = 'lowpass';
    fbTone.frequency.value = 1700;
    const delayOut = ctx.createGain();
    delayOut.gain.value = 0.5;
    delayIn.connect(delay);
    delay.connect(fbTone);
    fbTone.connect(fb);
    fb.connect(delay);
    fbTone.connect(delayOut);
    delayOut.connect(pre);
    fbTone.connect(reverbIn);

    // ── buses ──
    const bus = (dry: number, send: number, echo: number) => {
      const g = ctx.createGain();
      const d = ctx.createGain();
      d.gain.value = dry;
      g.connect(d);
      d.connect(pre);
      const s = ctx.createGain();
      s.gain.value = send;
      g.connect(s);
      s.connect(reverbIn);
      if (echo > 0) {
        const e = ctx.createGain();
        e.gain.value = echo;
        g.connect(e);
        e.connect(delayIn);
      }
      return g;
    };
    this.padBus = bus(0.8, 0.55, 0);
    this.hitBus = bus(1, 0.42, 0.16);
    this.finaleBus = bus(0.75, 0.9, 0.3);

    // ── pad: two wide, slowly breathing lowpass paths ──
    this.padWave = makeWave(ctx, [1, 0.42, 0.24, 0.13, 0.08, 0.05, 0.03, 0.02]);
    this.subWave = makeWave(ctx, [1, 0.3, 0.1]);
    const padPath = (pan: number, cutoff: number, lfoHz: number, depth: number) => {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = cutoff;
      f.Q.value = 0.6;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = lfoHz;
      const lg = ctx.createGain();
      lg.gain.value = depth;
      lfo.connect(lg);
      lg.connect(f.frequency);
      lfo.start();
      if (this.canPan) {
        const p = ctx.createStereoPanner();
        p.pan.value = pan;
        f.connect(p);
        p.connect(this.padBus);
      } else {
        f.connect(this.padBus);
      }
      return f;
    };
    this.padL = padPath(-0.55, 1050, 0.043, 420);
    this.padR = padPath(0.55, 1150, 0.031, 480);

    // sub swell: the chord's bass, breathing very slowly
    this.subBus = ctx.createGain();
    this.subBus.gain.value = 0.7;
    const subLfo = ctx.createOscillator();
    subLfo.frequency.value = 0.057;
    const subDepth = ctx.createGain();
    subDepth.gain.value = 0.3;
    subLfo.connect(subDepth);
    subDepth.connect(this.subBus.gain);
    subLfo.start();
    this.subBus.connect(this.padBus);

    // faint "ocean": looped noise through a slowly sweeping band
    const noise = ctx.createBufferSource();
    noise.buffer = makeNoise(ctx, 3.7, this.rnd);
    noise.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 140;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 520;
    lp.Q.value = 0.4;
    const oceanGain = ctx.createGain();
    oceanGain.gain.value = OCEAN_GAIN * 0.6;
    const swell = ctx.createOscillator();
    swell.frequency.value = 0.083; // ~12 s waves
    const swellAmp = ctx.createGain();
    swellAmp.gain.value = OCEAN_GAIN * 0.4;
    swell.connect(swellAmp);
    swellAmp.connect(oceanGain.gain);
    const swellTone = ctx.createGain();
    swellTone.gain.value = 260;
    swell.connect(swellTone);
    swellTone.connect(lp.frequency);
    swell.start();
    noise.connect(hp);
    hp.connect(lp);
    lp.connect(oceanGain);
    oceanGain.connect(this.padBus);
    noise.start();
  }

  // ── pad ────────────────────────────────────────────────────────────────────────────────────

  /** Schedule pad chords so that everything up to `until` (audio clock) is covered. Idempotent. */
  schedulePad(until: number) {
    const now = this.ctx.currentTime;
    if (this.nextChordTime < 0 || this.nextChordTime < now - 1) this.nextChordTime = now + 0.05;
    while (this.nextChordTime < until) {
      this.playChord(CHORDS[this.chordIndex], this.nextChordTime, CHORD_SPACING, 1);
      this.chordIndex = (this.chordIndex + 1) % CHORDS.length;
      this.nextChordTime += CHORD_SPACING;
    }
  }

  private playChord(ch: Chord, t0: number, hold: number, level: number) {
    const ctx = this.ctx;
    const tEnd = t0 + hold;
    const tStop = tEnd + CHORD_TAIL;
    const voice = (freq: number, wave: PeriodicWave, peak: number, dest: AudioNode, detune: number, delayIn: number) => {
      const o = ctx.createOscillator();
      o.setPeriodicWave(wave);
      o.frequency.value = freq;
      o.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = 0;
      g.gain.setValueAtTime(0, t0);
      g.gain.setTargetAtTime(peak, t0 + delayIn, CHORD_ATTACK_TC);
      g.gain.setTargetAtTime(0, tEnd + delayIn * 0.5, CHORD_RELEASE_TC);
      o.connect(g);
      g.connect(dest);
      o.start(t0);
      o.stop(tStop);
      this.padVoices++;
      this.started++;
      o.onended = () => {
        this.padVoices--;
        this.ended++;
        o.disconnect();
        g.disconnect();
      };
    };
    for (const [m, rel] of ch.notes) {
      const f = midi(m);
      const peak = PAD_NOTE_GAIN * rel * level;
      const stagger = this.rnd() * 3.5; // notes bloom one after another
      const cents = 5 + this.rnd() * 4;
      voice(f, this.padWave, peak, this.padL, -cents, stagger);
      voice(f, this.padWave, peak, this.padR, cents, stagger + this.rnd() * 1.5);
    }
    voice(midi(ch.bass), this.subWave, PAD_BASS_GAIN * level, this.subBus, 0, 0.5);
  }

  // ── hits ───────────────────────────────────────────────────────────────────────────────────

  /** A marble struck something at audio time `t`. Rate-limits and voice-steals internally. */
  hitAt(e: HitEvent, t: number) {
    if (!(e.speed >= MIN_SPEED)) return;
    // perceptual loudness: gentle, compressive
    const v = Math.min(1, (e.speed - MIN_SPEED * 0.5) / 11);
    const amp = 0.14 + 0.86 * Math.pow(v, 0.7);
    const pan = Math.max(-0.75, Math.min(0.75, ((e.x ?? 5) / 10) * 2 - 1)) * 0.8;

    if (e.kind === 'marble') {
      if (t - this.lastClickTime < CLICK_MIN_GAP || !this.tickSlot(t)) return void this.dropped++;
      this.lastClickTime = t;
      // tiny glass click, pitched high in the key so even the noise floor sparkles in tune
      const deg = 15 + Math.floor(this.rnd() * 8);
      this.tick(t, degreeHz(deg, 5000), CLICK_GAIN * amp, 0.022, pan, 1.0);
      return;
    }
    if (e.note === undefined) {
      if (t - this.lastTickTime < TICK_MIN_GAP || !this.tickSlot(t)) return void this.dropped++;
      this.lastTickTime = t;
      // muted wooden tick: a very short, low-mid blip with a little downward pitch bend
      const deg = 3 + Math.floor(this.rnd() * 5);
      this.tick(t, degreeHz(deg, 1400), TICK_GAIN * amp, 0.045, pan, 1.35);
      return;
    }

    // tuned bell — global token bucket, minimum spacing, per-note retrigger guard
    const note = Math.round(e.note);
    this.bucket = Math.min(NOTE_BUCKET_BURST, this.bucket + Math.max(0, t - this.bucketTime) * NOTE_BUCKET_RATE);
    this.bucketTime = Math.max(this.bucketTime, t);
    const lastSame = this.lastByNote.get(note) ?? -1;
    if (this.bucket < 1 || t - this.lastNoteTime < NOTE_MIN_GAP || t - lastSame < SAME_NOTE_GAP) {
      this.dropped++;
      return;
    }
    this.bucket -= 1;
    this.lastNoteTime = t;
    this.lastByNote.set(note, t);

    // density → thin the gain so a pile-up stays a shimmer rather than a wall
    this.density *= Math.exp(-Math.max(0, t - this.densityTime) / 0.9);
    this.densityTime = Math.max(this.densityTime, t);
    this.density += 1 / 0.9;
    const thin = 1 / Math.sqrt(1 + Math.max(0, this.density - 2) / 3);

    this.reap(t);
    if (this.voices.length >= MAX_VOICES) this.steal(t);
    const f = degreeHz(note, 1500);
    this.bell(this.hitBus, t, f, HIT_GAIN * amp * thin, v, pan, 1);
  }

  /** Bell / kalimba voice: sine carrier with a fast-decaying FM "tine" and a soft octave partial. */
  private bell(dest: AudioNode, t: number, f: number, peak: number, bright: number, pan: number, sustain: number): Voice {
    const ctx = this.ctx;
    // equal-loudness-ish: ease off the top, lift the bottom a touch
    peak *= Math.pow(ROOT_HZ / f, 0.3);
    // lower notes ring longer
    const tc = Math.min(1.5, 0.52 * Math.pow(ROOT_HZ / f, 0.45)) * sustain;
    const dur = tc * 5.5;
    const detune = (this.rnd() - 0.5) * 7;

    const car = ctx.createOscillator();
    car.frequency.value = f;
    car.detune.value = detune;
    const mod = ctx.createOscillator();
    mod.frequency.value = f * 3.5;
    const idx = ctx.createGain();
    const depth = f * (0.25 + 1.1 * bright);
    idx.gain.setValueAtTime(depth, t);
    idx.gain.setTargetAtTime(0, t, 0.045 + 0.05 * bright);
    mod.connect(idx);
    idx.connect(car.frequency);

    const oct = ctx.createOscillator();
    oct.frequency.value = f * 2.004;
    oct.detune.value = detune;
    const octGain = ctx.createGain();
    octGain.gain.setValueAtTime(0.2 + 0.12 * bright, t);
    octGain.gain.setTargetAtTime(0, t, tc * 0.45);
    oct.connect(octGain);

    const env = ctx.createGain();
    env.gain.value = 0;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(peak, t + 0.006);
    env.gain.setTargetAtTime(0, t + 0.006, tc);
    car.connect(env);
    octGain.connect(env);

    // separate gain for stealing, so we never have to cancel the envelope mid-flight
    const kill = ctx.createGain();
    env.connect(kill);
    let tail: AudioNode = kill;
    let panner: StereoPannerNode | null = null;
    if (this.canPan) {
      panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      kill.connect(panner);
      tail = panner;
    }
    tail.connect(dest);

    const oscs = [car, mod, oct];
    const voice: Voice = { kill, oscs, t0: t, end: t + dur, peak, tc, stolen: false };
    for (const o of oscs) {
      o.start(t);
      o.stop(t + dur);
    }
    this.started++;
    car.onended = () => {
      this.ended++;
      for (const n of [car, mod, idx, oct, octGain, env, kill, panner]) n?.disconnect();
      const i = this.voices.indexOf(voice);
      if (i >= 0) this.voices.splice(i, 1);
    };
    this.voices.push(voice);
    return voice;
  }

  /** Very short sine blip for untuned surfaces and marble-marble contacts. */
  private tick(t: number, f: number, peak: number, tc: number, pan: number, bend: number) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(f * bend, t);
    o.frequency.setTargetAtTime(f, t, 0.012);
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.003);
    g.gain.setTargetAtTime(0, t + 0.003, tc);
    o.connect(g);
    let panner: StereoPannerNode | null = null;
    if (this.canPan) {
      panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      g.connect(panner);
      panner.connect(this.hitBus);
    } else {
      g.connect(this.hitBus);
    }
    const end = t + tc * 7;
    o.start(t);
    o.stop(end);
    this.tickEnds.push(end);
    this.started++;
    o.onended = () => {
      this.ended++;
      o.disconnect();
      g.disconnect();
      panner?.disconnect();
    };
  }

  private tickSlot(t: number): boolean {
    const ends = this.tickEnds;
    for (let i = ends.length - 1; i >= 0; i--) if (ends[i] <= t) ends.splice(i, 1);
    return ends.length < MAX_TICKS;
  }

  /** Forget voices whose scheduled end has passed (bookkeeping does not depend on onended). */
  private reap(t: number) {
    const vs = this.voices;
    for (let i = vs.length - 1; i >= 0; i--) if (vs[i].end <= t) vs.splice(i, 1);
  }

  /** Fade out the voice that is currently quietest. */
  private steal(t: number) {
    let best = -1;
    let bestLevel = Infinity;
    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i];
      const level = v.peak * Math.exp(-Math.max(0, t - v.t0) / v.tc);
      if (level < bestLevel) {
        bestLevel = level;
        best = i;
      }
    }
    if (best < 0) return;
    const v = this.voices[best];
    this.voices.splice(best, 1);
    v.stolen = true;
    this.stolen++;
    v.kill.gain.setTargetAtTime(0, t, 0.012);
    const stopAt = t + 0.1;
    if (stopAt < v.end) for (const o of v.oscs) o.stop(stopAt);
  }

  // ── finale ─────────────────────────────────────────────────────────────────────────────────

  /** All marbles at rest: a slow arpeggio rising into the reverb over a resolving D6/9 swell. */
  finaleAt(t: number) {
    this.playChord(RESOLVE, t, 7, 1.15);
    // D3 A3 | D4 F#4 A4 B4 D5 E5 F#5 A5 D6
    const degs = [-5, -2, 0, 2, 3, 4, 5, 6, 7, 8, 10];
    let at = t + 0.25;
    for (let i = 0; i < degs.length; i++) {
      const k = i / (degs.length - 1);
      const pan = (i % 2 ? 1 : -1) * (0.15 + 0.4 * k);
      this.bell(this.finaleBus, at, degreeHz(degs[i], 2400), FINALE_GAIN * (1 - 0.35 * k), 0.25 + 0.2 * k, pan, 2.1);
      at += i < 1 ? 0.5 : 0.2 + 0.2 * k;
    }
  }

  stats(): EngineStats {
    this.reap(this.ctx.currentTime);
    this.tickSlot(this.ctx.currentTime);
    return {
      voices: this.voices.length,
      ticks: this.tickEnds.length,
      padVoices: this.padVoices,
      started: this.started,
      ended: this.ended,
      dropped: this.dropped,
      stolen: this.stolen,
    };
  }
}

const MASTER_TRIM = 1;
const REVERB_WET = 0.9;

/** Pentatonic degree → Hz, folded by octaves into a comfortable register. */
function degreeHz(degree: number, maxHz: number): number {
  const oct = Math.floor(degree / 5);
  const step = degree - oct * 5;
  let f = ROOT_HZ * Math.pow(2, oct + PENTA[step] / 12);
  while (f > maxHz) f /= 2;
  while (f < 130) f *= 2;
  return f;
}

function makeWave(ctx: BaseAudioContext, harmonics: number[]): PeriodicWave {
  const real = new Float32Array(harmonics.length + 1);
  const imag = new Float32Array(harmonics.length + 1);
  for (let i = 0; i < harmonics.length; i++) imag[i + 1] = harmonics[i];
  return ctx.createPeriodicWave(real, imag);
}

function makeNoise(ctx: BaseAudioContext, seconds: number, rnd: () => number): AudioBuffer {
  const n = Math.floor(seconds * ctx.sampleRate);
  const buf = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = rnd() * 2 - 1;
  }
  return buf;
}

/**
 * Long, dark, diffuse impulse response: decaying stereo noise whose top end dies away faster than
 * its body (a one-pole lowpass that closes over time), with a short fade-in instead of a hard onset.
 */
function makeImpulse(ctx: BaseAudioContext, seconds: number, rnd: () => number): AudioBuffer {
  const sr = ctx.sampleRate;
  const n = Math.floor(seconds * sr);
  const buf = ctx.createBuffer(2, n, sr);
  const decayTc = seconds / 6.2; // ≈ -54 dB by the end
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      // cutoff glides ~5.5 kHz → ~700 Hz
      const cutoff = 700 + 4800 * Math.exp(-t / 0.9);
      const a = 1 - Math.exp((-2 * Math.PI * cutoff) / sr);
      lp += a * (rnd() * 2 - 1 - lp);
      const onset = Math.min(1, t / 0.03);
      const fadeEnd = Math.min(1, (seconds - t) / 0.25);
      d[i] = lp * onset * onset * Math.exp(-t / decayTc) * fadeEnd;
    }
  }
  return buf;
}

/** Transparent below ±0.7, then a tanh knee that can never exceed ~0.91. */
function softClipCurve(): Float32Array<ArrayBuffer> {
  const n = 2049;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a < 0.7 ? a : 0.7 + 0.25 * Math.tanh((a - 0.7) / 0.25);
    curve[i] = Math.sign(x) * y;
  }
  return curve;
}
