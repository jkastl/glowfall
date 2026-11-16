import { useEffect, useRef } from 'react';
import { COLUMN_W } from '../engine/constants';
import { MOTE_PERIOD, Renderer, type Camera } from '../engine/render';
import type { Simulation } from '../engine/sim';

export interface StageProps {
  sim: Simulation;
  /** Physics is stepping. */
  running: boolean;
  /** Builder overlays & free camera. */
  editing: boolean;
  highlightUid?: string | null;
  speed?: number;
  finale?: boolean;
  /** Change `n` to ask the camera to glide to world y. */
  focus?: { y: number; n: number } | null;
  onPick?: (uid: string | null) => void;
  /** CSS px covered by an overlay on the left; the column centers in the remaining space. */
  insetLeft?: number;
}

/** Owns the canvas, the render loop and the camera. The sim is stepped here so it stays frame-synced. */
export function Stage(props: StageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const camRef = useRef<Camera>({ y: 0, scale: 40 });
  const glideRef = useRef<number | null>(null);
  const finaleRef = useRef(0);

  useEffect(() => {
    if (props.focus) glideRef.current = props.focus.y;
  }, [props.focus?.n]);

  // Reset camera to the top when a new sim arrives.
  const simRef = useRef<Simulation | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const renderer = new Renderer(canvas);
    (window as unknown as { __glow?: Renderer }).__glow = renderer;
    const cam = camRef.current;
    let raf = 0;
    let last = performance.now();
    let manualUntil = 0;
    let vel = 0; // pan momentum, world units / s
    const t0 = performance.now();
    // Auto-quality: if frames are consistently slow, drop the bloom pass.
    let slowFrames = 0;
    let sampled = 0;

    const fit = () => {
      const r = canvas.getBoundingClientRect();
      renderer.resize(r.width, r.height);
      cam.scale = renderer.fitScale();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(canvas);

    const halfView = () => renderer.height / 2 / cam.scale;
    const clamp = (y: number, sim: Simulation) => {
      const top = -3 + halfView();
      const bot = sim.totalHeight + 1 - halfView();
      return bot < top ? (top + bot) / 2 : Math.max(top, Math.min(bot, y));
    };
    // A looping track repeats every totalHeight and its camera is never clamped.
    const period = (sim: Simulation) => (sim.loop ? sim.totalHeight : 0);
    const mod = (v: number, n: number) => ((v % n) + n) % n;
    /** The copy of world y (one per period H) that is closest to `ref`. */
    const nearest = (y: number, ref: number, H: number) => y + Math.round((ref - y) / H) * H;
    let prevY = cam.y; // camera y at the end of the last frame, for the parallax drift

    // --- Input: drag / wheel to pan, tap to pick.
    let dragging = false;
    let dragMoved = 0;
    let lastY = 0;
    let lastT = 0;
    const onDown = (e: PointerEvent) => {
      dragging = true;
      dragMoved = 0;
      lastY = e.clientY;
      lastT = performance.now();
      vel = 0;
      glideRef.current = null;
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dy = e.clientY - lastY;
      const now = performance.now();
      dragMoved += Math.abs(dy);
      cam.y -= dy / cam.scale;
      const dt = Math.max(1, now - lastT) / 1000;
      vel = vel * 0.6 + (-dy / cam.scale / dt) * 0.4;
      lastY = e.clientY;
      lastT = now;
      manualUntil = now + 4000;
    };
    const onUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      if (dragMoved < 6) {
        vel = 0;
        const p = propsRef.current;
        if (p.editing && p.onPick) {
          const r = canvas.getBoundingClientRect();
          const w = renderer.toWorld(cam, e.clientX - r.left, e.clientY - r.top);
          const H = period(p.sim);
          if (H) w.y = mod(w.y, H);
          const hit = p.sim.parts.find((pt) => w.y >= pt.originY && w.y < pt.originY + pt.height && !pt.def.hidden);
          if (w.x >= -1 && w.x <= COLUMN_W + 1) p.onPick(hit ? hit.uid : null);
        }
      }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      cam.y += e.deltaY / cam.scale;
      glideRef.current = null;
      manualUntil = performance.now() + 4000;
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    const frame = (now: number) => {
      const rawDt = (now - last) / 1000;
      const dt = Math.min(0.05, rawDt);
      if (renderer.bloom && !document.hidden && rawDt < 0.5) {
        sampled++;
        if (rawDt > 0.026) slowFrames++;
        if (sampled >= 120) {
          if (slowFrames > 70) {
            renderer.bloom = false;
            console.info('[glowfall] slow frames: bloom disabled');
          }
          sampled = 0;
          slowFrames = 0;
        }
      }
      last = now;
      const p = propsRef.current;
      const sim = p.sim;

      const H = period(sim);

      if (simRef.current !== sim) {
        if (!simRef.current || p.editing === false) cam.y = prevY = H ? -3 + halfView() : clamp(-100, sim);
        simRef.current = sim;
        finaleRef.current = 0;
      }

      if (p.running) sim.advance(dt, p.speed ?? 1);

      // Camera
      if (!dragging) {
        if (Math.abs(vel) > 0.01) {
          cam.y += vel * dt;
          vel *= Math.exp(-dt * 3.5);
        }
        if (glideRef.current != null) {
          // Looping: glide to the nearest copy, which may be across the seam.
          const goal = H ? nearest(glideRef.current, cam.y, H) : glideRef.current;
          cam.y += (goal - cam.y) * (1 - Math.exp(-dt * 4));
          if (Math.abs(goal - cam.y) < 0.02) glideRef.current = null;
        } else if (!p.editing && sim.started && now > manualUntil) {
          if (H) {
            // The flock's focus keeps descending (it is unwrapped), and every copy of the track
            // shows the same marbles, so following the nearest copy is one long smooth descent.
            cam.y += (nearest(sim.focusY(), cam.y, H) - cam.y) * (1 - Math.exp(-dt * 1.3));
          } else {
            const target = p.finale ? sim.totalHeight - 4 : sim.focusY();
            cam.y += (clamp(target, sim) - cam.y) * (1 - Math.exp(-dt * 1.3));
          }
        }
      }
      if (H) {
        // Let the plankton drift on with the camera, then fold the camera back into one period.
        // The view is identical every H, so the fold can't be seen, and nothing grows over hours.
        const drift = (cam.drift ?? prevY * cam.scale * 0.08) + (cam.y - prevY) * cam.scale * 0.08;
        cam.drift = mod(drift, MOTE_PERIOD * Math.max(1, renderer.height));
        cam.y = mod(cam.y, H);
      } else {
        cam.y = clamp(cam.y, sim);
        cam.drift = undefined;
      }
      prevY = cam.y;
      const targetScale = renderer.fitScale() * (p.editing ? 0.8 : 1);
      cam.scale += (targetScale - cam.scale) * (1 - Math.exp(-dt * 3));
      const targetOff = (p.insetLeft ?? 0) / 2;
      cam.offsetX = (cam.offsetX ?? targetOff) + (targetOff - (cam.offsetX ?? targetOff)) * (1 - Math.exp(-dt * 5));

      finaleRef.current += ((p.finale ? 1 : 0) - finaleRef.current) * (1 - Math.exp(-dt * 1.5));
      renderer.draw(sim, cam, (now - t0) / 1000, {
        editing: p.editing,
        highlightUid: p.highlightUid,
        finale: finaleRef.current,
      });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, []);

  return <canvas ref={canvasRef} className="stage" />;
}
