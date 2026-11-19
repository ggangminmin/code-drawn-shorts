// mech department cameras and looks. See CONTRACT.md.
import { noise1, smooth, clamp, lerp } from '../util.js';
import { CUES } from '../shots.js';
import { quake, ROOF, TOWER } from '../layout.js';
import { skiffPos } from '../mech-skiff.js';

const L3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const drift = (p, t, a = 0.03, s = 0) => [p[0] + a * noise1(t * 0.9, 1 + s), p[1] + a * noise1(t * 1.1, 2 + s), p[2] + a * noise1(t * 0.8, 3 + s)];
const bump = (t, t0, a = 0.2, d = 0.5) => { const x = t - t0; return x < 0 || x > d ? 0 : a * (1 - x / d) ** 2 * Math.sin(x * 60); };
const _s = [0, 0, 0];
const shaftY = (t) => (t < 16 ? 63.3 : t < 16.12 ? lerp(63.3, 66.6, ((t - 16) / 0.12) ** 2) : t < 16.4 ? lerp(66.6, 82, (t - 16.12) / 0.28) : t < 16.9 ? lerp(82, 121, (t - 16.4) / 0.5) : lerp(121, 165, (t - 16.9) / 0.49));
const climbBase = (t) => 181 + (t - 23.4) * (1.3 / 0.75);

export const CAMS = {
  // the iris opens in the dark: close on the fallen head, slow push
  s01c: (lt, d, t) => ({ pos: drift(L3([-114.3, 62.55, 5.3], [-114.7, 62.6, 4.7], smooth(lt / d)), t, 0.015), look: [-116.0, 63.0, 2.5], fov: 30, roll: -7, near: 0.1 }),
  // fingers at floor level
  s02: (lt, d, t) => ({ pos: drift([-114.95, 62.17, 5.25], t, 0.01), look: [-116.6, 62.27, 4.86], fov: 34, roll: 4, near: 0.05 }),
  // the rise: low angle, tilting up with it
  s04: (lt, d, t) => { const k = smooth((t - 7.9) / 1.9), a = smooth((t - 9.42) / 0.4); return { pos: drift([-114.2, 62.42, -1.25], t, 0.02), look: [-119.0, lerp(63.4, 65.3, k) - 1.5 * a, lerp(2.2, 1.9, k) - 0.9 * a], fov: lerp(46, 56, k), roll: lerp(-3, 9, k) + bump(t, CUES.armDrop + 0.42, 1.5), near: 0.1 }; },
  // high in the shaft, straight down
  s07: (lt, d, t) => { const y = shaftY(t), k = smooth((t - 16.25) / 0.45); const ly = lerp(63.5, Math.min(y + 3.2, 150), k);
    return { pos: drift([-114.2, 106, 0.7], t, 0.03), look: [lerp(-110.4, -110.9, k), ly, 0.1], fov: lerp(36, 52, k), roll: 16 + lt * 5 + bump(t, 16.72, 2, 0.4) }; },
  // the burst: low on the flagstones
  s08: (lt, d, t) => { const k = smooth((t - 17.9) / 0.5) - smooth((t - 18.3) / 0.5); return { pos: [-94.5 + bump(t, 18.72, 0.25), 120.7 + bump(t, 18.72, 0.3), 14.2], look: [-106.5, 123.2 + 7 * k, 3.6], fov: 44, roll: -6 }; },
  // the climb: steep down-angle, dutch
  s11: (lt, d, t) => { const b = climbBase(t); return { pos: drift([5.4, b + 15 - lt * 1.2, 9.5], t, 0.05), look: [1.0, b + 1.2, 2.2], fov: 42, roll: 18 }; },
  // roof: she backs away in the foreground; the hand, then the head against the moon
  s12: (lt, d, t) => ({ pos: drift([-2.4, 215.85, -12.6 + 0.5 * smooth(lt / d)], t, 0.02), look: [0.3, 216.35 + 0.5 * smooth((t - 27.6) / 1.0), -2], fov: 34, roll: 3 }),
  // the kneel: low profile two-shot
  s13: (lt, d, t) => ({ pos: [-6.9 + 0.5 * smooth(lt / d), 214.75 + bump(t, 30.25, 0.12), -6.3], look: [0.1, 216.7 - 0.3 * smooth((t - 30) / 1.5), -3.0], fov: 44, roll: -3 }),
  // broken on the keep roof
  s16: (lt, d, t) => ({ pos: drift([21.2, 150.75, 11.3], t, 0.02), look: [17.6, 151.1, 9.3], fov: 38, roll: 8, near: 0.1 }),
  // the carry, across the dais
  s19: (lt, d, t) => ({ pos: drift([-3.6, 215.5, -11.2], t, 0.02), look: [1.6, 216.0, -5.2], fov: 40, roll: -3 }),
  // the skiff pops over the dam's lip
  s21: (lt, d, t) => { skiffPos(t, _s); const k = smooth((t - 53.3) / 0.4); return { pos: [-46.6 + bump(t, 53.58, 0.25, 0.6), 131.3 + bump(t, 53.6, 0.2, 0.6), 46.5], look: [_s[0] + 0.6 * k, _s[1] + 0.3, _s[2]], fov: lerp(4.2, 52, smooth((t - 52.5) / 1.0)), roll: 9 - 5 * k, near: 0.1 }; },
  // banking round the burning tower: chase from outside the turn
  s25: (lt, d, t) => { skiffPos(t, _s); skiffPos(t - 0.45, _s2); const rx = _s[0], rz = _s[2] + 8, rl = Math.hypot(rx, rz) || 1;
    return { pos: [_s2[0] + (rx / rl) * 5.5, _s2[1] + 1.6, _s2[2] + (rz / rl) * 5.5], look: [_s[0] * 0.8, _s[1] * 0.8 + 216 * 0.2, (_s[2] + 8) * 0.8 - 8], fov: 50, roll: -16 }; },
  // away over the flats, the dam burning behind
  s29: (lt, d, t) => { skiffPos(t, _s); const g = 7 + lt * lt * 3.2; return { pos: [_s[0] - g * 1.0, _s[1] + 1.6 + lt * 0.9, _s[2] + g * 0.55], look: [_s[0] + 1.5, _s[1] + 0.9, _s[2] - 0.5], fov: 36, roll: -4 }; },   // lead: front quarter, close, the burning dam behind them, then they pull away
};
const _s2 = [0, 0, 0];

const VAULT = { k: 1, exposure: 1.08, mistMul: 0, fogMul: 0.2, bloom: 1.0 };
export const LOOKS = {
  s01c: () => ({ ...VAULT, key: [0.3, 0.5, 0.8] }),
  s02: () => ({ ...VAULT, key: [0.5, 0.6, 0.6] }),
  s04: () => ({ ...VAULT, key: [0.6, 0.5, 0.6] }),
  s07: () => ({ ...VAULT, key: [0.1, 1, 0.2] }),
  s08: () => ({ k: 1, shadow: { center: [-106, 121, 4], radius: 22, depth: 80 } }),
  s11: (lt, d, t) => ({ k: 1, shadow: { center: [1, climbBase(t), 2], radius: 14, depth: 80 } }),
  s12: () => ({ k: 1, sunElev: 10, sunAz: 169, shadow: { center: [0, 215, -3], radius: 14, depth: 80 } }),
  s13: () => ({ k: 1, shadow: { center: [0, 216, -3.5], radius: 12, depth: 60 } }),
  s16: () => ({ k: 1, shadow: { center: [16, 151, 8], radius: 12, depth: 60 } }),
  s19: () => ({ k: 0.5, shadow: { center: [1, 216, -5], radius: 12, depth: 60 } }),
  s21: () => ({ k: 0.5 }),
  s25: () => ({ k: 0.5 }),
  s29: () => ({ k: 0.7, exposure: 1.25, fogMul: 0.6, key: [-0.6, 0.5, 0.6] }),
};
