import type { PartDef } from '../engine/types';
import { sample, softFunnel } from './lib/flowgeo';

/**
 * Plinko: a widening, staggered field of glowing pegs. Marbles scatter into a
 * cascade; pegs are tuned left→right so the cascade sounds like rain on a xylophone.
 *
 * A small inlet funnel drops every marble straight down from a slot onto a lone top peg, like a
 * real Plinko board. Without it, a marble arriving fast and sideways (the Switchback hands over
 * at ~7 u/s) flies along the lattice diagonal and threads the whole field without touching a peg.
 */
const PITCH = 1.25; // horizontal peg spacing (gap ≈ 0.97 ≫ marble diameter 0.5)
const ROW = 1.05; // vertical row spacing (diagonal gap ≈ 0.94)
const PEG_R = 0.14;
const ROWS = [1, 2, 3, 4, 5, 6, 7, 6, 7];
const TOP = 2.1;
const SLOT_Y = 1.3; // bottom of the inlet funnel
const SLOT_HALF = 0.38; // slot half-width (marble radius 0.25)
const NIB_CLEAR = 0.72; // gap between a wall nib's tip and the nearest peg (marble diameter 0.5)
const MOUTH_HALF = 1.8; // wider than the port, so fast arrivals near its edge are still caught

const plinko: PartDef = {
  id: 'plinko',
  name: 'Plinko',
  blurb: 'A field of glowing pegs. Rain on a xylophone.',
  height: 15,
  build(ctx) {
    const { W } = ctx;
    // Inlet funnel: vertical at the mouth, sweeping in, vertical again at the slot.
    const inlet = (side: -1 | 1) =>
      sample((u) => {
        const e = u * u * (3 - 2 * u);
        const half = MOUTH_HALF + (SLOT_HALF - MOUTH_HALF) * e;
        return [W / 2 + side * half, u * SLOT_Y];
      }, 16);
    ctx.wall(inlet(-1), { base: 0.55, note: 0, width: 0.07 }, { restitution: 0.1, friction: 0.05 });
    ctx.wall(inlet(1), { base: 0.55, note: 2, width: 0.07 }, { restitution: 0.1, friction: 0.05 });

    const pegs: { x: number; y: number; hue: number }[] = [];
    ROWS.forEach((n, i) => {
      const y = TOP + i * ROW;
      const hue = ctx.hue + (i / (ROWS.length - 1)) * 80;
      for (let j = 0; j < n; j++) {
        const x = W / 2 + (j - (n - 1) / 2) * PITCH;
        // half-pitch column index 0..12 across the field → rising pentatonic run
        const col = Math.round((x - PITCH) / (PITCH / 2));
        ctx.circle(x, y, PEG_R, { hue, note: Math.round(col * 0.75), base: 0.75 }, { restitution: 0.3, friction: 0.05 });
        pegs.push({ x, y, hue });
      }
    });

    // Nibs on the column walls, one per row, like the half-pegs at the edge of a real Plinko
    // board: a marble sliding down a wall meets a short slanted ramp and is flicked back into the
    // field. Each tip keeps a marble-sized gap (plus margin) to the row's outermost peg.
    ROWS.forEach((n, i) => {
      if (i < 3) return; // the top of the field is narrow and far from the walls; nothing reaches them there
      const y = TOP + i * ROW;
      const outer = W / 2 - ((n - 1) / 2) * PITCH; // outermost peg on the left
      const tip = Math.min(1.1, outer - PEG_R - NIB_CLEAR);
      if (tip < 0.3) return;
      const hue = ctx.hue + (i / (ROWS.length - 1)) * 80;
      for (const side of [-1, 1] as const) {
        const wx = side < 0 ? 0 : W;
        const pts: [number, number][] = [
          [wx, y - tip * 0.9],
          [wx - side * tip, y],
        ];
        ctx.wall(pts, { hue, base: 0.6, note: side < 0 ? -3 : 9, width: 0.07 }, { restitution: 0.2, friction: 0.05 });
      }
    });

    const yFunnel = TOP + (ROWS.length - 1) * ROW + 0.9;
    softFunnel(ctx, yFunnel, { base: 0.4, note: -2 });

    // Soft halos so the pegs read as a constellation.
    ctx.onDraw((g, t) => {
      for (let i = 0; i < pegs.length; i++) {
        const p = pegs[i];
        const pulse = 0.5 + 0.5 * Math.sin(t * 0.9 + p.x * 0.9 - p.y * 0.6);
        g.fillStyle = `hsla(${p.hue}, 100%, 65%, ${0.035 + 0.035 * pulse})`;
        g.beginPath();
        g.arc(p.x, p.y, 0.34 + 0.06 * pulse, 0, Math.PI * 2);
        g.fill();
      }
    });
  },
};

export default plinko;
