import { Box, Vec2 } from 'planck';
import type { Marble, PartDef } from '../engine/types';
import { glowPath, sampleTube, segmentedWall, smooth } from './lib/routing';

const H = 18;
const PIV_Y = 2.7; // plank pivot (local)
const PLANK_HW = 1.05;
const TILT = 0.52;
const Y_MOUTH = 3.5;
const Y_END = 13.6;
const HALF = 0.65;

const span = Y_END - Y_MOUTH;
const U = (y: number) => (y - Y_MOUTH) / span;
/** Warm lane: one wide, lazy bulge to the left, drawn in amber -> rose. */
const warmX = (y: number) => {
  const u = U(y);
  return 3.75 - 1.55 * Math.sin(Math.PI * u) - 0.45 * Math.sin(3 * Math.PI * u) - 0.35 * u;
};
/** Cool lane: a full S-wave to the right, drawn in cyan -> violet. */
const coolX = (y: number) => {
  const u = U(y);
  return 6.25 + 1.45 * Math.sin(2 * Math.PI * u) * smooth(u * 4 + 0.15) + 0.3 * u;
};
const mouthHW = (y: number) => HALF + 0.55 * Math.pow(Math.max(0, 1 - (y - Y_MOUTH) / 1.4), 2);

const colorSorter: PartDef = {
  id: 'color-sorter',
  name: 'Color Sorter',
  blurb: 'A little gate reads each marble: warm one way, cool the other.',
  height: H,
  build(ctx) {
    const glass = { friction: 0.04, restitution: 0.15 };

    // ---- lanes
    const warm = sampleTube(warmX, Y_MOUTH, Y_END, mouthHW, 80);
    const cool = sampleTube(coolX, Y_MOUTH, Y_END, mouthHW, 80);
    const warmHue = (u: number) => 42 - 75 * u; // amber -> rose
    const coolHue = (u: number) => 186 + 85 * u; // cyan -> violet
    const wN = [0, 2, 3, 5, 7, 9];
    const cN = [1, 4, 6, 8, 10, 12];
    segmentedWall(ctx, warm.left, 6, (u, i) => ({ hue: warmHue(u), base: 0.5, width: 0.07, note: wN[i] - 3 }), glass);
    segmentedWall(ctx, warm.right, 6, (u, i) => ({ hue: warmHue(u), base: 0.5, width: 0.07, note: wN[(i + 3) % 6] - 3 }), glass);
    segmentedWall(ctx, cool.left, 6, (u, i) => ({ hue: coolHue(u), base: 0.5, width: 0.07, note: cN[i] - 3 }), glass);
    segmentedWall(ctx, cool.right, 6, (u, i) => ({ hue: coolHue(u), base: 0.5, width: 0.07, note: cN[(i + 2) % 6] - 3 }), glass);

    // a roof over the divider between the two mouths (a tiny peak: nothing can rest on it)
    ctx.wall([[warm.right[0][0] - 0.02, Y_MOUTH], [5, Y_MOUTH - 0.55], [cool.left[0][0] + 0.02, Y_MOUTH]], { hue: 260, base: 0.4 }, glass);

    // ---- the gate: a kinematic plank balanced on a pivot
    const plank = ctx.body('kinematic', 5, PIV_Y);
    const pf = plank.createFixture(new Box(PLANK_HW, 0.07, Vec2(0, 0), 0), { friction: 0.04, restitution: 0.1, density: 1 });
    ctx.styleFixture(pf, { kind: 'solid', hue: 260, base: 0.7, note: 7, width: 0.1 });
    const pdata = pf.getUserData() as { style: { hue: number } };
    // (jewel at the pivot, so the plank reads as a flipper)
    const jewel = plank.createFixture(new Box(0.12, 0.12, Vec2(0, 0), Math.PI / 4), { density: 1, friction: 0.04, restitution: 0.1 });
    ctx.styleFixture(jewel, { kind: 'solid', hue: 260, base: 0.8 });

    // ---- the sensor: marbles between the read-line and just below the plank
    const queue: Marble[] = [];
    ctx.sensor(
      { x0: 3.5, y0: 0.4, x1: 6.5, y1: PIV_Y + 1.3 },
      (m) => {
        if (!queue.includes(m)) queue.push(m);
      },
      (m) => {
        const i = queue.indexOf(m);
        if (i >= 0) queue.splice(i, 1);
      },
    );

    let target = TILT; // positive angle (clockwise on screen) = right end low = marbles go right (cool)
    const yPast = ctx.originY + PIV_Y + 0.62;
    ctx.onUpdate((dt) => {
      // Decide for the marble nearest above the plank that hasn't committed to it yet.
      let best: Marble | null = null;
      let bestY = -1e9;
      for (let i = 0; i < queue.length; i++) {
        const y = queue[i].body.getPosition().y;
        if (y < yPast && y > bestY) {
          bestY = y;
          best = queue[i];
        }
      }
      if (best) target = best.group === 'warm' ? -TILT : TILT;
      const a = plank.getAngle();
      const w = Math.max(-11, Math.min(11, (target - a) * 22));
      plank.setAngularVelocity(w);
      pdata.style.hue = target < 0 ? 40 : 195;
      void dt;
    });

    // ---- back together
    ctx.funnelToOutlet(Y_END + 0.4, { hue: 270, base: 0.4 });

    ctx.onDraw((g, t) => {
      glowPath(g, warm.center, HALF * 2, 'hsla(25,90%,60%,0.05)');
      glowPath(g, cool.center, HALF * 2, 'hsla(200,90%,60%,0.05)');
      // soft read-line
      const a = 0.12 + 0.05 * Math.sin(t * 1.5);
      const grad = g.createLinearGradient(3.6, 0, 6.4, 0);
      grad.addColorStop(0, `hsla(40,90%,65%,${a})`);
      grad.addColorStop(1, `hsla(195,90%,65%,${a})`);
      g.fillStyle = grad;
      g.fillRect(3.6, 0.78, 2.8, 0.035);
    });
  },
};

export default colorSorter;
