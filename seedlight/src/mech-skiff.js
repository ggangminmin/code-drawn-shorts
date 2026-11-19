import * as THREE from 'three';
import { Kit, v3, hull, cbox, cyl, cylZ, cylX, ball, tube, solid, extrude, boxUV, seg } from './mech-geo.js';
import { CUES } from './shots.js';
import { CATCH } from './layout.js';
import { clamp } from './util.js';

// MECH dept: the kite skiff. A 6 m shell hull, two patched triangular sails, pusher propeller, twin tail vanes,
// tiller, and the hook bar under the hull. Local: +Z nose, +Y up, +X port. Ink ids 20..29.
export const SKIFF = { seatPilot: [0, 0.3, -1.55], seatBoy: [0, 0.3, 0.35], hook: [0, -0.92, 0], nose: [0, 0.12, 3.05] };

const WOOD = { col: '#9a6a40', metal: 0.2, detail: 1, tone: 0.06, wear: 0.8, pw: 1.7, ph: 0.13, riv: 0, seam: 0, id: 21 };
const WOOD2 = { ...WOOD, col: '#6e4a2e', id: 22 };
const CANV = { col: '#d9c9a0', metal: 0, detail: 0.5, tone: 0.03, wear: 1, pw: 0.9, ph: 0.9, riv: 0, seam: 0, id: 23 };
const PATCH1 = { ...CANV, col: '#b7885a', id: 24 }, PATCH2 = { ...CANV, col: '#8fa58c', id: 25 };
const BRASS = { col: '#b98a4a', metal: 0.9, detail: 0.3, tone: 0.04, wear: 0.4, pw: 1, ph: 1, riv: 0, seam: 0, id: 26 };
const IRON = { col: '#3a4644', metal: 0.7, detail: 0.3, tone: 0.05, wear: 0.5, pw: 1, ph: 1, riv: 0, seam: 0, id: 27 };

const MAST = [0, 2.5, 0.75], BOOM = [0, 0.95, -2.3], BOW = [0, 0.42, 2.7];
function sailGeo(a, b, c, n = 7) {
  const pos = [], P = (i, j) => { const u = i / n, v = j / n; return [a[0] + (b[0] - a[0]) * u + (c[0] - a[0]) * v, a[1] + (b[1] - a[1]) * u + (c[1] - a[1]) * v, a[2] + (b[2] - a[2]) * u + (c[2] - a[2]) * v]; };
  for (let i = 0; i < n; i++) for (let j = 0; j < n - i; j++) {
    pos.push(...P(i, j), ...P(i + 1, j), ...P(i, j + 1));
    if (j < n - i - 1) pos.push(...P(i + 1, j), ...P(i + 1, j + 1), ...P(i, j + 1));
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); return g;
}

export function buildSkiff(material) {
  const j = {};
  const root = new THREE.Group(); root.name = 'skiff'; j.root = root;
  const J = (name, parent, pos) => { const g = new THREE.Group(); g.name = name; g.position.set(...pos); parent.add(g); j[name] = g; return g; };
  J('hull', root, [0, 0, 0]); J('rig', root, [0, 0, 0]); J('prop', root, [0, 0.3, -3.2]); J('tiller', root, [0, 0.42, -2.5]);
  J('sailL', root, [0, 0, 0]); J('sailR', root, [0, 0, 0]);
  const k = new Kit(21); k.id = function () { this.n++; return 20 + ((this.n * 3) % 10); };
  // hull: a closed rowing shell, flat deck, keel line, raised stem
  const HS = tube([[-3.0, 0.05, 0.1, 0.34], [-2.6, 0.26, 0.26, 0.18], [-1.4, 0.5, 0.36, 0.04], [0.2, 0.56, 0.4, 0], [1.6, 0.42, 0.36, 0.04], [2.6, 0.18, 0.26, 0.2], [3.05, 0.03, 0.08, 0.42]].map(([y, rx, rz, cz]) => [y, rx, rz, -cz, 2.2]));
  const hg = solid(HS, { nu: 14, nv: 12 }); hg.rotateX(Math.PI / 2);     // tube y -> skiff z, tube z -> -y
  k.add('hull', hg, WOOD);
  k.add('hull', boxUV(0.9, 0.05, 3.6), WOOD2, [0, 0.3, -0.3]);            // deck board
  k.add('hull', boxUV(0.06, 0.12, 5.2), WOOD2, [0, -0.4, 0]);             // keel
  for (const s of [1, -1]) k.add('hull', boxUV(0.05, 0.07, 4.6), WOOD2, [s * 0.5, 0.2, -0.1]);   // gunwales
  k.add('hull', boxUV(0.5, 0.3, 0.08), WOOD2, [0, 0.47, -2.0], [-12, 0, 0]);                      // pilot's backrest
  // hook bar under the hull amidships
  for (const s of [1, -1]) seg(k, 'hull', [s * 0.42, -0.3, 0], [s * 0.62, -0.92, 0], 0.06, 0.06, IRON);
  k.add('hull', cylX(0.04, 1.5, 8), BRASS, [0, -0.92, 0]);
  for (const s of [1, -1]) k.add('hull', ball(0.07, 8, 6), BRASS, [s * 0.75, -0.92, 0]);
  // mast, boom, yards, stays
  seg(k, 'rig', [0, 0.3, 0.75], MAST, 0.09, 0.09, WOOD2);
  seg(k, 'rig', [0, 0.95, 0.75], BOOM, 0.07, 0.07, WOOD2);
  for (const s of [1, -1]) { seg(k, 'rig', [0, 1.0, 0.75], [s * 3.0, 1.55, -0.9], 0.06, 0.06, WOOD2); seg(k, 'rig', MAST, [s * 0.5, 0.3, -0.4], 0.02, 0.02, IRON); }
  seg(k, 'rig', MAST, BOW, 0.02, 0.02, IRON);
  k.add('rig', ball(0.09, 8, 6), BRASS, MAST);
  // twin tail vanes on a stern frame, pennant stub
  for (const s of [1, -1]) {
    seg(k, 'rig', [0, 0.3, -2.7], [s * 0.7, 0.75, -3.0], 0.05, 0.05, WOOD2);
    k.add('rig', extrude([[0, 0], [0.75, 0.1], [0.85, 0.75], [0.25, 0.95], [-0.05, 0.4]], 0.03, 0).rotateY(-Math.PI / 2), s > 0 ? PATCH1 : PATCH2, [s * 0.7, 0.7, -2.75], [0, 0, -s * 18]);
  }
  // pusher propeller and tiller
  k.add('prop', cylZ(0.09, 0.3, 10), BRASS);
  for (const a of [0, 180]) k.add('prop', extrude([[0, 0.05], [0.14, 0.3], [0.1, 0.7], [0, 0.78], [-0.08, 0.5]], 0.02, 0), WOOD2, [0, 0, -0.08], [0, 18, a]);
  seg(k, 'tiller', [0, 0, 0], [0, 0.25, 0.9], 0.04, 0.04, WOOD2);
  k.add('hull', boxUV(0.05, 0.5, 0.4), WOOD2, [0, -0.2, -2.95]);          // rudder
  // sails: two wings from the mast and boom out to the yard tips, patched
  for (const [s, L] of [[1, 'L'], [-1, 'R']]) {
    const tip = [s * 3.0, 1.55, -0.9];
    k.add('sail' + L, sailGeo(MAST, tip, [BOOM[0] + s * 0.05, BOOM[1], BOOM[2]]), CANV);
    k.add('sail' + L, sailGeo([s * 0.06, 1.0, 0.9], BOW.map((v, i) => v + (i === 0 ? s * 0.04 : i === 1 ? 0.1 : -0.1)), [s * 2.9, 1.52, -0.8], 5), s > 0 ? CANV : { ...CANV, col: '#cdbb92' });
    const pc = (u, v, w, st) => { const a = [MAST[0] + (tip[0] - MAST[0]) * u, MAST[1] + (tip[1] - MAST[1]) * u + (BOOM[1] - MAST[1]) * v + 0.012, MAST[2] + (tip[2] - MAST[2]) * u + (BOOM[2] - MAST[2]) * v]; k.add('sail' + L, sailGeo(a, [a[0] + s * w, a[1] + 0.1, a[2] - 0.1], [a[0], a[1] - w * 0.3, a[2] - w], 2), st); };
    pc(0.3, 0.25, 0.5, PATCH1); pc(0.5, 0.1, 0.4, PATCH2); pc(0.15, 0.5, 0.45, s > 0 ? PATCH2 : PATCH1);
  }
  const meshes = k.finish(j, material);
  const sails = ['sailL', 'sailR'].map((n) => { const m = j[n].children[0]; return { m, rest: m.geometry.attributes.position.array.slice() }; });
  return { root, j, meshes, sails, hullMesh: j.hull.children[0] };
}

// ---- flight path: timed Catmull-Rom through keys (pure). The hook bar passes 1.55 m over CATCH.pos at CATCH.t along +X at 16 m/s.
const HY = CATCH.pos[1] + 1.55 - SKIFF.hook[1], CZ = CATCH.pos[2], CT = CATCH.t, SP = CATCH.speed;
const K = [
  [49.4, -90, 40, 500], [51.4, -68, 56, 215], [52.4, -59, 71, 150], [53.15, -52, 97, 90], [53.55, -47.5, 133.2, 50], [53.8, -45, 139, 33], [54.4, -34, 148, -12],
  [56, -84, 172, -70], [58, -124, 200, 22], [60, -46, 226, 78], [61.9, 38, 225, 16], [62.7, 33, 224, -30], [63.5, -3, 223.4, -44], [64.3, -36, 223.2, -22],
  [65.1, -41, 223.2, 2], [CT - 1.5, -1.5 * SP - 2, HY + 0.9, CZ - 0.4], [CT - 1, -SP, HY + 0.35, CZ], [CT - 0.5, -SP / 2, HY + 0.06, CZ], [CT, 0, HY, CZ], [CT + 0.5, SP / 2, HY, CZ], [CT + 1, SP, HY + 0.3, CZ + 0.6],
  [CT + 2, 2 * SP + 2, HY + 2.6, CZ + 8], [70.5, 58, 229, 56], [72.4, 20, 224, 150], [73.9, -70, 206, 300], [75.4, -150, 192, 450], [78.6, -300, 180, 740],
];
export function skiffPos(t, out) {
  let i = 1; while (i < K.length - 2 && t > K[i + 1][0]) i++;
  const a = K[Math.max(i - 1, 0)], b = K[i], c = K[i + 1], d = K[Math.min(i + 2, K.length - 1)];
  const h = c[0] - b[0], u = clamp((t - b[0]) / h), u2 = u * u, u3 = u2 * u;
  for (let n = 1; n <= 3; n++) {
    const m0 = ((c[n] - a[n]) / (c[0] - a[0])) * h, m1 = ((d[n] - b[n]) / (d[0] - b[0])) * h;
    out[n - 1] = (2 * u3 - 3 * u2 + 1) * b[n] + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * c[n] + (u3 - u2) * m1;
  }
  const dd = t - CUES.catch;                           // the dip with her weight
  if (dd > 0) { const q = dd / 0.45; out[1] -= 1.15 * q * q * Math.exp(2 * (1 - q)); }
  return out;
}
const _a = [0, 0, 0], _b = [0, 0, 0], _c = [0, 0, 0];
export function poseSkiff(sk, t) {
  const e = 0.06;
  skiffPos(t, _a); skiffPos(t - e, _b); skiffPos(t + e, _c);
  const vx = (_c[0] - _b[0]) / (2 * e), vy = (_c[1] - _b[1]) / (2 * e), vz = (_c[2] - _b[2]) / (2 * e);
  const sp = Math.hypot(vx, vy, vz) + 1e-6, yaw = Math.atan2(vx, vz);
  const ax = (_c[0] - 2 * _a[0] + _b[0]) / (e * e), az = (_c[2] - 2 * _a[2] + _b[2]) / (e * e);
  const lat = (ax * vz - az * vx) / Math.hypot(vx, vz);                // lateral acceleration toward port (+X local)
  const near = Math.exp(-(((t - CATCH.t) / 0.5) ** 2));
  const bank = clamp(-lat / 14, -0.95, 0.95) * (1 - near) + 0.03 * Math.sin(t * 2.3);
  sk.root.position.set(_a[0], _a[1] + 0.05 * Math.sin(t * 3.1) * (1 - near), _a[2]);
  sk.root.rotation.set(-Math.asin(clamp(vy / sp, -0.8, 0.8)) * 0.85 * (1 - near), yaw, bank, 'YXZ');
  sk.j.prop.rotation.z = t * 41;
  sk.j.tiller.rotation.y = clamp(lat / 30, -0.5, 0.5);
  // sails flutter: displacement grows away from the mast, travelling toward the trailing edge
  const td = Math.floor(t * 12) / 12;
  for (const s of sk.sails) {
    const p = s.m.geometry.attributes.position, r = s.rest;
    for (let i = 0; i < p.count; i++) {
      const x = r[i * 3], y = r[i * 3 + 1], z = r[i * 3 + 2];
      const w = clamp((Math.abs(x) - 0.15) / 2.6) * clamp((0.9 - z) / 2.5 + 0.25);
      const d = w * (0.16 * Math.sin(z * 3.1 + Math.abs(x) * 1.7 - td * 17) + 0.07 * Math.sin(z * 7.3 - td * 29 + x) + 0.22);
      p.setXYZ(i, x, y + d, z);
    }
    p.needsUpdate = true; s.m.geometry.computeVertexNormals();
  }
}
