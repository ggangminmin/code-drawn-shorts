// land department cameras and looks: s01 thread (HOOK), s09 alarm, s10 stairs, s18 burning, s20 ship, s30 ember (PAYOFF).
import { noise1, smooth, lerp, clamp, easeOut, easeIn } from '../util.js';
import { shipPos, quake } from '../layout.js';

const mix3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const WIN = [0, 201, 1.2];
// the poster frame and the end of the push; s30 runs the same rail backwards
const P0 = [-80, 131, 132], L0 = [22, 169, -8];
const P1 = [-12, 196, 34], L1 = [0.5, 203, 0];
const POSTER = { sunAz: 52, sunElev: 24 };   // poster cheat: the moon stands behind the tower's right shoulder (s01 and s30 only)

export const CAMS = {
  s01: (lt, d) => {
    const k = Math.pow(clamp(lt / d), 1.7) * 0.93 + 0.012 * lt;   // already moving at frame 0, accelerating into the cut
    return { pos: mix3(P0, P1, k), look: mix3(L0, L1, smooth(k)), fov: lerp(40, 32, k), roll: -9 * (1 - k) };
  },
  s09: (lt, d, t) => {
    // on the rampart walk behind the siren: the yard below, the upstream wall where the lamps snap on one after another
    const k = smooth(lt / d);
    return { pos: [-96.3 + k * 0.5, 131.5, 44.4 - k * 0.3], look: [-128 + k * 6, 122.5 - k * 1.5, -22], fov: 38, roll: 4 + noise1(t * 1.3, 2) * 0.3 };
  },
  s10: (lt, d, t) => {
    // craning up the flank of the tower with the glow that climbs behind the slits
    const k = smooth(lt / d);
    const y = 193 + 15 * k;
    return { pos: [-27 + 3 * k, y, 9 + 5 * k], look: [-6.5, y + 5.5 + 2 * k, -4.5], fov: 36, roll: -7 + 3 * k + noise1(t * 1.1, 5) * 0.3 };
  },
  s18: (lt, d, t) => {
    // low in the gap between two barracks: the burning wall beyond, the gun tower leans and goes over
    const k = lt / d, q = noise1(t * 9, 3) * 0.1 * (1 - k);
    return { pos: [150 + 5 * k, 136 + q - 2 * k, -196], look: [186 - 3 * k, 133 - 5 * smooth(k), -44], fov: 27, roll: 6 - 2 * k };
  },
  s20: (lt, d, t) => {
    // long lens from the west rampart, past the ruined wall and a dome: the ironclad comes up out of the mist and keeps coming
    const p = shipPos(t), k = smooth(lt / d);
    return { pos: [-50 - 1.5 * k, 131.8 - 1.25 * k, 41.6], look: [p[0] - 14 + 6 * k, p[1] + 14 - 6 * k, p[2]], fov: lerp(30, 27, k), roll: -7 + 3 * k + noise1(t * 0.9, 8) * 0.15, near: 0.15 };
  },
  s30: (lt, d) => {
    const k = 1 - (0.34 + 0.66 * easeOut(clamp(lt / d), 2.2));
    const kk = k * 0.55;
    return { pos: mix3(P0, P1, kk), look: mix3(L0, L1, smooth(kk)), fov: lerp(40, 32, kk), roll: -9 * (1 - kk) };
  },
};

export const LOOKS = {
  s01: () => ({ k: 1, ...POSTER, mistMul: 9, paintRadius: 3 }),
  s09: () => ({ k: 1, mistMul: 4, shadow: { center: [-110, 122, 0], radius: 70, depth: 260 } }),
  s10: () => ({ k: 1, mistMul: 4, paintRadius: 3 }),
  s18: () => ({ k: 0.5, mistMul: 2 }),
  s20: () => ({ k: 0.7, mistMul: 1.2, fogMul: 0.4 }),
  s30: () => ({ k: 0.62, ...POSTER, mistMul: 6, paintRadius: 3 }),
};
