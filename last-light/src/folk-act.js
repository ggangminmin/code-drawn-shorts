import { onTwos, noise1, clamp, lerp, smooth, invLerp } from './util.js';
import { bakeSpring, keyed, breathe, planSteps } from './motion.js';
import { PL, add, mul, inF, yawOf, leftOf } from './folk-place.js';
import { boatPath, beamAz, LENS, PIER } from './layout.js';
import * as SETCAMS from './cams/sets.js';

// LAST LIGHT — the performances. Every pose is a pure function of film time, sampled on twos.
//   weight over support, planted feet (explicit landings, nothing slides), anticipation before each action,
//   overshoot and settle through baked springs, follow-through on ears, tail, scarf, hood and coat skirt,
//   breathing at rest, tremor under strain.
// Pose = { pos, yaw, hip, hipRot, waist, spine, neck, head, legs:{L:{foot,yaw,pitch,pole}}, arms:{L:{target,pole,palm,fingerDir,curl}},
//          face, ears, tailChain, scarf, hood, coat, floorY }
// +X is the character's left, +Z forward. +pitch on spine/neck/head bends forward (looks down).

const PI = Math.PI;
const n1 = noise1;
const spr = (keys, t1, freq = 5, damp = 0.5) => bakeSpring(keyed(keys), t1, { freq, damp, tStart: keys[0][0], x0: keys[0][1] });
const lerp3 = (a, b, u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
const blinkAt = (t, at) => { const d = t - at; if (d < 0 || d > 0.22) return 0; return d < 0.06 ? d / 0.06 : d < 0.1 ? 1 : 1 - (d - 0.1) / 0.12; };
const blinks = (t, list) => list.reduce((m, a) => Math.max(m, blinkAt(t, a)), 0);
const UP = [0, 1, 0];

// ------------------------------------------------------------------ faces
const FACE0 = { look: [0, 0], pupil: 0.36, mouth: 0, jaw: 0, lid: 0, lidB: 0, tilt: 0, browUp: 0, browTilt: 0, wet: 0, smile: 0, teeth: 0, narrow: 0, ymouthK: 0.4, tear: 0, tear2: 0, detail: 1 };
export const EMO = {
  neutral: {},
  worry: { pupil: 0.3, tilt: 0.45, browUp: 0.35, browTilt: 0.4, smile: -0.35, narrow: 0.3, ymouthK: 0.15, lidB: 0.05 },
  dread: { pupil: 0.2, lid: 0, lidB: 0.0, tilt: 0.75, browUp: 0.75, browTilt: 0.6, mouth: 0.2, narrow: 0.35, smile: -0.7, ymouthK: 0, wet: 0.25 },
  shock: { pupil: 0.16, lid: 0, tilt: 0.5, browUp: 1.0, browTilt: 0.3, mouth: 0.45, jaw: 0.05, smile: -0.5, ymouthK: 0, wet: 0.3 },
  determined: { pupil: 0.3, lid: 0.22, lidB: 0.22, tilt: -0.55, browUp: -0.45, browTilt: -0.75, mouth: 0, narrow: 0.55, smile: -0.25, ymouthK: 0, wet: 0.1 },
  strain: { pupil: 0.26, lid: 0.5, lidB: 0.45, tilt: -0.95, browUp: -0.9, browTilt: -1.15, teeth: 0.75, smile: -0.7, ymouthK: 0, mouth: 0, wet: 0.2 },
  scream: { pupil: 0.2, lid: 0.92, lidB: 0.6, tilt: -1.0, browUp: -1.0, browTilt: -1.3, mouth: 1.35, jaw: 0.38, smile: -0.6, ymouthK: 0, wet: 0.45 },
  exhausted: { pupil: 0.34, lid: 0.42, lidB: 0.0, tilt: 0.8, browUp: 0.45, browTilt: 0.75, mouth: 0.55, jaw: 0.06, smile: -0.35, ymouthK: 0, wet: 0.35, look: [0, -0.2] },
  awe: { pupil: 0.24, lid: 0, lidB: 0.05, tilt: 0.25, browUp: 0.7, browTilt: 0.15, mouth: 0.48, smile: 0.1, ymouthK: 0, wet: 0.55 },
  hope: { pupil: 0.3, lid: 0.08, lidB: 0.2, tilt: 0.3, browUp: 0.5, browTilt: 0.2, mouth: 0.18, smile: 0.6, ymouthK: 0.3, wet: 0.6 },
  relief: { pupil: 0.34, lid: 0.3, lidB: 0.25, tilt: 0.45, browUp: 0.4, browTilt: 0.4, mouth: 0.15, smile: 0.45, ymouthK: 0.3, wet: 0.4 },
  laugh: { pupil: 0.36, lid: 0.88, lidB: 0.75, tilt: 0.3, browUp: 0.55, browTilt: 0.3, mouth: 1.0, jaw: 0.16, smile: 1.0, ymouthK: 0.6, wet: 0.5 },
  smile: { pupil: 0.36, lid: 0.3, lidB: 0.45, tilt: 0.2, browUp: 0.3, browTilt: 0.15, mouth: 0.12, smile: 0.95, ymouthK: 0.6, wet: 0.2 },
  sleep: { lid: 1, lidB: 0.1, tilt: 0.25, browUp: 0.1, browTilt: 0.1, mouth: 0.06, smile: 0.35, ymouthK: 0.6, wet: 0 },
  kind: { pupil: 0.4, lid: 0.32, lidB: 0.3, tilt: 0.35, browUp: 0.2, browTilt: 0.3, smile: 0.5, ymouthK: 0.6 },
  resolve: { pupil: 0.32, lid: 0.28, lidB: 0.3, tilt: -0.85, browUp: -0.6, browTilt: -0.95, mouth: 0, narrow: 0.7, smile: -0.35, ymouthK: 0, wet: 0.35 },
  pain: { pupil: 0.28, lid: 0.45, lidB: 0.35, tilt: 0.8, browUp: 0.2, browTilt: 0.9, teeth: 0.4, smile: -0.7, ymouthK: 0, wet: 0.1 },
};
const KEYS = Object.keys(FACE0);
function mixFace(a, b, u) {
  const o = {};
  for (const k of KEYS) {
    const x = a[k] ?? FACE0[k], y = b[k] ?? FACE0[k];
    o[k] = Array.isArray(x) ? [lerp(x[0], y[0], u), lerp(x[1], y[1], u)] : lerp(x, y, u);
  }
  return o;
}
// emotion track: [[t, 'emo'], ...] eased between keys (hold = same name twice)
function emoTrack(keys) {
  return (t) => {
    if (t <= keys[0][0]) return mixFace(EMO[keys[0][1]], EMO[keys[0][1]], 0);
    for (let i = 1; i < keys.length; i++) if (t < keys[i][0]) return mixFace(EMO[keys[i - 1][1]], EMO[keys[i][1]], smooth((t - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0])));
    const l = keys[keys.length - 1][1]; return mixFace(EMO[l], EMO[l], 0);
  };
}

// ------------------------------------------------------------------ body helpers
const fwdOf = (yaw) => [Math.sin(yaw), 0, Math.cos(yaw)];
const bodyTo = (pos, yaw, x, y, z) => { const s = Math.sin(yaw), c = Math.cos(yaw); return [pos[0] + x * c + z * s, pos[1] + y, pos[2] - x * s + z * c]; };
// ankle target for a foot whose sole rests on ground point g (toe pitch p > 0 lifts the heel, rotating about the ball)
function ankleAt(D, g, yaw, p = 0) {
  const fh = D.footH * 0.97, fl = D.footL * 0.62;
  if (p <= 0) return [g[0], g[1] + fh, g[2]];
  const f = fwdOf(yaw), dz = fl * (1 - Math.cos(p)), dy = fl * Math.sin(p);
  return [g[0] - f[0] * dz, g[1] + fh + dy, g[2] - f[2] * dz];
}
const foot = (D, g, yaw, p = 0, pole) => ({ foot: ankleAt(D, g, yaw, p), yaw: 0 + (yaw), pitch: p, pole, _world: true });
// grip a bar/handle at world point g: the wrist sits behind the knuckles
function grip(D, g, fingerDir, palm, o = {}) {
  const h = D.hand;
  const po = o.palmOff ?? 0.5, rc = o.reach ?? 1.05;
  return { target: [g[0] - fingerDir[0] * h * rc - palm[0] * h * po, g[1] - fingerDir[1] * h * rc - palm[1] * h * po, g[2] - fingerDir[2] * h * rc - palm[2] * h * po],
    palm, fingerDir, palmW: 1, curl: o.curl ?? 0.85, thumb: o.thumb ?? 0.8, spread: 0.04, pole: o.pole };
}
const hang = (side, o = {}) => ({ sh: [0.08 + (o.sw ?? 0), 0, side * (0.14 + (o.out ?? 0))], el: 0.25 + (o.el ?? 0), curl: o.curl ?? 0.35, thumb: 0.4 });

// world-yaw legs: setPose adds the root yaw to the foot yaw, so subtract it here
function legsWorld(P, L, R) {
  const fix = (l) => (l ? { ...l, yaw: (l.yaw ?? 0) - (P.yaw ?? 0) } : l);
  P.legs = { L: fix(L), R: fix(R) };
}

// ------------------------------------------------------------------ secondary motion (baked springs on the root track)
// track(t) -> { pos, yaw, seg } ; returns per-time { tail:[[p,y]..], scarf:[[[p,r]..],[..]], hood:[p,r], ears:[p,s], coat:[x,z] }
function bakeSecondary(track, opt) {
  const T0 = opt.t0 ?? 0, T1 = opt.t1 ?? 73.2, h = 1 / 48;
  const vel = (t) => {
    const a = track(t - h), b = track(t + h);
    if (a.seg !== b.seg) return [0, 0, 0];
    const yaw = (a.yaw + b.yaw) / 2, f = fwdOf(yaw), s = leftOf(f);
    const v = [(b.pos[0] - a.pos[0]) / (2 * h), (b.pos[1] - a.pos[1]) / (2 * h), (b.pos[2] - a.pos[2]) / (2 * h)];
    const cl = (x) => clamp(x, -4, 4);
    return [cl(v[0] * f[0] + v[2] * f[2]), cl(v[1]), cl(v[0] * s[0] + v[2] * s[2])];   // forward, up, left
  };
  const extra = opt.extra ?? (() => [0, 0, 0]);   // [bounce, twist, wind] from the performance (cranking, running bob)
  const fwdS = bakeSpring((t) => vel(t)[0] + extra(t)[0], T1, { freq: 2.2, damp: 0.55, tStart: T0 });
  const latS = bakeSpring((t) => vel(t)[2] + extra(t)[1], T1, { freq: 2.0, damp: 0.5, tStart: T0 });
  const upS = bakeSpring((t) => vel(t)[1], T1, { freq: 3.0, damp: 0.4, tStart: T0 });
  // acceleration-like signals: the springs lag the raw velocity; the difference is what throws the soft parts
  const lagF = bakeSpring(fwdS, T1, { freq: 1.6, damp: 0.35, tStart: T0 });
  const lagL = bakeSpring(latS, T1, { freq: 1.5, damp: 0.35, tStart: T0 });
  const lagU = bakeSpring(upS, T1, { freq: 2.6, damp: 0.3, tStart: T0 });
  return (t, wind = 0) => {
    const f = fwdS(t), l = latS(t), u = upS(t), af = f - lagF(t), al = l - lagL(t), au = u - lagU(t);
    const tq = onTwos(t), w = wind * (0.6 + 0.4 * n1(tq * 2.3, 3));
    const nT = opt.tailLinks ?? 7;
    const tail = [];
    for (let i = 0; i < nT; i++) {
      const k = i / nT, lag = 0.08 * i;
      const ff = fwdS(t - lag), ll = latS(t - lag);
      tail.push([(i === 0 ? (opt.tailLift ?? -0.5) : 0.05) + 0.1 * clamp(ff, -2, 3) * (0.3 + k) - 0.08 * clamp(upS(t - lag), -2, 2) + 0.05 * Math.sin(tq * 1.7 - i * 0.6),
        -0.14 * clamp(ll, -3, 3) * (0.4 + k) + (opt.tailSway ?? 0.06) * Math.sin(tq * 1.3 - i * 0.55) + w * 0.12 * n1(tq * 4 + i, 9)]);
    }
    const scarf = [0, 1].map((j) => [0, 1, 2, 3].map((i) => {
      const lag = 0.05 * i + j * 0.03;
      const ff = fwdS(t - lag);
      return [clamp(0.28 * Math.max(0, ff) + 0.12 * clamp(af, -2, 2) + w * (0.35 + 0.25 * n1(tq * 6 + i * 1.3 + j * 5, 21)) + 0.04 * i, -0.4, 1.4) * (i === 0 ? 0.6 : 0.5),
        clamp(-0.18 * latS(t - lag) + w * 0.25 * n1(tq * 5 + i + j * 3, 31), -0.8, 0.8)];
    }));
    const hood = [clamp(-0.15 * au + 0.06 * af - 0.12 * Math.max(0, f) - w * 0.12, -0.6, 0.4), clamp(0.1 * al, -0.3, 0.3)];
    const ears = [clamp(-0.06 * af - 0.05 * au - 0.04 * Math.max(0, f), -0.4, 0.3), clamp(0.05 * Math.abs(al) + 0.04 * au, -0.2, 0.3)];
    const coat = [clamp(-0.03 * al - w * 0.01, -0.06, 0.06), clamp(-0.035 * af - 0.015 * Math.max(0, f) - w * 0.012, -0.08, 0.06)];
    return { tail, scarf, hood, ears, coat };
  };
}

// ------------------------------------------------------------------ performances
export function createPerformances(ctx, R) {
  const { CUES } = ctx;
  const S = R.suri, T = R.tobi, Dd = R.dad;
  const DS = S.D, DT = T.D, DD = Dd.D;
  const floorY = PL.floorY;

  // ================================================================ SURI
  // ---- s04 kitchen: at the window, cup in both paws, looking up at the dead tower; realisation; the cup slips
  const KF = PL.kitchen, kYaw = KF.yaw;
  const kitch = {
    lean: spr([[5.5, 0.12], [6.2, 0.18], [6.45, 0.08], [6.7, -0.06], [7.3, -0.04], [7.7, 0.02], [8.0, 0.06]], 8.2, 4, 0.5),
    head: spr([[5.5, -0.26], [6.25, -0.3], [6.45, -0.34], [6.62, -0.2], [7.2, -0.22], [7.7, -0.05], [8.0, 0.0]], 8.2, 5, 0.45),
    turn: spr([[5.5, 0], [7.55, 0], [7.85, -0.55], [8.0, -0.6]], 8.2, 6, 0.6),
    back: spr([[5.5, 0], [6.62, 0], [6.85, -0.05], [7.6, -0.04], [8.0, -0.04]], 8.2, 6, 0.55),
    hands: keyed([[5.5, 0], [6.5, 0], [6.62, 1], [8, 1]]),
    face: emoTrack([[5.5, 'worry'], [6.25, 'worry'], [6.5, 'shock'], [7.2, 'dread'], [7.6, 'dread'], [7.9, 'determined']]),
    ear: spr([[5.5, 0.05], [6.3, 0.15], [6.5, -0.45], [7.4, -0.4], [7.75, 0.12], [8.0, 0.05]], 8.2, 7, 0.35),
  };
  function suriKitchen(t, q) {
    const pos = KF.o, back = kitch.back(q), p = add(pos, mul(KF.f, back));
    const br = breathe(q, 1.1, 1), tr = (s, a) => n1(q * 13, s) * a;
    const tip = 0.055 * (1 - smooth(invLerp(6.62, 6.9, q)));
    const P = { pos: p, yaw: kYaw, hip: [0, S.hipY + tip, 0], hipRot: [0.02, 0, 0], waist: [kitch.lean(q) * 0.4, 0, 0], spine: [kitch.lean(q) * 0.6 + br * 0.02, kitch.turn(q) * 0.3, 0],
      neck: [0.0, kitch.turn(q) * 0.3, 0], head: [kitch.head(q) + tr(1, 0.01), kitch.turn(q) * 0.25 + tr(2, 0.01), 0.06 + tr(3, 0.01)] };
    const gL = inF(KF, 0.08, 0, -0.03), gR = inF(KF, -0.08, 0, 0.03);
    const tp = tip / 0.055 * 0.62;
    legsWorld(P, foot(DS, gL, kYaw + 0.12, tp), foot(DS, gR, kYaw - 0.1, tp));
    // the cup held in both paws resting on the sill's edge, then the paws open: the cup is gone
    const h = kitch.hands(q), sill = PL.kitchenSill, c = [sill[0], sill[1] + 0.065 - 0.05 * h, sill[2] - KF.f[2] * 0.1 - KF.f[0] * 0.0];
    const cupL = [c[0] + KF.s[0] * 0.05, c[1], c[2] + KF.s[2] * 0.05], cupR = [c[0] - KF.s[0] * 0.05, c[1], c[2] - KF.s[2] * 0.05];
    P.arms = {
      L: { ...grip(DS, cupL, KF.f, mul(KF.s, -1), { curl: lerp(0.55, 0.15, h), reach: 0.9 }), palmW: 1 },
      R: { ...grip(DS, cupR, KF.f, KF.s, { curl: lerp(0.55, 0.15, h), reach: 0.9 }), palmW: 1 },
    };
    if (h > 0.5) { P.arms.L.target = add(P.arms.L.target, [0, -0.03 * h, 0]); P.arms.R.target = add(P.arms.R.target, [0, -0.04 * h, 0]); }
    P.face = { ...kitch.face(q), look: [lerp(0.0, -0.3, smooth(invLerp(7.6, 7.9, q))), lerp(0.55, 0.2, smooth(invLerp(7.4, 7.9, q)))], blink: blinks(q, [5.9, 7.45]) };
    P.ears = [kitch.ear(q), 0.08 - 0.2 * Math.min(0, kitch.ear(q))];
    return P;
  }

  // ---- s05 stair foot: crouched by Grandpa; the key; the nod up the stairs
  const GF = PL.grandpaSit;          // grandpa's frame (faces out, back to the stair)
  const sF = { o: inF(GF, 0.1, 0, 0.8), f: mul(GF.f, -1), s: mul(GF.s, -1) }; sF.yaw = yawOf(sF.f);
  const sfoot = {
    drop: spr([[7.8, 0.28], [8.6, 0.3], [9.2, 0.32], [9.9, 0.3], [10.15, 0.33], [10.35, 0.1], [10.6, 0.02]], 10.8, 5, 0.5),
    lean: spr([[7.8, 0.45], [9.25, 0.55], [9.55, 0.38], [9.9, 0.15], [10.3, 0.35], [10.6, 0.3]], 10.8, 4, 0.5),
    head: spr([[7.8, 0.15], [9.25, 0.3], [9.55, 0.2], [9.85, -0.5], [10.15, -0.55], [10.4, -0.3]], 10.8, 6, 0.45),
    hy: spr([[7.8, 0.3], [9.75, 0.3], [9.95, 0.45], [10.3, 0.45], [10.6, 0.5]], 10.8, 5, 0.55),
    palm: keyed([[7.8, 0], [8.9, 0], [9.2, 1], [9.5, 1], [9.75, 0.6], [10.2, 0.2]]),
    close: keyed([[7.8, 0.3], [9.38, 0.3], [9.5, 0.95], [10.8, 0.95]]),
    face: emoTrack([[7.8, 'dread'], [8.8, 'worry'], [9.35, 'shock'], [9.7, 'worry'], [9.95, 'resolve'], [10.6, 'resolve']]),
  };
  function suriStairFoot(t, q) {
    const drop = sfoot.drop(q), lean = sfoot.lean(q), br = breathe(q, 0.9, 1);
    const P = { pos: sF.o, yaw: sF.yaw, hip: [0, S.hipY - drop, -0.06 - drop * 0.25], hipRot: [0.25 * drop / 0.3, 0, 0], waist: [lean * 0.4, 0, 0], spine: [lean * 0.6 + br * 0.03, sfoot.hy(q) * 0.25, 0],
      neck: [0.0, sfoot.hy(q) * 0.35, 0], head: [sfoot.head(q), sfoot.hy(q) * 0.4, 0.05], floorY: sF.o[1] };
    const yawL = sF.yaw + 0.25, yawR = sF.yaw - 0.25;
    legsWorld(P, foot(DS, inF(sF, 0.11, 0, 0.0), yawL, drop > 0.2 ? 0.35 : 0), foot(DS, inF(sF, -0.11, 0, -0.05), yawR, drop > 0.2 ? 0.45 : 0));
    // left paw on Grandpa's shoulder (his frame), right paw held out flat for the key, then closing over it
    const shoulder = inF(GF, -0.13, 0.42, 0.5);   // his raised knee
    const pm = sfoot.palm(q), keyPt = R.keyMeet(q);
    P.arms = {
      L: { ...grip(DS, add(shoulder, mul(sF.f, -0.02)), add(mul(sF.f, 0.5), [0, -0.85, 0]), mul(sF.f, 1), { curl: 0.45, reach: 0.8 }) },
      R: q > 9.72 ? { sh: [-0.95 * smooth(invLerp(9.72, 10.0, q)) + 0.2, 0, -0.25], el: 2.0 * smooth(invLerp(9.72, 10.0, q)) + 0.3, curl: 0.98, thumb: 0.95 }   // the fist with the key pulled to her chest
        : pm > 0.01 ? { target: lerp3(inF(sF, -0.16, 0.42, 0.18), add(keyPt, [0, -DS.hand * 0.55, 0], mul(sF.f, -DS.hand * 0.6)), pm), palm: lerp3([0, -1, 0], [0, 1, 0], pm), fingerDir: sF.f, palmW: 1, curl: sfoot.close(q), thumb: sfoot.close(q) * 0.9 } : hang(-1, { curl: 0.5 }),
    };
    P.face = { ...sfoot.face(q), look: q < 9.3 ? [0.25, -0.1] : q < 9.75 ? [0.1, -0.45] : [0.05, 0.6], blink: blinks(q, [8.3, 9.62]) };
    P.ears = [q < 9.8 ? -0.35 : 0.1, q < 9.8 ? 0.3 : 0.0];
    return P;
  }

  // ---- s06 the spiral: running up, two treads at a time
  const RUN = SETCAMS.RUN ?? {}, uA = RUN.u0 ?? 0.54, uB = RUN.u1 ?? 0.63, runT0 = RUN.t0 ?? 10.35, runT1 = RUN.t1 ?? 13.05;   // Sets' window for the spiral run
  const stairU = (t) => lerp(uA, uB, clamp((t - runT0) / (runT1 - runT0)));
  const stairPath = (t) => PL.stairPoint(stairU(t));
  const stairSteps = planSteps(stairPath, runT0, runT1, 0.42, { stepTime: 0.16, lift: 0.16, width: 0.07 });
  function suriStairs(t, q) {
    const p = stairPath(q), p2 = stairPath(q + 0.05), yaw = Math.atan2(p2[0] - p[0], p2[2] - p[2]);
    const ph = (q - runT0) * 3.1 * 2 * PI;     // stride phase
    const P = { pos: p, yaw, hip: [0, S.hipY - 0.06 + 0.025 * Math.abs(Math.sin(ph)), 0.04], hipRot: [0.2, 0.15 * Math.sin(ph), 0], waist: [0.15, 0, 0], spine: [0.22, -0.2 * Math.sin(ph), 0], neck: [-0.15, 0, 0], head: [-0.25, 0.1 * Math.sin(ph), 0] };
    const fL = stairSteps.footPos(0, q), fR = stairSteps.footPos(1, q);
    const sg = ctx.sets && ctx.sets.stairGround;
    const tread = (fp) => { if (!sg) return fp.pos[1]; const fw = [Math.sin(yaw), 0, Math.cos(yaw)]; let y = fp.pos[1]; for (const k of [-0.03, 0.05, 0.12]) y = Math.max(y, sg(fp.pos[0] + fw[0] * k, fp.pos[2] + fw[2] * k, fp.pos[1] + 0.1)); return y; };
    legsWorld(P, { foot: [fL.pos[0], tread(fL) + DS.footH * 0.97 + 0.012 + fL.lift, fL.pos[2]], yaw, pitch: fL.lift > 0.02 ? -0.3 : 0 }, { foot: [fR.pos[0], tread(fR) + DS.footH * 0.97 + 0.012 + fR.lift, fR.pos[2]], yaw, pitch: fR.lift > 0.02 ? -0.3 : 0 });
    const sw = Math.sin(ph);
    P.arms = { L: { sh: [-0.7 * sw + 0.2, 0, 0.25], el: 1.3 + 0.3 * sw, curl: 0.9, thumb: 0.7 }, R: { sh: [0.7 * sw + 0.2, 0, -0.25], el: 1.3 - 0.3 * sw, curl: 0.95, thumb: 0.9 } };
    P.face = { ...mixFace(EMO.determined, EMO.strain, 0.3), mouth: 0.35, teeth: 0, look: [0, 0.4] };
    P.ears = [-0.3, 0.1];
    return P;
  }

  // ---- the lantern room ----------------------------------------------------------------------------------
  const CS = PL.crankStand;               // facing the crank; o = where she stands
  const BS = PL.burnerStand;
  const ent = PL.entry;
  const mid = lerp3(ent, BS.o, 0.55);
  // s07: she bursts in from the hatch and stops short, staring at the dark lens
  const inT0 = 13.3, inT1 = 13.85, riseT = 13.3;
  const inPath = (t) => lerp3(ent, mid, 1 - Math.pow(1 - clamp((t - inT0) / (inT1 - inT0)), 1.6));
  const inSteps = planSteps(inPath, inT0, inT1 + 0.02, 0.36, { stepTime: 0.15, lift: 0.1, width: 0.075 });
  const toLens = [PL.lensCenter[0] - mid[0], 0, PL.lensCenter[2] - mid[2]];
  const lensYaw = Math.atan2(toLens[0], toLens[2]);
  const runYaw = Math.atan2(mid[0] - ent[0], mid[2] - ent[2]);
  // walk to the foot of the service-step ladder 14.3..14.65, then up the ladder 14.65..15.0
  const LF = PL.ladderFoot ?? BS.o, STEPH = PL.stepHeight ?? 0;
  const wT0 = 14.3, wT1 = 14.65, cT1 = 15.0;
  const wPath = (t) => lerp3(mid, LF, smooth(clamp((t - wT0) / (wT1 - wT0))));
  const wSteps = planSteps(wPath, wT0, wT1 + 0.02, 0.3, { stepTime: 0.15, lift: 0.07, width: 0.07 });
  // up a ladder of three rungs: the root rises from the ladder foot to the step top, feet on the rungs
  function climb(D, rig, t0, t1, q, from, to, yaw) {
    const u = clamp((q - t0) / (t1 - t0)), e = smooth(u);
    const p = [lerp(from[0], to[0], e), lerp(from[1], to[1], e), lerp(from[2], to[2], e)];
    const rung = (k) => lerp(from[1], to[1], k / 3);
    const kL = Math.min(3, Math.floor(u * 3 + 0.5)), kR = Math.min(3, Math.floor(u * 3));
    const f = [Math.sin(yaw), 0, Math.cos(yaw)], sd = leftOf(f);
    const fpos = (k, side) => { const w = clamp(k / 3); return [lerp(from[0], to[0], w) + sd[0] * 0.08 * side, rung(k) + D.footH * 0.97, lerp(from[2], to[2], w) + sd[2] * 0.08 * side]; };
    const P = { pos: p, yaw, hip: [0, rig.hipY - 0.06, -0.04], hipRot: [0.25, 0, 0], waist: [0.15, 0, 0], spine: [0.15, 0, 0], neck: [-0.1, 0, 0], head: [-0.1, 0, 0], floorY: -1e9 };
    legsWorld(P, { foot: fpos(kL, 1), yaw, pitch: 0 }, { foot: fpos(kR, -1), yaw, pitch: 0 });
    const hy = to[1] + 0.35;
    P.arms = { L: { target: [to[0] + sd[0] * 0.18 - f[0] * 0.05, hy + 0.1 * (1 - e), to[2] + sd[2] * 0.18 - f[2] * 0.05], palm: [0, -1, 0], fingerDir: f, palmW: 1, curl: 0.9 }, R: { target: [to[0] - sd[0] * 0.18 - f[0] * 0.05, hy + 0.1 * e, to[2] - sd[2] * 0.18 - f[2] * 0.05], palm: [0, -1, 0], fingerDir: f, palmW: 1, curl: 0.9 } };
    return P;
  }
  const room = {
    stop: spr([[13.0, 0], [13.75, 0], [13.9, 1], [14.2, 1], [15, 1]], 15, 4.5, 0.4),
    head: spr([[13, 0.1], [13.85, 0.1], [13.98, -0.28], [14.2, -0.2], [14.35, -0.12], [15, 0.05]], 15, 5, 0.45),
    face: emoTrack([[13.0, 'determined'], [13.85, 'determined'], [14.0, 'shock'], [14.25, 'dread'], [14.45, 'determined'], [15, 'determined']]),
  };
  function suriRise(t, q) {
    // up the last steps of the stair through the floor hatch, paws on the rim, ears first
    const u = smooth(invLerp(13.0, riseT, q)), y = floorY - 0.78 * (1 - u), st = Math.floor(q * 12) % 2;
    const p = [ent[0], y, ent[2]], yaw = runYaw;
    const P = { pos: p, yaw, hip: [0, S.hipY - 0.05, 0.02], hipRot: [0.3, 0, 0], waist: [0.2, 0, 0], spine: [0.25, 0, 0], neck: [-0.2, 0, 0], head: [-0.25, 0, 0], floorY: -1e9 };
    legsWorld(P, { foot: add(p, [0.06, DS.footH + 0.18 * st, 0.12]), yaw, pitch: 0 }, { foot: add(p, [-0.06, DS.footH + 0.18 * (1 - st), -0.05]), yaw, pitch: 0 });
    const f = [Math.sin(yaw), 0, Math.cos(yaw)], sd = leftOf(f);
    const rimL = add(ent, mul(sd, 0.22), mul(f, 0.25), [0, floorY - ent[1] + 0.05, 0]), rimR = add(ent, mul(sd, -0.22), mul(f, 0.25), [0, floorY - ent[1] + 0.05, 0]);
    const reach = smooth(invLerp(13.05, 13.2, q));
    P.arms = { L: reach > 0.01 ? { target: lerp3(add(p, [0.2, 0.9, 0.1]), add(rimL, [0, 0.06, 0]), reach), palm: [0, -1, 0], fingerDir: f, palmW: 1, curl: 0.4 } : hang(1), R: reach > 0.01 ? { target: lerp3(add(p, [-0.2, 0.9, 0.1]), add(rimR, [0, 0.06, 0]), reach), palm: [0, -1, 0], fingerDir: f, palmW: 1, curl: 0.9 } : hang(-1) };
    P.face = { ...EMO.determined, mouth: 0.4, look: [0, 0.3] };
    P.ears = [-0.3, 0.1];
    P.tailBase = 0.9; P.tailBend = 0.1;
    return P;
  }
  function suriEntry(t, q) {
    if (q < riseT) return suriRise(t, q);
    const running = q < inT1 + 0.05, p = running ? inPath(q) : mid;
    const yaw = lerp(runYaw, lensYaw, smooth(invLerp(13.5, 14.0, q)));
    const st = room.stop(q), ph = (q - inT0) * 3.2 * 2 * PI, sw = Math.sin(ph) * (1 - st) * smooth(invLerp(riseT, riseT + 0.15, q));
    const pant = breathe(q, 0.42, 1) * st;
    const P = { pos: p, yaw, hip: [0, S.hipY - 0.04 * (1 - st) - 0.03 * st, 0.03 - 0.06 * st], hipRot: [0.15 * (1 - st) - 0.05 * st, 0, 0], waist: [0.1 * (1 - st) + 0.04 * pant, 0, 0], spine: [0.22 * (1 - st) - 0.1 * st + 0.06 * pant, -0.15 * sw, 0], neck: [0.02, 0, 0], head: [room.head(q), 0.06 * sw, 0], floorY };
    if (running) {
      const fL = inSteps.footPos(0, q), fR = inSteps.footPos(1, q);
      legsWorld(P, { foot: add(fL.pos, [0, DS.footH * 0.97 + fL.lift, 0]), yaw: runYaw, pitch: fL.lift > 0.02 ? -0.25 : 0 }, { foot: add(fR.pos, [0, DS.footH * 0.97 + fR.lift, 0]), yaw: runYaw, pitch: fR.lift > 0.02 ? -0.25 : 0 });
    } else {
      const lL = inSteps.landings[0].at(-1).p, lR = inSteps.landings[1].at(-1).p;
      legsWorld(P, foot(DS, lL, runYaw + 0.15), foot(DS, lR, runYaw - 0.15));
    }
    P.arms = { L: { sh: [-0.6 * sw + 0.1 + 0.15 * st, 0, 0.3 - 0.1 * st], el: 1.1 * (1 - st) + 0.5, curl: 0.8, thumb: 0.6 }, R: { sh: [0.6 * sw + 0.1 + 0.2 * st, 0, -0.3 + 0.08 * st], el: 1.1 * (1 - st) + 0.9 * st, curl: 0.95, thumb: 0.9 } };   // right paw holds the key to her chest
    P.face = { ...room.face(q), mouth: Math.max(room.face(q).mouth, 0.25 + 0.2 * pant), look: [0, q > 13.7 ? 0.25 : 0.1], blink: blinks(q, [14.25]) };
    P.ears = [q > 13.75 ? -0.2 : -0.35, 0.15];
    return P;
  }
  function suriToBurner(t, q) {
    if (q >= wT1) { const P = climb(DS, S, wT1, cT1, q, LF, BS.o, BS.yaw); P.face = { ...EMO.determined, look: [0, 0.3] }; P.ears = [0, 0.05]; return P; }
    const p = wPath(q), yaw = lerp(lensYaw, BS.yaw, smooth(invLerp(wT0, wT1, q)));
    const P = { pos: p, yaw, hip: [0, S.hipY - 0.03, -0.02], hipRot: [0.05, 0, 0], waist: [0.06, 0, 0], spine: [0.1, 0, 0], neck: [0, 0, 0], head: [0.05, 0, 0], floorY };
    const fL = wSteps.footPos(0, q), fR = wSteps.footPos(1, q);
    legsWorld(P, { foot: add(fL.pos, [0, DS.footH * 0.97 + fL.lift, 0]), yaw, pitch: 0 }, { foot: add(fR.pos, [0, DS.footH * 0.97 + fR.lift, 0]), yaw, pitch: 0 });
    P.arms = { L: { sh: [0.5, 0, 0.2], el: 1.4, curl: 0.7 }, R: { sh: [0.4, 0, -0.2], el: 1.6, curl: 0.95 } };
    P.face = { ...EMO.determined, look: [0, -0.2] };
    P.ears = [0, 0.05];
    return P;
  }

  // s08: the match. Box in the left paw, strike (CUES.matchStrike), the flame to the mantle (CUES.mantleCatch), the light on her face
  const ms = CUES.matchStrike, mc = CUES.mantleCatch;
  const fl = {
    strike: spr([[15, 0], [ms - 0.2, -0.3], [ms - 0.04, -0.35], [ms + 0.06, 1], [ms + 0.25, 0.85], [ms + 0.5, 0.8]], 17.6, 9, 0.5),
    reach: spr([[15, 0], [ms + 0.35, 0], [mc - 0.25, 1], [mc + 0.05, 1.05], [mc + 0.4, 0.55], [17.5, 0.35]], 17.6, 5, 0.55),
    lean: spr([[15, 0.12], [ms - 0.25, 0.2], [ms, 0.15], [mc - 0.1, 0.35], [mc + 0.2, 0.0], [mc + 0.6, -0.05], [17.5, 0.0]], 17.6, 5, 0.5),
    head: spr([[15, 0.32], [ms + 0.3, 0.32], [mc - 0.1, 0.12], [mc + 0.25, -0.12], [17.5, -0.05]], 17.6, 5, 0.5),
    face: emoTrack([[15, 'determined'], [ms - 0.1, 'determined'], [ms + 0.15, 'worry'], [mc - 0.05, 'worry'], [mc + 0.2, 'awe'], [mc + 0.8, 'awe'], [17.3, 'hope']]),
    flinch: spr([[15, 0], [mc - 0.02, 0], [mc + 0.06, 1], [mc + 0.4, 0], [17.5, 0]], 17.6, 8, 0.4),
  };
  function suriBurner(t, q) {
    const F = BS, lean = fl.lean(q), fn = fl.flinch(q), br = breathe(q, 0.8, 1);
    const P = { pos: F.o, yaw: F.yaw, hip: [0, S.hipY - 0.02, -0.03 - 0.03 * fn], hipRot: [0.06, 0, 0], waist: [lean * 0.4, 0, 0], spine: [lean * 0.6 + br * 0.02 - 0.08 * fn, 0.12, 0],
      neck: [-0.04, -0.06, 0], head: [fl.head(q) - 0.1 * fn, -0.08, 0.05], floorY };
    legsWorld(P, foot(DS, inF(F, 0.09, 0, 0.0), F.yaw + 0.1), foot(DS, inF(F, -0.1, 0, 0.1), F.yaw - 0.1));
    // box at the chest in the left paw; the right paw strikes along it, then carries the match toward the mantle
    const box = inF(F, 0.04, 0.88, 0.22), sk = fl.strike(q), re = fl.reach(q);
    const strikeP = add(box, mul(F.s, 0.02 - 0.09 * clamp(sk, -0.4, 1)), [0, 0.02 + 0.05 * Math.max(0, sk), 0], mul(F.f, 0.04 * Math.max(0, sk)));
    const burner = PL.burner, toB = [burner[0] - F.o[0], 0, burner[2] - F.o[2]], dB = Math.hypot(toB[0], toB[2]);
    const reachP = add(F.o, mul([toB[0] / dB, 0, toB[2] / dB], Math.min(dB - 0.06, 0.42)), [0, Math.min(burner[1] - 0.05, 1.05), 0], mul(F.s, -0.03));
    const handR = lerp3(strikeP, reachP, re);
    P.arms = {
      L: { target: add(box, mul(F.s, 0.04), [0, -0.03, 0], mul(F.f, -0.03)), palm: mul(F.s, -1), fingerDir: [0, 1, 0], palmW: 1, curl: 0.55, thumb: 0.5 },
      R: { target: add(handR, mul(F.f, -0.04), [0, -0.02, 0]), palm: lerp3([0, -1, 0], mul(F.s, 1), 0.5), fingerDir: F.f, palmW: 1, curl: 0.75, curls: [0.55, 0.62, 0.92, 0.95], thumb: 0.7 },
    };
    const f0 = fl.face(q);
    P.face = { ...f0, look: [0, lerp(-0.45, 0.05, re)], pupil: q > mc ? lerp(f0.pupil, 0.2, smooth(invLerp(mc, mc + 0.3, q))) : f0.pupil, blink: blinks(q, [15.35, mc + 0.04]) , refl: 0 };
    P.ears = [-0.05 + 0.25 * smooth(invLerp(mc, mc + 0.5, q)) - 0.25 * fn, 0.05];
    return P;
  }

  // ---- the crank ----
  const grip0 = PL.grip;              // live grip point this frame (Mech anchor) or our model
  const handsOnGrip = (g, F, D, k = 1, o = {}) => {
    // paws on the bar from above, a little apart along the side axis; the bar spins inside the fists
    const pL = add(g, mul(F.s, 0.035 * k), mul(F.f, -0.045)), pR = add(g, mul(F.s, -0.035 * k), mul(F.f, -0.045));   // the near end of the grip, clear of the crank arm
    const palm = o.palm ?? [0, -1, 0];
    return {
      L: grip(D, pL, add(mul(F.f, 0.8), [0, -0.2, 0]), palm, { curl: o.curlL ?? 0.7, reach: 1.0, palmOff: 1.35 }),
      R: grip(D, pR, add(mul(F.f, 0.8), [0, -0.2, 0]), palm, { curl: o.curlR ?? 0.7, reach: 1.0, palmOff: 1.35 }),
    };
  };
  // ease into the crank: s09 opens with the key at the keyhole; in (17.5..17.75); grip; lean (CUES.pushStart)
  const ps = CUES.pushStart, KEYIN = ps - 0.15;
  R.KEYIN = KEYIN;
  const ck = {
    lean: spr([[17.5, 0.05], [KEYIN, 0.08], [ps - 0.08, 0.1], [ps + 0.12, 0.62], [18.6, 0.55], [18.75, 0.5], [18.95, 0.72], [19.6, 0.66], [20.2, 0.7]], 25, 4, 0.45),
    drop: spr([[17.5, 0.0], [ps - 0.08, -0.01], [ps + 0.12, 0.09], [18.7, 0.06], [18.95, 0.12], [20.2, 0.1]], 25, 4, 0.45),
    back: spr([[17.5, 0.0], [ps + 0.12, -0.08], [18.7, -0.05], [18.95, -0.12], [20.2, -0.1]], 25, 4, 0.45),
    toe: keyed([[17.5, 0], [ps + 0.1, 0], [ps + 0.3, 0.55], [18.7, 0.5], [18.8, 0.2], [18.95, 0.6], [20.2, 0.55]]),
    head: spr([[17.5, 0.2], [KEYIN, 0.22], [ps, 0.05], [ps + 0.25, -0.1], [18.7, 0.05], [19.0, -0.2], [20.2, -0.15]], 25, 5, 0.45),
    face: emoTrack([[17.5, 'determined'], [ps, 'determined'], [ps + 0.25, 'strain'], [18.6, 'strain'], [18.75, 'determined'], [19.0, 'strain'], [19.8, 'strain'], [20.4, 'scream'], [21.2, 'strain']]),
  };
  // s12: braced, screaming; the notch (CUES.notch) throws her; then the slow turn begins (CUES.sweepStart)
  const nt = CUES.notch, ss = CUES.sweepStart;
  const ntc = {
    lurch: spr([[24.0, 0], [nt - 0.02, 0], [nt + 0.05, 1], [nt + 0.3, 0.3], [nt + 0.6, 0], [28, 0]], 30, 7, 0.35),
    brace: keyed([[20.2, 0], [23.6, 0], [24.2, 1], [ss + 0.25, 1], [ss + 0.8, 0], [30, 0]]),
    face: emoTrack([[20.2, 'strain'], [24.4, 'strain'], [24.75, 'scream'], [nt - 0.05, 'scream'], [nt + 0.12, 'shock'], [nt + 0.5, 'hope'], [ss + 0.4, 'determined'], [30, 'determined']]),
  };
  // s17: tired, paws slipping; Grandpa's paws land (CUES.grandpaJoins); s18: both lean in (CUES.fastSweep)
  const gj = CUES.grandpaJoins, fs = CUES.fastSweep;
  const tired = {
    sag: spr([[36, 0], [38.5, 0.4], [38.85, 0.55], [39.0, 0.75], [39.25, 0.6], [gj - 0.05, 0.62], [gj + 0.25, 0.25], [fs - 0.2, 0.1], [fs + 0.2, -0.1], [43, 0]], 52, 4, 0.45),
    slipR: keyed([[38.5, 0], [38.86, 0], [38.98, 1], [39.18, 1], [39.32, 0], [50, 0]]),
    slipL: keyed([[38.5, 0], [39.38, 0], [39.46, 0.6], [39.58, 0.6], [39.66, 0], [50, 0]]),
    head: spr([[38.5, 0.15], [38.9, 0.35], [39.05, 0.45], [39.3, 0.3], [gj, 0.3], [gj + 0.2, -0.15], [39.95, -0.35], [40.4, -0.3], [fs - 0.3, -0.2], [fs + 0.1, -0.25], [43, -0.2]], 52, 5, 0.45),
    turn: spr([[38.5, 0], [gj + 0.05, 0], [gj + 0.3, -0.55], [40.45, -0.5], [40.75, -0.1], [43, 0]], 52, 5, 0.5),
    face: emoTrack([[26, 'determined'], [37.5, 'determined'], [38.6, 'exhausted'], [38.95, 'pain'], [39.25, 'exhausted'], [gj + 0.1, 'exhausted'], [gj + 0.35, 'shock'], [40.0, 'hope'], [40.5, 'relief'], [40.9, 'determined'], [fs + 0.2, 'strain'], [42.2, 'hope'], [43, 'determined']]),
  };
  function crankPhase(t) { return PL.crankAngle(t); }
  function suriCrank(t, q, live) {
    const F = CS, br = breathe(q, 0.7, 1);
    const g = live ? grip0(t) : PL.gripAt(crankPhase(q));
    const ang = crankPhase(q);
    // where the grip is relative to her: side (left +) and height above the keyhole
    const gs = (g[0] - PL.keyhole[0]) * F.s[0] + (g[2] - PL.keyhole[2]) * F.s[2], gh = g[1] - PL.keyhole[1];
    let lean, drop, back, toe = 0, head, fc, hx = 0;
    if (q < 20.2) { lean = ck.lean(q); drop = ck.drop(q); back = ck.back(q); toe = ck.toe(q); head = ck.head(q); fc = ck.face(q); }
    else if (q < ss + 0.8) {
      const b = ntc.brace(q), lu = ntc.lurch(q);
      lean = lerp(0.68, 0.95, b) - 0.25 * lu + 0.02 * n1(q * 9, 3); drop = lerp(0.1, 0.16, b) - 0.04 * lu; back = lerp(-0.1, -0.2, b) + 0.06 * lu; toe = lerp(0.55, 0.2, b); head = lerp(-0.15, -0.35, b) + 0.25 * lu;
      fc = ntc.face(q);
    } else {
      // cranking: the body rides the handle; tired sag late in the night
      const sag = tired.sag(q);
      lean = 0.4 + 0.15 * (1 - Math.cos(ang)) * 0.5 + 0.2 * sag; drop = 0.06 + 0.04 * sag + 0.03 * (gh < 0 ? -gh / 0.24 : 0); back = -0.08; head = q > 38 ? tired.head(q) : -0.05 + 0.08 * Math.sin(ang);
      hx = clamp(gs * 0.25, -0.05, 0.05);
      fc = q > 36 ? tired.face(q) : ntc.face(q);
    }
    // a high handle is hung from on tiptoe, body upright, head back; a low one is leaned over
    const high = smooth(invLerp(0.02, 0.24, gh));
    if (q > KEYIN) { lean = lerp(lean, Math.min(0.2, lean), high); head = lerp(head, -0.12, high * 0.8); drop = lerp(drop, 0.02, high); toe = Math.max(toe * (1 - high), 0.3 * high); back = lerp(back, 0.04, high); }
    const tr = (s, a) => n1(onTwos(q) * 19, s) * a;
    const shake = q > ps && q < ss + 0.5 ? 1 : 0.3;
    const b = q > 20.2 && q < ss + 0.8 ? ntc.brace(q) : 0;
    const P = { pos: add(F.o, mul(F.f, back)), yaw: F.yaw, hip: [hx, S.hipY - drop - 0.06 * b, -0.04 - lean * 0.06 - 0.08 * b], hipRot: [lean * 0.25, 0, 0], waist: [lean * 0.35 + br * 0.02, 0, 0], spine: [lean * 0.55 + tr(1, 0.012 * shake), clamp(-gs * 0.6, -0.25, 0.25) + (q > 39.4 ? tired.turn(q) * 0.25 : 0), tr(2, 0.01 * shake)],
      neck: [-lean * 0.25, q > 39.4 ? tired.turn(q) * 0.3 : 0, 0], head: [head - lean * 0.2 + tr(3, 0.012 * shake), (q > 39.4 ? tired.turn(q) * 0.45 : 0) + tr(4, 0.01 * shake), 0], floorY };
    // feet: staggered, rear foot back for drive; in the brace the rear foot goes far back, toe dug in
    // both boots on Mech's foot-bar; in the brace the rear boot drops to the floor behind and drives
    const fFront = inF(F, 0.09, 0, 0.0), fRear = lerp3(inF(F, -0.09, 0, 0.0), inF(PL.crankFloor, -0.1, 0, -0.32), b);
    legsWorld(P, foot(DS, add(fFront, mul(F.f, back)), F.yaw + 0.12, toe * 0.5), foot(DS, add(fRear, mul(F.f, back * (1 - b))), F.yaw - 0.1, Math.max(toe * 0.5, 0.45 * b)));
    // paws
    if (q < KEYIN + 0.08) {
      // fitting the key: right paw pushes it home, left paw steadies on the pedestal
      const kp = R.keyMeet(q);
      P.arms = { L: { target: add(PL.keyhole, mul(F.s, 0.16), mul(F.f, -0.06), [0, 0.04, 0]), palm: F.f, fingerDir: [0, 1, 0], palmW: 1, curl: 0.2, thumb: 0.3 },
        R: { target: add(kp, mul(F.f, -DS.hand * 1.1), [0, -0.01, 0]), palm: mul(F.s, 1), fingerDir: F.f, palmW: 1, curl: 0.85, thumb: 0.9 } };
    } else {
      const H = handsOnGrip(g, F, DS, 1, { curlL: 0.6, curlR: 0.62 });
      const sR = tired.slipR(q), sL = tired.slipL(q);
      if (sR > 0) { H.R.target = add(H.R.target, [0, -0.09 * sR, 0], mul(F.f, -0.05 * sR), mul(F.s, -0.03 * sR)); H.R.curl = lerp(0.95, 0.35, sR); H.R.palm = lerp3([0, -1, 0], F.f, sR * 0.6); }
      if (sL > 0) { H.L.target = add(H.L.target, [0, -0.03 * sL, 0], mul(F.f, -0.02 * sL)); H.L.curl = lerp(0.92, 0.6, sL); }
      P.arms = H;
    }
    const blink = blinks(q, [17.62, 19.3, 27.4, 29.9, 31.6, 33.8, 35.1, 37.2, 39.7, 42.6, 45.8, 49.1]);
    P.face = { ...fc, look: [q > gj + 0.2 && q < 40.8 ? -0.55 : 0, q < 20 ? -0.3 : 0.05], blink };
    P.ears = [q > 20.2 && q < ss + 0.6 ? -0.5 : q > 38.6 && q < gj + 0.2 ? -0.35 : -0.15, q > 38.6 && q < gj + 0.2 ? 0.35 : 0.12];
    return P;
  }

  // s22: the spray hits (CUES.sprayHit); she lets go and cups her paws round the burner glass; it holds (CUES.flameSave)
  const sh = CUES.sprayHit, fsv = CUES.flameSave;
  // she leaves the crank to Grandpa at 49.0 (unseen, the exterior shots), walks round to the step and climbs it, and is tending the flame when the spray comes
  const svT0 = 49.0, svT1 = 49.9, svC1 = 50.3;
  const svFrom = add(PL.crankFloor.o, mul(PL.crankFloor.f, -0.4));   // just behind the foot-bar
  const svPath = (t) => lerp3(svFrom, LF, smooth(clamp((t - svT0) / (svT1 - svT0))));
  const svSteps = planSteps(svPath, svT0, svT1 + 0.02, 0.32, { stepTime: 0.17, lift: 0.08, width: 0.07 });
  const sv = {
    cup: spr([[49, 0], [sh - 0.05, 0.05], [sh + 0.12, 0.4], [sh + 0.3, 1], [fsv, 1], [fsv + 0.6, 0.92], [54, 0.9]], 56, 7, 0.55),
    lean: spr([[49, 0.3], [sh - 0.05, 0.2], [sh + 0.25, 0.45], [fsv, 0.42], [fsv + 0.4, 0.3], [54, 0.28]], 56, 5, 0.5),
    face: emoTrack([[49, 'exhausted'], [51.0, 'hope'], [sh - 0.02, 'hope'], [sh + 0.1, 'shock'], [sh + 0.35, 'dread'], [fsv - 0.1, 'dread'], [fsv + 0.25, 'relief'], [53.6, 'relief'], [54, 'exhausted']]),
  };
  function suriSave(t, q) {
    const F = BS;
    if (q >= svT1 && q < svC1) { const P = climb(DS, S, svT1, svC1, q, LF, BS.o, BS.yaw); P.face = { ...EMO.exhausted }; return P; }
    const moving = q < svT1;
    const p = moving ? svPath(q) : F.o, yaw = moving ? Math.atan2(LF[0] - svFrom[0], LF[2] - svFrom[2]) : F.yaw;
    const lean = sv.lean(q), cup = sv.cup(q), br = breathe(q, 0.55, 1);
    const P = { pos: p, yaw, hip: [0, S.hipY - 0.04, -0.03], hipRot: [0.08, 0, 0], waist: [lean * 0.4, 0, 0], spine: [lean * 0.6 + br * 0.02, 0, 0], neck: [-0.05, 0, 0], head: [0.15 + 0.1 * cup, 0, 0.04], floorY };
    if (moving) {
      const fL = svSteps.footPos(0, q), fR = svSteps.footPos(1, q);
      legsWorld(P, { foot: add(fL.pos, [0, DS.footH * 0.97 + fL.lift, 0]), yaw, pitch: 0 }, { foot: add(fR.pos, [0, DS.footH * 0.97 + fR.lift, 0]), yaw, pitch: 0 });
    } else legsWorld(P, foot(DS, inF(F, 0.1, 0, -0.02), F.yaw + 0.1, 0.15), foot(DS, inF(F, -0.1, 0, 0.08), F.yaw - 0.1, 0.25));
    // two paws curved round the glass chimney, a hand's width from it, fingers up
    const c = PL.burner, rr = 0.075;
    const toC = [c[0] - F.o[0], 0, c[2] - F.o[2]], dC = Math.hypot(toC[0], toC[2]), fc = [toC[0] / dC, 0, toC[2] / dC];
    // the chimney is past her reach: the cupped paws go as far toward it as she can lean, at flame height
    const reachC = dC > 0.55 ? add(F.o, mul(fc, 0.42), [0, Math.min(c[1] - F.o[1], 1.12), 0]) : c;
    const sL = leftOf(fc);
    const pL = add(reachC, mul(sL, rr), mul(fc, -0.03)), pR = add(reachC, mul(sL, -rr), mul(fc, -0.03));
    const restL = inF(F, 0.18, 0.75, 0.15), restR = inF(F, -0.18, 0.75, 0.15);
    P.arms = {
      L: { target: lerp3(restL, add(pL, [0, -0.1, 0], mul(sL, 0.02)), cup), palm: mul(sL, -1), fingerDir: [0, 1, 0], palmW: 1, curl: 0.35, thumb: 0.3, spread: 0.1 },
      R: { target: lerp3(restR, add(pR, [0, -0.1, 0], mul(sL, -0.02)), cup), palm: sL, fingerDir: [0, 1, 0], palmW: 1, curl: 0.35, thumb: 0.3, spread: 0.1 },
    };
    P.face = { ...sv.face(q), look: [0, -0.35], blink: blinks(q, [sh + 0.02, 53.3]) };
    P.ears = [q < fsv ? -0.45 : 0.0, 0.2];
    return P;
  }

  // ---- sitting at the crank: s25 the laugh and the ruffle, s28 asleep against the crank
  const SitS = { o: inF(CS, 0.42, 0, -0.18), f: CS.f, s: CS.s, yaw: CS.yaw + 0.5 };   // her back toward the pedestal side of the crank
  SitS.f = [Math.sin(SitS.yaw), 0, Math.cos(SitS.yaw)]; SitS.s = leftOf(SitS.f);
  // she faces away from the crank: turn round so her back is to the pedestal
  SitS.yaw += PI; SitS.f = mul(SitS.f, -1); SitS.s = mul(SitS.s, -1);
  const lg = CUES.laugh, sl = CUES.sleep;
  const sit = {
    back: spr([[59.0, -0.35], [lg - 0.3, -0.38], [lg, -0.55], [lg + 0.5, -0.5], [61.0, -0.3], [61.6, -0.12], [62.5, -0.2], [70, -0.25], [sl, -0.1], [73, -0.08]], 73.2, 3, 0.55),
    head: spr([[59, 0.15], [lg - 0.3, 0.18], [lg, -0.12], [lg + 0.35, 0.0], [lg + 0.7, -0.08], [61.1, 0.2], [61.8, 0.28], [62.5, 0.25], [70, 0.3], [sl, 0.5], [73, 0.55]], 73.2, 4, 0.5),
    tilt: spr([[59, 0.05], [61.0, 0.05], [61.4, 0.25], [62.4, 0.3], [70, 0.35], [sl, 0.5], [73, 0.55]], 73.2, 3, 0.6),
    face: emoTrack([[59, 'exhausted'], [lg - 0.35, 'exhausted'], [lg - 0.1, 'smile'], [lg + 0.1, 'laugh'], [61.2, 'laugh'], [61.6, 'smile'], [62.5, 'smile'], [68, 'kind'], [70.4, 'exhausted'], [sl - 0.3, 'exhausted'], [sl + 0.2, 'sleep']]),
    shake: (t) => (t > lg && t < 61.3 ? 0.04 * Math.abs(Math.sin((t - lg) * 22)) * (1 - invLerp(lg, 61.3, t)) : 0),
  };
  // s28: re-seated (off camera, during the dawn exteriors) facing the lens, knees up, cheek tipped onto the crank arm, asleep
  const Sleep = { o: inF(CS, 0.3, 0, 0.0), yaw: CS.yaw - 0.35 };
  Sleep.f = [Math.sin(Sleep.yaw), 0, Math.cos(Sleep.yaw)]; Sleep.s = leftOf(Sleep.f);
  function suriSleep(t, q) {
    const F = Sleep, br = breathe(q, 3.6, 1), nod = smooth(invLerp(70.4, sl, q));
    const P = { pos: F.o, yaw: F.yaw, hip: [0, DS.pelvis[1] * 1.05 + 0.03, 0], hipRot: [-0.55, 0, 0], waist: [0.15 + br * 0.03, 0, 0], spine: [0.1 + br * 0.03, 0, -0.15],
      neck: [-0.05, 0.1, -0.25 - 0.1 * nod], head: [-0.32 + 0.08 * nod, 0.25, -0.4 - 0.1 * nod], floorY: F.o[1] };
    legsWorld(P, { foot: inF(F, 0.11, DS.footH * 0.97, 0.2), yaw: F.yaw + 0.2, pitch: 0, pole: inF(F, 0.25, 1.0, 1.0) }, { foot: inF(F, -0.11, DS.footH * 0.97, 0.18), yaw: F.yaw - 0.2, pitch: 0, pole: inF(F, -0.25, 1.0, 1.0) });
    P.arms = { L: { target: inF(F, 0.08, 0.38, 0.22), palm: [0, -1, 0], fingerDir: F.f, palmW: 1, curl: 0.5 }, R: { target: inF(F, -0.06, 0.36, 0.22), palm: [0, -1, 0], fingerDir: F.f, palmW: 1, curl: 0.55 } };   // arms round her knees
    P.tailBase = 0.7; P.tailBend = 0.06;
    P.face = { ...mixFace(EMO.exhausted, EMO.sleep, smooth(invLerp(70.2, sl + 0.2, q))), look: [0, -0.2] };
    P.ears = [-0.25, 0.4];
    return P;
  }
  function suriSit(t, q) {
    const F = SitS, b = sit.back(q), br = breathe(q, q > sl ? 3.6 : 1.4, 1), lsh = sit.shake(q);
    const P = { pos: F.o, yaw: F.yaw, hip: [0, DS.pelvis[1] * 1.05 + 0.03, 0.0], hipRot: [-0.5, 0, 0], waist: [0.12 + b * 0.25 + br * 0.03 + lsh, 0, 0], spine: [0.2 + b * 0.3 + br * 0.03 + lsh * 0.5, 0, sit.tilt(q) * 0.3],
      neck: [0.2, 0, sit.tilt(q) * 0.4], head: [sit.head(q), 0.1, sit.tilt(q) * 0.5], floorY: F.o[1] };
    // legs out in front, knees a little up, boots fallen outward
    legsWorld(P, { foot: add(inF(F, 0.13, DS.footH * 0.8, 0.52)), yaw: F.yaw + 0.5, pitch: -0.5, pole: inF(F, 0.3, 1.0, 1.0) }, { foot: add(inF(F, -0.12, DS.footH * 0.8, 0.46)), yaw: F.yaw - 0.45, pitch: -0.45, pole: inF(F, -0.3, 1.0, 1.0) });
    P.arms = { L: { target: inF(F, 0.2, 0.06, 0.1), palm: [0, -1, 0], fingerDir: F.f, palmW: 1, curl: 0.4, thumb: 0.3 }, R: { target: inF(F, -0.06, 0.2, 0.2), palm: [0.2, -1, 0], fingerDir: add(F.f, mul(F.s, 0.4)), palmW: 1, curl: 0.55, thumb: 0.4 } };
    P.tailBase = 0.7; P.tailBend = 0.06;
    const f0 = sit.face(q);
    P.face = { ...f0, look: [0.3, -0.1], blink: q < sl - 1 ? blinks(q, [59.9, 62.1, 64.9, 67.6]) : 0 };
    P.ears = q > 61.0 && q < 62.4 ? [-0.25 + 0.15 * Math.sin(q * 30) * R.ruffle(q), 0.3 + 0.2 * R.ruffle(q)] : [-0.05, 0.25];
    return P;
  }

  // ================================================================ TOBI
  // ---- s05: fallen at the stair foot, holding his ankle; the key into her paw (CUES.keyHand); a nod up the stairs
  const kh = CUES.keyHand;
  const tb = {
    reach: spr([[7.8, 0], [8.7, 0], [9.15, 0.9], [kh, 1], [kh + 0.25, 0.95], [9.85, 0.3], [10.6, 0]], 10.8, 5, 0.5),
    nod: spr([[7.8, 0.15], [9.6, 0.2], [9.8, -0.45], [10.05, -0.4], [10.25, -0.15], [10.6, 0.05]], 10.8, 6, 0.45),
    turn: spr([[7.8, -0.35], [9.55, -0.3], [9.8, -0.75], [10.2, -0.7], [10.5, -0.2]], 10.8, 5, 0.5),
    wince: keyed([[7.8, 1], [8.6, 0.8], [8.8, 1], [9.1, 0.6], [10.6, 0.5]]),
    face: emoTrack([[7.8, 'pain'], [8.7, 'pain'], [9.1, 'determined'], [kh + 0.1, 'kind'], [9.75, 'determined'], [10.6, 'determined']]),
  };
  R.keyMeet = (t) => {
    // where the key is at time t (the hand-over point between their paws), world
    if (t < 13) {
      const u = tb.reach(t);
      return lerp3(inF(GF, -0.12, 0.4, 0.3), inF(GF, 0.02, 0.48, 0.58), u);
    }
    return add(PL.keyhole, mul(CS.f, -0.02 - 0.08 * (1 - smooth(invLerp(17.5, KEYIN, t)))));
  };
  function tobiFallen(t, q) {
    const F = GF, br = breathe(q, 1.6, 1), w = tb.wince(q);
    const P = { pos: F.o, yaw: F.yaw + 0.2, hip: [0, DT.pelvis[1] * 1.0 + 0.07, 0.04], hipRot: [-1.25, 0, 0.05], waist: [0.45 + br * 0.03, 0, 0], spine: [0.45 + 0.1 * w + br * 0.03, tb.turn(q) * 0.2, 0],
      neck: [0.15, tb.turn(q) * 0.35, 0], head: [tb.nod(q), tb.turn(q) * 0.45, 0.06], floorY: F.o[1] };
    // hurt right leg straight out; left knee up
    legsWorld(P, { foot: inF(F, 0.18, DT.footH * 0.97, 0.36), yaw: F.yaw + 0.2, pitch: 0, pole: inF(F, 0.25, 1.2, 0.9) }, { foot: inF(F, -0.14, DT.footH * 0.8, 0.62), yaw: F.yaw - 0.4, pitch: -0.6, pole: inF(F, -0.4, 0.8, 1.2) });
    const re = tb.reach(q), ankle = inF(F, -0.15, DT.footH + 0.06, 0.55);
    P.arms = {
      L: { target: add(ankle, mul(F.s, 0.06), [0, 0.05, 0], mul(F.f, -0.05)), palm: mul(F.s, -1), fingerDir: [0, -1, 0.3], palmW: 1, curl: 0.7, thumb: 0.6 },
      R: re > 0.02 ? { target: add(R.keyMeet(q), [0, -DT.hand * 0.2, 0], mul(F.f, -DT.hand * 1.0)), palm: lerp3([0, -1, 0], [0, -1, 0], re), fingerDir: F.f, palmW: 1, curl: lerp(0.9, 0.6, smooth(invLerp(kh, kh + 0.2, q))), thumb: 0.8 }
        : { target: add(ankle, mul(F.s, -0.05), [0, 0.08, 0], mul(F.f, -0.05)), palm: F.s, fingerDir: [0, -1, 0.3], palmW: 1, curl: 0.7, thumb: 0.6 },
    };
    P.tailBase = 1.25; P.tailBend = 0.05;
    P.face = { ...tb.face(q), look: q < 9.7 ? [-0.2, 0.0] : [0.3, 0.6], blink: blinks(q, [8.4, 9.65]), lens: 0.6 };
    P.ears = [-0.2, 0.25];
    return P;
  }
  R.tobiShoulder = (t) => inF(GF, -0.17, DT.pelvis[1] + 0.5, 0.18);

  // ---- the lantern room: he limps in and his paws land on the crank beside hers
  const TS = { o: inF(CS, -0.3, 0, -0.1), f: CS.f, s: CS.s, yaw: CS.yaw + 0.12 };
  const tIn0 = 38.75, tIn1 = gj - 0.08;
  const tStart = add(ent, mul(CS.s, 0));
  const tPath = (t) => lerp3(tStart, TS.o, smooth(clamp((t - tIn0) / (tIn1 - tIn0))));
  const tSteps = planSteps(tPath, tIn0, tIn1 + 0.02, Math.max(0.3, Math.hypot(TS.o[0] - tStart[0], TS.o[2] - tStart[2]) / 3.2), { stepTime: 0.24, lift: 0.07, width: 0.1 });
  const tc = {
    lean: spr([[38, 0.2], [gj - 0.1, 0.22], [gj + 0.05, 0.42], [gj + 0.3, 0.32], [fs - 0.3, 0.35], [fs, 0.55], [fs + 0.4, 0.42], [52, 0.4]], 60, 4, 0.45),
    face: emoTrack([[38.7, 'pain'], [gj - 0.15, 'determined'], [gj + 0.2, 'determined'], [39.95, 'kind'], [40.5, 'kind'], [40.9, 'determined'], [fs + 0.2, 'strain'], [42.4, 'determined'], [52, 'determined'], [52.4, 'worry'], [53.0, 'relief'], [54, 'determined']]),
    turn: spr([[38.7, 0], [39.85, 0], [40.0, 0.45], [40.5, 0.4], [40.75, 0], [52, 0]], 60, 5, 0.5),
  };
  function tobiCrank(t, q, live) {
    const walking = q < tIn1 + 0.02;
    const F = TS, ang = crankPhase(q), br = breathe(q, 0.9, 1);
    const g = live ? grip0(t) : PL.gripAt(ang);
    const lean = walking ? 0.25 : tc.lean(q);
    const p = walking ? tPath(q) : F.o;
    const yaw = walking ? lerp(Math.atan2(F.o[0] - tStart[0], F.o[2] - tStart[2]), F.yaw, smooth(invLerp(tIn1 - 0.3, tIn1, q))) : F.yaw;
    // the limp: the hurt (right) leg is not trusted; the hip drops when it takes weight
    const fR = walking ? tSteps.footPos(1, q) : null, limpDip = walking && fR.lift === 0 ? 0.035 : 0;
    const P = { pos: p, yaw, hip: [0, T.hipY - 0.03 - limpDip - (walking ? 0 : 0.03), -0.04], hipRot: [lean * 0.2, 0, walking ? (fR.lift === 0 ? 0.08 : -0.04) : 0], waist: [lean * 0.3 + br * 0.02, 0, 0], spine: [lean * 0.5, walking ? 0 : tc.turn(q) * 0.2, 0], neck: [-lean * 0.3, tc.turn(q) * 0.3, 0], head: [-0.22, tc.turn(q) * 0.45, 0], floorY };
    if (walking) {
      const fL = tSteps.footPos(0, q);
      legsWorld(P, { foot: add(fL.pos, [0, DT.footH * 0.97 + fL.lift, 0]), yaw, pitch: 0 }, { foot: add(fR.pos, [0, DT.footH * 0.97 + fR.lift * 0.6, 0]), yaw, pitch: 0 });
      // reaching for the crank as he arrives
      const u = smooth(invLerp(tIn1 - 0.35, tIn1 + 0.05, q));
      const H = handsOnGrip(g, CS, DT, 1);
      const off = mul(CS.s, -0.075);
      P.arms = { L: { ...H.L, target: lerp3(inF(F, 0.2, 0.75, 0.1), add(H.L.target, off), u) }, R: { ...H.R, target: lerp3(inF(F, -0.22, 0.7, 0.05), add(H.R.target, off, mul(CS.s, -0.02)), u) } };
    } else {
      legsWorld(P, foot(DT, inF(F, 0.12, 0, 0.04), F.yaw + 0.15), foot(DT, inF(F, -0.13, 0, -0.16), F.yaw - 0.2, 0.2));
      const H = handsOnGrip(g, CS, DT, 1), off = mul(CS.s, -0.075);
      H.L.target = add(H.L.target, off); H.R.target = add(H.R.target, off, mul(CS.s, -0.02));
      P.arms = H;
    }
    P.face = { ...tc.face(q), look: [q > 39.85 && q < 40.7 ? 0.5 : 0, 0], blink: blinks(q, [40.6, 44.2, 47.9, 50.6]), lens: 0.5 };
    P.ears = [-0.1, 0.2];
    return P;
  }
  // s25: sitting beside her, the ruffle
  const TSit = { o: inF(CS, -0.32, 0, -0.12), yaw: CS.yaw + PI - 0.35 };
  TSit.f = [Math.sin(TSit.yaw), 0, Math.cos(TSit.yaw)]; TSit.s = leftOf(TSit.f);
  const rf = {
    reach: spr([[59, 0], [60.75, 0], [61.05, 1], [62.3, 1], [62.6, 0.7], [64, 0]], 73.2, 5, 0.5),
    face: emoTrack([[59, 'exhausted'], [lg - 0.1, 'smile'], [lg + 0.3, 'laugh'], [61.0, 'kind'], [62.5, 'kind'], [66, 'kind'], [69, 'exhausted'], [71.5, 'sleep']]),
  };
  R.ruffle = (t) => (t > 61.05 && t < 62.4 ? 1 : 0) * rf.reach(t);
  function tobiSit(t, q) {
    const F = TSit, br = breathe(q, q > 71.5 ? 4 : 1.6, 1), re = rf.reach(q), wob = re > 0.5 ? Math.sin((q - 61.05) * 15) : 0;
    const P = { pos: F.o, yaw: F.yaw, hip: [0, DT.pelvis[1] + 0.04, 0], hipRot: [-0.55, 0, 0], waist: [0.22 + br * 0.03, 0, 0], spine: [0.18 + br * 0.03, 0.2 * re, 0.1 * re], neck: [0.15, 0.25 * re, 0], head: [q > 71.5 ? 0.55 : 0.1, 0.3 * re + 0.2, -0.1 * re], floorY: F.o[1] };
    legsWorld(P, { foot: inF(F, 0.18, DT.footH * 0.97, 0.5), yaw: F.yaw + 0.3, pitch: 0, pole: inF(F, 0.3, 1.0, 1.0) }, { foot: inF(F, -0.18, DT.footH * 0.97, 0.56), yaw: F.yaw - 0.3, pitch: 0, pole: inF(F, -0.3, 1.0, 1.0) });
    // left paw onto her head, the fingers working between the ears
    const head = R.suriHead ? R.suriHead() : inF(SitS, 0, 0.9, 0);
    const onHead = add(head, [0.0, 0.16 + 0.015 * wob, 0], mul(F.s, 0.02 * wob));
    P.arms = {
      L: re > 0.02 ? { target: lerp3(inF(F, 0.2, 0.4, 0.25), add(onHead, [0, 0.0, 0], mul(F.f, -0.05)), re), palm: [0, -1, 0], fingerDir: add(mul(F.f, 0.2), mul(F.s, -1)), palmW: re, curl: 0.35 + 0.2 * wob, thumb: 0.3 } : { target: inF(F, 0.16, 0.35, 0.32), palm: [0, -1, 0], fingerDir: F.f, palmW: 1, curl: 0.5 },
      R: { target: inF(F, -0.16, 0.33, 0.34), palm: [0, -1, 0], fingerDir: F.f, palmW: 1, curl: 0.5, thumb: 0.4 },
    };
    P.tailBase = 0.75; P.tailBend = 0.05;
    P.face = { ...rf.face(q), look: [-0.5, -0.2], blink: q < 71 ? blinks(q, [60.2, 63.4, 66.8, 69.3]) : 0, lens: 0.5 };
    P.ears = [-0.05, 0.2];
    return P;
  }

  // ================================================================ DAD
  // s03 captain: at the wheel, the light on the headland gone. s11 lookout: he wipes the window with his sleeve.
  const WF = PL.wheelhouse;
  const capt = {
    lean: spr([[3.8, 0.1], [4.6, 0.12], [5.2, 0.22], [6.2, 0.25]], 6.4, 3, 0.6),
    head: spr([[3.8, -0.05], [4.3, -0.1], [4.9, -0.18], [6.2, -0.16]], 6.4, 4, 0.5),
    hy: spr([[3.8, 0.25], [4.35, 0.25], [4.6, -0.12], [5.2, -0.05], [5.6, 0.06], [6.2, 0.02]], 6.4, 5, 0.5),
    face: emoTrack([[3.8, 'worry'], [4.4, 'worry'], [4.75, 'dread'], [6.2, 'dread']]),
  };
  const look = {
    wipe: (t) => (t < 22.75 || t > 24.05 ? 0 : 1),
    arm: spr([[22.3, 0], [22.7, 0], [22.95, 1], [23.9, 1], [24.2, 0], [24.8, 0]], 25, 5, 0.6),
    lean: spr([[22.3, 0.15], [22.8, 0.28], [23.9, 0.32], [24.3, 0.25], [24.8, 0.2]], 25, 3, 0.6),
    face: emoTrack([[22.3, 'dread'], [23.0, 'determined'], [23.8, 'worry'], [24.3, 'dread'], [24.8, 'dread']]),
    hy: spr([[22.3, 0], [23.0, 0], [23.4, 0.15], [23.8, -0.18], [24.2, 0.05], [24.8, 0]], 25, 4, 0.5),
  };
  function dadWheel(t, q) {
    const F = WF, s11 = q > 20, roll = 0.04 * Math.sin(q * 1.3) + 0.02 * Math.sin(q * 2.1);
    const lean = s11 ? look.lean(q) : capt.lean(q), hy = s11 ? look.hy(q) : capt.hy(q);
    const P = { pos: F.o, yaw: F.yaw, hip: [0, Dd.hipY - 0.03, -0.02], hipRot: [0.04, 0, roll], waist: [lean * 0.4, 0, -roll * 0.6], spine: [lean * 0.6, hy * 0.3, -roll * 0.3], neck: [0, hy * 0.3, 0], head: [s11 ? -0.12 : capt.head(q), hy * 0.4, 0], floorY: F.o[1] };
    legsWorld(P, foot(DD, inF(F, 0.16, 0, 0.02), F.yaw + 0.18), foot(DD, inF(F, -0.16, 0, -0.04), F.yaw - 0.18));
    const wh = PL.wheel, rr = 0.24;
    const gL = PL.wheelGripL ?? add(wh, mul(F.s, rr * 0.8), [0, rr * 0.55, 0]), gR = PL.wheelGripR ?? add(wh, mul(F.s, -rr * 0.8), [0, rr * 0.55, 0]);
    P.arms = { L: grip(DD, gL, add(mul(F.f, 0.5), [0, 0.7, 0], mul(F.s, -0.2)), add(F.f, [0, -0.2, 0]), { curl: 0.9 }), R: grip(DD, gR, add(mul(F.f, 0.5), [0, 0.7, 0], mul(F.s, 0.2)), add(F.f, [0, -0.2, 0]), { curl: 0.9 }) };
    if (s11) {
      // the sleeve across the glass: forearm flat, wiping side to side
      const a = look.arm(q), wx = Math.sin((q - 22.75) * 9) * 0.22 * look.wipe(q);
      const win = PL.wheelWindow, wp = add(win, mul(F.f, -0.12), mul(F.s, 0.05 + wx), [-0.0, -0.08, 0]);
      P.arms.L = { target: lerp3(P.arms.L.target, wp, a), palm: lerp3(P.arms.L.palm, F.f, a), fingerDir: lerp3(P.arms.L.fingerDir, mul(F.s, -1), a), palmW: 1, curl: 0.7, thumb: 0.6, pole: add(F.o, mul(F.s, 1.0), [0, 1.0, 0]) };
    }
    const f0 = s11 ? look.face(q) : capt.face(q);
    P.face = { ...f0, look: s11 ? [0.15 * Math.sin(q * 2.2), 0.15] : [0, 0.2], blink: blinks(q, [4.25, 5.5, 23.35, 24.4]) };
    P.ears = [-0.25, 0.25];
    return P;
  }
  // s24: soaked, on deck, looks up at the beam and smiles (CUES.dadSmile)
  const dsm = CUES.dadSmile;
  const dk = {
    head: spr([[54, 0.15], [57.0, 0.22], [57.35, -0.22], [57.8, -0.28], [dsm, -0.26], [59.6, -0.22]], 60, 4, 0.5),
    face: emoTrack([[54, 'exhausted'], [57.2, 'exhausted'], [57.6, 'awe'], [dsm - 0.15, 'awe'], [dsm + 0.25, 'smile'], [59.6, 'smile']]),
    raise: spr([[54, 0], [54.9, 0], [55.4, 1], [56.6, 1], [57.0, 0], [60, 0]], 60, 5, 0.55),
  };
  function dadDeck(t, q) {
    const d = PL.boatDeck(0, t), yaw0 = PL.boatYaw(0, t);
    // he faces the tower
    const toT = [160 - d[0], 0, -300 - d[2]], yaw = Math.atan2(toT[0], toT[2]);
    const pos = d.slice(), F = { o: pos, f: [Math.sin(yaw), 0, Math.cos(yaw)] }; F.s = leftOf(F.f);
    const br = breathe(q, 1.0, 1), sway = 0.03 * Math.sin(q * 1.1);
    const P = { pos, yaw, hip: [sway, Dd.hipY - 0.02, 0], hipRot: [0, 0, sway], waist: [0.06 + br * 0.02, 0, 0], spine: [0.04 + br * 0.03, 0, -sway], neck: [-0.08, 0, 0], head: [dk.head(q), 0.05, 0.04], floorY: pos[1] };
    // each boot follows the pitching deck: heel and toe sampled on Mech's deck, the foot tilted to match
    const onDeck = (g, fy) => {
      if (!R.deckY) return foot(DD, g, fy);
      const fw = [Math.sin(fy), 0, Math.cos(fy)], L = DD.footL * 0.6;
      const yh = R.deckY(g[0] - fw[0] * 0.03, g[2] - fw[2] * 0.03, g[1]), yt = R.deckY(g[0] + fw[0] * L, g[2] + fw[2] * L, g[1]);
      const pitch = Math.atan2(yh - yt, L + 0.03);
      return { foot: [g[0], Math.max(yh, yt) + DD.footH * 0.97 + 0.012, g[2]], yaw: fy, pitch, pole: undefined };
    };
    legsWorld(P, onDeck(inF(F, 0.16, 0, 0.03), yaw + 0.2), onDeck(inF(F, -0.17, 0, -0.05), yaw - 0.2));
    const r = dk.raise(q);
    P.arms = { L: hang(1, { out: 0.06, curl: 0.5 }), R: r > 0.02 ? { target: inF(F, -0.28, lerp(0.9, 1.95, r), 0.12), palm: F.f, fingerDir: [0, 1, 0], palmW: 1, curl: 0.95, thumb: 0.9 } : hang(-1, { out: 0.06, curl: 0.5 }) };
    void yaw0;
    P.face = { ...dk.face(q), look: [0, 0.5], blink: blinks(q, [55.6, 57.1, 58.9]) };
    P.ears = [0.05, 0.1];
    return P;
  }
  // at the wheel of the Kestrel in the exterior boat shots (only when Mech gives us the wheel)
  function dadBoatWheel(t, q) {
    if (!R.mechWheel) return null;
    const w = R.mechWheel(t); if (!w) return null;
    const yaw = PL.boatYaw(0, t);
    const F = { o: add(w, mul([Math.sin(yaw), 0, Math.cos(yaw)], -0.4), [0, -1.05, 0]), f: [Math.sin(yaw), 0, Math.cos(yaw)] }; F.s = leftOf(F.f);
    const P = { pos: F.o, yaw, hip: [0, Dd.hipY - 0.04, 0], hipRot: [0.05, 0, 0], waist: [0.1, 0, 0], spine: [0.2, 0, 0], neck: [0, 0, 0], head: [-0.1, 0, 0] };
    const gl = inF(F, 0.17, 0, 0.02), gr = inF(F, -0.17, 0, -0.04);
    if (R.deckY) { gl[1] = R.deckY(gl[0], gl[2], gl[1]); gr[1] = R.deckY(gr[0], gr[2], gr[1]); P.pos = [P.pos[0], Math.min(gl[1], gr[1]), P.pos[2]]; }
    legsWorld(P, foot(DD, gl, yaw + 0.2), foot(DD, gr, yaw - 0.2));
    P.arms = { L: grip(DD, add(w, mul(F.s, 0.18), [0, 0.12, 0]), add(F.f, [0, 0.6, 0]), [0, -0.3, 1], { curl: 0.9 }), R: grip(DD, add(w, mul(F.s, -0.18), [0, 0.12, 0]), add(F.f, [0, 0.6, 0]), [0, -0.3, 1], { curl: 0.9 }) };
    P.face = { ...EMO.determined, look: [0, 0.1] };
    return P;
  }

  // ================================================================ FISHERS on the pier (s23)
  const fishers = R.fishers.map((r, i) => {
    const bi = i + 1, side = bi % 2 ? 1 : -1;
    const z = -95 + bi * 14 + (i % 2 ? 2.5 : -2.5), x = PIER.from[0] + side * 1.6;
    const o = [x, PL.pierY, z], toT = [160 - x, 0, -300 - z], yaw = Math.atan2(toT[0], toT[2]);
    const F = { o, f: [Math.sin(yaw), 0, Math.cos(yaw)], yaw }; F.s = leftOf(F.f);
    const tUp = 55.0 + i * 0.22;
    const raise = spr([[54, 0], [tUp, 0], [tUp + 0.45, 1.05], [tUp + 0.7, 0.95], [58, 1]], 60, 4, 0.45);
    return { F, raise, i, D: r.D, hipY: r.hipY, seed: i * 7.3 };
  });
  function fisherPose(k, t, q) {
    const f = fishers[k], F = f.F, D = f.D, r = f.raise(q), br = breathe(q + f.seed, 1.2, 1), cheer = r > 0.8 ? 0.06 * Math.sin((q + f.seed) * 7) : 0;
    const P = { pos: F.o, yaw: F.yaw, hip: [0, f.hipY - 0.02, 0], hipRot: [-0.04 * r, 0, 0], waist: [0.02 - 0.05 * r, 0, 0], spine: [0.04 + br * 0.03 - 0.1 * r, 0, 0], neck: [-0.15 * r, 0, 0], head: [-0.2 * r + 0.04 * Math.sin(q * 0.7 + k), 0.1 * Math.sin(q * 0.5 + k), 0] };
    legsWorld(P, foot(D, inF(F, 0.15, 0, 0.02), F.yaw + 0.2), foot(D, inF(F, -0.15, 0, -0.05), F.yaw - 0.2));
    const up = inF(F, -0.2 - 0.05 * (k % 2), lerp(1.0, 2.05, r) + cheer, 0.15);
    P.arms = { L: k % 2 ? { target: inF(F, 0.28, lerp(1.0, 1.75, r) + cheer * 0.5, 0.2), palm: F.f, fingerDir: [0, 1, 0], palmW: 1, curl: 0.3 } : hang(1, { curl: 0.5 }), R: { target: up, palm: F.f, fingerDir: [0, 1, 0], palmW: 1, curl: 0.95, thumb: 0.9 } };
    P.face = { ...mixFace(EMO.exhausted, EMO.laugh, r * 0.7), look: [0, 0.5 * r], detail: 0 };
    P.ears = [0, 0.15];
    return P;
  }

  // ================================================================ secondary motion
  const suriTrack = (t) => {
    if (t < 8) { const p = add(KF.o, mul(KF.f, kitch.back(t))); return { pos: p, yaw: kYaw, seg: 0 }; }
    if (t < 10.35) return { pos: sF.o, yaw: sF.yaw, seg: 1 };
    if (t < 13) { const p = stairPath(t), p2 = stairPath(t + 0.05); return { pos: p, yaw: Math.atan2(p2[0] - p[0], p2[2] - p[2]), seg: 2 }; }
    if (t < riseT) return { pos: [ent[0], floorY - 0.78 * (1 - smooth(invLerp(13.0, riseT, t))), ent[2]], yaw: runYaw, seg: 3 };
    if (t < 14.35) return { pos: t < inT1 ? inPath(t) : mid, yaw: runYaw, seg: 3 };
    if (t < wT1) return { pos: wPath(t), yaw: BS.yaw, seg: 3 };
    if (t < 15.0) return { pos: lerp3(LF, BS.o, smooth(invLerp(wT1, cT1, t))), yaw: BS.yaw, seg: 3 };
    if (t < 17.5) return { pos: BS.o, yaw: BS.yaw, seg: 3 };
    if (t < svT0) return { pos: CS.o, yaw: CS.yaw, seg: 4 };
    if (t < svT1) return { pos: svPath(t), yaw: CS.yaw, seg: 4 };
    if (t < 54) return { pos: lerp3(LF, BS.o, smooth(invLerp(svT1, svC1, t))), yaw: BS.yaw, seg: 4 };
    return { pos: SitS.o, yaw: SitS.yaw, seg: 5 };
  };
  // the crank throws the body round: a rhythmic push felt by the soft parts
  const crankDrive = (t) => (t > ss && t < svT0 ? [0.4 * Math.sin(crankPhase(t)), 0.5 * Math.cos(crankPhase(t)), 0] : t > 10.35 && t < 13 ? [0.6 * Math.sin((t - runT0) * 19.5), 0, 0] : [0, 0, 0]);
  const suriSec = bakeSecondary(suriTrack, { tailLinks: R.suri.tailLinks.length, extra: crankDrive, tailLift: -0.6 });
  const tobiTrack = (t) => (t < tIn0 ? { pos: GF.o, yaw: GF.yaw, seg: 0 } : t < tIn1 ? { pos: tPath(t), yaw: TS.yaw, seg: 1 } : { pos: TS.o, yaw: TS.yaw, seg: 1 });
  const tobiSec = bakeSecondary(tobiTrack, { tailLinks: R.tobi.tailLinks.length, extra: (t) => (t > gj ? [0.3 * Math.sin(crankPhase(t)), 0.3 * Math.cos(crankPhase(t)), 0] : [0, 0, 0]), tailLift: -0.9, tailSway: 0.03 });
  const dadTrack = (t) => ({ pos: [0, 0, 0], yaw: 0, seg: 0 });
  const dadSec = bakeSecondary(dadTrack, { tailLinks: R.dad.tailLinks.length, tailLift: -0.9, tailSway: 0.08 });
  const fisherSec = bakeSecondary(dadTrack, { tailLinks: 5, tailLift: -0.8 });

  // wind in the lantern room once the panes are gone, and on deck
  const windAt = (t, where) => (where === 'lamp' ? (t < 62.5 ? 1 : lerp(1, 0.2, smooth(invLerp(62.5, 68, t)))) : where === 'deck' ? 0.7 : where === 'stairs' ? 0.2 : 0);
  const withSec = (P, sec, t, where, q) => {
    if (!P) return P;
    const s = sec(q, windAt(t, where));
    P.tailChain = s.tail; P.scarf = s.scarf; P.hood = s.hood; P.coat = s.coat;
    if (P.tailBase != null) { P.tailChain = s.tail.map((l, i) => (i === 0 ? [P.tailBase, l[1]] : [l[0] * 0.3 + (P.tailBend ?? 0), l[1] * 0.5])); }
    const e = P.ears ?? [0, 0]; P.ears = [e[0] + s.ears[0], e[1] + s.ears[1]];
    return P;
  };

  // which performance runs at film time t
  function poseFor(st) {
    const t = st.t, q = onTwos(t), out = {};
    // SURI
    let ps = null, whereS = 'lamp';
    if (t < 8.0) { if (t > 5.0) { ps = suriKitchen(t, q); whereS = 'in'; } }
    else if (t < 10.5) { ps = suriStairFoot(t, q); whereS = 'in'; }
    else if (t < 13.0) { ps = suriStairs(t, q); whereS = 'stairs'; }
    else if (t < 14.35) ps = suriEntry(t, q);
    else if (t < 15.0) ps = suriToBurner(t, q);
    else if (t < 17.5) ps = suriBurner(t, q);
    else if (t < svT0) ps = suriCrank(t, q, true);
    else if (t < 54.0) ps = suriSave(t, q);
    else if (t >= 66.5) ps = suriSleep(t, q);
    else if (t >= 59.0) ps = suriSit(t, q);
    else ps = suriSave(t, Math.min(q, 54.0));
    out.suri = withSec(ps, suriSec, t, whereS, q);
    // TOBI
    let pt = null;
    if (t >= 7.8 && t < 10.6) pt = tobiFallen(t, q);
    else if (t >= tIn0 && t < 59.0) pt = tobiCrank(t, q, true);
    else if (t >= 59.0) pt = tobiSit(t, q);
    out.tobi = withSec(pt, tobiSec, t, 'lamp', q);
    // DAD
    let pd = null, whereD = 'in';
    if ((t >= 3.8 && t < 6.2) || (t >= 22.3 && t < 24.8)) pd = dadWheel(t, q);
    else if (t >= 54.0 && t < 59.5) { pd = dadDeck(t, q); whereD = 'deck'; }
    else if (R.showDadAtWheel) { pd = dadBoatWheel(t, q); whereD = 'deck'; }   // off: Mech's wheelhouse windows are opaque lit panels
    out.dad = withSec(pd, dadSec, t, whereD, q);
    out.fishers = t >= 53.5 && t < 60 ? fishers.map((f, k) => withSec(fisherPose(k, t, q), fisherSec, t, 'deck', q)) : [];
    return out;
  }
  return { poseFor, KEYIN, suriTrack, EMO, FACE0, frames: { KF, sF, GF, CS, BS, SitS, TSit, TS, WF } };
}
