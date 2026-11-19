import * as THREE from 'three';
import { Kit, cylUV, boxUV, sweep, gearGeo, latheUV, linkGeo, extrude, ring, v3, cbox } from './mech-geo.js';
import { glassMaterial } from './mech-mat.js';
import { LAMPROOM, LENS, BEAM } from './layout.js';
import { Rng } from './util.js';

// LANTERN ROOM + LENS MACHINE. Room-local frame: origin at the floor centre (LAMPROOM.center xz, floorY), Y up.
// Lens centre at local y = LENS.center.y - floorY. The gear train sits on the +Z side of the pedestal; the crank sticks out toward +Z.
export const FLOOR_Y = LAMPROOM.floorY;
export const LENS_Y = LENS.center[1] - LAMPROOM.floorY;      // 2.4
export const GLAZE = { y0: 1.0, y1: 3.9, r: LAMPROOM.radius, sides: 16, rows: 3 };
export const TRAIN = {
  bull: { N: 52, R: 0.95, y: 1.2 },                         // horizontal, turns with the lens
  A: { N: 28, R: 0.38, at: [0, 0.95, 1.1] },                 // on the crank axle (axis Z)
  B: { N: 14, R: 0.2, at: [0.58, 0.95, 1.1] },               // idler (axis Z), bevel to C
  C: { N: 10, R: 0.18, at: [0.58, 1.2, 0.97] },              // vertical pinion, meshes the bull gear
  crankZ: 1.56, crankR: 0.3, gripZ: 1.7,
  sprocket: [-0.45, 0.78, 1.1],
};
export const HATCH = { x: -1.9, z: 0.9, s: 0.8 };
// Lens door: belt panel DOOR_PANEL is hinged on its left edge; while the lens is stuck (BEAM.stuckAz) it faces the service step.
export const DOOR_PANEL = 4;
export const STEP = { r: 1.42, top: 1.05 };
// Ratchet pawl riding the bull gear, and a fixed index pointer beside a paint-marked tooth: together they make the one-tooth
// jump at CUES.notch readable (before: the mark at the pointer; after: one tooth on, the pawl has clicked into the next gap).
const TOOTH = (Math.PI * 2) / 52;
export const PAWL = { psi: (Math.round((0.45 - BEAM.stuckAz) / TOOTH - 0.5) + 0.5) * TOOTH + BEAM.stuckAz, pivotR: 1.2, dpsi: 0.2 };
export const INDEX = { k: Math.round((0.22 - BEAM.stuckAz) / TOOTH) };
INDEX.psi = INDEX.k * TOOTH + BEAM.stuckAz;
export const RATIO = (TRAIN.bull.N / TRAIN.C.N) * (TRAIN.B.N / TRAIN.A.N);   // crank turns per lens turn = 2.6

// styles
const S = {
  iron: { id: 30, col: '#3d4d46', metal: 0.6, kind: 0, pw: 0.9, ph: 0.55, riv: 0.09, wear: 1 },
  ironFrame: { id: 30, col: '#33423c', metal: 0.6, kind: 0, pw: 3, ph: 3, riv: 0, wear: 0.8 },
  floor: { id: 32, col: '#454c47', metal: 0.5, kind: 0, pw: 0.6, ph: 0.6, riv: 0.0, wear: 0.35 },
  grate: { id: 32, col: '#333c3d', metal: 0.5, kind: 0, pw: 0.3, ph: 2, riv: 0, wear: 1 },
  copper: { id: 31, col: '#6f4a35', metal: 0.8, kind: 2, pw: 0.62, ph: 1, wear: 1 },
  pedestal: { id: 33, col: '#3a4b45', metal: 0.6, kind: 0, pw: 0.5, ph: 0.4, riv: 0.06, wear: 1 },
  brass: { id: 34, col: '#8c7a55', metal: 1, kind: 1, wear: 1 },
  brassG: { id: 35, col: '#806d4c', metal: 1, kind: 1, wear: 1 },
  brassD: { id: 36, col: '#6a5a41', metal: 1, kind: 1, wear: 1 },
  steel: { id: 36, col: '#5b6266', metal: 0.9, kind: 0, pw: 4, ph: 4, riv: 0, wear: 0.6 },
  crankIron: { id: 37, col: '#3b403e', metal: 0.7, kind: 0, pw: 4, ph: 4, riv: 0, wear: 0.5 },
  grip: { id: 38, col: '#6b4a2e', metal: 0.2, kind: 4, pw: 0.2, ph: 0.05, wear: 1 },
  mantle: { id: 39, col: '#efe6cf', metal: 0, kind: 5, emis: 1, detail: 0 },
  chain: { id: 37, col: '#3a3f3e', metal: 0.8, kind: 0, pw: 4, ph: 4, riv: 0, wear: 1 },
  shard: { id: 39, col: '#9fc3c2', metal: 0.3, kind: 5, detail: 0 },
};

function addRing(k, bin, r, tube, y, st, seg = 48, sides = 6) { k.add(bin, ring(r, tube, seg, sides), st, [0, y, 0]); }

// beehive radius of the lens glass at height y (lens local, belt = |y| < 0.44)
export const beeR = (y) => {
  const a = Math.abs(y);
  if (a <= 0.44) return 0.98;
  return 0.98 * Math.sqrt(Math.max(0.04, 1 - Math.pow((a - 0.44) / 0.72, 2) * 0.78));
};

export function buildLamp(ctx, mat) {
  const k = new Kit(71);
  const rng = new Rng(9);
  const J = {};
  const mk = (name, parent, pos = [0, 0, 0]) => { const g = new THREE.Group(); g.name = 'mech:' + name; g.position.set(...pos); parent.add(g); J[name] = g; return g; };
  const root = new THREE.Group(); root.name = 'mech:lamproom';
  root.position.set(LAMPROOM.center[0], FLOOR_Y, LAMPROOM.center[2]);
  J.root = root;
  mk('room', root); mk('floor', root); mk('pedestal', root); mk('frame', root); mk('shards', root);
  mk('lens', root, [0, LENS_Y, 0]);
  mk('gearA', root, TRAIN.A.at); mk('crank', root, TRAIN.A.at); mk('gearB', root, TRAIN.B.at); mk('gearC', root, TRAIN.C.at);
  mk('sprocket', root, TRAIN.sprocket);
  const pp = PAWL.psi + PAWL.dpsi;
  mk('pawl', root, [Math.cos(pp) * PAWL.pivotR, TRAIN.bull.y, Math.sin(pp) * PAWL.pivotR]);
  mk('flakes', root, [0, 0, 0]);
  mk('chain', root, [TRAIN.sprocket[0] - 0.15, TRAIN.sprocket[1], TRAIN.sprocket[2]]);
  mk('hatch', root, [HATCH.x - HATCH.s / 2, 0, HATCH.z]);
  const LG = buildLensGlass();
  mk('door', J.lens, [LG.hinge[0], 0, LG.hinge[2]]);
  // service step: a small iron platform with a ladder, outside the lens door at the stuck azimuth, so she can reach the burner
  const stepAz = Math.PI + (DOOR_PANEL / 8) * Math.PI * 2 - Math.PI + BEAM.stuckAz;   // world azimuth the door faces while stuck
  const sd = [Math.sin(stepAz), -Math.cos(stepAz)];
  mk('step', root, [sd[0] * STEP.r, 0, sd[1] * STEP.r]);
  J.step.rotation.y = Math.atan2(sd[0], sd[1]);
  J.stepDir = sd;

  const n16 = GLAZE.sides, R = GLAZE.r;
  const cornerA = (i) => (i / n16) * Math.PI * 2 + Math.PI / n16;   // facets face the cardinal directions
  const corner = (i, r = R) => [Math.sin(cornerA(i)) * r, Math.cos(cornerA(i)) * r];

  // ------------------------------------------------ floor with the stair hatch, and the gallery deck outside
  {
    const pts = []; for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; pts.push([Math.cos(a) * (R + 0.05), Math.sin(a) * (R + 0.05)]); }
    const h = HATCH.s / 2;
    // shape is in XY; after rotateX(-90) local y -> -z, so the hole sits at y = -z
    const hole = [[HATCH.x - h, -HATCH.z - h], [HATCH.x + h, -HATCH.z - h], [HATCH.x + h, -HATCH.z + h], [HATCH.x - h, -HATCH.z + h]];
    const g = extrude(pts, 0.12, 0.01, [hole], 30).rotateX(-Math.PI / 2).translate(0, -0.06, 0);
    k.add('floor', g, S.floor);
    // hatch coaming
    for (const [ax, az, w, d] of [[HATCH.x, HATCH.z - h - 0.03, HATCH.s + 0.12, 0.06], [HATCH.x, HATCH.z + h + 0.03, HATCH.s + 0.12, 0.06], [HATCH.x - h - 0.03, HATCH.z, 0.06, HATCH.s], [HATCH.x + h + 0.03, HATCH.z, 0.06, HATCH.s]])
      k.add('floor', boxUV(w, 0.1, d), S.ironFrame, [ax, 0.05, az]);
    // hatch lid, hinged on its -X edge, thrown open
    k.add('hatch', cbox(0.05, HATCH.s, HATCH.s, 0.01), S.iron, [0, HATCH.s / 2, 0]);
    k.add('hatch', boxUV(0.03, 0.06, 0.3), S.brassD, [0.04, HATCH.s * 0.7, 0]);
    // gallery deck: open grating ring + outer toe plate
    const gpts = [], gh = [];
    for (let i = 0; i < 64; i++) { const a = (i / 64) * Math.PI * 2; gpts.push([Math.cos(a) * 4.62, Math.sin(a) * 4.62]); gh.push([Math.cos(a) * (R + 0.05), Math.sin(a) * (R + 0.05)]); }
    k.add('floor', extrude(gpts, 0.1, 0.01, [gh.reverse()], 30).rotateX(-Math.PI / 2).translate(0, -0.05, 0), S.grate);
    k.add('room', cylUV(4.62, 4.62, 0.16, 64, 1, true), S.ironFrame, [0, 0.05, 0]);
    // brackets under the gallery down to the tower wall (tower top radius ~3.6)
    for (let i = 0; i < 16; i++) {
      const a = cornerA(i) - Math.PI / n16;
      const br = extrude([[3.5, -1.3], [3.62, -1.3], [4.55, -0.1], [3.5, -0.1]], 0.08, 0.01, [], 30);
      k.add('room', br, S.ironFrame, [0, 0, 0], [0, (a * 180) / Math.PI - 90, 0]);
    }
    // gallery rail: posts, top rail, middle rail
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      k.add('room', cylUV(0.025, 0.03, 1.1, 8), S.ironFrame, [Math.sin(a) * 4.5, 0.55, Math.cos(a) * 4.5]);
      k.add('room', new THREE.SphereGeometry(0.045, 8, 6), S.ironFrame, [Math.sin(a) * 4.5, 1.12, Math.cos(a) * 4.5]);
    }
    addRing(k, 'room', 4.5, 0.032, 1.1, S.ironFrame, 96, 6);
    addRing(k, 'room', 4.5, 0.018, 0.6, S.ironFrame, 96, 5);
    addRing(k, 'room', 4.5, 0.018, 0.2, S.ironFrame, 96, 5);
  }

  // ------------------------------------------------ parapet, glazing frame, cornice, dome, vent ball, lightning rod
  {
    k.add('room', cylUV(R + 0.02, R + 0.02, GLAZE.y0, n16, 1, true), S.iron, [0, GLAZE.y0 / 2, 0], [0, 180 / n16 + 90, 0]);
    k.add('room', cylUV(R - 0.06, R - 0.06, GLAZE.y0, n16, 1, true), S.iron, [0, GLAZE.y0 / 2, 0], [0, 180 / n16 + 90, 0]);
    // little vents in the parapet (brass grilles)
    for (let i = 0; i < 8; i++) { const a = cornerA(i * 2) + Math.PI / n16; k.add('room', boxUV(0.34, 0.16, 0.03), S.brassD, [Math.sin(a) * (R + 0.035), 0.55, Math.cos(a) * (R + 0.035)], [0, (a * 180) / Math.PI, 0]); }
    // sill and head: flat 16-gon bands
    k.add('room', cylUV(R + 0.1, R + 0.1, 0.1, n16, 1, true), S.ironFrame, [0, GLAZE.y0, 0], [0, 180 / n16 + 90, 0]);
    k.add('room', cylUV(R + 0.08, R + 0.08, 0.12, n16, 1, true), S.ironFrame, [0, GLAZE.y1, 0], [0, 180 / n16 + 90, 0]);
    // mullions at the corners and the diamond astragals across each facet
    const H = (GLAZE.y1 - GLAZE.y0) / GLAZE.rows;
    for (let i = 0; i < n16; i++) {
      const [x0, z0] = corner(i), [x1, z1] = corner(i + 1);
      k.member('room', [x0, GLAZE.y0, z0], [x0, GLAZE.y1, z0], 0.07, 0.09, S.ironFrame);
      for (let r = 0; r < GLAZE.rows; r++) {
        const ya = GLAZE.y0 + r * H, yb = ya + H;
        k.member('room', [x0, ya, z0], [x1, yb, z1], 0.035, 0.04, S.ironFrame, { id: 30 });
        k.member('room', [x1, ya, z1], [x0, yb, z0], 0.035, 0.04, S.ironFrame, { id: 30 });
      }
    }
    // cornice with a gutter lip
    k.add('room', latheUV([[R + 0.02, 3.95], [R + 0.22, 4.0], [R + 0.3, 4.12], [R + 0.28, 4.24], [R + 0.05, 4.26]], n16 * 2), S.ironFrame);
    // dome: ogee in 16 flat gores of copper with raised ribs
    const prof = [];
    for (let i = 0; i <= 14; i++) { const u = i / 14; const r = (R + 0.12) * (1 - u) + 0.36 * u - Math.sin(u * Math.PI) * 0.35 * (1 - u) ; prof.push([Math.max(0.36, r), 4.26 + 1.55 * Math.pow(u, 0.85)]); }
    k.add('room', latheUV(prof, n16, Math.PI / n16), S.copper);
    for (let i = 0; i < n16; i++) {
      const a = cornerA(i);
      const pts = prof.map(([r, y]) => v3(Math.sin(a) * (r + 0.02), y + 0.01, Math.cos(a) * (r + 0.02)));
      k.add('room', sweep(pts, 0.022, 28, 5), { ...S.copper, id: 33 });
    }
    // vent neck, ball, lightning rod
    k.add('room', cylUV(0.38, 0.42, 0.3, 16), S.ironFrame, [0, 5.95, 0]);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; k.add('room', boxUV(0.03, 0.18, 0.06), S.iron, [Math.sin(a) * 0.4, 5.96, Math.cos(a) * 0.4], [0, (a * 180) / Math.PI, 0]); }
    k.add('room', new THREE.SphereGeometry(0.46, 20, 14), S.copper, [0, 6.5, 0]);
    addRing(k, 'room', 0.465, 0.03, 6.5, { ...S.brassD, id: 33 }, 32, 5);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; k.add('room', ring(0.08, 0.018, 12, 5).rotateX(Math.PI / 2), S.ironFrame, [Math.sin(a) * 0.44, 6.42, Math.cos(a) * 0.44], [0, (a * 180) / Math.PI, 0]); }
    k.add('room', cylUV(0.03, 0.05, 1.7, 8), S.steel, [0, 7.75, 0]);
    k.add('room', new THREE.ConeGeometry(0.05, 0.25, 8), S.steel, [0, 8.7, 0]);
    k.add('room', boxUV(0.4, 0.025, 0.025), S.steel, [0, 8.1, 0]);
    // inside: smoke hood and flue above the lens
    k.add('room', latheUV([[0.62, 3.72], [0.5, 3.82], [0.22, 4.15], [0.16, 4.3]], 24), S.copper);
    k.add('room', cylUV(0.15, 0.15, 1.5, 16), S.copper, [0, 5.05, 0]);
    addRing(k, 'room', 0.6, 0.02, 3.72, S.brassD, 32, 5);
    // ceiling ring + hood stays
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; k.member('room', [Math.sin(a) * 0.55, 3.74, Math.cos(a) * 0.55], [Math.sin(a) * (R - 0.05), 3.93, Math.cos(a) * (R - 0.05)], 0.03, 0.04, S.ironFrame); }
  }

  // ------------------------------------------------ pedestal (cast iron, fluted, brass bands) + burner (fixed)
  {
    k.add('pedestal', latheUV([[0.78, 0.0], [0.78, 0.08], [0.62, 0.14], [0.5, 0.3], [0.44, 0.6], [0.44, 0.9], [0.56, 1.02], [0.8, 1.1], [0.84, 1.15], [0.2, 1.15]], 32), S.pedestal);
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; k.add('pedestal', boxUV(0.04, 0.55, 0.04), S.pedestal, [Math.sin(a) * 0.45, 0.62, Math.cos(a) * 0.45], [0, (a * 180) / Math.PI, 0]); }
    addRing(k, 'pedestal', 0.46, 0.025, 0.34, S.brassD, 32, 5);
    addRing(k, 'pedestal', 0.46, 0.025, 0.9, S.brassD, 32, 5);
    // roller race on top
    for (let i = 0; i < 20; i++) { const a = (i / 20) * Math.PI * 2; k.add('pedestal', new THREE.SphereGeometry(0.03, 8, 6), S.steel, [Math.sin(a) * 0.72, 1.17, Math.cos(a) * 0.72]); }
    // maker's plate on the pedestal (blank, no lettering)
    k.add('pedestal', boxUV(0.3, 0.18, 0.02), S.brass, [0, 0.65, -0.46]);
    // burner: fount, riser, gallery, mantle
    k.add('pedestal', latheUV([[0.04, 1.15], [0.16, 1.5], [0.17, 1.72], [0.12, 1.86], [0.04, 1.9]], 24), S.brass);
    k.add('pedestal', cylUV(0.03, 0.03, 0.4, 12), S.brassD, [0, 2.08, 0]);
    k.add('pedestal', latheUV([[0.03, 2.26], [0.085, 2.27], [0.085, 2.31], [0.05, 2.32]], 20), S.brassG);
    k.add('pedestal', latheUV([[0.028, 2.3], [0.05, 2.36], [0.052, 2.44], [0.035, 2.5], [0.0, 2.52]], 16), S.mantle);
    // feed pipe and pressure pump at the pedestal foot
    k.add('pedestal', sweep([v3(0.15, 1.55, 0.05), v3(0.42, 1.2, 0.2), v3(0.6, 0.6, 0.35), v3(0.66, 0.1, 0.4)], 0.018, 20, 6), S.brassD);
    k.add('pedestal', cylUV(0.11, 0.11, 0.5, 14), S.brassG, [-0.85, 0.25, -0.3]);
    k.add('pedestal', cylUV(0.02, 0.02, 0.4, 8), S.steel, [-0.85, 0.65, -0.3]);
    k.add('pedestal', boxUV(0.3, 0.02, 0.02), S.steel, [-0.85, 0.85, -0.3]);
  }

  // ------------------------------------------------ the lens: brass frame (inked), glass (overlay)
  {
    const L = 'lens';
    // belt frame: octagon bars top and bottom, mullions
    const ap = 0.99, half = ap * Math.tan(Math.PI / 8);
    for (let i = 0; i < 8; i++) {
      const a0 = (i / 8) * Math.PI * 2 - Math.PI / 8, a1 = a0 + Math.PI / 4;
      const rc = ap / Math.cos(Math.PI / 8);
      const p0 = [Math.sin(a0) * rc, Math.cos(a0) * rc], p1 = [Math.sin(a1) * rc, Math.cos(a1) * rc];
      for (const y of [-0.44, 0.44]) k.member(L, [p0[0], y, -p0[1]], [p1[0], y, -p1[1]], 0.05, 0.05, S.brass);
      k.member(L, [p0[0], -0.44, -p0[1]], [p0[0], 0.44, -p0[1]], 0.045, 0.045, S.brass);
      // astragals following the beehive above and below
      for (const sg of [1, -1]) {
        const pts = [];
        for (let j = 0; j <= 10; j++) { const y = sg * (0.44 + (0.64 * j) / 10); const r = beeR(y) + 0.035; pts.push(v3(Math.sin(a0) * r, y, -Math.cos(a0) * r)); }
        k.add(L, sweep(pts, 0.022, 20, 5), S.brass);
      }
      // small bosses at the panel centres (where the bullseye frame is pinned)
      void half;
    }
    // horizontal brass bands holding the prism rings
    for (const y of [0.62, 0.8, 0.95, -0.62, -0.8, -0.95]) addRing(k, L, beeR(y) + 0.03, 0.012, y, S.brassG, 48, 5);
    // crown and finial
    k.add(L, latheUV([[0.48, 1.06], [0.5, 1.1], [0.42, 1.16], [0.2, 1.26], [0.08, 1.3], [0.06, 1.42], [0.1, 1.46], [0.0, 1.52]], 32), S.brass);
    addRing(k, L, 0.49, 0.025, 1.08, S.brassD, 40, 6);
    // base ring, turntable, bull gear
    addRing(k, L, 0.5, 0.03, -1.07, S.brassD, 40, 6);
    k.add(L, latheUV([[0.25, -1.08], [0.55, -1.08], [0.84, -1.1], [0.87, -1.13], [0.85, -1.17], [0.3, -1.17]], 48), { ...S.brassD, col: '#5f5644', id: 34 });
    const bull = gearGeo(TRAIN.bull.N, TRAIN.bull.R, 0.07, { spokes: 6, hub: 0.3, bore: 0.22, spokeW: 0.05 }).rotateX(Math.PI / 2);
    k.add(L, bull, S.brassG, [0, TRAIN.bull.y - LENS_Y, 0]);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; k.add(L, new THREE.CylinderGeometry(0.018, 0.022, 0.03, 6), S.steel, [Math.cos(a) * 0.27, TRAIN.bull.y - LENS_Y + 0.045, Math.sin(a) * 0.27]); }
    for (let i = 0; i < 6; i++) { const a = (i / 6 + 1 / 12) * Math.PI * 2; k.add(L, new THREE.CylinderGeometry(0.014, 0.017, 0.025, 6), S.steel, [Math.cos(a) * 0.82, TRAIN.bull.y - LENS_Y + 0.045, Math.sin(a) * 0.82]); }
    // the chimney support arms reach from the lens? no: the burner is fixed; the lens floats round it on the race.
  }

  // ------------------------------------------------ the gear train (ECU hero)
  {
    const A = TRAIN.A, B = TRAIN.B, C = TRAIN.C;
    k.add('gearA', gearGeo(A.N, A.R, 0.06, { spokes: 5, hub: 0.09, bore: 0.035, spokeW: 0.03 }), S.brassG);
    k.add('gearA', cylUV(0.05, 0.05, 0.1, 16).rotateX(Math.PI / 2), S.brassD);
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; k.add('gearA', new THREE.CylinderGeometry(0.01, 0.012, 0.02, 6).rotateX(Math.PI / 2), S.steel, [Math.cos(a) * 0.075, Math.sin(a) * 0.075, 0.035]); }
    // ratchet wheel + its pawl (pawl on the frame)
    k.add('gearA', gearGeo(16, 0.12, 0.04, { bore: 0.03 }), S.steel, [0, 0, -0.16]);
    k.add('gearA', cylUV(0.035, 0.035, 0.75, 12).rotateX(Math.PI / 2), S.steel, [0, 0, 0.1]);
    // crank: arm + grip (declutches from the axle at dawn, so its own joint)
    k.add('crank', cylUV(0.07, 0.07, 0.08, 16).rotateX(Math.PI / 2), S.crankIron, [0, 0, TRAIN.crankZ - A.at[2]]);
    k.add('crank', latheUV([[0, 0], [0.075, 0], [0.08, 0.015], [0.0, 0.03]], 20).rotateX(Math.PI / 2), S.brass, [0, 0, TRAIN.crankZ - A.at[2] + 0.03]);
    k.add('crank', boxUV(0.03, 0.03, 0.01), { ...S.iron, id: 38, col: '#0b0d0c' }, [0, 0, TRAIN.crankZ - A.at[2] + 0.061]);
    k.member('crank', [0, 0, TRAIN.crankZ - A.at[2]], [TRAIN.crankR, 0, TRAIN.crankZ - A.at[2]], 0.07, 0.045, S.crankIron);
    k.add('crank', cylUV(0.03, 0.03, 0.08, 10).rotateX(Math.PI / 2), S.steel, [TRAIN.crankR, 0, TRAIN.crankZ - A.at[2] + 0.04]);
    k.add('crank', latheUV([[0.032, 0], [0.04, 0.03], [0.042, 0.14], [0.036, 0.18], [0.0, 0.19]], 14).rotateX(Math.PI / 2), S.grip, [TRAIN.crankR, 0, TRAIN.crankZ - A.at[2] + 0.06]);
    k.add('gearB', gearGeo(B.N, B.R, 0.06, { bore: 0.03 }), S.brassG);
    k.add('gearB', cylUV(0.03, 0.03, 0.2, 10).rotateX(Math.PI / 2), S.steel, [0, 0, -0.06]);
    k.add('gearB', new THREE.ConeGeometry(0.07, 0.05, 12).rotateX(-Math.PI / 2), S.brassD, [0, 0, -0.14]);
    k.add('gearC', gearGeo(C.N, C.R, 0.07, { bore: 0.03 }).rotateX(Math.PI / 2), S.brassD);
    k.add('gearC', cylUV(0.028, 0.028, 0.3, 10), S.steel, [0, -0.15, 0]);
    k.add('gearC', new THREE.ConeGeometry(0.07, 0.05, 12).rotateX(Math.PI), S.brassG, [0, -0.2, 0]);
    // sprocket for the weight chain
    k.add('sprocket', gearGeo(12, 0.14, 0.05, { bore: 0.03 }), S.steel);
    k.add('sprocket', cylUV(0.025, 0.025, 0.4, 8).rotateX(Math.PI / 2), S.steel, [0, 0, -0.15]);
    // frame: two pierced cast-iron cheeks across the axles, a foot rail she braces her boots on
    const cheek = [[-0.3, 0], [0.9, 0], [0.9, 0.2], [0.82, 1.1], [0.4, 1.12], [-0.08, 1.12], [-0.3, 0.9]];
    const holes = [{ x: 0.0, y: 0.95, r: 0.25 }, { x: 0.58, y: 0.95, r: 0.12 }, { x: 0.3, y: 0.35, r: 0.2 }];
    k.add('frame', extrude(cheek, 0.05, 0.008, holes, 30), S.ironFrame, [0, 0, 0.86]);
    // open front: a slim cast bracket carries the outer axle ends, so the gears stay in view
    k.member('frame', [0.3, 0.0, 1.38], [0.3, 0.95, 1.38], 0.09, 0.06, S.ironFrame);
    k.member('frame', [-0.07, 0.95, 1.38], [0.65, 0.95, 1.38], 0.08, 0.05, S.ironFrame);
    k.member('frame', [0.3, 0.1, 1.38], [0.75, 0.0, 1.2], 0.06, 0.05, S.ironFrame);
    k.member('frame', [0.3, 0.1, 1.38], [-0.15, 0.0, 1.2], 0.06, 0.05, S.ironFrame);
    k.add('frame', boxUV(1.3, 0.06, 0.62), S.ironFrame, [0.3, 0.03, 1.11]);
    k.add('frame', boxUV(1.4, 0.1, 0.08), S.iron, [0.3, 0.05, 1.46]);
    // kick bar in front of the crank, bolted to the frame base by two floor straps: she braces her boots on it
    k.add('frame', cbox(0.8, 0.13, 0.08, 0.02), S.iron, [0.0, 0.065, 1.99]);
    for (const x of [-0.34, 0.34]) k.add('frame', cylUV(0.022, 0.022, 0.03, 8), S.brassD, [x, 0.13, 1.99]);   // bolt heads: it is bolted through the floor
    for (const [x, y] of [[0.0, 0.95], [0.58, 0.95]]) for (const z of [0.86, 1.38]) k.add('frame', cylUV(0.06, 0.06, 0.07, 14).rotateX(Math.PI / 2), S.brassD, [x, y, z + (z > 1 ? 0.035 : -0.035)]);
    // stay to the pedestal and a bearing bracket for the vertical pinion shaft
    k.member('frame', [0.58, 0.95, 0.86], [0.58, 0.95, 0.97], 0.08, 0.08, S.ironFrame);
    k.member('frame', [0.2, 1.08, 0.86], [0.12, 1.04, 0.42], 0.06, 0.05, S.ironFrame);
    // keyhole escutcheon on the front cheek: the brass key engages the crank's clutch here
    // pawl
    k.add('frame', extrude([[0, 0], [0.16, 0.02], [0.17, 0.05], [0, 0.04]], 0.03, 0.005, [], 30), S.steel, [-0.22, 0.72, 0.96], [0, 0, 22]);
    // weight tube collar in the floor below the chain
    k.add('frame', cylUV(0.09, 0.09, 0.12, 14, 1, true), S.iron, [TRAIN.sprocket[0] - 0.15, 0.06, TRAIN.sprocket[2]]);
    k.add('frame', ring(0.09, 0.02, 16, 5), S.brassD, [TRAIN.sprocket[0] - 0.15, 0.12, TRAIN.sprocket[2]]);
    // stub axle carrier for the sprocket
    k.member('frame', [TRAIN.sprocket[0], TRAIN.sprocket[1], 0.86], [-0.3, 0.8, 0.86], 0.05, 0.05, S.ironFrame);
  }

  // ------------------------------------------------ the snapped chain: hangs from the sprocket, broken link at the end
  {
    const n = 11, lenL = 0.07;
    for (let i = 0; i < n; i++) {
      const g = linkGeo(lenL, 0.04, 0.008);
      k.add('chain', g, S.chain, [0, -0.02 - i * (lenL - 0.014), 0], [0, i % 2 ? 90 : 0, 0]);
    }
    // the broken link: open C
    const bl = new THREE.TorusGeometry(0.02, 0.008, 6, 10, Math.PI * 1.3);
    k.add('chain', bl, S.chain, [0.0, -0.04 - n * (lenL - 0.014), 0], [0, 0, -60]);
    // a few links fallen on the floor by the tube collar
    for (let i = 0; i < 5; i++) k.add('shards', linkGeo(lenL, 0.04, 0.008).rotateX(Math.PI / 2), S.chain, [TRAIN.sprocket[0] - 0.4 - i * 0.05, 0.01, TRAIN.sprocket[2] + 0.12 + Math.sin(i) * 0.05], [0, i * 37, 0]);
  }

  // ------------------------------------------------ glass shards on the floor (shown after the bolt)
  {
    for (let i = 0; i < 70; i++) {
      const a = rng.range(-1.2, 1.4) + Math.PI * 0.35, r = rng.range(1.7, 3.1);
      const s = rng.range(0.03, 0.12);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, s, 0, rng.range(-0.3, 0.3) * s, rng.range(0.1, 0.7) * s, 0, rng.range(0.4, 1) * s], 3));
      g.computeVertexNormals();
      k.add('shards', g, S.shard, [Math.sin(a) * r, 0.008 + rng.range(0, 0.004), Math.cos(a) * r], [rng.range(-5, 5), rng.range(0, 360), rng.range(-5, 5)]);
    }
  }

  // the lens door's own brass frame (swings with the door glass)
  {
    const [h0, , h2] = LG.hinge, c = LG.corners;
    const off = (p) => [p[0] - h0, p[1], p[2] - h2];
    for (const [a, b] of [[c[0], c[1]], [c[1], c[2]], [c[2], c[3]], [c[3], c[0]]]) k.member('door', off(a), off(b), 0.035, 0.035, S.brassG);
    const m = [(c[1][0] + c[2][0]) / 2, 0, (c[1][2] + c[2][2]) / 2];
    k.add('door', boxUV(0.04, 0.12, 0.04), S.brassD, off([m[0] * 1.06, 0, m[2] * 1.06]));
  }
  {
    // step: top plate, legs, ladder on the outer side (+Z local = away from the lens)
    const T = STEP.top;
    k.add('step', cbox(0.66, 0.05, 0.5, 0.012), S.floor, [0, T - 0.025, 0]);
    for (const [x, z] of [[-0.29, -0.21], [0.29, -0.21], [-0.29, 0.21], [0.29, 0.21]]) k.member('step', [x, 0, z], [x, T - 0.05, z], 0.04, 0.04, S.ironFrame);
    for (const y of [0.27, 0.54, 0.8]) k.member('step', [-0.29, y, 0.25], [0.29, y, 0.25], 0.035, 0.03, S.iron);
    k.member('step', [-0.29, 0.3, -0.21], [0.29, 0.3, -0.21], 0.03, 0.03, S.ironFrame);
    // hand rail on one side
    k.member('step', [0.3, T, 0.2], [0.3, T + 0.75, 0.2], 0.03, 0.03, S.ironFrame);
    k.member('step', [0.3, T + 0.75, 0.2], [0.3, T + 0.75, -0.22], 0.03, 0.03, S.ironFrame);
  }
  // ---- pawl: pivot post on a floor bracket, arm reaching to the bull gear rim, wedge tip, return spring
  {
    const pv = J.pawl.position, tipW = [Math.cos(PAWL.psi) * 0.975, Math.sin(PAWL.psi) * 0.975];
    const tip = [tipW[0] - pv.x, 0.0, tipW[1] - pv.z];
    k.member('pawl', [0, 0, 0], [tip[0] * 0.86, 0, tip[2] * 0.86], 0.05, 0.035, S.steel);
    k.add('pawl', cylUV(0.04, 0.04, 0.06, 14), S.brassD);
    const tl = Math.hypot(tip[0], tip[2]), ux = tip[0] / tl, uz = tip[2] / tl;
    k.add('pawl', cbox(0.05, 0.035, 0.09, 0.01, { dt: 0.02 }), S.steel, [tip[0] - ux * 0.04, 0, tip[2] - uz * 0.04], [0, (Math.atan2(ux, uz) * 180) / Math.PI, 0]);
    // fixed: post, floor bracket, spring
    k.add('frame', cylUV(0.035, 0.045, TRAIN.bull.y - 0.03, 10), S.ironFrame, [pv.x, (TRAIN.bull.y - 0.03) / 2, pv.z]);
    k.add('frame', cbox(0.22, 0.05, 0.22, 0.02), S.ironFrame, [pv.x, 0.025, pv.z]);
    const sp = [];
    for (let q = 0; q <= 40; q++) { const u = q / 40, a = u * Math.PI * 14; sp.push(v3(pv.x + ux * 0.05 * u + Math.cos(a) * 0.012, TRAIN.bull.y + 0.05 + Math.sin(a) * 0.012, pv.z + uz * 0.05 * u + 0.12 * u)); }
    k.add('frame', sweep(sp, 0.004, 80, 4), S.steel);
    // index pointer on its own little post, pointing at the marked tooth
    const ip = INDEX.psi, po = [Math.cos(ip) * 1.16, Math.sin(ip) * 1.16];
    k.add('frame', cylUV(0.025, 0.035, TRAIN.bull.y + 0.05, 8), S.ironFrame, [po[0], (TRAIN.bull.y + 0.05) / 2, po[1]]);
    k.member('frame', [po[0], TRAIN.bull.y + 0.06, po[1]], [Math.cos(ip) * 1.005, TRAIN.bull.y + 0.06, Math.sin(ip) * 1.005], 0.03, 0.015, S.brass);
    k.add('frame', new THREE.ConeGeometry(0.02, 0.05, 6).rotateZ(Math.PI / 2), S.brass, [Math.cos(ip) * 0.995, TRAIN.bull.y + 0.06, Math.sin(ip) * 0.995], [0, -(ip * 180) / Math.PI + 180, 0]);
    // the paint-marked tooth on the bull gear (white lead paint dab), lens-local
    const a = INDEX.k * TOOTH;
    k.add('lens', boxUV(0.035, 0.012, 0.03), { id: 39, col: '#d9d2bf', metal: 0, kind: 5, detail: 0 }, [Math.cos(a) * 0.975, TRAIN.bull.y - LENS_Y + 0.04, Math.sin(a) * 0.975], [0, -(a * 180) / Math.PI, 0]);
  }
  // ---- rust and dust shaken loose at the notch (a few drawn flakes, each its own joint)
  J.flakeList = [];
  for (let i = 0; i < 26; i++) {
    const nm = 'flake' + i; mk(nm, J.flakes);
    const sz = 0.014 + rng.range(0, 0.022);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, sz, 0, sz * 0.3, sz * 0.4, 0, sz], 3)); g.computeVertexNormals();
    k.add(nm, g, { id: 38, col: i % 3 ? '#5a3e2c' : '#8a8274', metal: 0, kind: 5, detail: 0 });
    J.flakeList.push({ j: J[nm], ang: rng.range(0, Math.PI * 2), sp: rng.range(0.05, 0.35), vy: rng.range(-0.1, 0.4), spin: rng.range(-12, 12), dt: rng.range(0, 0.12), src: i % 2 });
  }
  const meshes = k.finish(J, mat);
  // QA: solids in the lamp room
  const byName = (n) => J[n].children.find((m) => m.isMesh);
  ctx.colliders.push({ name: 'lampFloor', dept: 'mech', obj: byName('floor'), kind: 'solid' });
  ctx.colliders.push({ name: 'lensPedestal', dept: 'mech', obj: byName('pedestal'), kind: 'solid' });
  ctx.colliders.push({ name: 'crank', dept: 'mech', obj: byName('crank'), kind: 'solid' });
  ctx.colliders.push({ name: 'crankFrame', dept: 'mech', obj: byName('frame'), kind: 'solid' });
  ctx.colliders.push({ name: 'serviceStep', dept: 'mech', obj: byName('step'), kind: 'solid' });

  // ------------------------------------------------ glass: lens (rotates with the lens joint), chimney, panes
  const glassLens = glassMaterial({ mode: 0, tint: '#2f6a62', alpha: 0.32 });
  const glassPane = glassMaterial({ mode: 1, tint: '#1f3c40', alpha: 0.3 });
  const lensG = new THREE.Mesh(LG.main, glassLens); lensG.frustumCulled = false; lensG.name = 'mech:lensGlass';
  const lensPivot = new THREE.Group(); lensPivot.name = 'mech:lensGlassPivot';
  ctx.overlay.add(lensPivot); lensPivot.add(lensG);
  const doorPivot = new THREE.Group(); doorPivot.position.set(LG.hinge[0], 0, LG.hinge[2]);
  const doorG = new THREE.Mesh(LG.door, glassLens); doorG.frustumCulled = false;
  doorPivot.add(doorG); lensPivot.add(doorPivot);
  const chim = new THREE.Mesh(chimneyGlass(), glassLens); chim.frustumCulled = false;
  const panes = new THREE.Mesh(paneGlass(corner), glassPane); panes.frustumCulled = false; panes.name = 'mech:panes';
  const fixedPivot = new THREE.Group(); fixedPivot.position.copy(root.position);
  fixedPivot.add(chim); fixedPivot.add(panes);
  ctx.overlay.add(fixedPivot);

  return { root, J, meshes, glass: { lens: glassLens, pane: glassPane, lensPivot, fixedPivot, doorPivot }, corner };
}

// ---------------------------------------------------------------- glass geometry builders (aG attribute, see glassMaterial)
function pushTri(B, a, b, c, ga, gb, gc, ua = [0, 0], ub = [0, 0], uc = [0, 0]) {
  B.p.push(...a, ...b, ...c); B.g.push(...ga, ...gb, ...gc); B.u.push(...ua, ...ub, ...uc);
}
function finishGlass(B) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(B.p, 3));
  g.setAttribute('aG', new THREE.Float32BufferAttribute(B.g, 4));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(B.u, 2));
  g.computeVertexNormals();
  return g;
}

function buildLensGlass() {
  const B = { p: [], g: [], u: [] }, D = { p: [], g: [], u: [] };
  let hinge = null, corners = null;
  // prism rings above and below the belt: each ring a sawtooth (root, tip, root), cut into 8 sectors
  let ringI = 0;
  for (const sg of [1, -1]) {
    const n = sg > 0 ? 11 : 8, y0 = 0.45, y1 = sg > 0 ? 1.06 : 1.03;
    for (let j = 0; j < n; j++) {
      const ya = sg * (y0 + ((y1 - y0) * j) / n), yb = sg * (y0 + ((y1 - y0) * (j + 1)) / n);
      const ym = ya + (yb - ya) * (sg > 0 ? 0.62 : 0.62);
      const ra = beeR(ya), rb = beeR(yb), rm = beeR(ym) + 0.045;
      const prof = [[ra, ya, 0], [rm, ym, 1], [rb, yb, 0]];
      const seg = 64;
      for (let s = 0; s < seg; s++) {
        const a0 = (s / seg) * Math.PI * 2, a1 = ((s + 1) / seg) * Math.PI * 2;
        const P = (pr, a) => [Math.sin(a) * pr[0], pr[1], -Math.cos(a) * pr[0]];
        for (let q = 0; q < 2; q++) {
          const pa = prof[q], pb = prof[q + 1];
          const gA = [0, pa[2], ringI, s], gB = [0, pb[2], ringI, s];
          pushTri(B, P(pa, a0), P(pa, a1), P(pb, a1), gA, gA, gB);
          pushTri(B, P(pa, a0), P(pb, a1), P(pb, a0), gA, gB, gB);
        }
      }
      ringI++;
    }
  }
  // the belt: 8 bullseye panels (shallow domes with Fresnel steps), across = radius from the panel centre / 0.42
  const ap = 0.97, hw = ap * Math.tan(Math.PI / 8), hh = 0.43, nn = 18;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const nx = Math.sin(a), nz = -Math.cos(a), tx = Math.cos(a), tz = Math.sin(a);
    const P = (u, v) => {
      const x = (u * 2 - 1) * hw, y = (v * 2 - 1) * hh, rr = Math.hypot(x, y) / 0.42;
      const step = 0.012 * (1 - (rr * 6) % 1);
      const bulge = 0.07 * Math.max(0, 1 - rr * rr) + (rr < 1 ? step : 0);
      const d = ap + bulge;
      return [[nx * d + tx * x, y, nz * d + tz * x], Math.min(rr, 1.3)];
    };
    const T = i === DOOR_PANEL ? D : B;
    if (i === DOOR_PANEL) {
      hinge = [nx * ap - tx * hw, 0, nz * ap - tz * hw];
      corners = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => [nx * ap + tx * x, y, nz * ap + tz * x]);
    }
    for (let u = 0; u < nn; u++) for (let v = 0; v < nn; v++) {
      const [p00, r00] = P(u / nn, v / nn), [p10, r10] = P((u + 1) / nn, v / nn), [p11, r11] = P((u + 1) / nn, (v + 1) / nn), [p01, r01] = P(u / nn, (v + 1) / nn);
      const o = (p) => (T === D ? [p[0] - hinge[0], p[1], p[2] - hinge[2]] : p);
      pushTri(T, o(p00), o(p10), o(p11), [1, r00, 100 + i, i], [1, r10, 100 + i, i], [1, r11, 100 + i, i]);
      pushTri(T, o(p00), o(p11), o(p01), [1, r00, 100 + i, i], [1, r11, 100 + i, i], [1, r01, 100 + i, i]);
    }
  }
  return { main: finishGlass(B), door: finishGlass(D), hinge, corners };
}

function chimneyGlass() {
  const B = { p: [], g: [], u: [] };
  const seg = 20, r = 0.075, y0 = 2.27, y1 = 2.78;
  for (let s = 0; s < seg; s++) {
    const a0 = (s / seg) * Math.PI * 2, a1 = ((s + 1) / seg) * Math.PI * 2;
    const P = (a, y) => [Math.sin(a) * r * (y > 2.5 ? 0.85 : 1), y, Math.cos(a) * r * (y > 2.5 ? 0.85 : 1)];
    const g = [3, 0.5, 0, 0];
    pushTri(B, P(a0, y0), P(a1, y0), P(a1, y1), g, g, g); pushTri(B, P(a0, y0), P(a1, y1), P(a0, y1), g, g, g);
  }
  return finishGlass(B);
}

// glazing: one rectangle per facet, uv in metres along the facet; aG = [2, facet width, facet index, chance a diamond is smashed]
function paneGlass(corner) {
  const B = { p: [], g: [], u: [] };
  const R = GLAZE.r - 0.01, n = GLAZE.sides;
  for (let i = 0; i < n; i++) {
    const [x0, z0] = corner(i, R), [x1, z1] = corner(i + 1, R);
    const w = Math.hypot(x1 - x0, z1 - z0);
    // the bolt came down on the sea side (+X/-Z quadrant = the side the camera sees in s02): most panes there go
    const mid = Math.atan2((x0 + x1) / 2, -(z0 + z1) / 2);
    const brk = 0.25 + 0.55 * Math.max(0, Math.cos(mid - 0.6)) + 0.1 * ((i * 7) % 3 === 0 ? 1 : 0);
    const g = [2, w, i, Math.min(0.85, brk)];
    const yA = GLAZE.y0 + 0.05, yB = GLAZE.y1 - 0.05;
    const a = [x0, yA, z0], b = [x1, yA, z1], c = [x1, yB, z1], d = [x0, yB, z0];
    const v0 = yA - GLAZE.y0, v1 = yB - GLAZE.y0;
    pushTri(B, a, b, c, g, g, g, [0, v0], [w, v0], [w, v1]);
    pushTri(B, a, c, d, g, g, g, [0, v0], [w, v1], [0, v1]);
  }
  return finishGlass(B);
}
