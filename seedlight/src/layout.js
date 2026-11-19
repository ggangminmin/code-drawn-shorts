// SEEDLIGHT — the one shared map and the shared clocks. Metres, Y up. Lead owns this file.
// A canyon runs along Z. The dam (the Weir) crosses it along X at z = 0. Downstream (+Z) is the salt desert at y = 0,
// upstream (-Z) is the reservoir with its surface at y = 108. The citadel stands on the dam's crown at y = 120.
import { CUES } from './shots.js';

const cl = (x) => Math.min(1, Math.max(0, x));
const sm = (x) => { x = cl(x); return x * x * (3 - 2 * x); };
const lerp3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

export const SALT_Y = 0, RESERVOIR_Y = 108;
export const CANYON = { halfWidth: 330, rimY: 150 };                 // canyon walls at x = ±330, plateau on both sides at y ≈ 150
export const DAM = { y: 120, x0: -330, x1: 330, z0: -45, z1: 45 };   // the crown: a 660 x 90 m deck
export const KEEP = { center: [0, 120, -8], size: [64, 30, 44], roofY: 150 };   // the block the tower stands on
export const TOWER = { center: [0, 150, -8], r: 9, roofY: 214, parapet: 1.3, topY: 214 };   // round tower; roof floor at y = 214
export const SEEDROOM = { window: [0, 201, 1.2] };                  // s01/s01b: her cell, a window on the +Z face of the tower, 13 m under the roof
export const COURT = { center: [-110, 120, 0], r: 34 };              // west courtyard on the crown
export const WELL = { center: [-110, 0], r: 5.5, top: 120, bottom: 78 };   // the shaft from the vault ceiling to the courtyard
export const VAULT = { center: [-110, 62, 0], size: [44, 16, 30], floorY: 62, door: [-88, 62, 0] };   // inside the dam; iron door in the east wall (x = -88)
export const SLAB = [-118, 62, 2];                                   // where the Lantern lies at the start (head toward +X)
export const WALL = { a: [34, 120, 43], b: [318, 120, 43], h: 9 };   // the east rampart line that the sweep ray draws along (a -> b)
export const GUN = { pos: [150, 131, -38] };                         // the rampart cannon that fires shell 1
export const SHIP = { low: [140, 20, 420], hold: [125, 226, 290], length: 210 };   // the ironclad rises from the canyon floor mist downstream
export const MOON = { elev: 36, az: 232 };                           // key from the south-west: downstream faces are lit three-quarter
// Marks on the tower roof (floor y = 214). The +Z edge looks downstream.
export const ROOF = {
  // The roof is a disc of r = 9 around (0, -8): it spans z = -17 .. +1. The +Z parapet is at z = +1.
  girlStand: [0, 214, -5.4],     // s12-s14: she has backed against the dais
  dais: [0, 214.9, -8],          // a 0.9 m high round stone dais at the roof centre (r = 2.2); the Lantern lays her here (s19)
  lanternKneel: [0, 214, -1.8],  // s13: it has stepped over the +Z parapet and kneels here, facing -Z toward her
  lanternStand: [1.2, 214, -2.4],// s19, s22, s23: it stands between her and the ship (the ship is toward +Z)
  edge: [0, 214, 0.2],           // s26: just inside the +Z parapet (z = 1.0) where she is lifted from
  keepFall: [16, 150, 8],        // s16: where the Lantern lands on the keep roof after shell 1 (keep roof spans x -32..32, z -30..14)
};
// THE CATCH (s27): the boy's hands and her hands meet here at CUES.catch. The skiff passes west -> east along +X.
export const CATCH = { pos: [0, 219.6, 3.2], t: CUES.catch, dir: [1, 0, 0], speed: 16 };

// ---- shared clocks (pure functions of film time) ----
// The gold thread from the glass seed to the sky. On from before frame 0, dies with the Lantern, returns in the last shot.
export function threadOn(t) {
  if (t < CUES.irisOut) return 1 - 0.85 * sm((t - (CUES.irisOut - 0.5)) / 0.5) - 0.15 * sm((t - CUES.irisOut) / 0.3);
  return 0.9 * sm((t - CUES.threadBack) / 0.5);
}
// The Lantern's iris: 0 dark, 1 gold (calm), 2 white-hot (anger). FX, mech and sound read this.
export function irisHeat(t) {
  if (t < CUES.irisOpen) return 0;
  if (t < CUES.shell1Hit) return Math.min(1, (t - CUES.irisOpen) / 0.35);
  if (t < CUES.irisBack) return 0.06 * (Math.sin(t * 31) > 0.6 ? 1 : 0);                 // knocked out, a dying flicker
  if (t < CUES.lift - 1.2) return 2 * sm((t - CUES.irisBack) / 0.5);
  if (t < CUES.broadside) return 1;                                                      // gentle again while it carries her
  if (t < CUES.lastSalvo) return 2;
  return 2 * (1 - sm((t - CUES.lastSalvo) / (CUES.irisOut - CUES.lastSalvo)));
}
// THE SWEEP (s17). sweepU 0..1: the ray's touch point runs along WALL a -> b. Nothing happens for 0.4 s, then eruptU 0..1:
// the line it drew erupts as a running wall of fire, also a -> b. burnt(x, t) = 1 once the fire has passed world x.
export const sweepU = (t) => cl((t - CUES.sweep) / (CUES.sweepEnd - CUES.sweep));
export const eruptU = (t) => cl((t - CUES.erupt) / (CUES.eruptEnd - CUES.erupt));
export const sweepPoint = (t) => lerp3(WALL.a, WALL.b, sweepU(t));
export const eruptPoint = (t) => lerp3(WALL.a, WALL.b, eruptU(t));
export const burnt = (x, t) => (t < CUES.erupt ? 0 : cl((WALL.a[0] + (WALL.b[0] - WALL.a[0]) * eruptU(t) - x) / 12));
// The ironclad: rises s20, holds, takes ray 2 across the hull at CUES.ray2..hullBurn, then lists but keeps firing.
export function shipPos(t) {
  const k = sm((t - (CUES.shipRise - 0.6)) / 3.8);      // above the crown (y 120) by mid s20: the crown looks UP at it
  const p = lerp3(SHIP.low, SHIP.hold, k);
  const hurt = sm((t - CUES.hullBurn) / 6);
  return [p[0] + hurt * 14, p[1] - hurt * 10 + Math.sin(t * 0.7) * 0.8, p[2] + hurt * 20];
}
export const shipList = (t) => 0.14 * sm((t - CUES.hullBurn) / 5);    // roll in radians after the hull burns
// SHELLS: every shell in the film. t0 = muzzle, t1 = impact. from 'gun' = GUN.pos, 'ship' = ctx.land.anchor('shipGunN').
// Sound, FX (trails, bursts), land (muzzle recoil, tower damage) and mech (the Lantern's flinches) all read this table.
export const SHELLS = [
  { id: 'shell1', t0: CUES.shell1, t1: CUES.shell1Hit, from: 'gun', to: [0.5, 217.5, -1.4], hit: 'lantern' },
  { id: 'b0', t0: CUES.broadside + 0.00, t1: CUES.broadside + 0.62, from: 'ship0', to: [5, 176, 1], hit: 'tower' },
  { id: 'b1', t0: CUES.broadside + 0.16, t1: CUES.broadside + 0.80, from: 'ship1', to: [-4, 192, 0.5], hit: 'tower' },
  { id: 'b2', t0: CUES.broadside + 0.34, t1: CUES.broadside + 1.00, from: 'ship2', to: [3, 205, 1], hit: 'tower' },
  { id: 'b3', t0: CUES.broadside + 0.52, t1: CUES.broadside + 1.22, from: 'ship3', to: [1.8, 217.6, -2.0], hit: 'lantern' },
  { id: 'b4', t0: CUES.broadside + 0.80, t1: CUES.broadside + 1.52, from: 'ship4', to: [1.0, 216.4, -1.8], hit: 'lantern' },
  { id: 'd0', t0: CUES.hullBurn + 0.5, t1: CUES.hullBurn + 1.15, from: 'ship1', to: [2.2, 218, -2.2], hit: 'lantern' },
  { id: 'e0', t0: 63.4, t1: 64.1, from: 'ship2', to: [-7, 208, 2], hit: 'tower' },
  { id: 'e1', t0: 65.9, t1: 66.5, from: 'ship4', to: [8, 211, -2], hit: 'tower' },
  { id: 'f0', t0: CUES.lastSalvo - 0.65, t1: CUES.lastSalvo, from: 'ship0', to: [1.2, 217.2, -2.0], hit: 'lantern' },
  { id: 'f1', t0: CUES.lastSalvo - 0.40, t1: CUES.lastSalvo + 0.25, from: 'ship2', to: [2.0, 216.0, -2.6], hit: 'lantern' },
  { id: 'f2', t0: CUES.lastSalvo - 0.15, t1: CUES.lastSalvo + 0.55, from: 'ship3', to: [0.4, 215.2, -1.4], hit: 'lantern' },
];
// 0..1 how hard the tower top shakes at time t (camera and prop shake from shell impacts).
export function quake(t) {
  let q = 0;
  for (const s of SHELLS) { const d = t - s.t1; if (d >= 0 && d < 0.7) q = Math.max(q, (1 - d / 0.7) ** 2); }
  return q;
}
