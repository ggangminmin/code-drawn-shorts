// sea cameras and looks (Sea department), see CONTRACT.md
import { noise1, smooth, invLerp, lerp, track, clamp } from '../util.js';
import { CUES } from '../shots.js';
import { storm, DAWN, swellFront } from '../layout.js';
import { seaParams, heightFull, crestZ } from '../sea-waves.js';

const seaY = (x, z, t) => heightFull(x, z, seaParams(t), 0);
const hand = (t, amp, seed = 0) => [noise1(t * 0.9, seed) * amp, noise1(t * 0.8, seed + 3) * amp * 0.7, noise1(t * 0.7, seed + 7) * amp];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

// s01 hook / s27 rhyme: high over the sea to the west of the fleet, looking east-south-east; the tower is off-frame right.
const HOOK_POS = [-700, 300, -480], HOOK_AT = [300, 0, -1000];
function hook(lt) {
  const u = lt / 2.5;
  return { pos: [HOOK_POS[0] + 26 * u, HOOK_POS[1] - 22 * u, HOOK_POS[2] - 6 * u], look: [HOOK_AT[0] + 10 * u, 0, HOOK_AT[2]], fov: 40, roll: -6 };
}

export const CAMS = {
  s01: (lt) => hook(lt),
  // s10: riding up the back of the rising swell, looking down its long front slope toward the fleet's lanterns
  s10: (lt, d, t) => {
    // a very long lens from just off the island, low on the water, along the line of the fleet and out to sea:
    // two boats stand big in the foreground and behind them the sea lifts into one black slope (it rises during the shot);
    // the long lens stacks 1.5 km of water into the frame. Horizon tilted.
    const P = seaParams(t), zc = crestZ(80, P);
    const x = -150 + lt * 2, z = -380;
    const y = 9 + noise1(t * 1.1, 2) * 0.12;
    return { pos: [x, y, z], look: [-30 + noise1(t * 0.5, 9) * 1.5, 4 + P.H * 0.4, -690], fov: 3.6, roll: -7 + noise1(t * 0.7, 5) * 0.6, far: 9000 };
  },
  // s16: low on the water in front of the swell face, looking up at the cresting lip; lightning backlights it at 36.8
  s16: (lt, d, t) => {
    const x = 60;
    const zc = crestZ(x, seaParams(t));
    const z = zc + 88 - lt * 9;                 // the wall gains on us
    const y = Math.max(seaY(x, z, t), 0) + 2.8;
    const h = hand(t, 0.2, 11);
    return { pos: add([x, y, z], h), look: [-140, 24 + lt * 1.5, zc - 10], fov: 58, roll: -8 - lt * 1.2 + noise1(t, 4) * 1.2 };
  },
  // s20: inside the mouth, low, looking out between the reef teeth as the swell breaks on them; Kestrel punches out toward us
  s20: (lt, d, t) => {
    // impact: a hard hit at CUES.waveBreak, 1.6 m, gone in ~0.6 s; a lighter rumble after
    const a = t - CUES.waveBreak;
    const hit = a > 0 ? Math.exp(-a / 0.22) * 1.6 : 0;
    const rum = a > 0 ? 0.35 * Math.exp(-a / 1.2) : 0;
    const h = [noise1(t * 22, 21) * (hit + rum), noise1(t * 20, 24) * (hit + rum) * 0.8, noise1(t * 24, 27) * (hit + rum)];
    // from the headland's flank, high and wide: the wall arrives from the left, breaks on the teeth, the burst stands
    // taller than the tower (90-120 m) inside the frame, Kestrel punches out below us; the camera tilts up with the burst
    const up = smooth(invLerp(CUES.waveBreak - 0.1, CUES.waveBreak + 1.2, t));
    return { pos: add([150 - lt * 3, 52 + lt * 1.5, -170 + lt * 4], h), look: [-10 - lt * 6, 14 + 34 * up, -292 + lt * 8], fov: 56, roll: 5 + noise1(t * 18, 30) * hit * 1.5 };
  },

  // s26: from out on the water, the headland and tower small on the right, the deck tearing open over the east
  s26: (lt) => ({ pos: [-260, 26 + lt * 2.5, -640], look: [360, 230 + lt * 6, -380], fov: 52, roll: -4 }),
  // s27: same camera as s01, at dawn; then it turns right to find the boats in the basin and the lighthouse still turning
  s27: (lt, d) => {
    const u = smooth(invLerp(0.6, d, lt));
    const h0 = hook(2.5);
    const at = [lerp(h0.look[0], 40, u), lerp(0, 0, u), lerp(h0.look[2], -150, u)];
    return { pos: [h0.pos[0], h0.pos[1] - 10 * u, h0.pos[2] + 30 * u], look: at, fov: lerp(40, 44, u), roll: lerp(-7, -3, u) };
  },
};

export const LOOKS = {
  s01: () => ({ k: 1, sunElev: 55, sunAz: 200 }),
  s10: () => ({ k: 1, sunElev: 50, sunAz: 170, fogMul: 0.12, mistMul: 0.15, seaSheen: 0.35 }),
  s16: () => ({ k: 1, sunElev: 50, sunAz: 180 }),
  s20: () => ({ k: 1, sunElev: 55, sunAz: 190 }),
  s26: (lt, d, t) => {
    const s = storm(t);
    return { k: 0.5 + 0.5 * s, sunElev: DAWN.sunElev, sunAz: DAWN.sunAz, stars: 0.8 * smooth(invLerp(0.2, 0.7, s)), cloudCover: s, sunDisk: 1 - s };
  },
  s27: () => ({ k: 0.5, sunElev: DAWN.sunElev, sunAz: DAWN.sunAz }),
};
