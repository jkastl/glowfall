/** Small geometry helpers shared by the mechanism parts (flip-flop, waterwheel, tipping-buckets, turnstile). */
export type Pt = [number, number];

/** Points along a circular arc (angles in radians, screen coords: y down, so +angle is clockwise). */
export function arc(cx: number, cy: number, r: number, a0: number, a1: number, n = 12): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

/** Quadratic bezier sampled into a polyline. */
export function bez(p0: Pt, c: Pt, p1: Pt, n = 12): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const a = (1 - u) * (1 - u);
    const b = 2 * u * (1 - u);
    const d = u * u;
    pts.push([a * p0[0] + b * c[0] + d * p1[0], a * p0[1] + b * c[1] + d * p1[1]]);
  }
  return pts;
}

/** Mirror a polyline about the column centre line (x = 5). */
export function mirror(pts: Pt[]): Pt[] {
  return pts.map(([x, y]) => [10 - x, y] as Pt);
}

/** Soft radial glow blob for onDraw decorations (caller has 'lighter' compositing set). */
export function glow(g: CanvasRenderingContext2D, x: number, y: number, r: number, hue: number, alpha: number) {
  if (alpha <= 0.003) return;
  const grad = g.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, `hsla(${hue}, 100%, 72%, ${alpha})`);
  grad.addColorStop(0.4, `hsla(${hue}, 100%, 60%, ${alpha * 0.35})`);
  grad.addColorStop(1, `hsla(${hue}, 100%, 50%, 0)`);
  g.fillStyle = grad;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

/** A pivot jewel for onDraw: soft halo, thin ring and a bright core. `pulse` 0..1 brightens it. */
export function jewel(g: CanvasRenderingContext2D, x: number, y: number, r: number, hue: number, pulse = 0) {
  glow(g, x, y, r * 4, hue, 0.22 + pulse * 0.35);
  g.lineWidth = r * 0.35;
  g.strokeStyle = `hsla(${hue}, 100%, 70%, ${0.55 + pulse * 0.4})`;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = `hsla(${hue}, 100%, ${82 + pulse * 15}%, ${0.75 + pulse * 0.25})`;
  g.beginPath();
  g.arc(x, y, r * 0.45, 0, Math.PI * 2);
  g.fill();
}

/** Smooth Catmull-Rom curve through the given points (`n` samples per segment). */
export function spline(points: Pt[], n = 8): Pt[] {
  const out: Pt[] = [points[0]];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    for (let j = 1; j <= n; j++) {
      const t = j / n;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
}
