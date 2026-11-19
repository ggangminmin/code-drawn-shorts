import * as THREE from 'three';
import { seaMaterial } from './sea-mat.js';
import { GRID, seaParams, heightFull, foamFull, spacingAt, swellAt, crestZ } from './sea-waves.js';
import { beamOn, beamAz, BEAM, LENS, boatPath } from './layout.js';
import { createLip } from './sea-swell.js';

// LAST LIGHT — the Sea department: the storm ocean, the harbour basin, the great swell and its break.
// API (CONTRACT): heightAt(x, z, t), normalAt(x, z, t) -> [x,y,z], foamAt(x, z, t) 0..1, mesh.
//   extra: params(t) (the swell/bore numbers for that drawing), swellCrestZ(x, t), breakInfo.
// heightAt is exact for the drawn surface: it applies the same grid fade the polar mesh applies around the camera.
export async function createSea(ctx) {
  const { scene, camera } = ctx;
  const skyU = ctx.world?.sky?.material?.uniforms;
  const mat = seaMaterial(skyU ?? {
    uFlashPos: { value: new THREE.Vector3() }, uHorizonCool: { value: new THREE.Color('#22313b') }, uHorizonWarm: { value: new THREE.Color('#2a3a43') },
    uMid: { value: new THREE.Color('#0e1922') }, uCloudMid: { value: new THREE.Color('#202d38') }, uCloudLit: { value: new THREE.Color('#566b79') },
  });

  // polar grid around the camera
  const { NA, NR, R0, C } = GRID;
  const pos = new Float32Array((NR + 1) * NA * 3);
  for (let j = 0; j <= NR; j++) {
    const r = R0 * (Math.exp(j * C) - 1);
    for (let i = 0; i < NA; i++) {
      const a = (i / NA) * Math.PI * 2, k = (j * NA + i) * 3;
      pos[k] = Math.cos(a) * r; pos[k + 1] = 0; pos[k + 2] = Math.sin(a) * r;
    }
  }
  const idx = [];
  for (let j = 0; j < NR; j++) for (let i = 0; i < NA; i++) {
    const a = j * NA + i, b = j * NA + ((i + 1) % NA), c = (j + 1) * NA + i, d = (j + 1) * NA + ((i + 1) % NA);
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.userData.noShadow = true; mesh.name = 'sea';
  scene.add(mesh);

  const cache = new Map();
  const P = (t) => {
    const key = Math.round(t * 1000);
    let p = cache.get(key);
    if (!p) { p = seaParams(t); if (cache.size > 64) cache.clear(); cache.set(key, p); }
    return p;
  };
  const camSp = (x, z) => { const c = camera.position; return spacingAt(Math.hypot(x - c.x, z - c.z)); };
  const heightAt = (x, z, t) => heightFull(x, z, P(t), camSp(x, z));
  const normalAt = (x, z, t) => {
    const e = 0.8, p = P(t), sp = camSp(x, z);
    const h = heightFull(x, z, p, sp);
    const nx = -(heightFull(x + e, z, p, sp) - h) / e, nz = -(heightFull(x, z + e, p, sp) - h) / e;
    const l = Math.hypot(nx, 1, nz);
    return [nx / l, 1 / l, nz / l];
  };
  const foamAt = (x, z, t) => foamFull(x, z, P(t));

  const u = mat.uniforms;
  const lip = createLip(ctx, P);
  const lv = new THREE.Vector3();
  const sea = {
    mesh, lip: lip.mesh, heightAt, normalAt, foamAt,
    params: P,
    swellCrestZ: (x, t) => crestZ(x, P(t)),
    swellHeightAt: (x, z, t) => swellAt(x, z, P(t)),
    update(st) {
      const t = st.t, p = P(t);
      const c = camera.position;
      mesh.visible = c.y < 1500;          // interiors live 3 km up
      lip.update(st, skyU?.uFlashPos?.value);
      if (!mesh.visible) return;
      u.uCenter.value.set(c.x, c.z);
      u.uTw.value = p.tw;
      u.uSw.value.set(p.F, p.H, p.Lf, p.Lb);
      u.uSw2.value.set(p.brk, p.cap, p.white, p.rough);
      u.uBore.value.set(p.zb, p.xb, p.Hb, p.wb);
      // the beam from the lens
      const on = beamOn(t), az = beamAz(t), el = BEAM.elev;
      u.uBeamO.value.set(LENS.center[0], LENS.center[1], LENS.center[2], on);
      u.uBeamD.value.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
      // the fleet's lanterns (Mech's anchors when they exist)
      for (let i = 0; i < 6; i++) {
        let ok = false;
        try { ok = !!ctx.mech?.anchor?.('boatLantern' + i, lv); } catch (e) { ok = false; }
        if (!ok) { const b = boatPath(i, t); lv.set(b.x, heightAt(b.x, b.z, t) + 5.5, b.z); }
        u.uLant.value[i].set(lv.x, lv.y, lv.z, 1);
      }
    },
  };
  ctx.sea = sea;
  return sea;
}
