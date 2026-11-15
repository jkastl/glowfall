import { useMemo } from 'react';
import { Simulation } from '../engine/sim';
import { PART_MAP } from '../parts';
import { Stage } from './Stage';

/**
 * Dev preview: /?solo=<partId>[&marbles=20][&t=8][&paused=1]
 * Runs one part between the source and the pool. `t` fast-forwards the sim (for screenshots).
 */
export function Solo() {
  const q = new URLSearchParams(location.search);
  const id = q.get('solo')!;
  const def = PART_MAP.get(id);
  const sim = useMemo(() => {
    if (!def) return null;
    const ids = (q.get('chain') ?? id).split(',');
    const s = new Simulation(
      ids.map((pid, i) => ({ item: { uid: `s${i}`, partId: pid }, def: PART_MAP.get(pid)! })).filter((x) => x.def),
      { marbleCount: Number(q.get('marbles') ?? 20) },
    );
    s.start();
    const ff = Number(q.get('t') ?? 0);
    while (s.t < ff) s.step(1 / 120);
    (window as unknown as { sim: Simulation }).sim = s;
    return s;
  }, []);
  if (!def || !sim) return <div style={{ color: '#fff', padding: 20 }}>Unknown part “{id}”. Known: {[...PART_MAP.keys()].join(', ')}</div>;
  return (
    <div className="app solo">
      <Stage sim={sim} running={q.get('paused') !== '1'} editing={false} />
    </div>
  );
}
