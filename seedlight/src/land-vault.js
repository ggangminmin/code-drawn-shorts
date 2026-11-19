// SEEDLIGHT, land department: the vault inside the dam and the well shaft above it.
import * as THREE from 'three';
import { Bag, xf, one } from './land-geo.js';
import { stoneMaterial, metalMaterial, LU } from './land-mat.js';
import { VAULT, WELL } from './layout.js';
import { CUES } from './shots.js';
import { Rng } from './util.js';

export const GRATE = [-119, 78, 2];
export const DOOR = { x: -88, z0: -2.9, z1: 2.9, y1: 68.2 };

export function buildVault(ctx) {
  const root = new THREE.Group(); root.name = 'vault';
  const stone = stoneMaterial({ kind: 5, color: '#8fa0a8', seed: 2 });
  const shaftM = stoneMaterial({ kind: 5, color: '#94a4aa', seed: 7, cyl: [WELL.center[0], WELL.center[1], WELL.r, 1] });
  const iron = metalMaterial({ kind: 1, interior: 1 });
  const copper = metalMaterial({ kind: 0, interior: 1 });
  const grille = metalMaterial({ kind: 1, interior: 1, grille: 1 });
  const add = (m) => { root.add(m); return m; };
  const rng = new Rng(977);
  const X0 = -132, X1 = -88, Z0 = -15, Z1 = 15, Y0 = VAULT.floorY, Y1 = Y0 + 16;

  const floor = one(new THREE.BoxGeometry(X1 - X0 + 4, 1, Z1 - Z0 + 4), stone, xf((X0 + X1) / 2, Y0 - 0.5, 0), 'vaultFloor'); add(floor);
  ctx.colliders.push({ name: 'vaultFloor', dept: 'land', obj: floor, kind: 'solid' });

  const b = new Bag();
  b.box(2, 18, 34, X0 - 1, Y0 + 8, 0);
  b.box(48, 18, 2, -110, Y0 + 8, Z0 - 1); b.box(48, 18, 2, -110, Y0 + 8, Z1 + 1);
  b.box(2, 18, DOOR.z0 - Z0 + 2, X1 + 1, Y0 + 8, (Z0 - 2 + DOOR.z0) / 2); b.box(2, 18, Z1 + 2 - DOOR.z1, X1 + 1, Y0 + 8, (Z1 + 2 + DOOR.z1) / 2);
  b.box(2, Y1 + 2 - DOOR.y1, DOOR.z1 - DOOR.z0, X1 + 1, (Y1 + 2 + DOOR.y1) / 2, 0);
  // skirting course and a ledge at springer height
  b.box(44, 0.9, 0.5, -110, Y0 + 0.45, Z0 + 0.25); b.box(44, 0.9, 0.5, -110, Y0 + 0.45, Z1 - 0.25); b.box(0.5, 0.9, 30, X0 + 0.25, Y0 + 0.45, 0);
  b.box(44, 0.5, 0.45, -110, Y0 + 11.6, Z0 + 0.22); b.box(44, 0.5, 0.45, -110, Y0 + 11.6, Z1 - 0.22); b.box(0.45, 0.5, 30, X0 + 0.22, Y0 + 11.6, 0);
  // blind arches on the long walls
  for (const z of [Z0 + 0.3, Z1 - 0.3]) for (const x of [-121, -110, -99]) { b.box(0.9, 11, 0.6, x - 4.2, Y0 + 5.5, z); b.box(0.9, 11, 0.6, x + 4.2, Y0 + 5.5, z); b.box(9.3, 0.9, 0.6, x, Y0 + 11.0, z); }
  // corridor beyond the door (dark, turns away)
  b.box(16, 1, 9, X1 + 8, Y0 - 0.5, 0); b.box(16, 1, 9, X1 + 8, DOOR.y1 + 1.5, 0); b.box(14, 9, 1, X1 + 9, Y0 + 4, -4); b.box(14, 9, 1, X1 + 9, Y0 + 4, 4); b.box(1, 9, 9, X1 + 16.5, Y0 + 4, 0);
  // rubble in the corners
  for (let i = 0; i < 26; i++) { const cx = rng.next() < 0.5 ? X0 + rng.range(0.6, 3.4) : rng.range(X0 + 1, X1 - 1), cz = (rng.next() < 0.5 ? -1 : 1) * rng.range(11.6, 14.3); const s = rng.range(0.3, 1.1); b.box(s * 1.4, s, s, cx, Y0 + s * 0.4, cz, rng.range(0, 3), rng.range(-0.3, 0.3), rng.range(-0.3, 0.3)); }
  // shaft over the ceiling grate
  for (const [dx, dz, w, d] of [[-1.75, 0, 0.5, 4], [1.75, 0, 0.5, 4], [0, -1.75, 4, 0.5], [0, 1.75, 4, 0.5]]) b.box(w, 9, d, GRATE[0] + dx, Y1 + 4.5 + 1.5, GRATE[2] + dz);
  add(b.mesh(stone, 'vaultWalls'));
  // ceiling with the well mouth and the grate cut out; beams
  {
    const s = new THREE.Shape(); s.moveTo(X0 - 2, Z0 - 2); s.lineTo(X1 + 2, Z0 - 2); s.lineTo(X1 + 2, Z1 + 2); s.lineTo(X0 - 2, Z1 + 2); s.closePath();
    const h1 = new THREE.Path(); h1.absarc(WELL.center[0], WELL.center[1], WELL.r, 0, Math.PI * 2, true); s.holes.push(h1);
    const h2 = new THREE.Path(); h2.moveTo(GRATE[0] - 1.5, GRATE[2] - 1.5); h2.lineTo(GRATE[0] - 1.5, GRATE[2] + 1.5); h2.lineTo(GRATE[0] + 1.5, GRATE[2] + 1.5); h2.lineTo(GRATE[0] + 1.5, GRATE[2] - 1.5); h2.closePath(); s.holes.push(h2);
    add(one(new THREE.ExtrudeGeometry(s, { depth: 1.5, bevelEnabled: false, curveSegments: 40 }), stone, xf(0, Y1 + 1.5, 0, Math.PI / 2), 'vaultCeiling'));
    const bm = new Bag();
    for (const x of [-129, -124.5, -102.5, -98, -93.5, -89.5]) bm.box(0.9, 1.1, 30, x, Y1 - 0.55, 0);
    bm.box(44, 0.8, 0.9, -110, Y1 - 0.4, -9); bm.box(44, 0.8, 0.9, -110, Y1 - 0.4, 9);
    bm.lathe([[5.5, 0], [6.3, 0], [6.3, -0.7], [5.9, -0.9], [5.5, -0.7]], WELL.center[0], Y1, WELL.center[1], 40);
    add(bm.mesh(stone, 'vaultBeams'));
  }
  // pillars (solid)
  {
    const p = new Bag();
    for (const z of [-9, 9]) for (const x of [-126, -116, -104, -94]) {
      p.box(1.7, 16, 1.7, x, Y0 + 8, z); p.box(2.5, 0.9, 2.5, x, Y0 + 0.45, z); p.box(2.1, 0.4, 2.1, x, Y0 + 1.1, z);
      p.box(2.6, 0.8, 2.6, x, Y1 - 1.2, z); p.box(2.1, 0.5, 2.1, x, Y1 - 1.85, z);
    }
    const pil = p.mesh(stone, 'vaultPillars'); add(pil);
    // arched ribs springing from the pillars: across the nave and out to the side walls
    const ar = new Bag();
    for (const x of [-126, -116, -104, -94]) {
      for (let i = 0; i < 12; i++) { const a0 = Math.PI * i / 12, a1 = Math.PI * (i + 1) / 12, am = (a0 + a1) / 2; ar.box(1.0, 0.8, 2.5, x, Y0 + 12.4 + Math.sin(am) * 3.0, -Math.cos(am) * 8.2, 0, -Math.atan2(Math.cos(am) * 3.0, Math.sin(am) * 8.2)); }
      for (const sg of [-1, 1]) for (let i = 0; i < 5; i++) { const am = Math.PI / 2 * (i + 0.5) / 5; ar.box(0.9, 0.7, 1.5, x, Y0 + 12.4 + Math.sin(am) * 3.0, sg * (15 - (1 - Math.cos(am)) * 5.2), 0, sg * Math.atan2(Math.sin(am) * 5.2, Math.cos(am) * 3.0) * -1); }
    }
    add(ar.mesh(stone, 'vaultArches'));
    // the plinth rim round the slab (the bed itself stays at floor level)
    const pr = new Bag();
    pr.box(15.6, 0.3, 0.7, -118, Y0 + 0.15, 2 - 3.75); pr.box(15.6, 0.3, 0.7, -118, Y0 + 0.15, 2 + 3.75); pr.box(0.7, 0.3, 6.8, -118 - 7.55, Y0 + 0.15, 2); pr.box(0.7, 0.3, 6.8, -118 + 7.55, Y0 + 0.15, 2);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) pr.box(1.2, 0.55, 1.2, -118 + sx * 7.55, Y0 + 0.27, 2 + sz * 3.75);
    add(pr.mesh(stone, 'slabRim'));
    ctx.colliders.push({ name: 'vaultPillars', dept: 'land', obj: pil, kind: 'solid' });
  }
  // chains: hanging from the ceiling, and two swags between the pillars
  {
    const c = new Bag();
    const link = (x, y, z, i, dirx = 0, dirz = 0) => c.add(new THREE.TorusGeometry(0.17, 0.045, 5, 8), xf(x, y, z, dirx, (i % 2) * Math.PI / 2, dirz, 0.7, 1, 1));
    for (const [x, z, len] of [[-128.5, -6, 8.5], [-124.5, -11, 5], [-99, -11.5, 9.5], [-96.5, 6.5, 6], [-106, 12, 11], [-121, 12.5, 7.5], [-91, -7, 12], [-130, 9, 12.5]]) {
      const n = Math.floor(len / 0.27);
      for (let i = 0; i < n; i++) link(x + Math.sin(i * 0.4) * 0.02, Y1 - 0.3 - i * 0.27, z, i);
      c.cyl(0.05, 0.05, 0.5, x, Y1 - 0.1, z, 6);
      if (len > 9) { c.torus(0.3, 0.06, x, Y1 - 0.5 - n * 0.27, z, 0.2, 0, 10, 5); }
    }
    for (const z of [-9, 9]) {
      const xa = z < 0 ? -116 : -104, xb = z < 0 ? -104 : -94;
      for (let i = 0; i <= 44; i++) { const k = i / 44, x = xa + 0.9 + (xb - xa - 1.8) * k, y = Y0 + 12.6 - 2.6 * 4 * k * (1 - k); link(x, y, z + 0.95 * (z < 0 ? 1 : -1), i, Math.PI / 2, 0); }
    }
    // the four heavy chains that held it: from rings on the plinth corners up to the ceiling, hanging slack
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x0 = -118 + sx * 7.55, z0 = 2 + sz * 3.75, x1 = x0 + sx * 1.6, z1 = z0 + sz * 2.2;
      for (let i = 0; i <= 40; i++) { const k = i / 40, kk = Math.pow(k, 2.2); c.add(new THREE.TorusGeometry(0.3, 0.085, 5, 8), xf(x0 + (x1 - x0) * k, Y0 + 0.75 + (Y1 - Y0 - 0.9) * kk, z0 + (z1 - z0) * k, 0, (i % 2) * Math.PI / 2 + sx, 0, 0.7, 1, 1)); }
      c.torus(0.42, 0.1, x0, Y0 + 0.7, z0, 0, sx, 10, 5);
    }
    add(c.mesh(iron, 'vaultChains'));
  }
  // ceiling grate
  {
    const g = new Bag();
    for (let i = 0; i < 7; i++) g.box(3.3, 0.12, 0.12, GRATE[0], Y1 + 0.2, GRATE[2] - 1.35 + i * 0.45);
    g.box(0.14, 0.14, 3.3, GRATE[0] - 0.8, Y1 + 0.3, GRATE[2]); g.box(0.14, 0.14, 3.3, GRATE[0] + 0.8, Y1 + 0.3, GRATE[2]);
    g.box(3.5, 0.2, 0.2, GRATE[0], Y1 + 0.05, GRATE[2] - 1.6); g.box(3.5, 0.2, 0.2, GRATE[0], Y1 + 0.05, GRATE[2] + 1.6); g.box(0.2, 0.2, 3.5, GRATE[0] - 1.6, Y1 + 0.05, GRATE[2]); g.box(0.2, 0.2, 3.5, GRATE[0] + 1.6, Y1 + 0.05, GRATE[2]);
    // door frame
    g.box(0.5, DOOR.y1 - Y0 + 0.5, 0.5, DOOR.x - 0.1, (Y0 + DOOR.y1) / 2 + 0.25, DOOR.z0 - 0.25); g.box(0.5, DOOR.y1 - Y0 + 0.5, 0.5, DOOR.x - 0.1, (Y0 + DOOR.y1) / 2 + 0.25, DOOR.z1 + 0.25); g.box(0.5, 0.5, DOOR.z1 - DOOR.z0 + 1, DOOR.x - 0.1, DOOR.y1 + 0.25, 0);
    add(g.mesh(iron, 'vaultIron'));
  }
  // the iron door: lattice above, plate below; hidden once it bursts
  const door = new THREE.Group(); door.position.set(DOOR.x + 0.4, Y0, 0);
  {
    const d = new Bag();
    d.box(0.16, DOOR.y1 - Y0, DOOR.z1 - DOOR.z0, 0, (DOOR.y1 - Y0) / 2, 0);
    door.add(d.mesh(grille, 'doorLeaf'));
    const f = new Bag();
    for (const y of [0.25, 1.1, 3.4, DOOR.y1 - Y0 - 0.25]) f.box(0.3, 0.3, DOOR.z1 - DOOR.z0, 0, y, 0);
    f.box(0.32, DOOR.y1 - Y0, 0.26, 0, (DOOR.y1 - Y0) / 2, 0);
    for (const z of [-2.5, -1.2, 1.2, 2.5]) for (const y of [0.25, 1.1, 3.4, 5.95]) f.sph(0.12, -0.2, y, z, 1, 6, 4);
    f.torus(0.28, 0.05, -0.25, 2.5, 0.7, 0, Math.PI / 2, 10, 5); f.torus(0.28, 0.05, -0.25, 2.5, -0.7, 0, Math.PI / 2, 10, 5);
    door.add(f.mesh(iron, 'doorBars'));
    add(door);
  }
  // the well shaft: ribbed stone, rungs, pipes
  {
    const sh = one(new THREE.CylinderGeometry(WELL.r, WELL.r, WELL.top - Y1 + 0.5, 48, 1, true), shaftM, xf(WELL.center[0], (WELL.top + Y1) / 2 + 0.25, WELL.center[1]), 'wellShaft'); add(sh);
    const r = new Bag();
    for (let y = Y1 + 3.5; y < WELL.top - 1; y += 3.6) r.lathe([[5.5, -0.42], [5.06, -0.24], [5.06, 0.24], [5.5, 0.42]], WELL.center[0], y, WELL.center[1], 44);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.3; r.box(0.5, WELL.top - Y1, 0.34, WELL.center[0] + Math.cos(a) * 5.36, (WELL.top + Y1) / 2, WELL.center[1] + Math.sin(a) * 5.36, -a + Math.PI / 2); }
    add(r.mesh(shaftM, 'wellRibs'));
    const ir = new Bag(), cu = new Bag();
    for (let y = Y1 + 0.6; y < WELL.top - 0.3; y += 0.6) ir.box(0.9, 0.07, 0.07, WELL.center[0] + Math.cos(2.2) * 5.0, y, WELL.center[1] + Math.sin(2.2) * 5.0, -2.2 + Math.PI / 2);
    for (const a of [2.2 - 0.09, 2.2 + 0.09]) ir.cyl(0.05, 0.05, WELL.top - Y1, WELL.center[0] + Math.cos(a) * 5.0, (WELL.top + Y1) / 2, WELL.center[1] + Math.sin(a) * 5.0, 6);
    for (const a of [4.3, 4.55, 0.9]) { cu.cyl(0.26, 0.26, WELL.top - Y1, WELL.center[0] + Math.cos(a) * 5.05, (WELL.top + Y1) / 2, WELL.center[1] + Math.sin(a) * 5.05, 10); for (let y = Y1 + 2; y < WELL.top; y += 7.2) cu.torus(0.34, 0.08, WELL.center[0] + Math.cos(a) * 5.05, y, WELL.center[1] + Math.sin(a) * 5.05, Math.PI / 2, 0, 10, 5); }
    add(ir.mesh(iron, 'wellRungs')); add(cu.mesh(copper, 'wellPipes'));
  }
  ctx.scene.add(root);
  function update(st) {
    const t = st.t;
    const gone = t >= CUES.doorBurst;
    door.visible = !gone;
    LU.uDoorGone.value = gone ? 1 : 0;
    LU.uDoorHot.value = gone ? Math.max(0.1, Math.exp(-(t - CUES.doorBurst) / 3.5)) : 0;
  }
  const anchors = {
    grate: (o) => o.set(GRATE[0], GRATE[1], GRATE[2]),
    vaultDoor: (o) => o.set(DOOR.x, Y0 + 3.3, 0),
  };
  return { root, update, anchors, door };
}
