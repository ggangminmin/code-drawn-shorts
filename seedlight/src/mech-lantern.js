import * as THREE from 'three';
import { Kit, v3, hull, cbox, superPts, cyl, cylZ, cylX, ring, ringZ, ball, tube, patch, solid, extrude, boxUV, seg } from './mech-geo.js';

// MECH dept: THE LANTERN. A 6 m gardener-automaton: cracked cream porcelain plates over verdigris-copper bones.
// Metres. Root at the pelvis. +Y up, +Z forward, +X its left. Limbs hang along -Y from each joint.
export const SK = {
  waist: 0.4, chest: 0.5, neck: 1.5, head: 0.15, irisY: 0.74, irisZ: 0.56,
  shX: 1.3, shY: 1.1, shZ: -0.05, L1a: 1.35, L2a: 1.3, palm: [0.11, -0.32, 0],
  hipX: 0.55, hipY: -0.15, L1: 1.05, L2: 0.95, ankleH: 0.28, standH: 2.22,
  crest: [0, 0.8, 1.2],
};
export const FAN_A = 7, FAN_B = 8;

const PORC = { col: '#ece2c8', metal: 0.1, detail: 0.5, tone: 0.035, wear: 0.6, pw: 9, ph: 9, riv: 0, seam: 1 };
const PORC2 = { ...PORC, col: '#ddd0b0' };
const PORC3 = { ...PORC, col: '#cfc3a6' };
const COP = { col: '#3c7263', metal: 0.85, detail: 0.6, tone: 0.07, wear: 0.9, pw: 0.7, ph: 0.35, riv: 0, seam: 0 };
const COPD = { ...COP, col: '#27463f', wear: 0.5 };
const COPB = { ...COP, col: '#b06a3a', wear: 0.3, tone: 0.05 };
const LEAF = { ...COP, col: '#4f8c78', detail: 0.25, pw: 3, ph: 3, wear: 1 };
const GLASS = { col: '#cfcdb6', metal: 0, detail: 0.1, emis: 2, tone: 0.02, wear: 0.2, seam: 0, id: 37 };
const IRIS = { col: '#181512', metal: 0, detail: 0, emis: 1, tone: 0, wear: 0, seam: 0, id: 38 };
const CREST = { col: '#b9a064', metal: 0.7, detail: 0.2, emis: 3, tone: 0, wear: 0.2, seam: 0, id: 39 };

function quad(a, b, c, d) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3));
  g.computeVertexNormals();
  return g;
}

export function buildLantern(material) {
  const j = {};
  const root = new THREE.Group(); root.name = 'lantern'; j.root = root;
  const J = (name, parent, pos) => { const g = new THREE.Group(); g.name = name; g.position.set(...pos); parent.add(g); j[name] = g; return g; };
  const k = new Kit(7);
  const pelvis = J('pelvis', root, [0, 0, 0]);
  const waist = J('waist', pelvis, [0, SK.waist, 0]);
  const chest = J('chest', waist, [0, SK.chest, 0]);
  const neck = J('neck', chest, [0, SK.neck, 0.05]);
  const head = J('head', neck, [0, SK.head, 0]);
  J('iris', head, [0, SK.irisY, SK.irisZ]);
  for (const [s, L] of [[1, 'L'], [-1, 'R']]) {
    const hip = J('hip' + L, pelvis, [s * SK.hipX, SK.hipY, 0]);
    const kn = J('kn' + L, hip, [0, -SK.L1, 0]);
    J('an' + L, kn, [0, -SK.L2, 0]);
    armJoints(J, L, chest, [s * SK.shX, SK.shY, SK.shZ], s, '');
  }
  // the torn-off left arm is its own object
  const loose = new THREE.Group(); loose.name = 'looseArm'; j.looseRoot = loose;
  armJoints(J, 'L', loose, [0, 0, 0], 1, 'loose');
  // fans: forearm (right) and two at the shoulder blades
  for (let i = 0; i < FAN_A; i++) J('fanA' + i, j.elR, [-0.37, -0.2, 0]);
  for (const [s, L] of [[1, 'L'], [-1, 'R']]) for (let i = 0; i < FAN_B; i++) J('fanB' + L + i, chest, [s * 0.5, 1.0, -1.02 - i * 0.016]);

  torso(k); headBuild(k);
  for (const [s, L] of [[1, 'L'], [-1, 'R']]) { leg(k, s, L); arm(k, s, L, ''); }
  arm(k, 1, 'L', 'loose');
  fans(k);
  const meshes = k.finish(j, material);
  return { root, loose, j, meshes, tris: k.tris };
}

function armJoints(J, L, parent, pos, s, pre) {
  const sh = J(pre + 'sh' + L, parent, pos);
  const el = J(pre + 'el' + L, sh, [0, -SK.L1a, 0]);
  const wr = J(pre + 'wr' + L, el, [0, -SK.L2a, 0]);
  for (let i = 0; i < 3; i++) {
    const a = J(pre + 'f' + L + i + 'a', wr, [0, -0.6, (i - 1) * 0.2]);
    J(pre + 'f' + L + i + 'b', a, [0, -0.3, 0]);
  }
  const t = J(pre + 't' + L + 'a', wr, [-s * 0.02, -0.2, 0.3]);
  J(pre + 't' + L + 'b', t, [0, -0.27, 0]);
}

function torso(k) {
  // ---- pelvis: a copper basin with a porcelain apron and tassets
  const PS = tube([[-0.42, 0.3, 0.3], [-0.2, 0.64, 0.52], [0.1, 0.68, 0.54], [0.32, 0.4, 0.36]]);
  k.add('pelvis', solid(PS, { nu: 16, nv: 6 }), COPD);
  const pp = (u0, u1, v0, v1, st) => k.add('pelvis', patch(PS, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], { t: 0.07, lift: 0.02, ch: 0.05, crown: 0.03 }), st);
  pp(-0.1, 0.1, 0.08, 0.86, PORC); pp(0.13, 0.36, 0.2, 0.9, PORC2); pp(-0.36, -0.13, 0.2, 0.9, PORC2); pp(0.39, 0.61, 0.15, 0.86, PORC3);
  k.add('pelvis', boxUV(0.2, 0.045, 0.05), COPB, [0.2, 0.0, 0.5], [0, 22, 0]); k.add('pelvis', boxUV(0.2, 0.045, 0.05), COPB, [-0.2, 0.0, 0.5], [0, -22, 0]);
  // ---- waist: three copper vertebrae, narrow
  k.add('waist', cyl(0.19, 0.24, 0.56, 14), COPD, [0, 0.2, 0]);
  for (const y of [0.02, 0.2, 0.38]) k.add('waist', ring(0.29, 0.065, 20, 6), COP, [0, y, 0]);
  k.add('waist', cbox(0.14, 0.5, 0.18, 0.04), COPB, [0, 0.2, -0.29]);
  // ---- chest: a barrel of plates round a copper drum
  const CS = tube([[-0.16, 0.5, 0.45, 0], [0.2, 0.96, 0.8, 0.05], [0.75, 1.2, 1.02, 0.08], [1.2, 1.12, 0.92, 0.05], [1.5, 0.74, 0.62, 0], [1.66, 0.4, 0.38, 0]]);
  k.add('chest', solid(CS, { nu: 22, nv: 9 }), COPD);
  const cp = (u0, u1, v0, v1, st, o = {}) => k.add('chest', patch(CS, [[u0, v0], [u1, v0], [u1 + (o.sk ?? 0), v1], [u0 + (o.sk ?? 0), v1]], { t: 0.08, lift: 0.025, ch: 0.05, crown: 0.04, nu: 5, nv: 6 }), st);
  cp(0.015, 0.2, 0.1, 0.78, PORC); cp(-0.2, -0.015, 0.1, 0.78, PORC);                 // breast plates
  cp(0.215, 0.37, 0.14, 0.74, PORC2); cp(-0.37, -0.215, 0.14, 0.74, PORC2);           // flanks
  cp(0.385, 0.495, 0.1, 0.8, PORC3); cp(0.505, 0.615, 0.1, 0.8, PORC2);               // back
  cp(0.03, 0.24, 0.8, 0.96, PORC2, { sk: -0.01 }); cp(-0.24, -0.03, 0.8, 0.96, PORC2, { sk: 0.01 }); // collar
  cp(0.27, 0.47, 0.78, 0.95, PORC3); cp(0.53, 0.73, 0.78, 0.95, PORC3);
  // crest plate, bezel and staples across the breast seam
  k.add('chest', cylZ(0.4, 0.1, 28), CREST, [0, 0.8, 1.16]);
  k.add('chest', ringZ(0.43, 0.05, 28, 6), COPB, [0, 0.8, 1.2]);
  for (const y of [0.22, 1.32]) k.add('chest', boxUV(0.3, 0.05, 0.06), COPB, [0, y, CS.p(0, (y + 0.16) / 1.82).z + 0.11]);
  for (const s of [1, -1]) for (const y of [0.4, 0.8, 1.15]) k.add('chest', boxUV(0.05, 0.05, 0.26), COPB, [s * (CS.p(0.207, (y + 0.16) / 1.82).x + 0.1), y, CS.p(0.207, (y + 0.16) / 1.82).z], [0, s * 18, 0]);
  // shoulder yoke and the fan housings on the shoulder blades
  k.add('chest', cylX(0.2, 2.5, 12), COP, [0, SK.shY, SK.shZ]);
  for (const s of [1, -1]) k.add('chest', cbox(0.34, 0.5, 0.2, 0.06), COP, [s * 0.5, 1.0, -0.94]);
  // the torn socket of the left shoulder stays on the body
  k.add('chest', cylX(0.27, 0.2, 14), COPB, [SK.shX - 0.12, SK.shY, SK.shZ]);
  // ---- neck
  k.add('neck', cyl(0.2, 0.27, 0.36, 12), COPD, [0, 0.0, 0]);
  k.add('neck', ring(0.3, 0.05, 18, 6), COPB, [0, 0.1, 0]);
}

// hexagonal paper-lantern head: copper ribs and hoops, milk glass, porcelain skirts, one iris in the front pane
const HEXL = [[0.08, 0.38], [0.42, 0.6], [1.06, 0.61], [1.36, 0.43]];
const hexP = (kk, lv, sc = 1) => { const a = (30 + 60 * kk) * Math.PI / 180, [y, R] = HEXL[lv]; return [R * sc * Math.sin(a), y, R * sc * Math.cos(a)]; };
function headBuild(k) {
  const b = 'head';
  for (let f = 0; f < 6; f++) {
    for (let lv = 0; lv < 3; lv++) {
      const porc = lv === 0 || (lv === 2 && f % 2 === 1);
      const sc = porc ? 1.0 : 0.95;
      // face f spans corners f-1 .. f (front face = corners -1, 0)
      const g = quad(hexP(f - 1, lv, sc), hexP(f, lv, sc), hexP(f, lv + 1, sc), hexP(f - 1, lv + 1, sc));
      k.add(b, g, porc ? (f % 2 ? PORC2 : PORC) : GLASS);
    }
    for (let lv = 0; lv < 3; lv++) seg(k, b, hexP(f, lv), hexP(f, lv + 1), 0.075, 0.075, COP);
    for (let lv = 0; lv < 4; lv++) seg(k, b, hexP(f - 1, lv, 1.01), hexP(f, lv, 1.01), lv === 1 || lv === 2 ? 0.07 : 0.09, 0.06, lv === 1 ? COPB : COP);
  }
  k.add(b, cyl(0.4, 0.33, 0.12, 6).rotateY(Math.PI / 6), COPD, [0, 0.05, 0]);
  k.add(b, cyl(0.16, 0.52, 0.26, 6).rotateY(Math.PI / 6), COP, [0, 1.48, 0]);
  k.add(b, cyl(0.07, 0.1, 0.16, 8), COPB, [0, 1.66, 0]);
  k.add(b, ringZ(0.15, 0.035, 18, 6), COPB, [0, 1.86, 0]);
  // iris bezel on the front pane, a small brow hood over it
  k.add(b, ringZ(0.3, 0.05, 28, 6), COPB, [0, SK.irisY, SK.irisZ - 0.01]);
  k.add(b, cylZ(0.3, 0.05, 24), COPD, [0, SK.irisY, SK.irisZ - 0.05]);
  k.add(b, cbox(0.72, 0.07, 0.2, 0.02), COP, [0, SK.irisY + 0.36, SK.irisZ + 0.02], [14, 0, 0]);
  k.add('iris', cylZ(0.25, 0.03, 32), IRIS, [0, 0, 0]);
}

function arm(k, s, L, pre) {
  const M = { mirror: s < 0 };
  const b1 = pre + 'sh' + L, b2 = pre + 'el' + L, b3 = pre + 'wr' + L;
  // shoulder: copper ball, a porcelain pauldron like half a cracked bowl
  k.add(b1, ball(0.3, 14, 10), COP);
  k.add(b1, hull(superPts(0.52, 0.4, 0.56, 2.5, 10).filter((p) => p.y > -0.08).map((p) => p.add(v3(0.14, 0.1, 0))), 40), PORC, undefined, undefined, M);
  k.add(b1, ring(0.5, 0.045, 20, 6), COPB, [0.14, 0.03, 0], [0, 0, 0], { ...M, scale: [1, 1, 1.08] });
  k.add(b1, cyl(0.11, 0.11, SK.L1a, 10), COPD, [0, -SK.L1a / 2, 0]);
  k.add(b1, solid(tube([[-1.08, 0.2, 0.2], [-0.84, 0.27, 0.26, 0, 2.6, 0.03], [-0.48, 0.25, 0.25, 0, 2.6, 0.03], [-0.33, 0.17, 0.17]]), { nu: 12, nv: 6 }), PORC2, undefined, undefined, M);
  k.add(b1, boxUV(0.05, 0.22, 0.05), COPB, [0.26, -0.66, 0.1], undefined, M);
  // forearm: elbow drum, a long bell gauntlet
  k.add(b2, cylX(0.21, 0.46, 14), COP);
  k.add(b2, cyl(0.09, 0.09, SK.L2a, 10), COPD, [0, -SK.L2a / 2, 0]);
  k.add(b2, solid(tube([[-1.2, 0.3, 0.28], [-1.02, 0.31, 0.29], [-0.6, 0.22, 0.22], [-0.32, 0.17, 0.17], [-0.24, 0.12, 0.12]]), { nu: 14, nv: 7 }), PORC, undefined, undefined, M);
  k.add(b2, ring(0.31, 0.045, 20, 6), COPB, [0, -1.16, 0]);
  k.add(b2, cylX(0.1, 0.14, 10), COPB, [0.27, -0.2, 0], undefined, M);
  // hand: palm plate, pad, knuckle bar
  k.add(b3, ball(0.15, 10, 8), COPD);
  const palm = extrude([[-0.25, -0.08], [0.25, -0.08], [0.32, -0.3], [0.3, -0.6], [-0.3, -0.6], [-0.32, -0.3]], 0.14, 0.03).rotateY(Math.PI / 2);
  k.add(b3, palm, PORC);
  k.add(b3, cylX(0.17, 0.05, 16), COPD, [-0.09, -0.32, 0], undefined, M);
  k.add(b3, cylZ(0.075, 0.6, 10), COP, [0, -0.6, 0]);
  for (let i = 0; i < 3; i++) {
    k.add(pre + 'f' + L + i + 'a', [ball(0.085, 8, 6), solid(tube([[-0.3, 0.08, 0.085], [-0.15, 0.092, 0.1], [-0.02, 0.085, 0.09]]), { nu: 8, nv: 3 })], i === 1 ? PORC : PORC2);
    k.add(pre + 'f' + L + i + 'b', [ball(0.08, 8, 6), solid(tube([[-0.3, 0.035, 0.04], [-0.22, 0.07, 0.078], [-0.02, 0.08, 0.088]]), { nu: 8, nv: 3 })], PORC);
  }
  k.add(pre + 't' + L + 'a', [ball(0.09, 8, 6), solid(tube([[-0.27, 0.085, 0.09], [-0.13, 0.1, 0.1], [-0.02, 0.09, 0.09]]), { nu: 8, nv: 3 })], PORC2);
  k.add(pre + 't' + L + 'b', [ball(0.08, 8, 6), solid(tube([[-0.26, 0.035, 0.04], [-0.18, 0.075, 0.08], [-0.02, 0.085, 0.09]]), { nu: 8, nv: 3 })], PORC);
}

function leg(k, s, L) {
  const M = { mirror: s < 0 };
  k.add('hip' + L, ball(0.27, 12, 9), COP);
  k.add('hip' + L, cyl(0.12, 0.12, SK.L1, 10), COPD, [0, -SK.L1 / 2, 0]);
  k.add('hip' + L, solid(tube([[-0.93, 0.21, 0.24], [-0.55, 0.31, 0.31, 0, 2.6, 0.06], [-0.16, 0.27, 0.27, 0, 2.6, 0.04]]), { nu: 12, nv: 5 }), PORC2, undefined, undefined, M);
  k.add('kn' + L, cylX(0.24, 0.5, 14), COP);
  k.add('kn' + L, hull(superPts(0.2, 0.25, 0.13, 2.5, 8), 40), PORC, [0, 0, 0.22]);
  k.add('kn' + L, cyl(0.1, 0.1, SK.L2, 10), COPD, [0, -SK.L2 / 2, 0]);
  k.add('kn' + L, solid(tube([[-0.82, 0.29, 0.31], [-0.66, 0.31, 0.33], [-0.36, 0.2, 0.22], [-0.12, 0.16, 0.17]]), { nu: 14, nv: 6 }), PORC, undefined, undefined, M);
  k.add('kn' + L, ring(0.3, 0.04, 20, 6), COPB, [0, -0.76, 0]);
  k.add('an' + L, ball(0.17, 10, 8), COPD);
  k.add('an' + L, hull(superPts(0.5, 0.22, 0.62, 2.6, 12).filter((p) => p.y > -0.02), 38), PORC2, [0, -SK.ankleH + 0.05, 0.12]);
  k.add('an' + L, cyl(0.52, 0.54, 0.06, 20), COP, [0, -SK.ankleH + 0.03, 0.12], [0, 0, 0], { scale: [1, 1, 1.2] });
}

function fans(k) {
  const blade = (L, w) => {
    const leaf = extrude([[0, -0.12], [w, -L * 0.82], [w * 0.5, -L], [-w * 0.5, -L], [-w, -L * 0.82]], 0.012, 0);
    const rib = boxUV(0.04, L, 0.03); rib.translate(0, -L / 2, 0);
    return [leaf, rib];
  };
  for (let i = 0; i < FAN_A; i++) {
    const [leaf, rib] = blade(0.98, 0.17);
    leaf.rotateY(Math.PI / 2); rib.rotateY(Math.PI / 2);
    k.add('fanA' + i, leaf, { ...LEAF, col: i % 2 ? '#4f8c78' : '#5c9a80' }, [(i - 3) * 0.016, 0, 0]);
    k.add('fanA' + i, rib, COPB, [(i - 3) * 0.016, 0, 0]);
  }
  for (const L of ['L', 'R']) for (let i = 0; i < FAN_B; i++) {
    const [leaf, rib] = blade(2.25, 0.26);
    k.add('fanB' + L + i, leaf, { ...LEAF, col: i % 2 ? '#4f8c78' : '#5c9a80' });
    k.add('fanB' + L + i, rib, COPB);
  }
}
