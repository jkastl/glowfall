/**
 * World units. The track is a single vertical column COLUMN_W wide.
 * Y points DOWN (gravity is +y). Every part lives in local coordinates
 * x ∈ [0, COLUMN_W], y ∈ [0, part.height], origin at the part's top-left.
 */
export const COLUMN_W = 10;
export const MARBLE_R = 0.25;

/**
 * The universal port, GBC-style. Marbles ENTER every part through the top
 * edge within [PORT_X0, PORT_X1], travelling roughly downward (they may be
 * moving fast, up to ~14 u/s, and may have some sideways drift).
 * Every part MUST deliver every marble out through its bottom edge within the
 * same window, heading downward.
 */
export const PORT_CENTER = COLUMN_W / 2;
export const PORT_HALF = 1.1;
export const PORT_X0 = PORT_CENTER - PORT_HALF;
export const PORT_X1 = PORT_CENTER + PORT_HALF;

export const GRAVITY = 14;
export const STEP_DT = 1 / 120;

/** Default physics materials. */
export const MARBLE_FIXTURE = { density: 1.0, friction: 0.08, restitution: 0.35 };
export const WALL_FIXTURE = { density: 0, friction: 0.1, restitution: 0.25 };

/** Bioluminescent marble palette (hue, sat, light). `group` is used by sorters. */
export const MARBLE_COLORS = [
  { name: 'cyan', hue: 186, group: 'cool' as const },
  { name: 'violet', hue: 268, group: 'cool' as const },
  { name: 'jade', hue: 150, group: 'cool' as const },
  { name: 'rose', hue: 330, group: 'warm' as const },
  { name: 'amber', hue: 38, group: 'warm' as const },
];
export type ColorGroup = 'cool' | 'warm';

export const HOPPER_HEIGHT = 5;
