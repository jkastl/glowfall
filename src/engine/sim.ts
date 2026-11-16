import { Circle, Edge, Vec2, World, type Body, type Contact, type Fixture } from 'planck';
import { buildPart, fixtureData, makeRng, type FixtureData } from './build';
import {
  COLUMN_W,
  GRAVITY,
  MARBLE_COLORS,
  MARBLE_FIXTURE,
  MARBLE_R,
  PORT_CENTER,
  STEP_DT,
} from './constants';
import { collector, hopper, port } from './fixtures';
import type { BuiltPart, Marble, PartDef, TrackItem } from './types';

export interface HitEvent {
  x: number;
  y: number;
  /** Approach speed in world units / s. */
  speed: number;
  /** Pentatonic degree, or undefined for an untuned click. */
  note?: number;
  hue: number;
  kind: 'wall' | 'marble';
}

export interface SimOptions {
  marbleCount?: number;
  spawnInterval?: number;
  seed?: number;
  /** Optional palette restriction (indices into MARBLE_COLORS). */
  colors?: number[];
  /** Skip the hopper/collector (used by the part test harness & thumbnails). */
  bare?: boolean;
  /** Physics feel; both can also be changed live with setGravity/setBounce. */
  gravity?: number;
  bounce?: number;
  /**
   * Endless mode: the column is periodic. There is no collector; a marble that drops out of the
   * last part re-enters the source one track-height higher, and the run never finishes.
   */
  loop?: boolean;
}

/** Slider ranges for the run-feel controls (1 = as designed). */
export const GRAVITY_RANGE = { min: 0.3, max: 2, step: 0.05 } as const;
export const BOUNCE_RANGE = { min: 0, max: 2, step: 0.05 } as const;
/** Restitution never exceeds this, however lively the bounce setting. */
const MAX_RESTITUTION = 0.9;

const TRAIL_LEN = 18;
/** Only the most recent rescues are kept, so an endless run can't grow the log. */
const RESCUE_LOG_MAX = 200;
/** A looping marble wraps once it is this far below the last part, i.e. fully out of its outlet. */
const LOOP_MARGIN = MARBLE_R + 0.05;
/**
 * Fall-speed limit on a looping track, world units / s. Real parts keep marbles well under it; it
 * exists for a track that is (nearly) empty, where a marble would otherwise speed up lap after lap.
 */
const LOOP_MAX_FALL = 40;

/** Part accent hues drift through the bioluminescent band as you descend. */
function partHue(i: number): number {
  const band = [186, 200, 168, 230, 262, 290, 316, 176, 250, 148];
  return band[i % band.length];
}

export class Simulation {
  world: World;
  frame: Body;
  parts: BuiltPart[] = [];
  marbles: Marble[] = [];
  totalHeight = 0;
  t = 0;
  started = false;
  finished = false;
  finishedAt = 0;
  spawned = 0;
  rescues = 0;
  /** Where/why the most recent rescues happened (debugging part designs). Capped at RESCUE_LOG_MAX. */
  rescueLog: { t: number; x: number; y: number; part: string; reason: string }[] = [];
  /** Endless mode (see SimOptions.loop). */
  readonly loop: boolean;
  /**
   * Laps every marble has completed. Per-marble `laps` are kept relative to this, so they (and the
   * unwrapped positions the camera follows) stay small however long the run lasts.
   */
  lapBase = 0;
  readonly marbleCount: number;
  readonly spawnInterval: number;
  private nextSpawnAt = 0;
  private acc = 0;
  private rng: () => number;
  private pendingContacts: { a: Fixture; b: Fixture; c: Contact | null; begin: boolean; speed: number; x: number; y: number }[] = [];
  private nextId = 1;
  private colors: number[];
  /** Gravity multiplier (1 = GRAVITY). */
  gravity = 1;
  /** Restitution multiplier applied to each new contact (1 = as designed, 0 = dead). */
  bounce = 1;
  hitListeners: ((e: HitEvent) => void)[] = [];
  finishListeners: (() => void)[] = [];
  /** Fixtures with an active flash, so decay is cheap. */
  private flashing = new Set<FixtureData>();

  constructor(track: { item: TrackItem; def: PartDef }[], opts: SimOptions = {}) {
    this.marbleCount = opts.marbleCount ?? 30;
    this.spawnInterval = opts.spawnInterval ?? 0.45;
    this.rng = makeRng(opts.seed ?? 1234);
    this.colors = opts.colors ?? MARBLE_COLORS.map((_, i) => i);
    this.world = new World({ gravity: Vec2(0, GRAVITY) });
    this.setGravity(opts.gravity ?? 1);
    this.bounce = opts.bounce ?? 1;
    this.loop = !!opts.loop && !opts.bare;

    const seq: { uid: string; def: PartDef }[] = [];
    if (!opts.bare) seq.push({ uid: '__hopper', def: hopper });
    for (const t of track) {
      // A standard connector between consecutive parts calms each hand-over (see fixtures.ts).
      if (!opts.bare && seq.length > 0) seq.push({ uid: `__port${seq.length}`, def: port });
      seq.push({ uid: t.item.uid, def: t.def });
    }
    // Looping: no pool. The source doubles as the funnel at the seam.
    if (!opts.bare && !this.loop) seq.push({ uid: '__collector', def: collector });

    let y = 0;
    let hueIndex = -1;
    seq.forEach((s, i) => {
      // Connectors take the colour of the part above and don't advance the hue band.
      if (s.def !== port) hueIndex++;
      const built = buildPart(this.world, s.def, s.uid, y, partHue(Math.max(0, hueIndex)), i);
      this.parts.push(built);
      y += s.def.height;
    });
    this.totalHeight = y;

    // Column side walls: frame the whole track so nothing can escape sideways.
    const frame = (this.frame = this.world.createBody({ type: 'static' }));
    for (const x of [0, COLUMN_W]) {
      const f = frame.createFixture(new Edge(Vec2(x, -30), Vec2(x, y + 2)), { friction: 0.1, restitution: 0.2 });
      const data: FixtureData = { style: { kind: 'line', hue: 220, base: 0.12, width: 0.05, flash: 0 } };
      f.setUserData(data);
    }

    // Registered after the parts, so part listeners (e.g. turnstile's calm contacts) run first and
    // the bounce multiplier scales whatever they decided.
    this.world.on('begin-contact', (c) => {
      // Calm surfaces win the restitution mix (Box2D's default is max(a, b)).
      if (fixtureData(c.getFixtureA())?.calm || fixtureData(c.getFixtureB())?.calm) {
        c.setRestitution(Math.min(c.getFixtureA().getRestitution(), c.getFixtureB().getRestitution()));
      }
      if (this.bounce !== 1) c.setRestitution(Math.min(MAX_RESTITUTION, c.getRestitution() * this.bounce));
      this.onContact(c, true);
    });
    this.world.on('end-contact', (c) => this.onContact(c, false));
  }

  /** Live gravity change; wakes everything so resting bodies feel it. */
  setGravity(scale: number) {
    this.gravity = scale;
    this.world.setGravity(Vec2(0, GRAVITY * scale));
    for (let b = this.world.getBodyList(); b; b = b.getNext()) if (b.isDynamic()) b.setAwake(true);
  }

  /** Live bounce change; applies to contacts that begin from now on. */
  setBounce(scale: number) {
    this.bounce = scale;
  }

  onHit(fn: (e: HitEvent) => void) {
    this.hitListeners.push(fn);
  }
  onFinish(fn: () => void) {
    this.finishListeners.push(fn);
  }

  start() {
    this.started = true;
    this.nextSpawnAt = this.t;
  }

  /** Spawn a marble at an arbitrary world position (harness use). */
  spawnAt(x: number, y: number, vx = 0, vy = 0, colorIndex?: number): Marble {
    const ci = colorIndex ?? this.colors[Math.floor(this.rng() * this.colors.length)];
    const color = MARBLE_COLORS[ci];
    const body = this.world.createBody({
      type: 'dynamic',
      position: Vec2(x, y),
      bullet: true,
      linearDamping: 0.02,
      angularDamping: 0.05,
    });
    body.setLinearVelocity(Vec2(vx, vy));
    const m: Marble = {
      id: this.nextId++,
      body,
      hue: color.hue,
      group: color.group,
      colorIndex: ci,
      trail: [],
      laps: 0,
      collected: false,
      stillTime: 0,
      nudges: 0,
      bestY: y,
      bestYAt: this.t,
      fade: 0,
      lastSoundAt: -1,
    };
    const f = body.createFixture(new Circle(MARBLE_R), MARBLE_FIXTURE);
    const data: FixtureData = { marble: m };
    f.setUserData(data);
    this.marbles.push(m);
    return m;
  }

  private onContact(c: Contact, begin: boolean) {
    const a = c.getFixtureA();
    const b = c.getFixtureB();
    let speed = 0;
    let x = 0;
    let y = 0;
    if (begin) {
      const wm = c.getWorldManifold(null);
      if (wm && wm.pointCount > 0) {
        const p = wm.points[0];
        x = p.x;
        y = p.y;
        const va = a.getBody().getLinearVelocityFromWorldPoint(p);
        const vb = b.getBody().getLinearVelocityFromWorldPoint(p);
        speed = Math.abs((vb.x - va.x) * wm.normal.x + (vb.y - va.y) * wm.normal.y);
      }
    }
    // The world is locked during callbacks; handle after the step.
    this.pendingContacts.push({ a, b, c: null, begin, speed, x, y });
  }

  private flushContacts() {
    for (const pc of this.pendingContacts) {
      const da = fixtureData(pc.a);
      const db = fixtureData(pc.b);
      const ma = da?.marble;
      const mb = db?.marble;
      if (!ma && !mb) continue;
      const marble = (ma ?? mb)!;
      const other = ma ? db : da;

      if (other?.sensor) {
        if (pc.begin) other.sensor.onEnter(marble);
        else other.sensor.onExit?.(marble);
        continue;
      }
      if (!pc.begin) continue;

      if (ma && mb) {
        if (pc.speed > 0.8 && this.t - ma.lastSoundAt > 0.06) {
          ma.lastSoundAt = this.t;
          this.emitHit({ x: pc.x, y: pc.y, speed: pc.speed, hue: ma.hue, kind: 'marble' });
        }
        continue;
      }

      const style = other?.style;
      if (!style) continue;
      if (pc.speed > 0.5) {
        style.flash = Math.min(1, (style.flash ?? 0) + Math.min(1, pc.speed / 5));
        this.flashing.add(other!);
      }
      if (pc.speed > 0.9 && this.t - marble.lastSoundAt > 0.07) {
        marble.lastSoundAt = this.t;
        this.emitHit({ x: pc.x, y: pc.y, speed: pc.speed, note: style.note, hue: style.hue ?? marble.hue, kind: 'wall' });
      }
    }
    this.pendingContacts.length = 0;
  }

  private emitHit(e: HitEvent) {
    for (const fn of this.hitListeners) fn(e);
  }

  /** Advance by real frame time (seconds), using fixed sub-steps. `speed` scales time. */
  advance(frameDt: number, speed = 1) {
    this.acc += Math.min(frameDt, 0.1) * speed;
    let n = 0;
    while (this.acc >= STEP_DT && n < 12) {
      this.step(STEP_DT);
      this.acc -= STEP_DT;
      n++;
    }
    if (n === 12) this.acc = 0;
  }

  step(dt: number) {
    this.t += dt;

    if (this.started && this.spawned < this.marbleCount && this.t >= this.nextSpawnAt) {
      const jitter = (this.rng() - 0.5) * 0.6;
      const m = this.spawnAt(PORT_CENTER + jitter, -0.8, 0, 0.5);
      this.spawned++;
      m.fade = 0;
      this.nextSpawnAt = this.t + this.spawnInterval;
    }

    for (const p of this.parts) for (const u of p.updates) u(dt, this.t);

    this.world.step(dt, 8, 3);
    this.flushContacts();

    // Flash decay.
    const decay = Math.exp(-dt * 2.2);
    for (const d of this.flashing) {
      d.style!.flash = (d.style!.flash ?? 0) * decay;
      if (d.style!.flash! < 0.01) {
        d.style!.flash = 0;
        this.flashing.delete(d);
      }
    }

    for (const m of this.marbles) this.tendMarble(m, dt);

    if (this.loop) this.shedLaps();

    if (
      !this.loop &&
      !this.finished &&
      this.started &&
      this.spawned >= this.marbleCount &&
      this.marbleCount > 0 &&
      this.marbles.every((m) => m.collected)
    ) {
      if (!this.finishedAt) this.finishedAt = this.t;
      if (this.t - this.finishedAt > 1.2) {
        this.finished = true;
        for (const fn of this.finishListeners) fn();
      }
    }
  }

  /**
   * Once every marble has a lap behind it, take one off them all. The per-marble counts are only
   * ever compared with each other, so this is invisible; it just keeps them from growing.
   */
  private shedLaps() {
    if (this.spawned < this.marbleCount || this.marbles.length === 0) return;
    for (const m of this.marbles) if (m.laps < 1) return;
    for (const m of this.marbles) m.laps--;
    this.lapBase++;
  }

  /** Carry a marble that has left the bottom of a looping track back to the top: same x, same motion. */
  private wrap(m: Marble) {
    const H = this.totalHeight;
    const p = m.body.getPosition();
    m.body.setPosition(Vec2(p.x, p.y - H));
    // Move the trail with it, so the periodic renderer draws one unbroken streak across the seam.
    for (const q of m.trail) q.y -= H;
    m.laps++;
    // A fresh lap gets a fresh anti-jam record; otherwise "furthest point reached" would sit a lap
    // below the marble, and nudges collected over many laps would add up to a false "stuck".
    m.bestY = p.y - H;
    m.bestYAt = this.t;
    m.stillTime = 0;
    m.nudges = 0;
  }

  /** Trails, fades and anti-jam care for one marble. */
  private tendMarble(m: Marble, dt: number) {
    if (this.loop && m.body.getPosition().y > this.totalHeight + LOOP_MARGIN) this.wrap(m);
    const p = m.body.getPosition();
    m.fade = Math.min(1, m.fade + dt * 3);

    const tr = m.trail;
    tr.push({ x: p.x, y: p.y });
    if (tr.length > TRAIL_LEN) tr.shift();

    if (m.collected) return;

    // Escaped or broken?
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < -0.6 || p.x > COLUMN_W + 0.6 || p.y > this.totalHeight + 3) {
      this.rescue(m, this.partIndexAt(m.bestY), 'escaped');
      return;
    }

    if (p.y > m.bestY + 0.4) {
      m.bestY = p.y;
      m.bestYAt = this.t;
    }

    const v = m.body.getLinearVelocity();
    if (this.loop && v.y > LOOP_MAX_FALL) m.body.setLinearVelocity(Vec2(v.x, LOOP_MAX_FALL));
    const speed = Math.hypot(v.x, v.y);
    const held = this.inHoldZone(p.x, p.y);

    if (speed < 0.12) m.stillTime += dt;
    else m.stillTime = Math.max(0, m.stillTime - dt * 2);

    // Low gravity slows everything down; give the anti-jam proportionally more patience.
    const patience = this.gravity < 1 ? 1 / Math.sqrt(this.gravity) : 1;
    const stillLimit = (held ? 25 : 1.4) * patience;
    if (m.stillTime > stillLimit) {
      // Gentle nudge: mostly sideways, a little lift. Escalates with repeated nudges.
      const dir = this.rng() < 0.5 ? -1 : 1;
      const k = 0.06 * (1 + m.nudges * 0.6);
      m.body.applyLinearImpulse(Vec2(dir * k, -k * 0.6), m.body.getWorldCenter(), true);
      m.nudges++;
      m.stillTime = 0;
      if (m.nudges > 6) this.rescue(m, this.partIndexAt(p.y) + 1, 'stuck');
    }

    // No downward progress for a long time (endless bouncing, trapped loops).
    const progressLimit = (held ? 40 : 18) * patience;
    if (this.t - m.bestYAt > progressLimit) {
      this.rescue(m, this.partIndexAt(p.y) + 1, 'no-progress');
    }
  }

  private inHoldZone(x: number, y: number) {
    for (const p of this.parts) {
      if (y < p.originY || y > p.originY + p.height) continue;
      for (const z of p.holdZones) if (x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1) return true;
    }
    return false;
  }

  partIndexAt(y: number): number {
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i];
      if (y < p.originY + p.height) return i;
    }
    return this.parts.length - 1;
  }

  /**
   * Quietly teleport a marble to the inlet of part `index` (fades back in).
   * On a looping track, one past the last part means the top again, and counts as a lap.
   */
  rescue(m: Marble, index: number, reason = 'manual') {
    const from = m.body.getPosition();
    const fromPart = this.parts[this.partIndexAt(from.y)];
    this.rescueLog.push({
      t: this.t,
      x: from.x,
      y: fromPart ? from.y - fromPart.originY : from.y,
      part: fromPart?.def.id ?? '?',
      reason,
    });
    if (this.rescueLog.length > RESCUE_LOG_MAX) this.rescueLog.shift();
    if (this.loop && index >= this.parts.length) {
      index = 0;
      m.laps++;
    }
    const i = Math.max(0, Math.min(index, this.parts.length - 1));
    const target = this.parts[i];
    const x = PORT_CENTER + (this.rng() - 0.5) * 0.5;
    const y = target.originY + 0.35;
    m.body.setPosition(Vec2(x, y));
    m.body.setLinearVelocity(Vec2(0, 0.5));
    m.body.setAngularVelocity(0);
    m.body.setAwake(true);
    m.trail.length = 0;
    m.fade = 0;
    m.stillTime = 0;
    m.nudges = 0;
    m.bestY = y;
    m.bestYAt = this.t;
    this.rescues++;
  }

  /**
   * Where the camera should look: the heart of the moving flock.
   * On a looping track this is in unwrapped coordinates (y + laps × totalHeight), so it keeps
   * descending across the seam. It drops by one totalHeight whenever a lap is shed; the track
   * looks the same every totalHeight, so the camera follows whichever copy is nearest.
   */
  focusY(): number {
    const active = this.marbles.filter((m) => !m.collected);
    if (active.length === 0) {
      if (this.marbles.length > 0) return this.totalHeight - 5;
      return 6;
    }
    const H = this.loop ? this.totalHeight : 0;
    const ys = active.map((m) => m.body.getPosition().y + m.laps * H).sort((a, b) => a - b);
    // Lean toward the leaders a bit so you see where things are heading.
    return ys[Math.floor(ys.length * 0.6)] + 1.5;
  }

  /** The lap the middle of the flock is on, counting from 1 (looping tracks). */
  lap(): number {
    if (this.marbles.length === 0) return 1;
    const laps = this.marbles.map((m) => m.laps).sort((a, b) => a - b);
    return this.lapBase + laps[laps.length >> 1] + 1;
  }

  /** Laps completed by all marbles together (looping tracks). */
  totalLaps(): number {
    let n = this.lapBase * this.marbles.length;
    for (const m of this.marbles) n += m.laps;
    return n;
  }

  collectedCount() {
    let n = 0;
    for (const m of this.marbles) if (m.collected) n++;
    return n;
  }
}
