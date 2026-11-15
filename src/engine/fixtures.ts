import { COLUMN_W, HOPPER_HEIGHT, PORT_CENTER, PORT_X0, PORT_X1 } from './constants';
import type { PartDef } from './types';

/** The source at the very top. Marbles are spawned by the Simulation just above y = 0. */
export const hopper: PartDef = {
  id: '__hopper',
  name: 'Source',
  blurb: 'Where the light begins.',
  height: HOPPER_HEIGHT,
  hidden: true,
  build(ctx) {
    // Gentle guides that keep freshly spawned marbles inside the port window.
    ctx.wall([[PORT_X0 - 0.9, 0.4], [PORT_X0, 2.6], [PORT_X0, ctx.H]], { base: 0.35 });
    ctx.wall([[PORT_X1 + 0.9, 0.4], [PORT_X1, 2.6], [PORT_X1, ctx.H]], { base: 0.35 });
    ctx.onDraw((g, t) => {
      // A slowly breathing orb of light.
      const pulse = 0.75 + 0.25 * Math.sin(t * 0.9);
      const grad = g.createRadialGradient(PORT_CENTER, -0.6, 0, PORT_CENTER, -0.6, 2.6);
      grad.addColorStop(0, `hsla(${ctx.hue}, 100%, 80%, ${0.55 * pulse})`);
      grad.addColorStop(0.35, `hsla(${ctx.hue}, 100%, 60%, ${0.18 * pulse})`);
      grad.addColorStop(1, `hsla(${ctx.hue}, 100%, 50%, 0)`);
      g.fillStyle = grad;
      g.beginPath();
      g.arc(PORT_CENTER, -0.6, 2.6, 0, Math.PI * 2);
      g.fill();
    });
  },
};

/** The bowl at the bottom. Marbles that enter it are "collected". */
export const collector: PartDef = {
  id: '__collector',
  name: 'Pool',
  blurb: 'Where the light rests.',
  height: 8,
  hidden: true,
  build(ctx) {
    const W = COLUMN_W;
    const H = ctx.H;
    // Wide bowl: steep sides, broad gently curved floor.
    const pts: [number, number][] = [];
    const n = 28;
    for (let i = 0; i <= n; i++) {
      const u = i / n; // 0..1 across
      const x = 0.15 + u * (W - 0.3);
      const k = Math.abs(u - 0.5) * 2; // 0 at center, 1 at edges
      const y = H - 0.5 - (Math.pow(k, 4) * 4.8 + k * k * 0.5);
      pts.push([x, y]);
    }
    ctx.wall([[0.15, 1.2], ...pts, [W - 0.15, 1.2]], { base: 0.5, note: -5 });
    ctx.sensor({ x0: 0.2, y0: 2.2, x1: W - 0.2, y1: H }, (m) => {
      m.collected = true;
    });
  },
};
