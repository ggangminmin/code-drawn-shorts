import { noise1, smooth, invLerp, lerp } from '../util.js';
import { SEEDROOM, ROOF, CATCH, VAULT, quake } from '../layout.js';
import { CUES } from '../shots.js';

// FOLK cameras and looks: s01b seed, s03 guards, s05 volley, s14 wonder, s24 wake, s26 reach, s27 catch.
const L3 = (a, b, u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
const add = (p, ...ds) => ds.reduce((o, d) => [o[0] + d[0], o[1] + d[1], o[2] + d[2]], p);
const drift = (t, a = 0.008, s = 0) => [noise1(t * 0.7, 11 + s) * a, noise1(t * 0.55, 23 + s) * a * 0.7, noise1(t * 0.6, 37 + s) * a * 0.5];
const shake = (t, a, s = 0) => [noise1(t * 22, 3 + s) * a, noise1(t * 25, 5 + s) * a, noise1(t * 20, 7 + s) * a * 0.5];
const W = SEEDROOM.window, D = ROOF.dais, G = [ROOF.girlStand[0], ROOF.girlStand[1], Math.max(ROOF.girlStand[2], ROOF.dais[2] + 3.2)], E = ROOF.edge, FY = VAULT.floorY;
let skiffPos = null, HOOK_Y = -0.92;
try { const m = await import('../mech-skiff.js'); if (typeof m.skiffPos === 'function') { skiffPos = m.skiffPos; HOOK_Y = m.SKIFF?.hook?.[1] ?? HOOK_Y; } } catch (e) { /* mech not there yet: straight-line fallback */ }
const shadowAt = (c, r = 1.6, depth = 6) => ({ center: c, radius: r, depth });

export const CAMS = {
  // ECU, match-cut on the push-in: from just below the seed, looking up past it at her muzzle and eyes
  s01b: (lt, d, t) => {
    // from the balcony beside her, low: the seed in the foreground, her face over it, night sky behind (the lit doorway stays out of frame)
    const u = 1 - (1 - lt / d) ** 2.2, z = W[2] + 1.0;
    return { pos: add(L3([W[0] + 2.3, W[1] - 0.36, z + 0.9], [W[0] + 1.62, W[1] - 0.3, z + 0.56], u), drift(t, 0.004)), look: [W[0] - 0.05 - 0.3 * (1 - u), W[1] + 0.03, z + 0.24 + 0.1 * (1 - u)], fov: 25, near: 0.05, roll: -4 };
  },
  // long lens from the slab, past the machine's shoulder, to the two guards at the grille; a jolt when the lamp hits the floor
  s03: (lt, d, t) => {
    const hit = t > CUES.lampDrop + 0.4 ? Math.exp(-(t - CUES.lampDrop - 0.4) * 9) : 0;
    return { pos: add([-120.4, FY + 0.95, 4.5], drift(t, 0.015), shake(t, 0.012 * hit)), look: [-92.9, FY + 1.2 - 0.25 * smooth(invLerp(CUES.lampDrop, CUES.lampDrop + 0.5, t)), -0.35], fov: lerp(11.5, 10.6, lt / d), roll: 2.5, near: 0.3 };
  },
  // over the kneeling guards' shoulders, low, at the machine in the dark; each shot kicks the frame
  s05: (lt, d, t) => {
    const k = [0, 0.13, 0.31, 0.8, 0.95, 1.15].reduce((m, o) => { const x = t - CUES.volley - o; return Math.max(m, x > 0 ? Math.exp(-x * 14) : 0); }, 0);
    return { pos: add([-89.0, FY + 1.3, 0.75], drift(t, 0.012), shake(t, 0.03 * k)), look: [-112, FY + 3.6 + 0.5 * smooth(invLerp(1.2, 1.9, lt)), -0.6], fov: 46, roll: -4, near: 0.1 };
  },
  // CU from low on her left: the gold light arrives on her face
  s14: (lt, d, t) => ({ pos: add(L3([G[0] + 1.02, G[1] + 1.0, G[2] + 0.62], [G[0] + 0.9, G[1] + 1.02, G[2] + 0.54], smooth(lt / d)), drift(t, 0.004)), look: [G[0] - 0.02, G[1] + 1.09, G[2] + 0.08], fov: 22, near: 0.05, roll: 3 }),
  // low on the dais beside her: her reaching paw toward camera, the face behind it
  s24: (lt, d, t) => ({ pos: add([D[0] - 0.95, D[1] + 0.3, D[2] + 1.75 - 0.12 * smooth(lt / d)], drift(t, 0.006), shake(t, 0.03 * quake(t))), look: [D[0] + 0.02, D[1] + 0.6 + 0.12 * smooth(invLerp(0.5, 1.4, lt)), D[2] - 0.05], fov: 28, near: 0.05, roll: -5 }),
  // behind and below as she runs to the edge; then craning up with her as the hand lifts her into the sky
  s26: (lt, d, t) => {
    const up = smooth(invLerp(CUES.push, CUES.push + 1.3, t));
    const look = L3([E[0], E[1] + 0.9, lerp(D[2] + 4, E[2] - 0.3, smooth(invLerp(0, 0.95, lt)))], [lerp(E[0], CATCH.pos[0], 0.8), CATCH.pos[1] - 0.75, lerp(E[2], CATCH.pos[2], 0.8)], up);
    return { pos: add([E[0] - 2.3, E[1] + 0.35 + 0.5 * up, E[2] - 3.6 - 0.5 * up], drift(t, 0.012), shake(t, 0.05 * quake(t))), look, fov: lerp(34, 40, up), roll: 6, near: 0.1 };
  },
  // ECU on the hands at the catch (travelling with the skiff), then wide from the roof as she swings out under it
  s27: (lt, d, t) => {
    const dt = t - CATCH.t;
    // where the grip is: under the hook bar of the real skiff path when mech exports it, else the straight pass from the layout
    const grip = (tt) => { if (skiffPos) { const o = skiffPos(tt, [0, 0, 0]); return [o[0], o[1] + HOOK_Y - 1.12, o[2]]; } const k = tt - CATCH.t; return [CATCH.pos[0] + CATCH.dir[0] * CATCH.speed * k, CATCH.pos[1] + 0.42, CATCH.pos[2] + CATCH.dir[2] * CATCH.speed * k]; };
    const p = grip(t);
    if (dt < 0.95) {
      // travelling with the skiff: his paws come down into frame, hers come up, they lock; then the frame opens as she swings out under him
      const pre = Math.max(0, -dt), w = smooth(invLerp(0.12, 0.85, dt)), c = grip(CATCH.t + Math.min(0, dt) * 0.55 + Math.max(0, dt));
      return { pos: add(c, [-1.0 - 0.8 * pre - 2.4 * w, -0.2 - 0.9 * w, 1.35 + 2.2 * w], shake(t, 0.012)), look: add(L3(c, p, 0.7), [-0.3 * w, 0.02 + 0.25 * pre - 0.55 * w, 0]), fov: lerp(34, 26, smooth(invLerp(-0.5, 0, dt))) + 12 * w, roll: 8 - 4 * w, near: 0.05 };
    }
    // from the far side of the roof: the Lantern's back and raised arm, the skiff dipping with her weight and climbing away
    return { pos: add([D[0] - 6.5, D[1] + 3.4, D[2] - 2.5], drift(t, 0.03), shake(t, 0.06 * quake(t))), look: add(L3([E[0] + 2, CATCH.pos[1], CATCH.pos[2]], p, 0.55), [0, -0.6, 0]), fov: lerp(40, 34, smooth(invLerp(0.95, 2, dt))), roll: 4, near: 0.1 };
  },
};

const NIGHT = { k: 1, mistMul: 0.5 };
export const LOOKS = {
  s01b: () => ({ ...NIGHT, key: [0.15, -0.75, 0.6], paintRadius: 3 }),
  s03: () => ({ ...NIGHT, key: [-0.5, 0.35, 0.6], exposure: 1.25, fogMul: 0.2, mistMul: 0.1, shadow: shadowAt([-92.3, FY + 1, 0], 3.5, 10) }),
  s05: () => ({ ...NIGHT, key: [-1, 0.5, 0.2], exposure: 1.25, fogMul: 0.2, mistMul: 0.1, shadow: shadowAt([-92.2, FY + 1, 0], 3.5, 10) }),
  s14: () => ({ ...NIGHT, key: [0.2, 0.25, 1], shadow: shadowAt([G[0], G[1] + 0.8, G[2]], 1.3), paintRadius: 3 }),
  s24: () => ({ k: 0.5, key: [0.3, 0.15, 1], shadow: shadowAt([D[0], D[1] + 0.5, D[2]], 2.0) }),
  s26: () => ({ k: 0.5, key: [0.3, -0.35, 0.9], shadow: shadowAt([E[0], E[1] + 1, E[2] - 1], 4, 12) }),
  s27: () => ({ k: 0.5, key: [0.2, -0.5, 0.8] }),
};
