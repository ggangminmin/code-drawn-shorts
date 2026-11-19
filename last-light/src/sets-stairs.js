import * as THREE from 'three';
import { SETS } from './layout.js';
import { bag, box, cyl, sph, torus, lathe, tube, v3, proxy, paint, hex, mixc, deform } from './sets-geo.js';
import { setMat, glowMat, flameMat, flameMesh } from './sets-mat.js';
import { windowMat } from './sets-window.js';
import { Rng } from './util.js';

// The tower stair (s05 foot of the stair, s06 THE SPIRAL). A whitewashed stone drum 30 m tall; cantilevered slate steps
// wind up the wall round an open well, an iron newel column stands in the middle of the well, braced to the steps by
// iron struts; an iron handrail spirals up the inner edge. Slit windows in deep embrasures; three oil lamps on brackets.
// Local origin = floor centre. Steps climb counter-clockwise seen from above (angle grows with height).
export const STAIR = {
  H: 30, rise: 0.18, perTurn: 24, N: 165,
  Rw: 3.0,          // inner face of the wall
  Rin: 2.05,        // inner edge of the treads (the open well)
  Rwalk: 2.5,       // the walking line (tread 0.65 m deep there)
  a0: Math.PI * 0.5, // angle of the first step's leading edge (pointing +X)
  wallT: 0.9,
  colTop: 22.0,     // the newel's cap (the s06 camera hangs on the axis above it)
};
STAIR.dA = (Math.PI * 2) / STAIR.perTurn;
STAIR.top = STAIR.N * STAIR.rise;
const S = STAIR;
const polar = (a, r, y) => [Math.sin(a) * r, y, Math.cos(a) * r];

// slit windows every 10 steps; lamps on brackets at three heights
const WIN_K = []; for (let k = 6; k <= S.N - 2; k += 10) WIN_K.push(k);
const winAt = (k) => ({ a: S.a0 + (k - 0.5) * S.dA + 0.05, y: k * S.rise + 1.45 });
// hurricane lanterns hung from iron arms on the newel column, so their pools fall on the inner treads you see from above
const LAMPS = [{ y: 2.35, a: 2.2 }, { y: 8.5, a: 4.6 }, { y: 14.7, a: 0.9 }, { y: 20.6, a: 3.4 }, { y: 0, a: 5.2, wall: true }];
// a wall lamp hangs 2.05 m over the tread beneath it, so it never meets a head on the stair
for (const L of LAMPS) if (L.wall) {
  const rel = ((L.a - S.a0) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  let k = Math.floor(rel / S.dA) + 1; while (k + S.perTurn <= S.N - 3) k += S.perTurn;
  L.y = k * S.rise + 2.05 - 0.62;
}
const LAMP_R = 0.6;

export function buildStairs(ctx) {
  const O = SETS.stairs;
  const root = new THREE.Group(); root.name = 'set_stairs'; root.position.set(...O); ctx.scene.add(root);
  const rng = new Rng(9021);
  const cols = [];

  // ---------------------------------------------------------------- the steps: slate slabs, worn pale along the walking line
  const stepCols = [];
  const stepMat = setMat({ id: 21, kind: 6, scale: 1, grime: 0.3, wear: 0.15 });
  const steps = bag(root, 'stairs_steps', stepMat);
  const wedge = (k, a0, a1, rIn, rOut, yTop, th, segA = 4) => deform(new THREE.BoxGeometry(1, 1, 1, segA, 1, 1), (v) => {
    const a = a0 + (v.x + 0.5) * (a1 - a0), r = rIn + (v.z + 0.5) * (rOut - rIn), y = yTop - (0.5 - v.y) * th;
    v.set(Math.sin(a) * r, y, Math.cos(a) * r);
  });
  const slate = hex('#8a9096'), slateW = hex('#b2b6ba'), nose = hex('#6c7278');
  for (let k = 1; k <= S.N; k++) {
    const a0 = S.a0 + (k - 1) * S.dA, a1 = a0 + S.dA;
    const y = k * S.rise;
    const tone = 0.88 + 0.24 * rng.next();
    // the slab: overhangs its lower neighbour a little at the nosing, buried 0.15 m in the wall
    const g = wedge(k, a0 - S.dA * 0.1, a1, S.Rin, S.Rw + 0.15, y, 0.24);
    steps.add(g, (p, n) => {
      const r = Math.hypot(p.x, p.z);
      const worn = Math.exp(-Math.pow((r - S.Rwalk) / 0.32, 2));
      let c = mixc(slate, slateW, worn * 0.7 * (n.y > 0.5 ? 1 : 0.3));
      if (n.y < 0.5 && n.y > -0.5) c = mixc(c, nose, 0.5);
      return c.map((x) => x * tone);
    });
    stepCols.push(wedge(k, a0, a1, S.Rin, S.Rw, y, S.rise, 2));
  }
  steps.build();

  // ---------------------------------------------------------------- the wall: a drum of limewashed rubble with a hand-grimed band
  const wallMat = setMat({ id: 20, kind: 0, scale: 1, grime: 0.5, stone: [0.42, 0.26, 0.4], cyl: 3.0, slit: [0.26, 0.5], soot: 0.5, sootY: [27.5, 30] });
  const wall = bag(root, 'stairs_wall', wallMat);
  const lime = hex('#a2a8ae'), limeDim = hex('#80868c'), grime = hex('#575c62');
  const wallG = new THREE.CylinderGeometry(S.Rw, S.Rw, S.H + 0.4, 128, 150, true).translate(0, S.H / 2 + 0.1, 0);
  wall.add(wallG, (p) => {
    const a = Math.atan2(p.x, p.z);
    // height of the tread under this point of the wall (the step whose angle matches, nearest below)
    const rel = ((a - S.a0) % (Math.PI * 2) + Math.PI * 4) % (Math.PI * 2);
    let k = Math.floor(rel / S.dA) + 1;
    while ((k + S.perTurn) * S.rise <= p.y) k += S.perTurn;
    const above = p.y - k * S.rise;
    let c = mixc(limeDim, lime, Math.min(1, Math.max(0, p.y / 3)));
    if (above > 0.55 && above < 1.25 && k <= S.N) c = mixc(c, grime, 0.35 * Math.sin((above - 0.55) / 0.7 * Math.PI));
    // damp runs below each window
    for (const wk of WIN_K) {
      const w = winAt(wk), da = Math.abs(((a - w.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (da < 0.09 && p.y < w.y && p.y > w.y - 3.5) c = mixc(c, limeDim, 0.5 * (1 - da / 0.09) * (1 - (w.y - p.y) / 3.5));
    }
    return c;
  });
  wall.build();
  const wallSolid = lathe([[S.Rw, -0.2], [S.Rw + S.wallT, -0.2], [S.Rw + S.wallT, S.H + 0.6], [S.Rw, S.H + 0.6], [S.Rw, -0.2]], 64);
  // ---------------------------------------------------------------- the embrasures: splayed stone tunnels to small panes
  const embMat = setMat({ id: 24, kind: 1, scale: 1, grime: 0.5 });
  const emb = bag(root, 'stairs_embrasures', embMat);
  const panes = [];
  const slitM = windowMat(2, { rain: 0.8 });
  for (const wk of WIN_K) {
    const w = winAt(wk);
    const n = v3(Math.sin(w.a), 0, Math.cos(w.a)), t = v3(Math.cos(w.a), 0, -Math.sin(w.a));
    const P = (tt, yy, rr) => [n.x * rr + t.x * tt, w.y + yy, n.z * rr + t.z * tt];
    const r0 = S.Rw - 0.02, r1 = S.Rw + S.wallT - 0.15;
    const iw = 0.3, ih = 0.56, ow = 0.1, oh = 0.42;
    const quad = (a, b, c, d) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3));
      g.computeVertexNormals(); return g;
    };
    const A = P(-iw, -ih, r0), B = P(iw, -ih, r0), C = P(iw, ih, r0), D = P(-iw, ih, r0);
    const a = P(-ow, -oh, r1), b = P(ow, -oh, r1), c = P(ow, oh, r1), d = P(-ow, oh, r1);
    emb.add(quad(A, B, b, a), '#7a7e7c');   // sill
    emb.add(quad(D, d, c, C), '#5a5e5c');   // head
    emb.add(quad(A, a, d, D), '#8a8e8c');   // sides
    emb.add(quad(B, C, c, b), '#8a8e8c');
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(ow * 2, oh * 2), slitM);
    pane.position.set(...P(0, 0, r1 - 0.01)); pane.lookAt(O[0], O[1] + w.y, O[2]);
    pane.position.set(...P(0, 0, r1 - 0.01));
    pane.quaternion.setFromUnitVectors(v3(0, 0, 1), n.clone().negate());
    pane.name = 'stairs_slit'; root.add(pane); panes.push(pane);
    // an iron glazing bar across the pane
    emb.add(box(ow * 2, 0.025, 0.03, 0, 0, 0).applyMatrix4(new THREE.Matrix4().makeRotationY(w.a)).translate(...P(0, 0.05, r1 - 0.03)), '#1c1e20');
  }
  emb.build();

  // ---------------------------------------------------------------- the iron: newel column, struts, balusters, handrail
  const ironMat = setMat({ id: 23, kind: 3, scale: 1, gloss: 0.5, grime: 0.5 });
  const iron = bag(root, 'stairs_iron', ironMat);
  const ironC = hex('#2b3033'), ironL = hex('#3a4044');
  // the newel stops a little under the lantern-room floor with a turned cap: from the top of the stair you look straight down it
  const CT = STAIR.colTop;
  const colG = cyl(0.14, 0.14, CT, 0, CT / 2, 0, 0, 0, 0, 20);
  iron.add(colG, ironC); cols.push(cyl(0.14, 0.14, CT, 0, CT / 2, 0, 0, 0, 0, 12));
  iron.add(lathe([[0.001, 0], [0.2, 0], [0.2, 0.06], [0.15, 0.1], [0.17, 0.16], [0.1, 0.22], [0.06, 0.3], [0.08, 0.36], [0.001, 0.4]], 20).translate(0, CT, 0), ironL);
  for (let y = 0.05; y < CT - 0.5; y += S.perTurn * S.rise) { iron.add(cyl(0.2, 0.2, 0.08, 0, y + 0.04, 0, 0, 0, 0, 20), ironL); iron.add(torus(0.17, 0.025, 0, y + 0.12, 0, Math.PI / 2, 0, 0, 6, 20), ironL); }
  iron.add(cyl(0.34, 0.4, 0.14, 0, 0.07, 0, 0, 0, 0, 24), ironC);   // the foot plate
  // struts: every 4th step, a flat bar from under the tread's inner edge back to a collar on the column
  for (let k = 2; k <= S.N; k += 4) {
    const a = S.a0 + (k - 0.5) * S.dA, y = k * S.rise - 0.24;
    if (y - 0.35 > STAIR.colTop - 0.3) continue;
    const p0 = v3(...polar(a, S.Rin + 0.12, y)), p1 = v3(...polar(a, 0.14, y - 0.35));
    const mid = p0.clone().add(p1).multiplyScalar(0.5), len = p0.distanceTo(p1);
    const g = new THREE.BoxGeometry(0.035, 0.09, len);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(v3(0, 0, 1), p1.clone().sub(p0).normalize()));
    g.translate(mid.x, mid.y, mid.z);
    iron.add(g, ironC);
    iron.add(cyl(0.18, 0.18, 0.1, 0, y - 0.35, 0, 0, 0, 0, 16), ironL);
  }
  // balusters at every step's inner edge, and the handrail on top
  const railPts = [];
  for (let k = 1; k <= S.N; k++) {
    const a = S.a0 + (k - 0.5) * S.dA, y = k * S.rise;
    const [x, , z] = polar(a, S.Rin + 0.06, 0);
    iron.add(cyl(0.013, 0.013, 0.92, x, y + 0.46, z, 0, 0, 0, 6), ironC);
  }
  for (let s = 0; s <= (S.N - 1) * 2; s++) { const k = s / 2, a = S.a0 + k * S.dA, y = k * S.rise + 0.92 + 0.1; railPts.push(v3(...polar(a, S.Rin + 0.06, y))); }
  const railCurve = new THREE.CatmullRomCurve3(railPts);
  iron.add(new THREE.TubeGeometry(railCurve, S.N * 4, 0.028, 8, false), '#3a2a20');
  iron.build();

  // ---------------------------------------------------------------- floor, ceiling with the hatch, the iron door, the keeper's supplies
  const floorMat = setMat({ id: 26, kind: 4, scale: 1, grime: 0.7, wear: 0.3 });
  const fl = bag(root, 'stairs_floor', floorMat);
  const floorG = cyl(S.Rw + 0.2, S.Rw + 0.2, 0.3, 0, -0.15, 0, 0, 0, 0, 48);
  fl.add(floorG, (p) => (Math.hypot(p.x, p.z) < 0.6 ? hex('#3a3c3e') : hex('#53575a')));
  fl.build(); const floorCol = [cyl(S.Rw + 0.2, S.Rw + 0.2, 0.3, 0, -0.15, 0, 0, 0, 0, 24)];
  const ceilMat = setMat({ id: 22, kind: 3, scale: 1, grime: 0.7 });
  const ce = bag(root, 'stairs_ceiling', ceilMat);
  // the lantern-room floor seen from below: iron plates on radial joists, with the hatch above the last steps
  const aEnd = S.a0 + S.N * S.dA, hatchA = 11 * S.dA;
  const ceil = new THREE.RingGeometry(0.15, S.Rw + 0.1, 64, 2, aEnd + 0.2 - Math.PI / 2, Math.PI * 2 - hatchA - 0.4);
  ceil.rotateX(Math.PI / 2); ceil.translate(0, S.H + 0.25, 0);
  ce.add(ceil, '#2a2e30');
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const rel = ((a - (aEnd - hatchA - 0.15)) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    if (rel < hatchA + 0.3) continue;
    const g = box(0.1, 0.22, S.Rw, 0, S.H + 0.12, S.Rw / 2).applyMatrix4(new THREE.Matrix4().makeRotationY(a));
    ce.add(g, '#1e2224');
  }
  ce.build();

  // the landing: an iron grating at the head of the stair, under the hatch
  const land = bag(root, 'stairs_landing', ironMat);
  const la0 = aEnd - 0.1, la1 = aEnd + 3 * S.dA;
  const landG = wedge(0, la0, la1, S.Rin, S.Rw + 0.1, S.top + S.rise, 0.12, 6);
  land.add(landG, '#2e3436');
  land.build(); stepCols.push(wedge(0, la0 + 0.01, la1, S.Rin, S.Rw, S.top + S.rise, 0.12, 4));

  const props = bag(root, 'stairs_props', setMat({ id: 25, kind: 2, scale: 1, axis: 1, plank: 0.12, grime: 0.5 }));
  // the door: oak planks with iron straps, in a deep reveal, opposite the stair foot
  const da = S.a0 - Math.PI * 0.75;
  const dn = v3(Math.sin(da), 0, Math.cos(da));
  const doorG = box(1.0, 2.0, 0.08, 0, 1.0, 0).applyMatrix4(new THREE.Matrix4().makeRotationY(da)).translate(dn.x * (S.Rw + 0.35), 0, dn.z * (S.Rw + 0.35));
  props.add(doorG, '#3e2c1e');
  for (const y of [0.4, 1.6]) props.add(box(0.95, 0.06, 0.02, 0, y, 0).applyMatrix4(new THREE.Matrix4().makeRotationY(da)).translate(dn.x * (S.Rw + 0.3), 0, dn.z * (S.Rw + 0.3)), '#1c1e20');
  // kerosene barrel, oil cans, a coil of rope, a bucket, a mop, all against the wall near the door
  const near = (a, r) => polar(da + a, r, 0);
  const [bx, , bz] = near(0.55, S.Rw - 0.38);
  const barrel = lathe([[0.001, 0], [0.28, 0], [0.31, 0.15], [0.33, 0.45], [0.31, 0.75], [0.28, 0.9], [0.001, 0.9]], 24).translate(bx, 0, bz);
  props.add(barrel, '#5a3a24'); cols.push(cyl(0.3, 0.3, 0.9, bx, 0.45, bz, 0, 0, 0, 12));
  for (const y of [0.12, 0.45, 0.78]) props.add(torus(0.325, 0.012, bx, y, bz, Math.PI / 2, 0, 0, 6, 28), '#24282a');
  props.build();
  const cans = bag(root, 'stairs_cans', setMat({ id: 27, kind: 3, scale: 1, gloss: 0.8, grime: 0.5 }));
  for (let i = 0; i < 3; i++) {
    const [x, , z] = near(0.9 + i * 0.12, S.Rw - 0.22);
    cans.add(box(0.2, 0.32, 0.14, x, 0.16, z, 0, da + 0.3 * i, 0), i === 1 ? '#7a2a22' : '#3a5a52');
    cans.add(cyl(0.025, 0.025, 0.05, x + 0.04, 0.345, z, 0, 0, 0, 8), '#c8a050');
  }
  const [rx, , rz] = near(-0.6, S.Rw - 0.4);
  for (let i = 0; i < 6; i++) cans.add(torus(0.28 - i * 0.025, 0.03, rx, 0.03 + i * 0.05, rz, Math.PI / 2, 0, 0, 6, 28), '#8a7a5a');
  const [kx, , kz] = near(-0.95, S.Rw - 0.3);
  cans.add(lathe([[0.001, 0], [0.12, 0], [0.15, 0.3], [0.14, 0.3], [0.001, 0.02]], 20).translate(kx, 0, kz), '#4a5a62');
  cans.build();

  // ---------------------------------------------------------------- the lamps: iron bracket, brass font, glass chimney, flame
  const lampMeta = [];
  const brass = bag(root, 'stairs_lamps', setMat({ id: 28, kind: 3, scale: 1, gloss: 1, grime: 0.3 }));
    const glassMat = glowMat({ color: '#ffd9a0', k: 1.1, id: 122 });
  LAMPS.forEach((L, li) => {
    const n = v3(Math.sin(L.a), 0, Math.cos(L.a));
    const p = (r, y) => [n.x * r, L.y + y, n.z * r];
    const R = L.wall ? S.Rw - 0.4 : LAMP_R, rA = L.wall ? S.Rw : 0.14;
    // the arm: a collar on the column (or a plate on the wall), a bar out to the hook, a diagonal brace
    if (!L.wall) brass.add(cyl(0.17, 0.17, 0.08, 0, L.y + 0.62, 0, 0, 0, 0, 16), '#1c1e20');
    else brass.add(box(0.12, 0.3, 0.03, 0, 0, 0).applyMatrix4(new THREE.Matrix4().makeRotationY(L.a)).translate(...p(S.Rw - 0.01, 0.55)), '#1c1e20');
    brass.add(box(0.035, 0.035, Math.abs(R - rA) + 0.02, 0, 0, 0).applyMatrix4(new THREE.Matrix4().makeRotationY(L.a)).translate(...p((R + rA) / 2, 0.62)), '#1c1e20');
    if (!L.wall) brass.add(box(0.025, 0.025, 0.5, 0, 0, 0).applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-0.62, L.a, 0, 'YXZ'))).translate(...p(0.33, 0.43)), '#1c1e20');
    brass.add(torus(0.025, 0.006, ...p(R, 0.585), 0, L.a, 0, 6, 12), '#1c1e20');
    // the lantern: tank, globe in a wire guard, a cap, the bail on the hook
    brass.add(lathe([[0.001, 0], [0.075, 0], [0.08, 0.02], [0.075, 0.06], [0.05, 0.07], [0.001, 0.07]], 20).translate(...p(R, 0.18)), '#7a2a22');
    for (let i = 0; i < 4; i++) { const g = cyl(0.005, 0.005, 0.16, 0, 0, 0, 0, 0, 0, 4); const q = (i / 4) * Math.PI * 2 + 0.4; g.translate(Math.sin(q) * 0.075, 0, Math.cos(q) * 0.075); g.translate(...p(R, 0.33)); brass.add(g, '#2a2a2a'); }
    brass.add(lathe([[0.001, 0], [0.075, 0], [0.07, 0.02], [0.03, 0.06], [0.02, 0.07], [0.001, 0.07]], 20).translate(...p(R, 0.41)), '#7a2a22');
    brass.add(torus(0.08, 0.005, ...p(R, 0.46), 0, L.a + Math.PI / 2, 0, 6, 20, Math.PI), '#2a2a2a');
    const gl = new THREE.Mesh(paint(lathe([[0.04, 0], [0.06, 0.03], [0.068, 0.07], [0.06, 0.11], [0.035, 0.15], [0.034, 0.16]], 18).translate(...p(R, 0.25)), (v) => {
      const h = (v.y - L.y - 0.25) / 0.16; return mixc(hex('#ffffff'), hex('#ffb070'), Math.min(1, Math.abs(h - 0.3) * 1.6));
    }), glassMat);
    gl.name = 'stairs_lantern'; root.add(gl);
    const fm = flameMesh(flameMat({ k: 1.7, seed: li * 1.37 }), 0.02, 0.045); fm.position.set(...p(R, 0.27)); root.add(fm);
    lampMeta.push({ k: li, flame: fm, pos: p(R, 0.31) });
  });
  brass.build();

  proxy(root, 'stairs_solid', cols, ctx);
  proxy(root, 'stairs_steps', stepCols, ctx);      // feet stand on these: name them in a contact list
  proxy(root, 'stairs_floor', floorCol, ctx);
  proxy(root, 'stairs_wall_solid', [wallSolid], ctx);

  // ---------------------------------------------------------------- walking line API
  const W = (x) => [O[0] + x[0], O[1] + x[1], O[2] + x[2]];
  // u 0..1 along the walking line, from the floor at the foot of the first step to the landing at the top.
  // Returns { pos [x,y,z] world (on the tread surface under the walking line), yaw (facing, atan2(dx,dz)), step, ramp }
  //   pos.y is the tread you would stand on (stepped), ramp is the smooth line through the nosings (for the hips).
  function stairPoint(u) {
    const s = Math.min(S.N + 2, Math.max(-1, u * (S.N + 2) - 1));
    const a = S.a0 + s * S.dA;
    const k = Math.floor(s) + 1;
    const tread = s < 0 ? 0 : Math.min(S.N + 1, k) * S.rise;
    const [x, , z] = polar(a, S.Rwalk, 0);
    const yaw = Math.atan2(Math.cos(a), -Math.sin(a));   // direction of travel (tangent, angle increasing)
    return { pos: W([x, tread, z]), yaw, step: k, ramp: O[1] + Math.max(0, (s + 0.5) * S.rise) };
  }
  // height of the tread under world point (x, z), choosing the turn nearest below yHint (world y). Outside the treads: floor.
  function stairGround(x, z, yHint) {
    const lx = x - O[0], lz = z - O[2], r = Math.hypot(lx, lz);
    if (r < S.Rin - 0.02 || r > S.Rw + 0.02) return O[1];
    const rel = ((Math.atan2(lx, lz) - S.a0) % (Math.PI * 2) + Math.PI * 4) % (Math.PI * 2);
    let k = Math.floor(rel / S.dA) + 1;
    const hy = (yHint ?? O[1]) - O[1] + 0.25;
    while ((k + S.perTurn) * S.rise <= hy) k += S.perTurn;
    if (k * S.rise > hy) return O[1];
    if (k > S.N) return O[1] + (S.N + 1) * S.rise;
    return O[1] + k * S.rise;
  }

  // the foot of the stair: on the floor just before the first step, toward the well (room to sit against the wall behind)
  const foot = polar(S.a0 - 0.32, 1.32, 0);
  const anchors = {
    stairFoot: W(foot),
    stairWalk0: W(polar(S.a0 - S.dA, S.Rwalk, 0)),
    stairTop: W([...polar(S.a0 + (S.N + 1.5) * S.dA, S.Rwalk, 0)].map((v, i) => (i === 1 ? S.top + S.rise : v))),
    stairDoor: W([dn.x * (S.Rw - 0.2), 0, dn.z * (S.Rw - 0.2)]),
    stairCentreTop: W([0, S.H - 0.5, 0]),
    stairLamp0: W(lampMeta[0].pos), stairLamp1: W(lampMeta[1].pos), stairLamp2: W(lampMeta[2].pos),
  };

  function table(t, fl, lampK) {
    const lamps = lampMeta.map((L, i) => ({ p: W(L.pos), c: [2.1 * lampK(t, i), 1.2 * lampK(t, i), 0.46 * lampK(t, i)], r: 4.6 }));
    return {
      amb: [0.07, 0.1, 0.14], fill: [0.15, 0.2, 0.27], fillDir: [0.2, 1, 0.1],
      lamps,
      flash: { c: [0.85 * fl, 0.95 * fl, 1.15 * fl], list: WIN_K.map((k) => { const w = winAt(k); return { p: W(polar(w.a, S.Rw, w.y)), d: [-Math.sin(w.a), -0.15, -Math.cos(w.a)], r: 4.5 }; }) },
      haze: { c: [0.015, 0.022, 0.03], k: 0.018 },
    };
  }

  function update(st, fl) {
    const t = st.t;
    slitM.uniforms.uFlash.value = fl;
    for (const L of lampMeta) { L.flame.material.uniforms.uFT.value = t + L.k; }
  }

  return { root, anchors, stairPoint, stairGround, STAIR, table, update, panes };
}
