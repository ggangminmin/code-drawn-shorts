// SEEDLIGHT, land department: the Weir. Canyon, dam, crown, ramparts, gun towers, barracks, keep, the round tower.
import * as THREE from 'three';
import { Bag, xf, one, loft, terrainY, terrainMesh } from './land-geo.js';
import { stoneMaterial, metalMaterial, waterMaterial, glowMaterial, LU } from './land-mat.js';
import { DAM, KEEP, TOWER, COURT, WELL, WALL, GUN, ROOF, RESERVOIR_Y, SHELLS, burnt } from './layout.js';
import { CUES } from './shots.js';
import { Rng, smooth, clamp } from './util.js';

const BONE = '#dedbd0';
export const faceZ = (y) => 45 + 95 * Math.pow(Math.max(0, (120 - y) / 120), 1.6);
export const KEEPBOX = { x0: -32, x1: 32, z0: -30, z1: 14 };
export const TOPPLE = { x: 190, z: -41.5 };   // upstream wall: a clean silhouette against the fire, falls into the reservoir
export const WALK_Y = 129;
const SIREN_X = -100;

export function buildWeir(ctx) {
  const root = new THREE.Group(); root.name = 'weir';
  const M = {
    dam: stoneMaterial({ kind: 0, color: '#dcd8cb' }),
    wall: stoneMaterial({ kind: 1, color: BONE, baseY: 120 }),
    wallWin: stoneMaterial({ kind: 1, color: BONE, baseY: 120, windows: 1, seed: 3 }),
    east: stoneMaterial({ kind: 1, color: BONE, baseY: 120, burnable: 1, topH: 10.4, seed: 5 }),
    eastTower: stoneMaterial({ kind: 1, color: BONE, baseY: 120, burnable: 1, topH: 1000, seed: 6 }),
    keep: stoneMaterial({ kind: 1, color: '#dcd6c6', baseY: 120, windows: 1, seed: 9 }),
    tower: stoneMaterial({ kind: 2, color: '#e2dccb', baseY: 150, cyl: [TOWER.center[0], TOWER.center[2], TOWER.r, 1], windows: 1 }),
    roofStone: stoneMaterial({ kind: 1, color: '#d4cebd', baseY: 214, cyl: [TOWER.center[0], TOWER.center[2], TOWER.r, 1] }),
    court: stoneMaterial({ kind: 1, color: '#cfc9b8', baseY: 120, cyl: [COURT.center[0], COURT.center[2], COURT.r, 1] }),
    terrain: stoneMaterial({ kind: 3 }),
    tile: stoneMaterial({ kind: 6, color: '#3e7f70' }),
    copper: metalMaterial({ kind: 0 }),
    copperE: metalMaterial({ kind: 0, burnable: 1 }),
    iron: metalMaterial({ kind: 1 }),
    brass: metalMaterial({ kind: 3 }),
    dark: glowMaterial({ color: '#000000', power: 0, off: '#05090a' }),
    water: waterMaterial(),
    fall: glowMaterial({ mode: 2 }),
  };
  const add = (m) => { root.add(m); return m; };
  const rng = new Rng(4411);

  // ------------------------------------------------------------ terrain + reservoir
  add(terrainMesh(M.terrain, -1320, 1320, -1800, 2400, 12));
  add(terrainMesh(M.terrain, -6600, 6600, -6600, 6600, 110, [-1200, 1200, -1680, 2280]));
  const water = one(new THREE.PlaneGeometry(5200, 6600, 1, 1), M.water, xf(0, RESERVOIR_Y, -45 - 3300, -Math.PI / 2));
  add(water);

  // ------------------------------------------------------------ the dam
  {
    const b = new Bag();
    const X0 = -385, X1 = 385;
    // downstream face
    const rows = [];
    for (let i = 0; i <= 44; i++) { const y = 120 - 235 * (i / 44); rows.push([[X1, y, faceZ(y)], [X0, y, faceZ(y)]]); }
    b.add(loft(rows));
    // upstream face
    b.add(loft([[[X0, 120, -45], [X1, 120, -45]], [[X0, 50, -45], [X1, 50, -45]]]));
    // cornice under the crown lip with a corbel course
    b.box(X1 - X0, 3.2, 3.4, 0, 118.4, 46.4);
    for (let x = -328; x <= 328; x += 5.6) b.box(1.7, 3.0, 2.6, x, 115.6, 45.8);
    b.box(X1 - X0, 1.2, 1.8, 0, 111.4, faceZ(111.4) + 0.4);
    // buttresses following the batter of the face
    for (let i = 0; i < 10; i++) {
      const x = -297 + i * 66, w = 7;
      const L = [], R = [];
      for (let k = 0; k <= 24; k++) {
        const y = 106 - 216 * (k / 24);
        const zf = faceZ(y) - 1, zo = faceZ(y) + 4 + 22 * clamp((106 - y) / 190);
        L.push([[x - w, y, zf], [x - w * 0.8, y, zo], [x + w * 0.8, y, zo], [x + w, y, zf]]);
      }
      b.add(loft(L));
      b.add(loft([[[x - w, 106, faceZ(106) - 1], [x + w, 106, faceZ(106) - 1]], [[x - w * 0.8, 106, faceZ(106) + 4], [x + w * 0.8, 106, faceZ(106) + 4]]]));
      // stepped offsets on the buttress front
      for (const y of [70, 30, -10]) b.box(w * 2 + 2, 2.4, 3, x, y, faceZ(y) + 4 + 22 * clamp((106 - y) / 190) + 0.6);
    }
    // sluice portals between the buttresses
    for (let i = 1; i < 8; i++) {
      const x = -264 + i * 66, y = 44, z = faceZ(30) - 3;
      b.box(24, 34, 12, x, y, z - 1);
      b.box(27, 3, 14, x, y + 18.5, z - 1);
      b.box(20, 2.5, 13.5, x, y - 15, z);
    }
    add(b.mesh(M.dam, 'dam'));
    // the dark of the sluice mouths
    const dk = new Bag();
    for (let i = 1; i < 8; i++) {
      const x = -264 + i * 66, z = faceZ(30) + 2.08;
      const s = new THREE.Shape(); s.moveTo(-6.5, -11); s.lineTo(6.5, -11); s.lineTo(6.5, 4); s.absarc(0, 4, 6.5, 0, Math.PI, false); s.lineTo(-6.5, -11);
      dk.add(new THREE.ShapeGeometry(s, 14), xf(x, 44, z));
    }
    add(dk.mesh(M.dark, 'sluiceDark'));
    // thin falls from three sluices, running down the face
    const fl = new Bag();
    for (const i of [2, 4, 5]) {
      const x = -264 + i * 66, wdt = 6 + (i % 2) * 3;
      const rws = [];
      for (let k = 0; k <= 16; k++) { const y = 31 - 130 * (k / 16); const z = Math.max(faceZ(30) + 2.4, faceZ(y) + 0.5); rws.push([[x + wdt / 2, y, z], [x - wdt / 2, y, z]]); }
      const g = loft(rws);
      const uv = new Float32Array(g.attributes.position.count * 2);
      for (let v = 0; v < g.attributes.position.count; v++) { uv[v * 2] = (g.attributes.position.getX(v) - (x - wdt / 2)) / wdt; uv[v * 2 + 1] = 0; }
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      fl.add(g);
    }
    const falls = fl.mesh(M.fall, 'falls'); falls.userData.noShadow = true; add(falls);
    // verdigris penstocks down the face and a header pipe
    const cp = new Bag(), ir = new Bag();
    for (const x of [-145, -131, 53, 79, 185, 251]) {
      const pts = [];
      for (let k = 0; k <= 22; k++) { const y = 108 - 200 * (k / 22); pts.push(new THREE.Vector3(x, y, faceZ(y) + 2.6)); }
      cp.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 44, 2.3, 10, false));
      for (let k = 1; k < 22; k += 2) { const y = 108 - 200 * (k / 22); const sl = Math.atan2(faceZ(y - 1) - faceZ(y + 1), 2); cp.torus(2.6, 0.5, x, y, faceZ(y) + 2.6, Math.PI / 2 - sl, 0, 14, 6); }
      ir.box(6.4, 1.2, 4, x, 108.6, faceZ(108) + 2);
    }
    cp.cyl(1.7, 1.7, 420, 20, 100, faceZ(100) + 5.6, 10, false, 0, 0, Math.PI / 2);
    for (let x = -180; x <= 220; x += 33) { cp.torus(2.0, 0.42, x, 100, faceZ(100) + 5.6, 0, Math.PI / 2, 12, 6); ir.box(1.2, 1.2, 6, x + 4, 99, faceZ(100) + 3); }
    add(cp.mesh(M.copper, 'penstocks'));
    add(ir.mesh(M.iron, 'pipeBrackets'));
  }

  // ------------------------------------------------------------ crown deck (solid, with the well mouth cut out)
  {
    const s = new THREE.Shape();
    s.moveTo(-385, -45); s.lineTo(385, -45); s.lineTo(385, 45); s.lineTo(-385, 45); s.lineTo(-385, -45);
    const h = new THREE.Path(); h.absarc(WELL.center[0], WELL.center[1], WELL.r, 0, Math.PI * 2, true); s.holes.push(h);
    const g = new THREE.ExtrudeGeometry(s, { depth: 2, bevelEnabled: false, curveSegments: 40 });
    const deck = one(g, M.wall, xf(0, 120, 0, Math.PI / 2), 'courtFloor');
    add(deck);
    ctx.colliders.push({ name: 'courtFloor', dept: 'land', obj: deck, kind: 'solid' });
  }
  // the round court: a paved disc inlay ring, kerb, lamp posts, the well kerb
  {
    const b = new Bag();
    const cx = COURT.center[0], cz = COURT.center[2];
    b.lathe([[COURT.r - 0.8, 0], [COURT.r - 0.8, 0.22], [COURT.r, 0.22], [COURT.r + 0.5, 0]], cx, 120, cz, 64);
    b.lathe([[14.6, 0], [14.6, 0.06], [15.4, 0.06], [15.4, 0]], cx, 120, cz, 48);
    add(b.mesh(M.court, 'courtRings'));
    const kerb = one(new THREE.LatheGeometry([[5.5, 0], [6.8, 0], [6.8, 0.85], [6.55, 1.1], [5.75, 1.1], [5.5, 0.9], [5.5, 0]].map((p) => new THREE.Vector2(p[0], p[1])), 40), M.court, xf(cx, 120, cz), 'wellKerb');
    add(kerb);
    ctx.colliders.push({ name: 'wellKerb', dept: 'land', obj: kerb, kind: 'solid' });
    const ib = new Bag(), lb = new Bag();
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2 + 0.39, x = cx + Math.cos(a) * (COURT.r - 2.5), z = cz + Math.sin(a) * (COURT.r - 2.5);
      ib.cyl(0.12, 0.2, 4.6, x, 122.3, z, 8); ib.box(0.9, 0.12, 0.12, x, 124.5, z, -a); ib.cyl(0.32, 0.22, 0.2, x, 124.95, z, 8);
      lb.box(0.42, 0.6, 0.42, x, 124.6, z);
    }
    // crates and barrels against the east side
    for (let i = 0; i < 7; i++) { const a = -0.5 + i * 0.16; ib.box(1.4, 1.2 + (i % 3) * 0.3, 1.4, cx + Math.cos(a) * 30.5, 120.7 + (i % 3) * 0.15, cz + Math.sin(a) * 30.5, a + i); }
    add(ib.mesh(M.iron, 'courtIron'));
    const lamps = lb.mesh(glowMaterial({ color: '#e9dcae', power: 0.55 }), 'courtLamps'); lamps.userData.noShadow = true; add(lamps);
  }

  // ------------------------------------------------------------ ramparts
  const rampart = (bag, x0, x1, zc, h, outer, mer = true) => {
    const len = x1 - x0, xm = (x0 + x1) / 2;
    bag.box(len, h, 4.8, xm, 120 + h / 2, zc);
    bag.box(len, 0.5, 5.4, xm, 120 + h - 0.6, zc);           // string course
    bag.box(len, 1.0, 0.5, xm, 120 + h + 0.5, zc - outer * 2.1);   // inner kerb of the walk
    if (mer) for (let x = x0 + 1.2; x < x1 - 0.8; x += 3.2) bag.box(1.7, 1.4, 0.8, x, 120 + h + 0.7, zc + outer * 2.0);
    bag.box(len, 0.5, 0.8, xm, 120 + h + 0.2, zc + outer * 2.0);
    for (let x = x0 + 9; x < x1 - 4; x += 18) bag.box(2.2, h - 1, 1.0, x, 120 + (h - 1) / 2, zc - outer * 2.8);   // pilasters on the yard side
  };
  { const b = new Bag(); rampart(b, -322, WALL.a[0], 43, WALL.h, 1); rampart(b, -322, 322, -43.2, 6.5, -1); add(b.mesh(M.wall, 'ramparts')); }
  { const b = new Bag(); rampart(b, WALL.a[0], 322, 43, WALL.h, 1); const m = b.mesh(M.east, 'eastRampart'); add(m); }

  // ------------------------------------------------------------ gun towers with verdigris domes
  const gunTower = (st, cu, ir, x, z, dome = true, face = 1) => {
    st.lathe([[8.4, 118], [7.6, 123], [7.4, 136.5], [8.3, 138], [8.3, 140], [7.3, 140], [7.3, 139.2], [0, 139.2]], x, 0, z, 26);
    for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; st.box(1.5, 1.1, 0.9, x + Math.cos(a) * 7.85, 140.5, z + Math.sin(a) * 7.85, -a + Math.PI / 2); }
    st.torus(7.6, 0.28, x, 129.5, z, Math.PI / 2, 0, 26, 5);
    if (dome) {
      st.cyl(5.9, 6.1, 2.4, x, 140.4, z, 22);
      cu.sph(6.1, x, 141.5, z, 0.82, 22, 10, Math.PI / 2);
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; cu.add(new THREE.TorusGeometry(6.16, 0.16, 5, 12, Math.PI / 2), xf(x, 141.5, z, 0, a, 0, 1, 0.82, 1)); }
      cu.cyl(0.2, 0.5, 1.2, x, 146.9, z, 8); cu.sph(0.5, x, 147.7, z, 1, 10, 8); cu.cyl(0.04, 0.12, 2.6, x, 149.2, z, 6);
      for (let i = -1; i <= 1; i++) { const a = Math.PI / 2 * face + i * 0.7; ir.cyl(0.42, 0.5, 5.4, x + Math.cos(a) * 7.6, 134.2, z + Math.sin(a) * 7.6, 10, false, Math.PI / 2 - 0.06, -a + Math.PI / 2, 0); }
    }
  };
  {
    const st = new Bag(), cu = new Bag(), ir = new Bag();
    for (const x of [-300, -215, -36]) gunTower(st, cu, ir, x, 43);
    for (const x of [-250, -40, 270]) gunTower(st, cu, ir, x, -41.5, true, -1);
    // the cannon's own low bastion: gun deck at 129.4, the pivot (GUN.pos) 1.6 m above it
    st.lathe([[9.4, 118], [8.8, 123], [8.6, 127.2], [9.4, 128.4], [9.4, 129.4], [0, 129.4]], GUN.pos[0], 0, GUN.pos[2], 28);
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; if (Math.abs(Math.atan2(Math.sin(a - 2.86), Math.cos(a - 2.86))) < 0.5) continue; st.box(1.6, 1.0, 0.8, GUN.pos[0] + Math.cos(a) * 9.0, 129.9, GUN.pos[2] + Math.sin(a) * 9.0, -a + Math.PI / 2); }
    add(st.mesh(M.wall, 'gunTowers')); add(cu.mesh(M.copper, 'gunDomes')); add(ir.mesh(M.iron, 'gunBarrels'));
    const stE = new Bag(), cuE = new Bag(), irE = new Bag();
    for (const x of [80, 150, 220, 290]) gunTower(stE, cuE, irE, x, 43);
    add(stE.mesh(M.eastTower, 'gunTowersE')); add(cuE.mesh(M.copperE, 'gunDomesE')); add(irE.mesh(M.iron, 'gunBarrelsE'));
  }
  // the one that topples in s18 (its own group, pivot at the foot of its outer side)
  const topple = new THREE.Group(); topple.position.set(TOPPLE.x, 120, TOPPLE.z - 6.5);
  {
    const st = new Bag(), cu = new Bag(), ir = new Bag();
    gunTower(st, cu, ir, 0, 0, true, -1);
    const mv = xf(0, -120, 6.5);
    for (const [bg, mt] of [[st, M.eastTower], [cu, M.copperE], [ir, M.iron]]) { const g = bg.geometry(); g.applyMatrix4(mv); topple.add(new THREE.Mesh(g, mt)); }
    add(topple);
  }

  // ------------------------------------------------------------ barracks with jade tile roofs
  {
    const wl = new Bag(), rf = new Bag(), ir = new Bag();
    const house = (x, z, len, wid = 9.5, h = 6.2) => {
      wl.box(len, h, wid, x, 120 + h / 2, z);
      wl.box(len + 0.6, 0.5, wid + 0.6, x, 120.25, z);
      const rh = 3.4, ov = 0.9;
      const a = [[x - len / 2 - ov, 120 + h - 0.25, z - wid / 2 - ov], [x - len / 2 - ov, 120 + h + rh, z], [x - len / 2 - ov, 120 + h - 0.25, z + wid / 2 + ov]];
      const b2 = a.map((p) => [x + len / 2 + ov, p[1], p[2]]);
      rf.add(loft([a, b2]));
      // gable ends
      const ge = new THREE.BufferGeometry();
      const P = [x - len / 2, 120 + h, z - wid / 2, x - len / 2, 120 + h + rh - 0.4, z, x - len / 2, 120 + h, z + wid / 2, x + len / 2, 120 + h, z + wid / 2, x + len / 2, 120 + h + rh - 0.4, z, x + len / 2, 120 + h, z - wid / 2];
      ge.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3)); ge.computeVertexNormals();
      wl.add(ge);
      rf.box(len + 2.2, 0.4, 0.6, x, 120 + h + rh + 0.05, z);
      for (let k = -1; k <= 1; k += 2) if (len > 30) { wl.box(1.3, 2.6, 1.3, x + k * len * 0.28, 120 + h + rh, z + 1.2); ir.box(1.5, 0.2, 1.5, x + k * len * 0.28, 120 + h + rh + 1.4, z + 1.2); }
    };
    for (const z of [-24, 20]) { for (const x of [-282, -234, -186]) house(x, z, 42); house(-56, z, 28); for (const x of [62, 110, 158, 206, 254]) if (!(z < 0 && x === 158)) house(x, z, 42); house(298, z, 30); }
    add(wl.mesh(M.wallWin, 'barracks')); add(rf.mesh(M.tile, 'barrackRoofs')); add(ir.mesh(M.iron, 'chimneyCaps'));
  }

  // ------------------------------------------------------------ the keep
  {
    const K = KEEPBOX, b = new Bag(), cu = new Bag();
    const xm = (K.x0 + K.x1) / 2, zm = (K.z0 + K.z1) / 2, wx = K.x1 - K.x0, wz = K.z1 - K.z0;
    b.box(wx, 29, wz, xm, 134.5, zm);
    b.box(wx + 3, 4, wz + 3, xm, 122, zm);
    b.box(wx + 1.2, 0.7, wz + 1.2, xm, 132, zm); b.box(wx + 1.2, 0.7, wz + 1.2, xm, 142, zm); b.box(wx + 2, 1.2, wz + 2, xm, 148.2, zm);
    for (let x = K.x0 + 8; x < K.x1 - 4; x += 9.6) { b.box(2.4, 26, 1.3, x, 134, K.z1 + 0.6); b.box(2.4, 26, 1.3, x, 134, K.z0 - 0.6); }
    for (let z = K.z0 + 7; z < K.z1 - 4; z += 9) { b.box(1.3, 26, 2.4, K.x0 - 0.6, 134, z); b.box(1.3, 26, 2.4, K.x1 + 0.6, 134, z); }
    // parapet with merlons round the roof
    const par = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(-(z1 - z0), x1 - x0);
      b.box(len, 1.3, 1.0, (x0 + x1) / 2, 150.65, (z0 + z1) / 2, ry);
      const n = Math.floor(len / 3.4);
      for (let i = 0; i < n; i++) { const k = (i + 0.5) / n; b.box(1.8, 0.9, 1.0, x0 + (x1 - x0) * k, 151.75, z0 + (z1 - z0) * k, ry); }
    };
    par(K.x0, K.z1 - 0.5, K.x1, K.z1 - 0.5); par(K.x0, K.z0 + 0.5, K.x1, K.z0 + 0.5); par(K.x0 + 0.5, K.z0, K.x0 + 0.5, K.z1); par(K.x1 - 0.5, K.z0, K.x1 - 0.5, K.z1);
    // corner turrets
    for (const [x, z] of [[K.x0, K.z0], [K.x1, K.z0], [K.x0, K.z1], [K.x1, K.z1]]) {
      b.lathe([[4.4, 120], [4.0, 126], [4.0, 152.5], [4.6, 153.4], [4.6, 154.6], [0, 154.6]], x, 0, z, 18);
      cu.add(new THREE.ConeGeometry(4.5, 5.2, 16), xf(x, 157.2, z)); cu.sph(0.4, x, 160.1, z, 1, 8, 6);
    }
    // gate arches (dark) on the west and downstream faces
    b.box(1.0, 11, 9, K.x0 - 1.0, 125.5, 4); b.box(11, 12, 1.0, 0, 126, K.z1 + 1.0);
    // roof clutter away from the action: a cistern and two hatches on the upstream side
    b.box(4, 0.5, 3, -24, 150.25, -24); b.box(3, 0.5, 3, 24, 150.25, -25);
    cu.cyl(2.6, 2.6, 3.4, -24, 152.2, -12, 16); cu.add(new THREE.ConeGeometry(2.9, 1.4, 16), xf(-24, 154.6, -12));
    add(b.mesh(M.keep, 'keep')); add(cu.mesh(M.copper, 'keepCopper'));
    const dk = new Bag();
    const arch = (w, h) => { const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h - w / 2); s.absarc(0, h - w / 2, w / 2, 0, Math.PI, false); s.lineTo(-w / 2, 0); return new THREE.ShapeGeometry(s, 12); };
    dk.add(arch(6, 8.5), xf(K.x0 - 1.56, 120.05, 4, 0, -Math.PI / 2)); dk.add(arch(7.5, 9.5), xf(0, 120.05, K.z1 + 1.56));
    add(dk.mesh(M.dark, 'keepGates'));
    const slab = one(new THREE.BoxGeometry(wx, 1, wz), M.keep, xf(xm, 149.5, zm), 'keepRoof'); add(slab);
    ctx.colliders.push({ name: 'keepRoof', dept: 'land', obj: slab, kind: 'solid' });
  }

  // ------------------------------------------------------------ the tower
  const tc = TOWER.center, TR = TOWER.r;
  {
    const b = new Bag();
    const tr = (y) => 9 + Math.max(0, 207 - Math.max(y, 156)) * 0.028;
    b.lathe([[11.8, 150], [11.5, 152], [10.9, 154.5], [tr(156), 156], [9.0, 207], [9.0, 210.6], [10.15, 210.6], [10.15, 212.5], [9.7, 213.0], [9.0, 213.3], [9.0, 214]], tc[0], 0, tc[2], 64);
    // corbel teeth of the machicolated crown
    for (let i = 0; i < 36; i++) { const a = i / 36 * Math.PI * 2; b.box(0.62, 1.9, 1.25, tc[0] + Math.cos(a) * 9.5, 209.75, tc[2] + Math.sin(a) * 9.5, -a + Math.PI / 2, 0.38); b.box(0.5, 0.5, 0.5, tc[0] + Math.cos(a) * 9.2, 208.5, tc[2] + Math.sin(a) * 9.2, -a + Math.PI / 2); }
    // sills and hoods of the slit windows
    for (let i = 0; i < 34; i++) {
      const wy = 156 + i * 1.7, wa = 1.92 + (wy - 201) * 0.12, R = tr(wy) + 0.08;
      const x = tc[0] + Math.cos(wa) * R, z = tc[2] + Math.sin(wa) * R;
      b.box(1.0, 0.18, 0.4, x, wy - 1.02, z, -wa + Math.PI / 2); b.box(0.96, 0.16, 0.36, x, wy + 1.02, z, -wa + Math.PI / 2);
    }
    // string courses
    for (const y of [163, 176, 189, 200]) { if (y === 200) continue; const R = tr(y); b.lathe([[R - 0.05, 0], [R + 0.38, 0.12], [R + 0.38, 0.6], [R - 0.05, 0.85]], tc[0], y, tc[2], 56); }
    b.lathe([[9.0, 0], [9.3, 0.1], [9.3, 0.5], [9.0, 0.6]], tc[0], 205.2, tc[2], 56);
    // buttress ribs up to the third course
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + 0.2, R = tr(169.5) + 0.25; b.box(1.25, 39.6, 0.9, tc[0] + Math.cos(a) * R, 169.6, tc[2] + Math.sin(a) * R, -a + Math.PI / 2, -0.028); b.box(1.7, 5, 1.5, tc[0] + Math.cos(a) * (tr(156) + 0.5), 153, tc[2] + Math.sin(a) * (tr(156) + 0.5), -a + Math.PI / 2, -0.1); }
    // the seed room's little balcony under its window (+Z face)
    b.box(3.6, 0.3, 2.3, 0, 199.95, tc[2] + TR + 1.1);
    b.box(0.5, 1.6, 1.6, -1.3, 199.2, tc[2] + TR + 0.6, 0, 0.5); b.box(0.5, 1.6, 1.6, 1.3, 199.2, tc[2] + TR + 0.6, 0, 0.5);
    b.box(3.0, 0.3, 0.5, 0, 202.75, tc[2] + TR + 0.1);
    add(b.mesh(M.tower, 'tower'));
    const ir = new Bag();
    for (const [x, z, w, d] of [[0, tc[2] + TR + 2.2, 3.6, 0.08], [-1.76, tc[2] + TR + 1.1, 0.08, 2.2], [1.76, tc[2] + TR + 1.1, 0.08, 2.2]]) { ir.box(w, 0.08, d, x, 200.95, z); ir.box(w, 0.06, d, x, 200.5, z); }
    for (let i = 0; i <= 8; i++) ir.box(0.07, 0.9, 0.07, -1.76 + i * 0.44, 200.5, tc[2] + TR + 2.2);
    add(ir.mesh(M.iron, 'balconyRail'));

    // roof floor, parapet, dais (solids)
    const floor = one(new THREE.CylinderGeometry(TR - 0.02, TR - 0.02, 0.8, 56), M.roofStone, xf(tc[0], TOWER.roofY - 0.4, tc[2]), 'roofFloor'); add(floor);
    const P = TOWER.parapet;
    const parapet = one(new THREE.LatheGeometry([[8.4, 0], [9.0, 0], [9.0, P - 0.18], [9.16, P - 0.18], [9.16, P], [8.28, P], [8.28, P - 0.18], [8.4, P - 0.18], [8.4, 0]].map((p) => new THREE.Vector2(p[0], p[1])), 64), M.roofStone, xf(tc[0], TOWER.roofY, tc[2]), 'parapet'); add(parapet);
    const dais = one(new THREE.CylinderGeometry(2.2, 2.2, 0.9, 36), M.roofStone, xf(ROOF.dais[0], TOWER.roofY + 0.45, ROOF.dais[2]), 'dais'); add(dais);
    const step = one(new THREE.CylinderGeometry(2.95, 2.95, 0.26, 36), M.roofStone, xf(ROOF.dais[0], TOWER.roofY + 0.13, ROOF.dais[2]), 'daisStep'); add(step);
    for (const [nm, o] of [['roofFloor', floor], ['parapet', parapet], ['dais', dais], ['daisStep', step]]) ctx.colliders.push({ name: nm, dept: 'land', obj: o, kind: 'solid' });
    // worn rubble and a hatch on the roof, away from the marks
    const ap = new Bag();
    ap.box(1.5, 0.12, 1.5, -5.6, TOWER.roofY + 0.06, -12.5, 0.4);
    for (const [x, z, sz] of [[6.6, -12.2, 0.5], [7.1, -11.2, 0.3], [-7.3, -5.2, 0.34], [5.9, -13.4, 0.26]]) ap.box(sz * 1.5, sz, sz, x, TOWER.roofY + sz * 0.45, z, x, 0.2, 0.1);
    add(ap.mesh(M.roofStone, 'roofBits'));
    const cu = new Bag();
    // copper downpipes with hoppers, and a low wind vane fixed to the upstream parapet
    for (const a of [0.6, 3.75]) { const R = tr(181) + 0.32; cu.cyl(0.2, 0.2, 61, tc[0] + Math.cos(a) * R, 180.5, tc[2] + Math.sin(a) * R, 8, false, -0.028, -a + Math.PI / 2); cu.box(0.7, 0.8, 0.6, tc[0] + Math.cos(a) * 9.5, 208.0, tc[2] + Math.sin(a) * 9.5, -a + Math.PI / 2); for (let y = 158; y < 206; y += 9) cu.torus(0.27, 0.07, tc[0] + Math.cos(a) * (tr(y) + 0.3), y, tc[2] + Math.sin(a) * (tr(y) + 0.3), Math.PI / 2, 0, 8, 5); }
    cu.cyl(0.06, 0.09, 1.3, 0, TOWER.roofY + TOWER.parapet + 0.65, tc[2] - 8.7, 6); cu.box(0.9, 0.3, 0.04, 0.2, TOWER.roofY + TOWER.parapet + 1.2, tc[2] - 8.7, 0.5);
    add(cu.mesh(M.copper, 'roofMast'));
  }

  // ------------------------------------------------------------ the well cap (blows off at CUES.burst)
  const cap = new THREE.Group();
  {
    const cu = new Bag(), ir = new Bag();
    cu.lathe([[0, 1.5], [2.2, 1.36], [4.6, 0.9], [6.5, 0.28], [6.95, 0.06], [6.95, -0.12], [0, -0.12]], 0, 0, 0, 36);
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; ir.box(6.6, 0.18, 0.3, Math.cos(a) * 3.5, 0.92, Math.sin(a) * 3.5, -a, 0, -0.2); }
    ir.torus(0.9, 0.14, 0, 1.9, 0, 0, 0, 14, 6); ir.torus(6.9, 0.16, 0, 0.0, 0, Math.PI / 2, 0, 36, 6);
    cap.add(cu.mesh(M.copper, 'capCopper')); cap.add(ir.mesh(M.iron, 'capIron'));
    add(cap);
  }

  const banner = [];
  // ------------------------------------------------------------ lamps along the ramparts, yard furniture, stairs, rubble
  {
    const ib = new Bag(), lb = new Bag(), wb = new Bag(), wd = new Bag(), br = new Bag();
    for (let x = -306; x <= 306; x += 36) { if (Math.abs(x - SIREN_X) < 6) continue; for (const [z, y] of [[40.9, 130], [-41.1, 127.5]]) { ib.cyl(0.07, 0.1, 1.5, x, y + 0.75, z, 6); lb.box(0.34, 0.46, 0.34, x, y + 1.7, z); ib.box(0.5, 0.06, 0.5, x, y + 1.96, z); } }
    // stairs up to the downstream rampart and the upstream one
    for (let i = 0; i < 30; i++) wb.box(0.62, 0.3 * (i + 1), 2.4, -141 + i * 0.6, 120 + 0.15 * (i + 1), 39.4);
    wb.box(3.2, 9, 2.4, -121.6, 124.5, 39.4);
    for (let i = 0; i < 21; i++) wb.box(0.62, 0.31 * (i + 1), 2.2, -92 - i * 0.6, 120 + 0.155 * (i + 1), -39.7);
    wb.box(3, 6.5, 2.2, -106.1, 123.25, -39.7);
    // carts, crate stacks, barrels, a banner pole
    const cx = COURT.center[0], cz = COURT.center[2];
    const cart = (x, z, ry) => { const m = xf(x, 120, z, 0, ry); const c = new Bag(), w = new Bag(); w.box(3.6, 0.14, 1.9, 0, 1.0, 0); for (const sz of [-1, 1]) { w.box(3.6, 0.8, 0.1, 0, 1.45, sz * 0.9); for (let k = -3; k <= 3; k++) w.box(0.12, 0.95, 0.14, k * 0.55, 1.5, sz * 0.97); } w.box(0.1, 0.8, 1.8, -1.75, 1.45, 0); w.box(3.2, 0.12, 0.12, 3.3, 0.95, 0.7, 0, 0, -0.1); w.box(3.2, 0.12, 0.12, 3.3, 0.95, -0.7, 0, 0, -0.1); for (const sz of [-1, 1]) { c.torus(0.95, 0.09, -0.2, 0.95, sz * 1.12, 0, 0, 16, 5); c.cyl(0.16, 0.16, 0.3, -0.2, 0.95, sz * 1.12, 8, false, Math.PI / 2); for (let k = 0; k < 4; k++) c.box(1.85, 0.07, 0.07, -0.2, 0.95, sz * 1.12, 0, 0, k * Math.PI / 4); } c.cyl(0.06, 0.06, 2.5, -0.2, 0.95, 0, 6, false, Math.PI / 2); let g = c.geometry(); g.applyMatrix4(m); ib.g.push(g); g = w.geometry(); g.applyMatrix4(m); wd.g.push(g); };
    cart(cx + 22, cz + 19, 0.5); cart(cx - 25, cz - 14, 2.1); cart(cx + 12, cz - 27, -0.3);
    const rs = new Rng(51);
    for (const [x, z] of [[cx - 28, cz + 12], [cx + 27, cz - 16], [cx - 8, cz + 30], [cx + 30, cz + 8]]) for (let i = 0; i < 7; i++) { const sz = rs.range(0.9, 1.5), lv = i > 4 ? 1 : 0; { const bx = x + rs.range(-2.2, 2.2) * (1 - lv * 0.6), bz = z + rs.range(-2, 2) * (1 - lv * 0.6), by = 120 + sz / 2 + lv * 1.1, ry = rs.range(0, 1.5); wd.box(sz, sz, sz, bx, by, bz, ry); for (const e of [-1, 1]) { wd.box(sz + 0.1, 0.12, sz + 0.1, bx, by + e * (sz / 2 - 0.1), bz, ry); ib.box(sz + 0.06, sz + 0.06, 0.08, bx, by, bz, ry + (e > 0 ? 0 : Math.PI / 2)); } } if (i < 3) wd.cyl(0.5, 0.5, 1.2, x + rs.range(-3.5, 3.5), 120.6, z + rs.range(-3.5, 3.5), 10); }
    ib.cyl(0.1, 0.16, 13, cx - 30, 126.5, cz - 12, 8); ib.sph(0.22, cx - 30, 133.1, cz - 12, 1, 8, 6);
    // shell racks: iron frames with rows of brass-cased shells
    for (const [x, z, ry] of [[cx + 24, cz + 14, 0.5], [cx - 20, cz + 24, -0.7]]) {
      const m = xf(x, 120, z, 0, ry); const f = new Bag(), sh = new Bag();
      for (const sx of [-1.5, 1.5]) for (const sz of [-0.4, 0.4]) f.box(0.1, 1.9, 0.1, sx, 0.95, sz);
      for (const y of [0.3, 0.95, 1.6]) { f.box(3.1, 0.08, 0.9, 0, y, 0); for (let k = 0; k < 7; k++) { sh.cyl(0.17, 0.17, 0.75, -1.26 + k * 0.42, y + 0.22, 0, 8, false, Math.PI / 2); sh.add(new THREE.ConeGeometry(0.17, 0.32, 8), xf(-1.26 + k * 0.42, y + 0.22, 0.53, Math.PI / 2)); } }
      let g = f.geometry(); g.applyMatrix4(m); ib.g.push(g); g = sh.geometry(); g.applyMatrix4(m); br.g.push(g);
    }
    // the banner: three hinged strips that lag each other
    const bannerMat = stoneMaterial({ kind: 6, color: '#3e7f70' });
    let par = new THREE.Group(); par.position.set(cx - 30, 132.6, cz - 12); add(par);
    for (let i = 0; i < 3; i++) { const g = new THREE.Group(); g.position.set(0, 0, i ? 1.1 : 0.1); const me = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.6 - i * 0.25, 1.1), bannerMat); me.position.set(0, -1.3 + i * 0.1, 0.55); g.add(me); par.add(g); banner.push(g); par = g; }
    add(wd.mesh(stoneMaterial({ kind: 1, color: '#9c8a68', baseY: 120, seed: 4 }), 'yardWood')); add(br.mesh(M.brass, 'shells'));
    add(ib.mesh(M.iron, 'yardIron')); add(wb.mesh(M.wall, 'stairs'));
    const lm = lb.mesh(glowMaterial({ color: '#f2dca0', power: 0.7 }), 'rampartLamps'); lm.userData.noShadow = true; add(lm);
    // rubble that shows once the fire wall has passed (yard side of the east rampart and on its stump)
    const rb = new Bag();
    for (let i = 0; i < 170; i++) { const x = rs.range(38, 318), top = rs.next() < 0.3, sz = rs.range(0.7, 2.6); rb.box(sz * rs.range(1, 1.8), sz * rs.range(0.5, 1), sz, x, top ? 123.4 + rs.range(0, 2.2) : 120 + sz * 0.3, top ? rs.range(41, 45) : rs.range(33, 40.4) - rs.range(0, 4) * rs.next(), rs.range(0, 3), rs.range(-0.4, 0.4), rs.range(-0.4, 0.4)); }
    add(rb.mesh(stoneMaterial({ kind: 1, color: BONE, baseY: 120, burnable: 2, seed: 8 }), 'rubble'));
  }

  // ------------------------------------------------------------ searchlights, siren, the rampart cannon
  const SL = [[-175, 126.5, -43.2], [-135, 126.5, -43.2], [-95, 126.5, -43.2], [-55, 126.5, -43.2], [-27, 150, 18], [-160, 129, 43]];
  const SLH = 2.7;
  const lights = SL.map((p, i) => {
    const g = new THREE.Group(); g.position.set(p[0], p[1] + SLH, p[2]);
    const post = new Bag(); post.cyl(0.14, 0.2, SLH - 0.85, p[0], p[1] + (SLH - 0.85) / 2, p[2], 8); post.box(0.9, 0.12, 0.9, p[0], p[1] + 0.06, p[2]);
    add(post.mesh(M.iron, 'slPost' + i));
    const body = new Bag();
    body.cyl(0.62, 0.5, 1.0, 0, 0, -0.1, 14, false, Math.PI / 2); body.torus(0.64, 0.07, 0, 0, 0.4, 0, 0, 16, 6); body.box(1.5, 0.1, 0.16, 0, 0, -0.1); body.box(0.1, 0.9, 0.16, -0.75, -0.42, -0.1); body.box(0.1, 0.9, 0.16, 0.75, -0.42, -0.1);
    g.add(body.mesh(M.iron, 'slBody'));
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.56, 18), glowMaterial({ color: '#e8f6ef', power: 0, off: '#0c1a1c' })); lens.position.z = 0.42; lens.userData.noShadow = true;
    g.add(lens); add(g);
    return { g, lens };
  });
  const SIREN = { base: [-100, WALK_Y, 42.4], handle: [-100.75, WALK_Y + 1.15, 41.9], stand: [-101.5, WALK_Y, 41.7] };
  const sirenHorn = new THREE.Group(); sirenHorn.position.set(SIREN.base[0], SIREN.base[1] + 1.5, SIREN.base[2]);
  const sirenCrank = new THREE.Group(); sirenCrank.position.set(SIREN.base[0] - 0.42, SIREN.base[1] + 1.15, SIREN.base[2] - 0.1);
  {
    const ir = new Bag(); ir.cyl(0.16, 0.3, 1.1, SIREN.base[0], SIREN.base[1] + 0.55, SIREN.base[2], 8); ir.box(0.7, 0.6, 0.6, SIREN.base[0], SIREN.base[1] + 1.3, SIREN.base[2]);
    add(ir.mesh(M.iron, 'sirenPost'));
    const br = new Bag(); br.cyl(0.62, 0.14, 1.3, 0, 0.45, 0.5, 14, true, Math.PI / 2 - 0.5); br.cyl(0.3, 0.3, 0.5, 0, 0.05, -0.1, 12, false, Math.PI / 2); br.torus(0.62, 0.05, 0, 0.76, 1.07, -0.5, 0, 16, 6);
    sirenHorn.add(br.mesh(M.brass, 'sirenHorn')); add(sirenHorn);
    const ck = new Bag(); ck.cyl(0.04, 0.04, 0.4, -0.1, 0, 0, 6, false, 0, 0, Math.PI / 2); ck.box(0.06, 0.5, 0.06, -0.28, 0.2, 0); ck.cyl(0.05, 0.05, 0.3, -0.42, 0.42, 0, 6, false, 0, 0, Math.PI / 2);
    sirenCrank.add(ck.mesh(M.iron, 'sirenCrank')); add(sirenCrank);
  }
  // cannon: pivot at GUN.pos, the barrel slides back along its axis on firing
  const gunYoke = new THREE.Group(); gunYoke.position.set(...GUN.pos);
  const gunBarrel = new THREE.Group();
  {
    const tgt = new THREE.Vector3(...SHELLS[0].to);
    gunYoke.lookAt(tgt);
    const ir = new Bag();
    ir.cyl(0.62, 0.86, 7.6, 0, 0, 2.6, 16, false, Math.PI / 2); ir.cyl(0.9, 0.9, 1.6, 0, 0, -1.2, 16, false, Math.PI / 2); ir.sph(0.9, 0, 0, -2.0, 1, 12, 8);
    ir.cyl(0.26, 0.26, 2.6, 0, 0, 0, 10, false, 0, 0, Math.PI / 2);
    gunBarrel.add(ir.mesh(M.iron, 'gunBarrel'));
    const br = new Bag(); for (const z of [-0.4, 1.6, 4.2, 6.3]) br.torus(0.66 + (z < 0 ? 0.26 : (6.3 - z) * 0.02), 0.09, 0, 0, z, 0, 0, 16, 6);
    gunBarrel.add(br.mesh(M.brass, 'gunBands'));
    gunYoke.add(gunBarrel); add(gunYoke);
    const cg = new Bag();
    const yaw = Math.atan2(tgt.x - GUN.pos[0], tgt.z - GUN.pos[2]);
    cg.box(0.3, 1.9, 3.2, GUN.pos[0] + Math.cos(yaw) * 1.2, GUN.pos[1] - 0.75, GUN.pos[2] - Math.sin(yaw) * 1.2, yaw);
    cg.box(0.3, 1.9, 3.2, GUN.pos[0] - Math.cos(yaw) * 1.2, GUN.pos[1] - 0.75, GUN.pos[2] + Math.sin(yaw) * 1.2, yaw);
    cg.cyl(2.6, 2.8, 0.5, GUN.pos[0], GUN.pos[1] - 1.55, GUN.pos[2], 20);
    cg.cyl(3.4, 3.4, 0.14, GUN.pos[0], 129.47, GUN.pos[2], 24);
    add(cg.mesh(M.iron, 'gunCarriage'));
  }

  ctx.shadowRoots.push(root);
  ctx.scene.add(root);

  // ------------------------------------------------------------ per-frame
  const v = new THREE.Vector3(), v2 = new THREE.Vector3();
  const hitIds = SHELLS.filter((s) => s.hit === 'tower');
  const towerMid = new THREE.Vector3(tc[0], 186, tc[2]);
  const slTarget = (i, t, out) => {
    // before the alarm: parked looking down the wall; then swing to the well; from s10 on they hunt up the tower
    const rest = out.set(SL[i][0] + (i % 2 ? 30 : -30), 121, SL[i][2] * 0.2);
    const k1 = smooth((t - (CUES.alarm + 0.15 + i * 0.13)) / 0.8);
    v2.set(COURT.center[0] + Math.sin(t * 1.3 + i) * 3, 121, COURT.center[2] + Math.cos(t * 1.1 + i * 2) * 3);
    rest.lerp(v2, k1);
    const k2 = smooth((t - (20.9 + i * 0.2)) / 1.6);
    let ty = 160 + 50 * smooth((t - 23.2) / 3.2) + Math.sin(t * 0.9 + i * 1.7) * 5;
    v2.set(tc[0] + Math.sin(t * 0.7 + i * 2.1) * 6, ty, tc[2] + TR * 0.6);
    const lc = ctx.mech?.anchor?.('chest', v) ;
    if (lc && t > 23.4 && t < 34.5 && Number.isFinite(lc.x)) v2.lerp(lc, 0.7);
    return rest.lerp(v2, k2);
  };
  const state = { capPos: new THREE.Vector3() };
  function update(st) {
    const t = st.t;
    // uniforms
    const eu = clamp((t - CUES.erupt) / (CUES.eruptEnd - CUES.erupt));
    LU.uBurnX.value = t < CUES.erupt ? -1e6 : WALL.a[0] + (WALL.b[0] - WALL.a[0]) * eu + 6;
    LU.uBurnAge.value = Math.max(0, t - CUES.erupt);
    LU.uFire.value = smooth((t - CUES.erupt) / 1.4) * (1 - 0.45 * smooth((t - 60) / 16));
    const climb = smooth((t - 20.9) / 2.5);
    LU.uGlowY.value = t < 20.6 ? -1e3 : (t < 23.6 ? 200.5 + 13.5 * climb : -1e3);
    LU.uSeedWin.value = t < 20.9 ? 1 : Math.max(0, 1 - (t - 20.9) / 0.3);
    LU.uLamps.value = 1;
    for (let i = 0; i < 8; i++) {
      const h = hitIds[i], u = LU.uHits.value[i];
      if (h && t >= h.t1) u.set(h.to[0], h.to[1], h.to[2], 1 + Math.max(0, 1 - (t - h.t1) / 2.5)); else u.set(0, -1e4, 0, 0);
    }
    // the well cap
    const tb = t - CUES.burst;
    if (tb < 0) { cap.position.set(WELL.center[0], 121.15, WELL.center[1]); cap.rotation.set(0, 0, 0); }
    else {
      const T = 6.2, tt = Math.min(tb, T);
      const y = 121.15 + 30.4 * tt - 4.905 * tt * tt;
      cap.position.set(WELL.center[0] - 3.2 * tt, Math.max(120.6, y), WELL.center[1] + 2.6 * tt);
      const sp = Math.min(tb, T);
      cap.rotation.set(sp * 2.3, sp * 0.7, sp * 1.1);
      if (tb >= T) cap.rotation.set(0.16, 1.2, -0.08);
    }
    LU.uCapOff.value = tb > 0 ? 1 : 0;
    // toppling gun tower: leans as the fire reaches it, then goes over the lip and falls into the gorge
    const lean = 0.1 * smooth((t - 41.75) / 0.8) + 1.55 * Math.pow(clamp((t - 42.5) / 2.6), 2.2);
    topple.rotation.set(-lean * 0.55, 0, lean * 0.8);
    const fall = Math.max(0, t - 45.0);
    const fl2 = Math.max(0, t - 44.3);
    topple.position.set(TOPPLE.x - fl2 * 3, 120 - 4.9 * fl2 * fl2, TOPPLE.z - 6.5 - fl2 * 6);
    topple.visible = fl2 < 3;
    // searchlights
    for (let i = 0; i < lights.length; i++) {
      const L = lights[i];
      slTarget(i, t, v);
      L.g.lookAt(v);
      const on = t > CUES.alarm + 0.1 + i * 0.13 ? (t - (CUES.alarm + 0.1 + i * 0.13) < 0.12 ? 0.4 : 1) : 0;
      L.lens.material.uniforms.uPower.value = on * (t > 69 ? 0.6 : 1);
    }
    // siren: the crank turns, the horn shudders
    const ta = Math.max(0, t - (CUES.alarm - 0.6));
    sirenCrank.rotation.x = t < 26 ? -ta * ta * 6 / (1 + ta * 0.5) : 0;
    sirenHorn.rotation.set(0, -2.5 + (t > CUES.alarm && t < 30 ? Math.sin(t * 60) * 0.012 : 0), 0);
    for (let i = 0; i < banner.length; i++) banner[i].rotation.y = (i ? 0 : 0.5) + Math.sin(t * 2.6 - i * 0.9) * (0.22 + 0.1 * i) + Math.sin(t * 6.1 - i * 1.7) * 0.07;
    // cannon recoil
    const tg = t - CUES.shell1;
    const rec = tg < 0 ? 0 : (tg < 0.06 ? tg / 0.06 : Math.exp(-(tg - 0.06) * 2.6));
    gunBarrel.position.z = -1.7 * rec;
  }
  const anchors = {
    gunMuzzle: (o) => o.set(0, 0, 6.5).applyMatrix4(gunBarrel.matrixWorld),
    wellMouth: (o) => o.set(WELL.center[0], WELL.top, WELL.center[1]),
    wellCap: (o) => o.copy(cap.position),
    siren: (o) => o.set(...SIREN.handle),
    sirenStand: (o) => o.set(...SIREN.stand),
    seedBalcony: (o) => o.set(0, 200.1, tc[2] + TR + 1.2),
    toppleTower: (o) => o.set(0, 22, 6.5).applyMatrix4(topple.matrixWorld),
  };
  for (let i = 0; i < lights.length; i++) {
    anchors['searchlight' + i] = (o) => o.set(0, 0, 0.45).applyMatrix4(lights[i].g.matrixWorld);
    anchors['searchlightTarget' + i] = (o) => slTarget(i, ctx.lastState?.t ?? 0, o);
  }
  return { root, update, anchors, M, SL, slTarget };
}
