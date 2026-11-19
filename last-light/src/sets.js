import * as THREE from 'three';
import { SETS, lightningAt, beamOn, storm } from './layout.js';
import { CUES } from './shots.js';
import { SL, MAX_LAMPS, MAX_FLASH } from './sets-mat.js';
import { buildKitchen, KITCHEN_FLAME } from './sets-kitchen.js';
import { buildStairs } from './sets-stairs.js';
import { buildWheelhouse } from './sets-wheel.js';
import { noise1, onThrees } from './util.js';

// SETS department: the three enclosed interiors, 3 km up at layout SETS (local origin = floor centre).
//   kitchen (s04), tower stairs (s05, s06), Kestrel's wheelhouse (s03, s11).
// One set is live at a time: the one the camera is in (within 60 m); the others are hidden.
// API (ctx.sets):
//   anchor(name, vec3) -> world point, or null. kitchenWindow (glass centre), kitchenSill, kitchenLamp (flame), kitchenTable,
//     stairFoot (floor just before the first step, toward the well), stairWalk0, stairTop (landing under the hatch),
//     stairDoor, stairCentreTop, stairLamp0..2, wheel (hub), wheelGripL / wheelGripR (handles, move with the wheel),
//     wheelWindow (centre front pane), wheelHelm (where the helmsman stands), compassLamp.
//   stairPoint(u) u 0..1 along the walking line -> { pos [x,y,z] on the tread, yaw (facing, atan2(dx,dz)), step, ramp }.
//   stairGround(x, z, yHint) -> world y of the tread under (x, z) on the turn nearest below yHint (the floor elsewhere).
//   STAIR: { rise, perTurn, N, Rw, Rin, Rwalk, a0, dA, colTop, top } (local metres).
//   light(st) -> the live set's light table in world space { set, amb, fill, fillDir, lamps:[{p,c,r}], flash:{c, list}, haze }.
//   lightFor(name, t), boatMotion(t) -> { pitch, roll, heave }, wheelAngle(t), lampK(t, seed) flicker multiplier.
// Colliders (kind 'solid'): kitchen_solid, kitchen_sill, kitchen_table, stairs_solid, stairs_steps, stairs_floor,
//   stairs_wall_solid, wheelhouse_solid, wheelhouse_wheelRim, wheelhouse_wheelSpokes. Put the ones a body rests on in its contact list.
// Material ids: 20-29 inked; 120-125 self-lit glass/flames (no ink); the window panes are painted (id 0).
// per-shot screen position (NDC) of the lantern seen through the kitchen window; other cameras aim at the pane
const TOWER_NDC = { s04: [0.5, 0.47, 17] };
const _v = new THREE.Vector3();
const C = (h, k = 1) => { const c = new THREE.Color(h); return [c.r * k, c.g * k, c.b * k]; };

// kerosene flame flicker, on threes (8 drawings/s), never below 0.85
export const lampK = (t, seed = 0) => 1 + 0.06 * noise1(onThrees(t) * 4.3, 3 + seed) + 0.04 * noise1(onThrees(t) * 11.0, 9 + seed);

export async function createSets(ctx) {
  const kitchen = buildKitchen(ctx);
  const stairs = buildStairs(ctx);
  const wheel = buildWheelhouse(ctx);
  const SETLIST = [
    { name: 'kitchen', o: SETS.kitchen, s: kitchen },
    { name: 'stairs', o: SETS.stairs, s: stairs },
    { name: 'wheelhouse', o: SETS.wheelhouse, s: wheel },
  ];
  const anchors = { ...kitchen.anchors, ...stairs.anchors, ...wheel.anchors };
  let live = null;

  function liveSet() {
    const p = ctx.camera.position;
    let best = null, bd = 60;
    for (const S of SETLIST) {
      const d = Math.hypot(p.x - S.o[0], p.z - S.o[2]);
      if (d < bd && Math.abs(p.y - S.o[1] - 15) < 60) { bd = d; best = S; }
    }
    return best;
  }

  // light tables, in world coordinates. lamps: [{ p, c, r }], flash: { list: [{ p, d, r }], c }, amb, fill, fillDir, haze
  function tableFor(name, t) {
    const fl = lightningAt(t);
    if (name === 'kitchen') {
      const o = SETS.kitchen, k = lampK(t);
      const fp = [o[0] + KITCHEN_FLAME[0], o[1] + KITCHEN_FLAME[1], o[2] + KITCHEN_FLAME[2]];
      return {
        amb: C('#0d151d'), fill: C('#22344a'), fillDir: [0.25, 0.3, -1],
        lamps: [{ p: fp, c: C('#ffc890', 1.2 * k), r: 3.3 },
          // the window itself: cold storm light off the sky, on the reveal, the sill and her face
          { p: anchors.kitchenWindow.map((v, i) => v + [0, 0.25, 0.02][i]), c: C('#6a86a8', 0.55 + 1.4 * fl), r: 1.7 }],
        flash: { c: C('#c8d8ff', 1.1 * fl), list: [{ p: anchors.kitchenWindow.map((v, i) => v + [0, 0.1, -0.3][i]), d: [0, 0, 1], r: 6.5 }] },
        haze: { c: C('#04070a'), k: 0.03 },
      };
    }
    if (name === 'stairs') return stairs.table(t, fl, lampK);
    if (name === 'wheelhouse') return wheel.table(t, fl);
    return null;
  }

  function applyTable(T) {
    SL.uAmb.value.setRGB(...T.amb);
    SL.uFillC.value.setRGB(...T.fill);
    SL.uFillDir.value.set(...T.fillDir).normalize();
    const n = Math.min(MAX_LAMPS, T.lamps.length);
    for (let i = 0; i < n; i++) { const L = T.lamps[i]; SL.uLp.value[i].set(L.p[0], L.p[1], L.p[2], L.r); SL.uLc.value[i].set(...L.c); }
    SL.uLN.value = n;
    const f = T.flash, m = Math.min(MAX_FLASH, f.list.length);
    for (let i = 0; i < m; i++) { const F = f.list[i]; SL.uFl.value[i].set(F.p[0], F.p[1], F.p[2], F.r); SL.uFlD.value[i].set(...F.d).normalize(); }
    SL.uFlN.value = m;
    SL.uFlC.value.set(...f.c);
    SL.uHazeC.value.setRGB(...T.haze.c);
    SL.uHazeK.value = T.haze.k;
  }

  const api = {
    kitchen, stairs, wheel,
    anchors,
    // anchors that move (wheel grips) are refreshed in update(); the others are fixed
    anchor(name, out = new THREE.Vector3()) { const a = wheel.anchors[name] ?? anchors[name]; if (!a) return null; return out.set(a[0], a[1], a[2]); },
    stairPoint: stairs.stairPoint,
    stairGround: stairs.stairGround,
    STAIR: stairs.STAIR,
    boatMotion: wheel.boatMotion,
    wheelAngle: wheel.wheelAngle,
    lampK,
    // the live set's light table in world coordinates (for Folk's character rig): call with st
    light(st) { const S = liveSet(); return S ? { set: S.name, ...tableFor(S.name, st.t) } : null; },
    lightFor(name, t) { return tableFor(name, t); },
    update(st) {
      const t = st.t;
      live = liveSet();
      for (const S of SETLIST) S.s.root.visible = S === live;
      if (!live) return;
      applyTable(tableFor(live.name, t));
      const fl = lightningAt(t);
      if (live.name === 'kitchen') {
        const g = kitchen.glassMat.uniforms;
        g.uFlash.value = fl;
        g.uStorm.value = storm(t);
        g.uTower.value.w = t < CUES.bolt ? beamOn(t) : 0;
        // the tower is framed in the window from wherever the camera stands (a painted backdrop, centred on the aim point)
        const cp = ctx.camera.position, wc = anchors.kitchenWindow;
        const ndc = TOWER_NDC[st.sid];
        const D = g.uTower.value.x = ndc?.[2] ?? 58;
        if (ndc) {
          // place the lantern where this shot wants it on screen (a painted backdrop, composed per shot)
          _v.set(ndc[0], ndc[1], 0.5).unproject(ctx.camera).sub(cp).normalize();
          const k = (wc[2] - D - cp.z) / Math.min(-1e-3, _v.z);
          g.uTower.value.y = cp.x + _v.x * k - wc[0];
          g.uTower.value.z = cp.y + _v.y * k - wc[1] - 32.0;
        } else {
          const cz = Math.max(0.3, cp.z - wc[2]), cx = cp.x - wc[0], ax = kitchen.towerAim;
          g.uTower.value.y = ax + (ax - cx) * D / cz;
          const ay = kitchen.towerAimY, cy = cp.y - wc[1];
          g.uTower.value.z = ay + (ay - cy) * D / cz - 32.0;
        }
        g.uBroken.value = t > CUES.bolt ? 1 : 0;
        g.uLamp.value.set(...anchors.kitchenLamp);
        const k = lampK(t);
        g.uLampC.value.setRGB(1.0 * k, 0.6 * k, 0.28 * k);
        kitchen.flame.material.uniforms.uFT.value = t;
        kitchen.curtainAt(t);
        kitchen.flame.material.uniforms.uK.value = 1.7 * k;
        kitchen.chimMat.uniforms.uK.value = 1.2 * k;
      } else if (live.name === 'stairs') stairs.update(st, fl);
      else if (live.name === 'wheelhouse') wheel.update(st, fl);
    },
  };
  ctx.sets = api;
  return api;
}
