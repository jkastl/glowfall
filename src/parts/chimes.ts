import { Box, Circle, Polygon, RevoluteJoint, Vec2 } from 'planck';
import type { BuildContext, PartDef } from '../engine/types';
import type { Pt } from './lib/routing';

const H = 18;

/** One hanging chime bar: thin dynamic box on a pivot at its top, with a peaked cap so nothing can rest on it. */
function chime(ctx: BuildContext, x: number, y: number, len: number, note: number, hue: number, limit = 0.7) {
  const b = ctx.body('dynamic', x, y);
  b.setAngularDamping(1.6);
  const bar = b.createFixture(new Box(0.075, len / 2, Vec2(0, len / 2 + 0.05), 0), { density: 0.9, friction: 0.05, restitution: 0.3 });
  ctx.styleFixture(bar, { kind: 'solid', hue, base: 0.6, note });
  const cap = b.createFixture(new Polygon([Vec2(-0.2, 0.08), Vec2(0, -0.17), Vec2(0.2, 0.08)]), { density: 0.4, friction: 0.05, restitution: 0.2 });
  // Physics keeps the peaked cap (nothing can rest on it); visually it's a round pivot jewel.
  ctx.styleFixture(cap, { kind: 'hidden', note });
  const jewel = b.createFixture(new Circle(Vec2(0, 0), 0.13), { density: 0.4, filterMaskBits: 0 });
  ctx.styleFixture(jewel, { kind: 'peg', hue, base: 0.8, note });
  ctx.world.createJoint(
    new RevoluteJoint({ enableLimit: true, lowerAngle: -limit, upperAngle: limit }, ctx.ground, b, ctx.v(x, y)),
  );
  return b;
}

/** A short curved deflector bar. dir = +1 slopes down to the right. */
function deflector(ctx: BuildContext, x: number, y: number, len: number, dir: 1 | -1, note: number, hue: number) {
  const pts: Pt[] = [];
  for (let i = 0; i <= 8; i++) {
    const u = i / 8;
    pts.push([x + dir * (u - 0.5) * len, y + (Math.pow(u, 1.5) - 0.4) * len * 0.5]);
  }
  ctx.wall(pts, { hue, base: 0.55, note, width: 0.09 }, { friction: 0.05, restitution: 0.2 });
}

const chimes: PartDef = {
  id: 'chimes',
  name: 'Wind Chimes',
  blurb: 'Marbles brush past hanging bars that ring like glass.',
  height: H,
  build(ctx) {
    const pivots: { x: number; y: number }[] = [];
    const hang = (x: number, y: number, len: number, note: number, hue: number) => {
      pivots.push({ x, y });
      chime(ctx, x, y, len, note, hue);
    };
    // row A
    ctx.wall([[4.05, 2.0], [4.5, 1.45], [4.93, 1.05], [5.1, 1.1], [5.55, 1.5], [6.0, 2.0]], { hue: 200, base: 0.55, note: 0, width: 0.09 }, { friction: 0.05, restitution: 0.2 });
    hang(3.3, 1.8, 1.9, 5, 175);
    hang(6.7, 1.8, 1.5, 6, 190);
    // row B
    hang(1.9, 5.4, 1.7, 3, 205);
    hang(5.0, 5.2, 2.1, 2, 220);
    hang(8.1, 5.4, 1.5, 4, 235);
    deflector(ctx, 3.4, 7.6, 1.5, 1, 1, 250);
    deflector(ctx, 6.6, 7.6, 1.5, -1, 1, 250);
    // row C
    hang(2.4, 9.8, 1.4, 4, 265);
    hang(5.0, 9.4, 1.9, 1, 280);
    hang(7.6, 9.8, 1.6, 5, 295);
    deflector(ctx, 3.9, 12.2, 1.4, 1, 0, 310);
    deflector(ctx, 6.1, 12.2, 1.4, -1, 0, 310);

    ctx.funnelToOutlet(13.2, { hue: 215, base: 0.4 });

    // pivot studs + a faint hanging thread, purely decorative
    ctx.onDraw((g, t) => {
      for (let i = 0; i < pivots.length; i++) {
        const p = pivots[i];
        const a = 0.35 + 0.1 * Math.sin(t * 0.8 + i);
        g.fillStyle = `hsla(${190 + i * 8},80%,70%,${a})`;
        g.beginPath();
        g.arc(p.x, p.y, 0.07, 0, Math.PI * 2);
        g.fill();
      }
    });
  },
};

export default chimes;
