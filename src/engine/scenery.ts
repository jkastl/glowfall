import { COLUMN_W } from './constants';
import { hashString, makeRng } from './build';
import type { Simulation } from './sim';

/**
 * Ambient scenery, purely decorative (no physics):
 *
 *  - Back layers (screen space, behind the track): kelp silhouettes far away, jellyfish and a
 *    little fish shoal nearer. Each scrolls at a fraction of the camera's speed (parallax).
 *  - Wall life (world space, on the outside of the column walls): sparse plants and small
 *    animals that scroll with the track. They're seeded from the track's parts, so every track
 *    grows its own garden, and they're drawn per period in loop mode like the track itself.
 *
 * Everything is drawn with 'lighter' compositing at low alpha so it never competes with the
 * marbles, and nothing allocates per frame beyond canvas paths.
 */

const TAU = Math.PI * 2;
const mod = (a: number, n: number) => ((a % n) + n) % n;

// ── Back layers ──────────────────────────────────────────────────────────────────────────────
// Camera.drift (see render.ts) is 0.08 × the camera's scroll in px, and in loop mode it wraps at
// MOTE_PERIOD (20) × the view height. A layer moving at f × the camera moves drift × f / 0.08,
// which wraps at 250·f view heights. BAND (5 view heights) divides that for f = 0.1 and f = 0.2,
// so a wrap is invisible.
const DRIFT_K = 0.08;
const BAND = 5;

interface BackItem {
  kind: 'kelp' | 'jelly' | 'shoal';
  /** Screen x as a fraction of the width. */
  u: number;
  /** Position in the band, in view heights [0, BAND). */
  v: number;
  size: number;
  hue: number;
  phase: number;
}

interface Layer {
  f: number; // parallax factor (fraction of camera speed)
  alpha: number;
  items: BackItem[];
}

// ── Wall life ────────────────────────────────────────────────────────────────────────────────
type WallKind = 'kelp' | 'fan' | 'flower' | 'brackets' | 'snail' | 'fish' | 'jelly';

interface WallItem {
  kind: WallKind;
  side: -1 | 1; // -1 = outside the left wall, +1 = outside the right wall
  y: number;
  size: number;
  hue: number;
  phase: number;
  n: number; // strands / petals / branches
}

const WALL_KINDS: [WallKind, number][] = [
  ['kelp', 5],
  ['fan', 4],
  ['flower', 4],
  ['brackets', 3],
  ['snail', 1.2],
  ['fish', 1.2],
  ['jelly', 1.2],
];
const WALL_HUES: Record<WallKind, number[]> = {
  kelp: [150, 165, 178],
  fan: [312, 328, 290],
  flower: [38, 330, 20, 268],
  brackets: [190, 205, 175],
  snail: [48, 30],
  fish: [186, 38, 268],
  jelly: [268, 290, 200],
};

export class Scenery {
  private layers: Layer[];
  private walls = new WeakMap<Simulation, WallItem[]>();

  constructor(seed = 0x9e3779b9) {
    const rnd = makeRng(seed);
    // Keep the middle third clear-ish: that's where the column usually is.
    const sideU = () => (rnd() < 0.5 ? rnd() * 0.32 : 0.68 + rnd() * 0.32);
    const far: BackItem[] = [];
    for (let i = 0; i < 14; i++) {
      far.push({ kind: 'kelp', u: sideU(), v: rnd() * BAND, size: 0.35 + rnd() * 0.45, hue: 160 + rnd() * 40, phase: rnd() * TAU });
    }
    const near: BackItem[] = [];
    for (let i = 0; i < 6; i++) {
      near.push({ kind: 'jelly', u: sideU(), v: rnd() * BAND, size: 14 + rnd() * 16, hue: [268, 290, 200, 320][i % 4], phase: rnd() * TAU });
    }
    for (let i = 0; i < 2; i++) {
      near.push({ kind: 'shoal', u: rnd(), v: rnd() * BAND, size: 1, hue: [186, 150][i], phase: rnd() * TAU });
    }
    this.layers = [
      { f: 0.1, alpha: 0.32, items: far },
      { f: 0.2, alpha: 0.5, items: near },
    ];
  }

  /**
   * Screen-space layers. Call after the background fill, before the world transform.
   * `drift` is Camera.drift (or its fallback); colX0/colX1 are the column's screen x range.
   */
  drawBack(g: CanvasRenderingContext2D, w: number, h: number, drift: number, t: number, colX0: number, colX1: number) {
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    for (const L of this.layers) {
      const off = (drift * L.f) / DRIFT_K;
      const span = BAND * h;
      for (const it of L.items) {
        const sy = mod(it.v * h - off, span) - h * 0.5; // screen y of the item's anchor
        if (sy < -h * 0.6 || sy > h * 1.6) continue;
        const sx = it.u * w;
        if (it.kind !== 'shoal' && sx > colX0 - 20 && sx < colX1 + 20) continue; // never behind the column
        if (it.kind === 'kelp') this.backKelp(g, sx, sy, h * it.size, it.hue, it.phase, t, L.alpha);
        else if (it.kind === 'jelly') this.backJelly(g, sx, sy, it.size, it.hue, it.phase, t, L.alpha);
        else this.backShoal(g, w, sy, it.hue, it.phase, t, L.alpha, colX0, colX1);
      }
    }
    g.globalAlpha = 1;
  }

  private backKelp(g: CanvasRenderingContext2D, x: number, y: number, len: number, hue: number, ph: number, t: number, a: number) {
    // A tall frond swaying slowly, faint and blue-green, rising from below its anchor.
    const sway = Math.sin(t * 0.25 + ph) * len * 0.06;
    g.globalAlpha = a * 0.55;
    g.strokeStyle = `hsl(${hue}, 70%, 35%)`;
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(x, y + len * 0.5);
    g.bezierCurveTo(x - len * 0.08, y + len * 0.15, x + len * 0.1 + sway * 0.5, y - len * 0.15, x + sway, y - len * 0.5);
    g.stroke();
    g.globalAlpha = a * 0.35;
    g.lineWidth = 2;
    g.strokeStyle = `hsl(${hue}, 80%, 55%)`;
    g.stroke();
    // a few leaf blades
    for (let i = 1; i <= 4; i++) {
      const k = i / 5;
      const ly = y + len * 0.5 - len * k;
      const lx = x + sway * k + Math.sin(k * 5 + ph) * len * 0.03;
      const dir = i % 2 ? 1 : -1;
      g.beginPath();
      g.moveTo(lx, ly);
      g.quadraticCurveTo(lx + dir * len * 0.05, ly - len * 0.02, lx + dir * len * 0.07 + sway * 0.2, ly - len * 0.07);
      g.stroke();
    }
  }

  private backJelly(g: CanvasRenderingContext2D, x: number, y: number, r: number, hue: number, ph: number, t: number, a: number) {
    // Bobs and pulses; tentacles trail and wave.
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.1 + ph);
    const bx = x + Math.sin(t * 0.13 + ph) * 18;
    const by = y + Math.sin(t * 0.21 + ph * 2) * 22;
    const rw = r * (1 + 0.08 * pulse);
    const rh = r * (0.75 - 0.1 * pulse);
    g.globalAlpha = a * 0.5;
    g.fillStyle = `hsla(${hue}, 90%, 60%, 0.35)`;
    g.beginPath();
    g.ellipse(bx, by, rw, rh, 0, Math.PI, TAU);
    g.closePath();
    g.fill();
    g.strokeStyle = `hsl(${hue}, 90%, 72%)`;
    g.lineWidth = 1.5;
    g.stroke();
    g.globalAlpha = a * 0.4;
    g.lineWidth = 1.2;
    for (let i = 0; i < 4; i++) {
      const tx = bx - rw * 0.6 + (i / 3) * rw * 1.2;
      g.beginPath();
      g.moveTo(tx, by);
      for (let s = 1; s <= 5; s++) {
        g.lineTo(tx + Math.sin(t * 1.4 + ph + i + s * 0.8) * 3 * s * 0.4, by + s * r * 0.32);
      }
      g.stroke();
    }
  }

  private backShoal(g: CanvasRenderingContext2D, w: number, y: number, hue: number, ph: number, t: number, a: number, c0: number, c1: number) {
    // A loose school of tiny fish crossing the whole view very slowly, hidden behind the column.
    const period = 90;
    const p = mod(t / period + ph / TAU, 1);
    const dir = ph > Math.PI ? 1 : -1;
    const cx = dir > 0 ? -80 + p * (w + 160) : w + 80 - p * (w + 160);
    g.fillStyle = `hsl(${hue}, 90%, 70%)`;
    for (let i = 0; i < 9; i++) {
      const fx = cx + Math.sin(i * 7.3 + ph) * 34 - dir * i * 6;
      const fy = y + Math.cos(i * 4.1 + ph) * 18 + Math.sin(t * 0.9 + i) * 3;
      if (fx > c0 - 6 && fx < c1 + 6) continue;
      g.globalAlpha = a * 0.55;
      g.beginPath();
      g.ellipse(fx, fy, 3.2, 1.3, 0, 0, TAU);
      g.moveTo(fx - dir * 3, fy);
      g.lineTo(fx - dir * 5.5, fy - 1.6);
      g.lineTo(fx - dir * 5.5, fy + 1.6);
      g.fill();
    }
  }

  // ── Wall life ──────────────────────────────────────────────────────────────────────────────

  private wallItems(sim: Simulation): WallItem[] {
    let items = this.walls.get(sim);
    if (items) return items;
    items = [];
    const rnd = makeRng(hashString(sim.parts.map((p) => p.def.id).join('|')) ^ 0x51ed);
    const total = WALL_KINDS.reduce((s, [, wgt]) => s + wgt, 0);
    const pick = (): WallKind => {
      let r = rnd() * total;
      for (const [k, wgt] of WALL_KINDS) if ((r -= wgt) < 0) return k;
      return 'kelp';
    };
    let lastSide: -1 | 1 = 1;
    for (let y = 2 + rnd() * 3; y < sim.totalHeight - 1; y += 3.5 + rnd() * 5) {
      const kind = pick();
      const side: -1 | 1 = rnd() < 0.7 ? (-lastSide as -1 | 1) : lastSide;
      lastSide = side;
      const hues = WALL_HUES[kind];
      items.push({
        kind,
        side,
        y,
        size: 1.0 + rnd() * 0.7,
        hue: hues[Math.floor(rnd() * hues.length)],
        phase: rnd() * TAU,
        n: 3 + Math.floor(rnd() * 4),
      });
    }
    this.walls.set(sim, items);
    return items;
  }

  /** World-space wall life between viewTop and viewBot. Expects the world transform and 'lighter'. */
  drawWalls(g: CanvasRenderingContext2D, sim: Simulation, viewTop: number, viewBot: number, t: number) {
    const items = this.wallItems(sim);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const it of items) {
      if (it.y < viewTop - 4 || it.y > viewBot + 4) continue;
      const wx = it.side < 0 ? 0 : COLUMN_W;
      g.save();
      // Local frame: origin on the wall, +x pointing away from the column, +y down.
      g.translate(wx + it.side * 0.06, it.y);
      g.scale(it.side * it.size, it.size);
      switch (it.kind) {
        case 'kelp':
          wallKelp(g, it, t);
          break;
        case 'fan':
          wallFan(g, it, t);
          break;
        case 'flower':
          wallFlower(g, it, t);
          break;
        case 'brackets':
          wallBrackets(g, it, t);
          break;
        case 'snail':
          wallSnail(g, it, t);
          break;
        case 'fish':
          wallFish(g, it, t);
          break;
        case 'jelly':
          wallJelly(g, it, t);
          break;
      }
      g.restore();
    }
    g.globalAlpha = 1;
  }
}

// Each wall drawing works in a local frame where x ≥ 0 is away from the column (outside), in
// world units scaled by the item's size. Line widths are in the same units.

/** Two-pass glow stroke of the current path: a soft wide halo, then a bright core. */
function glowStroke(g: CanvasRenderingContext2D, hue: number, a: number, w: number, light = 62) {
  g.strokeStyle = `hsl(${hue}, 90%, ${light}%)`;
  g.globalAlpha = a * 0.22;
  g.lineWidth = w * 3.2;
  g.stroke();
  g.globalAlpha = a;
  g.lineWidth = w;
  g.stroke();
}

function dot(g: CanvasRenderingContext2D, x: number, y: number, r: number, hue: number, a: number, light = 72) {
  g.fillStyle = `hsl(${hue}, 95%, ${light}%)`;
  g.globalAlpha = a * 0.25;
  g.beginPath();
  g.arc(x, y, r * 2.4, 0, TAU);
  g.fill();
  g.globalAlpha = a;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
}

function wallKelp(g: CanvasRenderingContext2D, it: WallItem, t: number) {
  // Strands rooted on the wall, curling outward and up, swaying like they're in a slow current.
  for (let i = 0; i < it.n; i++) {
    const k = i / Math.max(1, it.n - 1);
    const len = 1.3 + 0.9 * Math.sin(it.phase + i * 1.7) ** 2;
    const sway = Math.sin(t * 0.55 + it.phase + i * 0.9) * 0.22;
    const y0 = (k - 0.5) * 0.5;
    g.beginPath();
    g.moveTo(0, y0);
    g.bezierCurveTo(0.35 + k * 0.2, y0 - len * 0.2, 0.25 + sway, y0 - len * 0.6, 0.55 + sway * 1.6 + k * 0.4, y0 - len);
    glowStroke(g, it.hue + i * 6, 0.38, 0.05);
  }
}

function wallFan(g: CanvasRenderingContext2D, it: WallItem, t: number) {
  // A sea fan: branches fanning out from a foot on the wall, with glowing polyps at the tips.
  const breathe = 0.5 + 0.5 * Math.sin(t * 0.7 + it.phase);
  const n = it.n + 2;
  for (let i = 0; i < n; i++) {
    const ang = -1.15 + (i / (n - 1)) * 1.5 + Math.sin(t * 0.4 + it.phase + i) * 0.04;
    const len = 0.9 + 0.35 * Math.sin(i * 2.3 + it.phase) ** 2;
    const mx = Math.cos(ang) * len * 0.55;
    const my = Math.sin(ang) * len * 0.55;
    const ex = Math.cos(ang) * len;
    const ey = Math.sin(ang) * len;
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(mx * 0.9, my * 1.1, ex, ey);
    // a little side twig
    g.moveTo(mx, my);
    g.lineTo(mx + Math.cos(ang - 0.6) * 0.3, my + Math.sin(ang - 0.6) * 0.3);
    glowStroke(g, it.hue, 0.32, 0.035);
    dot(g, ex, ey, 0.045, it.hue + 20, 0.35 + 0.35 * breathe);
  }
}

function wallFlower(g: CanvasRenderingContext2D, it: WallItem, t: number) {
  // A curved stem out from the wall carrying a slow-blooming flower.
  const sway = Math.sin(t * 0.5 + it.phase) * 0.12;
  const hx = 0.95 + sway;
  const hy = -0.75;
  g.beginPath();
  g.moveTo(0, 0.1);
  g.quadraticCurveTo(0.7, 0.05, hx, hy);
  glowStroke(g, 150, 0.32, 0.04);
  // a leaf on the stem
  g.beginPath();
  g.moveTo(0.45, -0.02);
  g.quadraticCurveTo(0.7, 0.12, 0.85, -0.05);
  g.quadraticCurveTo(0.65, -0.12, 0.45, -0.02);
  glowStroke(g, 158, 0.28, 0.025);
  const open = 0.75 + 0.25 * Math.sin(t * 0.35 + it.phase);
  const petals = it.n + 2;
  g.save();
  g.translate(hx, hy);
  g.rotate(Math.sin(t * 0.3 + it.phase) * 0.15);
  for (let i = 0; i < petals; i++) {
    g.rotate(TAU / petals);
    g.beginPath();
    g.ellipse(0.17 * open, 0, 0.17 * open, 0.065, 0, 0, TAU);
    g.fillStyle = `hsla(${it.hue}, 95%, 62%, 0.16)`;
    g.globalAlpha = 1;
    g.fill();
    glowStroke(g, it.hue, 0.38, 0.022, 70);
  }
  g.restore();
  dot(g, hx, hy, 0.06, it.hue + 25, 0.7, 80);
}

function wallBrackets(g: CanvasRenderingContext2D, it: WallItem, t: number) {
  // Bracket fungi: little glowing shelves stacked on the wall, gills pulsing softly.
  const n = Math.min(4, it.n);
  for (let i = 0; i < n; i++) {
    const y = (i - (n - 1) / 2) * 0.32 + Math.sin(i * 3.1 + it.phase) * 0.05;
    const r = 0.22 + 0.12 * Math.sin(i * 1.9 + it.phase) ** 2;
    const glow = 0.45 + 0.3 * Math.sin(t * 0.9 + it.phase + i * 1.3);
    g.beginPath();
    g.moveTo(0, y);
    g.quadraticCurveTo(r * 1.1, y - r * 0.55, r * 1.7, y + r * 0.05);
    g.quadraticCurveTo(r * 0.9, y + r * 0.2, 0, y + r * 0.08);
    g.fillStyle = `hsla(${it.hue}, 90%, 60%, ${0.1 + 0.08 * glow})`;
    g.globalAlpha = 1;
    g.fill();
    glowStroke(g, it.hue, 0.3 + 0.2 * glow, 0.025, 68);
  }
}

function wallSnail(g: CanvasRenderingContext2D, it: WallItem, t: number) {
  // A tiny snail on the outside of the wall, inching up and down (it has nowhere to be).
  const y = Math.sin(t * 0.03 + it.phase) * 1.2;
  const bob = Math.sin(t * 1.3 + it.phase) * 0.01;
  g.save();
  g.translate(0, y);
  // body along the wall
  g.beginPath();
  g.moveTo(0.02, 0.32);
  g.quadraticCurveTo(0.12, 0.05, 0.1, -0.28);
  // eye stalks
  g.moveTo(0.08, -0.24);
  g.lineTo(0.15 + bob, -0.4);
  g.moveTo(0.05, -0.25);
  g.lineTo(0.05 + bob, -0.42);
  glowStroke(g, 95, 0.35, 0.035);
  dot(g, 0.15 + bob, -0.41, 0.018, 95, 0.6);
  dot(g, 0.05 + bob, -0.43, 0.018, 95, 0.6);
  // spiral shell
  g.beginPath();
  for (let s = 0; s <= 40; s++) {
    const a = s * 0.32;
    const r = 0.2 * (1 - s / 46);
    const px = 0.24 + Math.cos(a) * r;
    const py = 0.04 + Math.sin(a) * r;
    if (s === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  glowStroke(g, it.hue, 0.45, 0.03, 66);
  g.restore();
}

function wallFish(g: CanvasRenderingContext2D, it: WallItem, t: number) {
  // A small fish patrolling a short beat beside the wall, turning at each end.
  const p = Math.sin(t * 0.18 + it.phase); // -1..1 along its beat
  const dir = Math.cos(t * 0.18 + it.phase) >= 0 ? 1 : -1; // swimming toward +y or -y
  const x = 1.1 + Math.sin(t * 0.4 + it.phase) * 0.15;
  const y = p * 1.6;
  const wag = Math.sin(t * 6 + it.phase) * 0.06;
  g.save();
  g.translate(x, y);
  g.rotate(dir > 0 ? Math.PI / 2 : -Math.PI / 2);
  g.beginPath();
  g.ellipse(0, 0, 0.26, 0.1, 0, 0, TAU);
  g.moveTo(-0.24, 0);
  g.lineTo(-0.42, -0.1 + wag);
  g.lineTo(-0.42, 0.1 + wag);
  g.closePath();
  g.fillStyle = `hsla(${it.hue}, 95%, 62%, 0.18)`;
  g.globalAlpha = 1;
  g.fill();
  glowStroke(g, it.hue, 0.4, 0.025, 70);
  dot(g, 0.14, -0.025, 0.018, it.hue, 0.8, 85);
  g.restore();
}

function wallJelly(g: CanvasRenderingContext2D, it: WallItem, t: number) {
  // A little jellyfish hanging out near the wall, pulsing and bobbing.
  const pulse = 0.5 + 0.5 * Math.sin(t * 1.2 + it.phase);
  const x = 1.2 + Math.sin(t * 0.21 + it.phase) * 0.25;
  const y = Math.sin(t * 0.33 + it.phase) * 0.6 - pulse * 0.08;
  const rw = 0.3 * (1 + 0.1 * pulse);
  const rh = 0.24 * (1 - 0.15 * pulse);
  g.beginPath();
  g.ellipse(x, y, rw, rh, 0, Math.PI, TAU);
  g.closePath();
  g.fillStyle = `hsla(${it.hue}, 95%, 65%, 0.14)`;
  g.globalAlpha = 1;
  g.fill();
  glowStroke(g, it.hue, 0.45, 0.025, 72);
  g.beginPath();
  for (let i = 0; i < 4; i++) {
    const tx = x - rw * 0.6 + (i / 3) * rw * 1.2;
    g.moveTo(tx, y);
    for (let s = 1; s <= 4; s++) g.lineTo(tx + Math.sin(t * 1.5 + it.phase + i + s) * 0.03 * s, y + s * 0.13);
  }
  glowStroke(g, it.hue, 0.28, 0.015, 72);
}
