// LAST LIGHT — the one shared map and the shared beam clock. Metres, Y up, sea level y = 0.
// The harbour basin is at the origin; the open sea lies toward -Z. Lead owns this file.
// Every department places and times things from these numbers so the world stays continuous across cuts.
import { CUES } from './shots.js';
import { clamp, smooth, invLerp } from './util.js';

export const SEA_Y = 0;

// Harbour basin and village
export const HARBOUR = { center: [0, 0, 0], radius: 180 };            // calm basin; village terraces climb on the +Z side
export const VILLAGE = { xMin: -260, xMax: 260, zMin: 40, zMax: 320, topY: 60 };
export const PIER = { from: [-20, 2.2, 130], to: [-20, 2.2, -110], width: 6 };   // stone pier from the north quay (z≈130) into the basin; boats moor alongside it
// The harbour mouth: a 90 m gap between two black basalt reef teeth. The swell breaks on them.
export const MOUTH = { center: [0, 0, -270], toothL: [-48, 0, -272], toothR: [48, 0, -272], toothHeight: 16, toothRadius: 18 };

// Headland, lighthouse and keeper's cottage (east of the mouth, on a 38 m cliff)
export const HEADLAND = { center: [175, 38, -300], radius: 70, cliffTop: 38 };
export const TOWER = { base: [160, 38, -300], height: 30, radiusBase: 4.6, radiusTop: 3.6 };   // stone tower, white with one red band
export const LAMPROOM = { center: [160, 70, -300], radius: 3.2, height: 4.2, floorY: 68 };     // glazed lantern room on top
export const LENS = { center: [160, 70.4, -300], radius: 1.1, height: 2.2, panels: 8 };       // rotating brass Fresnel lens
export const COTTAGE = { pos: [146, 38, -282], yaw: 0.6 };                                     // stone cottage at the tower foot
// Interior sets (built 3 km up at the world positions below, far from the sea and land, so cameras inside never see the land):
//   kitchen, wheelhouse and stairs live in their own small worlds. Lamp room is the real one at LAMPROOM.
export const SETS = {
  kitchen: [5000, 3000, 0],       // cottage kitchen interior, local origin = floor centre
  stairs: [5100, 3000, 0],        // tower interior: spiral stair, 30 m tall, local origin = floor centre
  wheelhouse: [5200, 3000, 0],    // Kestrel's wheelhouse interior; the sea outside its windows is drawn by Sea through the glass (or a painted card)
};

// The fleet: 6 small fishing boats. Boat 0 = Kestrel (Dad's), red hull white cabin, always last.
// boatPath(i, t) -> { x, z, yaw } on the water plane; Mech adds sea height + pitch/roll from ctx.sea.
const FLEET0 = [
  [40, -860], [-170, -760], [210, -720], [-290, -680], [120, -640], [-60, -740],
];
export function boatPass(i) { return i === 0 ? CUES.dadIn : CUES.boatsIn + (i - 1) * 0.6; }   // time boat i crosses the mouth line
export function boatPath(i, t) {
  const [x0, z0] = FLEET0[i];
  const lane = (i - 2.5) * 6, side = i % 2 ? 1 : -1, berth = [-20 + side * 8, -95 + i * 14];   // alongside the pier, alternating sides
  const t0 = CUES.beamOnFleet + 0.4 + i * 0.15, tp = boatPass(i);
  const drift = (tt) => [x0 + Math.sin(tt * 0.21 + i * 1.7) * 30, z0 + Math.cos(tt * 0.17 + i) * 20 + tt * 3];
  if (t < t0) { const [x, z] = drift(t); return { x, z, yaw: 0.4 * Math.sin(t * 0.5 + i) + (i % 2 ? 2.2 : -1.2) }; }
  const [xs, zs] = drift(t0);
  if (t < tp) {
    const u = (t - t0) / (tp - t0), e = u * u * (2.2 - 1.2 * u);              // accelerating run, exact at u = 1
    const x = xs + (lane - xs) * e, z = zs + (MOUTH.center[2] - 2 - zs) * e;
    const turn = smooth(invLerp(0, 0.18, u));
    const yaw = ((i % 2 ? 2.2 : -1.2) * (1 - turn)) + Math.atan2(lane - xs, MOUTH.center[2] - zs) * turn;
    return { x, z, yaw };
  }
  // after the mouth: first run to a point south of the pier end on the berth's side, then up alongside the pier
  const mid = [berth[0], -128], z0m = MOUTH.center[2] - 2;
  const v1 = smooth(invLerp(tp, tp + 2.6, t)), v2 = smooth(invLerp(tp + 2.2, tp + 5.0, t));
  const x = lane + (mid[0] - lane) * v1 + (berth[0] - mid[0]) * v2;
  const z = z0m + (mid[1] - z0m) * v1 + (berth[1] - mid[1]) * v2;
  const yaw = v2 > 0.02 ? 0 : Math.atan2(mid[0] - lane, mid[1] - z0m);
  return { x, z, yaw };
}

// The great swell: a single wall of water that rises far out, travels toward +Z and breaks on the reef teeth.
// swellFront(t) = z of the crest line; swellHeight(t) = crest height above sea level.
export function swellFront(t) { return -1900 + (t - CUES.swellRise) * 61.9; }   // reaches MOUTH.center.z near CUES.waveBreak
export function swellHeight(t) {
  if (t < CUES.swellRise) return 0;
  if (t < CUES.crest) return 18 * smooth(invLerp(CUES.swellRise, CUES.swellRise + 2.4, t)) + 8 * smooth(invLerp(CUES.swellRise + 2.4, CUES.crest, t));   // a mountain of water already in s10
  if (t < CUES.waveBreak + 2.5) return 26;
  return 26 * (1 - smooth(invLerp(CUES.waveBreak + 2.5, CUES.waveBreak + 7, t)));
}

// THE BEAM. Azimuth in radians around the lens (0 = toward -Z open sea, + toward +X), and whether it is on.
// Mech turns the lens with this, FX draws the beam with this, Folk times the crank pose with this, Sound times the gear clicks.
export const BEAM = { stuckAz: 1.9 /* pointing into the cliffs */, elev: -0.035 };
export function beamOn(t) {
  if (t < CUES.bolt) return 1;
  if (t < CUES.mantleCatch) return 0;
  return smooth(invLerp(CUES.mantleCatch, CUES.mantleCatch + 0.8, t)) * (t > CUES.sprayHit && t < CUES.flameSave + 0.4 ? 0.35 + 0.65 * Math.abs(Math.sin(t * 31)) : 1);
}
export function beamAz(t) {
  // before the bolt: normal slow rotation; dead; stuck; first notch; slow sweep; fast sweep (grandpa)
  if (t < CUES.bolt) return -0.9 + t * 0.35;
  if (t < CUES.notch) return BEAM.stuckAz;
  const notch = BEAM.stuckAz - 0.12 * smooth(invLerp(CUES.notch, CUES.notch + 0.25, t));
  if (t < CUES.sweepStart) return notch;
  const slow = (Math.min(t, CUES.fastSweep) - CUES.sweepStart) * 0.42;
  // fast sweep 0.95 rad/s, easing to a calm 0.3 rad/s over 3 s once the storm breaks
  const R0 = 0.95, R1 = 0.3, T0 = CUES.cloudsPart, T1 = CUES.cloudsPart + 3;
  const u = Math.max(0, t - CUES.fastSweep);
  let fast;
  if (t < T0) fast = u * R0;
  else if (t < T1) { const d = t - T0; fast = (T0 - CUES.fastSweep) * R0 + R0 * d + (R1 - R0) * d * d / (2 * (T1 - T0)); }
  else fast = (T0 - CUES.fastSweep) * R0 + (R0 + R1) * 0.5 * (T1 - T0) + (t - T1) * R1;
  return notch - slow - fast;   // turns toward the sea side (decreasing az), reaching the fleet near CUES.beamOnFleet
}
export function lensSpin(t) { return beamAz(t); }   // lens rotation about +Y equals the beam azimuth

// Light: storm night, then dawn. Lightning flashes are FX events (see CONTRACT) every department can read.
export const LIGHTNING = [CUES.bolt, 8.6, 20.3, 36.8, 45.1, 5.3, 7.2, 23.4];   // appended (not sorted): world-sky LIGHTNING_POS is index-aligned
export function lightningAt(t) { let k = 0; for (const s of LIGHTNING) { const d = t - s; if (d >= 0 && d < 0.5) k = Math.max(k, d < 0.06 ? 1 : (d < 0.12 ? 0.3 : (d < 0.2 ? 0.8 : 1 - invLerp(0.2, 0.5, d)))); } return k; }
export const DAWN = { sunAz: 95, sunElev: 4 };        // dawn sun low in the east (+X side)
export const storm = (t) => 1 - smooth(invLerp(CUES.cloudsPart, CUES.dawnFull, t));   // 1 = full storm, 0 = clear dawn
