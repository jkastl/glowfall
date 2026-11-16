import { describe, expect, it } from 'vitest';
import { STEP_DT } from '../src/engine/constants';
import { Simulation } from '../src/engine/sim';
import { PART_MAP, PARTS } from '../src/parts';
import { PRESETS, type PresetFeel } from '../src/tracks/presets';
import { lapsOf } from './harness';

function runTrack(ids: string[], seed: number, limit = 600, feel: Partial<PresetFeel> = {}) {
  const track = ids.filter((id) => PART_MAP.has(id)).map((id, i) => ({ item: { uid: `t${i}`, partId: id }, def: PART_MAP.get(id)! }));
  const sim = new Simulation(track, { marbleCount: 30, seed, gravity: feel.gravity, bounce: feel.bounce, loop: feel.loop });
  sim.start();
  // A looping run never finishes: run until every marble has come round twice.
  const done = () => (sim.loop ? sim.marbles.length === 30 && lapsOf(sim).every((n) => n >= 2) : sim.finished);
  while (!done() && sim.t < limit) sim.step(STEP_DT);
  return sim;
}

describe('full tracks run to completion', () => {
  for (const p of PRESETS) {
    it(`preset: ${p.name}, with its own feel`, () => {
      const sim = runTrack(p.parts, 99, 900, p.feel);
      if (p.feel.loop) {
        const laps = lapsOf(sim);
        console.log(`${p.name}: endless, t=${sim.t.toFixed(1)}s laps min=${Math.min(...laps)} rescues=${sim.rescues}`);
        expect(laps.length).toBe(30);
        expect(Math.min(...laps)).toBeGreaterThanOrEqual(2);
      } else {
        console.log(`${p.name}: finished=${sim.finished} t=${sim.t.toFixed(1)}s collected=${sim.collectedCount()}/30 rescues=${sim.rescues}`);
        expect(sim.finished).toBe(true);
      }
      expect(sim.rescues).toBeLessThanOrEqual(2);
    });
    it(`preset: ${p.name}, as designed`, () => {
      const sim = runTrack(p.parts, 7);
      expect(sim.finished).toBe(true);
      expect(sim.rescues).toBeLessThanOrEqual(2);
    });
  }
  it('every part back-to-back', () => {
    const ids = PARTS.filter((p) => !p.hidden).map((p) => p.id);
    const sim = runTrack(ids, 5, 900);
    console.log(`all parts (${ids.length}): finished=${sim.finished} t=${sim.t.toFixed(1)}s rescues=${sim.rescues}`);
    expect(sim.finished).toBe(true);
    expect(sim.rescues).toBeLessThanOrEqual(3);
  });
});
