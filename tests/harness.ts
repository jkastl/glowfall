import { COLUMN_W, PORT_X0, PORT_X1, MARBLE_R, STEP_DT } from '../src/engine/constants';
import { Simulation } from '../src/engine/sim';
import type { PartDef } from '../src/engine/types';

export interface PartReport {
  id: string;
  spawned: number;
  exited: number;
  badExits: number; // exited outside the port window
  rescues: number;
  nudges: number;
  medianTransit: number;
  maxTransit: number;
  ok: boolean;
  notes: string[];
}

/**
 * Drop `count` marbles into a single part (no hopper/collector) with a variety of
 * entry positions/speeds, and check they all leave through the bottom port.
 */
export function testPart(def: PartDef, opts: { count?: number; timeout?: number; seed?: number; gravity?: number; bounce?: number } = {}): PartReport {
  const count = opts.count ?? 24;
  const timeout = opts.timeout ?? 120;
  const sim = new Simulation([{ item: { uid: 'u0', partId: def.id }, def }], { bare: true, seed: opts.seed ?? 7, gravity: opts.gravity, bounce: opts.bounce });
  sim.started = false; // we spawn manually
  let rs = (opts.seed ?? 7) * 9973;
  const rnd = () => ((rs = (rs * 16807) % 2147483647) / 2147483647);
  const H = def.height;
  const notes: string[] = [];
  const entered = new Map<number, number>();
  const transit: number[] = [];
  let spawned = 0;
  let exited = 0;
  let badExits = 0;
  let nextSpawn = 0;
  const done = new Set<number>();

  while (sim.t < timeout) {
    if (spawned < count && sim.t >= nextSpawn) {
      // Mix of gentle and fast entries, as produced by real upstream parts.
      const x = PORT_X0 + MARBLE_R + rnd() * (PORT_X1 - PORT_X0 - 2 * MARBLE_R);
      // Upstream parts feel the same gravity, so arrival speeds scale with sqrt(g).
      const gs = Math.sqrt(opts.gravity ?? 1);
      const vy = (rnd() < 0.5 ? rnd() * 2 : 4 + rnd() * 9) * gs;
      const vx = (rnd() - 0.5) * 2.5 * gs;
      const m = sim.spawnAt(x, -MARBLE_R - 0.05, vx, vy, spawned % 5);
      entered.set(m.id, sim.t);
      spawned++;
      // bursts sometimes: marbles can arrive bunched up
      nextSpawn = sim.t + (rnd() < 0.3 ? 0.15 : 0.4 + rnd() * 0.8);
    }
    sim.step(STEP_DT);
    for (const m of sim.marbles) {
      if (done.has(m.id)) continue;
      const p = m.body.getPosition();
      if (p.y > H + MARBLE_R) {
        done.add(m.id);
        exited++;
        transit.push(sim.t - entered.get(m.id)!);
        if (p.x < PORT_X0 - 0.15 || p.x > PORT_X1 + 0.15) {
          badExits++;
          if (badExits <= 3) notes.push(`marble exited at x=${p.x.toFixed(2)} (port is ${PORT_X0}–${PORT_X1})`);
        }
        // park it far away so it doesn't interfere
        m.body.setPosition({ x: COLUMN_W / 2, y: H + 500 + m.id });
        m.body.setLinearVelocity({ x: 0, y: 0 });
        m.body.setType('static');
        m.collected = true;
      }
    }
    if (exited === count) break;
  }
  const nudges = sim.marbles.reduce((s, m) => s + m.nudges, 0);
  transit.sort((a, b) => a - b);
  if (exited < count) {
    const stuck = sim.marbles.filter((m) => !done.has(m.id)).slice(0, 4);
    for (const m of stuck) {
      const p = m.body.getPosition();
      notes.push(`marble ${m.id} never exited, last at (${p.x.toFixed(2)}, ${p.y.toFixed(2)})`);
    }
  }
  for (const r of sim.rescueLog.slice(0, 4)) {
    notes.push(`rescue (${r.reason}) at local (${r.x.toFixed(2)}, ${r.y.toFixed(2)}) t=${r.t.toFixed(1)}s`);
  }
  const medianTransit = transit[Math.floor(transit.length / 2)] ?? NaN;
  const maxTransit = transit[transit.length - 1] ?? NaN;
  const ok = exited === count && badExits === 0 && sim.rescues === 0;
  return { id: def.id, spawned, exited, badExits, rescues: sim.rescues, nudges, medianTransit, maxTransit, ok, notes };
}

export function formatReport(r: PartReport) {
  return (
    `${r.ok ? 'PASS' : 'FAIL'} ${r.id.padEnd(16)} exited ${r.exited}/${r.spawned}  bad=${r.badExits}  rescues=${r.rescues}  nudges=${r.nudges}  ` +
    `transit median=${r.medianTransit.toFixed(1)}s max=${r.maxTransit.toFixed(1)}s` +
    (r.notes.length ? '\n    ' + r.notes.join('\n    ') : '')
  );
}
