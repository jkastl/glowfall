import type { PartDef } from '../engine/types';

/** Sample a gently curved ramp from (x0,y0) to (x1,y1) with a soft upturned lip at the start. */
function ramp(x0: number, y0: number, x1: number, y1: number, n = 14): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const x = x0 + (x1 - x0) * u;
    // ease so the ramp starts steeper and flattens out → marbles glide rather than slam
    const e = Math.sin((u * Math.PI) / 2);
    const y = y0 + (y1 - y0) * (0.35 * u + 0.65 * e);
    pts.push([x, y]);
  }
  // little back-lip so marbles landing near the start don't roll backwards out
  pts.unshift([x0 - Math.sign(x1 - x0) * 0.15, y0 - 0.5]);
  return pts;
}

/**
 * REFERENCE PART — a good template for new parts.
 * Marbles enter top-center, zig-zag down four soft ramps, then funnel to the outlet.
 */
const switchback: PartDef = {
  id: 'switchback',
  name: 'Switchback',
  blurb: 'Lazy zig-zag ramps. The classic.',
  height: 15,
  build(ctx) {
    const { W } = ctx;
    // Each ramp catches marbles falling off the end of the one above.
    ctx.wall(ramp(1.6, 1.4, W - 1.3, 2.9), { note: 0 });
    ctx.wall(ramp(W - 0.1, 4.0, 1.3, 5.6), { note: 2 });
    ctx.wall(ramp(0.1, 6.7, W - 1.3, 8.2), { note: 4 });
    ctx.wall(ramp(W - 0.1, 9.3, 1.6, 10.9), { note: 5 });
    // Funnel from below the last ramp down into the outlet port.
    ctx.funnelToOutlet(11.4, { base: 0.4 });
  },
};

export default switchback;
