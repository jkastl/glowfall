import type { Body, Fixture, Vec2Value, World } from 'planck';
import type { ColorGroup } from './constants';

/** How the renderer draws a fixture. Attach via `fixture.setUserData(style)` or the ctx helpers. */
export interface FixtureStyle {
  /** 'line' = glowing stroke; 'solid' = filled + stroked; 'peg' = small bright dot;
   *  'hidden' = not drawn (invisible guides). Sensors are never drawn. */
  kind: 'line' | 'solid' | 'peg' | 'hidden';
  /** Hue 0–360. Defaults to the part's accent hue. */
  hue?: number;
  /** 0..1 brightness at rest. Default 0.55. */
  base?: number;
  /** Pentatonic scale degree (0 = root, can go negative or > 5 for octaves). If omitted, impacts are silent-ish clicks. */
  note?: number;
  /** Line width in world units. Default 0.08. */
  width?: number;
  /** Mutable: current flash level, set by the engine on impact and decays. Do not set. */
  flash?: number;
}

export interface Marble {
  id: number;
  body: Body;
  hue: number;
  group: ColorGroup;
  colorIndex: number;
  /** Ring buffer of recent world positions for trails. */
  trail: { x: number; y: number }[];
  /** Looping tracks: trips through the whole column, relative to Simulation.lapBase. */
  laps: number;
  collected: boolean;
  stillTime: number;
  nudges: number;
  /** Highest y (furthest down) reached and when; used for no-progress detection. */
  bestY: number;
  bestYAt: number;
  /** 0..1 fade used for spawn / rescue teleport. */
  fade: number;
  lastSoundAt: number;
}

export interface Aabb {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface BuildContext {
  world: World;
  /** Column width (= COLUMN_W). */
  W: number;
  /** This part's height (= def.height). */
  H: number;
  /** Absolute world y of this part's top edge. You rarely need it — use the helpers / v(). */
  originY: number;
  /** Accent hue assigned to this part. */
  hue: number;
  /** Seeded RNG in [0,1). */
  rng: () => number;

  /** Convert local part coords -> world coords. */
  v(x: number, y: number): Vec2Value;

  /** Static glowing polyline (a Box2D chain: smooth rolling across joints). Local coords. */
  wall(points: [number, number][], style?: Partial<FixtureStyle>, mat?: Material): Fixture;
  /** Closed static loop (e.g. an obstacle outline). */
  loop(points: [number, number][], style?: Partial<FixtureStyle>, mat?: Material): Fixture;
  /** Static circle (peg / bumper). */
  circle(x: number, y: number, r: number, style?: Partial<FixtureStyle>, mat?: Material): Fixture;
  /** Static convex polygon, local coords. */
  polygon(points: [number, number][], style?: Partial<FixtureStyle>, mat?: Material): Fixture;
  /** Sensor (not drawn, not solid). `onEnter` fires (outside the physics step) with the marble. */
  sensor(aabb: Aabb, onEnter: (m: Marble) => void, onExit?: (m: Marble) => void): Fixture;

  /** Create a body (dynamic/kinematic/static) at local (x,y). It is drawn automatically.
   *  Add fixtures with body.createFixture(shape, {...}) using BODY-LOCAL coordinates,
   *  and call ctx.styleFixture(fixture, style) to set how it renders. */
  body(type: 'dynamic' | 'kinematic' | 'static', x: number, y: number, opts?: { angle?: number; bullet?: boolean; fixedRotation?: boolean }): Body;
  styleFixture(f: Fixture, style?: Partial<FixtureStyle>): Fixture;
  /** The part's own static anchor body (positioned at the part's top-left). Use as bodyA for joints. */
  ground: Body;

  /** Converging walls from full width at yTop down to the port window at the part's bottom edge (y = H). */
  funnelToOutlet(yTop: number, style?: Partial<FixtureStyle>): void;
  /** Declare a region where marbles are ALLOWED to sit still (e.g. a tipping bucket). Anti-jam skips it (up to 25 s). */
  holdZone(aabb: Aabb): void;

  /** Called every physics step while running. dt in seconds, t = sim time. */
  onUpdate(fn: (dt: number, t: number) => void): void;
  /** Extra decorative drawing. The canvas transform is set so you draw in LOCAL part units (1 = one world unit). */
  onDraw(fn: (g: CanvasRenderingContext2D, t: number) => void): void;
}

export interface Material {
  friction?: number;
  restitution?: number;
  density?: number;
}

export interface PartDef {
  /** Stable id, kebab-case, also the filename. */
  id: string;
  name: string;
  /** One short evocative line for the palette. */
  blurb: string;
  /** Height in world units (column is 10 wide). Typically 8–24. */
  height: number;
  /** Builds the part's geometry/mechanisms into the world. */
  build(ctx: BuildContext): void;
  /** Hidden parts (hopper, collector) don't show in the palette. */
  hidden?: boolean;
}

/** One built part instance in the world. */
export interface BuiltPart {
  def: PartDef;
  uid: string;
  originY: number;
  height: number;
  hue: number;
  bodies: Body[];
  updates: ((dt: number, t: number) => void)[];
  draws: ((g: CanvasRenderingContext2D, t: number) => void)[];
  holdZones: Aabb[];
}

export interface TrackItem {
  uid: string;
  partId: string;
}
