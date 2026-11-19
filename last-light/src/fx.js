import * as THREE from 'three';
import {
  hash, PuffBatch, puffMaterial, ChunkBatch, chunkMaterial, LineBatch, boltMaterial, GlowBatch, glowMaterial,
  mistMaterial, QuadBatch, screenFlashMaterial,
} from './fx-core.js';
import { RibbonBatch, beamMaterial } from './fx-beam.js';
import { createAir } from './fx-air.js';
import { createStorm } from './fx-storm.js';
import { createFlame } from './fx-flame.js';
import { createWater } from './fx-water.js';
import { addWarLight } from './glsl.js';
import { STAGE } from './cams/fx.js';
import { LENS, BEAM, SETS, beamAz, beamOn, boatPath, storm, lightningAt } from './layout.js';
import { clamp, smooth, invLerp, onThrees } from './util.js';

// LAST LIGHT — FX department. The lighthouse beam (the image of the film), lightning, the glass burst, the lamp flame,
// rain and spray. Everything is rebuilt each frame from state.t alone; drawn FX move on threes.
const V = THREE.Vector3;
const GOLD = [1.0, 0.86, 0.6];
const INTERIOR = new Set(['wheelhouse', 'kitchen', 'stairs', 'stairsBase']);

function shardGeo() {
  // a flat, sharp sliver of pane glass: an irregular triangle with a hair of thickness
  const s = new THREE.Shape();
  s.moveTo(-0.5, -0.32); s.lineTo(0.42, -0.5); s.lineTo(0.18, 0.12); s.lineTo(-0.05, 0.5); s.lineTo(-0.22, 0.05); s.lineTo(-0.5, -0.32);
  const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
  g.translate(0, 0, -0.5);
  return g.toNonIndexed();
}

export async function createFx(ctx) {
  const { scene, overlay, engine, camera, CUES: C } = ctx;
  const S = engine.S;
  const P = new URLSearchParams(location.search);

  // ---------------------------------------------------- batches
  const puffs = new PuffBatch(puffMaterial(S), 2400);
  const shards = new ChunkBatch(shardGeo(), chunkMaterial({ id: 85, dark: '#5a7890', rim: 1, sat: 0.9 }), 64);
  scene.add(puffs.mesh, shards.mesh);
  const air = createAir(ctx);
  const glows = new GlowBatch(glowMaterial(S), 400);
  const beams = new RibbonBatch(beamMaterial(S), 30000);
  const lines = new LineBatch(boltMaterial(S), 20000);
  lines.mesh.material.uniforms.uRimC.value.setRGB(0.18, 0.36, 0.95);
  const mists = new QuadBatch(mistMaterial(), 64, { iPos: 3, iS: 4, iC: 4, iTop: 3, iBot: 3 });
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), screenFlashMaterial());
  flash.frustumCulled = false; flash.visible = false;
  flash.material.uniforms.uRes.value.set(engine.IW, engine.IH);
  mists.mesh.renderOrder = 2; air.mesh.renderOrder = 3; beams.mesh.renderOrder = 4; glows.mesh.renderOrder = 5; lines.mesh.renderOrder = 6; flash.renderOrder = 10;
  overlay.add(mists.mesh, beams.mesh, glows.mesh, lines.mesh, flash);

  // ---------------------------------------------------- shared environment for the sub-modules
  const lightReq = [];
  const skyFlash = new THREE.Color();
  function anchorOf(obj, name, fb) {
    try {
      if (obj && typeof obj.anchor === 'function') {
        const v = new V();
        const r = obj.anchor(name, v);
        const got = r && r.isVector3 ? r : v;
        if (got.lengthSq() > 0 && Number.isFinite(got.x)) return got.clone();
      }
    } catch { /* fall back */ }
    return new V(fb[0], fb[1], fb[2]);
  }
  const groundY = (x, z) => { try { const g = ctx.land?.groundY?.(x, z); return Number.isFinite(g) ? g : null; } catch { return null; } };
  const E = {
    C, ctx, camera, puffs, shards, glows, beams, lines, t: 0, tq: 0, draw: 0, flash: 0, windGust: 0,
    beamDir: new V(0, 0, -1), beamA: new V(...LENS.center), beamLen: 2600, beamPow: 0,
    anchor: anchorOf,
    folkAnchor(who, part) {
      try {
        const f = ctx.folk?.[who];
        if (!f || typeof f.anchor !== 'function') return null;
        const v = new V(); const r = f.anchor(part, v); const got = r && r.isVector3 ? r : v;
        return got.lengthSq() > 0 ? got.clone() : null;
      } catch { return null; }
    },
    setOrigin(set) { const o = SETS[set === 'stairsBase' ? 'stairs' : set]; return o ? new V(...o) : null; },
    boatPos(i) {
      try {
        const b = ctx.mech?.boats?.[i];
        if (b && b.getWorldPosition) { const p = b.getWorldPosition(new V()); if (p.lengthSq() > 0) return p; }
      } catch { /* fall back */ }
      const p = boatPath(i, E.t);
      let y = 0;
      try { y = ctx.sea?.heightAt?.(p.x, p.z, E.t) ?? 0; } catch { y = 0; }
      return new V(p.x, y, p.z);
    },
    // 0..1: is p inside the main beam
    beamLitAt(p) {
      if (E.beamPow < 0.05) return 0;
      const d = p.clone().sub(E.beamA), x = d.dot(E.beamDir);
      if (x < 0 || x > E.beamLen) return 0;
      const r = d.addScaledVector(E.beamDir, -x).length(), R = 0.75 + 0.075 * x / (1 + x / 700);
      return r < R ? E.beamPow : 0;
    },
    light: {
      line(a, b, color, radius, power = 1) { lightReq.push({ a: [a.x, a.y, a.z], b: [b.x, b.y, b.z], r: radius, c: color.map((x) => x * power), s: power * Math.max(...color) * 10 }); },
      point(p, color, radius, power = 1) { if (power > 0.002) lightReq.push({ a: [p.x, p.y, p.z], r: radius, c: color.map((x) => x * power), s: power * Math.max(...color) * 10 }); },
    },
    sky(r, g, b) { skyFlash.r = Math.max(skyFlash.r, r); skyFlash.g = Math.max(skyFlash.g, g); skyFlash.b = Math.max(skyFlash.b, b); },
    mist(p, size, seed, op, soft, rot, top, bot, hard = 0.05) { if (op > 0.003) mists.push(p, [size[0], size[1], seed, op], [soft, rot, 0, hard], top, bot); },
    _flash: null,
    screenFlash(a, col, src) { if (!E._flash || a > E._flash.a) E._flash = { a, col, src }; },
  };

  // the cameras frame the other departments' real things once they exist
  {
    const f = anchorOf(ctx.mech, 'lensFocus', LENS.center);
    STAGE.focus = [f.x, f.y, f.z];
    // where Folk stands Suri at the burner (s08, s22): read-only from Folk's placement table
    try {
      const fp = await import('./folk-place.js');
      const PL = fp.PL;
      if (PL && PL.ready && PL.burnerStand) {
        const F = PL.burnerStand;
        STAGE.stand = { o: F.o.slice(), f: F.f.slice(), s: F.s.slice() };
        // Mech's service step: she stands on it, so the camera frames from its top
        const bs = anchorOf(ctx.mech, 'burnerStand', F.o);
        STAGE.stand.o = [bs.x, bs.y, bs.z];
        STAGE.suriHead = [F.o[0] + F.f[0] * 0.04, F.o[1] + 1.18, F.o[2] + F.f[2] * 0.04];
        if (PL.burner) STAGE.burner = PL.burner.slice();
      }
    } catch { /* Folk not there: layout fallbacks */ }
    STAGE.groundAt = (x, z) => groundY(x, z) ?? 38;
  }
  const stormFx = createStorm(E);
  const flame = createFlame(E);
  const water = createWater(E);

  // ---------------------------------------------------- debug proxy set (only with ?fxproxy=1): tower, lantern, cliff, sea
  if (P.get('fxproxy') === '1') {
    const pm = (color, id) => chunkMaterial({ id, dark: '#334455', sat: 1 });
    const add = (geo, color, id, pos, scale = [1, 1, 1]) => {
      const m = new THREE.InstancedMesh(geo, pm(color, id), 1);
      m.setMatrixAt(0, new THREE.Matrix4().compose(new V(...pos), new THREE.Quaternion(), new V(...scale)));
      m.setColorAt(0, new THREE.Color(color));
      scene.add(m);
    };
    add(new THREE.CylinderGeometry(3.6, 4.6, 30, 24), '#d8d8d0', 70, [160, 53, -300]);
    add(new THREE.CylinderGeometry(3.2, 3.2, 4.2, 16, 1, true), '#22302c', 71, [160, 70.1, -300]);
    add(new THREE.SphereGeometry(3.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), '#3f6a5a', 72, [160, 72.2, -300]);
    add(new THREE.CylinderGeometry(0.06, 0.06, 4, 6), '#222', 73, [160, 76.5, -300]);
    add(new THREE.CylinderGeometry(70, 90, 40, 32), '#2c3036', 74, [175, 18, -300]);
    add(new THREE.BoxGeometry(6000, 0.2, 6000), '#18283a', 75, [0, -0.1, -1500]);
    add(new THREE.CylinderGeometry(10, 18, 16, 10), '#202428', 76, [-48, 8, -272]);
    add(new THREE.CylinderGeometry(10, 18, 16, 10), '#202428', 77, [48, 8, -272]);
  }

  // ---------------------------------------------------- the lighthouse beams
  const beamOut = [];
  function lighthouse(st) {
    const t = st.t;
    const A = anchorOf(ctx.mech, 'lensFocus', LENS.center);
    const az = beamAz(t), el = BEAM.elev;
    const dir = new V(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
    const on = beamOn(t) * (1 - 0.8 * (1 - storm(t)));   // at dawn the beam pales against the sky
    E.beamA.copy(A); E.beamDir.copy(dir); E.beamPow = on;
    // how far it runs before land or sea stops it
    let L = 2600;
    for (let i = 1; i <= 60; i++) {
      const s = 4 * Math.pow(1.09, i);
      if (s > 2600) break;
      const p = A.clone().addScaledVector(dir, s);
      const g = groundY(p.x, p.z);
      if (p.y < 0 || (g != null && p.y < g)) { L = s; break; }
    }
    E.beamLen = L;
    beamOut.length = 0;
    if (on < 0.002) return;
    const flick = t < C.bolt ? 1 : 0.94 + 0.06 * hash(Math.floor(t * 8), 9, 1);
    beamOut.push({ a: [A.x, A.y, A.z], dir: [dir.x, dir.y, dir.z], power: on * flick, len: L < 2590 ? L * 1.04 : 5000, r0: 0.75, spread: 0.075, core: 0.4, falloff: 1300 });
    const d2 = dir.clone().multiplyScalar(-1); d2.y = el;
    d2.normalize();
    let L2 = 2600;
    for (let i = 1; i <= 60; i++) {
      const s = 4 * Math.pow(1.09, i);
      if (s > 2600) break;
      const p = A.clone().addScaledVector(d2, s);
      const g = groundY(p.x, p.z);
      if (p.y < 0 || (g != null && p.y < g)) { L2 = s; break; }
    }
    beamOut.push({ a: [A.x, A.y, A.z], dir: [d2.x, d2.y, d2.z], power: 0.5 * on * flick, len: L2 < 2590 ? L2 * 1.04 : 5000, r0: 0.7, spread: 0.065, core: 0.3, falloff: 800 });
    // where the blade meets sea or rock: a pale lit pool drawn on it
    if (L < 2590) {
      const hit = A.clone().addScaledVector(dir, L), Rh = 0.75 + 0.075 * L / (1 + L / 700);
      glows.push(hit, { kind: 0, m: Rh * 1.6, aspect: 1.6, color: [1, 0.9, 0.66], power: 0.55 * on, mode: 0, bias: Rh * 2, cap: 0.4 });
    }
    // light the world along the blade: three segments widening with the cone, the soft beam opposite
    const seg = (s0, s1, r, pw, dd = dir, LL = L) => {
      if (s0 >= LL) return;
      const a = A.clone().addScaledVector(dd, s0), b = A.clone().addScaledVector(dd, Math.min(s1, LL));
      lightReq.push({ a: [a.x, a.y, a.z], b: [b.x, b.y, b.z], r, c: GOLD.map((x) => x * pw * on), s: 30 * on * pw });
    };
    seg(1.5, 170, 12, 3.2);
    seg(170, 700, 34, 2.6);
    seg(700, 2600, 95, 2.0);
    seg(1.5, 500, 22, 1.1, d2, L2);
  }

  // ---------------------------------------------------- rain
  function rain(st) {
    const set = st.set, t = st.t;
    let amt = 0;
    if (!INTERIOR.has(set)) amt = set === 'lamproom' ? 0.6 : 1.0;
    amt *= storm(t);
    amt = Math.min(1.2, amt * (1 + 0.6 * E.windGust));
    const lk = st.look ?? {};
    if (lk.rain != null) amt = lk.rain;
    const fl = Math.max(E.flash, lightningAt(t));
    // in the lamp room only the rain beyond the glass shows (near layers would fall through the room)
    const layer0 = lk.rainLayer0 ?? (set === 'lamproom' ? 2 : 0);
    air.set({ drawing: E.draw, t, beams: beamOut, rain: { amount: amt, flash: fl, sheets: 1, layer0, veil: (0.05 + 0.05 * storm(t)) * (set === 'lamproom' ? 0.3 : st.sid === 's16' || st.sid === 's10' ? 0.25 : 1), wind: [0.42 + 0.3 * E.windGust, -1, 0.18] } });
  }

  function screenFlash() {
    const fu = flash.material.uniforms, f = E._flash;
    if (!f || f.a < 0.002) { flash.visible = false; return; }
    fu.uA.value = f.a;
    fu.uColor.value.setRGB(...f.col);
    const sp = f.src.clone().project(camera);
    fu.uCenter.value.set(clamp(sp.x * 0.5 + 0.5, -0.5, 1.5), clamp(sp.y * 0.5 + 0.5, -0.5, 1.5));
    flash.visible = true;
  }

  // ---------------------------------------------------- frame
  function update(st) {
    const t = st.t;
    E.t = t; E.tq = onThrees(t); E.draw = Math.floor(t * 8); E.sid = st.sid; E.set = st.set;
    E.flash = 0; E.windGust = 0; E._flash = null;
    puffs.begin(camera.position); shards.begin(); glows.begin(camera); beams.begin(); lines.begin(); mists.begin();
    lightReq.length = 0; skyFlash.setRGB(0, 0, 0);
    puffs.mesh.material.uniforms.uFogD.value = engine.mAtmos.uniforms.uFogDensity.value;
    puffs.mesh.material.uniforms.uDrawing.value = E.draw;
    beams.mesh.material.uniforms.uDrawing.value = E.draw;
    mists.mesh.material.uniforms.uDrawing.value = E.draw;
    const bu = beams.mesh.material.uniforms, th = Math.tan((camera.fov * Math.PI) / 360);
    bu.uCam.value.copy(camera.matrixWorld); bu.uCamPos.value.copy(camera.position); bu.uTan.value.set(th * camera.aspect, th);

    const steps = [() => lighthouse(st), () => stormFx.update(st), () => flame.update(st), () => water.update(st), () => rain(st), screenFlash];
    for (const f of steps) { try { f(); } catch (e) { console.error(`[fx] step failed: ${e.stack || e}`); } }

    puffs.end(); shards.end(); glows.end(); beams.end(); lines.end(); mists.end();

    // light the world: the strongest requests take the free slots
    lightReq.sort((a, b) => b.s - a.s);
    for (const l of lightReq) addWarLight(l);
    const sky = ctx.world?.sky?.material?.uniforms?.uSkyFlash;
    if (sky && (skyFlash.r > 0 || skyFlash.g > 0 || skyFlash.b > 0)) sky.value.setRGB(skyFlash.r, skyFlash.g, skyFlash.b);
  }

  return {
    update,
    beamDir: (out = new V()) => out.copy(E.beamDir),
    beamLitAt: (p) => E.beamLitAt(p),
    flameState: (t) => flame.flameState(t),
    lightning: (t) => lightningAt(t),
    _meshes: { puffs: puffs.mesh, glows: glows.mesh, beams: beams.mesh, lines: lines.mesh, air: air.mesh, flash },
  };
}
