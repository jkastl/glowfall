import { Circle, Polygon, Vec2, type Body, type Contact } from 'planck';
import { MARBLE_R } from '../engine/constants';
import type { PartDef } from '../engine/types';
import { arc, bez, glow, type Pt } from './lib/mech';

/**
 * Turnstile / Paternoster: a slow, breathing star wheel that meters marbles through a pocket at a time.
 *
 * A roof sweeps the inflow left into a small trough whose ramp ends in a lip at the star's rising
 * flank. Each time a pocket opens past the lip, the head of the queue (one or two marbles) drops in;
 * the star lifts them over the top, where they tip onto the leading paddle (each paddle is tuned, so
 * the wheel plays a slow arpeggio) and roll off onto a catch ramp that sings as they land.
 * The wheel's speed breathes with the teeth (slowest as a tooth rises past the lip), so the queue
 * is lifted gently, like an escapement, and star contacts have zero restitution: nothing is batted.
 *
 * Why it can't crush: the star is kinematic, but the only static surface it ever moves *towards* is
 * the apron, which is concentric with the tooth tips (gap 0.06 ≪ a marble) and only meets pockets
 * that are loaded from above, so their marbles are already inside the tip circle. At the lip the
 * teeth rise, lifting marbles into open air. Everything else keeps well clear of the tips.
 * A squeeze watchdog backs the wheel off for a moment anyway, should one ever be detected.
 */
const H = 14;
const CX = 5.9;
const CY = 7.2;
const HUB = 1.0;
const TIP = 2.15;
const N = 8;
const STEP = (Math.PI * 2) / N;
const APRON_R = TIP + 0.08;
const LIP_A = Math.PI + 0.5; // about ten o'clock
const OMEGA = 1.3; // rad/s, mean ≈ OMEGA·√(1−PULSE²)
const PULSE = 0.35; // escapement "breath": slowest as a tooth rises past the lip (gentle lift)
const NOTES = [0, 2, 4, 5, 7, 9, 7, 4]; // paddle i rings this degree when marbles tip onto it

const TAU = Math.PI * 2;
const wrap = (a: number) => ((a % TAU) + TAU) % TAU;

function isMarble(b: Body): boolean {
  if (!b.isDynamic()) return false;
  const f = b.getFixtureList();
  if (!f) return false;
  const s = f.getShape();
  return s.getType() === 'circle' && Math.abs(s.getRadius() - MARBLE_R) < 1e-6;
}

const turnstile: PartDef = {
  id: 'turnstile',
  name: 'Turnstile',
  blurb: 'A breathing star lifts marbles over, a pocket at a time.',
  height: H,
  build(ctx) {
    const hueStar = 268; // violet star, jade/teal surroundings
    const huePocket = (i: number) => 175 + ((i * 47) % 140); // teal → violet → magenta
    const soft = { friction: 0.12, restitution: 0.12 };

    // --- Roof: catches the inflow and carries it left, away from the top of the star.
    const roof: Pt[] = [...bez([9.9, 0.9], [7.2, 2.75], [2.9, 3.3], 18), ...bez([2.9, 3.3], [2.5, 3.38], [2.38, 3.72], 5).slice(1)];
    ctx.wall(roof, { hue: 186, base: 0.5, note: 5 }, soft);

    // --- Queue trough: a backstop that kills the roof's sideways speed (so newcomers drop in
    // vertically instead of knocking the queue back), a ramp to the lip at the tooth tips, the apron.
    const lip: Pt = [CX + APRON_R * Math.cos(LIP_A), CY + APRON_R * Math.sin(LIP_A)];
    const ramp: Pt[] = [
      ...bez([1.85, 1.95], [1.25, 2.2], [1.25, 3.0], 6),
      [1.25, 5.25],
      ...bez([1.25, 5.25], [2.6, 5.55], lip, 14),
    ];
    ctx.wall(ramp, { hue: 172, base: 0.55, note: 0 }, soft);
    // Apron: concentric with the tips, below the lip, so loaded low pockets carry their marbles up.
    const apronEnd = LIP_A - STEP - 0.4;
    const apron = arc(CX, CY, APRON_R, LIP_A, apronEnd, 12);
    // a small outward flare at the bottom end so nothing can catch on its edge
    const flareA = apronEnd - 0.12;
    apron.push([CX + (APRON_R + 0.12) * Math.cos(flareA), CY + (APRON_R + 0.12) * Math.sin(flareA)]);
    ctx.wall(apron, { hue: 172, base: 0.4, width: 0.06 }, { friction: 0.05, restitution: 0.05 });
    ctx.holdZone({ x0: 1.2, y0: 3.5, x1: CX - HUB + 0.2, y1: CY + 0.4 });

    // --- The star: a hub and N tapered paddles, kinematic.
    const star = ctx.body('kinematic', CX, CY);
    const mat = { friction: 0.3, restitution: 0.05, density: 1 };
    ctx.styleFixture(star.createFixture(new Circle(Vec2(0, 0), HUB), mat), { kind: 'solid', hue: hueStar, base: 0.5, note: -3 });
    for (let i = 0; i < N; i++) {
      const a = i * STEP;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const r0 = HUB - 0.08;
      const r1 = TIP - 0.04;
      const w0 = 0.11;
      const w1 = 0.05;
      const poly = new Polygon([
        Vec2(c * r0 + s * w0, s * r0 - c * w0),
        Vec2(c * r1 + s * w1, s * r1 - c * w1),
        Vec2(c * r1 - s * w1, s * r1 + c * w1),
        Vec2(c * r0 - s * w0, s * r0 + c * w0),
      ]);
      ctx.styleFixture(star.createFixture(poly, mat), { kind: 'solid', hue: hueStar - 10 + i * 6, base: 0.8, note: NOTES[i] });
      ctx.styleFixture(star.createFixture(new Circle(Vec2(c * (TIP - 0.07), s * (TIP - 0.07)), 0.09), mat), {
        kind: 'peg',
        hue: huePocket(i),
        base: 0.9,
      });
    }

    // Calm contacts. Box2D mixes restitution as max(a, b), so the marble's 0.35 always wins; override
    // it per contact instead: the star never bats a marble (0) and this part's walls are soft (0.1).
    const ground = ctx.ground;
    ctx.world.on('begin-contact', (c: Contact) => {
      const ba = c.getFixtureA().getBody();
      const bb = c.getFixtureB().getBody();
      if (ba === star || bb === star) c.setRestitution(0);
      else if (ba === ground || bb === ground) c.setRestitution(0.1);
    });

    // --- Motion: a breathing escapement, plus a squeeze watchdog that backs off briefly.
    let backoff = 0;
    const squeezed = (c: Contact, marble: Body): boolean => {
      // `marble` touches the star via `c`; is the star pressing it against something static?
      let wall: Contact | null = null;
      for (let ce = marble.getContactList(); ce && !wall; ce = ce.next) {
        if (ce.contact.isTouching() && ce.other?.isStatic()) wall = ce.contact;
      }
      if (!wall) return false;
      const wm = c.getWorldManifold(null);
      const w2 = wall.getWorldManifold(null);
      if (!wm || !w2) return false;
      const s1 = c.getFixtureB().getBody() === marble ? 1 : -1; // orient normals into the marble
      const s2 = wall.getFixtureB().getBody() === marble ? 1 : -1;
      const vp = star.getLinearVelocityFromWorldPoint(wm.points[0]);
      if ((vp.x * wm.normal.x + vp.y * wm.normal.y) * s1 < 0.05) return false; // star isn't pushing
      return (wm.normal.x * w2.normal.x + wm.normal.y * w2.normal.y) * s1 * s2 < -0.55;
    };
    ctx.onUpdate((dt) => {
      if (backoff > 0) {
        backoff -= dt;
        star.setAngularVelocity(backoff > 0.25 ? -0.5 : 0);
        return;
      }
      const phi = N * (star.getAngle() - LIP_A + 0.1);
      star.setAngularVelocity(OMEGA * (1 - PULSE * Math.cos(phi)));
      for (let ce = star.getContactList(); ce; ce = ce.next) {
        const o = ce.other;
        if (!o || !o.isDynamic() || !ce.contact.isTouching()) continue;
        if (squeezed(ce.contact, o)) {
          backoff = 0.6;
          break;
        }
      }
    });

    // --- Catch ramp on the right (tuned: every release lands here and sings), then the outlet neck.
    const catchR: Pt[] = [[9.9, 7.75], ...bez([9.9, 8.25], [9.0, 10.55], [6.55, 11.55], 16).slice(1), ...bez([6.55, 11.55], [6.1, 11.8], [6.1, 12.6], 5).slice(1), [6.1, H]];
    ctx.wall(catchR, { hue: 160, base: 0.5, note: -1 }, { friction: 0.08, restitution: 0.15 });
    const catchL: Pt[] = [[0.1, 8.6], ...bez([0.1, 9.2], [1.3, 11.4], [3.45, 11.75], 14).slice(1), ...bez([3.45, 11.75], [3.9, 11.9], [3.9, 12.6], 5).slice(1), [3.9, H]];
    ctx.wall(catchL, { hue: 160, base: 0.4, note: -3 }, { friction: 0.08, restitution: 0.15 });

    // --- Light: pockets glow while loaded; ripples when they let go; a turning halo; a hub jewel.
    const count = new Uint8Array(N);
    const prev = new Uint8Array(N);
    const level = new Float32Array(N);
    const RIP = 8;
    const ripX = new Float32Array(RIP);
    const ripY = new Float32Array(RIP);
    const ripT = new Float32Array(RIP).fill(-99);
    const ripH = new Float32Array(RIP);
    let ripI = 0;
    let lastT = 0;
    let lastTooth = -1;
    let tickAt = -99;
    const oy = ctx.originY;

    ctx.onDraw((g, t) => {
      const th = star.getAngle();
      const dtF = Math.min(0.1, Math.max(0, t - lastT));
      lastT = t;

      // Pocket occupancy (by angle relative to the star).
      count.fill(0);
      for (let b = ctx.world.getBodyList(); b; b = b.getNext()) {
        if (!isMarble(b)) continue;
        const p = b.getPosition();
        const dx = p.x - CX;
        const dy = p.y - oy - CY;
        const r = Math.hypot(dx, dy);
        if (r < HUB - 0.1 || r > TIP + 0.2) continue;
        const k = Math.floor(wrap(Math.atan2(dy, dx) - th) / STEP) % N;
        if (count[k] < 9) count[k]++;
      }
      for (let i = 0; i < N; i++) {
        const target = Math.min(1, count[i] / 2);
        level[i] += (target - level[i]) * Math.min(1, dtF * (target > level[i] ? 9 : 2.2));
        const mid = th + (i + 0.5) * STEP;
        if (prev[i] > 0 && count[i] === 0 && Math.cos(mid) > -0.2) {
          ripX[ripI] = CX + TIP * Math.cos(mid);
          ripY[ripI] = CY + TIP * Math.sin(mid);
          ripT[ripI] = t;
          ripH[ripI] = huePocket(i);
          ripI = (ripI + 1) % RIP;
        }
        prev[i] = count[i];
      }

      // Escapement tick: a spark at the lip each time a tooth rises past it.
      const tooth = Math.floor(wrap(LIP_A - th) / STEP);
      if (tooth !== lastTooth) {
        if (lastTooth >= 0) tickAt = t;
        lastTooth = tooth;
      }
      const tk = t - tickAt;
      if (tk >= 0 && tk < 0.8) glow(g, lip[0], lip[1], 0.55, 175, 0.35 * (1 - tk / 0.8));

      // Soft body glow + turning halo (counter-rotating dashes).
      glow(g, CX, CY, TIP * 1.45, hueStar, 0.06);
      g.lineWidth = 0.035;
      for (let ring = 0; ring < 2; ring++) {
        const R = TIP + 0.42 + ring * 0.3;
        const segs = 18 + ring * 6;
        const rot = (ring === 0 ? -0.18 : 0.11) * t;
        g.strokeStyle = `hsla(${ring === 0 ? 200 : 290}, 90%, 70%, ${0.1 - ring * 0.035})`;
        g.beginPath();
        for (let j = 0; j < segs; j++) {
          const a0 = rot + (j / segs) * TAU;
          const a1 = a0 + (TAU / segs) * 0.45;
          g.moveTo(CX + R * Math.cos(a0), CY + R * Math.sin(a0));
          g.arc(CX, CY, R, a0, a1);
        }
        g.stroke();
      }

      // Pockets that light up when filled.
      for (let i = 0; i < N; i++) {
        const lv = level[i];
        const a0 = th + i * STEP + 0.06;
        const a1 = th + (i + 1) * STEP - 0.06;
        const h = huePocket(i);
        g.fillStyle = `hsla(${h}, 100%, 62%, ${0.02 + 0.1 * lv})`;
        g.beginPath();
        g.arc(CX, CY, TIP - 0.08, a0, a1);
        g.arc(CX, CY, HUB + 0.06, a1, a0, true);
        g.closePath();
        g.fill();
        const am = (a0 + a1) / 2;
        if (lv > 0.02) glow(g, CX + (HUB + 0.7) * Math.cos(am), CY + (HUB + 0.7) * Math.sin(am), 0.8, h, 0.14 * lv);
        // tip beads brighten with the pocket they lead
        const at = th + i * STEP;
        glow(g, CX + (TIP - 0.07) * Math.cos(at), CY + (TIP - 0.07) * Math.sin(at), 0.32, h, 0.18 + 0.3 * lv);
      }

      // Release ripples.
      for (let j = 0; j < RIP; j++) {
        const age = t - ripT[j];
        if (age < 0 || age > 1.4) continue;
        const k = age / 1.4;
        g.strokeStyle = `hsla(${ripH[j]}, 100%, 72%, ${0.32 * (1 - k) * (1 - k)})`;
        g.lineWidth = 0.05 * (1 - k) + 0.01;
        g.beginPath();
        g.arc(ripX[j], ripY[j], 0.2 + 0.9 * Math.sqrt(k), 0, TAU);
        g.stroke();
      }

      // Hub: an eight-point star traced inside, turning with the wheel, then the jewel.
      g.strokeStyle = `hsla(${hueStar + 20}, 100%, 75%, 0.16)`;
      g.lineWidth = 0.03;
      g.beginPath();
      for (let j = 0; j <= N; j++) {
        const a = th + ((j * 3) % N) * STEP + STEP / 2;
        const x = CX + 0.82 * Math.cos(a);
        const y = CY + 0.82 * Math.sin(a);
        if (j === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
      const breath = 0.5 + 0.5 * Math.sin(t * 1.3);
      glow(g, CX, CY, 0.9, 300, 0.16 + 0.08 * breath);
      const jr = 0.3;
      const grad = g.createRadialGradient(CX - 0.08, CY - 0.1, 0, CX, CY, jr);
      grad.addColorStop(0, 'hsla(300, 100%, 92%, 0.85)');
      grad.addColorStop(0.45, 'hsla(290, 100%, 66%, 0.5)');
      grad.addColorStop(1, 'hsla(250, 100%, 55%, 0.2)');
      g.fillStyle = grad;
      g.beginPath();
      for (let j = 0; j < N; j++) {
        const a = -th * 0.5 + j * STEP;
        const x = CX + jr * Math.cos(a);
        const y = CY + jr * Math.sin(a);
        if (j === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.closePath();
      g.fill();
      g.strokeStyle = 'hsla(300, 100%, 85%, 0.3)';
      g.lineWidth = 0.02;
      g.beginPath();
      for (let j = 0; j < N; j += 2) {
        const a = -th * 0.5 + j * STEP;
        g.moveTo(CX + jr * Math.cos(a), CY + jr * Math.sin(a));
        g.lineTo(CX + jr * 0.45 * Math.cos(a + STEP), CY + jr * 0.45 * Math.sin(a + STEP));
      }
      g.stroke();
    });
  },
};

export default turnstile;
