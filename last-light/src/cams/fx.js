// FX cameras and looks: s02 strike, s08 flame, s13 sweep, s22 flicker. See CONTRACT.md.
import { LENS } from '../layout.js';
import { CUES } from '../shots.js';
import { noise1, smooth, invLerp, lerp } from '../util.js';

// filled by createFx from the other departments' anchors (layout fallbacks until then)
export const STAGE = { focus: [...LENS.center], suriHead: [LENS.center[0] + 1.25, LENS.center[1] - 0.5, LENS.center[2] + 0.45], groundAt: () => 38 };
const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const mix3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const drift = (t, amp, seed = 0) => [noise1(t * 0.9, seed) * amp, noise1(t * 0.9, seed + 3) * amp, noise1(t * 0.9, seed + 7) * amp];
const shake = (t, amp, seed = 0) => [noise1(t * 9, seed) * amp, noise1(t * 9, seed + 3) * amp, noise1(t * 9, seed + 7) * amp];
const kick = (t, t0, amp, decay = 5) => (t < t0 ? 0 : amp * Math.exp(-(t - t0) * decay));

export const CAMS = {
  // Low on the cliff top, close in under the tower, looking steeply up at the lantern room against the boiling cloud.
  // Dutch tilt; the bolt drops in from the upper left onto the rod; the panes burst toward us; then dark.
  s02: (lt, d, t) => {
    const hit = kick(t, CUES.bolt, 0.6, 4);
    const x = 196 - lt * 1.2, z = -270 + lt * 0.8;
    const pos = [x, STAGE.groundAt(x, z) + 1.0 + lt * 0.2, z];
    const look = [160.5, 76 + lt * 0.5, -300.5];
    return { pos: add(pos, shake(t, hit, 1)), look: add(look, shake(t, hit * 1.4, 5)), fov: 24, roll: -10 + hit * 4 };
  },
  // s08: tight and low on her paws for the strike (the match flares under her chin), then the match rises toward the
  // burner and the camera eases up and round, past her shoulder, until her face fills the frame lit by the lens that
  // floods with light behind the mantle.
  s08: (lt, d, t) => {
    const F = STAGE.stand ?? { o: [STAGE.focus[0] + 0.9, STAGE.focus[1] - 2.4, STAGE.focus[2] + 0.3], f: [-0.95, 0, -0.3], s: [-0.3, 0, 0.95] };
    const at = (x, y, z) => [F.o[0] + F.s[0] * x + F.f[0] * z, F.o[1] + y, F.o[2] + F.s[2] * x + F.f[2] * z];
    const k = smooth(invLerp(0.55, d - 0.2, lt));
    // A: low at her left shoulder, the paws and the match box under her chin
    const posA = at(0.69, 0.8, 0.11), lookA = at(-0.04, 1.0, 0.27);
    // B: eases back and up into a low profile: her face on the right, the lens filling with light on the left
    const posB = at(0.78, 0.9, 0.0), lookB = at(-0.24, 1.35, 0.32);
    const pos = add(mix3(posA, posB, k), drift(t, 0.006, 3));
    const look = add(mix3(lookA, lookB, k), drift(t, 0.006, 9));
    return { pos, look, fov: lerp(30, 40, k), near: 0.05, roll: lerp(-6, -3, k) };
  },
  // THE IMAGE: very low in the wet grass on the west cliff edge, the tower towering at the right. The blade has just
  // come round off the land and swings out across the northern sea; the camera pans with it, so from the first second it
  // lays a long lit stretch over the water toward the lens, the far end sinking into a pale pool on the sea. Dutch, push in.
  s13: (lt, d, t) => {
    const u = smooth(lt / d), w = lt / d;
    const pos = [104 + 1.5 * u, 38.8 - 0.15 * u, -300 - 1.2 * u];
    const look = [204 - 6 * w, 54 - 2.5 * w, -392 - 10 * w];
    return { pos: add(pos, drift(t, 0.03, 2)), look: add(look, drift(t, 0.12, 6)), fov: 71 - 3 * u, roll: 6 - 1.5 * u };
  },
  // s22: close beside her, her cupped paws round the chimney glass with the flame between them, the broken panes behind
  // with the spray driving through.
  s22: (lt, d, t) => {
    const F = STAGE.stand ?? { o: [STAGE.focus[0] + 0.9, STAGE.focus[1] - 2.4, STAGE.focus[2] + 0.3], f: [-0.95, 0, -0.3], s: [-0.3, 0, 0.95] };
    const at = (x, y, z) => [F.o[0] + F.s[0] * x + F.f[0] * z, F.o[1] + y, F.o[2] + F.s[2] * x + F.f[2] * z];
    const gust = kick(t, CUES.sprayHit, 0.025, 3);
    const pos = add(at(0.62, 1.0, 0.28), shake(t, 0.003 + gust, 4));
    return { pos, look: at(-0.15, 1.28, 0.5), fov: 36, roll: -5, near: 0.05 };
  },
};

export const LOOKS = {
  s02: (lt, d, t) => ({ k: 1, flash: 0.6, exposure: t > CUES.bolt + 0.5 ? 0.92 : 1.05, vignette: 0.42, inkWidth: 1.2 }),
  s08: () => ({ k: 1, flash: 0.4, exposure: 1.05, vignette: 0.5 }),
  s13: () => ({ k: 1, exposure: 1.06, vignette: 0.38, inkWidth: 1.1 }),
  s22: () => ({ k: 1, flash: 0.4, exposure: 1.02, vignette: 0.5 }),
};
