// MECH dept: the Lantern's acting. Every pose is a plain object of numbers and vectors in WORLD space; poses are
// blended key to key and solved by the rig in mech.js (IK feet and hands, FK spine, aimed head). Pure function of time.
import { CUES } from './shots.js';
import { ROOF, CATCH, SHELLS, GUN, SHIP, TOWER, sweepPoint, shipPos } from './layout.js';
import { smooth, clamp, lerp, easeIn, easeOut } from './util.js';
import { SK } from './mech-lantern.js';

const D = Math.PI / 180;
const lin = (x) => clamp(x);
export const loc = (o, yaw, v) => { const c = Math.cos(yaw * D), s = Math.sin(yaw * D); return [o[0] + v[0] * c + v[2] * s, o[1] + v[1], o[2] - v[0] * s + v[2] * c]; };
export const dir = (yaw, v) => loc([0, 0, 0], yaw, v);
const POS = new Set(['hR', 'hL', 'fL', 'fR', 'aim']);

// A standing pose at ground point g facing yaw (deg, 0 = +Z, 90 = +X). o overrides; keys ending in _ are local
// (hands and aim relative to the pelvis, feet relative to g, vectors rotated by yaw).
export function stand(g, yaw, o = {}) {
  const h = o.h ?? SK.standH;
  const pel = o.pel ?? loc(g, yaw, [o.sx ?? 0, h, o.sz ?? 0]);
  const p = {
    pel, yaw, pitch: 0, roll: 0, waist: [0, 0, 0], chest: [0, 0, 0], head: [0, 0, 0], aim: loc(pel, yaw, [0, 3, 10]), aimK: 0,
    fL: loc(g, yaw, [0.8, 0, 0.05]), fR: loc(g, yaw, [-0.8, 0, 0.05]), fuL: [0, 1, 0], fuR: [0, 1, 0],
    ffL: dir(yaw, [0.35, 0, 1]), ffR: dir(yaw, [-0.35, 0, 1]), kpL: dir(yaw, [1, 0, 0.8]), kpR: dir(yaw, [-1, 0, 0.8]),
    hR: loc(pel, yaw, [-1.62, -0.78, 0.25]), hnR: dir(yaw, [1, 0, 0.1]), hfR: dir(yaw, [0, -1, 0.12]), epR: dir(yaw, [-0.7, 0, -1]),
    hL: loc(pel, yaw, [1.62, -0.78, 0.25]), hnL: dir(yaw, [-1, 0, 0.1]), hfL: dir(yaw, [0, -1, 0.12]), epL: dir(yaw, [0.7, 0, -1]),
    curl: 0.28, fanA: 0, fanB: 0, fly: 0, chestK: 0, irisS: 1,
  };
  for (const k in o) {
    if (k === 'h' || k === 'sx' || k === 'sz') continue;
    if (k.endsWith('_')) { const b = k.slice(0, -1); p[b] = POS.has(b) ? loc(b === 'fL' || b === 'fR' ? g : pel, yaw, o[k]) : dir(yaw, o[k]); }
    else p[k] = o[k];
  }
  return p;
}
export function mix(a, b, u) {
  const o = {};
  for (const k in a) { const x = a[k], y = b[k] ?? x; o[k] = Array.isArray(x) ? x.map((v, i) => lerp(v, y[i], u)) : lerp(x, y, u); }
  return o;
}
function keyed(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) return mix(keys[i - 1][1], keys[i][1], (keys[i][2] || smooth)((t - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0])));
  return keys[keys.length - 1][1];
}

// ------------------------------------------------------------------ the vault (s01c - s06). It lies prone, head to +X.
const VF = 62;
const PIN = [-116.2, VF + 0.05, -0.9];            // the left hand, pinned under old chain: it stays here for good
const HR0 = [-116.6, VF + 0.05, 4.9];             // the right hand on the flags (s02)
const prone = (o = {}) => stand([-119, VF, 2], 90, {
  pel: [-119, VF + 1.32, 2], pitch: 87, waist: [3, 0, 0], chest: [4, 0, 0], head: [6, -112, 0],
  fL: [-120.75, VF + 0.66, 1.35], fR: [-120.75, VF + 0.66, 2.65], fuL: [0, -1, 0], fuR: [0, -1, 0], ffL: [-1, 0, -0.15], ffR: [-1, 0, 0.15],
  kpL: [0, 0.1, -1], kpR: [0, 0.1, 1],
  hR: HR0, hnR: [0, -1, 0], hfR: [0.45, 0, 0.9], epR: [0.2, 1, 0.6],
  hL: PIN, hnL: [0, -1, 0], hfL: [0.75, 0, -0.65], epL: [0.2, 1, -0.6], curl: 0.05, ...o,
});
const G4 = [-119.5, VF, 2.6];
const VAULT_KEYS = [
  [0, prone()],
  [CUES.twitch, prone()],
  [CUES.twitch + 0.5, prone({ curl: 0.2 })],
  [CUES.twitch + 0.95, prone({ curl: 0.9, hR: [-116.62, VF + 0.56, 4.82] })],
  [CUES.standUp, prone({ curl: 0.85, hR: [-116.62, VF + 0.56, 4.82], head: [4, -100, 0] })],
  [8.0, prone({ curl: 0.15, hR: [-117.2, VF + 0.06, 4.3], hfR: [0.9, 0, 0.4], pel: [-119, VF + 1.3, 2], head: [0, -70, 0] })],                       // anticipation: it gathers
  [8.65, prone({ curl: 0.1, hR: [-117.2, VF + 0.06, 4.3], hfR: [0.9, 0, 0.4], pel: [-119.1, VF + 1.2, 2], pitch: 56, chest: [-8, 0, 0], head: [-14, -25, 0], epR: [-0.3, 0.6, 1] })],
  [9.15, prone({ curl: 0.1, hR: [-117.3, VF + 0.06, 4.2], hfR: [0.9, 0, 0.4], pel: [-119.45, VF + 1.3, 2], pitch: 30, chest: [-4, 0, 0], head: [0, -6, 0],
    fL: [-120.6, VF + 0.2, 1.3], fR: [-120.6, VF + 0.2, 2.7], fuL: [0.8, 0.6, 0], fuR: [0.8, 0.6, 0], ffL: [0.6, -0.8, 0], ffR: [0.6, -0.8, 0], kpL: [0.7, -0.6, -0.5], kpR: [0.7, -0.6, 0.5] })],
  [CUES.armDrop, stand(G4, 90, { h: 1.6, pitch: 16, head: [4, 0, 0], hL: PIN, hnL: [0, -1, 0], hfL: [0.75, 0, -0.65], epL: [0.2, 1, -0.6], hR_: [-1.5, -1.0, 0.7], curl: 0.3 })],
  [9.85, stand(G4, 90, { h: 2.1, pitch: -5, chest: [-4, 0, 0], head: [-3, 0, 0] })],
  [10.25, stand(G4, 90, { h: 2.0 })],
  [10.39, stand(G4, 90, {})],
];
// s05 - s06: it has walked to the middle; iris about [-104, 67.3, 0], facing the door
const G5 = [-104.55, VF, 0];
const DOORC = [-88, 64.6, 0];
const VAULT2_KEYS = [
  [10.4, stand(G5, 90, { aim: DOORC, head: [0, -28, 4] })],
  [11.3, stand(G5, 90, { aim: DOORC, head: [0, -28, 4] })],
  [11.75, stand(G5, 90, { aim: DOORC, aimK: 1, chest: [0, 0, 0] })],
  [12.4, stand(G5, 90, { aim: DOORC, aimK: 1, chest: [3, 0, 0] })],
  [12.88, stand(G5, 90, { aim: [-88, 67.3, -2.6], aimK: 1, chest: [5, 0, 0], irisS: 0.3, sz: 0.1 })],
  [13.5, stand(G5, 90, { aim: [-88, 62.9, 2.6], aimK: 1, chest: [5, 0, 0], irisS: 0.3, sz: 0.1 }), lin],
  [14.0, stand(G5, 90, { aim: [-88, 62.9, 2.6], aimK: 1, chest: [5, 0, 0], irisS: 0.3, sz: 0.1 })],
  [14.3, stand(G5, 90, { aim: DOORC, aimK: 1, chest: [-3, 0, 0], irisS: 1 })],
  [14.89, stand(G5, 90, { aim: DOORC, aimK: 1 })],
];
// ------------------------------------------------------------------ s07: under the shaft, fans, crouch, leap
const GW = [-110, VF, 0];
const airborne = (pel, yaw, o = {}) => stand([pel[0], pel[1] - SK.standH, pel[2]], yaw, { pel, fly: 1, fL_: [0.6, 0.35, -0.25], fR_: [-0.6, 0.2, -0.1], fuL_: [0, 0.75, 0.66], fuR_: [0, 0.8, 0.6], ffL_: [0.2, -0.66, 0.75], ffR_: [-0.2, -0.6, 0.8], ...o });
const upArm = { hR_: [-1.0, 4.5, 0.5], hnR_: [0.4, 0, 0.9], hfR_: [0, 1, 0.1], epR_: [-1, 0, 0.3] };
const SHAFT_KEYS = [
  [14.9, stand(GW, -90, { pel: [-108.6, VF + 1.98, 0.1], fR: [-108.0, VF + 0.25, 0.8], fuR_: [0, 0.9, -0.43], fL_: [0.8, 0, 0.25], head: [4, 0, 0] })],
  [15.3, stand(GW, -90, { head: [-52, 0, 0], chest: [-12, 0, 0] })],
  [CUES.fansOpen, stand(GW, -90, { head: [-58, 0, 0], chest: [-14, 0, 0] })],
  [15.66, stand(GW, -90, { head: [-58, 0, 0], chest: [-14, 0, 0], fanA: 1.14, fanB: 1.14, hR_: [-2.0, -0.2, 0.3] })],
  [15.8, stand(GW, -90, { h: 1.72, head: [-62, 0, 0], chest: [-6, 0, 0], fanA: 1, fanB: 1, hR_: [-1.9, -0.6, -0.5] })],
  [CUES.leap, stand(GW, -90, { h: 1.25, pitch: 18, head: [-74, 0, 0], chest: [4, 0, 0], fanA: 1, fanB: 0.8, hR_: [-1.6, -0.5, -1.1] })],
  [16.12, airborne([-110, VF + 4.6, 0], -90, { head: [-50, 0, 0], fanA: 1, fanB: 1.1, ...upArm, fL_: [0.7, -0.1, 0], fR_: [-0.7, -0.1, 0], fuL_: [0, 1, 0.2], fuR_: [0, 1, 0.2] }), easeIn],
  [16.4, airborne([-110, 82, 0], -90, { head: [-50, 0, 0], fanA: 1, fanB: 1, ...upArm }), lin],
  [16.9, airborne([-110, 121, 0], -90, { head: [-50, 0, 0], fanA: 1, fanB: 1, ...upArm }), lin],
  [17.39, airborne([-110, 165, 0], -90, { head: [-50, 0, 0], fanA: 1, fanB: 1, ...upArm }), lin],
];
// ------------------------------------------------------------------ s08 - s09: out of the well, land on knee and hand
const GL = [-103.4, 120, 7.6], YL = 68;
const landed = (o = {}) => stand(GL, YL, { h: 1.53, pitch: 24, fL_: [0.8, 0, 0.75], fR_: [-0.62, 0.62, -1.0], fuR_: [0, -1, 0], ffR_: [0, 0, -1], kpR_: [-0.2, -0.75, 0.75],
  hR_: [-1.15, -1.48, 1.55], hnR: [0, -1, 0], hfR_: [0.1, 0, 1], epR_: [-1, 0.5, -0.3], curl: 0.03, head: [-8, 0, 0], ...o });
const BURST_KEYS = [
  [17.4, airborne([-110, 99, 0], YL, { fanA: 1, fanB: 1, ...upArm })],
  [CUES.burst, airborne([-110, 121.5, 0], YL, { fanA: 1, fanB: 1, ...upArm }), lin],
  [18.28, airborne([-106.6, 131.2, 3.9], YL, { fanA: 1, fanB: 1.1, pitch: 14, hR_: [-2.3, 0.9, 0.3], hnR_: [0, -1, 0.2], hfR_: [-1, 0, 0], fL_: [0.75, 0.5, 0.3], fR_: [-0.75, 0.2, -0.3] }), easeOut],
  [18.7, landed({ h: 1.85, pitch: 10, fanA: 0.8, fanB: 0.9, hR_: [-1.5, -0.6, 1.2] }), easeIn],
  [18.82, landed({ pitch: 36, fanA: 0.3, fanB: 0.5, head: [22, 0, 0], waist: [14, 0, 0], chest: [8, 0, 0] })],
  [19.25, landed({ pitch: 22, aim: [0, 200, -8], aimK: 1 })],
  [20.89, landed({ pitch: 20, aim: [0, 205, -8], aimK: 1 })],
];
// ------------------------------------------------------------------ s10 - s11: the climb (one arm, both feet), procedural
const TC = TOWER.center, wallZ = (x) => TC[2] + Math.sqrt(TOWER.r * TOWER.r - (x - TC[0]) ** 2);
const wn = (x) => [x / TOWER.r, 0, Math.sqrt(1 - (x / TOWER.r) ** 2)];
const cling = (py, o = {}) => stand([0.9, py - 2, 2.6], 180, {
  pel: [0.9, py, 2.62], pitch: 9,
  fL: [0.02, py - 1.0, wallZ(0.02) + 0.05], fR: [1.8, py - 1.25, wallZ(1.8) + 0.05], fuL: wn(0.02), fuR: wn(1.8), ffL: [-0.3, 1, 0], ffR: [0.3, 1, 0], kpL: [-1, 0.2, 0.7], kpR: [1, 0.2, 0.7],
  hR: [1.9, py + 2.6, wallZ(1.9) + 0.3], hnR: [0, 0, -1], hfR: [-0.15, 1, 0], epR: [0.5, -0.3, 1.4], curl: 0.2, head: [-28, 0, 0], ...o,
});
function climbPose(t) {
  const H = 1.3, per = 0.75;
  const base = t < 23.4 ? 161 + (t - 20.9) * 0.9 : 181 + (t - 23.4) * (H / per);
  const c = t / per, f = c - Math.floor(c);
  const stepUp = (cc) => { const n = Math.floor(cc), ff = cc - n; return H * (n + smooth(clamp((ff - 0.05) / 0.3))) - H * Math.floor(c); };
  const lift = (cc) => { const ff = cc - Math.floor(cc); return Math.sin(Math.PI * clamp((ff - 0.05) / 0.3)); };
  const slow = t < 23.4 ? 0.55 : 1;
  const py = base + H * (f + 0.1 * Math.sin(2 * Math.PI * f)) * slow;
  const yL = base - 0.95 + stepUp(c) * slow, yR = base - 1.5 + stepUp(c + 0.5) * slow;
  const hc = c - 0.5, hf = hc - Math.floor(hc), hs = smooth(clamp(hf / 0.3));
  const yH = base + 1.9 + (H * (Math.floor(hc) - Math.floor(c) + 1 + hs)) * slow, off = Math.sin(Math.PI * clamp(hf / 0.3));
  const sw = Math.sin(2 * Math.PI * f);
  return cling(py, {
    roll: 4 * sw, yaw: 180 + 5 * sw, chest: [0, -8 * sw, 0], head: [-30 + 6 * sw, 10 * sw, 0],
    fL: [0.02, yL, wallZ(0.02) + 0.05 + 0.45 * lift(c)], fR: [1.8, yR, wallZ(1.8) + 0.05 + 0.45 * lift(c + 0.5)],
    hR: [1.9, yH, wallZ(1.9) + 0.3 + 0.6 * off], curl: 0.2 - 0.15 * off,
  });
}
// ------------------------------------------------------------------ s12 - s15: over the parapet, kneel, hand on chest, shell 1
const PT = TOWER.roofY + TOWER.parapet;             // parapet top
const GIRL = [ROOF.girlStand[0], ROOF.girlStand[1] + 1.05, ROOF.girlStand[2]];
const GK = ROOF.lanternKneel;
const onPar = { hR: [1.9, PT + 0.13, 0.36], hnR: [0, -1, 0], hfR: [0, 0, -1], epR: [0.2, 2.2, 1.0] };
const kneel = (g, yaw, o = {}) => stand(g, yaw, { h: 1.53, pitch: 6, fL_: [0.78, 0, 0.75], fR_: [-0.62, 0.62, -1.0], fuR_: [0, -1, 0], ffR_: [0, 0, -1], kpR_: [-0.2, -0.75, 0.75], ...o });
const bow = { waist: [26, 0, 0], chest: [28, 0, 0], head: [14, 0, 0], aim: GIRL, aimK: 0.75 };
// perched on the corbelled crown under the parapet: feet on the corbel face (r 10.15), body leaning in over it
const CR = 10.15, corbZ = (x) => TC[2] + Math.sqrt(CR * CR - x * x), cn = (x) => [x / CR, 0, Math.sqrt(1 - (x / CR) ** 2)];
const perch = (py, pz, pitch, o = {}) => stand([0.9, py - 2, pz], 180, {
  pel: [0.9, py, pz], pitch,
  fL: [0.0, Math.min(py - 0.5, 211.9), corbZ(0.0) + 0.04], fR: [1.8, Math.min(py - 0.75, 211.75), corbZ(1.8) + 0.04], fuL: cn(0), fuR: cn(1.8), ffL: [-0.3, 1, 0], ffR: [0.3, 1, 0], kpL: [-1, 0.3, 0.6], kpR: [1, 0.3, 0.6],
  ...onPar, curl: 0.5, head: [10, 0, 55], ...o,
});
const ROOF_KEYS = [
  [26.4, perch(211.7, 3.8, 30, { hR: [2.0, 214.2, 2.7], hnR: [0, -0.3, -1], hfR: [0, 1, -0.3], curl: 0.1 })],
  [26.78, perch(212.0, 3.75, 35, { hR: [1.9, PT + 0.75, 1.5], hnR: [0, -0.8, -0.6], hfR: [0, 0.6, -0.8], curl: 0.0 })],
  [26.93, perch(212.05, 3.75, 35, { hR: [1.9, PT + 0.6, 0.4], curl: 0.0 })],
  [CUES.gripParapet, perch(212.05, 3.75, 35, { curl: 0.0 })],
  [CUES.gripParapet + 0.14, perch(211.95, 3.75, 36, { curl: 0.5 })],
  [27.45, perch(211.85, 3.8, 36, { head: [12, 0, 58] })],
  [CUES.headRise, perch(212.5, 3.55, 28, { head: [10, 0, 40] })],
  [28.45, perch(213.75, 3.1, 16, { head: [0, 0, 0], aim: GIRL, aimK: 1 })],
  [28.9, perch(213.7, 3.1, 16, { head: [0, 0, 0], aim: GIRL, aimK: 1 })],
  // the step over: right leg first, then the left, then down on one knee
  [29.08, perch(214.4, 2.9, 10, { aim: GIRL, aimK: 1, fR: [1.9, 215.0, 2.7], fuR: [0, 1, 0], ffR: [0.2, 0, -1], kpR: [1, 0.6, 0.3], fL: [0.0, 212.3, corbZ(0) + 0.3] })],
  [29.25, perch(215.6, 2.3, 4, { aim: GIRL, aimK: 1, fR: [1.5, PT + 0.75, 0.6], fuR: [0, 1, 0], ffR: [0.2, 0, -1], kpR: [1, 0.6, -0.6], fL: [-0.3, 213.9, 2.7], fuL: [0, 0.5, 0.86], ffL: [0, 0.86, -0.5] })],
  [29.55, stand(GK, 180, { pel: [0.6, 216.1, 0.5], pitch: 12, ...onPar, curl: 0.5, aim: GIRL, aimK: 1, fR: [1.35, 214, -1.0], fL: [-0.5, 215.2, 2.0], fuL: [0, 0.5, 0.86], ffL: [0, 0.86, -0.5], kpL: [-1, 0.6, 0.2] })],
  [29.8, stand(GK, 180, { pel: [0.3, 216.05, -0.5], pitch: 10, ...onPar, curl: 0.3, aim: GIRL, aimK: 1, fR: [1.2, 214, -1.1], fL: [-0.7, PT + 0.85, 0.5], kpL: [-1, 0.6, -0.4] })],
  [30.05, stand(GK, 180, { pel: [0, 215.8, -1.6], pitch: 8, aim: GIRL, aimK: 1, fR: [1.0, 214, -0.95], fL: [-0.78, 214, -2.5], hR: [1.7, 216.2, -0.9] })],
  [30.25, kneel(GK, 180, { pitch: 16, ...bow, hR_: [-1.5, -0.3, 0.8] })],
  [30.45, kneel(GK, 180, { pitch: 8, ...bow, hR_: [-1.5, -0.4, 0.8] })],
  [CUES.handChest, kneel(GK, 180, { ...bow, chestK: 1, curl: 0 })],
  [32.2, kneel(GK, 180, { ...bow, chestK: 1, curl: 0, head: [14, 0, 7] })],
  [34.9, kneel(GK, 180, { ...bow, chestK: 1, curl: 0, head: [14, 0, 7] })],
  [35.3, kneel(GK, 180, { waist: [8, 0, 0], chest: [6, -30, 0], aim: GUN.pos, aimK: 0.9, chestK: 0.6, curl: 0.1 })],      // it hears the gun
  [CUES.shell1Hit, kneel(GK, 180, { waist: [8, 0, 0], chest: [6, -38, 0], aim: GUN.pos, aimK: 1, chestK: 0.3 })],
  [35.5, airborne([1.0, 215.9, -1.9], 180, { fly: 0, pitch: 30, roll: -25, chest: [30, 0, 0], head: [30, 0, 20], hR_: [-2.4, 1.2, 0.6], curl: 0 })],
  [35.75, airborne([3.6, 217.6, -0.6], 150, { pitch: -30, roll: -70, hR_: [-2.4, 1.6, -0.6], curl: 0 }), lin],
  [36.0, airborne([7.4, 217.4, 2.6], 120, { pitch: -80, roll: -110, hR_: [-2.2, 2.0, -0.6], curl: 0 }), lin],
  [36.39, airborne([11, 203, 5], 100, { pitch: -150, roll: -150, hR_: [-2.2, 2.0, -0.6], curl: 0 }), easeIn],
];
// ------------------------------------------------------------------ s16 - s18: broken on the keep roof, the sweep
const KF = ROOF.keepFall, KY = 50, KR = KF[1];
const down = (o = {}) => stand(KF, KY, {
  pel: [KF[0], KR + 1.28, KF[2]], pitch: 84, roll: 12, waist: [2, 0, 10], chest: [6, 8, 0], head: [8, -105, 0],
  fL_: [0.95, 0.62, -1.7], fR_: [-0.5, 0.62, -1.78], fuL: [0, -1, 0], fuR: [0, -1, 0], ffL_: [0.3, 0, -1], ffR_: [-0.2, 0, -1], kpL_: [1, 0.15, 0], kpR_: [-1, 0.15, 0],
  hR: loc(KF, KY, [-2.3, 0.06, 2.9]), hnR: [0, -1, 0], hfR_: [-0.4, 0, 0.9], epR_: [-0.6, 1, 0.2], curl: 0.05, ...o,
});
const HP = loc(KF, KY, [-1.7, 0.14, 2.3]);
const propped = (o = {}) => down({ pel: [KF[0], KR + 1.12, KF[2]], pitch: 52, roll: 0, waist: [0, 0, 0], chest: [-10, 0, 0], head: [-20, 0, 0], hR: HP, hfR_: [0, 0, 1], epR_: [-0.5, 1.6, -0.2], curl: 0.05, aimK: 1, ...o });
const KEEP_KEYS = [
  [36.4, down()],
  [CUES.irisBack + 0.1, down()],
  [38.3, down({ hR: HP, hfR_: [0, 0, 1], curl: 0.08, epR_: [-0.5, 1.6, -0.2], head: [0, -80, 0] })],
  [38.95, propped({ aimK: 0.5 })],
  [CUES.sweep - 0.08, propped({ irisS: 0.3 })],
  [CUES.erupt, propped({ irisS: 0.3 })],
  [41.6, propped({ irisS: 0.8, pitch: 48 })],
  [44.89, propped({ irisS: 1, pitch: 46 })],
];
// ------------------------------------------------------------------ s19 on: the roof. Carry, stand, duel, lift, fall.
const DA = ROOF.dais, LS = ROOF.lanternStand;
const LIEP = [ROOF.girlStand[0] + 1.25, 214.012, ROOF.girlStand[2] + 0.72];        // under her hips where she lies
const DAISP = [DA[0], DA[1] + 0.03, DA[2] + 0.1];
const G1 = [2.7, 214, -1.85], Y1 = -152, G2 = [3.72, 214, -6.6], Y2 = -90;
const flat = (f) => ({ hnR: [0, 1, 0], hfR: f, curl: 0.02 });
const SHIPA = SHIP.hold, YS = 19;
const spread = (o = {}) => stand(LS, YS, { fL_: [1.15, 0, 0.1], fR_: [-1.15, 0, -0.15], h: 1.9, chest: [-6, 0, 0], hR_: [-2.5, 0.9, 0.5], hnR_: [0, 0, 1], hfR_: [-0.9, 0.45, 0], epR_: [-1, -0.6, -0.4], curl: 0, fanB: 1, aim: SHIPA, aimK: 1, ...o });
const GP = [1.5, 214, -1.95];
const PUSH0 = [ROOF.edge[0], 214.012, ROOF.edge[2] - 0.32], PUSH1 = [CATCH.pos[0], CATCH.pos[1] - 1.3, CATCH.pos[2]];
const pushUp = (o = {}) => stand(GP, 0, { pel: [1.5, 215.9, -0.78], pitch: 38, hR: PUSH1, hnR: [0, 1, 0], hfR: [-0.25, 0.25, 0.94], epR: [-1, -0.6, -0.2], curl: 0.02, aim: CATCH.pos, aimK: 1, fanB: 0.5, ...o });
const END_KEYS = [
  [44.9, stand(G1, Y1, { h: 1.3, pitch: 46, hR: [LIEP[0] + 0.9, 214.5, LIEP[2] + 0.5], ...flat([-0.7, 0, -0.7]), aim: LIEP, aimK: 1, epR_: [-1, 0.4, -0.2] })],
  [45.45, stand(G1, Y1, { h: 0.98, pitch: 58, hR: [LIEP[0] + 0.35, 214.012, LIEP[2] + 0.2], ...flat([-0.7, 0, -0.7]), aim: LIEP, aimK: 1, epR_: [-1, 0.4, -0.2] })],
  [CUES.lift, stand(G1, Y1, { h: 0.98, pitch: 58, hR: LIEP, ...flat([-0.7, 0, -0.7]), aim: LIEP, aimK: 1, epR_: [-1, 0.4, -0.2] })],
  [46.35, stand(G1, Y1, { h: 1.7, pitch: 24, hR: [1.7, 216.3, -4.3], ...flat([-0.7, 0, -0.7]), aim: [1.7, 216.4, -4.3], aimK: 1, epR_: [-1, -0.4, -0.2] })],
  [47.1, stand(G2, Y2, { h: 1.6, pitch: 30, hR: [0.4, 216.1, -7.7], ...flat([-1, 0, 0]), aim: [0.4, 216.2, -7.7], aimK: 1, epR_: [-1, -0.2, -0.3] })],
  [CUES.setDown, stand(G2, Y2, { h: 1.3, pitch: 52, hR: DAISP, ...flat([-1, 0, 0]), aim: DAISP, aimK: 1, epR_: [-1, 0.5, -0.3] })],
  [47.9, stand(G2, Y2, { h: 1.3, pitch: 52, hR: DAISP, ...flat([-1, 0, 0]), aim: DAISP, aimK: 1, epR_: [-1, 0.5, -0.3] })],
  [48.39, stand(G2, Y2, { h: 1.5, pitch: 40, hR: [1.9, DA[1] + 0.25, DA[2] + 0.1], ...flat([-1, 0, 0]), aim: DAISP, aimK: 1, epR_: [-1, 0.5, -0.3] })],
  [50.0, stand(G2, Y2, { h: 1.9, pitch: 8, aim: DAISP, aimK: 1 })],
  [51.5, stand(G2, Y2, { aim: SHIPA, aimK: 1 })],
  [53.6, stand(LS, YS, { aim: SHIPA, aimK: 1 })],
  [54.4, stand(LS, YS, { aim: SHIPA, aimK: 1 })],
  [54.85, spread()],
  [56.9, spread()],
  [CUES.ray2 - 0.05, spread({ irisS: 0.3, chest: [4, 0, 0], hR_: [-2.2, 0.2, 0.2] })],
  [CUES.hullBurn + 0.3, spread({ irisS: 0.3, chest: [4, 0, 0], hR_: [-2.2, 0.2, 0.2] })],
  [59.3, spread({ irisS: 1, hR_: [-2.2, 0.2, 0.2] })],
  [59.75, kneel(LS, YS, { pitch: 30, waist: [10, 0, 0], hR_: [-1.3, -1.48, 1.3], hnR: [0, -1, 0], hfR_: [0, 0, 1], curl: 0.1, fanB: 0.7, aim: SHIPA, aimK: 1, head: [20, 0, 0] })],
  [60.2, kneel(LS, YS, { pitch: 18, hR_: [-1.3, -1.48, 1.3], hnR: [0, -1, 0], hfR_: [0, 0, 1], curl: 0.1, fanB: 0.7, aim: SHIPA, aimK: 1 })],
  [61.0, kneel(LS, YS, { pitch: 18, hR_: [-1.3, -1.48, 1.3], hnR: [0, -1, 0], hfR_: [0, 0, 1], curl: 0.1, fanB: 0.7, aim: [DA[0], DA[1] + 0.6, DA[2]], aimK: 0.85 })],   // it looks back at her
  [64.4, kneel(LS, YS, { pitch: 18, hR_: [-1.3, -1.48, 1.3], hnR: [0, -1, 0], hfR_: [0, 0, 1], curl: 0.1, fanB: 0.7, aim: [DA[0], DA[1] + 0.6, DA[2]], aimK: 0.85 })],
  [65.3, stand(GP, 0, { pel: [1.5, 215.1, -1.6], pitch: 48, hR: PUSH0, ...flat([-1, 0, 0]), epR: [-0.3, 1, -0.6], aim: PUSH0, aimK: 1, fanB: 0.6 })],
  [CUES.push, stand(GP, 0, { pel: [1.5, 215.1, -1.6], pitch: 48, hR: PUSH0, ...flat([-1, 0, 0]), epR: [-0.3, 1, -0.6], aim: PUSH0, aimK: 1, fanB: 0.6 })],
  [65.85, stand(GP, 0, { pel: [1.5, 215.6, -1.3], pitch: 40, hR: [0, 216.1, -0.1], ...flat([-0.8, 0.1, 0.6]), epR: [-1, 0.2, -0.5], aim: [0, 217, 0], aimK: 1, fanB: 0.6 })],
  [66.55, pushUp()],
  [CUES.lastSalvo, pushUp()],
  [70.6, pushUp({ pel: [1.5, 215.45, -1.1], pitch: 44, roll: -8, chest: [10, 0, 6], hR: [0.2, PUSH1[1] - 0.5, PUSH1[2] - 0.5], fanB: 0.25, curl: 0.25 })],
  [CUES.irisOut, pushUp({ pel: [1.5, 215.3, -1.3], pitch: 40, roll: -12, chest: [14, 0, 8], hR: [0.3, PUSH1[1] - 0.9, PUSH1[2] - 0.9], fanB: 0.1, curl: 0.4, aimK: 0.2, head: [30, 10, 12] })],
  [72.6, pushUp({ pel: [1.5, 215.22, -1.4], pitch: 40, roll: -14, chest: [16, 0, 8], hR: [0.3, PUSH1[1] - 1.1, PUSH1[2] - 1.0], fanB: 0.05, curl: 0.5, aimK: 0, head: [38, 12, 14] })],
];

const SEGS = [
  [0, 10.4, VAULT_KEYS], [10.4, 14.9, VAULT2_KEYS], [14.9, 17.4, SHAFT_KEYS], [17.4, 20.9, BURST_KEYS], [20.9, 26.4, climbPose],
  [26.4, 36.4, ROOF_KEYS], [36.4, 44.9, KEEP_KEYS], [44.9, 1e9, END_KEYS],
];
export function poseAt(t) {
  for (const [a, b, k] of SEGS) if (t < b) return typeof k === 'function' ? k(t) : keyed(k, t);
  return keyed(END_KEYS, t);
}
export const PINNED = PIN;

// shells that hit it after shell 1: a flinch impulse 0..1 per impact
const FL = SHELLS.filter((s) => s.hit === 'lantern' && s.id !== 'shell1');
export function flinch(t) {
  let e = 0;
  for (const s of FL) { const d = t - s.t1; if (d >= 0 && d < 1.2) e += Math.exp(-d * 5.5) * (1 - Math.exp(-d * 50)); }
  return Math.min(e, 1.3);
}
// dynamic aim targets (on ones, so the ray FX and the head agree)
export function dynAim(t, land, v) {
  if (t >= CUES.sweep - 0.25 && t < 44.9) return sweepPoint(t);
  if (t >= CUES.ray2 - 0.3 && t < CUES.hullBurn + 1.0) {
    const u = clamp((t - CUES.ray2) / (CUES.hullBurn - CUES.ray2));
    const a = land?.anchor?.('shipHullA', v.set(NaN, 0, 0));
    if (a && Number.isFinite(a.x)) { const A = [a.x, a.y, a.z]; const b = land.anchor('shipHullB', v); if (b && Number.isFinite(b.x)) return [lerp(A[0], b.x, u), lerp(A[1], b.y, u), lerp(A[2], b.z, u)]; }
    const s = shipPos(t); return [s[0] - 60 + 120 * u, s[1] - 4 + 10 * u, s[2]];
  }
  return null;
}
