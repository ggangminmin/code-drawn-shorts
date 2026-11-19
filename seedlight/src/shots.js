import { smooth, invLerp } from './util.js';

// SEEDLIGHT — 78.4 s, 24 fps. Hook first, payoff last. Shot list per CONTRACT.md.
export const FPS = 24;
// [id, name, set, seconds, owner of the camera]
const LIST = [
  ['s01', 'thread', 'wide', 1.2, 'land'], ['s01b', 'seed', 'seed', 1.0, 'folk'], ['s01c', 'iris', 'vault', 1.2, 'mech'],
  ['s02', 'fingers', 'vault', 2.0, 'mech'], ['s03', 'guards', 'vault', 2.0, 'folk'], ['s04', 'rise', 'vault', 3.0, 'mech'],
  ['s05', 'volley', 'vault', 2.0, 'folk'], ['s06', 'firstRay', 'vault', 2.5, 'fx'], ['s07', 'shaft', 'shaft', 2.5, 'mech'],
  ['s08', 'burst', 'court', 2.0, 'mech'], ['s09', 'alarm', 'court', 1.5, 'land'], ['s10', 'stairs', 'tower', 2.5, 'land'],
  ['s11', 'climb', 'tower', 3.0, 'mech'], ['s12', 'roof', 'roof', 2.5, 'mech'], ['s13', 'kneel', 'roof', 3.5, 'mech'],
  ['s14', 'wonder', 'roof', 2.0, 'folk'], ['s15', 'shell', 'roof', 2.0, 'fx'], ['s16', 'down', 'keep', 2.5, 'mech'],
  ['s17', 'sweep', 'wall', 3.5, 'fx'], ['s18', 'burning', 'court', 2.5, 'land'], ['s19', 'carry', 'roof', 3.5, 'mech'],
  ['s20', 'ship', 'ship', 3.0, 'land'], ['s21', 'skiff', 'skiff', 3.0, 'mech'], ['s22', 'broadside', 'ship', 2.5, 'fx'],
  ['s23', 'duel', 'roof', 3.0, 'fx'], ['s24', 'wake', 'roof', 2.0, 'folk'], ['s25', 'approach', 'skiff', 2.5, 'mech'],
  ['s26', 'reach', 'roof', 2.5, 'folk'], ['s27', 'catch', 'roof', 2.5, 'folk'], ['s28', 'fall', 'roof', 3.0, 'fx'],
  ['s29', 'away', 'flats', 3.0, 'mech'], ['s30', 'ember', 'wide', 3.0, 'land'],
];
export const SHOTS = [];
{
  let t = 0;
  for (const [id, name, set, d, owner] of LIST) { SHOTS.push({ id, name, set, start: +t.toFixed(3), end: +(t + d).toFixed(3), owner }); t += d; }
}
export const DURATION = SHOTS[SHOTS.length - 1].end;
export const FRAMES = Math.round(FPS * DURATION);

// Film seconds. Everything that more than one department must agree on is here or in layout.js.
export const CUES = {
  irisOpen: 2.6, twitch: 3.9, lampDrop: 6.6, standUp: 7.6, armDrop: 9.4, volley: 10.6, ray1: 12.9, doorBurst: 14.0,
  fansOpen: 15.4, leap: 16.0, burst: 17.9, alarm: 19.4, gripParapet: 27.0, headRise: 27.8, handChest: 30.6, chestLit: 31.4,
  shell1: 34.9, shell1Hit: 35.4, irisBack: 37.9, sweep: 39.4, sweepEnd: 40.6, erupt: 41.0, eruptEnd: 42.6,
  lift: 45.6, setDown: 47.6, shipRise: 48.4, broadside: 54.9, ray2: 57.4, hullBurn: 58.2, wake: 60.4, hang: 62.9,
  push: 65.4, catch: 67.4, lastSalvo: 69.9, irisOut: 71.6, threadBack: 77.0, end: DURATION,
};

const CAMS = {}, LOOKS = {};
export function registerCams(mod) { Object.assign(CAMS, mod.CAMS || {}); Object.assign(LOOKS, mod.LOOKS || {}); }

// Placeholders until the owning department supplies its camera.
const DEFAULT_CAM = {
  wide: { pos: [-260, 190, 620], look: [0, 170, 0], fov: 38 }, seed: { pos: [0.6, 201.3, 3.6], look: [0, 201.0, 2.2], fov: 30 },
  vault: { pos: [-96, 65, 10], look: [-112, 66, 0], fov: 42 }, shaft: { pos: [-110, 118, 0.5], look: [-110, 62, 0], fov: 50 },
  court: { pos: [-150, 126, 34], look: [-110, 124, 0], fov: 40 }, tower: { pos: [-40, 150, 70], look: [0, 185, -10], fov: 40 },
  roof: { pos: [10, 216.5, 12], look: [0, 216, -8], fov: 40 }, keep: { pos: [40, 156, 30], look: [16, 152, 12], fov: 40 },
  wall: { pos: [-40, 250, 330], look: [170, 125, 40], fov: 42 }, ship: { pos: [-20, 200, 120], look: [140, 230, 380], fov: 42 },
  skiff: { pos: [60, 150, 420], look: [0, 190, 0], fov: 40 }, flats: { pos: [120, 40, 700], look: [0, 150, 0], fov: 36 },
};
const DEFAULT_LOOK = { k: 1, sunElev: 36, sunAz: 232 };

export function shotAt(t) {
  for (let i = 0; i < SHOTS.length; i++) if (t < SHOTS[i].end) return i;
  return SHOTS.length - 1;
}
export const shotById = (id) => SHOTS.find((s) => s.id === id);

export function evalFrame(frame) {
  const t = frame / FPS;
  const si = shotAt(t);
  const sh = SHOTS[si];
  const lt = t - sh.start, dur = sh.end - sh.start;
  const st = { frame, t, si, sid: sh.id, shot: sh.name, set: sh.set, lt, dur, cues: CUES, fade: 0, fadeColor: '#ffffff', shadow: null, key: null };
  const lf = LOOKS[sh.id];
  st.look = { ...DEFAULT_LOOK, ...(lf ? lf(lt, dur, t, st) : {}) };
  st.shadow = st.look.shadow ?? null;
  st.key = st.look.key ?? null;
  const cf = CAMS[sh.id];
  st.cam = cf ? cf(lt, dur, t, st) : DEFAULT_CAM[sh.set];
  if (st.look.fade != null) st.fade = st.look.fade;
  if (st.look.fadeColor) st.fadeColor = st.look.fadeColor;
  // HOOK: never open on a fade. The film only closes to black, on the payoff's last beat.
  if (t > DURATION - 0.35) { st.fade = Math.max(st.fade, smooth(invLerp(DURATION - 0.35, DURATION, t))); st.fadeColor = '#000000'; }
  return st;
}
