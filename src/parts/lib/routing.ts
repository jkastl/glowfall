import type { BuildContext, FixtureStyle } from '../../engine/types';

export type Pt = [number, number];

export const smooth = (u: number): number => {
  const t = Math.min(1, Math.max(0, u));
  return t * t * (3 - 2 * t);
};

export interface Tube {
  left: Pt[];
  right: Pt[];
  center: Pt[];
}

/** Sample a tube whose centre-line is x = cx(y), with a (possibly varying) half-width. */
export function sampleTube(cx: (y: number) => number, y0: number, y1: number, hw: (y: number) => number, n: number): Tube {
  const left: Pt[] = [];
  const right: Pt[] = [];
  const center: Pt[] = [];
  const e = 0.01;
  for (let i = 0; i <= n; i++) {
    const y = y0 + ((y1 - y0) * i) / n;
    const x = cx(y);
    const dx = (cx(y + e) - cx(y - e)) / (2 * e); // dx/dy
    const len = Math.hypot(dx, 1);
    const nx = 1 / len;
    const ny = -dx / len;
    const h = hw(y);
    left.push([x - nx * h, y - ny * h]);
    right.push([x + nx * h, y + ny * h]);
    center.push([x, y]);
  }
  return { left, right, center };
}

/** Build a polyline as several chains (sharing end vertices) so each segment can have its own hue / note. */
export function segmentedWall(
  ctx: BuildContext,
  pts: Pt[],
  segs: number,
  styleFn: (u: number, i: number) => Partial<FixtureStyle>,
  mat?: { friction?: number; restitution?: number },
): void {
  const n = pts.length - 1;
  for (let s = 0; s < segs; s++) {
    const a = Math.round((n * s) / segs);
    const b = Math.round((n * (s + 1)) / segs);
    if (b - a < 1) continue;
    ctx.wall(pts.slice(a, b + 1), styleFn((s + 0.5) / segs, s), mat);
  }
}

/** Faint glassy tube fill along a centre-line (call inside onDraw; 'lighter' composite is already set). */
export function glowPath(g: CanvasRenderingContext2D, pts: Pt[], width: number, rgba: string): void {
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = rgba;
  g.lineWidth = width;
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.stroke();
}
