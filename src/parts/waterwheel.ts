import { Box, Circle, RevoluteJoint, Vec2 } from 'planck';
import type { PartDef } from '../engine/types';
import { PORT_X0 } from '../engine/constants';
import { bez, glow, jewel, mirror, type Pt } from './lib/mech';

/**
 * Waterwheel — an overshot wheel turned only by the weight of the marbles it carries.
 *
 * A spout lays marbles onto the descending (right) side of a free wheel of slim spokes, each with a
 * small lip at its tip. Their weight alone turns the wheel clockwise: light drag lets even a single
 * marble move it, an eddy brake that only bites above a slow cruising speed keeps a full wheel calm,
 * it coasts to rest when empty, and a pawl stops it ever turning backwards. Each lip
 * cradles its marbles down the right side and lets them go just before six o'clock, so nothing is
 * ever carried back up.
 */
const CX = 4.4;
const CY = 7.3;
const HUB = 0.55;
const TIP = 2.9;
const N = 8;
const LIP = 0.42;
const LIP_FLARE = 0.45; // rad the lip leans outward, so pockets empty before the bottom
const DENSITY = 1.2;
const DAMPING = 1.2; // light viscous drag (1/s): even one marble turns it
const CRUISE = 0.6; // rad/s above which the eddy brake bites
const EDDY = 12; // eddy-brake strength (1/s)
const BRAKE_TORQUE = 0.15; // dry friction in the bearing
const MAX_SPIN = 1.8; // rad/s, a governor that should never need to act

const waterwheel: PartDef = {
  id: 'waterwheel',
  name: 'Waterwheel',
  blurb: 'Marbles ride the paddles round, and their weight turns the wheel.',
  height: 14,
  build(ctx) {
    const { H, hue } = ctx;
    const hueWheel = hue + 8;
    const hueLip = hue + 95;

    // --- Inlet: a funnel whose spout hangs over the one-o'clock pockets, well clear of the paddle tips.
    const s0 = 5.3;
    const s1 = s0 + 0.95;
    const sy = 3.85;
    ctx.wall([[0.25, 0.5], ...bez([0.35, 1.2], [3.6, 1.7], [s0, sy - 0.75], 14), [s0, sy]], { note: 0, base: 0.5 });
    ctx.wall([[9.75, 0.5], ...bez([9.7, 1.3], [7.6, 2.1], [s1, sy - 0.75], 12), [s1, sy]], { note: 2, base: 0.5 });

    // --- The wheel.
    const wheel = ctx.body('dynamic', CX, CY);
    const mat = { density: DENSITY, friction: 0.15, restitution: 0.05 };
    ctx.styleFixture(wheel.createFixture(new Circle(Vec2(0, 0), HUB), mat), { kind: 'line', hue: hueWheel, base: 0.8, note: -3, width: 0.07 });
    const notes = [0, 2, 4, 1, 3, 5, 2, 4];
    const len = TIP - HUB;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const mid = HUB + len / 2;
      ctx.styleFixture(wheel.createFixture(new Box(len / 2, 0.04, Vec2(c * mid, s * mid), a), mat), {
        kind: 'line',
        hue: hueWheel,
        base: 0.75,
        note: notes[i],
        width: 0.065,
      });
      // Lip: from the tip, back against the rotation (−tangent), leaning outward a little.
      const lx = Math.sin(a) * Math.cos(LIP_FLARE) + c * Math.sin(LIP_FLARE);
      const ly = -Math.cos(a) * Math.cos(LIP_FLARE) + s * Math.sin(LIP_FLARE);
      const tx = c * (TIP - 0.03);
      const ty = s * (TIP - 0.03);
      ctx.styleFixture(
        wheel.createFixture(new Box(LIP / 2, 0.04, Vec2(tx + (lx * LIP) / 2, ty + (ly * LIP) / 2), Math.atan2(ly, lx)), mat),
        { kind: 'line', hue: hueLip, base: 0.9, note: notes[i] + 5, width: 0.065 },
      );
    }
    wheel.setAngularDamping(DAMPING);
    ctx.world.createJoint(
      new RevoluteJoint({ enableMotor: true, motorSpeed: 0, maxMotorTorque: BRAKE_TORQUE }, ctx.ground, wheel, ctx.v(CX, CY)),
    );
    // Pawl + governor: never backwards, never runaway.
    const inertia = wheel.getInertia();
    ctx.onUpdate(() => {
      const w = wheel.getAngularVelocity();
      if (w > CRUISE) wheel.applyTorque(-inertia * EDDY * (w - CRUISE), true);
      if (w < 0) wheel.setAngularVelocity(0);
      else if (w > MAX_SPIN) wheel.setAngularVelocity(MAX_SPIN);
    });

    // Riders near the hub can move slowly on a lightly loaded wheel: that's fine, not a jam.
    ctx.holdZone({ x0: CX - TIP, y0: CY - TIP, x1: CX + TIP, y1: CY + TIP });

    // --- Tail race: a curved basin back to the outlet, well clear of the paddle tips.
    const basin: Pt[] = [...bez([0.15, CY + 1.2], [0.6, H - 1.0], [PORT_X0, H - 0.75], 14), [PORT_X0, H]];
    ctx.wall(basin, { base: 0.45, note: -4 });
    ctx.wall(mirror(basin), { base: 0.45, note: -2 });

    // --- Decoration: hub jewel, a faint rim, and short motion arcs trailing each lip.
    ctx.onDraw((g) => {
      const w = wheel.getAngularVelocity();
      const a0 = wheel.getAngle();
      const speed = Math.min(1, w / CRUISE);
      g.lineCap = 'round';
      g.lineWidth = 0.035;
      g.strokeStyle = `hsla(${hueWheel}, 100%, 66%, 0.13)`;
      g.beginPath();
      g.arc(CX, CY, TIP + 0.12, 0, Math.PI * 2);
      g.stroke();
      if (speed > 0.02) {
        const span = 0.12 + speed * 0.5;
        for (let k = 0; k < 3; k++) {
          g.lineWidth = 0.07 - k * 0.018;
          g.strokeStyle = `hsla(${hueLip}, 100%, 72%, ${(0.42 - k * 0.12) * speed})`;
          g.beginPath();
          for (let i = 0; i < N; i++) {
            const a = a0 + (i / N) * Math.PI * 2;
            const e = a - span * (k / 3);
            const b = a - span * ((k + 1) / 3);
            g.moveTo(CX + (TIP + 0.12) * Math.cos(e), CY + (TIP + 0.12) * Math.sin(e));
            g.arc(CX, CY, TIP + 0.12, e, b, true);
          }
          g.stroke();
        }
      }
      glow(g, CX, CY, 1.4, hueWheel, 0.08 + speed * 0.12);
      jewel(g, CX, CY, 0.2, hueLip, speed * 0.5);
    });
  },
};

export default waterwheel;
