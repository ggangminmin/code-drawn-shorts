import { SETS } from '../layout.js';
import { smooth, lerp } from '../util.js';
import { STAIR } from '../sets-stairs.js';

// SETS cameras and looks (see CONTRACT.md). Interiors sit at layout SETS, 3 km up; local origin = floor centre.
// s06 THE SPIRAL: straight down the stair well from just under the lantern-room floor, on the axis above the newel's cap.
// The spiral turns slowly under us (the frame rotates the way she runs), and we drop down the well toward her as she climbs.
const ST = SETS.stairs;
const of = (b, x, y, z) => [b[0] + x, b[1] + y, b[2] + z];

// Suri's run in s06 (Folk animates it on ctx.sets.stairPoint): u from RUN.u0 to RUN.u1 between RUN.t0 and RUN.t1 (film s).
// She starts ~12.6 m below the lens, a fleck of yellow, and ends ~5.7 m below rounding the last turn: 1/7 of the frame.
export const RUN = { u0: 0.54, u1: 0.63, t0: 10.35, t1: 13.05 };
const herAngle = (u) => STAIR.a0 + (u * (STAIR.N + 2) - 1) * STAIR.dA;

export const CAMS = {
  s06: (lt, d) => {
    const u = lt / d;
    // the drop down the well starts slow and gathers (we fall toward her as she climbs toward us); the lens closes late
    const e = Math.pow(smooth(u), 1.35);
    const y = lerp(28.8, 25.2, e);
    // the frame turns the way she runs, slower than she does, so the spiral wheels under us and she comes round into
    // the lower part of the frame at the end (screen up = the small horizontal offset of the look point)
    const thEnd = herAngle(RUN.u1) + Math.PI - 1.95;
    const th = thEnd - 0.95 * (1 - smooth(u));
    const ex = 0.06;
    return { pos: of(ST, 0, y, 0), look: of(ST, Math.sin(th) * ex, y - 20, Math.cos(th) * ex), fov: lerp(52, 40, Math.pow(smooth(u), 1.6)), near: 0.05, far: 80 };
  },
};

// Interior looks. k 1 = storm night preset (Sea's look.js); these interiors light themselves (sets-mat SL rig),
// so the look only grades: no fog, no mist, a firm vignette, a gentle bloom for the lamp flames.
// flash: 0 because the sets light their own lightning through their windows (sets-mat SL rig); the global key stays still.
export const INTERIOR_LOOK = { k: 1, flash: 0, fogMul: 0, mistMul: 0, veil: 0, shafts: 0, exposure: 1.08, vignette: 0.42, bloom: 0.75, inkWidth: 1.05, paintRadius: 3 };
export const LOOKS = {
  s06: () => ({ ...INTERIOR_LOOK, vignette: 0.55 }),
};

// For Folk's interior LOOKS: aim the shadow-casting "sun" from the set's key practical (the lamp) at the subject, so
// look.shadow throws the characters' shadows away from the lamp. Returns { sunAz, sunElev } in degrees (look units).
// setName: 'kitchen' (the table lamp), 'stairs' (the lowest hanging lantern), 'wheelhouse' (the compass lamp).
import { KITCHEN_FLAME } from '../sets-kitchen.js';
const LAMP0 = {
  kitchen: [SETS.kitchen[0] + KITCHEN_FLAME[0], SETS.kitchen[1] + KITCHEN_FLAME[1], SETS.kitchen[2] + KITCHEN_FLAME[2]],
};
export function lampSun(setName, target, ctx) {
  const L = setName === 'kitchen' ? LAMP0.kitchen : ctx?.sets?.lightFor?.(setName, 0)?.lamps?.[0]?.p;
  if (!L) return {};
  const d = [L[0] - target[0], L[1] - target[1], L[2] - target[2]], n = Math.hypot(...d) || 1;
  return { sunAz: Math.atan2(d[0] / n, -d[2] / n) * 180 / Math.PI, sunElev: Math.asin(d[1] / n) * 180 / Math.PI };
}
