import * as THREE from 'three';
import { SETS } from './layout.js';
import { bag, box, cyl, sph, ell, torus, lathe, tube, v3, proxy, paint, hex, mixc } from './sets-geo.js';
import { setMat, glowMat, flameMat, flameMesh } from './sets-mat.js';
import { windowMat } from './sets-window.js';
import { Rng } from './util.js';

// The keeper's cottage kitchen (s04). Thick rubble-stone walls under an old limewash, flagstones, a plank ceiling on
// smoke-black beams, a scrubbed table with the oil lamp (the only warm light), a cold iron range with the kettle,
// shelves of crockery, and the deep-set window where Suri watches the dark tower through the rain.
// Local origin = floor centre. Room x -2.4..2.4, z -2.0..2.0, ceiling 2.45. The window is in the back wall (-Z).
export const K = {
  W: 2.4, D: 2.0, H: 2.45, T: 0.5,
  win: { x0: 0.25, x1: 1.15, y0: 0.95, y1: 2.0, zIn: -2.0, zGlass: -2.24 },
  lamp: [-0.32, 0.0, -1.0],         // lamp base on the table (y filled below)
  table: { x: -0.55, z: -0.85, w: 1.3, d: 0.78, h: 0.76 },
};
K.lamp[1] = K.table.h;
export const KITCHEN_FLAME = [K.lamp[0], K.table.h + 0.235, K.lamp[2]];   // set-local flame centre

export function buildKitchen(ctx) {
  const O = SETS.kitchen;
  const root = new THREE.Group(); root.name = 'set_kitchen'; root.position.set(...O); ctx.scene.add(root);
  const rng = new Rng(4411);
  const { W, D, H, T } = K, win = K.win;
  const cols = [];   // QA proxies

  // ---------------------------------------------------------------- walls: rubble stone, limewashed, soot under the ceiling
  const wallMat = setMat({ id: 20, kind: 0, scale: 1, grime: 0.45, soot: 0.8, sootY: [1.7, 2.5], stone: [0.36, 0.22, 0.34] });
  const walls = bag(root, 'kitchen_walls', wallMat);
  const lime = hex('#8d918f'), limeLow = hex('#6c706f');
  const wallCol = (v) => mixc(limeLow, lime, Math.min(1, Math.max(0, (v.y - 0.25) / 0.6)));
  const wallPiece = (g) => { walls.add(g, wallCol); cols.push(g.clone()); };
  // back wall around the window opening
  const zb = -D - T / 2;
  wallPiece(box(win.x0 + W + T, H + 0.1, T, (-W - T + win.x0) / 2, H / 2, zb, 0, 0, 0, 4));
  wallPiece(box(W + T - win.x1, H + 0.1, T, (win.x1 + W + T) / 2, H / 2, zb, 0, 0, 0, 4));
  wallPiece(box(win.x1 - win.x0, win.y0, T, (win.x0 + win.x1) / 2, win.y0 / 2, zb, 0, 0, 0, 2));
  wallPiece(box(win.x1 - win.x0, H + 0.1 - win.y1, T, (win.x0 + win.x1) / 2, (H + 0.1 + win.y1) / 2, zb, 0, 0, 0, 2));
  // side walls and the front wall with its door opening
  wallPiece(box(T, H + 0.1, 2 * D + 2 * T, -W - T / 2, H / 2, 0, 0, 0, 0, 4));
  wallPiece(box(T, H + 0.1, 2 * D + 2 * T, W + T / 2, H / 2, 0, 0, 0, 0, 4));
  const door = { x0: 1.0, x1: 1.85, y1: 1.95 };
  wallPiece(box(door.x0 + W, H + 0.1, T, (door.x0 - W) / 2, H / 2, D + T / 2, 0, 0, 0, 4));
  wallPiece(box(W - door.x1, H + 0.1, T, (door.x1 + W) / 2, H / 2, D + T / 2, 0, 0, 0, 2));
  wallPiece(box(door.x1 - door.x0, H + 0.1 - door.y1, T, (door.x0 + door.x1) / 2, (H + 0.1 + door.y1) / 2, D + T / 2));
  walls.add(box(door.x1 - door.x0, door.y1, 0.06, (door.x0 + door.x1) / 2, door.y1 / 2, D + T - 0.03), '#2a2420');   // a door in the outer face, closed
  walls.build();

  // ---------------------------------------------------------------- floor: flagstones; ceiling planks and beams
  const floorMat = setMat({ id: 21, kind: 4, scale: 1, grime: 0.6, wear: 0.4 });
  const floor = bag(root, 'kitchen_floor', floorMat);
  const fl = box(2 * W + 2 * T, 0.2, 2 * D + 2 * T, 0, -0.1, 0, 0, 0, 0, 8);
  floor.add(fl, (v) => (Math.hypot(v.x - 0.6, v.z + 1.0) < 0.9 ? hex('#5c5e5e') : hex('#4a4c4e')));
  cols.push(fl.clone());
  floor.build();
  // a rag rug under the table
  const rugMat = setMat({ id: 26, kind: 5, scale: 3, grime: 0.3 });
  const rug = bag(root, 'kitchen_rug', rugMat);
  rug.add(box(1.7, 0.012, 1.15, K.table.x, 0.006, K.table.z + 0.1, 0, 0.05, 0, 1), (v) => {
    const r = Math.max(Math.abs(v.x - K.table.x) / 0.85, Math.abs(v.z - K.table.z - 0.1) / 0.575);
    const b = Math.floor(r * 5) % 2;
    return b ? hex('#3c4c5a') : hex('#6a5a46');
  });
  rug.build();

  const woodMat = setMat({ id: 22, kind: 2, scale: 1, axis: 0, plank: 0.19, grime: 0.35 });
  const ceil = bag(root, 'kitchen_ceiling', setMat({ id: 23, kind: 2, scale: 1, axis: 2, plank: 0.17, grime: 0.6, soot: 0.6, sootY: [2.2, 2.5] }));
  ceil.add(box(2 * W + 2 * T, 0.06, 2 * D + 2 * T, 0, H + 0.03, 0, 0, 0, 0, 4), '#3e3026');
  for (const x of [-1.6, -0.4, 0.8, 2.0]) ceil.add(box(0.2, 0.22, 2 * D + 0.4, x, H - 0.11, 0), '#2a2018');
  ceil.add(box(0.26, 0.26, 2 * W, 0, H - 0.13, -D + 0.14, 0, 0, 0), '#241b14');   // the lintel beam along the back wall
  ceil.build();

  // ---------------------------------------------------------------- the window: deep reveal, oak sill, casement with six panes
  const frameMat = setMat({ id: 24, kind: 2, scale: 1, axis: 1, plank: 0.5, grime: 0.3 });
  const frame = bag(root, 'kitchen_window', frameMat);
  const wx = (win.x0 + win.x1) / 2, wy = (win.y0 + win.y1) / 2, ww = win.x1 - win.x0, wh = win.y1 - win.y0;
  const sill = box(ww + 0.16, 0.05, 0.36, wx, win.y0 + 0.025, -D - 0.12);
  frame.add(sill, '#5a4636'); const sillCol = [sill.clone()];
  frame.add(box(ww + 0.22, 0.12, 0.28, wx, win.y1 + 0.06, -D - 0.1), '#3a2a1e');    // timber lintel
  const fz = win.zGlass;
  const fw = 0.055;
  frame.add(box(ww, fw, 0.07, wx, win.y0 + fw / 2 + 0.05, fz), '#86938f');
  frame.add(box(ww, fw, 0.07, wx, win.y1 - fw / 2, fz), '#86938f');
  frame.add(box(fw, wh, 0.07, win.x0 + fw / 2, wy, fz), '#86938f');
  frame.add(box(fw, wh, 0.07, win.x1 - fw / 2, wy, fz), '#86938f');
  frame.add(box(0.035, wh, 0.05, wx, wy, fz), '#86938f');
  for (const k of [1, 2]) frame.add(box(ww, 0.03, 0.045, wx, win.y0 + 0.05 + (wh - 0.05) * k / 3, fz), '#86938f');
  // the latch
  frame.add(box(0.02, 0.09, 0.02, wx + 0.05, wy, fz + 0.045), '#2a2a2a');
  frame.build();
  // a cotton curtain half drawn to the left on an iron rod, faded blue stripe, folds; and a few things on the sill
  const rod = bag(root, 'kitchen_curtainRod', setMat({ id: 27, kind: 3, scale: 1, grime: 0.3, gloss: 0.3 }));
  rod.add(cyl(0.012, 0.012, ww + 0.5, wx, win.y1 + 0.03, -D + 0.07, 0, 0, Math.PI / 2, 8), '#24262a');
  for (const s of [-1, 1]) rod.add(sph(0.022, wx + s * (ww / 2 + 0.25), win.y1 + 0.03, -D + 0.07, 8, 6), '#24262a');
  rod.build();
  // the curtain: soft cotton, many shallow folds gathered at the rod, the hem stirred by the draught round the old frame
  const cw = 0.4, chh = win.y1 + 0.02 - (win.y0 + 0.1), cx0 = win.x0 - 0.2;
  const curG = new THREE.PlaneGeometry(cw, chh, 48, 16);
  const cP = curG.attributes.position, cBase = new Float32Array(cP.count * 3), cUV = new Float32Array(cP.count * 2);
  for (let i = 0; i < cP.count; i++) {
    const x = cP.getX(i), y = cP.getY(i), u = (x + cw / 2) / cw, v = (y + chh / 2) / chh;
    const fold = Math.sin(u * Math.PI * 6.5 + v * 0.4) * (0.016 + 0.01 * (1 - v)) + Math.sin(u * Math.PI * 2.5 + 1.0) * 0.01;
    cBase[i * 3] = cx0 + x * (0.72 + 0.28 * (1 - v) * 0.5 + 0.28 * v);
    cBase[i * 3 + 1] = win.y0 + 0.1 + chh / 2 + y;
    cBase[i * 3 + 2] = -D + 0.06 + fold + (1 - v) * 0.02;
    cUV[i * 2] = u; cUV[i * 2 + 1] = v;
    cP.setXYZ(i, cBase[i * 3], cBase[i * 3 + 1], cBase[i * 3 + 2]);
  }
  curG.computeVertexNormals();
  paint(curG, (vv) => { const u = (vv.x - cx0) / cw + 0.5; const st = Math.abs(((u * 5) % 1) - 0.5) < 0.06; return st ? hex('#6c8096') : hex('#b8bcb6'); });
  const curtain = new THREE.Mesh(curG, setMat({ id: 26, kind: 5, scale: 3, grime: 0.15 })); curtain.name = 'kitchen_curtain'; curtain.frustumCulled = false; root.add(curtain);
  // draught: slow swells with a quicker flutter on top, strongest at the hem and the free (right) edge; on twos
  function curtainAt(t) {
    const q = Math.floor(t * 12 + 1e-6) / 12;
    const gust = 0.5 + 0.5 * Math.sin(q * 0.9) * Math.sin(q * 0.37 + 1.0);
    for (let i = 0; i < cP.count; i++) {
      const u = cUV[i * 2], v = cUV[i * 2 + 1], w = Math.pow(1 - v, 1.6) * (0.4 + 0.6 * u);
      const flut = Math.sin(q * 5.2 + u * 9.0 + v * 4.0) * 0.4 + Math.sin(q * 2.3 + u * 4.0) * 0.6;
      cP.setXYZ(i, cBase[i * 3] + w * 0.045 * gust * flut, cBase[i * 3 + 1] + w * 0.012 * gust, cBase[i * 3 + 2] + w * (0.09 * gust + 0.03 * flut));
    }
    cP.needsUpdate = true; curG.computeVertexNormals();
  }
  const sillThings = bag(root, 'kitchen_sillThings', setMat({ id: 29, kind: 5, scale: 4, grime: 0.2, gloss: 0.6 }));
  // a terracotta pot of thyme at the right end, a jar with a sea shell, a candle stub in a tin holder
  const sy = win.y0 + 0.05, sz = -D - 0.14;
  sillThings.add(lathe([[0.001, 0], [0.05, 0], [0.065, 0.1], [0.07, 0.11], [0.001, 0.11]], 16).translate(win.x1 - 0.06, sy, sz), '#8a4a30');
  for (let i = 0; i < 9; i++) { const a = i * 2.4, r = 0.02 + (i % 3) * 0.012; sillThings.add(ell(0.012, 0.06, 0.012, win.x1 - 0.06 + Math.cos(a) * r, sy + 0.15, sz + Math.sin(a) * r, 5, 4), '#3e5234'); }
  sillThings.add(lathe([[0.001, 0], [0.035, 0], [0.036, 0.08], [0.028, 0.095], [0.03, 0.1], [0.001, 0.1]], 14).translate(win.x0 + 0.09, sy, sz + 0.04), '#9ab0a8');
  sillThings.add(ell(0.022, 0.016, 0.03, win.x0 + 0.09, sy + 0.03, sz + 0.04, 8, 6), '#e0c8b0');
  sillThings.build();
  const glassMat = windowMat(0, { rain: 1 });
  const glassG = new THREE.PlaneGeometry(ww - 0.02, wh - 0.02, 1, 1).translate(wx, wy, fz - 0.005);
  const glass = new THREE.Mesh(glassG, glassMat); glass.name = 'kitchen_glass'; glass.userData.noShadow = true; root.add(glass);
  glassMat.uniforms.uWinC.value.set(O[0] + wx, O[1] + wy, O[2] + fz);
  glassMat.uniforms.uOut.value.set(0, 0, -1);
  glassMat.uniforms.uRight.value.set(1, 0, 0);
  glassMat.uniforms.uFog.value.set(0.55, wh / 2, 0);
  // a damp streak below the sill where the window weeps

  // ---------------------------------------------------------------- the table and two chairs
  const tb = K.table;
  const furn = bag(root, 'kitchen_table', woodMat);
  const top = box(tb.w, 0.05, tb.d, tb.x, tb.h - 0.025, tb.z, 0, 0, 0, 2);
  furn.add(top, '#8a6c4c'); const tableCol = [top.clone()];
  furn.add(box(tb.w - 0.14, 0.09, tb.d - 0.14, tb.x, tb.h - 0.095, tb.z), '#4e3826');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = box(0.065, tb.h - 0.05, 0.065, tb.x + sx * (tb.w / 2 - 0.08), (tb.h - 0.05) / 2, tb.z + sz * (tb.d / 2 - 0.08));
    furn.add(leg, '#4e3826'); cols.push(leg.clone());
  }
  const chair = (x, z, ry) => {
    const g = [];
    const M = new THREE.Matrix4().makeRotationY(ry).setPosition(x, 0, z);
    g.push(box(0.42, 0.04, 0.4, 0, 0.45, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.push(box(0.04, 0.45, 0.04, sx * 0.18, 0.225, sz * 0.17));
    for (const sx of [-1, 1]) g.push(box(0.04, 0.48, 0.04, sx * 0.18, 0.71, -0.17));
    for (let i = 0; i < 3; i++) g.push(box(0.36, 0.04, 0.025, 0, 0.6 + i * 0.13, -0.17));
    for (const p of g) { p.applyMatrix4(M); furn.add(p, '#5e442e'); }
  };
  chair(tb.x - 0.2, tb.z + 0.62, 0.15 + Math.PI);
  chair(tb.x - 0.95, tb.z - 0.05, -Math.PI / 2 - 0.3);
  furn.build();

  // ---------------------------------------------------------------- the oil lamp: brass font, glass chimney, flame
  const brassMat = setMat({ id: 25, kind: 3, scale: 1, gloss: 1, grime: 0.2 });
  const lampB = bag(root, 'kitchen_lampBase', brassMat);
  const [lx, ly, lz] = K.lamp;
  const lampBase = lathe([[0.001, 0], [0.075, 0], [0.078, 0.012], [0.05, 0.03], [0.035, 0.06], [0.07, 0.1], [0.078, 0.14], [0.06, 0.17], [0.03, 0.185], [0.028, 0.2], [0.001, 0.2]], 28);
  lampBase.translate(lx, ly, lz);
  lampB.add(lampBase, '#b88a3c');
  lampB.add(torus(0.042, 0.009, lx, ly + 0.205, lz, Math.PI / 2, 0, 0, 8, 24), '#d0a050');
  lampB.add(cyl(0.006, 0.006, 0.05, lx + 0.045, ly + 0.2, lz, 0, 0, Math.PI / 2, 8), '#d0a050');   // the wick key
  lampB.add(sph(0.012, lx + 0.072, ly + 0.2, lz, 8, 6), '#d0a050');
  lampB.build();
  const chimMat = glowMat({ color: '#ffd9a0', k: 1.2, id: 122 });
  const chim = new THREE.Mesh(paint(lathe([[0.03, 0], [0.042, 0.03], [0.05, 0.07], [0.045, 0.11], [0.027, 0.15], [0.025, 0.22], [0.024, 0.22]], 24).translate(lx, ly + 0.205, lz), (v) => {
    const h = (v.y - ly - 0.205) / 0.22; return mixc(mixc(hex('#ffffff'), hex('#ffb070'), Math.abs(h - 0.25) * 1.4), hex('#3a2a20'), Math.max(0, h - 0.62) * 2.2);
  }), chimMat);
  chim.name = 'kitchen_chimney'; root.add(chim);
  const flame = flameMesh(flameMat({ k: 1.7, seed: 1.3 }), 0.026, 0.06);
  flame.position.set(lx, ly + 0.215, lz); root.add(flame);

  // ---------------------------------------------------------------- the range: a cold iron stove in a stone hearth, the kettle on it
  const ironMat = setMat({ id: 27, kind: 3, scale: 1, gloss: 0.4, grime: 0.6 });
  const hearth = bag(root, 'kitchen_hearth', wallMat);
  const hx = -W + 0.35, hz = -0.15;
  const hb = box(0.7, 2.2, 1.4, hx - 0.05, 1.1, hz, 0, 0, 0, 2);
  // the chimney breast: two cheeks and a mantel beam, the opening dark
  for (const s of [-1, 1]) { const g = box(0.55, 1.25, 0.25, hx + 0.02, 0.625, hz + s * 0.62, 0, 0, 0, 2); hearth.add(g, wallCol); cols.push(g.clone()); }
  hearth.add(box(0.55, 1.0, 1.5, hx + 0.02, 1.25 + 0.5 + 0.12, hz, 0, 0, 0, 2), (v) => mixc(hex('#5c605e'), hex('#2a2a2a'), Math.min(1, Math.max(0, (v.y - 1.5) / 0.9))));
  void hb;
  hearth.build();
  const mantel = bag(root, 'kitchen_mantel', woodMat);
  mantel.add(box(0.7, 0.12, 1.62, hx + 0.08, 1.31, hz), '#3a2a1e');
  mantel.build();
  const stove = bag(root, 'kitchen_stove', ironMat);
  const sb = box(0.5, 0.62, 0.95, hx - 0.0, 0.31, hz, 0, 0, 0, 2);
  stove.add(sb, '#24272a'); cols.push(sb.clone());
  stove.add(box(0.54, 0.04, 0.99, hx, 0.64, hz), '#1a1c1e');
  stove.add(cyl(0.09, 0.09, 0.6, hx - 0.05, 0.95, hz - 0.3, 0, 0, 0, 16), '#1e2022');
  stove.add(box(0.02, 0.3, 0.4, hx + 0.26, 0.32, hz + 0.15), '#2e3236');          // fire door
  stove.add(cyl(0.012, 0.012, 0.1, hx + 0.3, 0.38, hz + 0.3, 0, 0, Math.PI / 2, 8), '#8a8a80');
  for (let i = 0; i < 2; i++) stove.add(torus(0.12, 0.012, hx, 0.665, hz + 0.18 - i * 0.0, Math.PI / 2, 0, 0, 6, 24), '#3a3e42');
  // a coal scuttle and a poker
  stove.add(cyl(0.12, 0.15, 0.3, hx + 0.55, 0.15, hz + 0.8, 0, 0, 0, 16), '#2a2c2e');
  stove.add(cyl(0.01, 0.01, 0.7, hx + 0.38, 0.4, hz - 0.7, 0.25, 0, 0.1, 6), '#2a2c2e');
  stove.build();
  // the kettle: copper, a bail handle, sitting on the hob
  const kettleMat = setMat({ id: 28, kind: 3, scale: 1, gloss: 1, grime: 0.15 });
  const ket = bag(root, 'kitchen_kettle', kettleMat);
  const kx = hx + 0.02, ky = 0.66, kz = hz + 0.18;
  ket.add(lathe([[0.001, 0], [0.1, 0.0], [0.115, 0.04], [0.112, 0.09], [0.085, 0.14], [0.04, 0.165], [0.035, 0.18], [0.001, 0.185]], 28).translate(kx, ky, kz), '#a8623a');
  ket.add(sph(0.018, kx, ky + 0.19, kz, 10, 8), '#2a2420');
  ket.add(tube([v3(kx + 0.09, ky + 0.06, kz), v3(kx + 0.15, ky + 0.1, kz), v3(kx + 0.2, ky + 0.17, kz)], 0.014, 8, 10), '#a8623a');
  ket.add(torus(0.1, 0.008, kx, ky + 0.16, kz, 0, Math.PI / 2, 0, 6, 24, Math.PI), '#3a2a20');
  ket.build();

  // ---------------------------------------------------------------- shelves on the right wall: crockery, jars, a tin, a clock
  const shelf = bag(root, 'kitchen_shelves', woodMat);
  const sx = W - 0.14;
  for (const y of [1.25, 1.7]) {
    const s = box(0.26, 0.04, 1.6, sx, y, -0.75); shelf.add(s, '#6a4e36'); cols.push(s.clone());
    for (const z of [-1.45, -0.05]) shelf.add(box(0.03, 0.18, 0.04, W - 0.02, y - 0.1, z, 0, 0, 0.0), '#3a2a1e');
    shelf.add(box(0.012, 0.03, 1.6, sx - 0.12, y + 0.05, -0.75), '#6a4e36');   // plate rail
  }
  // a dresser below
  const dres = box(0.5, 0.9, 1.3, W - 0.25, 0.45, -0.7, 0, 0, 0, 2);
  shelf.add(dres, '#4e3826'); cols.push(dres.clone());
  shelf.add(box(0.56, 0.04, 1.36, W - 0.27, 0.92, -0.7), '#6a4e36');
  for (const z of [-1.0, -0.4]) { shelf.add(box(0.02, 0.6, 0.55, W - 0.505, 0.45, z), '#5a402c'); shelf.add(sph(0.018, W - 0.52, 0.55, z + 0.2, 8, 6), '#c8a050'); }
  shelf.build();
  const potMat = setMat({ id: 29, kind: 5, scale: 4, gloss: 0.9, grime: 0.15 });
  const pots = bag(root, 'kitchen_crockery', potMat);
  const glazes = ['#3a5a72', '#d8d2c0', '#7a5a3a', '#4a6a64', '#c8c0aa', '#5a4a6a'];
  // plates standing on the rails
  for (const y of [1.25, 1.7]) {
    let z = -1.45;
    while (z < -0.05) {
      const r = rng.range(0.09, 0.13), c = rng.pick(glazes);
      if (rng.next() < 0.55) {
        pots.add(cyl(r, r, 0.018, sx - 0.05, y + 0.02 + r, z, 0, 0, Math.PI / 2 + 0.12, 24), (v) => (Math.hypot(v.y - y - 0.02 - r, v.z - z) > r * 0.75 ? hex('#e8e2d0') : hex(c)));
        z += 0.06;
      } else {
        // jars and a tea tin
        const h = rng.range(0.1, 0.2), rr = rng.range(0.04, 0.065);
        if (rng.next() < 0.5) pots.add(lathe([[0.001, 0], [rr, 0], [rr * 1.05, h * 0.8], [rr * 0.7, h], [rr * 0.72, h * 1.08], [0.001, h * 1.08]], 16).translate(sx + 0.02, y + 0.02, z), c);
        else pots.add(cyl(rr, rr, h, sx + 0.02, y + 0.02 + h / 2, z, 0, 0, 0, 16), rng.pick(['#7a2a24', '#2a4a5a', '#a88a3a']));
        z += rr * 2 + 0.03;
      }
    }
  }
  // on the dresser: a bread crock, a jug, a bowl
  pots.add(lathe([[0.001, 0], [0.11, 0], [0.13, 0.12], [0.11, 0.22], [0.001, 0.22]], 20).translate(W - 0.25, 0.94, -1.1), '#c8b490');
  pots.add(lathe([[0.001, 0], [0.06, 0], [0.075, 0.08], [0.05, 0.16], [0.06, 0.2], [0.001, 0.2]], 18).translate(W - 0.28, 0.94, -0.5), '#3a5a72');
  pots.add(lathe([[0.001, 0], [0.05, 0], [0.12, 0.06], [0.13, 0.07], [0.001, 0.07]], 20).translate(W - 0.25, 0.94, -0.2), '#d8d2c0');
  // on the table: a bread board, a teapot, a mug (the cup Suri holds belongs to Folk)
  pots.add(lathe([[0.001, 0], [0.07, 0], [0.09, 0.06], [0.08, 0.12], [0.04, 0.14], [0.001, 0.15]], 20).translate(tb.x - 0.3, tb.h, tb.z + 0.1), '#2a4a5a');
  pots.add(tube([v3(tb.x - 0.22, tb.h + 0.06, tb.z + 0.1), v3(tb.x - 0.17, tb.h + 0.1, tb.z + 0.1), v3(tb.x - 0.15, tb.h + 0.13, tb.z + 0.1)], 0.012, 6, 8), '#2a4a5a');
  pots.add(cyl(0.04, 0.036, 0.09, tb.x - 0.05, tb.h + 0.045, tb.z + 0.25, 0, 0, 0, 16), '#d8d2c0');
  pots.add(box(0.36, 0.025, 0.22, tb.x - 0.3, tb.h + 0.0125, tb.z - 0.15, 0, 0.3, 0), '#a0805a');
  pots.add(ell(0.11, 0.05, 0.07, tb.x - 0.3, tb.h + 0.05, tb.z - 0.15, 14, 10), '#9a6a3a');
  pots.build();

  // ---------------------------------------------------------------- herbs and a ladle hung from the beam, an oilskin on a peg by the door
  const hang = bag(root, 'kitchen_hangings', setMat({ id: 26, kind: 5, scale: 4, grime: 0.3 }));
  for (let i = 0; i < 4; i++) {
    const x = 0.8, z = -1.2 + i * 0.32, y = H - 0.22;
    hang.add(cyl(0.004, 0.004, 0.15, x, y - 0.075, z, 0, 0, 0, 4), '#2a2420');
    hang.add(ell(0.045, 0.12, 0.045, x, y - 0.24, z, 10, 8), i % 2 ? '#3e4a30' : '#4a4a32');
  }
  // the coat: a yellow-grey oilskin (grandpa's, dark-dyed so it never competes with Suri's yellow)
  hang.add(cyl(0.02, 0.02, 0.12, door.x0 - 0.25, 1.7, D - 0.06, Math.PI / 2, 0, 0, 6), '#3a2a1e');
  hang.add(ell(0.2, 0.55, 0.09, door.x0 - 0.25, 1.15, D - 0.12, 14, 12), '#3a4436');
  hang.build();

  // a framed picture of a boat (Kestrel) above the table: a small painted card
  const pic = bag(root, 'kitchen_picture', woodMat);
  pic.add(box(0.42, 0.32, 0.03, -0.9, 1.6, -D + 0.02), '#2a1e16');
  pic.build();
  const picMat = glowMat({ color: '#ffffff', k: 0.0, id: 26 });
  void picMat;
  const card = bag(root, 'kitchen_pictureCard', setMat({ id: 29, kind: 5, scale: 8, grime: 0.0 }));
  card.add(box(0.34, 0.24, 0.005, -0.9, 1.6, -D + 0.037), (v) => {
    // a red hull with a white cabin on a blue sea
    const x = v.x + 0.9, y = v.y - 1.6;
    if (y < -0.05) return hex('#3a5a7a');
    if (y < 0.0 && Math.abs(x) < 0.11 - (y + 0.05) * 0.4) return hex('#a83a2a');
    if (y < 0.05 && x > -0.04 && x < 0.04) return hex('#e8e2d0');
    return hex('#b8c0b8');
  });
  card.build();

  proxy(root, 'kitchen_solid', cols, ctx);
  proxy(root, 'kitchen_sill', sillCol, ctx);       // hands, elbows and the cup touch these: name them in a contact list
  proxy(root, 'kitchen_table', tableCol, ctx);
  return {
    root, glassMat, flame, chimMat, curtainAt, towerAim: 0.12, towerAimY: 0.22,
    anchors: {
      kitchenWindow: [O[0] + wx, O[1] + wy, O[2] + fz],
      kitchenSill: [O[0] + wx, O[1] + win.y0 + 0.05, O[2] - D - 0.02],
      kitchenLamp: [O[0] + KITCHEN_FLAME[0], O[1] + KITCHEN_FLAME[1], O[2] + KITCHEN_FLAME[2]],
      kitchenTable: [O[0] + tb.x, O[1] + tb.h, O[2] + tb.z],
    },
  };
}
