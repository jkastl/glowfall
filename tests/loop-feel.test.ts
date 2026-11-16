import { describe, expect, it } from 'vitest';
import { STEP_DT } from '../src/engine/constants';
import { BOUNCE_RANGE, GRAVITY_RANGE } from '../src/engine/sim';
import { PRESETS } from '../src/tracks/presets';
import { lapsOf, loopSim } from './harness';

// Endless mode at the four corners of the gravity / bounce range: every starter track must keep
// all its marbles going round, with the anti-jam stepping in only rarely. (The long soak at 1× is
// tests/loop.test.ts.)
const MARBLES = 30;
const only = process.env.SOAK;

describe('loop mode at the extremes', () => {
  const CORNERS = [
    { gravity: GRAVITY_RANGE.min, bounce: BOUNCE_RANGE.min },
    { gravity: GRAVITY_RANGE.min, bounce: BOUNCE_RANGE.max },
    { gravity: GRAVITY_RANGE.max, bounce: BOUNCE_RANGE.min },
    { gravity: GRAVITY_RANGE.max, bounce: BOUNCE_RANGE.max },
  ];
  const LAPS = 3;
  for (const p of PRESETS.filter((x) => !only || x.id === only)) {
    it(p.name, { timeout: 600000 }, () => {
      for (const c of CORNERS) {
        const sim = loopSim(p.parts, { seed: 5, ...c });
        while (sim.spawned < MARBLES) sim.step(STEP_DT);
        const bodies = sim.world.getBodyCount();
        // Long enough for three trips even drifting at 0.3× gravity through the longest track.
        while (sim.t < 1500 && Math.min(...lapsOf(sim)) < LAPS) for (let i = 0; i < 120; i++) sim.step(STEP_DT);
        const total = sim.totalLaps();
        console.log(
          `${p.name} g=${c.gravity} b=${c.bounce}: every marble did ${LAPS} laps by t=${sim.t.toFixed(0)}s  total ${total}  rescues ${sim.rescues}` +
            (sim.rescues ? '  ' + sim.rescueLog.map((r) => `${r.part}/${r.reason}`).join(' ') : ''),
        );
        expect(Math.min(...lapsOf(sim)), `${p.name} g=${c.gravity} b=${c.bounce}`).toBeGreaterThanOrEqual(LAPS);
        expect(sim.world.getBodyCount()).toBe(bodies);
        expect(sim.rescues / total, `${p.name} g=${c.gravity} b=${c.bounce}`).toBeLessThanOrEqual(0.03);
      }
    });
  }
});
