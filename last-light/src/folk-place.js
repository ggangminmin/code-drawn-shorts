import * as THREE from 'three';
import { SETS, LAMPROOM, LENS, PIER, BEAM, lensSpin, boatPath } from './layout.js';

// FOLK placement: every spot a character stands on, resolved from the other departments' anchors when they exist
// and from layout numbers when they do not. Frames are { o:[x,y,z] origin on the floor, f:[x,0,z] forward, s:[x,0,z] side
// (left of f), up }. Filled once by initPlaces(ctx) at build time; cameras (src/cams/folk.js) read the same object.

export const PL = { ready: false };
const v = new THREE.Vector3();
const arr = (p) => (Array.isArray(p) ? p.slice() : [p.x, p.y, p.z]);
const hnorm = (d) => { const l = Math.hypot(d[0], d[2]) || 1; return [d[0] / l, 0, d[2] / l]; };
export const add = (p, ...ds) => ds.reduce((o, d) => [o[0] + d[0], o[1] + d[1], o[2] + d[2]], p.slice());
export const mul = (d, k) => [d[0] * k, d[1] * k, d[2] * k];
export const leftOf = (f) => [f[2], 0, -f[0]];           // +X local of a body facing f (character's left)
export const yawOf = (f) => Math.atan2(f[0], f[2]);
// point in a frame: x along s (left), y up, z along f
export const inF = (F, x, y, z) => [F.o[0] + F.s[0] * x + F.f[0] * z, F.o[1] + y, F.o[2] + F.s[2] * x + F.f[2] * z];
const frame = (o, f) => { const ff = hnorm(f); return { o, f: ff, s: leftOf(ff), yaw: yawOf(ff) }; };

function anchor(api, name) {
  try { if (api && api.anchor) { const r = api.anchor(name, v.set(NaN, NaN, NaN)); const p = arr(r ?? v); if (p.every(Number.isFinite)) return p; } } catch (e) { /* not there yet */ }
  return null;
}

export function initPlaces(ctx) {
  const sets = ctx.sets, mech = ctx.mech;
  PL.has = { sets: {}, mech: {} };
  PL.ctx = ctx;
  const sa = (n, fb) => { const p = anchor(sets, n); PL.has.sets[n] = !!p; return p ?? fb; };
  const ma = (n, fb) => { const p = anchor(mech, n); PL.has.mech[n] = !!p; return p ?? fb; };

  // ---- kitchen: Suri at the window, facing it
  const K = SETS.kitchen;
  const kw = sa('kitchenWindow', [K[0], K[1] + 1.25, K[2] - 1.9]);
  PL.kitchenWindow = kw;
  // the window sits in an axis-aligned wall: face it square
  const kf0 = hnorm([kw[0] - K[0], 0, kw[2] - K[2]]), kf = Math.abs(kf0[0]) > Math.abs(kf0[2]) ? [Math.sign(kf0[0]), 0, 0] : [0, 0, Math.sign(kf0[2])];
  const sill = sa('kitchenSill', [kw[0], K[1] + 1.0, kw[2] + 0.2]);
  PL.kitchenSill = sill;
  // she stands a forearm back from the sill's front edge
  PL.kitchen = frame([sill[0] - kf[0] * 0.33, K[1], sill[2] - kf[2] * 0.33], kf);

  // ---- stair foot: Grandpa sitting with his back to the first steps, Suri crouched in front of him
  const S = SETS.stairs;
  const sf = sa('stairFoot', [S[0] + 1.7, S[1], S[2]]);
  const out = hnorm([sf[0] - S[0], 0, sf[2] - S[2]]);
  PL.stairFoot = sf;
  // Grandpa sits on the floor at the foot of the first step, back to the outer wall, facing into the stair well
  PL.grandpaSit = frame([S[0] + out[0] * 2.56, S[1], S[2] + out[2] * 2.56], [-out[0], 0, -out[2]]);
  PL.stairTop = sa('stairTop', [S[0], S[1] + 30, S[2] + 1.7]);
  PL.stairPoint = (u) => {
    if (sets && sets.stairPoint) { try { const r = sets.stairPoint(u); const p = arr(r && r.pos ? r.pos : r); if (p.every(Number.isFinite)) return p; } catch (e) { /* fall back */ } }
    // fallback helix: radius 1.45, 30 m, 10 turns, counter-clockwise seen from above
    const a = u * Math.PI * 2 * 10, r = 1.45;
    return [S[0] + Math.cos(a) * r, S[1] + u * 30, S[2] + Math.sin(a) * r];
  };
  PL.hasStairPoint = !!(sets && sets.stairPoint);

  // ---- wheelhouse: Dad behind the wheel, facing the front window
  const Wh = SETS.wheelhouse;
  const wheel = sa('wheel', [Wh[0], Wh[1] + 1.05, Wh[2] - 0.55]);
  PL.wheelGripL = anchor(sets, 'wheelGripL'); PL.wheelGripR = anchor(sets, 'wheelGripR'); PL.compassLamp = anchor(sets, 'compassLamp');
  const ww = sa('wheelWindow', [Wh[0], Wh[1] + 1.65, Wh[2] - 1.15]);
  const wf = hnorm([ww[0] - wheel[0], 0, ww[2] - wheel[2]]);
  PL.wheel = wheel; PL.wheelWindow = ww;
  PL.wheelhouse = frame([wheel[0] - wf[0] * 0.4, Wh[1], wheel[2] - wf[2] * 0.4], wf);

  // ---- lantern room: the crank, the burner, the floor
  const floorY = (ma('lampFloor', [LAMPROOM.center[0], LAMPROOM.floorY, LAMPROOM.center[2]]))[1];
  PL.floorY = floorY + 0.012;   // the plate's top surface sits a centimetre above Mech's anchor
  const lc = LENS.center;
  // default keyhole: on the pedestal, on the side away from the stair hatch, at hip height for an 11-year-old
  const kh = ma('crankKeyhole', [lc[0] - 0.85, floorY + 0.82, lc[2] + 0.35]);
  const a = hnorm([kh[0] - lc[0], 0, kh[2] - lc[2]]);
  PL.keyhole = kh; PL.crankAxis = a;
  // Mech's foot-bar in front of the crank (low rail of the crank frame): she stands on it to reach the handle
  PL.bar = null;
  try {
    const fr = (ctx.colliders || []).find((c) => c.name === 'crankFrame');
    if (fr) {
      const rc = new THREE.Raycaster(); fr.obj.updateMatrixWorld(true);
      let best = null;
      for (let d = 0.15; d < 0.75; d += 0.01) {
        const x = kh[0] + a[0] * d, z = kh[2] + a[2] * d;
        rc.set(new THREE.Vector3(x, floorY + 0.5, z), new THREE.Vector3(0, -1, 0));
        const h = rc.intersectObject(fr.obj, true)[0];
        if (h && h.point.y < floorY + 0.35 && h.point.y > floorY + 0.03) { best = best ?? { d0: d, y: h.point.y }; best.d1 = d; best.y = Math.max(best.y, h.point.y); }
      }
      if (best) PL.bar = { d: (best.d0 + best.d1) / 2, y: best.y };
    }
  } catch (e) { /* no bar */ }
  const sd = PL.bar ? PL.bar.d + 0.02 : 0.5, sy = PL.bar ? PL.bar.y : floorY;
  PL.crankStand = frame([kh[0] + a[0] * sd, sy, kh[2] + a[2] * sd], [-a[0], 0, -a[2]]);
  PL.crankFloor = frame([kh[0] + a[0] * sd, floorY + 0.012, kh[2] + a[2] * sd], [-a[0], 0, -a[2]]);
  PL.crankR = 0.3;
  PL.crankOut = 0.095;          // the grip sits this far out from the keyhole along the axle
  PL.hasCrank = !!(mech && mech.anchor && PL.has.mech.crankKeyhole);
  PL.crankAngle = (t) => (mech && mech.crankAngle ? mech.crankAngle(t) : -(lensSpin(t) - BEAM.stuckAz) * 6);
  // the grip in world space for a crank angle (our model of Mech's crank; the real anchor overrides it per frame)
  const s = leftOf([-a[0], 0, -a[2]]);
  PL.crankS = s;
  PL.gripAt = (ang) => [kh[0] + a[0] * PL.crankOut + s[0] * Math.sin(ang) * PL.crankR, kh[1] + Math.cos(ang) * PL.crankR, kh[2] + a[2] * PL.crankOut + s[2] * Math.sin(ang) * PL.crankR];
  PL.grip = (t) => {
    // live anchor when Mech has it (this frame), else our model
    const p = anchor(mech, 'crank');
    PL.has.mech.crank = !!p;
    return p ?? PL.gripAt(PL.crankAngle(t));
  };
  const burner = ma('burner', [lc[0], floorY + 1.15, lc[2]]);
  PL.burner = burner;
  // where she stands to reach the burner: Mech's own spot if given, else outside the lens on the crank side
  const bdir = Math.hypot(burner[0] - lc[0], burner[2] - lc[2]) > 0.3 ? hnorm([burner[0] - lc[0], 0, burner[2] - lc[2]]) : hnorm([a[0] * 0.5 - a[2] * 0.87, 0, a[2] * 0.5 + a[0] * 0.87]);
  const bs = ma('burnerStand', [burner[0] + bdir[0] * 0.5, floorY, burner[2] + bdir[2] * 0.5]);
  // Mech's service step: she stands on its top, facing the burner through the lens door; the ladder is on its outer side
  PL.burnerStand = frame([bs[0], bs[1] + 0.005, bs[2]], [burner[0] - bs[0], 0, burner[2] - bs[2]]);
  {
    const out = [-PL.burnerStand.f[0], 0, -PL.burnerStand.f[2]];
    PL.ladderFoot = [bs[0] + out[0] * 0.55, floorY + 0.012, bs[2] + out[2] * 0.55];
    PL.stepHeight = bs[1] - floorY;
  }
  // where she comes in: the stair hatch / door
  const ent = ma('lampEntry', [lc[0] + (-a[2]) * 2.3, floorY, lc[2] + a[0] * 2.3]);
  PL.entry = [ent[0], floorY, ent[2]];
  PL.lensCenter = lc;

  // ---- the boats and the pier
  PL.boatDeck = (i, t) => {
    const p = anchor(mech, 'boatDeck' + i);
    if (p) return p;
    const b = boatPath(i, t), y = ctx.sea && ctx.sea.heightAt ? ctx.sea.heightAt(b.x, b.z, t) : 0;
    return [b.x, y + 1.0, b.z];
  };
  PL.boatYaw = (i, t) => {
    const r = mech && mech.boats && mech.boats[i];
    if (r && r.getWorldQuaternion) { const q = r.getWorldQuaternion(new THREE.Quaternion()); const e = new THREE.Euler().setFromQuaternion(q, 'YXZ'); return e.y; }
    return boatPath(i, t).yaw;
  };
  PL.pierY = PIER.from[1];
  {
    // measured from Mech's boatDeck0 at the berth (yaw 0): 1.73 m aft of the boat's path point, 0.66 m above the sea
    PL.deckOff = [0, 0.66, -1.73];
  }
  PL.deckPure = (t) => { const b = boatPath(0, t), y = ctx.sea && ctx.sea.heightAt ? ctx.sea.heightAt(b.x, b.z, t) : 0; return [b.x + PL.deckOff[0], y + PL.deckOff[1], b.z + PL.deckOff[2]]; };
  PL.ready = true;
  return PL;
}
