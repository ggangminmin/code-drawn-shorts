import { noise1, lerp, smooth, invLerp, clamp } from '../util.js';
import { CUES } from '../shots.js';
import { boatPath, LAMPROOM, DAWN } from '../layout.js';

// MECH cameras + looks: s07 lamproom, s12 notch, s14 seen, s19 race, s21 surf, s28 asleep.
// Room helper W(x, y, z): lantern-room local (origin = floor centre, the crank sticks out toward +Z) to world.
const W = (x, y, z) => [LAMPROOM.center[0] + x, LAMPROOM.floorY + y, LAMPROOM.center[2] + z];
const add = (p, ...ds) => ds.reduce((o, d) => [o[0] + d[0], o[1] + d[1], o[2] + d[2]], p);
const drift = (t, a, s = 0) => [noise1(t * 0.55, 11 + s) * a, noise1(t * 0.47, 23 + s) * a * 0.7, noise1(t * 0.6, 37 + s) * a * 0.5];
const shake = (t, a, s = 0) => [noise1(t * 22, 3 + s) * a, noise1(t * 26, 5 + s) * a, noise1(t * 19, 7 + s) * a * 0.5];
const L3 = (a, b, u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
// boat frame: position + forward (from a short look-ahead on the shared path), on the water plane
function boatFrame(i, t) {
  const p = boatPath(i, t), q = boatPath(i, t + 0.25);
  let fx = q.x - p.x, fz = q.z - p.z; const n = Math.hypot(fx, fz);
  if (n < 0.05) { fx = Math.sin(p.yaw); fz = Math.cos(p.yaw); } else { fx /= n; fz /= n; }
  return { x: p.x, z: p.z, fx, fz, sx: fz, sz: -fx };
}

export const CAMS = {
  // she bursts up through the hatch: high and steep over the hatch, the dark lens and the broken panes beyond
  s07: (lt, d, t) => {
    const u = smooth(lt / d);
    return { pos: add(L3(W(-2.1, 2.65, 2.05), W(-2.0, 2.55, 2.0), u), drift(t, 0.03)), look: add(L3(W(-1.45, 0.35, 0.55), W(-1.35, 0.45, 0.45), u), drift(t + 4, 0.03)), fov: 60, roll: 9, near: 0.05 };
  },
  // ECU: the bull gear, the pinion and the crank wheel; her boots braced on the foot rail; ONE tooth at CUES.notch
  s12: (lt, d, t) => {
    const a = t - CUES.notch;
    const hit = a > 0 ? Math.exp(-a * 6) * 0.014 : 0;
    const strain = 0.0012 + 0.0025 * smooth(invLerp(CUES.notch - 1, CUES.notch, t)) * (a < 0 ? 1 : 0);
    // boots braced on the kick bar (floor level), then a whip-tilt up to the pinion biting the bull gear, just before the notch
    const k = smooth(invLerp(0.45, 0.95, lt));
    const pos = L3(W(0.95, 0.16, 2.5), W(1.5, 1.5, 0.98), k);
    const look = L3(W(-0.02, 0.14, 2.12), W(0.74, 1.19, 0.42), k);
    return { pos: add(pos, shake(t, hit + strain), drift(t, 0.008)), look: add(look, shake(t + 3, hit * 0.6)), fov: lerp(44, 32, k), roll: lerp(-5, -13, k), near: 0.04 };
  },
  // on the sea behind Kestrel: the beam comes over the boats from the headland; lanterns swing toward it
  s14: (lt, d, t) => {
    const b = boatFrame(0, t);
    const tx = 160 - b.x, tz = -300 - b.z, tn = Math.hypot(tx, tz), dx = tx / tn, dz = tz / tn;    // toward the tower
    const pos = [b.x - dx * 13 + dz * 6, 3.6 + lt * 0.25, b.z - dz * 13 - dx * 6];
    const look = [b.x + dx * 40, 7, b.z + dz * 40];
    return { pos: add(pos, drift(t, 0.5)), look: add(look, drift(t + 2, 0.4)), fov: 44, roll: -6 + 2 * Math.sin(t * 0.9) };
  },
  // inside the basin, low: the boats come through the mouth in single file at the camera, the wall of water behind; Kestrel last
  s19: (lt, d, t) => {
    // low on the water just inside the mouth, beside their lane: the boats come at the lens in single file and roar past
    // camera-left; Kestrel last, small, with the wall of water rising behind her
    const u = smooth(lt / d);
    return { pos: add(L3([21, 2.6, -226], [19, 2.4, -232], u), drift(t, 0.25)), look: add(L3([-3, 7.5, -330], [-6, 9, -330], u), drift(t + 5, 0.2)), fov: 32, roll: 5 };
  },
  // Kestrel surfs into the calm basin under falling spray: low, ahead and to the side, panning with her
  s21: (lt, d, t) => {
    const b = boatFrame(0, t);
    const pos = [b.x + b.fx * 15 - b.sx * 7, 2.0, b.z + b.fz * 15 - b.sz * 7];
    const look = [b.x - b.fx * 4, 2.8, b.z - b.fz * 4];
    return { pos: add(pos, drift(t, 0.25)), look: add(look, drift(t + 1, 0.2)), fov: 40, roll: -3 };
  },
  // from inside the lens, beside the burner, out through the lower prism rings as they slide round: Suri asleep against the still crank; dawn
  s28: (lt, d, t) => {
    const u = lt / d;
    return { pos: add(L3(W(-0.6, 2.36, -0.05), W(-0.58, 2.32, -0.0), u), drift(t, 0.01)), look: L3(W(-0.3, 0.7, 2.2), W(-0.3, 0.68, 2.2), u), fov: 36, near: 0.03 };
  },
};

export const LOOKS = {
  s07: () => ({ k: 1, sunElev: 55, sunAz: 200, key: [0.55, 0.65, -0.5], flash: 0.6, exposure: 1.18, vignette: 0.45 }),
  s12: () => ({ k: 1, sunElev: 55, sunAz: 200, key: [0.7, 0.55, 0.2], flash: 0.6, exposure: 1.12, vignette: 0.5 }),
  s14: () => ({ k: 1, sunElev: 50, sunAz: 190 }),
  s19: () => ({ k: 1, sunElev: 50, sunAz: 190 }),
  s21: () => ({ k: 1, sunElev: 50, sunAz: 190 }),
  s28: () => ({ k: 0.5, sunElev: DAWN.sunElev, sunAz: DAWN.sunAz, key: [0.8, 0.25, 0.3], flash: 0, exposure: 1.06, vignette: 0.4 }),
};
void clamp;
