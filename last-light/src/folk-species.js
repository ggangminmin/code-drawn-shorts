// LAST LIGHT character designs (animal folk, anime faces). All heads are SDFs in head radii (folk-head.js).
// Suri: red fox girl, 11. Big amber eyes, tall black-backed ears, white muzzle and cheek ruff, brush tail with a white tip.
// Tobi: old tanuki keeper. Round face, dark mask round the eyes, white beard-fur, round brass spectacles, navy peaked cap.
// Dad: fox fisherman. Longer, narrower muzzle than his daughter, stubble, knit cap, orange-yellow oilskins.

const FOX_GIRL_HEAD = {
  hw: 1.0, hh: 0.9, hd: 0.9, cy: 0.06, cheek: [0.5, -0.27, 0.16, 0.42], cheekW: 1.16,
  muzzle: { len: 0.44, r0: 0.33, r1: 0.12, y: -0.27, up: 0.07, sx: 1.0, sy: 0.74, z0: 0.5, k: 0.28 },
  tufts: [[[0.72, -0.28, 0.02], [1.2, -0.48, -0.1], 0.19, 0.1], [[0.6, -0.46, 0.08], [1.02, -0.76, -0.04], 0.16, 0.1]],
  fringe: [[[0.0, 0.84, 0.46], [0.06, 0.56, 0.86], 0.15, 0.1], [[0.26, 0.82, 0.42], [0.34, 0.54, 0.82], 0.13, 0.1], [[-0.26, 0.82, 0.42], [-0.32, 0.55, 0.82], 0.13, 0.1], [[0.12, 0.9, 0.3], [0.18, 0.66, 0.78], 0.11, 0.12]],
  whiskers: 0, pat: 1, p: [-0.2, 0.06, 0.2, 0.32], ymouth: 1, mouthW: 0.2, mouthDrop: 0.17, mouthDepth: 0.44, noseUp: 0.7,
};
const FOX_MAN_HEAD = {
  hw: 0.98, hh: 0.86, hd: 0.95, cy: 0.04, cheek: [0.48, -0.3, 0.14, 0.42], cheekW: 1.12,
  muzzle: { len: 0.66, r0: 0.34, r1: 0.12, y: -0.27, up: 0.05, sx: 0.98, sy: 0.78, z0: 0.48, k: 0.28 },
  tufts: [[[0.72, -0.3, 0.0], [1.18, -0.54, -0.14], 0.18, 0.1], [[0.58, -0.5, 0.06], [0.96, -0.82, -0.08], 0.15, 0.1]],
  whiskers: 0, pat: 1, p: [-0.3, 0.1, 0.16, 0.34], ymouth: 1, mouthW: 0.22, mouthDrop: 0.18, mouthDepth: 0.48, noseUp: 0.66,
};
const TANUKI_HEAD = {
  hw: 1.08, hh: 0.9, hd: 0.94, cy: 0.04, cheek: [0.52, -0.3, 0.14, 0.46], cheekW: 1.24,
  muzzle: { len: 0.32, r0: 0.34, r1: 0.18, y: -0.26, up: 0.03, sx: 1.12, sy: 0.82, z0: 0.5, k: 0.3 },
  // white beard-fur: a chin beard and cheek mutton-chops sweeping down
  tufts: [[[0.7, -0.38, 0.12], [1.06, -0.78, 0.02], 0.22, 0.12], [[0.5, -0.6, 0.3], [0.62, -0.98, 0.22], 0.18, 0.12]],
  bangs: [[[0.0, -0.64, 0.52], [0.0, -1.08, 0.46], 0.24, 0.12], [[0.0, -0.5, 0.66], [0.0, -0.9, 0.6], 0.18, 0.12]],
  whiskers: 0, pat: 10, p: [0.62, -0.38, 0.42, 0], ymouth: 1, mouthW: 0.22, mouthDrop: 0.16, mouthDepth: 0.5, noseUp: 0.6,
};
// fishers (seen at medium distance on the pier)
const RACCOON_HEAD = { hw: 1.05, hh: 0.9, cheek: [0.48, -0.25, 0.15, 0.4], muzzle: { len: 0.5, r0: 0.3, r1: 0.1, y: -0.22, up: 0.06, sx: 0.95, sy: 0.85, z0: 0.42 }, tufts: [[[0.75, -0.25, 0.0], [1.15, -0.42, -0.12], 0.14, 0.08]], pat: 3, p: [0.34, -0.33, 0.24, 0], mouthW: 0.14, mouthDrop: 0.16, mouthDepth: 0.5 };
const BADGER_HEAD = { hw: 1.0, hh: 0.86, hd: 0.98, cy: 0.06, cheek: [0.46, -0.3, 0.12, 0.42], cheekW: 1.1, muzzle: { len: 0.66, r0: 0.34, r1: 0.12, y: -0.22, up: 0.03, sx: 1.0, sy: 0.84, z0: 0.42, k: 0.3 }, tufts: [[[0.62, -0.34, -0.02], [0.96, -0.62, -0.18], 0.16, 0.1]], pat: 4, p: [0.4, -0.3, 0.3, 0], mouthW: 0.2, mouthDrop: 0.17, mouthDepth: 0.5, noseUp: 0.6 };
const OTTER_HEAD = { hw: 1.08, hh: 0.8, hd: 0.92, cy: 0.1, cheek: [0.5, -0.2, 0.2, 0.4], cheekW: 1.18, muzzle: { len: 0.3, r0: 0.38, r1: 0.31, y: -0.2, up: 0.02, sx: 1.42, sy: 0.7, z0: 0.54, k: 0.28 }, tufts: [[[0.8, -0.18, -0.02], [1.14, -0.3, -0.12], 0.14, 0.09]], pat: 9, p: [0.62, -0.25, 0.4, 0], ymouth: 1, mouthW: 0.3, mouthDrop: 0.16, mouthDepth: 0.46, noseUp: 0.72 };
const HARE_HEAD = { hw: 0.95, hh: 1.0, cy: 0.08, cheek: [0.42, -0.32, 0.24, 0.42], cheekW: 1.1, tufts: [[[0.72, -0.3, -0.04], [1.08, -0.52, -0.16], 0.16, 0.09]], muzzle: { len: 0.3, r0: 0.32, r1: 0.22, y: -0.3, up: 0.04, sx: 1.2, sy: 0.84, z0: 0.54, k: 0.32 }, pat: 2, p: [0.42, -0.34, 0.3, 0], ymouth: 1, mouthW: 0.14, mouthDrop: 0.15, mouthDepth: 0.4 };
const SHEEP_HEAD = { hw: 0.98, hh: 0.95, cheek: [0.4, -0.3, 0.18, 0.36], muzzle: { len: 0.42, r0: 0.3, r1: 0.19, y: -0.27, up: -0.02, sx: 0.98, sy: 0.9, z0: 0.45 }, woolCap: true, pat: 6, mouthW: 0.14, mouthDrop: 0.18, ymouth: 1 };

const OILSKIN = { fur: 0, gloss: 0.55, wet: 1, foldDark: 0.1 };

export const SURI = {
  name: 'suri', kind: 'girl', seed: 21, eyeDetail: 0.6, digits: { claw: '#2a1c18', pads: '#3a2420', paw: '#2e2420', web: 0 },
  fur: { base: '#d8692a', light: '#fbf1e2', dark: '#2a1c18', inner: '#f6dcc4', eyeSkin: '#d8692a', eyeSkinLow: '#fbf1e2', neck: '#fbf1e2' },
  face: { head: FOX_GIRL_HEAD, noseR: 0.085, noseCol: '#22161a', mouthW: 0.2, blush: '#f08a70',
    iris: '#d88a1a', irisDark: '#5a2406', irisLight: '#ffe08a', eye: 0.9, eyeX: 0.43, eyeY: 0.14, eyeW: 1.02, irisR: 0.68, pupil: 0.34,
    brow: '#6a2e10', browW: 0.95, browT: 0.024, lashW: 0.17, line: '#24150f' },
  ears: { type: 'cup', len: 1.18, w: 0.66, x: 0.56, y: 0.82, z: -0.08, rx: -0.12, splay: 0.28, tip: '#2a1c18', back: '#2a1c18', tipFrom: 0.7, innerTuft: '#fbf1e2' },
  tail: { type: 'chain', links: 7, len: 0.62, r0: 0.085, r1: 0.03, brush: true, col: '#d8692a', tip: '#fbf1e2' },
  jacket: { body: '#f3c22e', dark: '#c99418', rib: '#dcaa20', collar: '#f3c22e', zip: '#5a3c22', patch: '#b23a28', len: 0.21, flare: 0.07, toggles: 6.5, hemBand: 0.02, noCollar: true, folds: 13, foldDepth: 0.013, ...OILSKIN },
  cloth: { pants: '#2a3348', longSleeves: '#f3c22e', cuff: '#dcaa20', boots: '#22304a', bootTop: 0.62 },
  hood: '#f3c22e', scarf: { col: '#c8322a', len: 0.3, links: 4 },
};

export const TOBI = {
  name: 'tobi', kind: 'tanuki', seed: 22, eyeDetail: 0.35, digits: { claw: '#3a3430', pads: '#2a2420', paw: '#2a2420', web: 0 },
  fur: { base: '#8c7a64', light: '#f2eee6', dark: '#2a221e', inner: '#c8b8a8', eyeSkin: '#2a221e', eyeSkinLow: '#2a221e', neck: '#f2eee6' },
  face: { head: TANUKI_HEAD, noseR: 0.11, noseCol: '#1c1614', mouthW: 0.22,
    iris: '#7a4a22', irisDark: '#2a1608', irisLight: '#d8a868', eye: 0.68, eyeX: 0.41, eyeY: 0.12, irisR: 0.64, pupil: 0.36,
    brow: '#f2eee6', browW: 1.35, browT: 0.075, lashW: 0.1, line: '#1c1614', roundEye: 0.6 },
  faceBase: { lid: 0.28, lidB: 0.12 },
  ears: { type: 'round', w: 0.42, x: 0.68, y: 0.66, tip: '#2a221e', back: '#2a221e' },
  tail: { type: 'chain', links: 5, len: 0.36, r0: 0.08, r1: 0.04, brush: true, col: '#8c7a64', tip: '#2a221e' },
  jacket: { body: '#a2a6ac', dark: '#868a90', rib: '#7a7e84', collar: '#969aa0', zip: '#73777c', patch: '#73777c', hemY: 0.5, knit: 16, noPockets: true, fur: 0.6, wet: 0.5, folds: 9 },
  cloth: { pants: '#3a3a42', longSleeves: '#8d9196', cuff: '#686c72', shoes: '#2a2220' },
  glasses: '#b8954a', glassR: 0.46, glassOff: 0.1,
  hat: { type: 'peaked', color: '#1e2a46' },
};

export const DAD = {
  name: 'dad', kind: 'man', seed: 23, eyeDetail: 0.45, digits: { claw: '#2a1c18', pads: '#3a2420', paw: '#2e2420', web: 0 },
  fur: { base: '#c4602a', light: '#f4ead8', dark: '#2a1c18', inner: '#f0d4bc', eyeSkin: '#c4602a', eyeSkinLow: '#f4ead8', neck: '#f4ead8' },
  face: { head: FOX_MAN_HEAD, noseR: 0.08, noseCol: '#1e1416', mouthW: 0.22, stubble: 0.9, stubbleC: '#5a3018',
    iris: '#c8801c', irisDark: '#4a2006', irisLight: '#f4d088', eye: 0.6, eyeX: 0.42, eyeY: 0.1, eyeW: 1.12, irisR: 0.62, pupil: 0.34,
    brow: '#3a1a0c', browW: 1.2, browT: 0.055, lashW: 0.08, line: '#20140e' },
  faceBase: { lid: 0.22, lidB: 0.08 },
  ears: { type: 'cup', len: 1.0, w: 0.6, x: 0.6, y: 0.78, z: -0.1, rx: -0.15, splay: 0.32, tip: '#2a1c18', back: '#2a1c18', tipFrom: 0.68, innerTuft: '#f4ead8' },
  tail: { type: 'chain', links: 6, len: 0.7, r0: 0.09, r1: 0.03, brush: true, col: '#c4602a', tip: '#f4ead8' },
  jacket: { body: '#e8a024', dark: '#b87814', rib: '#c88a1a', collar: '#e8a024', zip: '#3a2a1a', patch: '#b23a28', len: 0.17, flare: 0.03, toggles: 7, hemBand: 0.03, noPockets: false, folds: 12, foldDepth: 0.014, ...OILSKIN },
  cloth: { pants: '#d8941e', longSleeves: '#e8a024', cuff: '#c88a1a', boots: '#24262a', bootTop: 0.55 },
  hat: { type: 'beanie', color: '#4d625a', low: 0.42 },
};

const oil = (body, dark) => ({ body, dark, rib: dark, collar: body, zip: '#3a2a1a', patch: dark, len: 0.15, flare: 0.03, toggles: 6, hemBand: 0.03, folds: 10, ...OILSKIN });
export const FISHERS = [
  { name: 'fisherA', kind: 'man', seed: 31, detail: 0, digits: { claw: '#2a2420', pads: '#2a2420', web: 0 }, fur: { base: '#8c8890', light: '#f2f0f2', dark: '#2e2a32', inner: '#d8d0d0', eyeSkin: '#8c8890' }, face: { head: RACCOON_HEAD, noseCol: '#1e1a20', iris: '#5a3a2a', irisDark: '#1e1008', irisLight: '#c09070', eye: 0.85 }, ears: { type: 'round', w: 0.45, x: 0.6, y: 0.75, tip: '#f2f0f2' }, tail: { type: 'bushy', len: 0.5, r: 0.06, rings: 5, tip: '#2e2a32' }, jacket: oil('#e0b02a', '#b0861a'), cloth: { pants: '#d0a024', longSleeves: '#e0b02a', cuff: '#b0861a', boots: '#24262a', bootTop: 0.5 }, hat: { type: 'beanie', color: '#5a2e2a', low: 0.45 } },
  { name: 'fisherB', kind: 'man', seed: 32, detail: 0, digits: { claw: '#2a2420', pads: '#2a2420', web: 0 }, fur: { base: '#8f8d94', light: '#ece8e2', dark: '#26242c', inner: '#c8c0c0', eyeSkin: '#26242c', eyeSkinLow: '#ece8e2' }, face: { head: BADGER_HEAD, noseCol: '#1c181c', iris: '#8a5a2a', irisDark: '#3a2010', irisLight: '#e8c080', eye: 0.72 }, ears: { type: 'round', w: 0.36, x: 0.72, y: 0.62, tip: '#ece8e2', back: '#26242c' }, tail: null, jacket: oil('#4a5a3a', '#34422a'), cloth: { pants: '#3e4c32', longSleeves: '#4a5a3a', cuff: '#34422a', boots: '#24262a', bootTop: 0.5 }, hat: { type: 'peaked', color: '#2a2e36' } },
  { name: 'fisherC', kind: 'man', seed: 33, detail: 0, digits: { claw: '#2a1c18', pads: '#3c2a26', web: 0.3 }, fur: { base: '#a87044', light: '#f0d6ae', dark: '#5a3a22', inner: '#c49870', eyeSkin: '#a87044', eyeSkinLow: '#f0d6ae' }, face: { head: OTTER_HEAD, noseCol: '#241612', iris: '#6a3a1c', irisDark: '#1c0e08', irisLight: '#e0a860', eye: 0.8 }, ears: { type: 'round', w: 0.3, x: 0.9, y: 0.36, z: -0.02, tip: '#4c3020', back: '#4c3020' }, tail: { type: 'chain', links: 5, len: 0.6, r0: 0.09, r1: 0.02, taper: 0.8, flat: 0.78, col: '#a87044', tip: '#7a5030' }, jacket: oil('#e8962a', '#b86e18'), cloth: { pants: '#d8862a', longSleeves: '#e8962a', cuff: '#b86e18', boots: '#24262a', bootTop: 0.5 }, hat: { type: 'beanie', color: '#2e3a52', low: 0.5 } },
  { name: 'fisherD', kind: 'man', seed: 34, detail: 0, digits: { claw: '#3a3430', pads: '#3a2e30', web: 0 }, fur: { base: '#cfc8bc', light: '#ded8cc', dark: '#3a3438', inner: '#e8c8c0', eyeSkin: '#f4efe6' }, face: { head: SHEEP_HEAD, noseCol: '#3a2e30', iris: '#8a6a3a', irisDark: '#3a2a10', irisLight: '#e0c080', eye: 0.85 }, ears: { type: 'droop', len: 0.45, w: 0.4, x: 0.85, y: 0.35, splay: -1.3 }, tail: null, jacket: oil('#2e3e58', '#1e2a40'), cloth: { pants: '#26344c', longSleeves: '#2e3e58', cuff: '#1e2a40', boots: '#24262a', bootTop: 0.5 }, hat: { type: 'beanie', color: '#c8b070', low: 0.5 } },
  { name: 'fisherE', kind: 'man', seed: 35, detail: 0, digits: { claw: '#3a3430', pads: '#6a4a48', web: 0 }, fur: { base: '#b89878', light: '#f0e8d8', dark: '#5a4638', inner: '#e0a8a8', eyeSkin: '#b89878' }, face: { head: HARE_HEAD, noseCol: '#b06a70', iris: '#4a3a2a', irisDark: '#1a100a', irisLight: '#c0a080', eye: 0.85 }, ears: { type: 'long', len: 1.3, w: 0.42, splay: 0.14, rx: -0.12, x: 0.32, y: 0.92, bendR: 0.75 }, tail: null, jacket: oil('#e8c032', '#b89420'), cloth: { pants: '#2a3348', longSleeves: '#e8c032', cuff: '#b89420', boots: '#24262a', bootTop: 0.5 } },
];
