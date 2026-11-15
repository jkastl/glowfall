import type { PartDef } from '../engine/types';
import { softFunnel } from './lib/flowgeo';

/**
 * Plinko: a widening, staggered field of glowing pegs. Marbles scatter into a
 * cascade; pegs are tuned left→right so the cascade sounds like rain on a xylophone.
 */
const PITCH = 1.25; // horizontal peg spacing (gap ≈ 0.97 ≫ marble diameter 0.5)
const ROW = 1.05; // vertical row spacing (diagonal gap ≈ 0.94)
const PEG_R = 0.14;
const ROWS = [2, 3, 4, 5, 6, 7, 6, 7, 6];
const TOP = 2.1;

const plinko: PartDef = {
  id: 'plinko',
  name: 'Plinko',
  blurb: 'A field of glowing pegs. Rain on a xylophone.',
  height: 15,
  build(ctx) {
    const { W } = ctx;
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
