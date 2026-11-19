// LAST LIGHT — land cameras and looks: s15 (mouth, high over the harbour) and s23 (pier).
import { smooth, lerp, noise1, invLerp, clamp } from '../util.js';
import { CUES } from '../shots.js';

const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

export const CAMS = {
  // High over the inner basin, diagonal out through the mouth: the left fang large in the middle ground, the right fang at
  // the foot of the headland cliff, the tower top right throwing the blade, the boats' lanterns lining up on the open sea
  // beyond the gap. A slow crane down; at CUES.mouthLit the blade crosses the mouth and floods both teeth and the water.
  s15: (lt, d) => {
    const u = smooth(lt / d) * 0.6 + (lt / d) * 0.4;
    const pos = lerp3([-52, 66, -146], [-44, 56, -160], u);
    const look = lerp3([20, 2, -322], [22, 4, -326], u);
    return { pos, look, fov: 40, roll: lerp(-3.5, -2, u), far: 9000 };
  },



  // Low beside the pier on the west side: the boats bump in along the stone, the fishers on the deck raise their
  // lanterns toward the tower on the headland, the beam turning above it. Slight handheld drift.
  s23: (lt, d, t) => {
    const u = lt / d;
    const bump = Math.exp(-Math.max(0, t - CUES.pierBump) * 5) * (t > CUES.pierBump ? 1 : 0);
    const pos = lerp3([-33, 3.2, -18], [-34.5, 3.5, -24], smooth(u));
    pos[0] += noise1(t * 0.7, 3) * 0.12; pos[1] += noise1(t * 0.9, 5) * 0.08 + bump * 0.06 * Math.sin(t * 40);
    const look = lerp3([10, 14, -170], [30, 22, -190], smooth(u));
    return { pos, look, fov: 40, roll: 5 + noise1(t * 0.5, 9) * 0.6, far: 9000 };
  },
};

export const LOOKS = {
  s15: (lt, d, t) => ({ k: 1, exposure: 1.25, paintRadius: 2.6, inkWidth: 1.0, landBeam: 2 + 3 * smooth(invLerp(CUES.mouthLit - 0.4, CUES.mouthLit + 0.2, t)) }),
  s23: () => ({ k: 1, exposure: 1.3, paintRadius: 3, inkWidth: 1.2, key: [0.6, 0.5, -0.6], shadow: { center: [-20, 3, -50], radius: 40, depth: 120 } }),
};
