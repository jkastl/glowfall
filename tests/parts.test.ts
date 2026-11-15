import { describe, expect, it } from 'vitest';
import { PARTS } from '../src/parts';
import { formatReport, testPart } from './harness';

// Filter with: PART=switchback npx vitest run tests/parts.test.ts
const only = process.env.PART;

describe('every part honours the port contract', () => {
  for (const def of PARTS.filter((p) => !only || p.id === only)) {
    it(def.id, () => {
      const reports = [1, 2].map((seed) => testPart(def, { seed }));
      for (const r of reports) console.log(formatReport(r));
      for (const r of reports) {
        expect(r.exited, `${def.id}: all marbles must exit`).toBe(r.spawned);
        expect(r.badExits, `${def.id}: exits must be inside the port window`).toBe(0);
        expect(r.rescues, `${def.id}: no anti-jam rescues allowed`).toBe(0);
        expect(r.medianTransit, `${def.id}: median transit should be < 25s`).toBeLessThan(25);
      }
    });
  }
});
