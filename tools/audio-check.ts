// Dev-only technical check of the audio engine. Open /tools/audio-check.html (add ?auto to run at once).
// Renders the real graph in an OfflineAudioContext and reports levels + render speed, then drives the
// live AmbientAudio with a hit storm and verifies that voices are cleaned up.
import { AmbientAudio } from '../src/audio/audio';
import { GlowEngine } from '../src/audio/engine';
import type { HitEvent } from '../src/engine/sim';

const SR = 44100;
const out = document.getElementById('out')!;
const log = (s: string) => (out.textContent += s + '\n');
const db = (x: number) => (x > 0 ? +(20 * Math.log10(x)).toFixed(1) : -Infinity);

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function measure(buf: AudioBuffer, from = 0, to = buf.duration) {
  let peak = 0;
  let sum = 0;
  let n = 0;
  let maxStep = 0;
  const a = Math.floor(from * buf.sampleRate);
  const b = Math.min(buf.length, Math.floor(to * buf.sampleRate));
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = a; i < b; i++) {
      const v = Math.abs(d[i]);
      if (v > peak) peak = v;
      sum += d[i] * d[i];
      if (i > a) maxStep = Math.max(maxStep, Math.abs(d[i] - d[i - 1]));
    }
    n += b - a;
  }
  return { peak: +peak.toFixed(3), peakDb: db(peak), rmsDb: db(Math.sqrt(sum / Math.max(1, n))), maxStep: +maxStep.toFixed(3) };
}

function randomHit(r: () => number, hard: boolean): HitEvent {
  const k = r();
  const kind = k < 0.35 ? 'marble' : 'wall';
  const note = kind === 'wall' && k < 0.85 ? Math.floor(r() * 16) - 5 : undefined;
  return { x: r() * 10, y: r() * 40, speed: hard ? 6 + r() * 6 : 0.5 + r() * r() * 9, note, hue: 0, kind };
}

async function offline(seconds: number, setup: (e: GlowEngine, r: () => number) => void) {
  const ctx = new OfflineAudioContext(2, Math.floor(seconds * SR), SR);
  const r = rng(7);
  const e = new GlowEngine(ctx, { random: r });
  setup(e, r);
  const t0 = performance.now();
  const buf = await ctx.startRendering();
  const ms = performance.now() - t0;
  return { buf, e, ms: Math.round(ms), realtimeX: +((seconds * 1000) / ms).toFixed(1) };
}

async function run() {
  const res: Record<string, unknown> = {};
  const errors: string[] = [];
  window.addEventListener('error', (ev) => errors.push(String(ev.message)));
  window.addEventListener('unhandledrejection', (ev) => errors.push(String(ev.reason)));
  out.textContent = '';

  // 1. pad alone, two full chord cycles
  {
    const { buf, ms, realtimeX } = await offline(100, (e) => e.schedulePad(100));
    res.pad = { all: measure(buf, 12, 100), ms, realtimeX };
    const per: unknown[] = [];
    for (let t = 12; t < 100; t += 11) per.push(measure(buf, t, t + 11).rmsDb);
    (res.pad as Record<string, unknown>).rmsPer11s = per;
  }
  // 2. heavy storm: 60 hard hits/s over the pad
  {
    const { buf, e, ms, realtimeX } = await offline(24, (e, r) => {
      e.schedulePad(24);
      for (let t = 4; t < 19; t += 1 / 60) e.hitAt(randomHit(r, true), t + r() * 0.01);
    });
    res.storm = { during: measure(buf, 4, 19), after: measure(buf, 22, 24), ms, realtimeX, stats: e.stats() };
  }
  // 2b. worst case: every hit is the hardest tuned hit, all centred, same few notes
  {
    const { buf, e } = await offline(14, (e, r) => {
      e.schedulePad(14);
      for (let t = 2; t < 12; t += 1 / 60) e.hitAt({ x: 5, y: 0, speed: 14, note: Math.floor(r() * 3), hue: 0, kind: 'wall' }, t);
    });
    res.stormWorst = { during: measure(buf, 2, 12), stats: e.stats() };
  }
  // 3. typical play: ~8 mixed hits/s over the pad
  {
    const { buf } = await offline(24, (e, r) => {
      e.schedulePad(24);
      for (let t = 6; t < 20; t += 1 / 8) e.hitAt(randomHit(r, false), t + r() * 0.1);
    });
    res.typical = measure(buf, 6, 20);
  }
  // 4. isolated hits, no pad
  {
    const one = async (h: Partial<HitEvent>) => {
      const { buf } = await offline(4, (e) => e.hitAt({ x: 5, y: 0, speed: 5, hue: 0, kind: 'wall', ...h }, 0.5));
      const m = measure(buf, 0.4, 4);
      return { peakDb: m.peakDb, rmsDb: measure(buf, 0.5, 1.5).rmsDb, maxStep: m.maxStep };
    };
    res.hits = {
      soft_note0: await one({ note: 0, speed: 1 }),
      mid_note0: await one({ note: 0, speed: 4 }),
      hard_note0: await one({ note: 0, speed: 12 }),
      hard_low: await one({ note: -5, speed: 12 }),
      hard_high: await one({ note: 10, speed: 12 }),
      tick_mid: await one({ speed: 4 }),
      tick_hard: await one({ speed: 12 }),
      click_mid: await one({ kind: 'marble', speed: 4 }),
      click_hard: await one({ kind: 'marble', speed: 12 }),
    };
  }
  // 5. finale over the pad
  {
    const { buf } = await offline(30, (e) => {
      e.schedulePad(30);
      e.finaleAt(14);
    });
    res.finale = { before: measure(buf, 10, 14), during: measure(buf, 14, 20), tail: measure(buf, 24, 30) };
  }
  // 6. live context: lifecycle + cleanup
  {
    const a = new AmbientAudio();
    const live: Record<string, unknown> = {};
    try {
      a.hit(randomHit(Math.random, true)); // before start: must be a no-op
      a.start();
      await sleep(600);
      live.afterStart = a.debugStats();
      const r = rng(3);
      const iv = setInterval(() => {
        for (let i = 0; i < 4; i++) a.hit(randomHit(r, true));
      }, 1000 / 15); // 60 hits/s
      const lag: number[] = [];
      let last = performance.now();
      const lagIv = setInterval(() => {
        const n = performance.now();
        lag.push(n - last - 20);
        last = n;
      }, 20);
      await sleep(2500);
      live.midStorm = a.debugStats();
      a.pause();
      a.resume();
      a.setMuted(true);
      a.setMuted(false);
      await sleep(2500);
      clearInterval(iv);
      clearInterval(lagIv);
      live.mainThreadLagMsMax = +Math.max(...lag).toFixed(1);
      live.endStorm = a.debugStats();
      a.finale();
      await sleep(600);
      live.finale = a.debugStats();
      a.pause();
      await sleep(300);
      a.resume();
      await sleep(13000);
      const s = a.debugStats()!;
      live.settled = s;
      // every source that was started has ended, except pad voices still sounding
      live.leaked = s.started - s.ended - s.padVoices;
      a.stop();
      await sleep(7000);
      live.afterStop = a.debugStats();
      a.start();
      await sleep(500);
      live.restarted = a.debugStats()?.state;
      a.stop();
    } catch (err) {
      errors.push('live: ' + String(err));
    }
    res.live = live;
  }
  res.errors = errors;
  log(JSON.stringify(res, null, 1));
  (window as unknown as { __result: unknown }).__result = res;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

document.getElementById('run')!.onclick = () => void run();
let ear: AmbientAudio | null = null;
document.getElementById('listen')!.onclick = () => {
  ear ??= new AmbientAudio();
  ear.start();
  const r = rng(5);
  let n = 0;
  const iv = setInterval(() => {
    ear!.hit(randomHit(r, false));
    if (++n > 400) clearInterval(iv);
  }, 50);
};
document.getElementById('fin')!.onclick = () => {
  ear ??= new AmbientAudio();
  ear.start();
  ear.finale();
};
out.textContent = 'ready';
if (location.search.includes('auto')) void run();
