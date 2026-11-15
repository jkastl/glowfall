import { fixtureData } from '../engine/build';
import type { Marble, PartDef } from '../engine/types';
import { flashOf, sample, type Pt } from './lib/flowgeo';

/**
 * Vortex: a spiral arm sweeps marbles to the rim of a wide bowl. They swish back
 * and forth across it, losing a little energy to the "water" on every pass, and
 * once they are slow enough at the bottom they sink through the glowing eye of
 * the whirlpool into the outlet.
 *
 * How the drain works: the bowl is ONE unbroken chain (perfectly smooth rolling).
 * A marble that is slow and at the centre is flagged as "sinking", and a pre-solve
 * hook switches off its contact with the bowl so it drops through into the throat.
 * The bowl is a strict valley (no flats), so every marble ends up slow at the centre.
 */
const YB = 8.6; // bowl bottom
const DEPTH = 4.3;
const HALF = 4.95;
const THROAT = 0.9; // half-width of the drain throat
const DRAG = 0.3; // 1/s velocity decay while in the bowl
const SINK_SPEED = 2.0;

const bowlY = (x: number) => YB - DEPTH * Math.pow(Math.abs(x - 5) / HALF, 2.1);

const vortex: PartDef = {
  id: 'vortex',
  name: 'Vortex',
  blurb: 'Swish, swish, sink. A whirlpool with a glowing eye.',
  height: 11,
  build(ctx) {
    const { H } = ctx;
    const hue2 = ctx.hue + 50;

    // Spiral arm: catches the inlet stream and lays it onto the left rim.
    ctx.wall(
      [[7.3, 0.35], ...sample((u): Pt => [6.9 - 5.4 * u, 1.0 + 1.9 * (0.3 * u + 0.7 * u * u)], 20)],
      { note: 2, hue: hue2 },
      { restitution: 0.05, friction: 0.2 },
    );

    // The bowl. Collision uses one hidden chain; the two visible halves are
    // non-colliding twins that stop at the throat, so the eye looks open.
    const bowlPts = sample((u): Pt => {
      const x = 5 - HALF + 2 * HALF * u;
      return [x, bowlY(x)];
    }, 72);
    const bowl = ctx.wall(bowlPts, { kind: 'hidden', note: 0 }, { restitution: 0.05, friction: 0.25 });
    const noCollide = { groupIndex: 0, categoryBits: 0x0002, maskBits: 0 };
    const visL = ctx.wall(bowlPts.filter((p) => p[0] <= 5 - THROAT + 1e-6), { hue: ctx.hue });
    const visR = ctx.wall(bowlPts.filter((p) => p[0] >= 5 + THROAT - 1e-6), { hue: ctx.hue });
    visL.setFilterData(noCollide);
    visR.setFilterData(noCollide);
    const styleOf = (f: typeof bowl) => fixtureData(f)!.style!;
    const sBowl = styleOf(bowl);
    const sL = styleOf(visL);
    const sR = styleOf(visR);

    // Throat below the eye, straight down into the port.
    const yT = bowlY(5 - THROAT);
    ctx.wall([[5 - THROAT, yT], [5 - THROAT, H]], { hue: ctx.hue, base: 0.45 });
    ctx.wall([[5 + THROAT, yT], [5 + THROAT, H]], { hue: ctx.hue, base: 0.45 });

    const inBowl = new Map<Marble, number>(); // marble → seconds spent in the bowl
    const sinking = new Set<Marble>();
    ctx.sensor(
      { x0: 0, y0: 3.2, x1: 10, y1: YB + 0.15 },
      (m) => {
        if (!inBowl.has(m)) inBowl.set(m, 0);
      },
      (m) => {
        inBowl.delete(m);
        sinking.delete(m);
      },
    );

    ctx.world.on('pre-solve', (c) => {
      if (sinking.size === 0) return;
      const a = c.getFixtureA();
      const b = c.getFixtureB();
      const other = a === bowl ? b : b === bowl ? a : null;
      if (!other) return;
      const m = fixtureData(other)?.marble;
      if (m && sinking.has(m)) c.setEnabled(false);
    });

    ctx.onUpdate((dt) => {
      sL.flash = sR.flash = sBowl.flash;
      const k = 1 - DRAG * dt;
      for (const [m, age] of inBowl) {
        inBowl.set(m, age + dt);
        const body = m.body;
        const v = body.getLinearVelocity();
        const p = body.getPosition();
        const lx = p.x - 5;
        if (sinking.has(m)) {
          // drawn into the eye: steer to the centreline so it can only go down the throat
          body.setLinearVelocity({ x: -lx * 4, y: v.y * k });
          continue;
        }
        // A current toward the eye that strengthens with time spent swishing.
        const pull = age > 4 ? Math.min(8, (age - 4) * 2) * dt : 0;
        body.setLinearVelocity({ x: v.x * k - (lx > 0 ? pull : -pull), y: v.y * k });
        // The eye gets hungrier the longer a marble has been swishing, so traffic
        // from newer arrivals can never keep one aloft indefinitely.
        const limit = SINK_SPEED + (age > 3 ? age - 3 : 0);
        if (lx > -0.55 && lx < 0.55 && p.y - ctx.originY > YB - 0.8 && v.x * v.x + v.y * v.y < limit * limit) {
          sinking.add(m);
          body.setAwake(true);
        }
      }
    });

    // The eye: shimmering membrane across the throat + whirl rings drawn in perspective.
    ctx.onDraw((g, t) => {
      const flash = flashOf(bowl);
      g.lineCap = 'round';
      for (let k = 0; k < 4; k++) {
        const ph = 1 - ((t * 0.22 + k / 4) % 1); // rings contract toward the eye
        const rx = 0.35 + ph * 3.1;
        const a = Math.sin(ph * Math.PI) * (0.1 + flash * 0.15);
        g.strokeStyle = `hsla(${ctx.hue + 50 - ph * 50}, 100%, 66%, ${a})`;
        g.lineWidth = 0.05;
        g.beginPath();
        g.ellipse(5, bowlY(5 - rx) - 0.32, rx * 0.86, rx * 0.2, 0, Math.PI * 1.08, Math.PI * 1.92);
        g.stroke();
      }
      const grad = g.createRadialGradient(5, YB, 0, 5, YB, 1.3);
      grad.addColorStop(0, `hsla(${hue2}, 100%, 70%, ${0.22 + 0.06 * Math.sin(t * 1.3)})`);
      grad.addColorStop(1, `hsla(${hue2}, 100%, 60%, 0)`);
      g.fillStyle = grad;
      g.beginPath();
      g.arc(5, YB, 1.3, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = `hsla(${hue2}, 100%, 75%, 0.35)`;
      g.lineWidth = 0.05;
      g.setLineDash([0.12, 0.2]);
      g.lineDashOffset = -t * 0.25;
      g.beginPath();
      for (let i = 0; i <= 8; i++) {
        const x = 5 - THROAT + (2 * THROAT * i) / 8;
        if (i === 0) g.moveTo(x, bowlY(x));
        else g.lineTo(x, bowlY(x));
      }
      g.stroke();
      g.setLineDash([]);
    });
  },
};

export default vortex;
