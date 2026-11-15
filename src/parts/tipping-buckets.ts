import { Chain, Circle, RevoluteJoint, Vec2, type Body } from 'planck';
import type { Marble, PartDef } from '../engine/types';
import { arc, bez, glow, mirror, type Pt } from './lib/mech';

/**
 * Tipping Buckets — a two-stage cascade.
 *
 * 1. A rain-gauge seesaw sits under the inlet spout. Its raised cup fills with three marbles,
 *    then it rocks over: the full side pours outward and the empty side rises under the spout.
 *    So it pours left, right, left, right…
 * 2. Each pour drops into a bucket hanging from a pivot on that side. When the bucket holds three
 *    it tips toward the centre, empties into the outlet funnel, and swings home on its own weight.
 *
 * The seesaw and buckets are dynamic bodies on limited revolute joints. A torque-limited joint
 * motor acts as the latch (it holds against the weight while filling and eases each tip), and a
 * patience timer pours a part-filled cup after a couple of seconds so the last marble or two
 * never wait long.
 */

const H = 14;

// Stage 1: rain-gauge seesaw.
const SX = 5;
const SY = 4.3;
const SL = 2.15; // half length of the beam
const STILT = 0.32; // rad either side
const FIN = 0.66; // divider height
const S_CAP = 3;
const S_PATIENCE = 2.4;

// Stage 2: hanging buckets.
const BX = 1.78; // left pivot x (right is mirrored)
const BY = 6.6;
const BR = 1.0; // cup radius (cup arc centred on the pivot)
const RIM = 0.16; // rim half-angle offset: arc spans [RIM, π − RIM]
const B_TIP = 1.8; // rad at full pour
const B_CAP = 3;
const B_PATIENCE = 2.0;

const MAT = { friction: 0.06, restitution: 0.05 };

/** A smoothstep-eased curve from a to b (x eases, y linear): vertical-ish at both ends. */
function ease(a: Pt, b: Pt, n = 16): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const s = u * u * (3 - 2 * u);
    pts.push([a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * u]);
  }
  return pts;
}

/** Marble positions relative to a body, in body-local coordinates, without allocating. */
function local(b: Body, m: Marble, out: { x: number; y: number }) {
  const p = b.getPosition();
  const mp = m.body.getPosition();
  const a = b.getAngle();
  const c = Math.cos(a);
  const s = Math.sin(a);
  const dx = mp.x - p.x;
  const dy = mp.y - p.y;
  out.x = c * dx + s * dy;
  out.y = -s * dx + c * dy;
}

const tippingBuckets: PartDef = {
  id: 'tipping-buckets',
  name: 'Tipping Buckets',
  blurb: 'A rocking rain-gauge feeds two hanging buckets. Fill, tip, pour.',
  height: H,
  build(ctx) {
    const { hue } = ctx;
    const oy = ctx.originY;
    const tmp = { x: 0, y: 0 };

    // Everyone in the part (for counting who sits in which cup).
    const inside = new Set<Marble>();
    ctx.sensor({ x0: 0, y0: -1, x1: 10, y1: H + 1 }, (m) => inside.add(m), (m) => inside.delete(m));

    // --- Inlet spout: a soft glass throat that settles fast arrivals over the seesaw's fin.
    const spoutL: Pt[] = [...ease([2.7, 0], [4.5, 1.9], 14), [4.5, 2.55]];
    ctx.wall(spoutL, { hue: hue + 10, base: 0.45, width: 0.07 }, { friction: 0.05, restitution: 0.1 });
    ctx.wall(mirror(spoutL), { hue: hue + 10, base: 0.45, width: 0.07 }, { friction: 0.05, restitution: 0.1 });

    // ---------------------------------------------------------------- Stage 1: the seesaw
    const sHue = hue + 40;
    const saw = ctx.body('dynamic', SX, SY);
    ctx.styleFixture(saw.createFixture(new Chain([Vec2(-SL, 0), Vec2(SL, 0)], false), { density: 0, ...MAT }), {
      kind: 'line',
      hue: sHue,
      base: 0.85,
      width: 0.08,
      note: -1,
    });
    ctx.styleFixture(saw.createFixture(new Chain([Vec2(0, 0), Vec2(0, -FIN)], false), { density: 0, ...MAT }), {
      kind: 'line',
      hue: sHue,
      base: 0.8,
      width: 0.07,
      note: 1,
    });
    ctx.styleFixture(saw.createFixture(new Circle(Vec2(0, -FIN - 0.02), 0.07), { density: 0, ...MAT }), {
      kind: 'peg',
      hue: sHue + 30,
      base: 0.95,
      note: 5,
    });
    for (const e of [-1, 1]) {
      ctx.styleFixture(saw.createFixture(new Circle(Vec2(e * SL, 0), 0.05), { density: 0, ...MAT }), {
        kind: 'peg',
        hue: sHue,
        base: 0.9,
      });
    }
    // Mass sits a touch above the pivot so the beam rests firmly on whichever stop it is at.
    saw.setMassData({ mass: 1.3, center: Vec2(0, -0.06), I: 1.3 * (SL * SL) / 3 + 1.3 * 0.0036 });
    saw.setAngularDamping(1.2);
    const sawJoint = ctx.world.createJoint(
      new RevoluteJoint(
        { enableLimit: true, lowerAngle: -STILT, upperAngle: STILT, enableMotor: true, maxMotorTorque: 9, motorSpeed: -1.5 },
        ctx.ground,
        saw,
        ctx.v(SX, SY),
      ),
    )!;
    saw.setTransform(saw.getPosition(), -STILT);
    ctx.holdZone({ x0: SX - SL - 0.3, y0: SY - 1.4, x1: SX + SL + 0.3, y1: SY + 0.6 });

    const sawSt = { down: -1, n: 0, wait: 0, cool: 0, flare: 0 };
    ctx.onUpdate((dt) => {
      const up = -sawSt.down; // +1: right cup is up and filling
      let n = 0;
      for (const m of inside) {
        local(saw, m, tmp);
        const u = tmp.x * up;
        if (u > 0.05 && u < SL + 0.2 && tmp.y > -0.95 && tmp.y < 0.05) n++;
      }
      sawSt.n = n;
      sawSt.flare *= Math.exp(-dt * 2.5);
      if (sawSt.cool > 0) {
        sawSt.cool -= dt;
        sawSt.wait = 0;
        return;
      }
      sawSt.wait = n > 0 ? sawSt.wait + dt : 0;
      if (n >= S_CAP || sawSt.wait > S_PATIENCE) {
        // Rock over: the full side goes down and pours.
        sawSt.down = up;
        sawSt.cool = 0.55;
        sawSt.wait = 0;
        sawSt.flare = 1;
        sawJoint.setMaxMotorTorque(14);
        sawJoint.setMotorSpeed(up * 1.35);
      } else if (Math.abs(saw.getAngle() - sawSt.down * STILT) < 0.03) {
        sawJoint.setMaxMotorTorque(9);
        sawJoint.setMotorSpeed(sawSt.down * 1.2);
      }
    });

    // Hoods on the outer walls catch overshooting pours and turn them down into the buckets.
    const hoodL: Pt[] = bez([0, 5.6], [0.25, 6.15], [0.66, 6.42], 8);
    ctx.wall(hoodL, { hue: hue - 10, base: 0.4, width: 0.06 });
    ctx.wall(mirror(hoodL), { hue: hue - 10, base: 0.4, width: 0.06 });

    // ---------------------------------------------------------------- Stage 2: hanging buckets
    interface BucketState {
      body: Body;
      d: number; // +1 left bucket (tips clockwise, toward centre), −1 right
      px: number;
      hue: number;
      n: number;
      fill: number; // smoothed glow level
      flare: number;
    }
    const buckets: BucketState[] = [];
    const cup: Pt[] = arc(0, 0, BR, RIM, Math.PI - RIM, 20);
    const cupV = cup.map(([x, y]) => Vec2(x, y));

    for (const d of [1, -1]) {
      const px = d > 0 ? BX : 10 - BX;
      const bHue = d > 0 ? hue - 25 : hue + 70;
      const b = ctx.body('dynamic', px, BY);
      ctx.styleFixture(b.createFixture(new Chain(cupV, false), { density: 0, ...MAT }), {
        kind: 'line',
        hue: bHue,
        base: 0.9,
        width: 0.08,
        note: d > 0 ? 2 : 4,
      });
      for (const [x, y] of [cup[0], cup[cup.length - 1]]) {
        ctx.styleFixture(b.createFixture(new Circle(Vec2(x, y), 0.06), { density: 0, ...MAT }), {
          kind: 'peg',
          hue: bHue,
          base: 0.95,
        });
      }
      // (The pivot jewel is drawn only: a solid hub would sit in the pour mouth when tipped.)
      // Hangs like a pendulum: its weight sits low in the cup, so it rights itself after a pour.
      b.setMassData({ mass: 1.0, center: Vec2(0, 0.72), I: 1.0 * 0.72 * 0.72 + 0.25 });
      b.setAngularDamping(1.5);
      const joint = ctx.world.createJoint(
        new RevoluteJoint(
          {
            enableLimit: true,
            lowerAngle: d > 0 ? -0.3 : -B_TIP,
            upperAngle: d > 0 ? B_TIP : 0.3,
            enableMotor: true,
            maxMotorTorque: 2,
            motorSpeed: 0,
          },
          ctx.ground,
          b,
          ctx.v(px, BY),
        ),
      )!;
      ctx.holdZone({ x0: px - BR - 0.45, y0: BY - 1.2, x1: px + BR + 0.45, y1: BY + BR + 0.5 });

      const st: BucketState = { body: b, d, px, hue: bHue, n: 0, fill: 0, flare: 0 };
      buckets.push(st);
      let mode: 'catch' | 'tip' | 'pour' | 'home' = 'catch';
      let timer = 0;
      let wait = 0;
      let full = 0;
      let empty = 0;
      ctx.onUpdate((dt) => {
        let n = 0;
        for (const m of inside) {
          local(b, m, tmp);
          const r2 = tmp.x * tmp.x + tmp.y * tmp.y;
          if (tmp.y > 0.12 && r2 < (BR + 0.05) * (BR + 0.05)) n++;
        }
        st.n = n;
        st.fill += ((mode === 'catch' ? n / B_CAP : 0) - st.fill) * Math.min(1, dt * 4);
        st.flare *= Math.exp(-dt * 2);
        const a = b.getAngle() * d; // 0 = hanging, B_TIP = pouring
        timer += dt;
        if (mode === 'catch') {
          wait = n > 0 ? wait + dt : 0;
          full = n >= B_CAP ? full + dt : 0;
          if (full > 0.3 || wait > B_PATIENCE) {
            mode = 'tip';
            timer = 0;
            st.flare = 1;
            joint.setMaxMotorTorque(30);
            joint.setMotorSpeed(d * 2.3);
          }
        } else if (mode === 'tip') {
          if (a > B_TIP - 0.06 || timer > 1.4) {
            mode = 'pour';
            timer = 0;
            empty = 0;
          }
        } else if (mode === 'pour') {
          empty = n === 0 ? empty + dt : 0;
          if (empty > 0.25 || timer > 1.6) {
            mode = 'home';
            timer = 0;
            joint.setMaxMotorTorque(5);
            joint.setMotorSpeed(-d * 2.6);
          }
        } else if (a < 0.12 || timer > 2) {
          mode = 'catch';
          timer = 0;
          wait = 0;
          full = 0;
          joint.setMaxMotorTorque(2);
          joint.setMotorSpeed(0);
        }
      });
    }

    // --- Outlet: a soft funnel; the pours meet around a bell, then slip out of the port.
    const funL: Pt[] = [...bez([0, 8.0], [2.7, 8.9], [3.9, 12.4], 18), [3.9, H]];
    ctx.wall(funL, { hue: hue + 10, base: 0.45, note: -3 });
    ctx.wall(mirror(funL), { hue: hue + 10, base: 0.45, note: -2 });
    ctx.circle(5, 9.55, 0.24, { hue: hue + 60, base: 0.85, note: 6 }, { restitution: 0.2, friction: 0.05 });

    ctx.onDraw((g, t) => {
      // The bell's slow breathing halo.
      glow(g, 5, 9.55, 0.75 + 0.08 * Math.sin(t * 1.3), hue + 60, 0.12 + 0.05 * Math.sin(t * 1.3));
      // Seesaw: pivot jewel, charge glow in the filling cup, a flare when it rocks.
      const sp = saw.getPosition();
      const sy = sp.y - oy;
      const sa = saw.getAngle();
      const upSide = -sawSt.down;
      const charge = Math.min(1, sawSt.n / S_CAP);
      const cx = sp.x + Math.cos(sa) * upSide * 0.9;
      const cy = sy + Math.sin(sa) * upSide * 0.9 - 0.25;
      glow(g, cx, cy, 0.9 + 0.3 * charge, sHue, 0.05 + 0.22 * charge);
      // Faint sails between fin tip and beam ends: the two cups of the gauge.
      {
        const c = Math.cos(sa);
        const s = Math.sin(sa);
        const fx = sp.x + s * FIN;
        const fy = sy - c * FIN;
        for (const e of [-1, 1]) {
          const ex = sp.x + c * e * SL;
          const ey = sy + s * e * SL;
          const k = e === upSide ? charge : 0;
          g.fillStyle = `hsla(${sHue}, 100%, 60%, ${0.035 + 0.1 * k})`;
          g.beginPath();
          g.moveTo(sp.x, sy);
          g.lineTo(fx, fy);
          g.lineTo(ex, ey);
          g.closePath();
          g.fill();
        }
      }
      glow(g, sp.x, sy, 0.45 + 0.25 * sawSt.flare, sHue + 30, 0.35 + 0.4 * sawSt.flare);
      g.fillStyle = `hsla(${sHue + 30}, 100%, 85%, 0.9)`;
      g.beginPath();
      g.arc(sp.x, sy, 0.07, 0, Math.PI * 2);
      g.fill();
      // a little triangular stand under the pivot
      g.strokeStyle = `hsla(${sHue}, 90%, 65%, 0.35)`;
      g.lineWidth = 0.05;
      g.beginPath();
      g.moveTo(sp.x - 0.28, sy + 0.55);
      g.lineTo(sp.x, sy + 0.04);
      g.lineTo(sp.x + 0.28, sy + 0.55);
      g.stroke();

      for (const st of buckets) {
        const p = st.body.getPosition();
        const py = p.y - oy;
        const a = st.body.getAngle();
        const c = Math.cos(a);
        const s = Math.sin(a);
        // Bail (handle) from rim to rim over the pivot: drawn only, so marbles pass through it.
        const r0x = BR * Math.cos(RIM);
        const r0y = BR * Math.sin(RIM);
        const lx = p.x + c * -r0x - s * r0y;
        const ly = py + s * -r0x + c * r0y;
        const rx = p.x + c * r0x - s * r0y;
        const ry = py + s * r0x + c * r0y;
        const hx = p.x + s * 0.12;
        const hy = py - c * 0.12;
        g.strokeStyle = `hsla(${st.hue}, 90%, 70%, 0.28)`;
        g.lineWidth = 0.035;
        g.beginPath();
        g.moveTo(lx, ly);
        g.quadraticCurveTo(hx, hy, rx, ry);
        // A slender bracket from the outer wall holds the pivot.
        const wx = st.d > 0 ? 0 : 10;
        g.moveTo(wx, BY - 1.25);
        g.quadraticCurveTo(p.x - st.d * 0.35, BY - 0.95, p.x, py);
        g.stroke();
        // Liquid light pooling in the cup as it fills.
        const fx = p.x - s * 0.62;
        const fy = py + c * 0.62;
        const pulse = 0.85 + 0.15 * Math.sin(t * 3 + st.px);
        glow(g, fx, fy, 0.75 + 0.35 * st.fill, st.hue, (0.05 + 0.3 * st.fill) * pulse);
        // Pivot jewel.
        glow(g, p.x, py, 0.4 + 0.3 * st.flare, st.hue + 30, 0.3 + 0.45 * st.flare);
        g.fillStyle = `hsla(${st.hue + 30}, 100%, 85%, 0.9)`;
        g.beginPath();
        g.arc(p.x, py, 0.07, 0, Math.PI * 2);
        g.fill();
      }
    });
  },
};

export default tippingBuckets;
