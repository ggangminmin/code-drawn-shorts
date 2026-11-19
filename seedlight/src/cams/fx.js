// fx department cameras and looks: s06 firstRay, s15 shell, s17 sweep (THE IMAGE), s22 broadside, s23 duel, s28 fall.
import { noise1, smooth, clamp, lerp } from '../util.js';
import { CUES } from '../shots.js';
import { quake, ROOF, GUN, VAULT, WALL, shipPos } from '../layout.js';

const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const mix3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const shake = (t, amp, seed = 0, f = 9) => [noise1(t * f, seed) * amp, noise1(t * f, seed + 3) * amp, noise1(t * f, seed + 7) * amp];
const kick = (t, t0, len = 0.6) => (t >= t0 && t < t0 + len ? (1 - (t - t0) / len) ** 2 : 0);

// Where the Lantern stands in the vault while it faces the door (mech's blocking; see mech-map if it moves).
export const STAGE = { vaultIris: [-104.0, 67.2, 0.0] };

export const CAMS = {
  // A: low under the lantern head as the iris narrows. B: the iron door, raked low from inside: the ray comes in over the lens,
  // draws its slanted line, the line sags, and the door goes out in sheets.
  s06: (lt, d, t) => {
    const I = STAGE.vaultIris, D = VAULT.door;
    if (t < CUES.ray1 + 0.12) {
      const u = lt / 0.62;
      return { pos: add([I[0] + 6.4 - 0.5 * u, I[1] - 2.9, I[2] + 3.4], shake(t, 0.02, 1, 3)), look: [I[0] + 0.3, I[1] - 0.15, I[2]], fov: 27, roll: -7 };
    }
    const u = (t - CUES.ray1) / (d - 0.5);
    const b = kick(t, CUES.doorBurst, 0.7);
    return {
      pos: add([D[0] - 9.5 + 0.9 * u, D[1] + 1.05, D[2] + 6.6 - 0.5 * u], shake(t, 0.03 + 0.4 * b, 2, 11)),
      look: add([D[0] + 0.5, D[1] + 3.1, D[2] - 0.4], shake(t, 0.25 * b, 5, 11)), fov: 40, roll: 6,
    };
  },
  // A: beside the rampart gun as it fires at the tower. B: on the roof at the girl's height, the Lantern against the burst.
  s15: (lt, d, t) => {
    if (t < CUES.shell1 + 0.24) {
      const G = GUN.pos, k = kick(t, CUES.shell1, 0.4);
      return { pos: add([G[0] + 15, G[1] - 1.2, G[2] - 9.5], shake(t, 0.05 + 0.7 * k, 3, 12)), look: [G[0] - 40, G[1] + 24, G[2] + 12], fov: 38, roll: -9 };
    }
    const q = quake(t);
    return {
      pos: add([-3.4, ROOF.girlStand[1] + 0.55, -6.2], shake(t, 0.03 + 0.5 * q, 4, 13)),
      look: add([0.4, 216.6, 4.6], shake(t, 0.4 * q, 8, 13)), fov: 44, roll: -5 - 5 * q,
    };
  },
  // THE IMAGE: high over the downstream side, the east rampart running corner to corner, the dam face falling away into the mist.
  s17: (lt, d, t) => {
    const u = lt / d, e = smooth((t - CUES.erupt) / 1.6);
    const rumble = clamp((t - CUES.erupt) / 0.3) * (0.5 + 0.9 * Math.exp(-(t - CUES.erupt) * 0.4));
    const pos = [404 - 10 * u + 10 * e, 204 + 4 * u + 6 * e, 178 - 6 * u + 12 * e];
    const on = t >= CUES.erupt;
    return { pos: add(pos, shake(t, on ? rumble : 0.04, 6, 10)), look: add([134 + 6 * u, 118 + 3 * e, 28], shake(t, on ? rumble * 0.6 : 0, 9, 10)), fov: 44 - 1.5 * u, roll: -3.5 };
  },
  // A: from the crown under the ship's port side as the turrets fire in turn. B: up the tower as the shells walk to the roof.
  s22: (lt, d, t) => {
    const S = shipPos(t);
    if (t < CUES.broadside + 0.56) {
      const k = Math.max(kick(t, CUES.broadside, 0.3), kick(t, CUES.broadside + 0.34, 0.3));
      return { pos: add([44, 152, 150], shake(t, 0.06 + 0.5 * k, 2, 12)), look: [S[0] - 14 + lt * 10, S[1] + 2, S[2]], fov: 30, roll: 7 };
    }
    const u = clamp((t - (CUES.broadside + 0.56)) / 1.3), q = quake(t);
    return {
      pos: add([34, 170 + 10 * u, 58], shake(t, 0.08 + 0.9 * q, 5, 13)),
      look: add([1, 176 + 41 * smooth(u), 1.5], shake(t, 0.5 * q, 7, 13)), fov: 40, roll: -8,
    };
  },
  // Over the Lantern's shoulder from the roof: the ray leaves the foreground and cuts the hull far across the canyon.
  s23: (lt, d, t) => {
    const S = shipPos(t), q = quake(t), u = lt / d;
    const L = ROOF.lanternStand;
    return {
      pos: add([L[0] - 6.8 + 0.6 * u, L[1] + 6.3, L[2] - 6.6], shake(t, 0.04 + 0.6 * q, 3, 13)),
      look: add(mix3([S[0] - 30, S[1] - 6, S[2]], [L[0] + 2, L[1] + 4.6, L[2]], 0.06), shake(t, 0.5 * q, 8, 13)), fov: 28, roll: 5,
    };
  },
  // Behind them: pulling away and up from the tower top as the last salvo lands and the light goes out.
  s28: (lt, d, t) => {
    const u = lt / d, q = quake(t), L = ROOF.lanternStand;
    return {
      pos: add([L[0] + 13 + 15 * u, L[1] + 7 + 6 * u, L[2] + 15 + 17 * u], shake(t, 0.05 + 0.7 * q, 4, 12)),
      look: add([L[0] - 0.5, L[1] + 3.2 - 0.6 * u, L[2] - 0.5], shake(t, 0.3 * q, 6, 12)), fov: 33 - 3 * u, roll: 6,
    };
  },
};

const burnK = (t) => 1 - 0.5 * smooth((t - CUES.erupt) / 1.3);
export const LOOKS = {
  s06: () => ({ k: 1, exposure: 1.3, mistMul: 0, fogMul: 0.2, key: [-0.5, 0.6, 0.6], bloom: 1.0 }),
  s15: (lt, d, t) => ({ k: 1, key: [-0.55, 0.6, 0.55], bloom: 1.0, shadow: t >= CUES.shell1 + 0.24 ? { center: [0, 215.5, 1], radius: 13, depth: 30 } : undefined }),
  s17: (lt, d, t) => ({ k: burnK(t), bloom: 1.05, mistMul: 1.4, veil: 0.12 * (1 - burnK(t)) * 2 }),
  s22: () => ({ k: 0.5, bloom: 1.0, veil: 0.2 }),
  s23: () => ({ k: 0.5, bloom: 1.05, veil: 0.16, key: [0.5, 0.45, 0.7], shadow: { center: [1, 216, 2], radius: 13, depth: 30 } }),
  s28: () => ({ k: 0.5, bloom: 1.05, veil: 0.2, key: [0.4, 0.3, 0.8] }),
};
