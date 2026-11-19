// LAST LIGHT, land department: geometry. Terrain grid, village houses, the cottage, the tower, the pier, the reef teeth, rocks.
// Structures carry per-vertex attributes for structMaterial (see land-mat.js): aK = kind, seed, ink id, lit; aF = u, v, face w, face h.
import * as THREE from 'three';
import { Rng } from './util.js';
import { MOUTH, TOWER, COTTAGE, PIER, LAMPROOM } from './layout.js';
import { pathDist, PLATEAU, QUAY_Y, CLUSTERS, fbm } from './land-map.js';

export const ID = { tower: 1, band: 2, iron: 3, cottage: 4, cottageRoof: 5, pier: 6, teeth: 7, wall: 8, roof: 9, props: 10, rocks: 11, chimney: 12 };

// ---------------------------------------------------------------- a geometry accumulator
export class Geo {
  constructor() { this.p = []; this.n = []; this.k = []; this.f = []; this.i = []; }
  get count() { return this.p.length / 3; }
  vert(p, n, k, f) { this.p.push(p[0], p[1], p[2]); this.n.push(n[0], n[1], n[2]); this.k.push(k[0], k[1], k[2], k[3]); this.f.push(f[0], f[1], f[2], f[3]); return this.count - 1; }
  // quad a b c d (counter-clockwise seen from the front), uv per corner in metres, face size
  quad(a, b, c, d, k, uvs, fw, fh) {
    const n = new THREE.Vector3().subVectors(new THREE.Vector3(...b), new THREE.Vector3(...a)).cross(new THREE.Vector3().subVectors(new THREE.Vector3(...d), new THREE.Vector3(...a))).normalize().toArray();
    const i0 = this.vert(a, n, k, [uvs[0][0], uvs[0][1], fw, fh]);
    this.vert(b, n, k, [uvs[1][0], uvs[1][1], fw, fh]);
    this.vert(c, n, k, [uvs[2][0], uvs[2][1], fw, fh]);
    this.vert(d, n, k, [uvs[3][0], uvs[3][1], fw, fh]);
    this.i.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
  }
  tri(a, b, c, k, uvs, fw, fh) {
    const n = new THREE.Vector3().subVectors(new THREE.Vector3(...b), new THREE.Vector3(...a)).cross(new THREE.Vector3().subVectors(new THREE.Vector3(...c), new THREE.Vector3(...a))).normalize().toArray();
    const i0 = this.vert(a, n, k, [uvs[0][0], uvs[0][1], fw, fh]);
    this.vert(b, n, k, [uvs[1][0], uvs[1][1], fw, fh]);
    this.vert(c, n, k, [uvs[2][0], uvs[2][1], fw, fh]);
    this.i.push(i0, i0 + 1, i0 + 2);
  }
  // add a local-space Geo transformed by matrix m
  addXf(g, m) {
    const nm = new THREE.Matrix3().getNormalMatrix(m), v = new THREE.Vector3(), base = this.count;
    for (let j = 0; j < g.count; j++) {
      v.set(g.p[j * 3], g.p[j * 3 + 1], g.p[j * 3 + 2]).applyMatrix4(m); this.p.push(v.x, v.y, v.z);
      v.set(g.n[j * 3], g.n[j * 3 + 1], g.n[j * 3 + 2]).applyMatrix3(nm).normalize(); this.n.push(v.x, v.y, v.z);
    }
    this.k.push(...g.k); this.f.push(...g.f);
    for (const ix of g.i) this.i.push(ix + base);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('aK', new THREE.Float32BufferAttribute(this.k, 4));
    g.setAttribute('aF', new THREE.Float32BufferAttribute(this.f, 4));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(this.count * 2), 2));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere();
    return g;
  }
}

// a box in local space: x in [-w/2, w/2], y in [y0, y1], z in [-d/2, d/2]. kSide / kTop are [kind, seed, id, lit].
// v on the sides is measured from vBase (so windows sit at real storey heights).
export function box(g, w, y0, y1, d, kSide, kTop, vBase = y0, noBottom = true) {
  const x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2, h = y1 - vBase;
  const a = y0 - vBase, b = y1 - vBase;
  // front (+z), right (+x), back (-z), left (-x): u runs left to right seen from outside
  g.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], kSide, [[0, a], [w, a], [w, b], [0, b]], w, h);
  g.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], kSide, [[0, a], [d, a], [d, b], [0, b]], d, h);
  g.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], kSide, [[0, a], [w, a], [w, b], [0, b]], w, h);
  g.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], kSide, [[0, a], [d, a], [d, b], [0, b]], d, h);
  if (kTop) g.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], kTop, [[0, 0], [w, 0], [w, d], [0, d]], w, d);
  if (!noBottom) g.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], kSide, [[0, 0], [w, 0], [w, d], [0, d]], w, d);
}
// a cylinder (n sides) radius r0 at y0 to r1 at y1, side kind; optional top cap
export function cyl(g, r0, r1, y0, y1, n, kSide, kTop = null, cx = 0, cz = 0) {
  const circ = 2 * Math.PI * (r0 + r1) / 2;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    const u0 = (i / n) * circ, u1 = ((i + 1) / n) * circ;
    const P = (a, r, y) => [cx + Math.cos(a) * r, y, cz - Math.sin(a) * r];
    g.quad(P(a0, r0, y0), P(a1, r0, y0), P(a1, r1, y1), P(a0, r1, y1), kSide, [[u0, 0], [u1, 0], [u1, y1 - y0], [u0, y1 - y0]], circ, y1 - y0);
    if (kTop) g.tri([cx, y1, cz], P(a0, r1, y1), P(a1, r1, y1), kTop, [[0, 0], [r1, 0], [r1, 1]], r1, r1);
  }
}

// ---------------------------------------------------------------- a house: white-wash walls, slate gable roof, crooked chimney
// local: front face +z, ridge along x. Ground base at y = 0, walls sunk `sink` m below for slopes.
export function house(g, o) {
  const { w, d, h, seed, lit = 0, sink = 3, idW = ID.wall, idR = ID.roof, idC = ID.chimney, pitch = 0.75, rng, wing = false } = o;
  const hip = o.hip ?? (!wing && w > d * 1.15 && rng.next() < 0.32);
  const kW = [0, seed, idW, lit], kR = [1, seed, idR, 0], kC = [2, seed, idC, 0];
  box(g, w, -sink, h, d, kW, null, 0);
  const rise = (d / 2) * pitch, ov = 0.35, oe = hip ? 0.35 : 0.3;
  const x0 = -w / 2 - oe, x1 = w / 2 + oe, zf = d / 2 + ov, zb = -d / 2 - ov, yE = h - ov * pitch, yR = h + rise;
  const slope = Math.hypot(d / 2 + ov, rise + ov * pitch);
  const t = 0.18;
  if (hip) {
    // hipped: the ridge is shorter than the house, four slopes
    const rx = Math.max(0.3, w / 2 - d / 2);
    g.quad([x0, yE, zf], [x1, yE, zf], [rx, yR, 0], [-rx, yR, 0], kR, [[0, 0], [x1 - x0, 0], [(x1 - x0) / 2 + rx, slope], [(x1 - x0) / 2 - rx, slope]], x1 - x0, slope);
    g.quad([x1, yE, zb], [x0, yE, zb], [-rx, yR, 0], [rx, yR, 0], kR, [[0, 0], [x1 - x0, 0], [(x1 - x0) / 2 + rx, slope], [(x1 - x0) / 2 - rx, slope]], x1 - x0, slope);
    g.tri([x1, yE, zf], [x1, yE, zb], [rx, yR, 0], kR, [[0, 0], [zf - zb, 0], [(zf - zb) / 2, slope]], zf - zb, slope);
    g.tri([x0, yE, zb], [x0, yE, zf], [-rx, yR, 0], kR, [[0, 0], [zf - zb, 0], [(zf - zb) / 2, slope]], zf - zb, slope);
    g.quad([x1, yE - t, zf], [x0, yE - t, zf], [x0, yE, zf], [x1, yE, zf], kR, [[0, 0], [1, 0], [1, t], [0, t]], 1, t);
    g.quad([x0, yE - t, zb], [x1, yE - t, zb], [x1, yE, zb], [x0, yE, zb], kR, [[0, 0], [1, 0], [1, t], [0, t]], 1, t);
    g.quad([x1, yE - t, zb], [x1, yE - t, zf], [x1, yE, zf], [x1, yE, zb], kR, [[0, 0], [1, 0], [1, t], [0, t]], 1, t);
    g.quad([x0, yE - t, zf], [x0, yE - t, zb], [x0, yE, zb], [x0, yE, zf], kR, [[0, 0], [1, 0], [1, t], [0, t]], 1, t);
  } else {
    // gabled: front slope and back slope (u along the ridge, v up the slope from the eave)
    g.quad([x0, yE, zf], [x1, yE, zf], [x1, yR, 0], [x0, yR, 0], kR, [[0, 0], [x1 - x0, 0], [x1 - x0, slope], [0, slope]], x1 - x0, slope);
    g.quad([x1, yE, zb], [x0, yE, zb], [x0, yR, 0], [x1, yR, 0], kR, [[0, 0], [x1 - x0, 0], [x1 - x0, slope], [0, slope]], x1 - x0, slope);
    g.quad([x1, yE - t, zf], [x0, yE - t, zf], [x0, yE, zf], [x1, yE, zf], kR, [[0, 0], [1, 0], [1, t], [0, t]], 1, t);
    g.quad([x0, yE - t, zb], [x1, yE - t, zb], [x1, yE, zb], [x0, yE, zb], kR, [[0, 0], [1, 0], [1, t], [0, t]], 1, t);
    g.tri([w / 2, h, d / 2], [w / 2, h, -d / 2], [w / 2, yR - 0.05, 0], kW, [[0, h], [d, h], [d / 2, yR]], d, h);
    g.tri([-w / 2, h, -d / 2], [-w / 2, h, d / 2], [-w / 2, yR - 0.05, 0], kW, [[0, h], [d, h], [d / 2, yR]], d, h);
    for (const sx of [-1, 1]) {
      const xx = sx * (w / 2 + oe);
      g.quad([xx, yE - t, zf], [xx, yR - t, 0], [xx, yR, 0], [xx, yE, zf], kR, [[0, 0], [1, 0], [1, 1], [0, 1]], 1, 1);
      g.quad([xx, yR - t, 0], [xx, yE - t, zb], [xx, yE, zb], [xx, yR, 0], kR, [[0, 0], [1, 0], [1, 1], [0, 1]], 1, 1);
    }
  }
  // chimneys: one or two, on the gable ends (or along the ridge of a hipped roof), each a little crooked
  const nCh = wing ? (rng.next() < 0.4 ? 1 : 0) : (rng.next() < 0.85 ? (rng.next() < 0.3 ? 2 : 1) : 0);
  const first = rng.sign();
  for (let ci = 0; ci < nCh; ci++) {
    const cg = new Geo();
    const ch = rise + 1.0 + rng.range(0.2, 1.4);
    const cw = rng.range(0.6, 0.95);
    box(cg, cw, -1.2, ch, rng.range(0.7, 1.0), kC, [7, seed, idC, 0], -1.2);
    if (rng.next() < 0.75) { cyl(cg, 0.16, 0.14, ch, ch + 0.45, 6, [7, seed, idC, 0]); if (rng.next() < 0.4) cyl(cg, 0.15, 0.13, ch, ch + 0.38, 6, [7, seed, idC, 0], 0.25 * Math.sign(rng.range(-1, 1)), 0); }
    const sx = ci === 0 ? first : -first;
    const px = hip ? sx * Math.max(0.3, w / 2 - d / 2) * 0.7 : sx * (w / 2 - 0.35);
    const m = new THREE.Matrix4().makeRotationZ(rng.range(-0.08, 0.08)).premultiply(new THREE.Matrix4().makeTranslation(px, h, rng.range(-0.6, 0.6) * (d / 4)));
    m.multiply(new THREE.Matrix4().makeRotationX(rng.range(-0.06, 0.06)));
    g.addXf(cg, m);
  }
  if (wing) return { rise };
  // a dormer on the front slope of taller houses
  if (h > 5 && !hip && rng.next() < 0.4) {
    const dg = new Geo(), dw = rng.range(1.2, 1.7), dh = 1.3;
    const zFront = d / 2 - 0.5 - (h + 0.2 > yE ? 0 : 0);
    box(dg, dw, -0.2, dh, 1.6, [0, seed, idW, 0], null, -0.2);
    const ry = dh + dw * 0.35;
    dg.quad([-dw / 2 - 0.15, dh, 0.95], [dw / 2 + 0.15, dh, 0.95], [dw / 2 + 0.15, dh, -0.8], [-dw / 2 - 0.15, dh, -0.8], kR, [[0, 0], [1, 0], [1, 1], [0, 1]], 1, 1);
    dg.quad([-dw / 2 - 0.15, dh - 0.02, 0.95], [0, ry, 0.95], [0, ry, -0.8], [-dw / 2 - 0.15, dh - 0.02, -0.8], kR, [[0, 0], [1, 0], [1, 1.5], [0, 1.5]], 1, 1.5);
    dg.quad([0, ry, 0.95], [dw / 2 + 0.15, dh - 0.02, 0.95], [dw / 2 + 0.15, dh - 0.02, -0.8], [0, ry, -0.8], kR, [[0, 0], [1, 0], [1, 1.5], [0, 1.5]], 1, 1.5);
    dg.tri([-dw / 2, dh, 0.81], [dw / 2, dh, 0.81], [0, ry - 0.05, 0.81], [0, seed, idW, 0], [[0, 0], [1, 0], [0.5, 1]], 1, 1);
    // its window
    const win = lit > 0 && rng.next() < 0.6;
    dg.quad([-0.3, 0.25, 0.82], [0.3, 0.25, 0.82], [0.3, 1.05, 0.82], [-0.3, 1.05, 0.82], [win ? 9 : 8, seed, ID.props, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], 0.6, 0.8);
    const zPos = Math.max(0.2, zFront - 1.6);
    const yPos = yR - (zPos + 0.8) / (d / 2 + ov) * (rise + ov * pitch) - 0.25;
    g.addXf(dg, new THREE.Matrix4().makeTranslation(rng.range(-w / 4, w / 4), yPos, zPos));
  }
  // a lower wing behind: an L-shaped house
  if (rng.next() < 0.38) {
    const wg = new Geo();
    const ww = rng.range(3.5, Math.max(3.6, d * 0.9)), wd = rng.range(3.5, 5), wh = Math.max(2.6, h * rng.range(0.55, 0.8));
    house(wg, { w: wd, d: ww, h: wh, seed: (seed * 7.1) % 1, lit: lit * 0.5, sink, rng, pitch: rng.range(0.55, 0.95), idW, idR, idC, wing: true });
    const sx = rng.sign();
    g.addXf(wg, new THREE.Matrix4().makeRotationY(Math.PI / 2).premultiply(new THREE.Matrix4().makeTranslation(sx * (w / 2 - ww / 2 - 0.2), 0, -d / 2 - wd / 2 + 0.3)));
  }
  // an outside stone stair up a gable end to the upper door
  if (h > 5 && !hip && rng.next() < 0.3) {
    const sx = rng.sign(), nS = 9, top = 2.7;
    for (let k = 0; k < nS; k++) {
      const sg = new Geo();
      const y1 = ((k + 1) / nS) * top;
      box(sg, 0.36, -sink, y1, 1.0, [5, seed + k * 0.01, ID.props, 0], [5, seed, ID.props, 0], -sink);
      g.addXf(sg, new THREE.Matrix4().makeTranslation(sx * (w / 2 + 0.5), 0, d / 2 - 0.5 - k * 0.36 - 0.2));
    }
    const lg = new Geo();
    box(lg, 1.1, -sink, top, 1.2, [5, seed, ID.props, 0], [5, seed, ID.props, 0], -sink);
    g.addXf(lg, new THREE.Matrix4().makeTranslation(sx * (w / 2 + 0.55), 0, d / 2 - 0.5 - nS * 0.36 - 0.6));
    const door = new Geo();
    door.quad([0, top + 0.05, 0.5], [0, top + 0.05, -0.5], [0, top + 2.0, -0.5], [0, top + 2.0, 0.5], [8, seed, ID.props, 0], [[0, 0], [1, 0], [1, 2], [0, 2]], 1, 2);
    g.addXf(door, new THREE.Matrix4().makeTranslation(sx * (w / 2 + 0.02), 0, d / 2 - 0.5 - nS * 0.36 - 0.6));
  }
  // a wall lantern by the door: a point of oil light in the alleys
  if (rng.next() < 0.22) {
    const lg = new Geo();
    box(lg, 0.24, 2.3, 2.62, 0.24, [9, seed, ID.props, 0], [4, seed, ID.iron, 0], 2.3);
    box(lg, 0.05, 2.62, 2.7, 0.35, [4, seed, ID.iron, 0], [4, seed, ID.iron, 0], 2.62);
    const lx = rng.range(-w / 3, w / 3);
    g.addXf(lg, new THREE.Matrix4().makeTranslation(lx, 0, d / 2 + 0.2));
    if (o.lights) o.lights.push(new THREE.Vector3(lx, 2.46, d / 2 + 0.2));
  }
  return { rise, hip };
}

// ---------------------------------------------------------------- the village
export function buildVillage(M, seed = 7) {
  const rng = new Rng(seed);
  const near = new Geo();
  const houses = [], lanterns = [];
  const BC = [-10, 14];
  const taken = [];
  // the waterfront: a near-continuous row of two- and three-storey houses along the north quay, broken by alleys
  {
    let a = 0.22;
    while (a < Math.PI - 0.22) {
      const ex = -10 + Math.cos(a) * 168, ez = 14 + Math.sin(a) * 122;
      const nx = Math.cos(a) / 168, nz = Math.sin(a) / 122, nl = Math.hypot(nx, nz);
      const ox = nx / nl, oz = nz / nl;
      const w = rng.range(5.2, 8.0), d = rng.range(6.0, 7.5);
      let k = 0, px = ex, pz = ez;
      while (k < 80 && M.coast(px, pz) < 11 + d / 2) { px += ox * 0.5; pz += oz * 0.5; k++; }
      const tang = Math.hypot(Math.sin(a) * 168, Math.cos(a) * 122);
      const step = (w + (rng.next() < 0.22 ? rng.range(2, 4) : 0.05)) / tang;
      a += step;
      if (Math.abs(px - PIER.from[0]) < 9 || pz < 30 || M.village(px, pz) < 0.3) continue;
      // the row is not ruled: houses step back, turn a little, and the odd one stands proud of the line
      const back = rng.next() < 0.25 ? rng.range(1.5, 3.5) : rng.range(0, 0.8);
      px += ox * back; pz += oz * back;
      const yaw = Math.atan2(-ox, -oz) + rng.range(-0.07, 0.07);
      const lo = Math.max(QUAY_Y, M.terrainY(px - ox * d / 2, pz - oz * d / 2));
      const storeys = rng.next() < 0.6 ? 2 : 3;
      const h = storeys === 3 ? rng.range(7.6, 8.8) : rng.range(5.0, 6.4);
      const lit = rng.next() < 0.45 ? rng.range(0.3, 0.6) : 0;
      const hg = new Geo(), lights = [];
      house(hg, { w: w + 0.1, d, h, seed: rng.next(), lit, sink: 3, rng, pitch: rng.range(0.55, 1.0), lights });
      const mm = new THREE.Matrix4().makeRotationY(yaw).premultiply(new THREE.Matrix4().makeTranslation(px, lo, pz));
      near.addXf(hg, mm);
      for (const l of lights) lanterns.push(l.applyMatrix4(mm));
      houses.push({ x: px, z: pz, y: lo, yaw, w, d, h, lit });
      taken.push([px, pz, Math.max(w, d) * 0.55]);
    }
  }
  // lanes: three stepped alleys wind up the hill from the quay, lamp posts along them
  const lanes = [];
  for (const [a0, wig] of [[0.95, 1], [1.55, -1], [2.2, 1], [0.45, -1], [2.65, 1]]) {
    const pts = [];
    let x = -10 + Math.cos(a0) * 175, z = 14 + Math.sin(a0) * 128;
    const dx0 = Math.cos(a0) / 168, dz0 = Math.sin(a0) / 122, l0 = Math.hypot(dx0, dz0);
    for (let k = 0; k < 44; k++) {
      pts.push([x, z]);
      const ang = Math.atan2(dz0 / l0, dx0 / l0) + wig * 0.45 * Math.sin(k * 0.35 + a0 * 3);
      x += Math.cos(ang) * 5; z += Math.sin(ang) * 5;
      if (M.village(x, z) < 0.3) break;
    }
    lanes.push(pts);
  }
  const laneDist = (x, z) => { let d = 1e9; for (const L of lanes) for (let i = 0; i < L.length - 1; i++) { const [ax, az] = L[i], [bx, bz] = L[i + 1]; const ddx = bx - ax, ddz = bz - az, ll = ddx * ddx + ddz * ddz || 1; const t = Math.min(1, Math.max(0, ((x - ax) * ddx + (z - az) * ddz) / ll)); d = Math.min(d, Math.hypot(x - ax - t * ddx, z - az - t * ddz)); } return d; };
  for (const L of lanes) for (let i = 3; i < L.length; i += 5) {
    const [x, z] = L[i];
    const nx = L[Math.min(L.length - 1, i + 1)][0] - L[i - 1][0], nz = L[Math.min(L.length - 1, i + 1)][1] - L[i - 1][1], nl = Math.hypot(nx, nz) || 1;
    const px = x + (nz / nl) * 2.2, pz = z - (nx / nl) * 2.2, y = M.terrainY(px, pz);
    const lg = new Geo();
    cyl(lg, 0.15, 0.15, 0, 0.35, 6, [4, 0.1, ID.iron, 0], [4, 0.1, ID.iron, 0]);
    cyl(lg, 0.06, 0.05, 0.35, 3.2, 5, [4, 0.1, ID.iron, 0], null);
    box(lg, 0.32, 3.2, 3.62, 0.32, [9, rng.next(), ID.props, 0], [4, 0, ID.iron, 0], 3.2);
    near.addXf(lg, new THREE.Matrix4().makeTranslation(px, y, pz));
    lanterns.push(new THREE.Vector3(px, y + 3.42, pz));
  }
  const cand = [];
  for (let z = -60; z < 360; z += 5) for (let x = -300; x < 310; x += 5) cand.push([x + rng.range(-2.5, 2.5), z + rng.range(-2.5, 2.5)]);
  // shuffle so the fill is even
  for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; }
  for (const [x, z] of cand) {
    if (M.village(x, z) < 0.6) continue;
    if (M.coast(x, z) < 9) continue;
    if (pathDist(x, z) < 6) continue;
    if (laneDist(x, z) < 6.5) continue;
    // clumps and gaps: little closes of houses with kitchen gardens and rough grass between
    const clump = fbm(x * 0.022 + 3, z * 0.022 + 11, 3);
    if (clump < 0.4) continue;
    if (Math.abs(x - PIER.from[0]) < 12 && z < PIER.from[2] + 14) continue;
    const y = M.terrainY(x, z);
    if (y > 66 || y < QUAY_Y - 0.1) continue;
    const yaw = Math.atan2(BC[0] - x, BC[1] - z) + rng.range(-0.25, 0.25);   // front (+z local) toward the basin
    const w = rng.range(5.5, 9.5), d = rng.range(4.8, 6.4);
    // the tread must hold the footprint: sample corners
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    let lo = 1e9, hi = -1e9;
    for (const [lx, lz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2], [0, 0]]) {
      const wx = x + lx * cs + lz * sn, wz = z - lx * sn + lz * cs;
      const hh = M.terrainY(wx, wz); lo = Math.min(lo, hh); hi = Math.max(hi, hh);
    }
    if (hi - lo > 4.2) continue;
    const r = Math.max(w, d) * 0.62 + (clump > 0.56 ? 0.6 : 1.8);
    if (taken.some(([tx, tz, tr]) => Math.hypot(tx - x, tz - z) < tr + r)) continue;
    taken.push([x, z, r]);
    const storeys = y < 12 && rng.next() < 0.5 ? 2 : (rng.next() < 0.25 ? 2 : 1);
    const h = storeys === 2 ? rng.range(5.4, 6.2) : rng.range(3.1, 3.7);
    const lit = rng.next() < 0.32 ? rng.range(0.35, 0.7) : 0;
    const base = (hi - lo > 2.6 ? lo + 0.5 * (hi - lo) : hi) - 0.05;
    const hg = new Geo(), lights = [];
    house(hg, { w, d, h, seed: rng.next(), lit, sink: base - lo + 2.5, rng, pitch: rng.range(0.48, 1.05), lights });
    const m = new THREE.Matrix4().makeRotationY(yaw).premultiply(new THREE.Matrix4().makeTranslation(x, base, z));
    near.addXf(hg, m);
    for (const l of lights) lanterns.push(l.applyMatrix4(m));
    houses.push({ x, z, y: base, yaw, w, d, h, lit });
  }
  return { geo: near.build(), houses, lanterns };
}

// ---------------------------------------------------------------- the keeper's cottage
export function buildCottage(M, g) {
  const rng = new Rng(31);
  const [cx, , cz] = COTTAGE.pos, yaw = COTTAGE.yaw;
  const y = Math.max(M.terrainY(cx - 4, cz), M.terrainY(cx + 4, cz), M.terrainY(cx, cz - 3), M.terrainY(cx, cz + 3)) + 0.25;
  const hg = new Geo();
  const W = 9.5, D = 6.2, H = 3.3;
  // a stone plinth course, then the house; the kitchen window (front, right) is lit
  house(hg, { w: W, d: D, h: H, seed: 0.37, lit: 0.85, sink: 1.5, rng, idW: ID.cottage, idR: ID.cottageRoof, pitch: 0.8 });
  box(hg, W + 0.3, -0.6, 0.45, D + 0.3, [7, 0.4, ID.props, 0], [7, 0.4, ID.props, 0], -0.6);
  // a lean-to store on the left gable
  const lg = new Geo();
  box(lg, 2.6, -1, 2.2, 4.2, [0, 0.61, ID.cottage, 0], null, 0);
  lg.quad([-1.5, 2.0, 2.3], [1.5, 2.6, 2.3], [1.5, 2.6, -2.3], [-1.5, 2.0, -2.3], [1, 0.61, ID.cottageRoof, 0], [[0, 0], [3, 0], [3, 4.6], [0, 4.6]], 3, 4.6);
  hg.addXf(lg, new THREE.Matrix4().makeTranslation(-W / 2 - 1.3, 0, -0.6));
  // door step and the porch lamp bracket
  const step = new Geo(); box(step, 1.6, -0.3, 0.18, 0.7, [7, 0.2, ID.props, 0], [7, 0.2, ID.props, 0], -0.3);
  hg.addXf(step, new THREE.Matrix4().makeTranslation(0, 0, D / 2 + 0.35));
  const m = new THREE.Matrix4().makeRotationY(yaw).premultiply(new THREE.Matrix4().makeTranslation(cx, y, cz));
  g.addXf(hg, m);
  // door: the house shader puts a door where it likes; the cottage door is drawn as a separate panel on the front face, centre
  const dg = new Geo();
  dg.quad([-0.55, 0.15, D / 2 + 0.03], [0.55, 0.15, D / 2 + 0.03], [0.55, 2.15, D / 2 + 0.03], [-0.55, 2.15, D / 2 + 0.03], [8, 0.5, ID.props, 0], [[0, 0], [1.1, 0], [1.1, 2], [0, 2]], 1.1, 2);
  const lamp = new Geo();
  box(lamp, 0.28, 2.35, 2.75, 0.28, [9, 0.3, ID.props, 0], [4, 0.3, ID.iron, 0], 2.35);
  dg.addXf(lamp, new THREE.Matrix4().makeTranslation(0.95, 0, D / 2 + 0.25));
  g.addXf(dg, m);
  const door = new THREE.Vector3(0, 0.15, D / 2 + 0.6).applyMatrix4(m);
  const lampP = new THREE.Vector3(0.95, 2.55, D / 2 + 0.25).applyMatrix4(m);
  // the dry-stone yard wall, a low ring of piled stones south of the cottage toward the cliff
  const wallPts = [];
  for (let i = 0; i <= 26; i++) {
    const a = -0.2 + (i / 26) * 2.6;
    wallPts.push([cx + Math.cos(a + yaw) * 13, cz - Math.sin(a + yaw) * 11]);
  }
  for (let i = 0; i < wallPts.length - 1; i++) {
    const [ax, az] = wallPts[i], [bx, bz] = wallPts[i + 1];
    const mx = (ax + bx) / 2, mz = (az + bz) / 2, L = Math.hypot(bx - ax, bz - az);
    if (pathDist(mx, mz) < 2) continue;
    const wg = new Geo();
    box(wg, L + 0.1, -0.5, 0.75 + 0.15 * Math.sin(i * 2.1), 0.55, [5, i * 0.13, ID.props, 0], [5, i * 0.13, ID.props, 0], -0.5);
    g.addXf(wg, new THREE.Matrix4().makeRotationY(Math.atan2(-(bz - az), bx - ax)).premultiply(new THREE.Matrix4().makeTranslation(mx, M.terrainY(mx, mz), mz)));
  }
  return { door, lampP, y, m };
}

// ---------------------------------------------------------------- the tower: tapered white stone, one oxide-red band, black iron gallery
export function buildTower(g) {
  const [tx, ty, tz] = TOWER.base;
  const yTop = LAMPROOM.floorY;   // 68
  const shaftTop = yTop - 2.2;    // corbels from here
  const N = 40;
  const doorAng = Math.atan2(-(COTTAGE.pos[2] - tz), COTTAGE.pos[0] - tx);   // cyl() uses z = -sin
  const doorFrac = ((doorAng / (Math.PI * 2)) % 1 + 1) % 1;
  // shaft: rings so the taper is smooth; the shader paints the band and the windows using u = circumference metres, v = height
  const rings = 14;
  const CU = 2 * Math.PI * (TOWER.radiusBase + TOWER.radiusTop) / 2;   // one circumference for the painted u, so windows stay true
  const rAt = (y) => TOWER.radiusBase + (TOWER.radiusTop - TOWER.radiusBase) * ((y - ty) / (shaftTop - ty));
  for (let r = 0; r < rings; r++) {
    const y0 = ty - 1 + (r / rings) * (shaftTop - ty + 1), y1 = ty - 1 + ((r + 1) / rings) * (shaftTop - ty + 1);
    const r0 = rAt(y0), r1 = rAt(y1);
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
      const c0 = 2 * Math.PI * r0, c1 = 2 * Math.PI * r1;
      const P = (a, rr, y) => [tx + Math.cos(a) * rr, y, tz - Math.sin(a) * rr];
      const k = [3, 0.21, ID.tower, doorFrac];
      g.quad(P(a0, r0, y0), P(a1, r0, y0), P(a1, r1, y1), P(a0, r1, y1), k,
        [[(i / N) * CU, y0 - ty], [((i + 1) / N) * CU, y0 - ty], [((i + 1) / N) * CU, y1 - ty], [(i / N) * CU, y1 - ty]], CU, shaftTop - ty);
    }
  }
  // plinth of dark dressed stone
  cyl(g, 5.5, 5.3, ty - 1.5, ty + 0.9, N, [5, 0.33, ID.props, 0], [5, 0.33, ID.props, 0], tx, tz);
  // corbel ring flaring out under the gallery, painted white; then the iron deck
  cyl(g, TOWER.radiusTop, 4.75, shaftTop, yTop - 0.45, N, [3, 0.4, ID.band, -1], null, tx, tz);
  // stone corbel blocks under the gallery overhang
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    const bg = new Geo();
    box(bg, 0.95, -1.15, -0.4, 0.36, [3, 0.4 + i * 0.01, ID.band, -1], [3, 0.4, ID.band, -1], -1.15);
    const m = new THREE.Matrix4().makeRotationY(a).premultiply(new THREE.Matrix4().makeTranslation(tx + Math.cos(a) * 4.7, yTop, tz - Math.sin(a) * 4.7));
    g.addXf(bg, m);
  }
  cyl(g, 4.75, 4.75, yTop - 0.45, yTop - 0.4, N, [7, 0.4, ID.band, 0], null, tx, tz);
  cyl(g, 5.35, 5.35, yTop - 0.4, yTop, N, [4, 0.4, ID.iron, 0], [4, 0.4, ID.iron, 0], tx, tz);
  // underside of the deck overhang
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
    const P = (a, rr, y) => [tx + Math.cos(a) * rr, y, tz - Math.sin(a) * rr];
    g.quad(P(a0, 5.35, yTop - 0.4), P(a0, 4.75, yTop - 0.4), P(a1, 4.75, yTop - 0.4), P(a1, 5.35, yTop - 0.4), [4, 0.4, ID.iron, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], 1, 1);
  }
  // gallery railing: posts, a top rail and a mid rail
  const R = 5.2, NP = 36;
  for (let i = 0; i < NP; i++) {
    const a = (i / NP) * Math.PI * 2;
    const pg = new Geo();
    box(pg, 0.07, 0, 1.12, 0.07, [4, i * 0.1, ID.iron, 0], [4, 0, ID.iron, 0], 0);
    if (i % 3 === 0) cyl(pg, 0.06, 0.06, 1.12, 1.24, 5, [4, 0, ID.iron, 0], [4, 0, ID.iron, 0]);
    g.addXf(pg, new THREE.Matrix4().makeTranslation(tx + Math.cos(a) * R, yTop, tz - Math.sin(a) * R));
  }
  for (const [ry, hh] of [[1.08, 0.08], [0.55, 0.04]]) {
    for (let i = 0; i < NP; i++) {
      const a0 = (i / NP) * Math.PI * 2, a1 = ((i + 1) / NP) * Math.PI * 2;
      const x0 = tx + Math.cos(a0) * R, z0 = tz - Math.sin(a0) * R, x1 = tx + Math.cos(a1) * R, z1 = tz - Math.sin(a1) * R;
      const rg = new Geo();
      const L = Math.hypot(x1 - x0, z1 - z0);
      box(rg, L + 0.02, ry, ry + hh, 0.06, [4, 0.5, ID.iron, 0], [4, 0.5, ID.iron, 0], ry);
      g.addXf(rg, new THREE.Matrix4().makeRotationY(Math.atan2(-(z1 - z0), x1 - x0)).premultiply(new THREE.Matrix4().makeTranslation((x0 + x1) / 2, yTop, (z0 + z1) / 2)));
    }
  }
  const door = new THREE.Vector3(tx + Math.cos(doorAng) * (TOWER.radiusBase + 0.6), ty, tz - Math.sin(doorAng) * (TOWER.radiusBase + 0.6));
  return { door, doorAng };
}

// ---------------------------------------------------------------- the pier and its furniture
export function buildPier(M, g) {
  const rng = new Rng(77);
  const x = PIER.to[0], w = PIER.width, top = PIER.from[1];
  const z0 = PIER.to[2], z1 = PIER.from[2] + 4;
  const L = z1 - z0;
  // the mole: battered stone sides down to the sea bed, a coping course on top
  const pg = new Geo();
  const yb = -9, bat = 0.9;
  const k = [5, 0.1, ID.pier, 0];
  // west side, east side (u along the pier, v up from the bottom)
  pg.quad([-w / 2 - bat, yb, -L / 2], [-w / 2 - bat, yb, L / 2], [-w / 2, top, L / 2], [-w / 2, top, -L / 2], k, [[0, yb], [L, yb], [L, top], [0, top]], L, top - yb);
  pg.quad([w / 2 + bat, yb, L / 2], [w / 2 + bat, yb, -L / 2], [w / 2, top, -L / 2], [w / 2, top, L / 2], k, [[0, yb], [L, yb], [L, top], [0, top]], L, top - yb);
  // the deck
  pg.quad([-w / 2, top, L / 2], [w / 2, top, L / 2], [w / 2, top, -L / 2], [-w / 2, top, -L / 2], [5, 0.2, ID.pier, 0], [[0, L], [w, L], [w, 0], [0, 0]], w, L);
  // coping lips along both edges (a slightly raised kerb of big stones)
  for (const s of [-1, 1]) {
    const cg = new Geo();
    box(cg, 0.55, top - 0.3, top + 0.22, L, [5, 0.3, ID.props, 0], [5, 0.3, ID.props, 0], top - 0.3);
    pg.addXf(cg, new THREE.Matrix4().makeTranslation(s * (w / 2 - 0.27), 0, 0));
  }
  g.addXf(pg, new THREE.Matrix4().makeTranslation(x, 0, (z0 + z1) / 2));
  // the round pier head
  cyl(g, 5.2 + bat, 5.2, yb, top, 28, [5, 0.6, ID.pier, 0], [5, 0.7, ID.pier, 0], x, z0);
  cyl(g, 5.25, 5.25, top - 0.3, top + 0.22, 28, [5, 0.8, ID.props, 0], [5, 0.8, ID.props, 0], x, z0);
  const lamps = [], bollards = [];
  // bollards on both edges every ~14 m, iron ladders, lamp posts every ~45 m on the east edge
  for (let zz = z0 + 6; zz < z1 - 6; zz += 14) {
    for (const s of [-1, 1]) {
      const bg = new Geo();
      cyl(bg, 0.26, 0.22, 0, 0.62, 8, [4, rng.next(), ID.iron, 0], null);
      cyl(bg, 0.34, 0.34, 0.62, 0.72, 8, [4, 0.2, ID.iron, 0], [4, 0.2, ID.iron, 0]);
      g.addXf(bg, new THREE.Matrix4().makeTranslation(x + s * (w / 2 - 0.9), top + 0.22, zz + rng.range(-1, 1)));
      bollards.push([x + s * (w / 2 - 0.9), top, zz]);
    }
  }
  for (let zz = z0 + 12; zz < z1 - 10; zz += 22) {
    for (const s of [-1, 1]) {
      const lg = new Geo();
      // the rails stand off the wall; rungs between
      for (let r = -5.6; r < 0.6; r += 0.32) { const rg = new Geo(); box(rg, 0.44, r, r + 0.04, 0.04, [4, 0.3, ID.iron, 0], [4, 0, ID.iron, 0], r); lg.addXf(rg, new THREE.Matrix4()); }
      const lg2 = new Geo();
      for (const sx of [-0.22, 0.22]) { const rr = new Geo(); box(rr, 0.06, -6, 0.9, 0.06, [4, 0.3, ID.iron, 0], [4, 0, ID.iron, 0], -6); lg2.addXf(rr, new THREE.Matrix4().makeTranslation(sx, 0, 0)); }
      lg2.addXf(lg, new THREE.Matrix4());
      g.addXf(lg2, new THREE.Matrix4().makeRotationY(Math.PI / 2).premultiply(new THREE.Matrix4().makeTranslation(x + s * (w / 2 + 0.55), top, zz + 5)));
    }
  }
  const post = (px, pz, hgt = 4.2) => {
    const lg = new Geo();
    cyl(lg, 0.2, 0.2, 0, 0.5, 8, [4, 0.1, ID.iron, 0], [4, 0.1, ID.iron, 0]);
    cyl(lg, 0.08, 0.07, 0.5, hgt, 6, [4, 0.1, ID.iron, 0], null);
    box(lg, 0.42, hgt, hgt + 0.55, 0.42, [9, rng.next(), ID.props, 0], null, hgt);
    // a little pyramid cap
    lg.tri([-0.3, hgt + 0.55, 0.3], [0.3, hgt + 0.55, 0.3], [0, hgt + 0.85, 0], [4, 0, ID.iron, 0], [[0, 0], [1, 0], [0.5, 1]], 1, 1);
    lg.tri([0.3, hgt + 0.55, 0.3], [0.3, hgt + 0.55, -0.3], [0, hgt + 0.85, 0], [4, 0, ID.iron, 0], [[0, 0], [1, 0], [0.5, 1]], 1, 1);
    lg.tri([0.3, hgt + 0.55, -0.3], [-0.3, hgt + 0.55, -0.3], [0, hgt + 0.85, 0], [4, 0, ID.iron, 0], [[0, 0], [1, 0], [0.5, 1]], 1, 1);
    lg.tri([-0.3, hgt + 0.55, -0.3], [-0.3, hgt + 0.55, 0.3], [0, hgt + 0.85, 0], [4, 0, ID.iron, 0], [[0, 0], [1, 0], [0.5, 1]], 1, 1);
    g.addXf(lg, new THREE.Matrix4().makeTranslation(px, top + 0.22, pz));
    lamps.push([px, top + 0.22 + hgt + 0.3, pz]);
  };
  for (let zz = z0 + 30; zz < z1 - 20; zz += 48) post(x + w / 2 - 0.5, zz);
  post(x, z0, 5.2);   // the pier-head lamp
  // gear on the deck: fish boxes, net heaps, lobster pots, coiled rope
  for (let i = 0; i < 26; i++) {
    const zz = rng.range(z0 + 8, z1 - 12), s = rng.sign();
    const px = x + s * rng.range(0.6, 1.9);
    const t = rng.next();
    const gg = new Geo();
    if (t < 0.45) {
      const n = rng.int(1, 3);
      for (let j = 0; j < n; j++) { const bb = new Geo(); box(bb, 1.0, 0, 0.42, 0.65, [6, rng.next(), ID.props, 0], [6, rng.next(), ID.props, 0], 0); gg.addXf(bb, new THREE.Matrix4().makeRotationY(rng.range(-0.3, 0.3)).premultiply(new THREE.Matrix4().makeTranslation(rng.range(-0.1, 0.1), j * 0.42, rng.range(-0.1, 0.1)))); }
    } else if (t < 0.75) {
      cyl(gg, 0.95, 0.35, 0, 0.55, 9, [10, rng.next(), ID.props, 0], [10, 0.1, ID.props, 0]);
    } else {
      cyl(gg, 0.42, 0.42, 0, 0.5, 8, [6, rng.next(), ID.props, 0], [10, 0.1, ID.props, 0]);
    }
    g.addXf(gg, new THREE.Matrix4().makeRotationY(rng.range(0, 6)).premultiply(new THREE.Matrix4().makeTranslation(px, top + 0.22, zz)));
  }
  return { lamps, bollards, end: new THREE.Vector3(x, top + 0.22, z0) };
}

// ---------------------------------------------------------------- quay lamps along the north quay
export function buildQuay(M, g) {
  const lamps = [];
  const rng = new Rng(5);
  for (let i = 0; i < 9; i++) {
    const a = 0.38 + i * 0.29;      // round the north shore
    let x = -10 + Math.cos(a) * 168, z = 14 + Math.sin(a) * 122;
    // walk inland until on the quay tread
    for (let k = 0; k < 40 && M.coast(x, z) < 3.5; k++) { x += Math.cos(a) * 1; z += Math.sin(a) * 1; }
    if (Math.abs(x + 20) < 8) continue;
    const y = M.terrainY(x, z);
    if (Math.abs(y - QUAY_Y) > 0.6) continue;
    const lg = new Geo();
    cyl(lg, 0.18, 0.18, 0, 0.4, 8, [4, 0.1, ID.iron, 0], [4, 0.1, ID.iron, 0]);
    cyl(lg, 0.07, 0.06, 0.4, 3.6, 6, [4, 0.1, ID.iron, 0], null);
    box(lg, 0.38, 3.6, 4.1, 0.38, [9, rng.next(), ID.props, 0], [4, 0, ID.iron, 0], 3.6);
    g.addXf(lg, new THREE.Matrix4().makeTranslation(x, y, z));
    lamps.push([x, y + 3.85, z]);
  }
  return lamps;
}

// ---------------------------------------------------------------- reef teeth: jagged basalt stacks, faceted columns
export function buildTeeth() {
  // one geometry per cluster: faceted prisms (flat normals) on a low wave-cut base
  return CLUSTERS.map((C) => {
    const g = new Geo();
    const K = [0, 0, 0, 0];
    for (const c of C.cols) {
      const top = (dx, dz) => c.h - c.tilt * (Math.cos(c.ta) * dx + Math.sin(c.ta) * dz);
      const hb = c.h > 7 ? c.h * (0.35 + 0.35 * ((c.tone * 7.3) % 1)) : -1;   // a break: the column above steps in
      const segs = hb > 0 ? [[-6, hb, c.r], [hb, null, c.r * 0.9]] : [[-6, null, c.r]];
      for (const [y0, y1, r] of segs) {
        const P = [];
        for (let k = 0; k < c.sides; k++) {
          const a0 = c.rot + (k / c.sides) * Math.PI * 2;
          const dx = Math.cos(a0) * r, dz = Math.sin(a0) * r;
          const yy = y1 == null ? top(dx, dz) : y1;
          // columns converge toward the fang's point as they rise
          const kc = C.conv * Math.max(0, yy) / C.H;
          P.push([dx + (C.px - c.x) * kc, dz + (C.pz - c.z) * kc, yy]);
        }
        for (let k = 0; k < c.sides; k++) {
          const [ax, az, ay] = P[k], [bx, bz, by] = P[(k + 1) % c.sides];
          const k0 = C.conv * Math.max(0, y0) / C.H, ox = (C.px - c.x) * k0, oz = (C.pz - c.z) * k0;
          const ka = C.conv * Math.max(0, ay) / C.H, kb = C.conv * Math.max(0, by) / C.H;
          const ax0 = ax - (C.px - c.x) * ka + ox, az0 = az - (C.pz - c.z) * ka + oz, bx0 = bx - (C.px - c.x) * kb + ox, bz0 = bz - (C.pz - c.z) * kb + oz;
          g.quad([c.x + ax0, y0, c.z + az0], [c.x + ax, ay, c.z + az], [c.x + bx, by, c.z + bz], [c.x + bx0, y0, c.z + bz0], K, [[0, 0], [0, 1], [1, 1], [1, 0]], 1, 1);
        }
        // top (or the ledge ring at the break): a fan
        const cy = P.reduce((s2, p) => s2 + p[2], 0) / c.sides;
        for (let k = 0; k < c.sides; k++) {
          const [ax, az, ay] = P[k], [bx, bz, by] = P[(k + 1) % c.sides];
          g.tri([c.x, cy, c.z], [c.x + bx, by, c.z + bz], [c.x + ax, ay, c.z + az], K, [[0, 0], [1, 0], [0, 1]], 1, 1);
        }
      }
    }
    // the base: a rough disc
    const NR = 10, NA = 48;
    const ring = (i, k) => {
      const a0 = (k / NA) * Math.PI * 2, rr = (i / NR) * C.R * 1.35;
      const jit = 1 + 0.12 * Math.sin(a0 * 5 + C.seed) + 0.06 * Math.sin(a0 * 13);
      const x = C.x + Math.cos(a0) * rr * C.ex * jit, z = C.z + Math.sin(a0) * rr * C.ez * jit;
      const y = 1.6 * (1 - Math.pow(i / NR, 2)) - 1.2 + (i > 0 && i < NR ? Math.sin(a0 * 9 + i * 2.1) * 0.35 : 0) - (i === NR ? 4 : 0);
      return [x, y, z];
    };
    for (let i = 0; i < NR; i++) for (let k = 0; k < NA; k++) {
      g.quad(ring(i, k), ring(i + 1, k), ring(i + 1, k + 1), ring(i, k + 1), K, [[0, 0], [1, 0], [1, 1], [0, 1]], 1, 1);
    }
    const geo = g.build();
    geo.computeBoundingSphere();
    return { name: C.name, geo };
  });
}

// ---------------------------------------------------------------- boulders: talus at the cliff feet, reef rocks awash between the teeth and the shore
export function buildBoulders(M) {
  const rng = new Rng(404);
  const list = [];
  // reef rocks from each tooth toward the nearer shore, awash
  for (const [a, b, n] of [[[-66, -272], [-90, -276], 7], [[66, -275], [102, -296], 12]]) {
    for (let i = 0; i < n; i++) {
      const t = rng.next();
      const x = a[0] + (b[0] - a[0]) * t + rng.range(-5, 5), z = a[1] + (b[1] - a[1]) * t + rng.range(-6, 6);
      list.push([x, rng.range(-2.5, 0.5), z, rng.range(2, 5.5)]);
    }
  }
  // talus along the foot of the cliffs and the outer shore (coast distance ~0..4)
  for (let i = 0; i < 2600 && list.length < 260; i++) {
    const x = rng.range(-440, 370), z = rng.range(-400, 600);
    const c = M.coast(x, z);
    if (c < -6 || c > 2.5) continue;
    if (z > -40 && Math.abs(x + 10) < 175) continue;   // not in the village basin (quays)
    list.push([x, rng.range(-2.5, 0.2), z, rng.range(1.4, 4.5)]);
  }
  const pos = [];
  const ico = new THREE.IcosahedronGeometry(1, 1).toNonIndexed();
  const ip = ico.attributes.position;
  for (const [x, y, z, r] of list) {
    const sx = r * rng.range(0.8, 1.4), sy = r * rng.range(0.5, 0.9), sz = r * rng.range(0.8, 1.3), ry = rng.range(0, 6);
    const cs = Math.cos(ry), sn = Math.sin(ry);
    const jit = [];
    for (let k = 0; k < ip.count; k++) {
      const px = ip.getX(k), py = ip.getY(k), pz = ip.getZ(k);
      const key = `${px.toFixed(3)},${py.toFixed(3)},${pz.toFixed(3)}`;
      if (!jit[key]) jit[key] = 0.8 + 0.35 * rng.next();
      const j = jit[key];
      const lx = px * sx * j, ly = py * sy * j, lz = pz * sz * j;
      pos.push(x + lx * cs + lz * sn, y + ly, z - lx * sn + lz * cs);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
  g.computeBoundingSphere();
  return g;
}

// ---------------------------------------------------------------- terrain grid: 2 m in the core, growing outward
export const PATCH = { x0: 60, x1: 262, z0: -418, z1: -200, step: 1 };   // the 1 m headland patch (s13 sits on its lip)
// basalt cliffs: push steep points in and out along the outward horizontal in vertical flutes (columns), stepped where the
// columns broke, so the cliff edge and face have a real profile. Resolution independent (same at 1 m and 2 m).
const _hs = (a, b) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };
function cliffOffset(M, x, y, z) {
  if (y < -3 || Math.abs(x) > 700 || Math.abs(z) > 700) return null;
  const e = 1.5;
  const gx = (M.terrainY(x + e, z) - M.terrainY(x - e, z)) / (2 * e), gz = (M.terrainY(x, z + e) - M.terrainY(x, z - e)) / (2 * e);
  const ny = 1 / Math.sqrt(1 + gx * gx + gz * gz);
  const steep = Math.min(1, Math.max(0, (0.75 - ny) / 0.4));
  if (steep <= 0) return null;
  const hl = Math.hypot(gx, gz) || 1;
  const nx = -gx / hl, nz = -gz / hl;          // outward, downhill
  const t = x * -nz + z * nx;                  // along the cliff
  const col = Math.floor(t / 2.6), cf = t / 2.6 - col;
  const prot = (_hs(col, 3.1) - 0.5) * 2.2 * (1 - 0.6 * Math.abs(cf - 0.5));
  const tier = Math.floor((y + _hs(col, 7) * 6) / 7);
  const brk = (_hs(col, tier) - 0.5) * 1.6;
  // only below the lip: the top edge itself stays where the terrain puts it (no saw-tooth)
  const inland = M.terrainY(x - nx * 2.5, z - nz * 2.5);
  const below = Math.min(1, Math.max(0, (inland - y - 1.2) / 3));
  const off = (prot + brk + (fbm(x * 0.03, z * 0.03, 2) - 0.5) * 6) * steep * below;
  return [nx * off, nz * off];
}
function gridGeo(M, xs, zs) {
  const W = xs.length, Hn = zs.length;
  const pos = new Float32Array(W * Hn * 3), idx = [];
  for (let j = 0; j < Hn; j++) for (let i = 0; i < W; i++) {
    const k = (j * W + i) * 3, x = xs[i], z = zs[j], y = M.terrainY(x, z);
    const o = cliffOffset(M, x, y, z);
    pos[k] = x + (o ? o[0] : 0); pos[k + 1] = y; pos[k + 2] = z + (o ? o[1] : 0);
  }
  for (let j = 0; j < Hn - 1; j++) for (let i = 0; i < W - 1; i++) {
    const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
    if (Math.max(pos[a * 3 + 1], pos[b * 3 + 1], pos[c * 3 + 1], pos[d * 3 + 1]) < -12) continue;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(W * Hn * 2), 2));
  g.setIndex(new THREE.Uint32BufferAttribute(idx, 1));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}
export function terrainGrid(M) {
  const near = (a0, a1, s, far, lim) => { const out = []; for (let v = a0; v <= a1; v += s) out.push(v); let v = a1, st = s; while (v < lim) { st *= 1.1; v += Math.min(st, far); out.push(v); } v = a0; st = s; while (v > -lim) { st *= 1.1; v -= Math.min(st, far); out.push(v); } return out.sort((a, b) => a - b); };
  return gridGeo(M, near(-490, 440, 2, 40, 1600), near(-420, 680, 2, 40, 1600));
}
export function terrainPatch(M) {
  const xs = [], zs = [];
  for (let x = PATCH.x0; x <= PATCH.x1 + 1e-6; x += PATCH.step) xs.push(x);
  for (let z = PATCH.z0; z <= PATCH.z1 + 1e-6; z += PATCH.step) zs.push(z);
  return gridGeo(M, xs, zs);
}

// grass tufts on the headland plateau and the ridge
const flatEnough = (M, x, z, lim = 0.55) => {
  const gx = (M.terrainY(x + 0.8, z) - M.terrainY(x - 0.8, z)) / 1.6, gz = (M.terrainY(x, z + 0.8) - M.terrainY(x, z - 0.8)) / 1.6;
  return Math.hypot(gx, gz) < lim;
};
export function grassList(M) {
  const rng = new Rng(55);
  const out = [];
  for (let i = 0; i < 60000 && out.length < 9000; i++) {
    const x = PLATEAU.x + rng.range(-95, 85), z = PLATEAU.z + rng.range(-85, 140);
    if (M.plateau(x, z) < 0.5 && M.terrainY(x, z) < 24) continue;
    if (M.coast(x, z) < 1.5) continue;
    if (pathDist(x, z) < 1.4) continue;
    if (Math.hypot(x - TOWER.base[0], z - TOWER.base[2]) < 6.5) continue;
    const dc = Math.hypot(x - COTTAGE.pos[0], z - COTTAGE.pos[2]);
    if (dc < 8) continue;
    // patchy: denser in clumps
    if (rng.next() > 0.35 + 0.65 * Math.max(0, Math.sin(x * 0.13) * Math.cos(z * 0.11))) continue;
    if (!flatEnough(M, x, z)) continue;
    out.push([x, M.terrainY(x, z) - 0.05, z]);
  }
  // dense, taller tufts along the cliff lip south-west of the tower (the low foreground of the sweep shot) and round the tower foot
  for (let i = 0; i < 40000 && out.length < 16000; i++) {
    const a = rng.range(0, Math.PI * 2), r = Math.sqrt(rng.next()) * 34;
    const x = 116 + Math.cos(a) * r, z = -352 + Math.sin(a) * r;
    if (M.plateau(x, z) < 0.5 || M.coast(x, z) < 0.8) continue;
    if (Math.hypot(x - TOWER.base[0], z - TOWER.base[2]) < 6.5 || pathDist(x, z) < 1.2) continue;
    if (!flatEnough(M, x, z)) continue;
    out.push([x, M.terrainY(x, z) - 0.05, z, 1.15]);
  }
  for (let i = 0; i < 3000; i++) {
    const a = rng.range(0, Math.PI * 2), r = rng.range(6.2, 10);
    const x = TOWER.base[0] + Math.cos(a) * r, z = TOWER.base[2] + Math.sin(a) * r;
    if (pathDist(x, z) < 1.2 || Math.hypot(x - COTTAGE.pos[0], z - COTTAGE.pos[2]) < 8) continue;
    if (rng.next() < 0.5) out.push([x, M.terrainY(x, z) - 0.05, z, 1.2]);
  }
  return out;
}
