import { describe, expect, it } from 'vitest';
import { STEP_DT } from '../src/engine/constants';
import { Simulation } from '../src/engine/sim';
import { PART_MAP, PARTS } from '../src/parts';
import { PRESETS } from '../src/tracks/presets';

function runTrack(ids: string[], seed: number, limit = 600) {
  const track = ids.filter((id) => PART_MAP.has(id)).map((id, i) => ({ item: { uid: `t${i}`, partId: id }, def: PART_MAP.get(id)! }));
  const sim = new Simulation(track, { marbleCount: 30, seed });
  sim.start();
  while (!sim.finished && sim.t < limit) sim.step(STEP_DT);
  return sim;
}

describe('full tracks run to completion', () => {
  for (const p of PRESETS) {
    it(`preset: ${p.name}`, () => {
      const sim = runTrack(p.parts, 99);
      console.log(`${p.name}: finished=${sim.finished} t=${sim.t.toFixed(1)}s collected=${sim.collectedCount()}/30 rescues=${sim.rescues}`);
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
