import { Box, Polygon, RevoluteJoint, Vec2 } from 'planck';
import type { PartDef } from '../engine/types';
import { bez, glow, jewel, mirror, spline, type Pt } from './lib/mech';

/**
 * Flip-Flop — a bistable rocker that sends marbles alternately left and right.
 *
 * A glass shelf carries arrivals right, a curved wall turns them back onto a gentle ramp, and they
 * queue in a slim chute above the rocker: gull wings on a limited pivot, with a mast carrying a small
 * crown, an arc concentric with the pivot. At rest the crown covers the chute's lowered-arm half, so
 * the bottom marble can only drop past its other edge. That marble knocks the rocker over: the crown
 * sweeps under the chute (holding back the queue, and since it is concentric the waiting marble rides
 * it without pushing), and lets the next one go only past its far edge, on the other side.
 * Alternation is built into the geometry, however bunched the arrivals.
 */
const PX = 5; // pivot
const PY = 6.3;
const TILT = 0.5; // rad, limit either side
const R = 0.95; // crown radius (top surface)
const BETA = 0.17; // crown half-angle
const ARM = 1.35;
const ARM_DROOP = 0.6; // rad below horizontal at neutral: even the raised arm sheds outward
const HOLD_TORQUE = 1;
const FLIP_TORQUE = 6;
const FLIP_SPEED = 7;
const KICK = 0.35;

const flipFlop: PartDef = {
  id: 'flip-flop',
  name: 'Flip-Flop',
  blurb: 'A rocker that says left, right, left, right.',
  height: 13,
  build(ctx) {
    const { H, hue } = ctx;
    const hueL = hue - 22;
    const hueR = hue + 38;
    const hueCrown = 318; // magenta: the one warm-ish accent, so the moving bits catch the eye

    // --- Inlet. The shelf catches every arrival and rolls it right; the right wall curls it back onto a
    // gentle ramp that feeds the chute from one side, against a backstop, so it fills single file.
    const half = 0.34;
    const tl = PX - half;
    const tr = PX + half;
    const chuteBot = PY - R - 0.12;
    const chuteTop = chuteBot - 0.3;
    const k = 0.08; // tube slope
    const floorY = (x: number) => chuteTop - (x - tr) * k;
    const gap = 0.7; // tube headroom: one marble, never two
    const shelf: Pt[] = [...bez([2.2, 0.1], [2.55, 0.8], [4.4, 0.97], 8), ...bez([4.4, 0.97], [6.3, 1.2], [7.75, 2.5], 10).slice(1)];
    ctx.wall(shelf, { note: 5, base: 0.55 });
    // Tube ceiling, turning down into the chute's back wall.
    const fx = 7.0; // flared mouth: stacked arrivals are guided in, never wedged
    ctx.wall(
      [...bez([fx + 0.55, floorY(fx) - gap - 0.75], [fx, floorY(fx) - gap - 0.05], [fx - 0.6, floorY(fx - 0.6) - gap], 8), [tl, floorY(tl) - gap], [tl, chuteBot]],
      { note: 3, base: 0.45 },
    );
    // Right wall curling into the tube floor.
    ctx.wall(
      [[9.85, 1.4], ...spline([[9.85, 2.4], [9.75, 3.6], [9.0, floorY(9.0) - 0.05], [8.0, floorY(8.0)]], 6), [tr, chuteTop], [tr, chuteBot]],
      { note: 1, base: 0.5 },
    );
    ctx.holdZone({ x0: tl, y0: 1.5, x1: 10, y1: chuteBot + 0.3 });

    // --- The rocker: two slim wings, a mast, and the crown.
    const rocker = ctx.body('dynamic', PX, PY);
    const solid = { friction: 0.05, restitution: 0.05 };
    for (const side of [-1, 1]) {
      const a = side * ARM_DROOP; // arm direction: outward and down
      const cx = (side * Math.cos(ARM_DROOP) * ARM) / 2;
      const cy = (Math.sin(ARM_DROOP) * ARM) / 2;
      ctx.styleFixture(rocker.createFixture(new Box(ARM / 2, 0.045, Vec2(cx, cy), a), { density: 0.3, ...solid }), {
        kind: 'solid',
        hue: side < 0 ? hueL : hueR,
        note: side < 0 ? 0 : 2,
        base: 0.85,
        width: 0.075,
      });
    }
    ctx.styleFixture(rocker.createFixture(new Box(0.035, (R - 0.1) / 2, Vec2(0, -(R - 0.1) / 2), 0), { density: 0.3, ...solid }), {
      kind: 'solid',
      hue: hueCrown,
      base: 0.75,
      note: 4,
      width: 0.05,
    });
    // Crown: outer arc + straight underside → convex.
    const crown: ReturnType<typeof Vec2>[] = [];
    for (let i = 0; i <= 6; i++) {
      const a = -BETA + (2 * BETA * i) / 6;
      crown.push(Vec2(R * Math.sin(a), -R * Math.cos(a)));
    }
    crown.push(Vec2((R - 0.1) * Math.sin(BETA), -(R - 0.1) * Math.cos(BETA)));
    crown.push(Vec2(-(R - 0.1) * Math.sin(BETA), -(R - 0.1) * Math.cos(BETA)));
    ctx.styleFixture(rocker.createFixture(new Polygon(crown), { density: 1.2, ...solid }), {
      kind: 'solid',
      hue: hueCrown,
      base: 0.95,
      note: 7,
      width: 0.06,
    });
    rocker.setAngularDamping(0.3);
    const joint = ctx.world.createJoint(
      new RevoluteJoint(
        { enableLimit: true, lowerAngle: -TILT, upperAngle: TILT, enableMotor: true, maxMotorTorque: HOLD_TORQUE },
        ctx.ground,
        rocker,
        ctx.v(PX, PY),
      ),
    )!;
    // `lean` = which way the mast leans (+1 = right: crown covers the right half, right arm lowered).
    let lean = ctx.rng() < 0.5 ? -1 : 1;
    let kick = 0;
    let flipAt = -10; // sim time of the last flip, for the decoration
    let now = 0;
    rocker.setTransform(rocker.getPosition(), lean * TILT);
    joint.setMotorSpeed(lean * FLIP_SPEED);
    // A marble dropping past the crown's free edge knocks the rocker over towards its side (a short
    // motor kick stands in for the knock, so the flip always completes, whatever else is going on).
    ctx.sensor({ x0: PX - 0.75, y0: PY - R + 0.08, x1: PX + 0.75, y1: PY - R + 0.5 }, (m) => {
      // It passed on the far side of the crown (the crown always covers one half of the chute).
      const side = m.body.getPosition().x > PX + R * Math.sin(rocker.getAngle()) ? 1 : -1;
      if (lean === side) return;
      lean = side;
      kick = KICK;
      flipAt = now;
      joint.setMaxMotorTorque(FLIP_TORQUE);
      joint.setMotorSpeed(lean * FLIP_SPEED);
    });
    ctx.onUpdate((dt, t) => {
      now = t;
      if (kick > 0) {
        kick -= dt;
        if (kick <= 0) joint.setMaxMotorTorque(HOLD_TORQUE);
      }
    });

    // --- Two slender lanes either side of a hollow, leaf-shaped divider, curving back together.
    const leafL = spline([[5, 7.8], [4.2, 8.15], [3.45, 8.8], [3.1, 9.7], [3.3, 10.6], [3.95, 11.35], [4.7, 11.9], [5, 12.15]], 6);
    ctx.loop([...leafL, ...mirror(leafL).reverse().slice(1, -1)], { kind: 'line', note: -2, base: 0.5 });
    // Outer lane wall: a constant-width offset of the leaf through the middle, flaring at the mouth.
    const W_LANE = 0.95;
    const off = (y: number): Pt => {
      let i = 1;
      while (i < leafL.length - 2 && leafL[i][1] < y) i++;
      const tx = leafL[i + 1][0] - leafL[i - 1][0];
      const ty = leafL[i + 1][1] - leafL[i - 1][1];
      const n = Math.hypot(tx, ty);
      return [leafL[i][0] - (ty / n) * W_LANE, leafL[i][1] + (tx / n) * W_LANE];
    };
    const laneL = [...spline([[0.3, 5.9], [0.65, 7.8], [1.5, 9.1], off(10.0), off(10.9), [3.95, 12.4]], 7), [3.95, H] as Pt];
    ctx.wall(laneL, { hue: hueL, note: -3, base: 0.5 });
    ctx.wall(mirror(laneL), { hue: hueR, note: -1, base: 0.5 });

    // --- Decoration: pivot and crown jewels, and the lane that will take the NEXT marble glowing softly.
    ctx.onDraw((g, t) => {
      const a = rocker.getAngle();
      const k = Math.max(-1, Math.min(1, a / TILT)); // +1: leaning right → next marble goes left
      const pulse = Math.max(0, 1 - (t - flipAt) * 2.5);
      glow(g, 2.1, 9.4, 1.6, hueL, 0.09 * Math.max(0, k));
      glow(g, 7.9, 9.4, 1.6, hueR, 0.09 * Math.max(0, -k));
      const s = Math.sin(a);
      const c = Math.cos(a);
      glow(g, PX + R * s, PY - R * c, 0.6, hueCrown, 0.16 + pulse * 0.3);
      g.lineCap = 'round';
      g.lineWidth = 0.09;
      g.strokeStyle = `hsla(${hueCrown}, 100%, ${75 + pulse * 20}%, 0.85)`;
      g.beginPath();
      g.arc(PX, PY, R - 0.04, -Math.PI / 2 + a - BETA, -Math.PI / 2 + a + BETA);
      g.stroke();
      // faint travel arcs swept by the wing tips
      g.lineWidth = 0.03;
      g.strokeStyle = `hsla(${hue}, 100%, 72%, ${0.16 + pulse * 0.3})`;
      g.beginPath();
      g.arc(PX, PY, ARM + 0.18, ARM_DROOP - TILT, ARM_DROOP + TILT);
      g.moveTo(PX + (ARM + 0.18) * Math.cos(Math.PI - ARM_DROOP - TILT), PY + (ARM + 0.18) * Math.sin(Math.PI - ARM_DROOP - TILT));
      g.arc(PX, PY, ARM + 0.18, Math.PI - ARM_DROOP - TILT, Math.PI - ARM_DROOP + TILT);
      g.stroke();
      jewel(g, PX, PY, 0.19, hueCrown, pulse);
    });
  },
};

export default flipFlop;
