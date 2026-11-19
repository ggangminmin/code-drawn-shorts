import * as THREE from 'three';
import { mergeGeometries } from '../vendor/addons/BufferGeometryUtils.js';

// SETS modelling kit: painted (per-vertex colour aCol) geometry merged into a few meshes per set.
export const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const _v = new THREE.Vector3(), _n = new THREE.Vector3();

export const hex = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
export const mixc = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

// colour fn(v, n) -> [r,g,b] | '#hex' | [r,g,b]
export function paint(g, col) {
  const fn = typeof col === 'function' ? col : null;
  const fixed = fn ? null : (Array.isArray(col) ? col : hex(col ?? '#ffffff'));
  const p = g.attributes.position, n = g.attributes.normal, N = p.count;
  const a = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    let c = fixed;
    if (fn) { _v.fromBufferAttribute(p, i); _n.fromBufferAttribute(n, i); c = fn(_v, _n); if (typeof c === 'string') c = hex(c); }
    a[i * 3] = c[0]; a[i * 3 + 1] = c[1]; a[i * 3 + 2] = c[2];
  }
  g.setAttribute('aCol', new THREE.BufferAttribute(a, 3));
  return g;
}

const rot = (g, rx, ry, rz) => { if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ'))); return g; };
export const box = (w, h, d, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sg = 1) => rot(new THREE.BoxGeometry(w, h, d, sg, sg, sg), rx, ry, rz).translate(x, y, z);
export const cyl = (r0, r1, h, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, seg = 24, open = false) => rot(new THREE.CylinderGeometry(r0, r1, h, seg, 1, open), rx, ry, rz).translate(x, y, z);
export const sph = (r, x = 0, y = 0, z = 0, ws = 16, hs = 12) => new THREE.SphereGeometry(r, ws, hs).translate(x, y, z);
export const ell = (rx, ry, rz, x = 0, y = 0, z = 0, ws = 20, hs = 14) => new THREE.SphereGeometry(1, ws, hs).scale(rx, ry, rz).translate(x, y, z);
export const torus = (r, t, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, rs = 10, ts = 36, arc = Math.PI * 2) => rot(new THREE.TorusGeometry(r, t, rs, ts, arc), rx, ry, rz).translate(x, y, z);
export const lathe = (pts, seg = 32) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

export function merge(list) { return mergeGeometries(list.map((g) => { const h = g.index ? g.toNonIndexed() : g; if (!h.attributes.uv) h.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(h.attributes.position.count * 2), 2)); return h; }), false); }

// deform vertices in place; normals recomputed
export function deform(g, fn) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { _v.fromBufferAttribute(p, i); fn(_v, i); p.setXYZ(i, _v.x, _v.y, _v.z); }
  p.needsUpdate = true; g.computeVertexNormals(); return g;
}

// tube along points with constant radius
export function tube(points, r, seg = 8, tseg = 40, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points, closed);
  return new THREE.TubeGeometry(curve, tseg, r, seg, closed);
}

// A bag of painted pieces that becomes one mesh.
export function bag(parent, name, mat) {
  const list = [];
  return {
    list,
    add(g, col) { paint(g, col); list.push(g); return g; },
    build() {
      if (!list.length) return null;
      const m = new THREE.Mesh(merge(list), mat); m.name = name; parent.add(m); return m;
    },
  };
}

// Invisible closed proxy meshes for QA (one mesh per piece set; pieces must not overlap each other).
const PROXY_MAT = new THREE.MeshBasicMaterial({ visible: false });
export function proxy(parent, name, geos, ctx, contactNote) {
  const g = mergeGeometries(geos.map((x) => { const h = x.index ? x.toNonIndexed() : x.clone(); for (const k of Object.keys(h.attributes)) if (k !== 'position') h.deleteAttribute(k); return h; }), false);
  const m = new THREE.Mesh(g, PROXY_MAT); m.name = name; m.userData.noShadow = true; m.frustumCulled = false; parent.add(m);
  ctx.colliders.push({ name, dept: 'sets', obj: m, kind: 'solid', note: contactNote });
  return m;
}
