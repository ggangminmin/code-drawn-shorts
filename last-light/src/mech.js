import * as THREE from 'three';
import { mechMaterial, ML, GL } from './mech-mat.js';
import { buildLamp, TRAIN, LENS_Y, HATCH, RATIO, STEP, PAWL } from './mech-lamp.js';
import { buildBoat, BOATS } from './mech-boats.js';
import { buildSpray, buildFoam } from './mech-spray.js';
import { buildGlows } from './mech-glow.js';
import { LAMPROOM, LENS, boatPath, lensSpin, beamAz, beamOn, BEAM, lightningAt, storm, swellFront, swellHeight, MOUTH } from './layout.js';
import { CUES, SHOTS, DURATION } from './shots.js';
import { addWarLight } from './glsl.js';
import { clamp, smooth, invLerp, noise1, lerp, onThrees } from './util.js';

// MECH (LAST LIGHT): the lantern room + Fresnel lens machine on the tower, and the six fishing boats.
// API (CONTRACT): lens, boats[i], anchor(name, vec3), crankAngle(t).

const _v = new THREE.Vector3();
const shot = (id) => SHOTS.find((s) => s.id === id);

// ---- the crank: geared to the lens (RATIO crank turns per lens turn). At dawn (from s25) a dog clutch lets the crank
// rest while the lens keeps turning, so Suri can sleep against a still handle.
const CRANK_STOP = shot('s25').start;            // 59.5
const CRANK_EASE = 0.9;
function crankTime(t) {
  const ta = CRANK_STOP - CRANK_EASE;
  if (t <= ta) return t;
  const d = Math.min(t, CRANK_STOP) - ta;
  return ta + d - (d * d) / (2 * CRANK_EASE);
}
export function crankAngle(t) { return -RATIO * lensSpin(crankTime(t)) + CRANK_PHASE; }
const CRANK_PHASE = 0.35;

// ---- fallback sea when Sea is not ready: the great swell + two wave trains, calm in the basin
function fallbackHeight(x, z, t) {
  const d = z - swellFront(t);
  const sw = swellHeight(t) * (d < 0 ? Math.exp(-((d / 170) ** 2)) : Math.exp(-((d / 55) ** 2)));
  const basin = z > MOUTH.center[2] + 10 ? 0.15 : 1;
  const w = 0.9 * Math.sin(x * 0.07 + t * 0.7) * Math.cos(z * 0.055 - t * 0.6) + 0.6 * Math.sin((x + z) * 0.12 + t * 1.1);
  return sw + w * basin * storm(t) + w * basin * 0.2;
}

export async function createMech(ctx) {
  const { scene } = ctx;
  const mat = mechMaterial({});
  const lampMat = mechMaterial({ litGain: 1.35 });

  // ------------------------------------------------ lantern room
  const lamp = buildLamp(ctx, lampMat);
  scene.add(lamp.root);
  const J = lamp.J;

  // ------------------------------------------------ boats
  const heightAt = (x, z, t) => {
    const f = ctx.sea && ctx.sea.heightAt;
    if (f) { const h = f(x, z, t); if (Number.isFinite(h)) return h; }
    return fallbackHeight(x, z, t);
  };
  const boats = [];
  for (let i = 0; i < 6; i++) {
    const B = buildBoat(i, mat);
    scene.add(B.root);
    B.spray = buildSpray(i, B);
    B.body.add(B.spray.mesh);
    B.foam = buildFoam(i, B, scene);
    ctx.colliders.push({ name: 'boatDeck' + i, dept: 'mech', obj: B.deckMesh, kind: 'solid' });
    boats.push(B);
  }
  // bake each boat's motion on a fixed grid (pure in t): smoothed yaw (no pops), heave / pitch / roll that ride the sea with lag
  const HZ = 30, N = Math.ceil((DURATION + 1) * HZ) + 2;
  for (let i = 0; i < 6; i++) {
    const B = boats[i], L = B.b.L, W = B.b.B;
    const raw = { yaw: new Float32Array(N), h: new Float32Array(N), p: new Float32Array(N), r: new Float32Array(N), x: new Float32Array(N), z: new Float32Array(N) };
    let prevYaw = null;
    for (let s = 0; s < N; s++) {
      const t = s / HZ, P = boatPath(i, t);
      let y = P.yaw;
      if (prevYaw !== null) { while (y - prevYaw > Math.PI) y -= Math.PI * 2; while (y - prevYaw < -Math.PI) y += Math.PI * 2; }
      prevYaw = y;
      raw.yaw[s] = y; raw.x[s] = P.x; raw.z[s] = P.z;
    }
    // yaw spring (slow, heavy boat)
    const spring = (src, freq, damp, out) => {
      const w = 2 * Math.PI * freq, sub = 8, dt = 1 / (HZ * sub);
      let x = src[0], v = 0;
      for (let s = 0; s < N; s++) {
        out[s] = x;
        for (let k = 0; k < sub; k++) {
          const f = s + k / sub, a = src[Math.min(N - 1, Math.floor(f))], b = src[Math.min(N - 1, Math.floor(f) + 1)];
          const tgt = a + (b - a) * (f - Math.floor(f));
          v += (w * w * (tgt - x) - 2 * damp * w * v) * dt; x += v * dt;
        }
      }
    };
    const yawS = new Float32Array(N); spring(raw.yaw, 0.55, 0.85, yawS);
    for (let s = 0; s < N; s++) {
      const t = s / HZ, x = raw.x[s], z = raw.z[s], yv = yawS[s];
      const fx = Math.sin(yv), fz = Math.cos(yv), px = fz, pz = -fx;        // forward and port (+X local)
      const hb = heightAt(x + fx * L * 0.42, z + fz * L * 0.42, t), hs = heightAt(x - fx * L * 0.42, z - fz * L * 0.42, t);
      const hp = heightAt(x + px * W * 0.5, z + pz * W * 0.5, t), hst = heightAt(x - px * W * 0.5, z - pz * W * 0.5, t);
      raw.h[s] = (hb + hs + hp + hst) * 0.25;
      raw.p[s] = Math.atan2(hb - hs, L * 0.84);
      raw.r[s] = Math.atan2(hp - hst, W);
    }
    const hS = new Float32Array(N), pS = new Float32Array(N), rS = new Float32Array(N);
    spring(raw.h, 1.1, 0.55, hS); spring(raw.p, 1.0, 0.45, pS); spring(raw.r, 0.8, 0.3, rS);
    // speed (for spray), from the raw path
    const spd = new Float32Array(N);
    for (let s = 0; s < N; s++) { const a = Math.max(0, s - 1), b = Math.min(N - 1, s + 1); spd[s] = Math.hypot(raw.x[b] - raw.x[a], raw.z[b] - raw.z[a]) * HZ / (b - a); }
    // lantern pendulum: chases the boat's sideways and fore-aft acceleration
    const lzS = new Float32Array(N), lxS = new Float32Array(N), tz = new Float32Array(N), tx = new Float32Array(N);
    for (let s = 0; s < N; s++) {
      const a = Math.max(0, s - 2), b = Math.min(N - 1, s + 2);
      tz[s] = -rS[s] * 1.4 - (yawS[b] - yawS[a]) * HZ / (b - a) * 0.5;
      tx[s] = pS[s] * 1.2 + (spd[b] - spd[a]) * HZ / (b - a) * 0.02;
    }
    spring(tz, 0.75, 0.12, lzS); spring(tx, 0.75, 0.12, lxS);
    B.bake = { x: raw.x, z: raw.z, yaw: yawS, h: hS, p: pS, r: rS, spd, lz: lzS, lx: lxS };
  }
  const LAG_W = [0.4, 0.3, 0.2, 0.1];
  const glows = buildGlows(ctx, 6);
  const sample = (arr, t) => { const f = clamp(t * HZ, 0, N - 1.001), i = Math.floor(f); return arr[i] + (arr[i + 1] - arr[i]) * (f - i); };

  // ------------------------------------------------ anchors
  const anchors = {
    crank: () => J.crank.localToWorld(_v.set(TRAIN.crankR, 0, TRAIN.gripZ - TRAIN.A.at[2])),
    crankKeyhole: () => J.root.localToWorld(_v.set(...KEYHOLE)),
    burner: () => _v.set(...LENS.center),
    lensFocus: () => _v.set(...LENS.center),
    lampFloor: () => J.root.localToWorld(_v.set(0.15, 0, 2.05)),
    burnerStand: () => J.step.localToWorld(_v.set(0, STEP.top, -0.05)),
    rod: () => J.root.localToWorld(_v.set(0, 8.82, 0)),
    lampEntry: () => J.root.localToWorld(_v.set(HATCH.x, 0, HATCH.z)),
  };
  function anchor(name, out = new THREE.Vector3()) {
    const m = /^boat(Lantern|Deck|Wheel|Bow)(\d)$/.exec(name);
    if (m) {
      const B = boats[+m[2]];
      B.root.updateMatrixWorld(true);
      if (m[1] === 'Lantern') return out.copy(B.J.lantern.localToWorld(_v.copy(B.J.lanternLocal)));
      const a = B.anchors[m[1].toLowerCase()];
      return out.copy(B.body.localToWorld(_v.set(...a)));
    }
    const f = anchors[name];
    if (!f) return out.set(0, 0, 0);
    J.root.updateMatrixWorld(true);
    return out.copy(f());
  }

  const amber = [1.3, 1.02, 0.7];
  const lensWorld = new THREE.Vector3(...LENS.center);
  let lastT = -1;

  function update(st) {
    const t = st.t;
    lastT = t;
    // ---- lens and gear train
    const spin = lensSpin(t);
    J.lens.rotation.y = -spin;
    // tooth phases solved so the teeth really mesh (bull/pinion C, then B/A); see MESH_C / MESH_A below
    const thC = spin * (TRAIN.bull.N / TRAIN.C.N);
    // the train shudders after the notch (the lens itself follows the shared clock exactly)
    const an = t - CUES.notch, shud = an > 0 ? Math.exp(-an * 7) * Math.sin(an * 55) * 0.05 : 0;
    J.gearC.rotation.y = thC + MESH_C + shud;
    J.gearB.rotation.z = thC + 0.1 + shud;
    J.gearA.rotation.z = -(thC + 0.1) * (TRAIN.B.N / TRAIN.A.N) + MESH_A;
    J.sprocket.rotation.z = 0.4;
    // pawl: rides up each tooth flank, snaps down into the next gap (one click per tooth)
    const g = (((PAWL.psi - spin) * 52) / (Math.PI * 2)) % 1, gg = g < 0 ? g + 1 : g;
    const lift = gg > 0.5 ? smooth(invLerp(0.55, 0.97, gg)) : 1 - smooth(invLerp(0.0, 0.05, gg));
    J.pawl.rotation.y = -lift * 0.07;
    // flakes: shaken loose from the mesh point and the pawl at the notch, falling in drawings on threes
    const fa = onThrees(t) - CUES.notch;
    for (const f of J.flakeList) {
      const tt = fa - f.dt;
      f.j.visible = tt > 0 && tt < 1.4;
      if (!f.j.visible) continue;
      const src = f.src ? [0.5, 1.2, 0.83] : [Math.cos(PAWL.psi) * 1.0, 1.2, Math.sin(PAWL.psi) * 1.0];
      const y = src[1] + f.vy * tt - 4.9 * tt * tt;
      f.j.position.set(src[0] + Math.cos(f.ang) * f.sp * tt, Math.max(0.005, y), src[2] + Math.sin(f.ang) * f.sp * tt);
      f.j.rotation.set(f.spin * tt, f.spin * 0.7 * tt, 0);
    }
    J.crank.rotation.z = crankAngle(t);
    // chain sways in the wind that blows through the broken panes
    const gust = t > CUES.bolt ? 1 : 0.2;
    J.chain.rotation.z = (0.05 * Math.sin(t * 2.3) + 0.04 * noise1(t * 1.3, 5)) * gust;
    J.chain.rotation.x = (0.04 * Math.sin(t * 1.7 + 1) + 0.03 * noise1(t * 1.1, 9)) * gust;
    // hatch: closed until she bursts in at the start of s07, flung open with a bounce
    const s07 = shot('s07').start;
    const o = t < s07 ? 0 : 1;
    const u = clamp((t - s07 - 0.08) / 0.25);
    const bounce = t > s07 + 0.33 ? Math.exp(-(t - s07 - 0.33) * 5) * Math.sin((t - s07 - 0.33) * 18) * 0.12 : 0;
    J.hatch.rotation.z = o ? lerp(-Math.PI / 2, 0.22, smooth(u)) + bounce : -Math.PI / 2;
    J.shards.visible = t >= CUES.bolt;
    ML.uPuddle.value = smooth(invLerp(CUES.bolt, CUES.bolt + 8, t)) * (0.4 + 0.6 * storm(t));
    // lens door: she swings it open at the start of s08 to reach the mantle, and shuts it before she goes to the crank
    const s08 = shot('s08').start;
    const dOpen = smooth(invLerp(s08 + 0.05, s08 + 0.4, t)) * (1 - smooth(invLerp(CUES.pushStart - 0.65, CUES.pushStart - 0.3, t)));
    J.door.rotation.y = -1.75 * dOpen;
    lamp.glass.doorPivot.rotation.y = J.door.rotation.y;
    GL.uBroken.value = t >= CUES.bolt ? 1 : 0;

    // ---- lamp light, lightning, wetness
    const sk0 = storm(t), lk = beamOn(t) * (0.4 + 0.6 * sk0);
    const flick = t > CUES.mantleCatch && t < CUES.mantleCatch + 1.2 ? 0.85 + 0.15 * Math.sin(t * 37) : 1;
    ML.uLampC.value.set(lerp(1.2, amber[0], sk0) * lk * flick, lerp(1.1, amber[1], sk0) * lk * flick, lerp(0.92, amber[2], sk0) * lk * flick);
    ML.uLampP.value.set(...LENS.center);
    GL.uLampK.value = lk;
    const fl = lightningAt(t);
    const flM = st.look?.flash ?? 1;
    ML.uFlash.value = fl * flM * 0.6; GL.uFlashG.value = fl * flM;
    ML.uWetK.value = 0.55 + 0.45 * storm(t);
    const sk = storm(t);
    ML.uRoomFill.value.set(lerp(0.55, 0.26, sk), lerp(0.55, 0.34, sk), lerp(0.6, 0.44, sk)).multiplyScalar(1 + fl * flM * 2.5);
    // beam sheet for the boats (+ lamp room exterior)
    const az = beamAz(t);
    ML.uBeamP.value.copy(lensWorld);
    ML.uBeamDir.value.set(Math.sin(az), BEAM.elev, -Math.cos(az)).normalize();
    ML.uBeamK.value = lk * (0.6 + 0.4 * storm(t));
    // the burner lights the room (one war light) when the camera is anywhere near the tower
    const cam = ctx.camera.position;
    const dTower = cam.distanceTo(lensWorld);
    if (lk > 0.01 && dTower < 60) addWarLight({ a: LENS.center, r: 7.5, c: [1.5 * lk, 0.95 * lk, 0.45 * lk] });

    // ---- glass overlay
    lamp.glass.lensPivot.position.copy(lensWorld);
    lamp.glass.lensPivot.rotation.y = -spin;
    const gf = 1 - smooth(invLerp(150, 600, dTower));
    lamp.glass.lens.uniforms.uFade.value = gf;
    lamp.glass.pane.uniforms.uFade.value = gf;
    lamp.glass.lensPivot.visible = lamp.glass.fixedPivot.visible = gf > 0.001;

    // ---- boats
    const near = [];
    for (let i = 0; i < 6; i++) {
      const B = boats[i], K = B.bake;
      const x = sample(K.x, t), z = sample(K.z, t), yaw = sample(K.yaw, t);
      // ride the drawn sea (heightAt depends on the current camera, so it is sampled live, smoothed over a short past window)
      const L = B.b.L, Wd = B.b.B, fx = Math.sin(yaw), fz = Math.cos(yaw), px = fz, pz = -fx;
      let hv = 0, pv = 0, rv = 0;
      for (let k = 0; k < 4; k++) {
        const wk = LAG_W[k], tk = t - k * 0.07;
        const hb = heightAt(x + fx * L * 0.4, z + fz * L * 0.4, tk), hs = heightAt(x - fx * L * 0.4, z - fz * L * 0.4, tk);
        const hp = heightAt(x + px * Wd * 0.5, z + pz * Wd * 0.5, tk), hst = heightAt(x - px * Wd * 0.5, z - pz * Wd * 0.5, tk);
        const hc = heightAt(x, z, tk);
        hv += wk * (hb + hs + hp + hst + hc * 2) / 6;
        pv += wk * Math.atan2(hb - hs, L * 0.8);
        rv += wk * Math.atan2(hp - hst, Wd) * 0.8;
      }
      B.root.position.set(x, hv - 0.4, z);
      B.root.rotation.set(0, yaw, 0);
      pv = clamp(pv, -0.09, 0.09);
      B.body.rotation.set(-pv, 0, rv, 'YXZ');
      B.J.lantern.rotation.set(clamp(sample(K.lx, t), -0.7, 0.7), 0, clamp(sample(K.lz, t), -0.8, 0.8));
      B.J.drum.rotation.x = 0;
      B.J.radar.rotation.y = t * 2.4 + i * 1.3;
      B.spray.update(t, sample(K.spd, t), pv, B);
      B.root.updateMatrixWorld(true);
      B.foam.update(t, sample(K.spd, t), heightAt, B.root.position.distanceTo(cam) < 260);
      const lp = B.J.lantern.localToWorld(_v.copy(B.J.lanternLocal));
      const lw = 0.9 + 0.1 * Math.sin(t * 9 + i);
      ML.uBoatL.value[i].set(lp.x, lp.y, lp.z, lw * (0.6 + 0.4 * storm(t)));
      near.push([lp.distanceTo(cam), lp.x, lp.y, lp.z, lw]);
      glows.set(i, lp, lw * (0.55 + 0.45 * storm(t)));
    }
    glows.update(ctx.camera, ctx.engine);
    near.sort((a, b) => a[0] - b[0]);
    for (let q = 0; q < 3; q++) {
      const n = near[q];
      if (n[0] < 90) addWarLight({ a: [n[1], n[2], n[3]], r: 9, c: [1.3 * n[4], 0.85 * n[4], 0.42 * n[4]] });
    }
  }

  const api = {
    update, anchor, crankAngle, root: lamp.root,
    lens: J.lens, boats: boats.map((b) => b.root), boatBodies: boats.map((b) => b.body),
    gears: { A: J.gearA, B: J.gearB, C: J.gearC }, crank: J.crank, lamp: J,
    info: { RATIO, LENS_Y, TRAIN, HATCH, BOATS },
  };
  void lastT;
  return api;
}

// bull (world tooth angle a + spin) meets pinion C at phi; teeth mesh when bull phase + pinion phase = 1/2 (mod 1)
const PHI_C = Math.atan2(TRAIN.C.at[2], TRAIN.C.at[0]);
const MESH_C = (0.5 - (PHI_C * TRAIN.bull.N) / (Math.PI * 2)) * (Math.PI * 2) / TRAIN.C.N - PHI_C - Math.PI;
const MESH_A = -Math.PI / TRAIN.A.N + (TRAIN.B.N % 2 ? Math.PI / TRAIN.A.N : 0);
export const KEYHOLE = [TRAIN.A.at[0], TRAIN.A.at[1], TRAIN.crankZ + 0.045];   // square socket in the crank hub: the key goes in here
