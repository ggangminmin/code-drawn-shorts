import { noise1, smooth, invLerp, lerp } from '../util.js';
import { PL, inF, add, mul } from '../folk-place.js';
import { CUES } from '../shots.js';
import { boatPath, LENS } from '../layout.js';

// FOLK cameras and looks. lt = seconds into the shot, d = shot length, t = film time.
// Every camera is placed in the frame of the spot the actor stands on (folk-place.js), so it follows Sets' and Mech's anchors.
const L3 = (a, b, u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
const drift = (t, a = 0.008, s = 0) => [noise1(t * 0.7, 11 + s) * a, noise1(t * 0.55, 23 + s) * a * 0.7, noise1(t * 0.6, 37 + s) * a * 0.5];
const shake = (t, a, s = 0) => [noise1(t * 22, 3 + s) * a, noise1(t * 25, 5 + s) * a, noise1(t * 20, 7 + s) * a * 0.5];
const inside = (o) => ({ near: 0.03, far: 60, ...o });
const ok = () => PL.ready;
const FALL = { pos: [0, 3010, 3], look: [0, 3001, 0], fov: 40 };

export const CAMS = {
  // Kestrel's wheelhouse: first over his shoulder into the black window where the light was; then low on his face, green from below
  s03: (lt, d, t) => {
    if (!ok()) return FALL;
    const F = PL.wheelhouse;
    if (lt < 0.95) {
      const u = smooth(lt / 0.95);
      return inside({ pos: add(inF(F, -0.42, 1.82, -0.5 + 0.06 * u), drift(t, 0.006)), look: add(PL.wheelWindow, mul(F.f, 4), mul(F.s, 0.6), [0, 0.1, 0]), fov: 44, roll: -3 });
    }
    const u = smooth(invLerp(0.95, d, lt));
    return inside({ pos: add(inF(F, 0.95 - 0.04 * u, 1.4, 0.42 - 0.05 * u), drift(t, 0.005)), look: inF(F, 0.02, 1.6, 0.02), fov: 36, roll: 5 });
  },
  // the kitchen window, Dutch: her face up toward the tower, the cup leaves the bottom of frame
  s04: (lt, d, t) => {
    if (!ok()) return FALL;
    const F = PL.kitchen, u = smooth(lt / d), k = lt > 0.6 ? Math.exp(-(lt - 0.6) * 9) * (lt > 0.6 ? 1 : 0) : 0;
    return inside({ pos: add(inF(F, -0.78 + 0.08 * u, 0.98, 0.1), drift(t, 0.005), shake(t, 0.004 * k)), look: inF(F, 0.12, 1.06, 0.16), fov: 44, roll: -12 });
  },
  // stair foot: on Grandpa over her shoulder; then over his shoulder onto the key and her face
  s05: (lt, d, t) => {
    if (!ok()) return FALL;
    const G = PL.grandpaSit;
    if (lt < 1.25) return inside({ pos: add(inF(G, -1.15, 0.36, 0.62 - 0.05 * lt), drift(t, 0.006)), look: inF(G, 0.02, 0.5, 0.42), fov: 46, roll: 6 });
    const u = smooth(invLerp(1.25, d, lt));
    return inside({ pos: add(inF(G, 0.78 - 0.08 * u, 0.48, 0.22 + 0.06 * u), drift(t, 0.005)), look: L3(inF(G, 0.0, 0.45, 0.6), inF(G, 0.05, 0.72, 0.8), smooth(invLerp(1.3, 2.0, lt))), fov: lerp(44, 36, u), roll: -4 });
  },
  // the jammed crank: low beside the pedestal; from the key going home up to her face leaning with all her weight
  s09: (lt, d, t) => {
    if (!ok()) return FALL;
    const F = PL.crankStand, u = smooth(invLerp(0.1, 0.7, lt)), strain = smooth(invLerp(0.4, 1.2, lt));
    return inside({ pos: add(inF(F, 0.78, 0.5, 0.42), drift(t, 0.006), shake(t, 0.002 + 0.003 * strain)), look: L3(add(PL.keyhole, [0, 0.05, 0]), inF(F, 0.02, 0.98, 0.12), u), fov: lerp(34, 40, u), roll: 6 });
  },
  // the lookout: low by the glass, his sleeve crossing the lens, his eyes searching
  s11: (lt, d, t) => {
    if (!ok()) return FALL;
    const F = PL.wheelhouse;
    return inside({ pos: add(inF(F, -0.85, 1.42, 0.5), drift(t, 0.006)), look: inF(F, 0.05, 1.6, 0.1), fov: 40, roll: -5 });
  },
  // tired: low and close on her face as her paws slip; cut high over the crank as Grandpa's paws land beside hers
  s17: (lt, d, t) => {
    if (!ok()) return FALL;
    const F = PL.crankStand;
    if (lt < 0.95) return inside({ pos: add(inF(F, 0.36, 0.6, 0.36), drift(t, 0.006)), look: inF(F, 0.0, 1.0, 0.05), fov: 44, roll: 4 });
    const j = lt > 1.1 ? Math.exp(-(lt - 1.1) * 6) : 0, u = smooth(invLerp(0.95, d, lt));
    return inside({ pos: add(inF(F, 0.32, 1.52, 0.66 - 0.04 * u), drift(t, 0.006), shake(t, 0.006 * j)), look: inF(F, -0.12, 0.95, 0.0), fov: 50, roll: -4 });
  },
  // together: high over the crank, both faces, the handle racing round under them
  s18: (lt, d, t) => {
    if (!ok()) return FALL;
    const F = PL.crankStand, u = smooth(lt / d), f = smooth(invLerp(CUES.fastSweep - 40.5, CUES.fastSweep - 40.5 + 0.8, lt));
    return inside({ pos: add(inF(F, 0.3 - 0.06 * u, 1.6 - 0.04 * u, 0.7 - 0.05 * u), drift(t, 0.008), shake(t, 0.004 * f)), look: inF(F, -0.12, 0.95, 0.0), fov: 50 - 4 * u, roll: -5 - 4 * f });
  },
  // Dad on the deck: low between him and the tower, so he looks up past us into the beam
  s24: (lt, d, t, st) => {
    if (!ok()) return FALL;
    const deck = PL.deckPure(t);
    const to = [LENS.center[0] - deck[0], 0, LENS.center[2] - deck[2]], l = Math.hypot(to[0], to[2]), f = [to[0] / l, 0, to[2] / l], s = [f[2], 0, -f[0]];
    const u = smooth(lt / d);
    const pos = [deck[0] + f[0] * 1.7 + s[0] * 0.55, deck[1] + 1.32, deck[2] + f[2] * 1.7 + s[2] * 0.55];
    return { pos: add(pos, mul(f, -0.2 * u), drift(t, 0.01)), look: [deck[0], deck[1] + 1.6, deck[2]], fov: 30, roll: 4, near: 0.05, far: 6000 };
  },
  // the laugh: low on the floor in front of them both, at their eye level
  s25: (lt, d, t) => {
    if (!ok()) return FALL;
    const F = PL.crankStand, u = smooth(lt / d);
    return inside({ pos: add(inF(F, 0.08 - 0.06 * u, 0.6, -1.0 + 0.08 * u), drift(t, 0.006)), look: inF(F, 0.04, 0.76, 0.15), fov: 52, roll: -3 });
  },
};

const IN = { k: 1, mistMul: 0, fogMul: 0, veil: 0, shafts: 0, paintRadius: 3, exposure: 1.08 };
const shadowAt = (c, r = 1.6, depth = 6) => ({ center: c, radius: r, depth });
const safe = (f) => (...a) => (ok() ? f(...a) : IN);
export const LOOKS = {
  s03: safe(() => ({ ...IN, key: [0.1, -0.6, 0.7], shadow: shadowAt(add(PL.wheelhouse.o, [0, 1.1, 0])) })),
  s04: safe(() => ({ ...IN, key: [PL.kitchen.f[0], 0.55, PL.kitchen.f[2]], shadow: shadowAt(add(PL.kitchen.o, [0, 0.8, 0])) })),
  s05: safe(() => ({ ...IN, key: [PL.grandpaSit.s[0] * -0.6, 0.3, PL.grandpaSit.s[2] * -0.6], shadow: shadowAt(add(PL.grandpaSit.o, [0, 0.5, 0.3])) })),
  s09: safe(() => ({ ...IN, key: [-0.4, 0.5, -0.7], shadow: shadowAt(add(PL.crankStand.o, [0, 0.8, 0])) })),
  s11: safe(() => ({ ...IN, key: [0.1, -0.5, 0.7], shadow: shadowAt(add(PL.wheelhouse.o, [0, 1.1, 0])) })),
  s17: safe(() => ({ ...IN, key: [-0.3, 0.7, -0.6], shadow: shadowAt(add(PL.crankStand.o, [0, 0.8, 0])) })),
  s18: safe(() => ({ ...IN, key: [-0.3, 0.7, -0.6], shadow: shadowAt(add(PL.crankStand.o, [0, 0.8, 0])) })),
  s24: safe(() => ({ k: 1, mistMul: 0.3, fogMul: 0.4, shafts: 0, paintRadius: 3, exposure: 1.05, key: [0.4, 0.5, -0.6] })),
  s25: safe(() => ({ ...IN, key: [0.3, 0.55, 0.8], shadow: shadowAt(add(PL.crankStand.o, [0, 0.5, -0.3])) })),
};
