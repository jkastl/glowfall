import { describe, expect, it } from 'vitest';
import { STEP_DT } from '../src/engine/constants';
import type { Simulation } from '../src/engine/sim';
import { PRESETS } from '../src/tracks/presets';
import { lapsOf, loopSim } from './harness';

// Endless mode has to run for hours as a screensaver. These soak tests run every starter track
// headless in loop mode and check that the marbles keep circulating and that nothing grows:
// not the physics world, not the logs, not the heap.
//   SOAK=first-light npx vitest run tests/loop.test.ts     one preset only
//   SOAK_MIN=120 ...                                       a longer long run (simulated minutes)
// The gravity / bounce extremes are in tests/loop-feel.test.ts (a separate file, so they run in parallel).
const MARBLES = 30;
const LONG_ID = 'first-light';
const LONG_MIN = Number(process.env.SOAK_MIN ?? 30);
const SHORT_MIN = 4;
const only = process.env.SOAK;
const gc = (globalThis as { gc?: () => void }).gc;

function fixtureCount(sim: Simulation) {
  let n = 0;
  for (let b = sim.world.getBodyList(); b; b = b.getNext()) for (let f = b.getFixtureList(); f; f = f.getNext()) n++;
  return n;
}

const median = (a: number[]) => [...a].sort((x, y) => x - y)[a.length >> 1];

/** Run for `seconds` of simulated time, checking the invariants every 10 s. */
function soak(sim: Simulation, seconds: number) {
  const H = sim.totalHeight;
  while (sim.spawned < MARBLES) sim.step(STEP_DT);
  const bodies = sim.world.getBodyCount();
  const fixtures = fixtureCount(sim);
  const lastLaps = lapsOf(sim);
  const lastLapAt = lastLaps.map(() => sim.t);
  const heap: number[] = [];
  const contacts: number[] = [];
  let longestLap = 0;
  let nextCheck = sim.t;
  let nextHeap = sim.t + 60;

  while (sim.t < seconds) {
    sim.step(STEP_DT);
    if (sim.t < nextCheck) continue;
    nextCheck += 10;

    // The world is exactly as big as when it started.
    expect(sim.world.getBodyCount()).toBe(bodies);
    expect(fixtureCount(sim)).toBe(fixtures);
    contacts.push(sim.world.getContactCount());
    expect(sim.marbles.length).toBe(MARBLES);
    expect(sim.rescueLog.length).toBeLessThanOrEqual(200);
    expect(sim.finished).toBe(false);

    const laps = lapsOf(sim);
    sim.marbles.forEach((m, i) => {
      const p = m.body.getPosition();
      // Positions stay inside one period, whatever the lap count.
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
      expect(p.y).toBeLessThan(H + 1);
      expect(p.y).toBeGreaterThan(-20);
      expect(m.trail.length).toBeLessThanOrEqual(18);
      for (const q of m.trail) expect(Math.abs(q.y)).toBeLessThan(H + 30);
      expect(m.collected).toBe(false);
      if (laps[i] > lastLaps[i]) {
        longestLap = Math.max(longestLap, sim.t - lastLapAt[i]);
        lastLaps[i] = laps[i];
        lastLapAt[i] = sim.t;
      }
    });
    // Lap counts are kept relative to the slowest marble, and the camera target stays near the track.
    expect(Math.min(...sim.marbles.map((m) => m.laps))).toBe(0);
    expect(Math.abs(sim.focusY())).toBeLessThan(H * (Math.max(...sim.marbles.map((m) => m.laps)) + 2));

    if (sim.t >= nextHeap) {
      nextHeap += 60;
      gc?.();
      heap.push(process.memoryUsage().heapUsed / 1e6);
    }
  }
  // Nobody is still on a lap that has been going far longer than any finished one.
  const openLap = Math.max(...lastLapAt.map((at) => sim.t - at));
  return { laps: lapsOf(sim), longestLap, openLap, heap, contacts };
}

describe('loop mode soak', () => {
  for (const p of PRESETS.filter((x) => !only || x.id === only)) {
    const minutes = p.id === LONG_ID ? LONG_MIN : SHORT_MIN;
    it(`${p.name}: ${minutes} simulated minutes`, { timeout: 600000 }, () => {
      const sim = loopSim(p.parts, { seed: 3 });
      const t0 = Date.now();
      const r = soak(sim, minutes * 60);
      const total = sim.totalLaps();
      const lapTime = (minutes * 60) / median(r.laps);
      console.log(
        `${p.name}: ${minutes} min in ${((Date.now() - t0) / 1000).toFixed(0)}s  laps/marble ${Math.min(...r.laps)}–${Math.max(...r.laps)} (total ${total}, ~${lapTime.toFixed(0)}s each, longest ${r.longestLap.toFixed(0)}s)` +
          `  rescues ${sim.rescues} (${((sim.rescues / total) * 100).toFixed(2)} per 100 marble-laps)  contacts ${Math.min(...r.contacts)}–${Math.max(...r.contacts)}` +
          `  heap MB ${gc ? '' : '(no gc) '}${r.heap.map((h) => h.toFixed(1)).join(' ')}`,
      );

      // Everyone keeps circulating: several laps each, and no lap drags on.
      expect(Math.min(...r.laps)).toBeGreaterThanOrEqual(2);
      expect(r.longestLap).toBeLessThan(lapTime * 4);
      expect(r.openLap).toBeLessThan(lapTime * 4);
      // The anti-jam stays a rare exception.
      expect(sim.rescues / total).toBeLessThanOrEqual(0.02);
      // Contacts come and go but don't pile up.
      const half = r.contacts.length >> 1;
      expect(Math.max(...r.contacts.slice(half))).toBeLessThanOrEqual(Math.max(...r.contacts.slice(0, half)) * 1.5 + 20);

      // The heap plateaus: the last third of the run sits no higher than the first third (plus noise).
      if (gc && r.heap.length >= 6) {
        const third = Math.floor(r.heap.length / 3);
        const early = median(r.heap.slice(0, third));
        const late = median(r.heap.slice(-third));
        console.log(`${p.name}: heap early ${early.toFixed(1)} MB → late ${late.toFixed(1)} MB`);
        expect(late - early).toBeLessThan(3);
      }
    });
  }
});
