// SEEDLIGHT, land department: tiny geometry kit (merge many primitives into one mesh) and the terrain height function.
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/addons/BufferGeometryUtils.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
export function xf(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(sx, sy, sz));
}
function clean(geo) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  g.morphAttributes = {};
  return g;
}
export class Bag {
  constructor() { this.g = []; }
  add(geo, m) { const g = clean(geo); if (m) g.applyMatrix4(m); this.g.push(g); return this; }
  box(w, h, d, x, y, z, ry = 0, rx = 0, rz = 0) { return this.add(new THREE.BoxGeometry(w, h, d), xf(x, y, z, rx, ry, rz)); }
  cyl(rt, rb, h, x, y, z, seg = 20, open = false, rx = 0, ry = 0, rz = 0) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), xf(x, y, z, rx, ry, rz)); }
  sph(r, x, y, z, sy = 1, ws = 18, hs = 10, phi = Math.PI) { return this.add(new THREE.SphereGeometry(r, ws, hs, 0, Math.PI * 2, 0, phi), xf(x, y, z, 0, 0, 0, 1, sy, 1)); }
  torus(R, r, x, y, z, rx = Math.PI / 2, ry = 0, seg = 28, ts = 8) { return this.add(new THREE.TorusGeometry(R, r, ts, seg), xf(x, y, z, rx, ry, 0)); }
  lathe(pts, x, y, z, seg = 40) { return this.add(new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), seg), xf(x, y, z)); }
  get empty() { return this.g.length === 0; }
  geometry() { const g = mergeGeometries(this.g, false); g.computeBoundingSphere(); g.computeBoundingBox(); return g; }
  mesh(material, name) { const m = new THREE.Mesh(this.geometry(), material); m.name = name ?? ''; return m; }
}
export const one = (geo, material, m, name) => { const g = clean(geo); if (m) g.applyMatrix4(m); const me = new THREE.Mesh(g, material); me.name = name ?? ''; return me; };

// quads from a point grid rows[i][j] = [x,y,z]; flat-ish normals from vertex normals
export function loft(rows, closeU = false) {
  const pos = [];
  const nu = rows[0].length;
  for (let i = 0; i < rows.length - 1; i++) {
    for (let j = 0; j < nu - (closeU ? 0 : 1); j++) {
      const a = rows[i][j], b = rows[i][(j + 1) % nu], c = rows[i + 1][(j + 1) % nu], d = rows[i + 1][j];
      pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- terrain
const sm = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const h2 = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
function vn(x, y) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return (h2(i, j) * (1 - u) + h2(i + 1, j) * u) * (1 - v) + (h2(i, j + 1) * (1 - u) + h2(i + 1, j + 1) * u) * v;
}
export function fbm(x, y) { let s = 0, a = 0.5; for (let i = 0; i < 4; i++) { s += a * vn(x, y); x = x * 2.03 + 1.7; y = y * 2.03 + 9.2; a *= 0.5; } return s; }

// The canyon: floor of the gorge at -100 below the dam (always under mist), rising to the open salt flats (y = 0) downstream;
// the plateau (cracked salt, y ~ 150) on both sides sinks to the flats far downstream. Upstream the gorge holds the reservoir.
export function terrainY(x, z) {
  const farZ = Math.max(0, Math.abs(z) - 320);
  const mean = Math.sin(z * 0.0021 + 1.3) * 110 * sm(farZ / 700);
  const xc = x - mean, ax = Math.abs(xc);
  const widen = sm((z - 800) / 1500) * 1900 + sm((-z - 500) / 1500) * 260;
  const hw = 330 + widen + (fbm(x * 0.004 + 7, z * 0.004) - 0.5) * 150 * sm(farZ / 500);
  const mesa = sm((fbm(x * 0.0007 + 11, z * 0.0007) - 0.56) / 0.035) * 64 * sm((ax - hw - 260) / 300);
  let rim = 150 + (fbm(x * 0.0015, z * 0.0015 + 3) - 0.5) * 20 + mesa;
  rim *= 1 - sm((z - 1500) / 1700);
  const floor = z > -60 ? -100 + 100 * sm((z - 700) / 1000) : 62;
  const d = ax - hw;
  let w = sm((d + 4) / 46);
  // benches of harder strata
  const bench = fbm(x * 0.01, z * 0.01 + 20);
  w = w + 0.06 * Math.sin(w * Math.PI * 5) * (0.4 + bench) * w * (1 - w) * 4;
  w = Math.min(1, Math.max(0, w));
  return Math.min(floor, rim) + (rim - Math.min(floor, rim)) * w;
}

export function terrainMesh(material, x0, x1, z0, z1, step, cut) {
  const nx = Math.round((x1 - x0) / step), nz = Math.round((z1 - z0) / step);
  const pos = new Float32Array((nx + 1) * (nz + 1) * 3);
  let k = 0;
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const x = x0 + (x1 - x0) * i / nx, z = z0 + (z1 - z0) * j / nz;
    let y = terrainY(x, z);
    if (cut && x > cut[0] && x < cut[1] && z > cut[2] && z < cut[3]) y -= 60;
    pos[k++] = x; pos[k++] = y; pos[k++] = z;
  }
  const idx = new Uint32Array(nx * nz * 6);
  k = 0;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
    idx[k++] = a; idx[k++] = c; idx[k++] = b; idx[k++] = b; idx[k++] = c; idx[k++] = d;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((nx + 1) * (nz + 1) * 2), 2));
  const m = new THREE.Mesh(g, material);
  m.frustumCulled = false;
  return m;
}
