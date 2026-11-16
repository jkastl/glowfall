import { describe, expect, it } from 'vitest';
import { STEP_DT } from '../src/engine/constants';
import { Simulation } from '../src/engine/sim';
import { PARTS, PART_MAP } from '../src/parts';

// Every part must receive a calm, near-vertical marble whatever sits above it. Parts hand over at
// 5–7 u/s sideways on their own; the connector between parts (fixtures.ts `port`) gathers that up.
// Without it, marbles flew straight past the next part's mechanism (Plinko, the Color Sorter).
describe('calm hand-over between parts', () => {
  for (const up of PARTS.filter((p) => !p.hidden).map((p) => p.id)) {
    it(`after ${up}`, () => {
      const track = [up, 'serpentine'].map((id, i) => ({ item: { uid: `t${i}`, partId: id }, def: PART_MAP.get(id)! }));
      const sim = new Simulation(track, { marbleCount: 20, seed: 2 });
      const next = sim.parts.find((p) => p.uid === 't1')!;
      const vx: number[] = [];
      const seen = new Set<number>();
      sim.start();
      while (!sim.finished && sim.t < 200) {
        sim.step(STEP_DT);
        for (const m of sim.marbles) {
          if (seen.has(m.id) || m.body.getPosition().y <= next.originY) continue;
          seen.add(m.id);
          vx.push(Math.abs(m.body.getLinearVelocity().x));
        }
      }
      vx.sort((a, b) => a - b);
      const med = vx[vx.length >> 1];
      const p90 = vx[Math.floor((vx.length - 1) * 0.9)];
      console.log(`${up} → next part: |vx| median ${med.toFixed(2)}, p90 ${p90.toFixed(2)}`);
      expect(sim.finished).toBe(true);
      expect(vx.length).toBe(20);
      expect(med).toBeLessThan(0.8);
      expect(p90).toBeLessThan(2.5);
    });
  }
});
