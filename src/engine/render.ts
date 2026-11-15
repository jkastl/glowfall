import type { Body, ChainShape, CircleShape, EdgeShape, Fixture, PolygonShape } from 'planck';
import { fixtureData } from './build';
import { COLUMN_W, MARBLE_COLORS, MARBLE_R, PORT_X0, PORT_X1 } from './constants';
import type { Simulation } from './sim';
import type { FixtureStyle } from './types';

export interface Camera {
  /** World y at the vertical center of the view. */
  y: number;
  /** Pixels (CSS) per world unit. */
  scale: number;
  /** Horizontal shift of the column center from the canvas center, CSS px. */
  offsetX?: number;
}

export interface DrawOptions {
  /** Building mode: show part outlines, ports, highlight. */
  editing?: boolean;
  highlightUid?: string | null;
  /** 0..1 finale glow. */
  finale?: number;
}

interface Mote {
  x: number;
  y: number;
  z: number;
  r: number;
  hue: number;
  phase: number;
}

const TAU = Math.PI * 2;

/** Pre-rendered soft glow sprite per hue (big win over shadowBlur on iPad). */
const glowCache = new Map<number, HTMLCanvasElement>();
function glowSprite(hue: number): HTMLCanvasElement {
  let c = glowCache.get(hue);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, `hsla(${hue}, 100%, 75%, 0.9)`);
  grad.addColorStop(0.25, `hsla(${hue}, 100%, 60%, 0.35)`);
  grad.addColorStop(0.6, `hsla(${hue}, 100%, 50%, 0.08)`);
  grad.addColorStop(1, `hsla(${hue}, 100%, 50%, 0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowCache.set(hue, c);
  return c;
}

/** Trace a fixture's outline into the current path (world coords). Returns false for nothing to draw. */
function traceFixture(g: CanvasRenderingContext2D, f: Fixture, body: Body): 'stroke' | 'closed' | 'circle' | null {
  const shape = f.getShape();
  const xf = body.getTransform();
  const type = shape.getType();
  if (type === 'circle') {
    const s = shape as CircleShape;
    const c = body.getWorldPoint(s.getCenter());
    g.moveTo(c.x + s.getRadius(), c.y);
    g.arc(c.x, c.y, s.getRadius(), 0, TAU);
    return 'circle';
  }
  const tp = (v: { x: number; y: number }) => {
    const x = xf.q.c * v.x - xf.q.s * v.y + xf.p.x;
    const y = xf.q.s * v.x + xf.q.c * v.y + xf.p.y;
    return { x, y };
  };
  if (type === 'edge') {
    const s = shape as EdgeShape;
    const a = tp(s.m_vertex1);
    const b = tp(s.m_vertex2);
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    return 'stroke';
  }
  if (type === 'chain') {
    const s = shape as ChainShape;
    const n = s.getChildCount() + 1;
    const loop = s.isLoop();
    const count = loop ? n - 1 : n;
    for (let i = 0; i < count; i++) {
      const p = tp(s.getVertex(i));
      if (i === 0) g.moveTo(p.x, p.y);
      else g.lineTo(p.x, p.y);
    }
    if (loop) g.closePath();
    return loop ? 'closed' : 'stroke';
  }
  if (type === 'polygon') {
    const s = shape as PolygonShape;
    for (let i = 0; i < s.m_count; i++) {
      const p = tp(s.m_vertices[i]);
      if (i === 0) g.moveTo(p.x, p.y);
      else g.lineTo(p.x, p.y);
    }
    g.closePath();
    return 'closed';
  }
  return null;
}

/** Draw one styled fixture with a two-pass glow. Assumes 'lighter' compositing and world transform. */
export function drawFixture(g: CanvasRenderingContext2D, f: Fixture, body: Body, style: FixtureStyle, dim = 1) {
  if (style.kind === 'hidden') return;
  const hue = style.hue ?? 190;
  const flash = style.flash ?? 0;
  const base = (style.base ?? 0.55) * dim;
  const w = style.width ?? 0.08;

  g.beginPath();
  const mode = traceFixture(g, f, body);
  if (!mode) return;

  const fillable = style.kind === 'solid' || style.kind === 'peg';
  if (fillable && mode !== 'stroke') {
    g.fillStyle = `hsla(${hue}, 90%, ${style.kind === 'peg' ? 60 : 45}%, ${(style.kind === 'peg' ? 0.35 : 0.1) * base + flash * 0.35})`;
    g.fill();
  }
  // Soft inner halo; the screen-space bloom pass does the rest.
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = `hsla(${hue}, 100%, 62%, ${0.05 * base + flash * 0.25})`;
  g.lineWidth = w * 3 + flash * 0.1;
  g.stroke();
  // Core
  g.strokeStyle = `hsla(${hue}, 100%, ${62 + flash * 30}%, ${Math.min(1, 0.85 * base + flash)})`;
  g.lineWidth = w;
  g.stroke();
}

export function drawBodies(g: CanvasRenderingContext2D, bodies: Body[], dim = 1) {
  for (const b of bodies) {
    for (let f = b.getFixtureList(); f; f = f.getNext()) {
      const d = fixtureData(f);
      if (!d?.style || f.isSensor()) continue;
      drawFixture(g, f, b, d.style, dim);
    }
  }
}

export class Renderer {
  private g: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private motes: Mote[] = [];
  private canvas: HTMLCanvasElement;
  private bloomA = document.createElement('canvas');
  private bloomB = document.createElement('canvas');
  /** Screen-space bloom (cheap downsample blur). */
  bloom = true;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d', { alpha: false })!;
    const rnd = Math.random;
    for (let i = 0; i < 90; i++) {
      this.motes.push({
        x: rnd(),
        y: rnd() * 400,
        z: 0.15 + rnd() * 0.6,
        r: 0.5 + rnd() * 1.8,
        hue: [186, 200, 268, 150, 300][Math.floor(rnd() * 5)],
        phase: rnd() * TAU,
      });
    }
  }

  resize(cssW: number, cssH: number) {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = cssW;
    this.h = cssH;
    this.canvas.width = Math.round(cssW * this.dpr);
    this.canvas.height = Math.round(cssH * this.dpr);
    this.bloomA.width = Math.max(1, Math.round(cssW / 4));
    this.bloomA.height = Math.max(1, Math.round(cssH / 4));
    this.bloomB.width = Math.max(1, Math.round(cssW / 10));
    this.bloomB.height = Math.max(1, Math.round(cssH / 10));
  }

  /** Downsample the frame, square it (crushes the dark background), and add it back: soft light bleed. */
  private applyBloom() {
    const g = this.g;
    const a = this.bloomA.getContext('2d')!;
    const b = this.bloomB.getContext('2d')!;
    const A = this.bloomA;
    const B = this.bloomB;
    a.globalCompositeOperation = 'copy';
    a.imageSmoothingQuality = 'medium';
    a.drawImage(this.canvas, 0, 0, A.width, A.height);
    a.globalCompositeOperation = 'multiply';
    a.drawImage(A, 0, 0);
    b.globalCompositeOperation = 'copy';
    b.drawImage(A, 0, 0, B.width, B.height);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'lighter';
    g.imageSmoothingEnabled = true;
    g.globalAlpha = 0.35;
    g.drawImage(A, 0, 0, this.canvas.width, this.canvas.height);
    g.globalAlpha = 0.75;
    g.drawImage(B, 0, 0, this.canvas.width, this.canvas.height);
    g.globalAlpha = 1;
  }

  get width() {
    return this.w;
  }
  get height() {
    return this.h;
  }

  /** Scale that fits the column nicely on screen. */
  fitScale(): number {
    return Math.max(18, Math.min(this.w * 0.82, this.h * 0.62) / COLUMN_W);
  }

  /** Screen (CSS px) → world. */
  toWorld(cam: Camera, sx: number, sy: number) {
    return {
      x: (sx - this.w / 2 - (cam.offsetX ?? 0)) / cam.scale + COLUMN_W / 2,
      y: (sy - this.h / 2) / cam.scale + cam.y,
    };
  }

  draw(sim: Simulation, cam: Camera, t: number, opts: DrawOptions = {}) {
    const g = this.g;
    const { w, h, dpr } = this;
    const depth = sim.totalHeight > 0 ? Math.max(0, Math.min(1, cam.y / sim.totalHeight)) : 0;

    // --- Background: deep water that gets darker & more violet with depth.
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalCompositeOperation = 'source-over';
    const bg = g.createLinearGradient(0, 0, 0, h);
    const hueTop = 215 + depth * 40;
    bg.addColorStop(0, `hsl(${hueTop}, 60%, ${7 - depth * 2}%)`);
    bg.addColorStop(1, `hsl(${hueTop + 15}, 65%, ${4 - depth * 1.5}%)`);
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);

    // Faint column backdrop.
    const cx = w / 2 + (cam.offsetX ?? 0);
    const colX = cx - (COLUMN_W / 2) * cam.scale;
    const colW = COLUMN_W * cam.scale;
    const cg = g.createLinearGradient(colX, 0, colX + colW, 0);
    cg.addColorStop(0, 'hsla(200, 80%, 50%, 0)');
    cg.addColorStop(0.5, 'hsla(200, 80%, 50%, 0.035)');
    cg.addColorStop(1, 'hsla(200, 80%, 50%, 0)');
    g.fillStyle = cg;
    g.fillRect(colX - colW * 0.2, 0, colW * 1.4, h);

    // --- Motes (parallax plankton)
    g.globalCompositeOperation = 'lighter';
    for (const m of this.motes) {
      const sy = ((m.y - cam.y * cam.scale * m.z * 0.08) % h + h) % h;
      const sx = (m.x * w + Math.sin(t * 0.15 + m.phase) * 12) % w;
      const a = 0.25 + 0.2 * Math.sin(t * 0.6 + m.phase);
      const s = m.r * 6 * m.z * 2;
      g.globalAlpha = a * m.z;
      g.drawImage(glowSprite(m.hue), sx - s / 2, sy - s / 2, s, s);
    }
    g.globalAlpha = 1;

    // --- World transform
    const sc = cam.scale * dpr;
    const tx = (cx - (COLUMN_W / 2) * cam.scale) * dpr;
    const ty = (h / 2 - cam.y * cam.scale) * dpr;
    g.setTransform(sc, 0, 0, sc, tx, ty);

    const viewTop = cam.y - h / 2 / cam.scale - 2;
    const viewBot = cam.y + h / 2 / cam.scale + 2;

    // Editing overlays
    if (opts.editing) {
      for (const p of sim.parts) {
        if (p.originY > viewBot || p.originY + p.height < viewTop) continue;
        const hl = opts.highlightUid && p.uid === opts.highlightUid;
        if (hl) {
          g.fillStyle = `hsla(${p.hue}, 90%, 60%, 0.06)`;
          g.fillRect(0, p.originY, COLUMN_W, p.height);
          g.strokeStyle = `hsla(${p.hue}, 90%, 70%, 0.35)`;
          g.lineWidth = 0.04;
          g.strokeRect(0.02, p.originY + 0.02, COLUMN_W - 0.04, p.height - 0.04);
        }
        // Port markers at each boundary.
        g.strokeStyle = 'hsla(190, 80%, 70%, 0.18)';
        g.lineWidth = 0.03;
        g.setLineDash([0.2, 0.2]);
        g.beginPath();
        g.moveTo(0, p.originY);
        g.lineTo(COLUMN_W, p.originY);
        g.stroke();
        g.setLineDash([]);
        g.strokeStyle = 'hsla(190, 90%, 75%, 0.5)';
        g.lineWidth = 0.08;
        g.beginPath();
        g.moveTo(PORT_X0, p.originY);
        g.lineTo(PORT_X1, p.originY);
        g.stroke();
      }
    }

    // --- Parts
    for (const p of sim.parts) {
      if (p.originY > viewBot || p.originY + p.height < viewTop) continue;
      const dim = opts.editing && opts.highlightUid && p.uid !== opts.highlightUid ? 0.6 : 1;
      drawBodies(g, p.bodies, dim);
      if (p.draws.length) {
        g.save();
        g.translate(0, p.originY);
        for (const d of p.draws) d(g, sim.t || t);
        g.restore();
        g.globalCompositeOperation = 'lighter';
      }
    }
    // Frame (side walls)
    drawBodies(g, [sim.frame], 1);

    // Finale glow over the pool
    if (opts.finale && opts.finale > 0) {
      const last = sim.parts[sim.parts.length - 1];
      const cy = last.originY + last.height - 2;
      const gr = g.createRadialGradient(COLUMN_W / 2, cy, 0, COLUMN_W / 2, cy, 8);
      gr.addColorStop(0, `hsla(190, 100%, 70%, ${0.3 * opts.finale})`);
      gr.addColorStop(1, 'hsla(190, 100%, 50%, 0)');
      g.fillStyle = gr;
      g.fillRect(-4, cy - 8, COLUMN_W + 8, 16);
    }

    // --- Marbles: trails, glow, core
    g.lineCap = 'round';
    for (const m of sim.marbles) {
      const tr = m.trail;
      if (tr.length > 1 && tr[tr.length - 1].y > viewTop && tr[0].y < viewBot) {
        for (let i = 1; i < tr.length; i++) {
          const k = i / tr.length;
          g.strokeStyle = `hsla(${m.hue}, 100%, 65%, ${0.22 * k * k * m.fade})`;
          g.lineWidth = MARBLE_R * 1.3 * k;
          g.beginPath();
          g.moveTo(tr[i - 1].x, tr[i - 1].y);
          g.lineTo(tr[i].x, tr[i].y);
          g.stroke();
        }
      }
    }
    for (const m of sim.marbles) {
      const p = m.body.getPosition();
      if (p.y < viewTop || p.y > viewBot) continue;
      const s = MARBLE_R * 7;
      g.globalAlpha = m.fade * (m.collected ? 0.7 : 1);
      g.drawImage(glowSprite(m.hue), p.x - s / 2, p.y - s / 2, s, s);
      g.beginPath();
      g.arc(p.x, p.y, MARBLE_R, 0, TAU);
      g.fillStyle = `hsla(${m.hue}, 100%, 62%, 0.85)`;
      g.fill();
      g.beginPath();
      g.arc(p.x - MARBLE_R * 0.3, p.y - MARBLE_R * 0.3, MARBLE_R * 0.38, 0, TAU);
      g.fillStyle = `hsla(${m.hue}, 100%, 92%, 0.9)`;
      g.fill();
      g.globalAlpha = 1;
    }

    // Unspawned marbles waiting in the source (editing preview)
    if (!sim.started && opts.editing) {
      for (let i = 0; i < 5; i++) {
        const c = MARBLE_COLORS[i];
        const x = COLUMN_W / 2 + (i - 2) * 0.6;
        const y = -0.7 + Math.sin(t * 1.2 + i) * 0.08;
        g.drawImage(glowSprite(c.hue), x - 0.8, y - 0.8, 1.6, 1.6);
      }
    }
    if (this.bloom) this.applyBloom();
    g.globalCompositeOperation = 'source-over';
  }
}

/** Render a static thumbnail of a part (no marbles) into a data URL. */
export function renderPartThumb(sim: Simulation, wPx: number, hPx: number): string {
  const c = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  c.width = wPx * dpr;
  c.height = hPx * dpr;
  const g = c.getContext('2d')!;
  g.fillStyle = '#060b1a';
  g.fillRect(0, 0, c.width, c.height);
  const H = sim.totalHeight;
  const scale = Math.min(wPx / COLUMN_W, hPx / H) * dpr * 0.92;
  g.setTransform(scale, 0, 0, scale, (c.width - COLUMN_W * scale) / 2, (c.height - H * scale) / 2);
  g.globalCompositeOperation = 'lighter';
  for (const p of sim.parts) {
    // thicker lines read better at thumbnail scale
    for (const b of p.bodies) {
      for (let f = b.getFixtureList(); f; f = f.getNext()) {
        const d = fixtureData(f);
        if (!d?.style || f.isSensor()) continue;
        drawFixture(g, f, b, { ...d.style, width: Math.max(d.style.width ?? 0.08, 0.14) }, 1.2);
      }
    }
    if (p.draws.length) {
      g.save();
      g.translate(0, p.originY);
      for (const d of p.draws) d(g, 0);
      g.restore();
      g.globalCompositeOperation = 'lighter';
    }
  }
  return c.toDataURL();
}
