import { Circle } from 'planck';
import { describe, expect, it } from 'vitest';
import { fixtureData } from '../src/engine/build';
import { STEP_DT } from '../src/engine/constants';
import { Simulation } from '../src/engine/sim';
import { PART_MAP } from '../src/parts';

// Regression: the Switchback hands marbles over fast and sideways, along the peg lattice's
// diagonal, and they used to thread the whole Plinko field without touching a peg.
describe('plinko engages every marble', () => {
  for (const before of ['switchback', 'wave-slide', 'splitter-comb']) {
    it(`after ${before}`, () => {
      const ids = [before, 'plinko'];
      const track = ids.map((id, i) => ({ item: { uid: `t${i}`, partId: id }, def: PART_MAP.get(id)! }));
      const sim = new Simulation(track, { marbleCount: 30, seed: 1 });
      const plIndex = sim.parts.findIndex((p) => p.def.id === 'plinko');
      const hits = new Map<number, number>();
      sim.world.on('begin-contact', (c) => {
        for (const [a, b] of [[c.getFixtureA(), c.getFixtureB()], [c.getFixtureB(), c.getFixtureA()]]) {
          const m = fixtureData(a)?.marble;
          const d = fixtureData(b);
          if (m && d?.partIndex === plIndex && !d.sensor && b.getShape() instanceof Circle) hits.set(m.id, (hits.get(m.id) ?? 0) + 1);
        }
      });
      sim.start();
      while (!sim.finished && sim.t < 300) sim.step(STEP_DT);
      const counts = sim.marbles.map((m) => hits.get(m.id) ?? 0);
      const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
      console.log(`${before} → plinko: misses=${counts.filter((c) => c === 0).length}/30 avg pegs=${avg.toFixed(1)}`);
      expect(sim.finished).toBe(true);
      expect(counts.filter((c) => c === 0).length).toBe(0);
      expect(avg).toBeGreaterThanOrEqual(2.5);
    });
  }
});
