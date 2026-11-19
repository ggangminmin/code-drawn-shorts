// SEEDLIGHT character designs (ours). Heads are SDF descriptions for folk-head.js (units = head radii).
// Fennec: a small wedge face under a broad skull, wide soft cheeks, a short fine muzzle, enormous cupped ears.
// Hare: tall narrow skull, split upper lip, long two-jointed ears. Stoat: long flat skull, lean, a white bib.
// Boar: heavy snout with a disc nose and tusks. Ram: a long roman nose, curled horns coming out under the helmet.

const FENNEC_HEAD = {
  // small cranium, cheekbones tapering to a narrow chin (a heart from the front), a long fine wedge muzzle with a bridge
  hw: 0.84, hh: 0.8, hd: 0.9, cy: 0.14, cz: -0.06, cheek: [0.34, -0.14, 0.22, 0.3], cheekW: 1.0, jaw: [-0.5, 0.34, 0.2, 0.17],
  muzzle: { len: 0.9, r0: 0.28, r1: 0.085, y: -0.24, up: 0.07, sx: 0.8, sy: 0.78, z0: 0.34, k: 0.2, sag: 0.0 },
  tufts: [[[0.5, -0.1, 0.0], [0.98, -0.34, -0.2], 0.2, 0.1], [[0.44, -0.3, 0.04], [0.76, -0.66, -0.1], 0.17, 0.09]],
  bangs: [[[0, 0.3, 0.62], [0, -0.1, 1.02], 0.19, 0.16], [[0.02, 0.84, 0.36], [0.06, 0.6, 0.76], 0.11, 0.08]],
  whiskers: 0, pat: 1, p: [-0.06, -0.14, 0.3, 0.1], ymouth: 1, mouthW: 0.1, mouthDrop: 0.12, mouthDepth: 0.5, noseUp: 0.6,
};
const HARE_HEAD = {
  hw: 0.82, hh: 0.94, hd: 0.92, cy: 0.14, cz: -0.05, cheek: [0.36, -0.2, 0.22, 0.34], cheekW: 1.0, jaw: [-0.56, 0.36, 0.24, 0.2],
  tufts: [[[0.56, -0.22, 0.0], [0.9, -0.46, -0.14], 0.13, 0.07], [[0.46, -0.4, 0.06], [0.68, -0.74, -0.02], 0.1, 0.06]],
  bangs: [[[0, 0.3, 0.62], [0, -0.14, 0.98], 0.22, 0.16], [[0.05, 0.9, 0.3], [0.12, 0.7, 0.74], 0.12, 0.08], [[-0.14, 0.9, 0.3], [-0.24, 0.74, 0.68], 0.1, 0.08]],
  muzzle: { len: 0.6, r0: 0.3, r1: 0.17, y: -0.28, up: 0.03, sx: 0.98, sy: 0.84, z0: 0.38, k: 0.22 },
  whiskers: 2, pat: 2, p: [0.34, -0.34, 0.26, 0], ymouth: 1, mouthW: 0.12, mouthDrop: 0.15, mouthDepth: 0.44, noseUp: 0.66,
};
const STOAT_HEAD = {
  hw: 0.84, hh: 0.74, hd: 1.0, cy: 0.12, cz: -0.08, cheek: [0.36, -0.16, 0.2, 0.3], cheekW: 1.0, jaw: [-0.44, 0.4, 0.22, 0.18],
  muzzle: { len: 0.72, r0: 0.3, r1: 0.14, y: -0.18, up: 0.02, sx: 0.92, sy: 0.76, z0: 0.38, k: 0.22 },
  bangs: [[[0, 0.3, 0.6], [0, -0.04, 1.0], 0.2, 0.16]],
  tufts: [[[0.56, -0.2, 0.0], [0.84, -0.4, -0.14], 0.11, 0.07]],
  whiskers: 2, pat: 9, p: [0.5, -0.24, 0.36, 0], ymouth: 1, mouthW: 0.16, mouthDrop: 0.14, mouthDepth: 0.5, noseUp: 0.66,
};
const BOAR_HEAD = {
  hw: 1.0, hh: 0.9, hd: 0.98, cy: 0.04, cheek: [0.5, -0.34, 0.14, 0.46], cheekW: 1.12, jaw: [-0.62, 0.3, 0.42, 0.3],
  muzzle: { len: 0.72, r0: 0.42, r1: 0.3, y: -0.28, up: -0.02, sx: 1.0, sy: 0.92, z0: 0.44, k: 0.3, belly: 0.02 },
  tufts: [[[0.66, -0.44, 0.0], [0.98, -0.8, -0.1], 0.2, 0.14]],
  tusks: true, pat: 2, p: [0.3, -0.5, 0.2, 0], mouthW: 0.3, mouthDrop: 0.3, mouthDepth: 0.6, noseUp: 0.2,
};
const RAM_HEAD = {
  hw: 0.96, hh: 0.94, hd: 0.98, cy: 0.04, cheek: [0.42, -0.3, 0.16, 0.38], jaw: [-0.6, 0.3, 0.32, 0.26],
  muzzle: { len: 0.58, r0: 0.34, r1: 0.2, y: -0.3, up: -0.08, sx: 0.96, sy: 1.0, z0: 0.44, k: 0.34, belly: 0.04 },
  tufts: [[[0.6, -0.5, -0.05], [0.8, -0.95, -0.1], 0.2, 0.14]],
  pat: 6, mouthW: 0.14, mouthDrop: 0.2, ymouth: 1,
};

export const NARI = {
  name: 'nari', kind: 'nari', seed: 1, eyeDetail: 0.7, digits: { claw: '#5a4034', pads: '#8a5a50', web: 0 },
  fur: { base: '#ebe3d2', light: '#fcf9f0', dark: '#a88660', inner: '#d6b3a2', eyeSkin: '#ebe3d2', eyeSkinLow: '#fcf9f0', neck: '#f6f0e2' },
  face: { head: FENNEC_HEAD, noseR: 0.075, noseCol: '#2a1a18', mouthW: 0.1, blush: '#e8a08c', fang: 0.5,
    iris: '#9a5a24', irisDark: '#2c1408', irisLight: '#f6c66a', eye: 0.66, eyeX: 0.43, eyeY: 0.13, eyeW: 1.12, irisR: 0.7, pupil: 0.36, brow: '#8a6a48', browW: 0.95, browT: 0.022, lashW: 0.15, line: '#2a1a16' },
  ears: { len: 2.2, w: 1.2, x: 0.62, y: 0.72, z: -0.1, rx: -0.12, splay: 0.44, tip: '#a88660', tipFrom: 0.84, back: '#ddd2b8', innerTuft: '#fbf6ea' },
  tail: { type: 'chain', links: 5, len: 0.42, r0: 0.036, r1: 0.05, flat: 1, col: '#ebe3d2', tip: '#5a4034' },
  cloth: { top: '#98a4d6', topLen: 1.42, trim: '#f2e7cc', sash: '#44529a', sleeves: '#98a4d6', sleeveLen: 0.62 },
};

export const TAM = {
  name: 'tam', kind: 'tam', seed: 2, eyeDetail: 0.55, digits: { claw: '#4a3a30', pads: '#7a5a50', web: 0 },
  fur: { base: '#978672', light: '#e8e0d0', dark: '#4e4034', inner: '#cfa49a', eyeSkin: '#978672', eyeSkinLow: '#e8e0d0', neck: '#ddd4c2' },
  face: { head: HARE_HEAD, noseR: 0.07, noseCol: '#a8626a', mouthW: 0.15,
    iris: '#4a6a4a', irisDark: '#18261c', irisLight: '#b8d89a', eye: 0.66, eyeX: 0.43, eyeY: 0.16, eyeW: 1.1, irisR: 0.64, pupil: 0.38, brow: '#5c4636', browW: 1.0, browT: 0.03, lashW: 0.12, line: '#2a1c16' },
  ears: { type: 'long', len: 1.7, w: 0.46, splay: 0.16, rx: -0.2, x: 0.32, y: 0.92, bendR: 0.5, bendL: 0.1, tip: '#5c4636' },
  tail: { type: 'pom' },
  jacket: { body: '#a89a78', dark: '#827658', rib: '#5e5440', collar: '#9a4a34', hemY: 0.55, zip: '#d8c090', patch: '#5f7f78' },
  cloth: { pants: '#46524c', longSleeves: '#a89a78', cuff: '#5e5440', belt: '#4a3020' },
  goggles: { rim: '#a08848', glass: '#4f8a84', strap: '#4a3226', tail: 4 },
};

export const BO = {
  name: 'bo', kind: 'bo', seed: 3, eyeDetail: 0.3, digits: { claw: '#3a2c26', pads: '#5a4038', web: 0 },
  fur: { base: '#ece4d2', light: '#fffaf0', dark: '#3c2c22', inner: '#d8b0a0', eyeSkin: '#ece4d2', eyeSkinLow: '#fffaf0', neck: '#f6f0e2' },
  face: { head: STOAT_HEAD, noseR: 0.085, noseCol: '#3a2220', mouthW: 0.2,
    iris: '#3a2a1a', irisDark: '#140c08', irisLight: '#a08060', eye: 0.7, eyeX: 0.42, eyeY: 0.2, irisR: 0.66, pupil: 0.4, brow: '#3c2618', browT: 0.03, lashW: 0.1, line: '#22140e' },
  ears: { type: 'round', w: 0.34, x: 0.84, y: 0.5, z: -0.12, tip: '#ece4d2', back: '#d8ccb4' },
  tail: { type: 'chain', links: 5, len: 0.5, r0: 0.04, r1: 0.03, flat: 1, col: '#ece4d2', tip: '#1c120c' },
  jacket: { body: '#5a4a3c', dark: '#3e342c', rib: '#2e2620', collar: '#c8c0ac', hemY: 0.6, zip: '#c8a860', patch: '#8a6a3a' },
  cloth: { pants: '#3a443e', longSleeves: '#5a4a3c', cuff: '#2e2620', belt: '#2e2018' },
  goggles: { rim: '#8a7a50', glass: '#3f6a6a', strap: '#2e2018', tail: 3, down: true, r: 0.3 },
  hat: { type: 'kerchief', color: '#33292a' },
};

const COAT = { top: '#566c68', topLen: 1.75, trim: '#34443f', longSleeves: '#566c68', cuff: '#34443f', pants: '#353e3c', boots: '#27221e', belt: '#2e261e' };
const HELM = { type: 'helmet', color: '#4a5654', trim: '#b0934a' };
export const GUARDS = [
  { name: 'guardA', kind: 'guard', seed: 21, headRes: 1 / 20, eyeDetail: 0, fur: { base: '#6a5444', light: '#8a7460', dark: '#3a2c24', inner: '#b08878', eyeSkin: '#6a5444', gloves: true },
    face: { head: BOAR_HEAD, noseType: 'disc', noseR: 0.2, noseCol: '#9a6a62', iris: '#5a3a1a', irisDark: '#1e1008', irisLight: '#c09060', eye: 0.62, eyeX: 0.36, eyeY: 0.16, brow: '#2e221c', browT: 0.05, line: '#1e1612' },
    ears: { w: 0.42, len: 0.5, x: 0.8, y: 0.5, splay: 0.9, tip: '#3a2c24' }, tail: null, cloth: COAT, hat: HELM },
  { name: 'guardB', kind: 'guard', seed: 22, headRes: 1 / 20, eyeDetail: 0, dims: { chest: [0.2, 0.245, 0.15], sh: [0.22, 0.28] }, fur: { base: '#3e3a3a', light: '#d8d0c0', dark: '#2a2626', inner: '#c8a8a0', eyeSkin: '#3e3a3a', gloves: true },
    face: { head: RAM_HEAD, noseR: 0.1, noseCol: '#221c1c', iris: '#a8843a', irisDark: '#3a2a10', irisLight: '#e8c880', eye: 0.62, eyeX: 0.4, eyeY: 0.14, pupil: 0.3, brow: '#d8d0c0', browT: 0.04, line: '#1c1818' },
    ears: { type: 'droop', len: 0.42, w: 0.36, x: 0.92, y: 0.2, splay: -1.2 }, horns: '#cdbf9c', tail: null, cloth: COAT, hat: HELM },
  { name: 'guardC', kind: 'guard', seed: 23, headRes: 1 / 20, eyeDetail: 0, dims: { thigh: 0.38, shin: 0.38 }, fur: { base: '#7a6250', light: '#94806a', dark: '#3a2c24', inner: '#b08878', eyeSkin: '#7a6250', gloves: true },
    face: { head: BOAR_HEAD, noseType: 'disc', noseR: 0.2, noseCol: '#a8766c', iris: '#5a3a1a', irisDark: '#1e1008', irisLight: '#c09060', eye: 0.62, eyeX: 0.36, eyeY: 0.16, brow: '#2e221c', browT: 0.05, line: '#1e1612' },
    ears: { w: 0.42, len: 0.5, x: 0.8, y: 0.5, splay: 0.9, tip: '#3a2c24' }, tail: null, cloth: COAT, hat: HELM },
];
