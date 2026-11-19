import * as THREE from 'three';
import { Kit, cylUV, boxUV, sweep, ring, v3, cbox, latheUV, creased } from './mech-geo.js';
import { deg, clamp, smooth } from './util.js';

// SIX FISHING BOATS. Boat-local frame: origin on the waterline amidships, +Z bow, +Y up, +X port.
export const BOATS = [
  { name: 'Kestrel', L: 11.5, B: 3.7, hull: '#a3312a', cabin: '#e9e5da', trim: '#2c5a88', bottom: '#2e2426', net: '#3f6a5a', boot: '#f0ece2' },
  { name: 'Grey Gull', L: 12.6, B: 4.0, hull: '#2d5745', cabin: '#ddd3b6', trim: '#c09a3a', bottom: '#2b2224', net: '#b06a3a', boot: '#e8e2d0' },
  { name: 'Morning Star', L: 10.4, B: 3.5, hull: '#253350', cabin: '#e4e4dd', trim: '#a63a2e', bottom: '#2e2426', net: '#4a6e6a', boot: '#ebe7dc' },
  { name: 'Dory', L: 10.0, B: 3.4, hull: '#c9a744', cabin: '#3d6b70', trim: '#2a2a2c', bottom: '#2b2426', net: '#5a5a48', boot: '#2a2a2c' },
  { name: 'Tern', L: 12.0, B: 3.9, hull: '#e2ded2', cabin: '#6c8494', trim: '#3c7550', bottom: '#352a2a', net: '#a85a3a', boot: '#3c7550' },
  { name: 'Black Pearl', L: 13.0, B: 4.1, hull: '#2a2a2d', cabin: '#c7b796', trim: '#8a3a2b', bottom: '#2a2022', net: '#5e7258', boot: '#c7b796' },
];

// hull lines: u 0 stern .. 1 bow
export function hullLines(b) {
  const { L, B } = b, D = 1.15, T = 1.05;
  const half = (u) => (u < 0.42 ? 0.84 + 0.16 * Math.sin((u / 0.42) * Math.PI / 2) : Math.pow(Math.max(0, Math.cos(Math.min(1, (u - 0.42) / 0.58) * Math.PI / 2)), 0.75)) * B / 2;
  const sheer = (u) => D + 0.85 * Math.pow(u, 2.6) + 0.12 * Math.pow(1 - u, 3);
  const keel = (u) => (u < 0.72 ? -T + 0.25 * Math.pow(1 - u / 0.72, 3) * (u < 0.1 ? 1 : 1) : -T + (T + sheer(1) * 0.15) * smooth((u - 0.72) / 0.28));
  const zOf = (u) => (u - 0.5) * L;
  return { half, sheer, keel, zOf, D, T };
}

function hullGeos(b) {
  const H = hullLines(b);
  const nu = 44, nv = 14;
  const P = (u, v, side) => {
    const bb = H.half(u), s = H.sheer(u), k = H.keel(u);
    const x = bb * Math.pow(Math.sin((v * Math.PI) / 2), 0.55) * side;
    const y = k + (s - k) * Math.pow(1 - Math.cos((v * Math.PI) / 2), 0.85);
    return [x, y, H.zOf(u)];
  };
  const bins = { bottom: [], boot: [], top: [] };
  const uvs = { bottom: [], boot: [], top: [] };
  const girth = (u, v) => v * (H.sheer(u) - H.keel(u) + H.half(u)) * 0.9;
  for (const side of [1, -1]) {
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const u0 = i / nu, u1 = (i + 1) / nu, v0 = j / nv, v1 = (j + 1) / nv;
      const a = P(u0, v0, side), bq = P(u1, v0, side), c = P(u1, v1, side), d = P(u0, v1, side);
      const yc = (a[1] + bq[1] + c[1] + d[1]) / 4;
      const bin = yc < -0.02 ? 'bottom' : (yc < 0.16 ? 'boot' : 'top');
      const tri = side > 0 ? [a, bq, c, a, c, d] : [a, c, bq, a, d, c];
      for (const p of tri) bins[bin].push(...p);
      const U = (p, u, v) => [p[2], girth(u, v)];
      const uvA = U(a, u0, v0), uvB = U(bq, u1, v0), uvC = U(c, u1, v1), uvD = U(d, u0, v1);
      const ut = side > 0 ? [uvA, uvB, uvC, uvA, uvC, uvD] : [uvA, uvC, uvB, uvA, uvD, uvC];
      for (const q of ut) uvs[bin].push(...q);
    }
  }
  // transom: fan from the keel point across the stern section
  const tr = [], tuv = [];
  for (let j = 0; j < nv; j++) {
    const a = P(0, j / nv, 1), bq = P(0, (j + 1) / nv, 1), c = P(0, (j + 1) / nv, -1), d = P(0, j / nv, -1);
    tr.push(...a, ...d, ...c, ...a, ...c, ...bq);
    for (const p of [a, d, c, a, c, bq]) tuv.push(p[0], p[1]);
  }
  const mk = (pos, uv) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const r = creased(g, deg(40));
    r.userData.ownUV = true;
    return r;
  };
  return { bottom: mk(bins.bottom, uvs.bottom), boot: mk(bins.boot, uvs.boot), top: mk(bins.top, uvs.top), transom: mk(tr, tuv), H };
}

function deckGeo(H, inset = 0.93, drop = 0.38) {
  const pos = [], uv = [], n = 40;
  for (let i = 0; i < n; i++) {
    const u0 = i / n, u1 = (i + 1) / n;
    const y0 = H.sheer(u0) - drop, y1 = H.sheer(u1) - drop;
    const b0 = H.half(u0) * inset, b1 = H.half(u1) * inset, z0 = H.zOf(u0), z1 = H.zOf(u1);
    const camber = 0.06;
    const pts = [[-b0, y0, z0], [0, y0 + camber, z0], [b0, y0, z0], [-b1, y1, z1], [0, y1 + camber, z1], [b1, y1, z1]];
    const q = (a, b, c) => { pos.push(...pts[a], ...pts[b], ...pts[c]); for (const k of [a, b, c]) uv.push(pts[k][2], pts[k][0]); };
    q(0, 4, 1); q(0, 3, 4); q(1, 5, 2); q(1, 4, 5);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  g.userData.ownUV = true;
  return g;
}

// closed, invisible slab under the deck surface: the QA collider for anyone standing on the boat
function deckSlab(H, inset, drop, thick) {
  const n = 30, pos = [];
  const P = (u, side, top) => [H.half(u) * inset * side, H.sheer(u) - drop + (top ? 0.06 * (side === 0 ? 1 : 0) : -thick), H.zOf(u)];
  const quad = (a, b, c, d) => pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (let i = 0; i < n; i++) {
    const u0 = 0.03 + (i / n) * 0.9, u1 = 0.03 + ((i + 1) / n) * 0.9;
    for (const [s0, s1] of [[-1, 0], [0, 1]]) {
      quad(P(u0, s0, true), P(u0, s1, true), P(u1, s1, true), P(u1, s0, true));
      quad(P(u0, s0, false), P(u1, s0, false), P(u1, s1, false), P(u0, s1, false));
    }
    for (const sd of [-1, 1]) quad(P(u0, sd, true), P(u1, sd, true), P(u1, sd, false), P(u0, sd, false));
  }
  for (const [u, sg] of [[0.03, 1], [0.93, -1]]) for (const [s0, s1] of [[-1, 0], [0, 1]]) {
    const a = P(u, s0, true), b = P(u, s1, true), c = P(u, s1, false), d = P(u, s0, false);
    if (sg > 0) quad(a, b, c, d); else quad(a, d, c, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export function buildBoat(i, mat) {
  const b = BOATS[i];
  const k = new Kit(300 + i * 17);
  const J = {};
  const root = new THREE.Group(); root.name = 'mech:boat' + i;
  const body = new THREE.Group(); body.name = 'mech:boatBody' + i; root.add(body);
  J.body = body;
  const lantern = new THREE.Group(); lantern.name = 'mech:boatLantern' + i; body.add(lantern); J.lantern = lantern;
  const drum = new THREE.Group(); body.add(drum); J.drum = drum;
  const radar = new THREE.Group(); body.add(radar); J.radar = radar;

  const st = {
    bottom: { id: 30, col: b.bottom, metal: 0.1, kind: 3, pw: 2.4, ph: 0.2, wear: 1 },
    boot: { id: 31, col: b.boot, metal: 0.1, kind: 3, pw: 2.4, ph: 0.2, wear: 0.6 },
    hull: { id: 32, col: b.hull, metal: 0.15, kind: 3, pw: 2.6, ph: 0.21, wear: 1 },
    trim: { id: 33, col: b.trim, metal: 0.2, kind: 3, pw: 3, ph: 0.12, wear: 1 },
    deck: { id: 34, col: '#8a7a62', metal: 0.05, kind: 4, pw: 2.2, ph: 0.14, wear: 1 },
    cabin: { id: 35, col: b.cabin, metal: 0.15, kind: 3, pw: 1.8, ph: 0.12, wear: 0.8 },
    roof: { id: 36, col: b.trim, metal: 0.2, kind: 3, pw: 1.5, ph: 0.15, wear: 1 },
    iron: { id: 37, col: '#2b2f2e', metal: 0.6, kind: 0, pw: 1, ph: 1, riv: 0, wear: 1 },
    brass: { id: 38, col: '#b88d42', metal: 1, kind: 1 },
    mast: { id: 37, col: '#cfc8b8', metal: 0.1, kind: 4, pw: 6, ph: 2, wear: 1 },
    net: { id: 39, col: b.net, metal: 0, kind: 5, wear: 1 },
    rubber: { id: 30, col: '#1d1d1f', metal: 0.2, kind: 5, wear: 0.4 },
    window: { id: 39, col: i === 0 ? '#9a9a9a' : '#c4c4c4', emis: 3, kind: 5, detail: 0 },
    lamp: { id: 39, col: '#ffffff', emis: 2, kind: 5, detail: 0 },
    white: { id: 36, col: '#ece8de', metal: 0.1, kind: 5, wear: 0.3 },
    red: { id: 33, col: '#b2392e', metal: 0.1, kind: 5, wear: 0.3 },
  };
  const G = hullGeos(b), H = G.H;
  k.add('body', G.bottom, st.bottom);
  k.add('body', G.boot, st.boot);
  k.add('body', G.top, st.hull);
  k.add('body', G.transom, st.hull);
  const deckDrop = 0.4;
  k.add('body', deckGeo(H, 0.92, deckDrop), st.deck);
  // gunwale cap rail and rubbing strake, both sides, meeting at the stem
  for (const side of [1, -1]) {
    const cap = [], rub = [];
    for (let j = 0; j <= 24; j++) {
      const u = 0.005 + (j / 24) * 0.985;
      cap.push(v3(H.half(u) * side * 1.01, H.sheer(u) + 0.03, H.zOf(u)));
      rub.push(v3(H.half(u) * side * 1.04 * (u > 0.95 ? 0.6 : 1), H.sheer(u) - 0.32, H.zOf(u)));
    }
    k.add('body', sweep(cap, 0.07, 48, 6), st.trim);
    k.add('body', sweep(rub, 0.06, 48, 6), st.trim);
  }
  // stem post and transom cap
  const stem = [];
  for (let j = 0; j <= 10; j++) { const u = 0.72 + 0.28 * (j / 10); stem.push(v3(0, (j < 10 ? H.keel(u) : H.sheer(1)) * (j < 10 ? 1 : 1) + (j === 10 ? 0.05 : 0), H.zOf(u) + 0.03)); }
  k.add('body', sweep(stem, 0.06, 30, 6), st.trim);
  k.add('body', boxUV(H.half(0) * 2 + 0.1, 0.12, 0.12), st.trim, [0, H.sheer(0) + 0.02, H.zOf(0)]);
  // keel and rudder
  k.add('body', boxUV(0.14, 0.25, b.L * 0.7), st.bottom, [0, -H.T - 0.1, -b.L * 0.08]);
  k.add('body', cbox(0.08, 0.95, 0.6, 0.03), st.bottom, [0, -0.6, H.zOf(0) - 0.25]);

  // wheelhouse: forward of amidships
  const wu0 = 0.5, wu1 = 0.66, wz0 = H.zOf(wu0), wz1 = H.zOf(wu1), wl = wz1 - wz0;
  const dy = H.sheer(0.58) - deckDrop, ww = Math.min(2.3, b.B * 0.62), wh = 1.95;
  const wcz = (wz0 + wz1) / 2;
  k.add('body', cbox(ww, wh, wl, 0.05, { wt: ww * 0.94, dt: wl * 0.94 }), st.cabin, [0, dy + wh / 2, wcz]);
  // roof with overhang and visor
  k.add('body', cbox(ww + 0.3, 0.14, wl + 0.45, 0.05), st.roof, [0, dy + wh + 0.07, wcz + 0.12]);
  // windows: front 3, sides 2, back door
  const fw = (ww * 0.94 - 0.3) / 3;
  for (let q = 0; q < 3; q++) {
    k.add('body', boxUV(fw - 0.08, 0.6, 0.05), st.window, [-ww * 0.94 / 2 + 0.15 + fw * (q + 0.5), dy + wh - 0.55, wz1 - wl * 0.03 + 0.005], [-8, 0, 0]);
    k.add('body', boxUV(fw - 0.02, 0.68, 0.03), st.trim, [-ww * 0.94 / 2 + 0.15 + fw * (q + 0.5), dy + wh - 0.55, wz1 - wl * 0.03 - 0.005], [-8, 0, 0]);
  }
  for (const side of [1, -1]) for (let q = 0; q < 2; q++) {
    k.add('body', boxUV(0.05, 0.55, wl * 0.3), st.window, [side * (ww * 0.485 + 0.006), dy + wh - 0.6, wz0 + wl * (0.3 + q * 0.4)]);
    k.add('body', boxUV(0.03, 0.63, wl * 0.34), st.trim, [side * (ww * 0.485 - 0.004), dy + wh - 0.6, wz0 + wl * (0.3 + q * 0.4)]);
  }
  k.add('body', boxUV(0.7, 1.6, 0.05), st.trim, [ww * 0.15, dy + 0.85, wz0 - 0.01]);
  // stack, horn, searchlight, aerial
  k.add('body', cylUV(0.11, 0.12, 1.1, 12), st.iron, [-ww * 0.32, dy + wh + 0.65, wz0 + 0.3]);
  k.add('body', cylUV(0.14, 0.11, 0.12, 12), st.trim, [-ww * 0.32, dy + wh + 1.18, wz0 + 0.3]);
  k.add('body', cylUV(0.12, 0.1, 0.18, 12).rotateX(Math.PI / 2), st.brass, [ww * 0.3, dy + wh + 0.28, wz1 - 0.2]);
  // radar scanner on a post at the roof's back corner (turns), a whip aerial, side lights (port red, starboard green)
  radar.position.set(ww * 0.28, dy + wh + 0.55, wz0 + 0.35);
  k.add('body', cylUV(0.05, 0.07, 0.4, 8), st.iron, [ww * 0.28, dy + wh + 0.34, wz0 + 0.35]);
  k.add('radar', cbox(0.95, 0.1, 0.16, 0.03), st.white);
  k.add('radar', boxUV(0.12, 0.06, 0.12), st.iron, [0, -0.06, 0]);
  k.add('body', cylUV(0.008, 0.015, 2.4, 5), st.iron, [-ww * 0.42, dy + wh + 1.3, wz0 + 0.15]);
  for (const sd of [1, -1]) {
    k.add('body', boxUV(0.06, 0.2, 0.25), st.trim, [sd * (ww * 0.5 + 0.04), dy + wh - 0.1, wz1 - 0.3]);
    k.add('body', boxUV(0.03, 0.12, 0.16), { id: 39, col: sd > 0 ? '#ff4030' : '#40ff70', emis: 2, kind: 5, detail: 0 }, [sd * (ww * 0.5 + 0.075), dy + wh - 0.1, wz1 - 0.3]);
  }
  // gunwale stanchions with a rope rail along the after deck
  for (const sd of [1, -1]) {
    const pts = [];
    for (let q = 0; q <= 5; q++) {
      const u = 0.05 + q * 0.07, x = H.half(u) * 0.97 * sd, y0 = H.sheer(u);
      k.add('body', cylUV(0.02, 0.02, 0.55, 5), st.iron, [x, y0 + 0.3, H.zOf(u)]);
      pts.push(v3(x, y0 + 0.55 - (q % 1) * 0.05, H.zOf(u)));
    }
    k.add('body', sweep(pts, 0.015, 20, 4), st.net);
  }
  // mast on the roof's front, cross spar, stays
  const mastBase = [0, dy + wh + 0.14, wz1 - 0.35], mastTop = [0, dy + wh + 4.3, wz1 - 0.35];
  k.add('body', cylUV(0.06, 0.09, mastTop[1] - mastBase[1], 10), st.mast, [0, (mastTop[1] + mastBase[1]) / 2, mastBase[2]]);
  k.add('body', boxUV(1.5, 0.07, 0.07), st.mast, [0, mastTop[1] - 0.8, mastBase[2]]);
  const stay = (a, bb) => k.member('body', a, bb, 0.018, 0.018, st.iron);
  stay(mastTop, [0, H.sheer(1) + 0.05, H.zOf(0.99)]);
  stay([0, mastTop[1] - 0.8, mastBase[2]], [H.half(0.5) * 0.95, H.sheer(0.5), H.zOf(0.5)]);
  stay([0, mastTop[1] - 0.8, mastBase[2]], [-H.half(0.5) * 0.95, H.sheer(0.5), H.zOf(0.5)]);
  // derrick boom over the after deck
  k.member('body', [0, dy + wh + 1.2, wz0 + 0.1], [0, dy + 1.4, H.zOf(0.12)], 0.08, 0.08, st.mast);
  stay(mastTop, [0, dy + 1.4, H.zOf(0.12)]);
  // lantern hangs from the cross spar's port arm on a hook: its own joint so it can swing
  const lanternAt = [0.55, mastTop[1] - 0.84, mastBase[2]];
  lantern.position.set(...lanternAt);
  k.add('lantern', cylUV(0.01, 0.01, 0.18, 4), st.iron, [0, -0.09, 0]);
  k.add('lantern', latheUV([[0.0, -0.18], [0.1, -0.19], [0.12, -0.24], [0.0, -0.25]], 10), st.brass);
  k.add('lantern', cylUV(0.075, 0.08, 0.26, 10), st.lamp, [0, -0.38, 0]);
  for (let q = 0; q < 4; q++) { const a = (q / 4) * Math.PI * 2 + 0.4; k.add('lantern', boxUV(0.015, 0.28, 0.015), st.iron, [Math.sin(a) * 0.085, -0.38, Math.cos(a) * 0.085]); }
  k.add('lantern', latheUV([[0.0, -0.51], [0.1, -0.51], [0.1, -0.54], [0.0, -0.55]], 10), st.brass);
  J.lanternLocal = new THREE.Vector3(0, -0.38, 0);

  // net drum on the stern (horizontal axis X) with the green net wound on it
  const dz = H.zOf(0.1), dyD = H.sheer(0.1) - deckDrop + 0.75;
  drum.position.set(0, dyD, dz);
  k.add('drum', cylUV(0.38, 0.38, 1.7, 18).rotateZ(Math.PI / 2), st.net);
  for (const s of [-0.88, 0.88]) k.add('drum', cylUV(0.55, 0.55, 0.05, 20).rotateZ(Math.PI / 2), st.iron, [s, 0, 0]);
  k.add('drum', cylUV(0.04, 0.04, 2.0, 8).rotateZ(Math.PI / 2), st.iron);
  for (const s of [-1, 1]) k.add('body', cbox(0.1, 0.8, 0.5, 0.02), st.iron, [s * 0.97, dyD - 0.4, dz]);
  // fish boxes, a coil of rope, the life ring on the wheelhouse back
  for (let q = 0; q < 3; q++) k.add('body', boxUV(0.6, 0.25, 0.4), { ...st.cabin, id: 31, col: q % 2 ? '#4c7a8a' : '#c7c1b0', kind: 5 }, [0.6 - q * 0.05, H.sheer(0.3) - deckDrop + 0.13 + (q === 2 ? 0.25 : 0), H.zOf(0.3) + (q === 1 ? 0.45 : 0)], [0, q * 8, 0]);
  k.add('body', ring(0.28, 0.06, 18, 6), st.net, [-0.8, H.sheer(0.32) - deckDrop + 0.06, H.zOf(0.32)]);
  k.add('body', new THREE.TorusGeometry(0.3, 0.07, 6, 18), st.white, [-ww * 0.25, dy + 1.2, wz0 - 0.08]);
  // tyre fenders over the side
  for (const side of [1, -1]) for (let q = 0; q < 3; q++) {
    const u = 0.3 + q * 0.17;
    k.add('body', new THREE.TorusGeometry(0.2, 0.08, 6, 14).rotateY(Math.PI / 2), st.rubber, [side * (H.half(u) + 0.12), H.sheer(u) - 0.55, H.zOf(u)]);
  }
  // hull number boards near the bow (blank)
  for (const side of [1, -1]) k.add('body', boxUV(0.03, 0.32, 0.9), st.white, [side * H.half(0.8) * 1.0, H.sheer(0.8) - 0.35, H.zOf(0.8)], [0, side * -14, 0]);

  const meshes = k.finish(J, mat);
  const deckMesh = new THREE.Mesh(deckSlab(H, 0.9, deckDrop, 0.3), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false }));
  deckMesh.name = 'mech:deckCollider' + i; deckMesh.userData.noShadow = true; deckMesh.frustumCulled = false;
  body.add(deckMesh);
  const anchors = {
    lantern: lanternAt,
    deck: [0, H.sheer(0.35) - deckDrop + 0.06, H.zOf(0.35)],
    wheel: [0.3, dy + 1.1, wz1 - 0.5],
    bow: [0, H.sheer(1), H.zOf(1)],
  };
  return { root, body, J, meshes, deckMesh, anchors, H, b };
}
