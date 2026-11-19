import * as THREE from 'three';
import { FL } from './folk-mat.js';
import { PL } from './folk-place.js';
import { noise1, smooth, invLerp, lerp, clamp, onThrees } from './util.js';
import { CUES } from './shots.js';
import { beamOn, beamAz, lightningAt, storm, LENS } from './layout.js';

// One light table per location, applied to every folk surface. Every value has a cause in frame:
// the green compass lamp, the kitchen's oil lamp and the cold window, Grandpa's storm lantern on the stair floor,
// the kerosene mantle inside the lens, the beam sweeping past, lightning, the fishers' lanterns, the dawn.
const C = (h, k = 1) => { const c = new THREE.Color(h); return [c.r * k, c.g * k, c.b * k]; };
const set = (u, v) => u.value.setRGB(v[0], v[1], v[2]);
const lerp3 = (a, b, u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
const add3 = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const _v = new THREE.Vector3(), _m = new THREE.Matrix3();

function apply(o) {
  set(FL.uFKey, o.key); set(FL.uFShade, o.shade);
  set(FL.uFBounce, o.bounce ?? [0, 0, 0]); FL.uFBounceDir.value.set(...(o.bounceDir ?? [0, -1, 0])).normalize();
  set(FL.uFRim, o.rim ?? [0, 0, 0]); FL.uFRimDir.value.set(...(o.rimDir ?? [0, 1, -1])).normalize();
  FL.uFP0.value.set(...(o.p0 ?? [0, -9999, 0])); set(FL.uFP0C, o.p0c ?? [0, 0, 0]);
  FL.uFP1.value.set(...(o.p1 ?? [0, -9999, 0])); set(FL.uFP1C, o.p1c ?? [0, 0, 0]);
  FL.uFPR.value.set(o.r0 ?? 0.6, o.r1 ?? 0.6);
  set(FL.uFSet, o.set ?? [1, 1, 1]);
  FL.uFFace.value = o.face ? o.face.k : 0;
  if (o.face) { set(FL.uFFaceKey, o.face.key); set(FL.uFFaceShade, o.face.shade); FL.uFFaceV.value.set(...(o.face.v ?? [-0.6, 0.55, 0.55])); }
  FL.uFSeam.value.w = 0;
  FL.uFWet.value = o.wet ?? 0;
  FL.uFWar.value = o.war ?? 1;
}
// a world-space light direction as the face key's view-space vector (the face key is a camera-relative cheat)
function viewDir(camera, d, bias = [0, 0.15, 0.25]) {
  _v.set(d[0], d[1], d[2]).normalize();
  _m.setFromMatrix4(camera.matrixWorldInverse);
  _v.applyMatrix3(_m).normalize();
  return [_v.x + bias[0], _v.y + bias[1], _v.z + bias[2]];
}
const LAMP_SHOTS = new Set(['s07', 's08', 's09', 's12', 's13', 's17', 's18', 's22', 's25', 's28']);

// the lens throws turning spokes of light: how much of a spoke falls on a point at azimuth a (from the lens)
function spokeAt(t, p) {
  const az = Math.atan2(p[0] - LENS.center[0], -(p[2] - LENS.center[2]));
  const d = Math.cos((az - beamAz(t)) * 4);       // 8 panels -> 4 bright spokes per half-turn
  return smooth(invLerp(0.82, 0.97, d));
}

export function lightFor(st, ctx, focus) {
  const t = st.t, sid = st.sid, cam = ctx.camera, fl = lightningAt(t);
  const flashK = C('#dfe8ff', 1.6 * fl);
  const flash = (o) => { if (fl > 0.01) { o.key = add3(o.key, flashK, 1); if (o.face) o.face.key = add3(o.face.key, flashK, 0.6); o.rim = add3(o.rim ?? [0, 0, 0], flashK, 0.8); } return o; };
  const head = focus ?? [0, 0, 0];
  if (sid === 'lineup') {
    apply({ face: { k: 0.85, key: C('#fff4ea', 1.1), shade: C('#8890b8', 0.95), v: [-0.6, 0.5, 0.6] }, key: C('#fff4ea', 1.05), shade: C('#6a74a0', 1.0), rim: C('#ffffff', 0.6), rimDir: [0.5, 0.6, -0.6], wet: 0 });
    return;
  }

  if (sid === 's03' || sid === 's11') {
    // wheelhouse: the green compass lamp from below the wheel, cold storm through the glass behind
    const fk = 0.9 + 0.1 * noise1(onThrees(t) * 3, 5);
    const comp = PL.compassLamp ?? (PL.wheel ? [PL.wheel[0], PL.wheel[1] - 0.25, PL.wheel[2]] : head);
    const toL = [comp[0] - head[0], comp[1] - head[1], comp[2] - head[2]];
    apply(flash({ face: { k: 0.85, key: C('#e2f2e6', 1.05 * fk), shade: C('#4a5a74', 1.0), v: viewDir(cam, toL, [0, 0, 0.3]) },
      key: C('#a8c4bc', 0.65), shade: C('#2c3c52', 1.0), bounce: C('#3fae7a', 0.25 * fk), bounceDir: [0, -1, 0.3], rim: C('#a8c4e8', 0.75), rimDir: [0, 0.4, 1],
      p0: comp, p0c: C('#4ad890', 0.45 * fk), r0: 0.8, wet: 0.65 }));
    return;
  }
  if (sid === 's04') {
    // kitchen: cold window light on her face, the oil lamp low and warm behind her
    const win = PL.kitchenWindow ?? head;
    const toW = [win[0] - head[0], win[1] + 0.4 - head[1], win[2] - head[2]];
    const lamp = PL.kitchen ? [PL.kitchen.o[0] - PL.kitchen.f[0] * 1.4, PL.kitchen.o[1] + 0.95, PL.kitchen.o[2] - PL.kitchen.f[2] * 1.4] : head;
    apply(flash({ face: { k: 0.82, key: C('#e4eaf4', 1.05), shade: C('#5c6684', 0.95), v: viewDir(cam, toW) },
      key: C('#c4cad8', 0.78), shade: C('#3c4262', 1.0), bounce: C('#ffa860', 0.25), bounceDir: [0, 0, 1], rim: C('#ffc888', 0.75), rimDir: [-PL.kitchen.f[0], 0.3, -PL.kitchen.f[2]],
      p0: lamp, p0c: C('#ffb060', 0.5), r0: 1.6, wet: 0.05 }));
    return;
  }
  if (sid === 's05') {
    // stair foot: Grandpa's storm lantern on the floor, warm from below; the stair window and the 8.6 lightning cold from above
    const lan = st.folkLantern ?? head;
    const toL = [lan[0] - head[0], lan[1] - head[1], lan[2] - head[2]];
    const fk = 0.92 + 0.08 * noise1(onThrees(t) * 5, 2);
    apply(flash({ face: { k: 0.85, key: C('#ffdcb0', 1.05 * fk), shade: C('#40507a', 0.95), v: viewDir(cam, toL, [0, 0.05, 0.3]) },
      key: C('#ffc890', 0.55 * fk), shade: C('#3a4268', 1.0), bounce: C('#ff9c50', 0.35 * fk), bounceDir: [0, -1, 0], rim: C('#8ca8d8', 0.85), rimDir: [0.3, 1, -0.5],
      p0: lan, p0c: C('#ffae5a', 1.0 * fk), r0: 1.3, wet: 0.35 }));
    return;
  }
  if (sid === 's06') {
    apply(flash({ key: C('#9cb0d8', 0.8), shade: C('#384870', 1.0), rim: C('#c8d8f8', 0.6), rimDir: [0, 1, 0], wet: 0.4 }));
    return;
  }
  if (LAMP_SHOTS.has(sid) || (t > 13 && t < 73 && sid !== 's24' && sid !== 's23')) {
    const on = beamOn(t), dawn = 1 - storm(t);
    const gutter = t > CUES.sprayHit && t < CUES.flameSave + 0.4 ? 0.45 + 0.55 * Math.abs(Math.sin(t * 31)) : 1;
    const flame = on * gutter * (0.94 + 0.06 * noise1(onThrees(t) * 7, 4));
    const burner = PL.burner ?? head;
    const toB = [burner[0] - head[0], burner[1] - head[1], burner[2] - head[2]];
    const sp = spokeAt(t, head) * on;
    const coldFace = { k: 0.75, key: C('#c4d4ee', 0.95), shade: C('#3c4a72', 0.95), v: [0.55, 0.5, 0.55] };
    const vb = viewDir(cam, toB, [0, 0.1, 0.25]);
    // the face key is a cel cheat: from the burner when it is in front of the face (as the camera sees it), else from front-left-top
    const fv = sid === 's08' || sid === 's22' ? vb : [lerp(-0.5, vb[0], clamp(vb[2], 0, 1) * 0.5), 0.5, 0.65];
    const warmFace = { k: 0.86, key: lerp3(C('#ffe6c4', 1.05), C('#fff2dc', 1.15), sp), shade: lerp3(C('#4a5680', 0.95), C('#7a86a8', 1.0), dawn), v: fv };
    const face = { k: lerp(coldFace.k, warmFace.k, on), key: lerp3(coldFace.key, warmFace.key, flame), shade: lerp3(coldFace.shade, warmFace.shade, on), v: on > 0.5 ? warmFace.v : coldFace.v };
    apply(flash({ face,
      key: lerp3(C('#7e96c4', 0.6), lerp3(C('#ffd8a0', 0.85), C('#d8e4f8', 0.9), dawn * 0.6), on * flame).map((x, i) => x + C('#fff0d0', 0.5 * sp)[i]),
      shade: lerp3(C('#323e68', 1.0), C('#4c5a88', 1.0), dawn), bounce: C('#ffb060', 0.3 * flame), bounceDir: [toB[0], toB[1], toB[2]],
      rim: lerp3(C('#8ca8e0', 1.0), C('#ffd8a8', 0.9), on * 0.5), rimDir: [0.2, 0.7, -0.6],
      p0: burner, p0c: C('#ffc070', 1.6 * flame), r0: 2.2,
      wet: lerp(0.85, 0.35, dawn) }));
    return;
  }
  if (sid === 's23' || sid === 's24') {
    // the pier: cold storm, the fishers' lanterns warm and low, the beam passing over (warm wash when it points at you)
    const dl = [LENS.center[0] - head[0], LENS.center[1] - head[1], LENS.center[2] - head[2]];
    const az = Math.atan2(-dl[0], dl[2]);
    let d = Math.abs(((beamAz(t) - az) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
    const pass = smooth(invLerp(0.5, 0.05, d)) * beamOn(t);
    apply(flash({ face: { k: 0.82, key: lerp3(C('#c8d6ee', 1.0), C('#fff0d4', 1.25), pass), shade: C('#3a4870', 0.95), v: pass > 0.3 ? viewDir(cam, dl) : [-0.5, 0.45, 0.6] },
      key: lerp3(C('#9aaccc', 0.85), C('#ffe4b8', 1.3), pass), shade: C('#3a4670', 1.0), bounce: C('#ffa860', 0.2), bounceDir: [0, -1, 0], rim: lerp3(C('#9cb4e0', 0.9), C('#ffe0b0', 1.2), pass), rimDir: [dl[0], dl[1], dl[2]],
      p0: st.folkLanternP ?? [0, -999, 0], p0c: C('#ffb060', 0.9), r0: 1.4, wet: 1.0 }));
    return;
  }
  // anywhere else (boat exteriors at sea)
  apply(flash({ key: C('#7a90b8', 0.75), shade: C('#323e66', 1.0), rim: C('#9cb4e0', 0.8), rimDir: [0, 1, 0.5], wet: 1.0 }));
}
