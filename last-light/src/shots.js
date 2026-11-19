import { smooth, invLerp } from './util.js';

// LAST LIGHT — 73 s, 24 fps. Hook first, rhyme last. Shot list per CONTRACT.md. Lead owns this file.
export const FPS = 24;
const LIST = [
  ['s01', 'hook', 'sea', 2.5], ['s02', 'strike', 'towerExt', 1.5], ['s03', 'captain', 'wheelhouse', 2.0],
  ['s04', 'window', 'kitchen', 2.0], ['s05', 'grandpa', 'stairsBase', 2.5], ['s06', 'spiral', 'stairs', 2.5],
  ['s07', 'lamproom', 'lamproom', 2.0], ['s08', 'flame', 'lamproom', 2.5], ['s09', 'stuck', 'lamproom', 2.5],
  ['s10', 'swell', 'sea', 2.5], ['s11', 'lookout', 'wheelhouse', 2.0], ['s12', 'notch', 'lamproom', 2.5],
  ['s13', 'sweep', 'towerExt', 3.5], ['s14', 'seen', 'sea', 2.0], ['s15', 'mouth', 'harbourHigh', 3.0],
  ['s16', 'crest', 'sea', 3.0], ['s17', 'tired', 'lamproom', 2.0], ['s18', 'together', 'lamproom', 2.5],
  ['s19', 'race', 'mouth', 3.0], ['s20', 'break', 'mouth', 3.0], ['s21', 'surf', 'harbour', 2.5],
  ['s22', 'flicker', 'lamproom', 2.5], ['s23', 'pier', 'harbour', 3.0], ['s24', 'dad', 'harbour', 2.5],
  ['s25', 'ruffle', 'lamproom', 3.0], ['s26', 'clearing', 'sky', 4.0], ['s27', 'rhyme', 'sea', 4.0], ['s28', 'asleep', 'lamproom', 2.5],
];
export const SHOTS = [];
{
  let t = 0;
  for (const [id, name, set, d] of LIST) { SHOTS.push({ id, name, set, start: +t.toFixed(3), end: +(t + d).toFixed(3) }); t += d; }
}
export const DURATION = SHOTS[SHOTS.length - 1].end;
export const FRAMES = Math.round(FPS * DURATION);

// Story clock (film seconds). Every department times its events from these numbers, never from its own constants.
export const CUES = {
  bolt: 2.9,          // lightning hits the lantern room; the beam dies
  thunder: 3.2,
  cupFall: 6.6,       // kitchen: Suri drops the cup
  keyHand: 9.4,       // grandpa presses the crank key into her paw
  matchStrike: 15.6,  // she strikes the match
  mantleCatch: 16.4,  // the mantle catches; the lens fills with light
  pushStart: 17.9,    // she leans on the crank; nothing moves (beam stuck on the cliff, BEAM.stuckAz)
  swellRise: 20.0,    // the great swell lifts behind the fleet
  notch: 25.6,        // the lens moves its first notch
  sweepStart: 26.4,   // the beam starts to turn (slow)
  beamOnFleet: 31.0,  // the beam crosses the fleet; lanterns swing toward it
  mouthLit: 34.6,     // the beam lights the two reef teeth: the harbour mouth reads
  crest: 37.0,        // the swell crests behind the fleet
  grandpaJoins: 39.6, // grandpa's paws land on the crank
  fastSweep: 41.0,    // the beam turns faster
  boatsIn: 43.0,      // first boat passes the mouth (others every 0.6 s, see layout boatPass)
  dadIn: 46.9,        // Dad's boat (Kestrel, boat 0) passes the mouth, last
  waveBreak: 46.4,    // the swell breaks on the reef teeth
  sprayHit: 51.9,     // spray reaches the lantern room
  flameSave: 52.6,    // the flame gutters, then holds
  pierBump: 54.6,
  dadSmile: 58.4,
  laugh: 60.6,
  cloudsPart: 62.5,   // the storm breaks; dawn
  dawnFull: 68.0,
  sleep: 71.0,
  end: 0,
};
CUES.end = DURATION;

const CAMS = {}, LOOKS = {};
export function registerCams(mod) { Object.assign(CAMS, mod.CAMS || {}); Object.assign(LOOKS, mod.LOOKS || {}); }

const DEFAULT_CAM = {
  sea: { pos: [0, 260, -2600], look: [0, 0, -900], fov: 42 }, towerExt: { pos: [150, 40, -330], look: [160, 72, -300], fov: 40 },
  wheelhouse: { pos: [0, 1.6, 1.4], look: [0, 1.5, 0], fov: 36 }, kitchen: { pos: [0, 1.3, 2.2], look: [0, 1.1, 0], fov: 36 },
  stairsBase: { pos: [1.5, 1.4, 1.5], look: [0, 1.0, 0], fov: 38 }, stairs: { pos: [0, 30, 0], look: [0, 0, 0], fov: 50 },
  lamproom: { pos: [2.6, 1.6, 1.2], look: [0, 1.4, 0], fov: 38 }, harbourHigh: { pos: [400, 320, -700], look: [0, 0, -260], fov: 40 },
  mouth: { pos: [-120, 30, -380], look: [0, 10, -270], fov: 42 }, harbour: { pos: [-60, 12, -60], look: [0, 6, 40], fov: 40 },
  sky: { pos: [160, 80, -320], look: [-200, 260, -1500], fov: 50 },
};
const DEFAULT_LOOK = { k: 1, sunElev: 30, sunAz: 200 };

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
