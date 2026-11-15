import { describe, expect, it } from 'vitest';
import { STEP_DT } from '../src/engine/constants';
import { BOUNCE_RANGE, GRAVITY_RANGE, Simulation } from '../src/engine/sim';
import { PART_MAP, PARTS } from '../src/parts';
import { PRESETS } from '../src/tracks/presets';
import { formatReport, testPart } from './harness';

// The gravity / bounce sliders must never break a track: at every corner of the range each
// preset still finishes, with the anti-jam stepping in only rarely.
const CORNERS = [
  { gravity: GRAVITY_RANGE.min, bounce: BOUNCE_RANGE.min },
  { gravity: GRAVITY_RANGE.min, bounce: BOUNCE_RANGE.max },
  { gravity: GRAVITY_RANGE.max, bounce: BOUNCE_RANGE.min },
  { gravity: GRAVITY_RANGE.max, bounce: BOUNCE_RANGE.max },
];
const only = process.env.PART;

describe('parts at the extremes (diagnostic)', () => {
  for (const def of PARTS.filter((p) => !p.hidden && (!only || p.id === only))) {
    it(def.id, () => {
      for (const c of CORNERS) {
        const r = testPart(def, { seed: 1, timeout: 200, ...c });
        console.log(`g=${c.gravity} b=${c.bounce}  ${formatReport(r)}`);
        expect(r.exited, `${def.id} g=${c.gravity} b=${c.bounce}`).toBe(r.spawned);
        expect(r.badExits, `${def.id} g=${c.gravity} b=${c.bounce}`).toBe(0);
        expect(r.rescues, `${def.id} g=${c.gravity} b=${c.bounce}`).toBeLessThanOrEqual(1);
      }
    });
  }
});

describe('presets at the extremes', () => {
  for (const p of only ? [] : PRESETS) {
    it(p.name, () => {
      for (const c of CORNERS) {
        const track = p.parts.filter((id) => PART_MAP.has(id)).map((id, i) => ({ item: { uid: `t${i}`, partId: id }, def: PART_MAP.get(id)! }));
        const sim = new Simulation(track, { marbleCount: 30, seed: 3, ...c });
        sim.start();
        while (!sim.finished && sim.t < 1200) sim.step(STEP_DT);
        console.log(`${p.name} g=${c.gravity} b=${c.bounce}: finished=${sim.finished} t=${sim.t.toFixed(1)}s rescues=${sim.rescues}`);
        expect(sim.finished).toBe(true);
        expect(sim.rescues).toBeLessThanOrEqual(2);
      }
    });
  }
});
