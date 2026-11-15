import { PORT_X0, PORT_X1 } from '../../engine/constants';
import type { BuildContext, FixtureStyle } from '../../engine/types';

export type Pt = [number, number];

/** Sample a parametric curve u∈[0,1] into n+1 points. */
export function sample(fn: (u: number) => Pt, n: number): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) pts.push(fn(i / n));
  return pts;
}

/**
 * A funnel with bell-shaped (curved) walls: starts at the column walls at yTop and
 * sweeps down into the port window, arriving vertical at the part's bottom edge.
 * `x0`/`x1` narrow the mouth (defaults: the full port).
 */
export function softFunnel(ctx: BuildContext, yTop: number, style?: Partial<FixtureStyle>, x0 = PORT_X0, x1 = PORT_X1): void {
  const { W, H } = ctx;
  const n = 22;
  const side = (from: number, to: number) =>
    sample((u) => {
      const e = Math.sin((u * Math.PI) / 2);
      return [from + (to - from) * e, yTop + (H - yTop) * u];
    }, n);
  ctx.wall(side(0, x0), style);
  ctx.wall(side(W, x1), style);
}

/** Read the live impact-flash level (0..1) of a fixture created by the ctx helpers. */
export function flashOf(f: { getUserData(): unknown }): number {
  const d = f.getUserData() as { style?: { flash?: number } } | null;
  return d?.style?.flash ?? 0;
}
