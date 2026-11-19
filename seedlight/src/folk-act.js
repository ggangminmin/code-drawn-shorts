import * as THREE from 'three';
import { onTwos, noise1, clamp, lerp, smooth, invLerp } from './util.js';
import { bakeSpring, keyed, breathe } from './motion.js';
import { SEEDROOM, TOWER, ROOF, CATCH, VAULT, COURT, DAM } from './layout.js';
import { DURATION } from './shots.js';

// SEEDLIGHT, the performances. Pure functions of film time, sampled on twos. +X is a character's left, +Z forward.
// Pose: { pos, yaw | rot | quat, hip, hipRot, waist, spine, neck, head, legs, arms, face, ears, tail, ... } (folk-rig setPose)
const PI = Math.PI, n1 = noise1;
const FACE = { look: [0, 0], pupil: 0.38, mouth: 0, jaw: 0, lid: 0, lidB: 0, tilt: 0, browUp: 0, browTilt: 0, wet: 0, smile: 0, teeth: 0, narrow: 0, ymouthK: 0.4, tear: 0, tear2: 0, refl: 0, detail: 0 };
const face = (o) => ({ ...FACE, ...o });
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const L3 = (a, b, u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
const loc = (pos, yaw, x, y, z) => { const s = Math.sin(yaw), c = Math.cos(yaw); return [pos[0] + x * c + z * s, pos[1] + y, pos[2] - x * s + z * c]; };
const rotY = (yaw, v) => { const s = Math.sin(yaw), c = Math.cos(yaw); return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]; };
const spr = (keys, freq = 4, damp = 0.45) => bakeSpring(keyed(keys), keys[keys.length - 1][0] + 1.5, { freq, damp, tStart: keys[0][0], x0: keys[0][1] });
const blinkAt = (t, at) => { const d = t - at; if (d < 0 || d > 0.22) return 0; return d < 0.06 ? d / 0.06 : d < 0.1 ? 1 : 1 - (d - 0.1) / 0.12; };
// alternate stepping along a path: s = step clock; foot 0 moves on [0,1], [2,3]...; foot 1 on [1,2], [3,4]...; returns progress in steps and lift 0..1
const stepper = (s, ph) => { const k = Math.floor((s - ph) / 2), f = s - ph - 2 * k; const e = smooth(clamp(f)); return { p: Math.max(0, 2 * k + 2 * e), lift: s - ph < 0 ? 0 : Math.sin(PI * clamp(f)) }; };
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4();
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const qYaw = (yaw) => new THREE.Quaternion().setFromAxisAngle(Y, yaw);
const qEuler = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'YXZ'));
const basisQ = (yv, zv) => { const y = yv.clone().normalize(), z = zv.clone().addScaledVector(y, -zv.dot(y)).normalize(), x = new THREE.Vector3().crossVectors(y, z); return new THREE.Quaternion().setFromRotationMatrix(_m.makeBasis(x, y, z)); };
const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const A3 = (v) => [v.x, v.y, v.z];

export function createActing(ctx, R) {
  const { CUES } = ctx;
  const { nari, tam, bo, guards } = R;
  const DN = nari.D, DT = tam.D, DB = bo.D, DG = guards[0].D;
  const groundY = (x, z, fb) => { const y = ctx.land?.groundY?.(x, z); return Number.isFinite(y) ? y : fb; };
  const mech = (name, fb) => { const v = ctx.mech?.anchor?.(name, _v.set(NaN, 0, 0)); return v && Number.isFinite(v.x) ? [v.x, v.y, v.z] : fb; };

  // ---------------------------------------------------------------- generic poses
  // standing on planted feet (IK). o: crouch, hx, hz, stance, fL:[x,z,lift,pitch], fR, + body angles
  function stand(rig, pos, yaw, o = {}) {
    const D = rig.D, st = (o.stance ?? 1) * D.hipW * 1.15, ay = D.footH * 0.9;
    const fL = o.fL ?? [0, 0, 0, 0], fR = o.fR ?? [0, 0, 0, 0];
    return {
      pos, yaw, hip: [o.hx ?? 0, rig.hipY - (o.crouch ?? 0), o.hz ?? 0], hipRot: o.hipRot, waist: o.waist, spine: o.spine, neck: o.neck, head: o.head,
      legs: {
        L: { foot: loc(pos, yaw, st + fL[0], ay + (fL[2] ?? 0), fL[1]), yaw: o.toe ?? 0.12, pitch: fL[3] ?? 0, pole: loc(pos, yaw, st * 1.6 + (o.kneeOut ?? 0), 0.3, 2) },
        R: { foot: loc(pos, yaw, -st + fR[0], ay + (fR[2] ?? 0), fR[1]), yaw: -(o.toe ?? 0.12), pitch: fR[3] ?? 0, pole: loc(pos, yaw, -st * 1.6 - (o.kneeOut ?? 0), 0.3, 2) },
      },
      arms: o.arms, face: o.face, ears: o.ears, earTip: o.earTip, tail: o.tail ?? [-0.9, 0], tailChain: o.tailChain, strap: o.strap,
    };
  }
  // running (FK legs, hips carried at the height that keeps the lower foot on the ground)
  function run(rig, pos, yaw, ph, o = {}) {
    const D = rig.D, A = o.amp ?? 0.75;
    const leg = (p) => { const th = 0.2 + A * Math.sin(p), k = 0.25 + 1.25 * Math.max(0, Math.sin(p - 1.9)) + 0.2; return { th, k, h: D.thigh * Math.cos(th) + D.shin * Math.cos(k - th) }; };
    const l = leg(ph), r = leg(ph + PI), h = Math.max(l.h, r.h) + D.footH * 0.9 + (o.air ?? 0.04) * Math.abs(Math.sin(ph));
    const sw = Math.sin(ph) * (o.arm ?? 0.9);
    return {
      pos, yaw, hip: [0, h, 0], hipRot: [o.lean ?? 0.25, 0.12 * Math.sin(ph), 0], waist: [0.05, -0.1 * Math.sin(ph), 0], spine: [0.1, -0.16 * Math.sin(ph), 0], neck: [-0.1, 0, 0], head: [-(o.lean ?? 0.25) * 0.8, 0, 0],
      legs: { L: { thigh: [-l.th, 0, 0.04], knee: l.k, ankle: [0.3 * Math.sin(ph - 1), 0, 0] }, R: { thigh: [-r.th, 0, -0.04], knee: r.k, ankle: [0.3 * Math.sin(ph + PI - 1), 0, 0] } },
      arms: o.arms ?? { L: { sh: [sw * 0.9 + 0.1, 0, 0.18], el: 1.3, curl: 0.7 }, R: { sh: [-sw * 0.9 + 0.1, 0, -0.18], el: 1.3, curl: 0.7 } },
      face: o.face, ears: o.ears, earTip: o.earTip, tail: o.tail ?? [-0.3 + 0.2 * Math.sin(ph * 2), 0.2 * Math.sin(ph)], strap: o.strap,
    };
  }

  // ---------------------------------------------------------------- NARI
  const W = SEEDROOM.window, DAIS = ROOF.dais, EDGE = ROOF.edge;
  // her mark, kept just clear of the dais step (land: step r = 2.95, 0.26 high) so her feet stay on the roof floor
  const G = [ROOF.girlStand[0], ROOF.girlStand[1], Math.max(ROOF.girlStand[2], DAIS[2] + 3.2)];
  const WO = 1.0;   // she leans out through the opening, clear of the lit window pane behind her
  const WIN_POS = [W[0], W[1] - 0.9, W[2] - 0.12 + WO], SEED_HELD = [W[0] - 0.02, W[1] - 0.07, W[2] + 0.27 + WO];
  const LIE = [G[0] + 2.6, G[1] + 0.105, G[2] + 1.8];                 // her feet after the blast; head toward -Z, face up
  const DAIS_LIE = [DAIS[0], DAIS[1] + 0.105, DAIS[2] + 0.62];
  const DAIS_STAND = [DAIS[0], DAIS[1], DAIS[2] + 0.7], FLOOR_RUN0 = [0, EDGE[1], DAIS[2] + 3.0], EDGE_STAND = [EDGE[0], EDGE[1], EDGE[2] - 0.32];
  const REACH = nari.hipY + DN.abd + DN.spine + DN.sh[1] + DN.upper + DN.fore;   // root -> wrist with the arms straight up
  const qLie = qEuler(-PI / 2, 0, 0);
  // ears: follow-through springs over the whole film (pitch back -, splay out +)
  const earP = bakeSpring(keyed([[0, 0.2], [1.3, 0.25], [1.38, -0.35], [2.2, -0.2], [20.9, -0.2], [21.0, -0.7], [23.4, -0.7], [23.6, -0.1], [26.4, -0.1], [27.0, -0.55], [29.0, -0.75], [31.4, -0.6], [32.6, -0.55], [33.6, 0.02], [34.9, 0.0], [35.0, 0.15], [35.4, 0.2], [35.5, 0.9], [36.0, 0.55],
    [60.4, 0.55], [60.9, 0.1], [61.6, -0.25], [64.0, -0.3], [64.4, -0.85], [65.4, -0.85], [65.5, 0.2], [66.0, -0.3], [67.3, -0.2], [67.4, -0.9], [68.2, -1.0], [69.4, -0.8], [72.4, -0.7], [DURATION, -0.7]]), DURATION + 1, { freq: 3.4, damp: 0.3 });
  const earS = bakeSpring(keyed([[0, 0.05], [1.3, 0.05], [1.38, 0.3], [2.2, 0.15], [26.4, 0.1], [27.0, 0.45], [29.0, 0.6], [32.6, 0.45], [33.6, 0.0], [35.4, 0.0], [35.5, 0.75], [36.2, 0.8], [60.4, 0.8], [61.0, 0.3], [64.4, 0.4], [67.4, 0.3], [DURATION, 0.3]]), DURATION + 1, { freq: 3.0, damp: 0.32 });
  const ears = (t, a = 0, b = 0) => [earP(t) + a + 0.02 * n1(t * 5, 2), earS(t) + b];
  const cupArms = (sd, o = {}) => ({
    L: { target: add3(sd, [0.05, -0.05, -0.035]), palm: [-0.25, 1, -0.1], fingerDir: [-0.55, 0.3, 0.78], palmW: 1, curl: o.curl ?? 0.4, thumb: 0.3, spread: 0.12 },
    R: { target: add3(sd, [-0.05, -0.05, -0.035]), palm: [0.25, 1, -0.1], fingerDir: [0.55, 0.3, 0.78], palmW: 1, curl: o.curl ?? 0.4, thumb: 0.3, spread: 0.12 },
  });
  const withSeed = (Pz, sd) => { Pz.seed = sd; return Pz; };
  const startle = spr([[0.9, 0.4], [1.24, 0.4], [1.32, 1], [3.4, 0.85]], 5, 0.4);

  function nariWindow(t, q) {
    const s = startle(q), tr = n1(q * 19, 5) * 0.004 * s;
    const sd = add3(SEED_HELD, [tr, 0.012 * s + tr, -0.02 * s]);
    return { ...stand(nari, WIN_POS, 0, { crouch: 0.03 + 0.02 * s, hz: -0.03 * s, spine: [0.3 - 0.22 * s, 0, 0], waist: [0.1 - 0.08 * s, 0, 0], neck: [0.25 - 0.3 * s, 0.15, 0], head: [0.3 - 0.22 * s, 0.22 + 0.05 * s, 0.04 * s],
      arms: cupArms(sd), ears: ears(q),
      face: face({ look: [0, -0.5 + 0.1 * s], pupil: lerp(0.4, 0.2, s), lid: lerp(0.18, 0, s), browUp: 1.0 * s, tilt: 0.35 * s, mouth: 0.42 * s, narrow: 0.5 * s, ymouthK: 0, wet: 0.35 * s, detail: 1 }) }), seed: sd, seedR: 1.6 };
  }
  function nariStair(t, q) {
    const u = invLerp(20.9, 23.4, t), a = 0.4 + u * PI * 2.6, r = TOWER.r - 1.7, c = TOWER.center;
    const pos = [c[0] + Math.sin(a) * r, lerp(W[1] - 0.9, TOWER.roofY - 1.2, u), c[2] + Math.cos(a) * r];
    return { ...run(nari, pos, a + PI / 2, q * 2 * PI * 3.2, { lean: 0.4, ears: ears(q), face: face({ lid: 0.1, mouth: 0.3 }) }), seedR: 5 };
  }
  const fearFace = (t, o = {}) => face({ look: [0, 0.35], pupil: 0.22, lid: 0, browUp: 0.7, tilt: 0.6, mouth: 0.22 + 0.04 * n1(t * 9, 1), narrow: 0.6, ymouthK: 0, wet: 0.5, detail: 1, ...o });
  function nariBack(t, q) {
    // s11/s12: on the roof, backing away from the +Z parapet, step by step, to her mark
    const s = clamp((q - 26.5) / 0.5, 0, 4), N = 4, D = 1.0;
    const a = stepper(s, 0), b = stepper(s, 1), zL = G[2] + D * (1 - a.p / N), zR = G[2] + D * (1 - Math.min(N, b.p) / N), zB = (zL + zR) / 2 + 0.03;
    const pos = [G[0], G[1], zB], sc = smooth(invLerp(26.6, 27.2, q)), up = smooth(invLerp(27.7, 28.4, q));
    const hands = add3(pos, [0, 0.93, 0.13]);
    return stand(nari, pos, 0, { crouch: 0.03 + 0.03 * sc, fL: [0, zL - zB, a.lift * 0.07, -a.lift * 0.3], fR: [0, zR - zB, b.lift * 0.07, -b.lift * 0.3], spine: [-0.06 * sc - 0.1 * up, 0, 0], neck: [-0.15 * up, 0, 0], head: [0.05 - 0.4 * up, 0.06 * n1(q * 3, 3) * (1 - up), 0],
      arms: { L: { target: add3(hands, [0.05, 0.02 * n1(q * 14, 1), 0]), palm: [-0.6, 0, -0.8], fingerDir: [-0.6, 0.7, 0.3], curl: 0.7, thumb: 0.6 }, R: { target: add3(hands, [-0.05, 0.015, 0.03]), palm: [0.6, 0, -0.8], fingerDir: [0.6, 0.7, 0.3], curl: 0.7, thumb: 0.6 } },
      ears: ears(q), face: fearFace(q, { look: [0, 0.1 + 0.3 * up], mouth: 0.15 + 0.2 * up }) });
  }
  function nariStand(t, q) {
    // s13-s15: small before the kneeling Lantern; fear, then the gold light, then wonder
    const calm = smooth(invLerp(CUES.chestLit - 0.2, CUES.chestLit + 0.9, q)), wonder = smooth(invLerp(32.7, 33.7, q));
    const tr = (1 - calm) * (1 - wonder);
    const offer = smooth(invLerp(30.8, 31.8, q));
    const sd = add3(G, [-0.2 * offer, 0.885 + 0.03 * offer, 0.125 + 0.13 * offer]);
    const ir = mech('iris', [ROOF.lanternKneel[0], G[1] + 2.4, ROOF.lanternKneel[2] - 1.2]), hx = ir[0] - G[0], hy = ir[1] - (G[1] + 1.05), hz = ir[2] - G[2];
    const lp = clamp(-Math.atan2(hy, Math.hypot(hx, hz)) + 0.14, -0.5, 0.25), ly = clamp(Math.atan2(hx, hz), -0.8, 0.8);
    const gun = smooth(invLerp(CUES.shell1 + 0.05, CUES.shell1 + 0.3, q));   // the cannon: her head snaps toward the sound
    const blink = Math.max(blinkAt(t, 31.9), blinkAt(t, 33.05));
    return withSeed(stand(nari, G, 0, { crouch: 0.03 * tr, hz: -0.02 * tr, spine: [-0.14 + 0.08 * wonder, 0, 0.01 * n1(q * 16, 2) * tr], neck: [lp * 0.35, ly * 0.3, 0], head: [lp * 0.65, ly * 0.7 * (1 - gun) + 0.5 * gun, 0.1 * wonder],
      arms: cupArms(add3(sd, [0, 0.004 * n1(q * 17, 1) * tr, 0]), { curl: 0.5 - 0.15 * offer }),
      ears: ears(q),
      face: face({ look: [0.3 * gun, 0.3 - 0.3 * gun], pupil: lerp(0.21, 0.42, wonder), lid: 0, blink, lidB: 0.12 * (1 - wonder), browUp: lerp(0.7, 0.95, wonder), tilt: lerp(0.65, 0.12, wonder), mouth: lerp(0.2, 0.3, wonder) + 0.03 * n1(q * 9, 1) * tr, narrow: lerp(0.65, 0.35, wonder), ymouthK: 0, wet: lerp(0.55, 0.9, wonder), refl: 0.95 * smooth(invLerp(32.4, 33.2, q)) * (1 - gun), detail: 1, smile: 0.25 * wonder }) }), sd);
  }
  const lieBody = (o = {}) => ({
    hip: [0, nari.hipY, 0], waist: [o.waist ?? 0.03, 0, 0.04], spine: [o.spine ?? 0.02, 0, 0.03], neck: [0.2, 0, 0], head: [0.1, o.headYaw ?? 0.5, 0],
    legs: { L: { thigh: [-0.22, 0, 0.12], knee: 0.42, ankle: [0.5, 0, 0] }, R: { thigh: [-0.02, 0, -0.1], knee: 0.06, ankle: [0.6, 0, 0] } },
    arms: { L: { sh: [0.15, 0, 0.75], el: 0.5, curl: 0.35 }, R: { sh: [0.1, 0, -0.4], el: 0.2, curl: 0.3 } },
    tail: [-1.35, 0.5], face: face({ lid: 1, mouth: 0.08, ymouthK: 0, browUp: -0.1, tilt: 0.2 }),
  });
  function nariThrown(t, q) {
    const u = clamp((q - CUES.shell1Hit) / 0.55), e = 1 - (1 - u) * (1 - u);
    const pos = L3(G, LIE, e); pos[1] += 0.42 * Math.sin(PI * u) * (1 - u * 0.3);
    const B = lieBody({}), k = 1 - u;
    return { ...B, pos, quat: qYaw(0).slerp(qLie, smooth(clamp(u * 1.25))), waist: [0.5 * k, 0, 0], spine: [0.4 * k, 0, 0], neck: [0.2 + 0.3 * k, 0, 0],
      legs: { L: { thigh: [-0.22 - 0.9 * k, 0, 0.12], knee: 0.42 + 0.8 * k, ankle: [0.5, 0, 0] }, R: { thigh: [-0.02 - 0.5 * k, 0, -0.1], knee: 0.06 + 0.9 * k, ankle: [0.6, 0, 0] } },
      arms: { L: { sh: [0.15 - 1.6 * k, 0, 0.75], el: 0.5, curl: 0.2 }, R: { sh: [0.1 - 1.9 * k, 0, -0.4], el: 0.2 + 0.5 * k, curl: 0.2 } },
      ears: ears(q), face: face({ lid: u > 0.5 ? 1 : 0.3, mouth: 0.5 * k, pupil: 0.2, ymouthK: 0, browUp: 0.3, tilt: 0.6 }) };
  }
  function palmFrame(t) {
    // where the Lantern's open hand is (fallbacks follow the layout marks)
    let p, up;
    const fbLift = () => { const u = smooth(invLerp(CUES.lift, CUES.setDown - 0.3, t)); return [lerp(LIE[0], DAIS[0], u), lerp(LIE[1] - 0.1, DAIS[1] + 0.15, u) + 1.4 * Math.sin(PI * u), lerp(LIE[2] - 0.6, DAIS[2], u)]; };
    const fbPush = () => { const u = smooth(invLerp(CUES.push, CUES.push + 1.3, t)); return [lerp(EDGE_STAND[0], CATCH.pos[0], u), lerp(EDGE_STAND[1], CATCH.pos[1] - REACH - 0.1, u), lerp(EDGE_STAND[2], CATCH.pos[2], u)]; };
    p = mech('palm', t < 55 ? fbLift() : fbPush());
    const v = ctx.mech?.palmUp?.(_w.set(0, 1, 0)); up = v && Number.isFinite(v.x) && v.lengthSq() > 0.5 ? v.clone().normalize() : new THREE.Vector3(0, 1, 0);
    return { p, up };
  }
  function nariCarried(t, q) {
    // s19: limp on the palm, then laid on the dais
    const B = lieBody({ headYaw: -0.4 });
    const wOn = smooth(invLerp(CUES.lift - 0.1, CUES.lift + 0.35, t)), wOff = smooth(invLerp(CUES.setDown - 0.35, CUES.setDown + 0.05, t));
    const { p, up } = palmFrame(t);
    if (up.y < 0.3) up.set(0, 1, 0);
    const hd = new THREE.Vector3(0, 0, -1); hd.addScaledVector(up, -hd.dot(up)).normalize();
    const qp = basisQ(hd, up), pp = V(p).addScaledVector(up, 0.105).addScaledVector(hd, -(nari.hipY + 0.12));
    const pos = V(LIE).lerp(pp, wOn).lerp(V(DAIS_LIE), wOff), quat = qLie.clone().slerp(qp, wOn).slerp(qLie, wOff);
    const limp = wOn * (1 - wOff);
    return { ...B, pos: A3(pos), quat, neck: [0.2, 0, 0.1 * limp], arms: { L: { sh: [0.15, 0, 0.75 + 0.25 * limp], el: 0.5, curl: 0.35 }, R: { sh: [0.1 + 0.2 * limp, 0, -0.4 - 0.35 * limp], el: 0.2, curl: 0.3 } }, ears: ears(q, 0, 0) };
  }
  const sit = spr([[60.0, 0], [60.7, 0], [61.25, 1], [64.5, 1]], 3.2, 0.5), reach = spr([[60.0, 0], [61.0, 0], [61.5, 1], [63.0, 0.6], [64.5, 0.2]], 3.5, 0.45);
  function nariWake(t, q) {
    const B = lieBody({}), open = smooth(invLerp(CUES.wake, CUES.wake + 0.35, q)), s = sit(q), r = reach(q);
    const stir = smooth(invLerp(CUES.wake - 0.3, CUES.wake + 0.3, q));
    return { ...B, pos: DAIS_LIE, quat: qLie, waist: [0.03 + 0.62 * s, 0, 0.04 * (1 - s)], spine: [0.02 + 0.5 * s, -0.12 * r, 0], neck: [0.2 + 0.1 * s, 0, 0], head: [0.1 - 0.35 * s, 0.5 * (1 - stir), 0.06 * r],
      legs: { L: { thigh: [-0.22 - 0.35 * s, 0, 0.12], knee: 0.42 + 0.5 * s, ankle: [0.5, 0, 0] }, R: { thigh: [-0.02 - 0.1 * s, 0, -0.1], knee: 0.06 + 0.1 * s, ankle: [0.6, 0, 0] } },
      arms: { L: { sh: [0.15 + 0.5 * s, 0, 0.75 - 0.45 * s], el: 0.5 - 0.2 * s, curl: 0.2, wr: [0, 0, 0] }, R: { sh: [0.1 - 1.5 * r, 0, -0.4 + 0.3 * r], el: 0.2 + 0.25 * (1 - r), curl: lerp(0.3, 0.05, r), spread: 0.3 * r, thumb: 0.1 } },
      ears: ears(q),
      face: face({ lid: lerp(1, 0.0, open), blink: blinkAt(t, CUES.wake + 0.5), look: [0.0, 0.05], pupil: lerp(0.4, 0.26, r), browUp: 0.75 * r, tilt: 0.85 * r, mouth: 0.1 + 0.42 * r, narrow: 0.2, ymouthK: 0, wet: 1.0 * r, tear: 0.5 * smooth(invLerp(61.3, 61.9, q)), detail: 1, lidB: 0.2 * r }) };
  }
  function nariUp(t, q) {
    // s25 (seen from far): from sitting on the dais to her feet, then a jump down to the roof floor
    if (q < 64.0) {
      const u = smooth(invLerp(63.1, 63.9, q)), A = nariWake(t, q), S = stand(nari, DAIS_STAND, 0, { crouch: 0.1 * (1 - u), spine: [0.2, 0, 0], ears: ears(q), face: fearFace(q, { look: [0, 0.2] }) });
      if (u <= 0) return A;
      if (u >= 1) return S;
      return { ...A, pos: L3(DAIS_LIE, add3(DAIS_STAND, [0, 0, 0]), u), quat: qLie.clone().slerp(qYaw(0), u), waist: [0.65 * (1 - u), 0, 0], spine: [0.5 * (1 - u) + 0.2 * u, 0, 0],
        legs: { L: { thigh: [-0.57 * (1 - u), 0, 0.1], knee: 0.92 * (1 - u), ankle: [0.5 * (1 - u), 0, 0] }, R: { thigh: [-0.12 * (1 - u), 0, -0.1], knee: 0.16 * (1 - u), ankle: [0.6 * (1 - u), 0, 0] } } };
    }
    const u = invLerp(64.0, 64.4, q), pos = [0, EDGE[1] + (DAIS[1] - EDGE[1]) * (1 - smooth(invLerp(0.6, 1, u))) + 0.22 * Math.sin(PI * u), lerp(DAIS_STAND[2], FLOOR_RUN0[2], u)];
    return run(nari, pos, 0, 1.2 + u * 2.4, { lean: 0.3, ears: ears(q), face: fearFace(q, { look: [0, 0.2], mouth: 0.4 }) });
  }
  function nariRun(t, q) {
    const u = invLerp(64.4, 65.32, q), e = 1 - (1 - u) ** 1.6, pos = L3(FLOOR_RUN0, EDGE_STAND, e);
    if (u >= 1) return stand(nari, EDGE_STAND, 0, { crouch: 0.08, fL: [0, 0.12, 0, 0], fR: [0, -0.1, 0, 0], spine: [0.15, 0, 0], head: [-0.4, 0, 0], ears: ears(q), arms: { L: { sh: [-0.4, 0, 0.5], el: 0.6 }, R: { sh: [-0.3, 0, -0.5], el: 0.6 } }, face: fearFace(q, { look: [0, 0.4], mouth: 0.45, tilt: 0.7, wet: 0.9 }) });
    return run(nari, pos, 0, q * 2 * PI * 2.4, { lean: 0.42 * (1 - u * 0.5), amp: 0.95, air: 0.1, ears: ears(q), face: fearFace(q, { look: [0, 0.3], mouth: 0.5, tilt: 0.75, wet: 0.9 }) });
  }
  const armUp = spr([[65.0, 0], [65.75, 0], [66.3, 1], [70, 1]], 3.6, 0.42), crouchP = spr([[65.0, 0.08], [65.4, 0.08], [65.55, 0.2], [66.1, 0.02], [70, 0.0]], 3, 0.5);
  const swing = spr([[CATCH.t - 0.2, 0], [CATCH.t, 0], [CATCH.t + 0.22, 1.05], [CATCH.t + 0.75, 0.3], [CATCH.t + 1.3, 0.5], [DURATION, 0.4]], 1.7, 0.35);
  function tamGrip() { const a = tam.anchor('handL', new THREE.Vector3()), b = tam.anchor('handR', new THREE.Vector3()); return { a, b, g: a.clone().add(b).multiplyScalar(0.5) }; }
  function nariLift(t, q, sk) {
    // s26/s27: on the rising palm, both arms to the sky; the jump to his hands; the swing under the skiff
    const { p } = palmFrame(t), wOn = smooth(invLerp(CUES.push - 0.05, CUES.push + 0.3, t));
    const yaw = lerp(0, -PI * 0.42, smooth(invLerp(66.2, 67.2, q)));
    let pos = L3(EDGE_STAND, p, wOn);
    const tg = tamGrip(), dtc = CATCH.t - t;
    const up = armUp(q), cr = crouchP(q);
    if (t < CATCH.t) {
      // the last quarter second: she springs off the palm to where his hands will be
      const gc = tg.g.clone().addScaledVector(sk.h, CATCH.speed * dtc), wj = smooth(invLerp(CATCH.t - 0.26, CATCH.t, t));
      if (tam.root.visible && gc.distanceTo(V(pos)) < 6) pos = L3(pos, [gc.x, gc.y - REACH + 0.02, gc.z], wj);
      const aim = tam.root.visible && dtc < 0.6;
      const sh = loc(pos, yaw, 0, REACH - DN.upper - DN.fore, 0);
      const tgt = (s) => (aim ? A3((s > 0 ? tg.a : tg.b).clone().lerp(V(add3(sh, [0, 0.5, 0])), clamp(dtc / 0.6) * 0.5)) : null);
      const arm = (s) => (aim ? { target: tgt(s), palm: [sk.h.x, 0.2, sk.h.z], fingerDir: [0, 1, 0], curl: 0.1, spread: 0.25, thumb: 0 } : { sh: [-(0.5 + 2.45 * up), 0, s * (0.5 - 0.3 * up)], el: 0.5 * (1 - up) + 0.08, curl: 0.25 - 0.2 * up, spread: 0.25, thumb: 0.1 });
      return stand(nari, pos, yaw, { crouch: cr * (1 - smooth(invLerp(CATCH.t - 0.2, CATCH.t, t))), stance: 1.2, spine: [-0.1 * up, 0, 0], neck: [-0.2 * up, 0, 0], head: [-0.25 - 0.3 * up, 0, 0], arms: { L: arm(1), R: arm(-1) }, ears: ears(q),
        face: face({ look: [0, 0.4], pupil: 0.3, browUp: 0.8, tilt: 0.5, mouth: 0.5 * up, wet: 0.9, detail: 1, ymouthK: 0 }) });
    }
    // caught: the body trails behind the grip and swings
    const th = swing(q), d = new THREE.Vector3(-sk.h.x * Math.sin(th), -Math.cos(th), -sk.h.z * Math.sin(th)).normalize();
    const yv = d.clone().negate(), quat = basisQ(yv, sk.h.clone().negate());
    const root = tg.g.clone().addScaledVector(d, REACH - 0.015);
    const kick = Math.max(0, 1 - (t - CATCH.t) / 0.8);
    return { pos: A3(root), quat, hip: [0, nari.hipY, 0], waist: [-0.1 * th, 0, 0], spine: [-0.12, 0, 0], neck: [-0.3, 0, 0], head: [-0.5, 0, 0],
      legs: { L: { thigh: [-0.25 - 0.5 * kick, 0, 0.08], knee: 0.5 + 0.5 * kick, ankle: [0.7, 0, 0] }, R: { thigh: [0.25 * th, 0, -0.08], knee: 0.25 + 0.3 * th, ankle: [0.7, 0, 0] } },
      arms: { L: { target: A3(tg.a.clone().addScaledVector(d, 0.045)), palm: [-1, 0, 0], fingerDir: A3(yv), curl: 0.85, thumb: 0.8 }, R: { target: A3(tg.b.clone().addScaledVector(d, 0.045)), palm: [1, 0, 0], fingerDir: A3(yv), curl: 0.85, thumb: 0.8 } },
      ears: ears(q), tail: [-0.9 - 0.4 * th, 0], face: face({ look: [0, 0.5], pupil: 0.3, browUp: 0.9, tilt: 0.3, mouth: 0.55, wet: 0.9, detail: 1, ymouthK: 0 }) };
  }
  function nariAboard(t, q, sk) {
    // s29: kneeling on the deck behind the boy, looking back at the burning dam
    const pos = V(sk.seatBoy).addScaledVector(sk.h, -0.42);
    const quat = sk.q.clone().multiply(qYaw(PI * 0.82));
    return { pos: A3(pos), quat, hip: [0, DN.thigh * 0.94 + 0.05, 0], spine: [0.1, 0.25, 0], neck: [0, 0.2, 0], head: [-0.05, 0.25, 0.08],
      legs: { L: { thigh: [-0.25, 0, 0.14], knee: 1.95, ankle: [0.9, 0, 0] }, R: { thigh: [-0.25, 0, -0.14], knee: 1.95, ankle: [0.9, 0, 0] } },
      arms: { L: { sh: [-0.5, 0, 0.3], el: 0.9, curl: 0.6 }, R: { sh: [-0.9, 0, -0.1], el: 0.6, curl: 0.2 } },
      ears: ears(q, 0.25 * n1(q * 7, 3), 0), tail: [-0.2, 0.3], face: face({ look: [0, 0], lid: 0.12, browUp: 0.4, tilt: 0.9, mouth: 0.1, wet: 1, tear: 1, detail: 1, ymouthK: 0 }) };
  }

  // ---------------------------------------------------------------- the skiff and its crew
  function skiffFrame(t) {
    const hookFb = [CATCH.pos[0] + CATCH.dir[0] * CATCH.speed * (t - CATCH.t), CATCH.pos[1] + 1.55, CATCH.pos[2] + CATCH.dir[2] * CATCH.speed * (t - CATCH.t)];
    const hook = mech('hook', null);
    if (!hook || !ctx.mech?.skiff) {
      const h = new THREE.Vector3(...CATCH.dir).normalize(), q = qYaw(Math.atan2(h.x, h.z));
      return { fb: true, hook: hookFb, seatBoy: add3(hookFb, [0.25 * h.x, 0.42, 0.25 * h.z]), seatPilot: add3(hookFb, [-1.5 * h.x, 0.5, -1.5 * h.z]), h, q, up: new THREE.Vector3(0, 1, 0) };
    }
    const seatBoy = mech('seatBoy', add3(hook, [0, 0.42, 0])), seatPilot = mech('seatPilot', add3(hook, [-1.5, 0.5, 0])), nose = mech('skiffNose', null);
    ctx.mech.skiff.getWorldQuaternion(_q);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(_q);
    const h = nose ? V(nose).sub(V(seatPilot)) : V(seatBoy).sub(V(seatPilot));
    h.addScaledVector(up, -h.dot(up)); if (h.lengthSq() < 1e-4) h.set(1, 0, 0); h.normalize();
    return { hook, seatBoy, seatPilot, h, q: basisQ(up, h), up };
  }
  const hangW = spr([[CUES.hang - 0.2, 0], [CUES.hang, 0], [CUES.hang + 0.5, 1], [69.6, 1], [70.6, 0], [DURATION, 0]], 2.6, 0.5);
  const KNEE_Y = tam.hipY - 0.02 - DT.thigh;
  function tamPose(t, q, sk) {
    const w = clamp(hangW(q), 0, 1.08), fl = n1(q * 9, 7);
    const earsT = [-1.25 + 0.2 * fl, 0.1], strap = [0, 1, 2, 3].map((i) => [0.9 + 0.3 * n1(q * 8 - i * 0.4, 9), 0.2 * n1(q * 7 - i * 0.3, 4)]);
    const hStand = DT.footH * 0.9 + DT.thigh * Math.cos(0.3) + DT.shin * Math.cos(0.25);
    const Ps = { pos: sk.seatBoy, quat: sk.q.clone(), hip: [0, hStand, -0.05], hipRot: [0.12, 0, 0], waist: [0.1, 0, 0], spine: [0.18, 0.1, 0], neck: [-0.1, 0, 0], head: [-0.2, -0.1, 0],
      legs: { L: { thigh: [-0.3, 0, 0.2], knee: 0.55, ankle: [0.1, 0, -0.2] }, R: { thigh: [-0.05, 0, -0.22], knee: 0.3, ankle: [0.1, 0, 0.2] } },
      arms: { L: { sh: [-1.25, 0, 0.1], el: 0.75, curl: 0.95, thumb: 0.9 }, R: { sh: [-0.9, 0, -0.25], el: 1.0, curl: 0.95, thumb: 0.9 } },
      ears: earsT, earTip: 0.5 + 0.3 * fl, strap, tail: [0, 0],
      face: face({ look: [0.1, -0.1], lid: 0.12, browUp: 0.1, tilt: -0.3, mouth: 0.15, teeth: 0.3, detail: 0.6 }) };
    if (w <= 0.001) return Ps;
    // hanging upside down by the knees from the hook bar, facing ahead, arms stretched down
    const qh = basisQ(new THREE.Vector3(0, -1, 0), sk.h.clone());
    const held = t > CATCH.t, pull = smooth(invLerp(CATCH.t - 0.5, CATCH.t - 0.05, t)), th = held ? swing(q) : 0;
    const rootH = V(sk.hook).sub(new THREE.Vector3(0, KNEE_Y + 0.045, -0.03).applyQuaternion(qh));
    const Ph = { pos: A3(rootH), quat: qh, hip: [0, tam.hipY, 0], hipRot: [0, 0, 0], waist: [-0.12 - 0.1 * th, 0, 0], spine: [-0.15 - 0.15 * th, 0, 0], neck: [-0.35, 0, 0], head: [-0.75 + 0.3 * th, 0, 0],
      legs: { L: { thigh: [-0.12, 0, 0.1], knee: 1.6, ankle: [-0.5, 0, 0] }, R: { thigh: [-0.12, 0, -0.1], knee: 1.6, ankle: [-0.5, 0, 0] } },
      arms: { L: { sh: [-(PI - 0.25 - 0.3 * (1 - pull)) - 0.3 * th, 0, 0.1 + 0.25 * (1 - pull)], el: 0.12 + 0.5 * (1 - pull), curl: held ? 0.9 : 0.15, spread: 0.3, thumb: held ? 0.85 : 0 }, R: { sh: [-(PI - 0.25 - 0.3 * (1 - pull)) - 0.3 * th, 0, -0.1 - 0.25 * (1 - pull)], el: 0.12 + 0.5 * (1 - pull), curl: held ? 0.9 : 0.15, spread: 0.3, thumb: held ? 0.85 : 0 } },
      ears: [1.5 + 0.25 * fl, 0.15], earTip: 0.3 + 0.3 * fl, strap, tail: [0, 0],
      face: face({ look: [0, 0.3], lid: 0, browUp: 0.5, tilt: held ? 0.2 : -0.5, mouth: held ? 0.5 : 0.45, teeth: 0.6, pupil: 0.3, detail: 0.8 }) };
    if (w >= 0.999) return Ph;
    // the drop over the side: a swing from the deck to the bar
    const u = clamp(w), pos = V(Ps.pos).lerp(rootH, u).addScaledVector(sk.up, 0.3 * Math.sin(PI * u));
    const mix = (a, b) => (Array.isArray(a) ? a.map((x, i) => lerp(x, b[i], u)) : lerp(a, b, u));
    const leg = (s) => ({ thigh: mix(Ps.legs[s].thigh, Ph.legs[s].thigh), knee: mix(Ps.legs[s].knee, Ph.legs[s].knee), ankle: mix(Ps.legs[s].ankle, Ph.legs[s].ankle) });
    const arm = (s) => ({ sh: mix(Ps.arms[s].sh, Ph.arms[s].sh), el: mix(Ps.arms[s].el, Ph.arms[s].el), curl: 0.5 });
    return { ...Ph, pos: A3(pos), quat: Ps.quat.clone().slerp(qh, u), hip: mix(Ps.hip, Ph.hip), waist: mix(Ps.waist, Ph.waist), spine: mix(Ps.spine, Ph.spine), head: mix(Ps.head, Ph.head), legs: { L: leg('L'), R: leg('R') }, arms: { L: arm('L'), R: arm('R') }, ears: mix(Ps.ears, Ph.ears) };
  }
  function boPose(t, q, sk) {
    const tl = mech('tiller', null);
    const lean = 0.06 * n1(q * 1.3, 2), look = smooth(invLerp(CUES.hang - 0.3, CUES.hang + 0.3, q)) * (1 - smooth(invLerp(69.4, 70.4, q)));
    return { pos: sk.seatPilot, quat: sk.q.clone(), hip: [0, DB.pelvis[1] * 0.9, 0], hipRot: [-0.15, 0, lean], waist: [0.2, 0, -lean], spine: [0.25, -0.2 * look, 0], neck: [-0.1, 0, 0], head: [-0.25 + 0.25 * look, -0.5 * look, 0],
      legs: { L: { thigh: [-1.25, 0, 0.22], knee: 1.35, ankle: [-0.2, 0, 0] }, R: { thigh: [-1.35, 0, -0.22], knee: 1.2, ankle: [-0.2, 0, 0] } },
      arms: { L: { sh: [-0.85, 0, 0.3], el: 0.9, curl: 0.9 }, R: tl ? { target: tl, palm: [0, -1, 0], fingerDir: A3(sk.h.clone().negate()), curl: 0.95, thumb: 0.9 } : { sh: [0.55 + 0.1 * lean, 0, -0.35], el: 0.5, curl: 0.95, thumb: 0.9 } },
      ears: [0, 0], strap: [0, 1, 2].map((i) => [1.0 + 0.3 * n1(q * 8 - i * 0.4, 12), 0.2 * n1(q * 7, 5 + i)]), tailChain: [0, 1, 2, 3, 4].map((i) => [-0.25 + 0.15 * n1(q * 6 - i * 0.3, 21), 0.2 * n1(q * 5 - i * 0.3, 22)]), tail: [0.5, 0],
      face: face({ lid: 0.2, mouth: 0.1 + 0.3 * look, teeth: 0.5 * look, tilt: -0.4 }) };
  }

  // ---------------------------------------------------------------- GUARDS
  const FY = VAULT.floorY, FACE_W = -PI / 2;
  const KNEEL = [[-92.3, FY, 1.15], [-92.7, FY, -1.2], [-91.7, FY, -0.1]];
  const SH_Y = guards[0].hipY + DG.abd + DG.spine + DG.sh[1];
  const gface = (o = {}) => face({ lid: 0.1, browUp: 0.5, tilt: 0.3, mouth: 0.2, pupil: 0.25, ...o });
  // carbine: butt at the right shoulder / hip; both paws on it by IK
  function gunPose(pos, yaw, mode, drop, kick = 0, aimY = 0.12) {
    if (mode === 'aim') {
      const dir = rotY(yaw, [0.05, aimY, 1]), butt = loc(pos, yaw, -0.2, SH_Y - drop - 0.05, 0.12 - 0.05 * kick);
      return { gun: { pos: butt, dir, up: [0, 1, 0] }, arms: { R: { target: add3(butt, rotY(yaw, [-0.02, -0.07, 0.3])), palm: rotY(yaw, [1, 0, 0]), fingerDir: rotY(yaw, [0, -0.2, 1]), curl: 0.9, pole: loc(pos, yaw, -0.9, 0.5, -0.2) }, L: { target: add3(butt, rotY(yaw, [0.02, -0.02, 0.62])), palm: rotY(yaw, [-0.3, 1, 0]), fingerDir: rotY(yaw, [-0.6, 0, 0.8]), curl: 0.8, pole: loc(pos, yaw, 0.7, 0.2, 0.3) } } };
    }
    const dir = rotY(yaw, [0.7, 0.62, 0.25]), butt = loc(pos, yaw, -0.26, SH_Y - drop - 0.46, 0.2);
    return { gun: { pos: butt, dir, up: rotY(yaw, [0, 0.4, 1]) }, arms: { R: { target: add3(butt, rotY(yaw, [0.2, 0.14, 0.05])), palm: rotY(yaw, [0, 0, -1]), fingerDir: rotY(yaw, [0.7, -0.5, 0.2]), curl: 0.9, pole: loc(pos, yaw, -0.9, 0.6, -0.3) }, L: { target: add3(butt, rotY(yaw, [0.46, 0.4, 0.14])), palm: rotY(yaw, [0, 0, -1]), fingerDir: rotY(yaw, [0.6, 0.7, 0.1]), curl: 0.85, pole: loc(pos, yaw, 0.9, 0.5, -0.2) } } };
  }
  const kneelK = (i) => keyed([[10.0 + i * 0.06, 0], [10.4 + i * 0.05, 1]]);
  const recoil = (t, i) => { const d = t - (CUES.volley + [0, 0.13, 0.31][i]); const d2 = t - (CUES.volley + [0.95, 0.8, 1.15][i]); const k = (x) => (x > 0 ? Math.exp(-x * 9) : 0); return k(d) + k(d2); };
  const lampDropT = CUES.lampDrop;
  function guardVault(i, t, q, out) {
    const g = guards[i], K = KNEEL[i];
    if (q < 10.0 + i * 0.06) {
      if (i === 2) return null;
      // s03: at the grille, lamp raised; they give ground one step, then another
      const s = clamp((q - (5.75 + i * 0.22)) / 0.3, 0, 2), a = stepper(s, i), b = stepper(s, 1 - i), D = 0.55;
      const xL = K[0] - D * (1 - a.p / 2), xR = K[0] - D * (1 - Math.min(2, b.p) / 2), xB = (xL + xR) / 2;
      const pos = [xB, FY, K[2]], fear = smooth(invLerp(5.5, 6.4, q)), drop = q > lampDropT;
      const o = { crouch: 0.05 + 0.07 * fear, fL: [0, -(xL - xB), a.lift * 0.08, 0], fR: [0, -(xR - xB), b.lift * 0.08, 0], spine: [-0.1 * fear, 0, 0], head: [-0.12 - 0.1 * fear, i ? 0.15 : -0.1, 0], face: gface(), stance: 1.1 };
      if (i === 0) {
        const hl = loc(pos, FACE_W, 0.34, 1.52 - 0.12 * fear + (drop ? 0.12 * Math.exp(-(q - lampDropT) * 5) : 0) + 0.006 * n1(q * 15, 1) * fear, 0.42 - 0.1 * fear);
        if (!drop) out.lamp = { pos: add3(hl, [0, -0.1, 0]), rot: [0.1 * n1(q * 3, 1), 0, 0.12 * n1(q * 2.6, 2)], k: 1 + 0.08 * n1(q * 9, 3) };
        const gp = gunPose(pos, FACE_W, 'port', o.crouch); out.guns[0] = { pos: loc(pos, FACE_W, -0.36, 0.72, 0.05), dir: rotY(FACE_W, [0.12, -0.2, 1]), up: [0, 1, 0] };
        o.arms = { L: { target: hl, palm: rotY(FACE_W, [0, 0, 1]), fingerDir: [0, drop ? 0.6 : -0.2, 0], curl: drop ? 0.05 : 0.9, spread: drop ? 0.4 : 0.05, pole: loc(pos, FACE_W, 1, 0.8, -0.3) }, R: { target: loc(pos, FACE_W, -0.38, 0.8, 0.3), palm: rotY(FACE_W, [1, 0, 0]), fingerDir: rotY(FACE_W, [0, -0.3, 1]), curl: 0.9 } };
        void gp;
      } else { const gp = gunPose(pos, FACE_W, 'port', o.crouch); out.guns[i] = gp.gun; o.arms = gp.arms; }
      return stand(g, pos, FACE_W, o);
    }
    if (q < CUES.ray1 + i * 0.05) {
      // s05: kneeling in front of the door, firing
      const k = kneelK(i)(q), rc = recoil(q, i), cr = 0.4 * k;
      const gp = gunPose(K, FACE_W, k > 0.6 ? 'aim' : 'port', cr + 0.03, rc, 0.13 + 0.02 * i);
      out.guns[i] = gp.gun;
      const lookUp = smooth(invLerp(11.6, 12.3, q));
      return stand(g, K, FACE_W, { crouch: cr, hz: -0.03 * rc, fL: [0, 0.3 * k, 0, 0], fR: [0, -0.36 * k, 0.07 * k, 1.1 * k], spine: [0.12 * k - 0.08 * rc, -0.25 * k, 0], waist: [0.05, -0.15 * k, 0], head: [-0.05 - 0.2 * lookUp, 0.3 * k, -0.2 * k * (1 - lookUp)], arms: gp.arms, face: gface({ lid: 0.3 * (1 - lookUp) }), stance: 1.15 });
    }
    // s06: they throw themselves aside from the ray
    const sgn = [1, -1, -1][i], t0 = CUES.ray1 + i * 0.05, u = clamp((q - t0) / 0.5), e = 1 - (1 - u) ** 2;
    const land = [K[0] + [0.5, 0.2, 0.9][i], FY + 0.26, K[2] + sgn * [2.6, 2.4, 3.3][i]];
    const pos = L3(K, land, e); pos[1] = lerp(K[1], land[1], smooth(u)) + 0.55 * Math.sin(PI * u);
    const yawEnd = sgn > 0 ? 0 : PI, rot = [lerp(0, PI / 2, smooth(u)), lerp(FACE_W, sgn > 0 ? yawEnd : -PI, smooth(u)), 0];
    out.guns[i] = null;
    const cover = smooth(invLerp(0.6, 1, u));
    return { pos, rot, hip: [0, g.hipY, 0], waist: [-0.1, 0, 0], spine: [-0.15, 0, 0], neck: [-0.3, 0, 0], head: [-0.5 + 0.3 * cover, 0.4 * sgn, 0],
      legs: { L: { thigh: [-0.1 - 0.5 * (1 - u), 0, 0.15], knee: 0.2 + 0.9 * (1 - u), ankle: [0.9, 0, 0] }, R: { thigh: [0.1 * (1 - u), 0, -0.15], knee: 0.35, ankle: [0.9, 0, 0] } },
      arms: { L: { sh: [-2.7 + 0.5 * cover, 0, 0.35], el: 0.3 + 1.2 * cover, curl: 0.3 }, R: { sh: [-2.8 + 0.5 * cover, 0, -0.35], el: 0.3 + 1.2 * cover, curl: 0.3 } }, face: gface({ lid: 0.8 * cover }) };
  }
  function lampFall(t) {
    // dropped at CUES.lampDrop: falls, bounces twice, rolls away on its side, the flame guttering
    const K = KNEEL[0], p0 = add3(loc([K[0], FY, K[2]], FACE_W, 0.34, 1.3, 0.34), [0, 0, 0]), d = t - lampDropT, r = 0.078, fl = FY + r;
    const tf = Math.sqrt(2 * (p0[1] - 0.2 - fl) / 9.8);
    let y, roll = 0, tip;
    if (d < tf) { y = p0[1] - 0.2 - 4.9 * d * d + 0.2; tip = (d / tf) * 1.2; }
    else { const b = d - tf, T1 = 0.26; tip = PI / 2; y = fl + (b < T1 ? 0.22 * Math.sin(PI * b / T1) : b < T1 + 0.14 ? 0.06 * Math.sin(PI * (b - T1) / 0.14) : 0); roll = 1.6 * (1 - Math.exp(-b * 1.4)) / 1.4; }
    const dir = [-0.82, 0, 0.57], x = p0[0] + dir[0] * (0.3 * Math.min(d, tf) + roll), z = p0[2] + dir[2] * (0.3 * Math.min(d, tf) + roll);
    const q0 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(dir[2], 0, -dir[0]).normalize(), -tip);   // tips over, its long axis across the roll direction
    const q1 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(-dir[2], 0, dir[0]).normalize(), 0);
    const spin = new THREE.Quaternion().setFromAxisAngle(Y, roll / r * 0.25);
    void q1;
    const quat = q0.multiply(spin);
    // origin is the handle top; the body hangs 0.2 below: keep the body centre on the path
    const c = new THREE.Vector3(0, -0.2, 0).applyQuaternion(quat);
    return { pos: [x - c.x, Math.max(y, fl) - c.y, z - c.z], quat, k: d < tf ? 0.9 : 0.45 + 0.25 * n1(t * 14, 6) };
  }
  function guardCourt(i, t, q, out) {
    const c = COURT.center, a = [2.2, 3.6, 5.1][i], go = CUES.burst + 0.12 + i * 0.07;
    const r0 = 10.5 + i * 1.5, d = Math.max(0, q - go), r = r0 + 5.2 * d + 0.0;
    const x = c[0] + Math.sin(a) * r, z = c[2] + Math.cos(a) * r, y = groundY(x, z, c[1]);
    if (q < go) {
      const fl = smooth(invLerp(CUES.burst, go, q));
      const gp = gunPose([x, y, z], a + PI, 'port', 0.05 + 0.2 * fl); out.guns[i] = gp.gun;
      return stand(guards[i], [x, y, z], a + PI, { crouch: 0.05 + 0.2 * fl, spine: [-0.2 * fl, 0, 0], head: [-0.2, 0, 0], arms: gp.arms, face: gface() });
    }
    out.guns[i] = null;
    return run(guards[i], [x, y, z], a, (q - go) * 2 * PI * 2.6 + i * 2, { lean: 0.35, amp: 0.8, face: gface(), arm: 1.0 });
  }
  function guardSiren(t, q, out) {
    const la = (n, fb) => { const f = ctx.land?.anchor; if (!f) return fb; const v = f(n, _v.set(NaN, 0, 0)); return v && Number.isFinite(v.x) && !(v.x === 0 && v.z === 0) ? [v.x, v.y, v.z] : fb; };
    const fb = [COURT.center[0] - 14, COURT.center[1] + 1.25, COURT.center[2] + 26];
    const s = la('siren', fb), pos = la('sirenStand', [s[0], s[1] - 1.15, s[2] - 0.65]);
    const yaw = Math.atan2(s[0] - pos[0], s[2] - pos[2]);
    const a = (q - CUES.alarm) * 7.5, cz = 0.22 * Math.cos(a), cy = 0.22 * Math.sin(a);
    const h = add3(s, rotY(yaw, [0, cy, cz - 0.05]));
    return stand(guards[0], pos, yaw, { crouch: 0.12 - 0.1 * Math.sin(a), hz: 0.05 * Math.cos(a), spine: [0.3 - 0.15 * Math.sin(a), 0.25, 0], head: [-0.3, 0, 0], stance: 1.5,
      arms: { R: { target: h, palm: [0, -1, 0], fingerDir: rotY(yaw, [0, 0, 1]), curl: 0.95 }, L: { sh: [-0.3, 0, 0.5], el: 0.9, curl: 0.6 } }, face: gface({ mouth: 0.5, teeth: 0.5 }) });
  }
  function guardBurning(i, t, q) {
    const x = 128 - 6.4 * (q - 42.4) - i * 9.5, z = 30 + [0, 3.2, -2.6][i], y = groundY(x, z, DAM.y);
    return run(guards[i], [x, y, z], -PI / 2 + 0.1 * (i - 1), q * 2 * PI * 2.7 + i * 1.7, { lean: 0.42, amp: 0.85, arm: 1.1, face: gface(),
      arms: i === 1 ? { L: { sh: [-2.4, 0, 0.5], el: 1.5, curl: 0.4 }, R: { sh: [-2.3, 0, -0.5], el: 1.5, curl: 0.4 } } : undefined });
  }

  // ---------------------------------------------------------------- the film
  function poseFor(st) {
    const t = st.t, q = onTwos(t);
    const out = { guards: [null, null, null], guns: [null, null, null], lamp: null, tam: null, bo: null, nari: null };
    // guards
    if (t >= 5.4 && t < 17.4) { for (let i = 0; i < 3; i++) out.guards[i] = guardVault(i, t, q, out); if (t >= lampDropT) out.lamp = lampFall(t); else if (!out.lamp && t < 10) out.lamp = null; }
    else if (t >= 17.4 && t < 20.9) { for (let i = 0; i < 3; i++) out.guards[i] = guardCourt(i, t, q, out); if (t >= CUES.alarm) { out.guards[0] = guardSiren(t, q, out); out.guns[0] = null; } }
    else if (t >= 42.4 && t < 44.9) for (let i = 0; i < 3; i++) out.guards[i] = guardBurning(i, t, q);
    // skiff crew
    const crewOn = (t >= 51.4 && t < 54.4) || (t >= 61.9 && t < 75.4);
    let sk = null;
    if (crewOn || (t >= 61.9 && t < 75.4)) { sk = skiffFrame(t); out.tam = tamPose(t, q, sk); out.bo = boPose(t, q, sk); }
    // Nari
    out.nari = () => {
      if (t < 20.9) return nariWindow(t, Math.min(q, 3.4));
      if (t < 23.4) return nariStair(t, q);
      if (t < 28.9) return nariBack(t, q);
      if (t < CUES.shell1Hit) return nariStand(t, q);
      if (t < CUES.shell1Hit + 0.6) return nariThrown(t, q);
      if (t < CUES.lift - 0.1) return { ...lieBody({}), pos: LIE, quat: qLie, ears: ears(q) };
      if (t < CUES.wake - 0.4) return nariCarried(t, q);
      if (t < 61.9) return nariWake(t, q);
      if (t < 64.4) return nariUp(t, q);
      if (t < CUES.push - 0.05) return nariRun(t, q);
      if (t < 69.6) return nariLift(t, q, sk);
      if (t < 75.4) return nariAboard(t, q, sk);
      return null;
    };
    return out;
  }

  // ?folktest=1: a line-up high above the map for turnarounds; folktest=2: expressions
  function lineup(st, mode) {
    const q = onTwos(st.t), y = 300, out = { guards: [], guns: [], lamp: null };
    const fz = mode === '2' ? fearFace(q) : face({ detail: 1, lid: 0.05 });
    out.nari = stand(nari, [0, y, 0], 0, { ears: [0, 0.1], face: fz, arms: { L: { sh: [0.05, 0, 0.3], el: 0.3 }, R: { sh: [-0.6, 0, -0.2], el: 1.2, curl: 0.1, spread: 0.3 } } });
    out.tam = stand(tam, [1.0, y, 0], 0, { ears: [0, 0], earTip: 0.2, face: face({ detail: 0.6, smile: 0.5 }), arms: { L: { sh: [0.05, 0, 0.25], el: 0.3 }, R: { sh: [0.05, 0, -0.25], el: 0.3 } } });
    out.bo = stand(bo, [2.1, y, 0], 0, { face: face({}), arms: { L: { sh: [0.05, 0, 0.2], el: 0.3 }, R: { sh: [0.05, 0, -0.2], el: 0.3 } } });
    for (let i = 0; i < 3; i++) { const p = [3.5 + i * 1.3, y, 0], gp = gunPose(p, 0, i === 1 ? 'aim' : 'port', 0); out.guards[i] = stand(guards[i], p, 0, { arms: gp.arms, face: gface() }); out.guns[i] = gp.gun; }
    out.lamp = { pos: [-0.8, y + 0.4, 0], k: 1 };
    return out;
  }
  return { poseFor, lineup };
}
