// LAST LIGHT, land department: the shape of the black basalt island. Pure functions of (x, z), baked once.
// A horseshoe island around the harbour basin (origin), opening south (-Z) through the mouth between the reef teeth.
// Village terraces climb the north side; the headland with the 38 m cliff, the cottage and the tower stands east of the mouth.
// Same numbers in JS (groundY, placing houses) and GLSL (a baked texture).
import { MOUTH, HEADLAND, TOWER, COTTAGE, PIER } from './layout.js';

export const MAP = { size: 900, n: 901 };            // baked grid -size..size, 2 m a texel
export const STEP = 4.0;                              // one village terrace riser
export const QUAY_Y = 2.8;                            // the village quay top
export const PIER_TOP = PIER.from[1];                 // 2.2
export const PIER_ROOT_Z = PIER.from[2];               // the pier starts at the north quay and runs to PIER.to
export const PLATEAU = { x: 168, z: -306, rx: 92, rz: 90 };

const sst = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const hsh = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
export function vn(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hsh(xi, yi), b = hsh(xi + 1, yi), c = hsh(xi, yi + 1), d = hsh(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, o = 4) { let s = 0, a = 0.5, n = 0; for (let i = 0; i < o; i++) { s += a * vn(x, y); n += a; x = x * 2.03 + 1.7; y = y * 2.03 + 9.2; a *= 0.5; } return s / n; }
export function ridged(x, y, o = 4) { let s = 0, a = 0.5, n = 0; for (let i = 0; i < o; i++) { s += a * (1 - Math.abs(vn(x, y) * 2 - 1)); n += a; x = x * 2.1 + 3.1; y = y * 2.1 + 5.7; a *= 0.5; } return s / n; }

// ---------------------------------------------------------------- outlines (x, z)
export const OUTER = [
  [-84, -268], [-110, -300], [-150, -296], [-176, -262], [-214, -270], [-262, -226], [-300, -170], [-336, -150], [-352, -96],
  [-398, -40], [-412, 30], [-448, 96], [-440, 170], [-404, 214], [-430, 290], [-398, 372], [-346, 430], [-300, 432], [-250, 498],
  [-180, 530], [-120, 570], [-40, 600], [10, 560], [70, 588], [150, 560], [214, 500], [262, 470], [296, 400], [350, 330],
  [372, 250], [356, 190], [380, 110], [366, 30], [340, -40], [352, -110], [318, -170], [300, -236], [282, -300], [248, -360],
  [196, -394], [140, -392], [110, -364], [96, -330], [94, -290],
];
// rock islets off the coast: [x, z, radius, height]
export const ISLETS = [[-470, 40, 24, 30], [420, 60, 20, 26], [-120, 650, 26, 34], [-500, 250, 14, 18]];
// the basin: an ellipse plus the channel out through the mouth (water, positive inside)
const BASIN = { cx: -10, cz: 14, rx: 168, rz: 122 };
const CHANNEL = [[-112, -60], [-96, -170], [-84, -262], [-90, -600], [100, -600], [96, -300], [100, -200], [120, -60]];
export const PATH = [   // the cliff path: village east end -> up the ridge -> cottage door -> tower door
  [150, 92], [176, 40], [196, -24], [206, -98], [196, -170], [176, -224], [158, -262], [150, -276], [158, -296],
];
const segDist = (px, pz, ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz || 1;
  const t = clamp01(((px - ax) * dx + (pz - az) * dz) / l);
  return Math.hypot(px - ax - t * dx, pz - az - t * dz);
};
function polyDist(px, pz, P) {
  let d = 1e12, inside = false;
  for (let i = 0, n = P.length, j = n - 1; i < n; j = i++) {
    const [ax, az] = P[j], [bx, bz] = P[i];
    d = Math.min(d, segDist(px, pz, ax, az, bx, bz));
    if ((az > pz) !== (bz > pz) && px < ((bx - ax) * (pz - az)) / (bz - az) + ax) inside = !inside;
  }
  return inside ? d : -d;
}
export function pathDist(x, z) { let d = 1e9; for (let i = 0; i < PATH.length - 1; i++) d = Math.min(d, segDist(x, z, PATH[i][0], PATH[i][1], PATH[i + 1][0], PATH[i + 1][1])); return d; }
const smin = (a, b, k) => { const h = clamp01(0.5 + 0.5 * (b - a) / k); return b + (a - b) * h - k * h * (1 - h); };
const smax = (a, b, k) => -smin(-a, -b, k);
function ellipseSd(x, z, e) { const q = Math.hypot((x - e.cx) / e.rx, (z - e.cz) / e.rz); return (1 - q) * Math.min(e.rx, e.rz); }

// Basalt column clusters: the two reef teeth at the mouth and a sea stack off the headland. Each is a crowd of 5-7-sided
// prisms of different heights rising to a leaning fang, the tops cut on a slant, standing on a wave-cut base.
// Pure data (seeded), shared by the meshes (land-build.js) and groundY.
const _h = (a, b) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };
function makeCluster(o) {
  const cols = [];
  const { x, z, R, H, peak, seed, sp = 2.7 } = o;
  const px = x + peak[0], pz = z + peak[1];
  // hex-ish packing jittered
  for (let j = -12; j <= 12; j++) for (let i = -12; i <= 12; i++) {
    const cx = x + (i + (j & 1) * 0.5) * sp + (_h(i + seed, j) - 0.5) * sp * 0.45;
    const cz = z + j * sp * 0.87 + (_h(j + seed, i + 7) - 0.5) * sp * 0.45;
    const dE = Math.hypot((cx - x) / o.ex, (cz - z) / o.ez);
    const edge = R * (0.82 + 0.3 * _h(Math.floor(Math.atan2(cz - z, cx - x) * 3), seed));
    if (dE > edge) continue;
    const dp = Math.hypot(cx - px, cz - pz) / R;
    let h = H * Math.pow(Math.max(0, 1 - dp * o.fall), o.pw) * (0.78 + 0.32 * _h(i * 3.1 + seed, j * 1.7));
    // a second, lower point gives the fang a notch
    if (o.peak2) { const d2 = Math.hypot(cx - x - o.peak2[0], cz - z - o.peak2[1]) / R; h = Math.max(h, o.peak2[2] * Math.pow(Math.max(0, 1 - d2 * 2.4), 0.8) * (0.8 + 0.3 * _h(j, i + seed))); }
    h = Math.max(h, 1.2 + 2.2 * _h(i + 9, j + seed) * (1 - dE / edge));
    const r = sp * (0.52 + 0.08 * _h(i, j * 5 + seed));
    const sides = 5 + Math.floor(_h(i * 7, j + seed) * 2.99);
    const rot = _h(i, j + seed * 3) * 6.28;
    // the top cut slants down away from the peak: a sharp blade line on the skyline
    const ta = Math.atan2(cz - pz, cx - px) + (_h(j, i) - 0.5) * 0.9;
    const tilt = (0.35 + 0.6 * _h(i + 2, j + 3)) * Math.min(1.2, h / 6);
    cols.push({ x: cx, z: cz, r, h, sides, rot, ta, tilt, tone: _h(i * 1.3 + seed, j * 2.9) });
  }
  return { ...o, px, pz, conv: o.conv ?? 0, cols };
}
export const CLUSTERS = [
  makeCluster({ name: 'toothL', x: MOUTH.toothL[0], z: MOUTH.toothL[2], R: 13, ex: 1.0, ez: 0.8, H: 30, peak: [5, -1], peak2: [-6, 3, 16], fall: 1.35, pw: 0.95, seed: 3, conv: 0.3 }),
  makeCluster({ name: 'toothR', x: MOUTH.toothR[0], z: MOUTH.toothR[2], R: 13, ex: 1.0, ez: 0.85, H: 31, peak: [-4, -2], peak2: [6, 4, 14], fall: 1.35, pw: 0.95, seed: 11, conv: 0.3 }),
  makeCluster({ name: 'stack', x: 150, z: -418, R: 11, ex: 0.9, ez: 1.0, H: 34, peak: [1, 1], peak2: [-4, -5, 22], fall: 1.0, pw: 0.55, seed: 23, sp: 2.5, conv: 0.12 }),
];
export const TEETH_TOP = { toothL: CLUSTERS[0].H, toothR: CLUSTERS[1].H };
// the base each cluster stands on: an awash wave-cut ledge
function clusterBase(C, x, z) {
  const d = Math.hypot((x - C.x) / C.ex, (z - C.z) / C.ez);
  if (d > C.R * 1.35) return -1e9;
  return 1.6 * (1 - Math.pow(d / (C.R * 1.35), 2)) - 1.2;
}
export function clusterH(x, z) {
  let h = -1e9;
  for (const C of CLUSTERS) {
    if (Math.hypot(x - C.x, z - C.z) > C.R * 1.5) continue;
    h = Math.max(h, clusterBase(C, x, z));
    for (const c of C.cols) {
      const k = C.conv * (c.h / C.H);
      const dx = x - (c.x + (C.px - c.x) * k), dz = z - (c.z + (C.pz - c.z) * k);
      if (dx * dx + dz * dz > c.r * c.r * 0.85) continue;
      h = Math.max(h, c.h - c.tilt * (Math.cos(c.ta) * dx + Math.sin(c.ta) * dz));
    }
  }
  return h;
}
export const toothH = clusterH;

let M = null;
export function landMap() {
  if (M) return M;
  const { size, n } = MAP;
  const dx = (2 * size) / (n - 1);
  const H = new Float32Array(n * n), C = new Float32Array(n * n), V = new Float32Array(n * n), K = new Float32Array(n * n);
  // raw shape at any point (no bake)
  function shape(x, z) {
    const wa = 30 * (fbm(x * 0.007 + 11, z * 0.007 + 2, 3) - 0.5), wb = 30 * (fbm(x * 0.007 + 5, z * 0.007 + 17, 3) - 0.5);
    const fine = (fbm(x * 0.05 + 1, z * 0.05 + 6, 3) - 0.5) * 5 + (vn(x * 0.22 + 4, z * 0.22 + 1) - 0.5) * 2.4;
    const wx = x + wa, wz = z + wb;
    let cO = polyDist(wx, wz, OUTER) + fine;
    // gullies and buttresses: the cliff line bites in and juts out (strongest round the headland)
    const nearHead = sst(160, 60, Math.hypot(x - 168, z - 320));
    cO += (ridged(x * 0.035 + 7, z * 0.035 + 2, 3) - 0.55) * 22 * nearHead + (vn(x * 0.11, z * 0.11) - 0.5) * 3 * nearHead;
    let isl = -1;
    for (let i = 0; i < ISLETS.length; i++) { const [ix, iz, ir] = ISLETS[i]; const ci = ir - Math.hypot(wx - ix, wz - iz) + fine; if (ci > cO) { cO = ci; isl = i; } }
    // basin water: a cleaner shore in the village (quays are built), ragged elsewhere
    const quayK = sst(-30, 40, z) * (1 - sst(150, 175, Math.abs(x + 10)));
    const qx = x + wa * 0.25 * (1 - quayK) * 4, qz = z + wb * 0.25 * (1 - quayK) * 4;
    let cB = ellipseSd(qx, qz, BASIN);
    cB = smax(cB, polyDist(qx, qz, CHANNEL) + fine * (1 - quayK), 22);
    cB += fine * (1 - quayK);
    const c = Math.min(cO, -cB);
    return { cO, cB, c, quayK, isl };
  }
  function plateauSd(x, z) { const q = Math.hypot((x - PLATEAU.x) / PLATEAU.rx, (z - PLATEAU.z) / PLATEAU.rz); return (q - 1) * Math.min(PLATEAU.rx, PLATEAU.rz); }
  function rawHeight(x, z) {
    const s = shape(x, z);
    const { c, cB, cO, quayK, isl } = s;
    if (c <= 0) {
      // seabed: shelves fast near the cliffs, basin 6-9 m deep
      return { h: Math.max(-16, Math.min(-0.6, c * 0.35 - 1.5)), s, vil: 0 };
    }
    const db = Math.max(-cB, 0);
    if (isl >= 0) { const I = ISLETS[isl]; const hh = I[3] * (1 - Math.exp(-c / 2.5)) * (0.75 + 0.5 * ridged(x * 0.05, z * 0.05, 3)); return { h: hh, s, vil: 0, plat: 0 }; }
    // the village amphitheatre: terraces from the quay up to ~60 m
    const n1 = fbm(x * 0.009 + 3, z * 0.009 + 8, 3);
    let P = QUAY_Y + 60 * Math.pow(sst(6, 230, db + (n1 - 0.5) * 30), 0.9);
    // the inland hills behind the village: a crest ~130 m, a west hill, an east shoulder
    const bump = (cx, cz, r, hh) => hh * Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (r * r));
    P += bump(-70, 440, 190, 72) + bump(-300, 250, 130, 38) + bump(250, 300, 120, 30) + bump(60, 520, 110, 30);
    P += 30 * sst(330, 520, z) * (0.6 + 0.8 * fbm(x * 0.006, z * 0.006, 3));
    P += (ridged(x * 0.012 + 2, z * 0.012 + 4, 4) - 0.5) * 10 * sst(40, 140, db);
    // toward the outer coast the land sags: cliffs 15-60 m, the hills stand inland
    const toOut = -cB < cO ? 0 : 1;
    P *= 0.32 + 0.68 * sst(0, 150 + 80 * fbm(x * 0.01 + 7, z * 0.01, 2), cO);
    void toOut;
    // west arm: a lower, rougher spine
    const west = sst(-120, -170, x) * sst(40, -80, z);
    P = P * (1 - 0.35 * west) + west * 6 * (ridged(x * 0.02, z * 0.02, 3) - 0.3);
    // the headland plateau: dead level at the cliff top where the tower stands
    const pd = plateauSd(x + (fbm(x * 0.03, z * 0.03, 2) - 0.5) * 16, z);
    const plat = 1 - sst(-14, 26, pd);
    const dT = Math.hypot(x - TOWER.base[0], z - TOWER.base[2]), dC = Math.hypot(x - COTTAGE.pos[0], z - COTTAGE.pos[2]);
    // a crest: the tower and the cottage stand on the high ground, the turf falls away 3-6 m toward the rim, rolling
    const rim = Math.min(dT, dC + 4);
    const roll = (fbm(x * 0.025 + 3, z * 0.025 + 9, 3) - 0.5) * 4 * sst(20, 46, rim);
    const fallOff = (3 + 3 * fbm(x * 0.012 + 1, z * 0.012 + 6, 2)) * Math.pow(sst(20, 85, rim), 1.2);
    P = P * (1 - plat) + (HEADLAND.cliffTop - fallOff + roll) * plat;
    // the ridge from the plateau north to the village: never sags below 26
    const ridge = sst(110, 150, x) * sst(-60, -200, z) * (1 - plat);
    P = Math.max(P, P * (1 - ridge) + ridge * (26 + 12 * sst(-120, -240, z)));
    // shore profile: sheer basalt to the open sea and the channel, a quay wall in the village, rock banks elsewhere
    const toBasin = -cB < cO ? 1 : 0;
    const vk = toBasin * quayK;
    // most of the outer coast is sheer; in places it breaks down into rocky slopes
    const soft = sst(0.55, 0.7, fbm(x * 0.008 + 40, z * 0.008 + 3, 3)) * (1 - plat);
    const kc = (1.6 + 2.6 * (1 - plat) * (1 - sst(-120, -40, z))) * (1 + 7 * soft);
    const cliffK = 1 - Math.exp(-c / kc);
    const bank = 1 - Math.exp(-c / 7);
    // sea cliffs climb in tiers: three sheer faces with ledges between (ledges come and go along the coast)
    let stepped = cliffK;
    if (!toBasin) {
      const n1 = fbm(x * 0.021 + 5, z * 0.021 + 1, 2), n2 = fbm(x * 0.019 + 9, z * 0.019 + 4, 2);
      const a1 = 0.24 + 0.2 * n1, a2 = 0.55 + 0.2 * n2;
      const fw = 1.4 + 1.2 * fbm(x * 0.05, z * 0.05, 2);
      const w1 = 7 * sst(0.42, 0.66, n2), w2 = 6 * sst(0.4, 0.62, fbm(x * 0.03 + 2, z * 0.03 + 8, 2));
      stepped = a1 * sst(0, fw, c) + (a2 - a1) * sst(fw + w1, 2 * fw + w1, c) + (1 - a2) * sst(2 * fw + w1 + w2, 3 * fw + w1 + w2, c);
      // ledges are not dead flat: a little slope back toward the face, rubble
      stepped += 0.02 * sst(fw, fw + w1, c) * (1 - sst(fw + w1, 2 * fw + w1, c));
      stepped = stepped * (1 - soft) + cliffK * soft;
    }
    let prof = toBasin ? (vk > 0.5 ? (c > 0.6 ? 1 : c / 0.6) : bank * (1 - quayK) + quayK * Math.min(1, c / 0.6)) : stepped;
    let h = P * prof;
    // terraces where people built
    const vil = toBasin * sst(-20, 50, z) * (1 - plat) * sst(4, 12, db) * (1 - sst(225, 255, db));
    if (vil > 0.01 && h > QUAY_Y + 1) {
      const q = (h - QUAY_Y) / STEP, f = q - Math.floor(q);
      const hq = QUAY_Y + (Math.floor(q) + sst(0.84, 1, f)) * STEP;
      h += (hq - h) * sst(0.1, 0.5, vil);
    }
    // the quay tread is flat
    if (vk > 0.5 && db < 9) h = c > 0.6 ? QUAY_Y : QUAY_Y * c / 0.6;
    // basalt relief off the plateau and the treads
    const relief = (ridged(x * 0.045 + 2.1, z * 0.045 + 1.3, 3) - 0.5) * 3.2 + (fbm(x * 0.2, z * 0.2, 2) - 0.5) * 0.8;
    h += relief * (1 - plat * 0.9) * (1 - vil) * sst(3, 30, c) * (1 - (vk > 0.5 && db < 9 ? 1 : 0));
    h += (fbm(x * 0.15, z * 0.15, 2) - 0.5) * 0.5 * plat;   // grass hummocks on the plateau
    return { h, s, vil, plat };
  }
  for (let j = 0; j < n; j++) {
    const z = -size + j * dx;
    for (let i = 0; i < n; i++) {
      const x = -size + i * dx;
      const r = rawHeight(x, z);
      const k = j * n + i;
      H[k] = r.h; C[k] = r.s.c; V[k] = r.vil; K[k] = r.plat ?? 0;
    }
  }
  const bil = (arr, x, z) => {
    const u = clamp01((x + size) / (2 * size)) * (n - 1), v = clamp01((z + size) / (2 * size)) * (n - 1);
    const i = Math.min(n - 2, Math.floor(u)), j = Math.min(n - 2, Math.floor(v)), f = u - i, g = v - j;
    return arr[j * n + i] * (1 - f) * (1 - g) + arr[j * n + i + 1] * f * (1 - g) + arr[(j + 1) * n + i] * (1 - f) * g + arr[(j + 1) * n + i + 1] * f * g;
  };
  const coast = (x, z) => bil(C, x, z);
  const village = (x, z) => bil(V, x, z);
  const plateau = (x, z) => bil(K, x, z);
  // the pier: a stone mole from the north quay to PIER.to
  const PW = PIER.width / 2, PX = PIER.to[0];
  function pierTop(x, z) {
    if (Math.abs(x - PX) <= PW && z >= PIER.to[2] && z <= PIER_ROOT_Z + 4) return PIER_TOP;
    if (Math.hypot(x - PX, z - PIER.to[2]) <= 5.2) return PIER_TOP;   // round pier head
    return -1e9;
  }
  // terrain (no props). Exact for the mesh at any resolution: bilinear inside the bake.
  const terrainY = (x, z) => (Math.abs(x) < size && Math.abs(z) < size ? bil(H, x, z) : -16);
  function groundY(x, z) { return Math.max(terrainY(x, z), pierTop(x, z), toothH(x, z)); }
  // baked RGBA float: r coast distance, g village terrace mask, b plateau mask, a cliff path distance
  function bakeTexelData() {
    const data = new Float32Array(n * n * 4);
    for (let j = 0; j < n; j++) {
      const z = -size + j * dx;
      for (let i = 0; i < n; i++) {
        const x = -size + i * dx, k = (j * n + i) * 4;
        data[k] = C[j * n + i]; data[k + 1] = V[j * n + i]; data[k + 2] = K[j * n + i]; data[k + 3] = Math.min(pathDist(x, z), 60);
      }
    }
    return data;
  }
  M = { size, n, dx, coast, village, plateau, terrainY, groundY, pierTop, bakeTexelData, shape };
  return M;
}
export { TOWER, COTTAGE, HEADLAND };
