import type { PartDef } from '../engine/types';
import { segmentedWall, smooth, type Pt } from './lib/routing';

const H = 18;
const NL = 5; // lanes
const LANE_W = 1.6;
const X0 = 5 - (NL * LANE_W) / 2; // left edge of lane 0
const Y_LANE0 = 5.0;
const Y_LANE1 = 12.2;
const SWAY = 0.32;

/** Gentle shared sway so the comb teeth ripple; zero at both ends. */
function sway(y: number): number {
  const u = (y - Y_LANE0) / (Y_LANE1 - Y_LANE0);
  return SWAY * Math.sin(u * Math.PI * 2) * smooth(u * 5) * smooth((1 - u) * 5);
}

/** A little roof (inverted V) with curved shoulders. */
function tent(cx: number, y: number, hw: number, drop: number): Pt[] {
  const pts: Pt[] = [];
  for (let i = -8; i <= 8; i++) {
    const u = i / 8;
    pts.push([cx + u * hw, y + drop * Math.pow(Math.abs(u), 1.4)]);
  }
  return pts;
}

const splitterComb: PartDef = {
  id: 'splitter-comb',
  name: 'Rain Comb',
  blurb: 'The stream parts into five singing channels.',
  height: H,
  build(ctx) {
    const glass = { friction: 0.05, restitution: 0.2 };
    const lanes = [...Array(NL)].map((_, i) => X0 + LANE_W * (i + 0.5));
    // pentatonic notes per lane, rising left to right
    const laneNote = [0, 1, 2, 4, 5].map((n) => n + 1);

    // --- fan-out: three rows of roofs (Galton style, but gentle)
    const roof = (x: number, y: number, hw: number, drop: number, note: number, hue: number) =>
      ctx.wall(tent(x, y, hw, drop), { note, hue, base: 0.5, width: 0.08 }, glass);
    roof(5, 1.2, 1.0, 0.7, 5, 185);
    roof(3.4, 2.5, 0.95, 0.7, 4, 200);
    roof(6.6, 2.5, 0.95, 0.7, 4, 200);
    for (let k = 0; k < NL - 1; k++) {
      const x = X0 + LANE_W * (k + 1);
      roof(x, 3.9, 0.45, 0.5, 2 + k, 215 + k * 12);
    }
    // outer shoulders that guide strays into the first / last lane
    ctx.wall([[0, 3.2], [0.4, 3.9], [X0 - 0.05, 4.7], [X0, Y_LANE0 + 0.2]], { hue: 200, base: 0.35 }, glass);
    ctx.wall([[10, 3.2], [9.6, 3.9], [10 - X0 + 0.05, 4.7], [10 - X0, Y_LANE0 + 0.2]], { hue: 200, base: 0.35 }, glass);

    // --- the teeth: NL+1 swaying dividers (outer two are the lane walls)
    for (let k = 0; k <= NL; k++) {
      const x = X0 + LANE_W * k;
      const pts: Pt[] = [];
      const n = 50;
      for (let i = 0; i <= n; i++) {
        const y = Y_LANE0 + ((Y_LANE1 - Y_LANE0) * i) / n;
        pts.push([x + sway(y), y]);
      }
      const hue = 175 + k * 22;
      segmentedWall(ctx, pts, 3, (u) => ({ hue: hue + u * 10, base: 0.5, width: 0.07, note: laneNote[Math.min(k, NL - 1)] + (u > 0.6 ? 0 : -1) }), glass);
    }

    // --- per-lane chime tick: a short tilted bar that every marble taps, tuned to its lane
    lanes.forEach((x, i) => {
      const y = Y_LANE0 + 2.9 + (i % 2) * 0.6;
      const dir = i % 2 === 0 ? 1 : -1;
      // a small fin fixed to one divider, sloping down into the lane: no resting place, just a tap
      const wx = x - dir * 0.8 + sway(y);
      ctx.wall([[wx - dir * 0.02, y - 0.05], [wx + dir * 0.3, y + 0.2], [wx + dir * 0.34, y + 0.2]], { hue: 160 + i * 30, base: 0.7, note: laneNote[i] + 2 }, { restitution: 0.2, friction: 0.05 });
    });

    // --- funnel back together
    ctx.funnelToOutlet(Y_LANE1 + 0.3, { hue: 215, base: 0.4 });

    // light rain streaks in each lane
    ctx.onDraw((g, t) => {
      for (let i = 0; i < NL; i++) {
        const x = lanes[i];
        for (let j = 0; j < 3; j++) {
          const p = (t * 0.25 + j / 3 + i * 0.17) % 1;
          const y = Y_LANE0 + p * (Y_LANE1 - Y_LANE0);
          g.fillStyle = `hsla(${185 + i * 22},80%,65%,${0.09 * Math.sin(p * Math.PI)})`;
          g.fillRect(x + sway(y) - 0.02, y, 0.04, 0.5);
        }
      }
    });
  },
};

export default splitterComb;
