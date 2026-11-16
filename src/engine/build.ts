import { Box, Chain, Circle, Polygon, Vec2, type Body, type Fixture, type World } from 'planck';
import { COLUMN_W, PORT_X0, PORT_X1, WALL_FIXTURE } from './constants';
import type { Aabb, BuildContext, BuiltPart, FixtureStyle, Marble, Material, PartDef } from './types';

export interface FixtureData {
  style?: FixtureStyle;
  sensor?: { onEnter: (m: Marble) => void; onExit?: (m: Marble) => void };
  marble?: Marble;
  partIndex?: number;
  /** Material.calm: contacts take the lower restitution (see Simulation's contact listener). */
  calm?: boolean;
}

export function fixtureData(f: Fixture): FixtureData | null {
  return (f.getUserData() as FixtureData) ?? null;
}

/** Simple seeded PRNG (mulberry32). */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Build one part into the world at absolute y = originY. */
export function buildPart(
  world: World,
  def: PartDef,
  uid: string,
  originY: number,
  hue: number,
  partIndex: number,
): BuiltPart {
  const part: BuiltPart = {
    def,
    uid,
    originY,
    height: def.height,
    hue,
    bodies: [],
    updates: [],
    draws: [],
    holdZones: [],
  };

  const ground = world.createBody({ type: 'static', position: Vec2(0, originY) });
  part.bodies.push(ground);

  const mkStyle = (style?: Partial<FixtureStyle>): FixtureStyle => ({
    kind: 'line',
    hue,
    base: 0.55,
    width: 0.08,
    flash: 0,
    ...style,
  });

  const mat = (m?: Material) => {
    const { calm: _calm, ...rest } = m ?? {};
    return { ...WALL_FIXTURE, ...rest };
  };
  const pts = (p: [number, number][]) => p.map(([x, y]) => Vec2(x, y));

  const attach = (f: Fixture, style?: Partial<FixtureStyle>, m?: Material) => {
    const data: FixtureData = { style: mkStyle(style), partIndex };
    if (m?.calm) data.calm = true;
    f.setUserData(data);
    return f;
  };

  const ctx: BuildContext = {
    world,
    W: COLUMN_W,
    H: def.height,
    originY,
    hue,
    rng: makeRng(hashString(uid + def.id)),
    ground,
    v: (x, y) => Vec2(x, y + originY),

    wall(points, style, m) {
      if (points.length < 2) throw new Error(`${def.id}: wall needs ≥2 points`);
      return attach(ground.createFixture(new Chain(pts(points), false), mat(m)), style, m);
    },
    loop(points, style, m) {
      return attach(ground.createFixture(new Chain(pts(points), true), mat(m)), { kind: 'solid', ...style }, m);
    },
    circle(x, y, r, style, m) {
      return attach(ground.createFixture(new Circle(Vec2(x, y), r), mat(m)), { kind: 'peg', ...style }, m);
    },
    polygon(points, style, m) {
      return attach(ground.createFixture(new Polygon(pts(points)), mat(m)), { kind: 'solid', ...style }, m);
    },
    sensor(a: Aabb, onEnter, onExit) {
      const hw = (a.x1 - a.x0) / 2;
      const hh = (a.y1 - a.y0) / 2;
      const f = ground.createFixture(new Box(hw, hh, Vec2(a.x0 + hw, a.y0 + hh)), { isSensor: true });
      const data: FixtureData = { sensor: { onEnter, onExit }, partIndex };
      f.setUserData(data);
      return f;
    },
    body(type, x, y, opts) {
      const b: Body = world.createBody({
        type,
        position: Vec2(x, y + originY),
        angle: opts?.angle ?? 0,
        bullet: opts?.bullet ?? false,
        fixedRotation: opts?.fixedRotation ?? false,
      });
      part.bodies.push(b);
      return b;
    },
    styleFixture(f, style) {
      return attach(f, style);
    },
    funnelToOutlet(yTop, style) {
      const H = def.height;
      const neck = Math.min(1.2, (H - yTop) * 0.3);
      ctx.wall([[0, yTop], [PORT_X0, H - neck], [PORT_X0, H]], style);
      ctx.wall([[COLUMN_W, yTop], [PORT_X1, H - neck], [PORT_X1, H]], style);
    },
    holdZone(a) {
      part.holdZones.push({ x0: a.x0, y0: a.y0 + originY, x1: a.x1, y1: a.y1 + originY });
    },
    onUpdate(fn) {
      part.updates.push(fn);
    },
    onDraw(fn) {
      part.draws.push(fn);
    },
  };

  def.build(ctx);
  return part;
}
