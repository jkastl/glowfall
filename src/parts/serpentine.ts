import type { PartDef } from '../engine/types';
import { glowPath, sampleTube, segmentedWall, smooth, type Pt } from './lib/routing';

const H = 22;
const Y_TUBE = 3.0; // where the funnel mouth meets the tube
const Y_END = H - 0.7;
const AMP = 2.6;
const PERIOD = 9;
const HALF = 0.43; // gap 0.86

/** Centre-line of the tube: vertical at both ends, smooth S-bends between. */
function cx(y: number): number {
  const ramp = smooth((y - Y_TUBE) / 2.2) * smooth((Y_END - 1.4 - y) / 2.4);
  return 5 + AMP * ramp * Math.sin(((y - Y_TUBE - 1.1) * 2 * Math.PI) / PERIOD);
}

const serpentine: PartDef = {
  id: 'serpentine',
  name: 'Serpentine Tube',
  blurb: 'A glass tube; beads of light wind through S-bends.',
  height: H,
  build(ctx) {
    const glass = { friction: 0.04, restitution: 0.12 };
    const tube = sampleTube(cx, Y_TUBE, Y_END, () => HALF, 90);

    // Funnel mouth: smooth vertical-tangent curves from wide at the top into the tube.
    const mouth = (side: -1 | 1): Pt[] => {
      const pts: Pt[] = [];
      const xe = tube.center[0][0] + side * HALF;
      const xs = 5 + side * 2.5;
      for (let i = 0; i <= 18; i++) {
        const u = i / 18;
        pts.push([xs + (xe - xs) * smooth(Math.pow(u, 0.9)), u * Y_TUBE]);
      }
      return pts;
    };
    const mL = mouth(-1);
    const mR = mouth(1);
    ctx.wall(mL, { hue: 190, base: 0.4, width: 0.07 }, glass);
    ctx.wall(mR, { hue: 190, base: 0.4, width: 0.07 }, glass);

    const hueAt = (u: number) => 175 + 95 * u; // teal -> violet down the tube
    const notesL = [0, 2, 4, 5, 7, 9];
    const notesR = [1, 3, 5, 7, 8, 10];
    const segs = 9;
    segmentedWall(ctx, tube.left, segs, (u, i) => ({ hue: hueAt(u), base: 0.5, width: 0.07, note: notesL[i % notesL.length] - 2 }), glass);
    segmentedWall(ctx, tube.right, segs, (u, i) => ({ hue: hueAt(u) + 12, base: 0.5, width: 0.07, note: notesR[i % notesR.length] - 2 }), glass);

    // A soft glassy sheen, drawn once per frame.
    ctx.onDraw((g, t) => {
      glowPath(g, tube.center, HALF * 2, 'hsla(190,70%,60%,0.05)');
      glowPath(g, tube.center, HALF * 1.1, 'hsla(220,80%,70%,0.035)');
      // gentle highlight sliding along the glass
      const n = tube.left.length;
      const k = Math.floor(((t * 0.12) % 1) * n);
      for (let j = 0; j < 6; j++) {
        const i = Math.min(n - 1, k + j * 12) % n;
        const p = tube.left[i];
        const a = 0.12 * (1 - j / 6);
        g.fillStyle = `hsla(${hueAt(i / n)},90%,75%,${a})`;
        g.beginPath();
        g.arc(p[0] + 0.1, p[1], 0.07, 0, Math.PI * 2);
        g.fill();
      }
    });
  },
};

export default serpentine;
