import * as THREE from 'three';
import { FL } from './folk-mat.js';
import { noise1, smooth, invLerp, lerp, onThrees } from './util.js';
import { CUES } from './shots.js';
import { irisHeat, ROOF, eruptU } from './layout.js';

// One light table per shot for the folk materials. Every value has a visible cause: the seed, the hand lamp, the iris,
// the moon, muzzle flashes (those come through addWarLight), the fire wall, the searchlights.
const C = (h, k = 1) => { const c = new THREE.Color(h); return [c.r * k, c.g * k, c.b * k]; };
const set = (u, v) => u.value.setRGB(v[0], v[1], v[2]);
const L3 = (a, b, u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
const _v = new THREE.Vector3();

function apply(o) {
  set(FL.uFKey, o.key); set(FL.uFShade, o.shade);
  set(FL.uFBounce, o.bounce ?? [0, 0, 0]); FL.uFBounceDir.value.set(...(o.bounceDir ?? [0, -1, 0])).normalize();
  set(FL.uFRim, o.rim ?? [0, 0, 0]); FL.uFRimDir.value.set(...(o.rimDir ?? [0, 1, -1])).normalize();
  FL.uFP0.value.set(...(o.p0 ?? [0, 0, 0])); set(FL.uFP0C, o.p0c ?? [0, 0, 0]);
  FL.uFP1.value.set(...(o.p1 ?? [0, 0, 0])); set(FL.uFP1C, o.p1c ?? [0, 0, 0]);
  FL.uFPR.value.set(o.r0 ?? 0.6, o.r1 ?? 0.6);
  set(FL.uFSet, o.set ?? [1, 1, 1]);
  FL.uFFace.value = o.face ? o.face.k : 0;
  if (o.face) { set(FL.uFFaceKey, o.face.key); set(FL.uFFaceShade, o.face.shade); FL.uFFaceV.value.set(...(o.face.v ?? [-0.6, 0.55, 0.55])); }
  FL.uFSeam.value.w = 0;
}

const MOON = { key: C('#d6f2e4', 1.0), shade: C('#2c5f66', 0.9), rim: C('#e6fff2', 0.9), rimDir: [-0.6, 0.5, 0.4], bounce: C('#3f8a84', 0.25), bounceDir: [0, -1, 0] };
const IRIS_C = (h) => (h <= 1 ? C('#ffe0a0', h) : L3(C('#ffc860'), C('#fff6e8', 1.3), h - 1));

export function lightFor(st, ctx, seedPos, seedK) {
  const t = st.t, sid = st.sid, lt = st.lt;
  if (st.folktest) { apply({ ...MOON, key: C('#e6f4ec', 1.05), shade: C('#4a7c80', 0.95) }); return; }
  const iris = ctx.mech?.anchor?.('iris', _v) ? [_v.x, _v.y, _v.z] : [ROOF.lanternKneel[0], ROOF.lanternKneel[1] + 2.2, ROOF.lanternKneel[2] - 1.5];
  const ih = irisHeat(t), ic = IRIS_C(ih);
  const sp = [seedPos.x, seedPos.y, seedPos.z];
  const fl = 1 + 0.1 * noise1(onThrees(t) * 7, 3);
  if (sid === 's01' || sid === 's01b' || sid === 's01c') {
    // lit from below by the blazing seed; the moon gives a cool rim
    const k = 1 + 0.25 * noise1(onThrees(t) * 9, 1);
    apply({ face: { k: 0.55, key: C('#fff6e0', 1.12), shade: C('#6fa3a6', 0.95), v: [0.1, -0.75, 0.6] }, key: C('#fff0d0', 1.05 * k), shade: C('#3a7078', 0.95), rim: C('#d8fff0', 1.0), rimDir: [-0.5, 0.6, -0.3],
      p0: sp, p0c: C('#ffe2a0', 0.9 * k), r0: 0.45 });
    return;
  }
  if (st.set === 'vault' || sid === 's07') {
    const lamp = st.lampP ?? [-90, 63, 0], lk = st.lampK ?? 0;
    apply({ key: C('#ffe6c0', 0.6 + 0.4 * lk), shade: C('#1f4a50', 0.95), rim: L3(C('#7fb8b0', 0.6), [ic[0] * 1.5, ic[1] * 1.5, ic[2] * 1.5], Math.min(1, ih)), rimDir: [-1, 0.3, 0.1], bounce: C('#2f6a66', 0.3), bounceDir: [0, -1, 0],
      p0: lamp, p0c: C('#ffc070', 1.5 * lk), r0: 1.6, p1: iris, p1c: [ic[0] * 0.8, ic[1] * 0.8, ic[2] * 0.8], r1: 9 });
    return;
  }
  if (sid === 's08' || sid === 's09' || sid === 's10' || sid === 's11') {
    apply({ ...MOON, key: C('#bfe4d6', 0.7), shade: C('#173d44', 0.85), p0: sp, p0c: C('#ffcf6a', 1.5 * seedK), r0: 0.8 });
    return;
  }
  if (sid === 's12' || sid === 's13' || sid === 's14' || sid === 's15') {
    // moon from behind-left, the iris in front of her as a warm practical that grows as the head comes down
    const near = sid === 's12' ? smooth(invLerp(CUES.headRise, CUES.headRise + 0.8, t)) * 0.5 : sid === 's13' ? lerp(0.5, 1, smooth(invLerp(28.9, 30.6, t))) : 1;
    const hit = sid === 's15' ? Math.exp(-Math.max(0, t - CUES.shell1Hit) * 5) * (t > CUES.shell1Hit ? 1 : 0) : 0;
    apply({ ...MOON, face: sid === 's14' ? { k: 0.8, key: L3(C('#fff2d8', 1.08), C('#fff6e0', 1.16), smooth(lt / 2)), shade: C('#78a8aa', 0.98), v: [0.55, 0.25, 0.75] } : null,
      key: L3(C('#cfeee0', 0.85), C('#ffe8c0', 1.0), near * 0.8), shade: C('#2a5c64', 0.92),
      p0: iris, p0c: [ic[0] * 0.9 * near + 3 * hit, ic[1] * 0.9 * near + 1.6 * hit, ic[2] * 0.9 * near + 0.6 * hit], r0: 3.5, p1: sp, p1c: C('#ffe2a0', 0.5 * seedK), r1: 0.4 });
    return;
  }
  if (sid === 's18') {
    apply({ key: C('#40160a', 0.5), shade: C('#140806', 0.6), rim: C('#ff8a3a', 1.6 * fl), rimDir: [0.3, 0.2, 1], bounce: C('#ff5a20', 0.25), bounceDir: [0, -0.3, 1] });
    return;
  }
  if (sid === 's21' || sid === 's25' || sid === 's29') {
    const dawn = sid === 's29' ? 1 : 0;
    apply({ key: L3(C('#ffd4a8', 1.0), C('#f6e8d4', 1.0), dawn), shade: L3(C('#46585e', 0.95), C('#55777e', 1.0), dawn), rim: C('#ff9a50', 1.2 * fl), rimDir: [0, -0.2, -1], bounce: C('#ff7a3a', 0.45 * fl), bounceDir: [0, -1, -0.3] });
    return;
  }
  if (t >= CUES.erupt - 0.1) {
    // roof after the fire: vermilion up-light from the burning crown, the iris gold (gentle) or white-hot (angry)
    const cu = sid === 's24' ? { k: 0.7, key: C('#fff0e0', 1.1), shade: C('#9c8a86', 0.95), v: [-0.6, 0.35, 0.7] } : sid === 's26' || sid === 's27' ? { k: 0.45, key: C('#ffe8d0', 1.08), shade: C('#807478', 0.95), v: [0.5, -0.4, 0.7] } : null;
    apply({ face: cu, key: C('#ffd0a8', 0.95 * fl), shade: C('#4a5a62', 0.95), rim: C('#ff9a50', 1.2 * fl), rimDir: [0.4, -0.2, 1], bounce: C('#ff7a3a', 0.4 * fl), bounceDir: [0, -1, 0.4],
      p0: iris, p0c: [ic[0] * 0.9, ic[1] * 0.9, ic[2] * 0.9], r0: 4.5, p1: sp, p1c: C('#ffe2a0', 0.4 * seedK), r1: 0.4 });
    return;
  }
  apply({ ...MOON, p0: sp, p0c: C('#ffcf6a', 1.2 * seedK), r0: 0.5 });
}
