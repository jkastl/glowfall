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

export const PORT_HEIGHT = 1.8;
const PORT_MOUTH_HALF = 1.9; // wider than the port window, so fast arrivals near its edge are caught
const PORT_SLOT_HALF = 0.4; // marble radius 0.25
const PORT_SLOT_Y = 1.25;

/**
 * The standard connector between two parts, like the ports between Great Ball Contraption
 * modules. Parts hand marbles over at very different speeds; many send them out fast and sideways
 * (5–7 u/s), and the next part's design can't count on catching that. The connector gathers each
 * marble into a short vertical slot of calm, low-bounce glass, so every part receives a gentle,
 * near-vertical arrival whatever sits above it.
 */
export const port: PartDef = {
  id: '__port',
  name: 'Port',
  blurb: 'Where one part hands over to the next.',
  height: PORT_HEIGHT,
  hidden: true,
  build(ctx) {
    const side = (dir: -1 | 1): [number, number][] => {
      const pts: [number, number][] = [];
      for (let i = 0; i <= 14; i++) {
        const u = i / 14;
        const e = u * u * (3 - 2 * u);
        pts.push([PORT_CENTER + dir * (PORT_MOUTH_HALF + (PORT_SLOT_HALF - PORT_MOUTH_HALF) * e), u * PORT_SLOT_Y]);
      }
      pts.push([PORT_CENTER + dir * PORT_SLOT_HALF, ctx.H]);
      return pts;
    };
    const glass = { restitution: 0.04, friction: 0.06, calm: true };
    ctx.wall(side(-1), { base: 0.32, width: 0.06, note: 4 }, glass);
    ctx.wall(side(1), { base: 0.32, width: 0.06, note: 7 }, glass);
  },
};
