import type { PartDef } from '../engine/types';
import { softFunnel, type Pt } from './lib/flowgeo';

/**
 * Wave Slide: three long sine-wave tracks, back and forth across the column.
 * Each track is a steady descent plus a sine ripple whose steepest "uphill" is
 * always a little less than the descent, so the surface never actually rises:
 * a marble slows to a crawl on each crest and swoops down the next face, but
 * can never be trapped in a trough.
 */
const SLOPE = 0.37; // mean descent per unit of travel
const WAVELEN = 3.3;
const K = (Math.PI * 2) / WAVELEN;
const AMP = (SLOPE * 0.88) / K; // ripple slope peaks at 88% of the descent → min slope > 0

function wave(xStart: number, xEnd: number, y0: number, phase: number): Pt[] {
  const dir = Math.sign(xEnd - xStart);
  const len = Math.abs(xEnd - xStart);
  const n = Math.ceil(len * 9);
  const pts: Pt[] = [];
  const off = AMP * Math.sin(phase);
  for (let i = 0; i <= n; i++) {
    const d = (len * i) / n;
    pts.push([xStart + dir * d, y0 + SLOPE * d + AMP * Math.sin(K * d + phase) - off]);
  }
  return pts;
}

const waveSlide: PartDef = {
  id: 'wave-slide',
  name: 'Wave Slide',
  blurb: 'Rolling sine hills. A slow rollercoaster.',
  height: 17,
  build(ctx) {
    const { W } = ctx;
    const mat = { restitution: 0.05, friction: 0.25 };
    const tracks: { pts: Pt[]; hue: number }[] = [];
    const add = (pts: Pt[], lip: Pt | null, hue: number, note: number) => {
      tracks.push({ pts, hue });
      ctx.wall(lip ? [lip, ...pts] : pts, { hue, note }, mat);
    };
    // phase π → each track begins on a steep face (catches & carries), ends on a swoop
    const t0 = wave(7.0, 1.4, 1.5, Math.PI);
    add(t0, [7.25, 0.7], ctx.hue, 0);
    const y1 = t0[t0.length - 1][1] + 1.15;
    const t1 = wave(0.05, W - 1.4, y1, Math.PI);
    add(t1, null, ctx.hue + 30, 2);
    const y2 = t1[t1.length - 1][1] + 1.15;
    const t2 = wave(W - 0.05, 1.4, y2, Math.PI);
    add(t2, null, ctx.hue + 60, 4);
    const yEnd = t2[t2.length - 1][1];

    softFunnel(ctx, yEnd + 0.7, { base: 0.4, hue: ctx.hue + 60 });

    // Echo lines under each track, like ripples of light sinking away.
    ctx.onDraw((g, t) => {
      g.lineCap = 'round';
      g.lineJoin = 'round';
      for (let k = 0; k < tracks.length; k++) {
        const { pts, hue } = tracks[k];
        for (let e = 1; e <= 3; e++) {
          const breathe = 0.5 + 0.5 * Math.sin(t * 0.7 - e * 0.9 + k);
          g.strokeStyle = `hsla(${hue + e * 8}, 100%, 62%, ${(0.2 - e * 0.05) * (0.55 + 0.45 * breathe)})`;
          g.lineWidth = 0.05;
          g.beginPath();
          for (let i = 0; i < pts.length; i += 2) {
            const y = pts[i][1] + e * 0.2;
            if (i === 0) g.moveTo(pts[i][0], y);
            else g.lineTo(pts[i][0], y);
          }
          g.stroke();
        }
      }
    });
  },
};

export default waveSlide;
