import type { PartDef } from '../engine/types';
import { flashOf, sample, softFunnel } from './lib/flowgeo';

/**
 * Bumper Garden: a soft canopy sheds marbles left and right onto a handful of
 * springy round bells. They bounce lazily from bell to bell, ringing high notes,
 * until a curved basin gathers them back to the outlet.
 */
const BELLS: { x: number; y: number; r: number; note: number; dh: number }[] = [
  { x: 2.25, y: 4.7, r: 0.72, note: 5, dh: 0 },
  { x: 7.75, y: 4.7, r: 0.72, note: 6, dh: 20 },
  { x: 5.0, y: 6.5, r: 0.95, note: 3, dh: 50 },
  { x: 2.0, y: 8.6, r: 0.55, note: 8, dh: 80 },
  { x: 8.0, y: 8.6, r: 0.55, note: 7, dh: 100 },
  { x: 5.0, y: 9.9, r: 0.42, note: 10, dh: 125 },
];

const bumperGarden: PartDef = {
  id: 'bumper-garden',
  name: 'Bumper Garden',
  blurb: 'Springy bells that ring as marbles drift between them.',
  height: 15,
  build(ctx) {
    // Canopy: a low-bounce dome under the inlet. It takes the sting out of fast
    // arrivals and splits the stream to both sides.
    ctx.wall(
      sample((u) => {
        const a = Math.PI * (1.12 - 1.24 * u); // arc from lower-left over the top to lower-right
        return [5 + 1.75 * Math.cos(a), 3.05 - 1.75 * Math.sin(a)];
      }, 24),
      { note: 0, base: 0.5 },
      { restitution: 0.05, friction: 0.05 },
    );

    const bells = BELLS.map((b) => ({
      ...b,
      hue: ctx.hue + b.dh,
      f: ctx.circle(b.x, b.y, b.r, { kind: 'solid', hue: ctx.hue + b.dh, note: b.note, base: 0.8 }, { restitution: 0.88, friction: 0.02 }),
    }));

    softFunnel(ctx, 10.6, { base: 0.4, note: -1 });

    // Concentric ripple rings drifting outward from each bell; brighter while it rings.
    ctx.onDraw((g, t) => {
      for (let i = 0; i < bells.length; i++) {
        const b = bells[i];
        const flash = flashOf(b.f);
        g.lineWidth = 0.035;
        for (let k = 0; k < 3; k++) {
          const ph = (t * 0.16 + k / 3 + i * 0.21) % 1;
          const a = (1 - ph) * ph * 4 * (0.07 + flash * 0.3);
          g.strokeStyle = `hsla(${b.hue}, 100%, 68%, ${a})`;
          g.beginPath();
          g.arc(b.x, b.y, b.r + 0.12 + ph * 0.75, 0, Math.PI * 2);
          g.stroke();
        }
        // bright heart
        g.fillStyle = `hsla(${b.hue}, 100%, 75%, ${0.12 + flash * 0.4})`;
        g.beginPath();
        g.arc(b.x, b.y, b.r * 0.28, 0, Math.PI * 2);
        g.fill();
      }
    });
  },
};

export default bumperGarden;
