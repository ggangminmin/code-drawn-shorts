import * as THREE from 'three';
import {
  hash, hr, GEO, ID, KIND, PAL, PuffBatch, puffMaterial, ChunkBatch, chunkMaterial, GlowBatch, glowMaterial, GLOW, screenFlashMaterial,
} from './fx-core.js';
import { RibbonBatch, beamMaterial, trailMaterial, coneMaterial, linePts } from './fx-beam.js';
import { fireDome } from './fx-fire.js';
import { createColumns } from './fx-smoke.js';
import { COMMON, MRT_OUT, G, addWarLight, MAX_WAR } from './glsl.js';
import {
  SEEDROOM, VAULT, SLAB, WELL, COURT, WALL, GUN, ROOF, TOWER, RESERVOIR_Y, SHELLS,
  threadOn, irisHeat, sweepU, eruptU, sweepPoint, shipPos, quake,
} from './layout.js';
import { clamp, smooth, invLerp, easeOut, easeIn, lerp, onThrees } from './util.js';

// SEEDLIGHT FX department. Drawn on threes, a few big shapes, white cores and coloured edges. Pure in state.t.
// GOLD = thread and the calm iris. WHITE-HOT = the ray. VERMILION/AMBER = fire. CYAN-WHITE = searchlights.

const V = THREE.Vector3;
const v3 = (a) => new V(a[0], a[1], a[2]);
const GOLD = [1.0, 0.72, 0.24], GOLD_HOT = [1.0, 0.95, 0.72], WHITE = [1, 1, 1], AMBER = [1.0, 0.52, 0.16], VERM = [1.0, 0.34, 0.12], CYAN = [0.62, 0.9, 0.95];

function petalMaterial() {
  const u = { ...G, uId: { value: 81 } };
  const vs = /* glsl */ `
    varying vec3 vNV, vCol, vObj;
    varying float vDepth;
    void main(){
      vec4 mv = viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
      vNV = normalize(mat3(viewMatrix) * mat3(modelMatrix) * mat3(instanceMatrix) * normal);
      vDepth = -mv.z; vObj = position;
      #ifdef USE_INSTANCING_COLOR
        vCol = instanceColor;
      #else
        vCol = vec3(1.0);
      #endif
      gl_Position = projectionMatrix * mv;
    }
  `;
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    uniform float uId;
    varying vec3 vNV, vCol, vObj;
    varying float vDepth;
    void main(){
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
      vec3 NV = normalize(vNV);
      if(!gl_FrontFacing) NV = -NV;
      float e = length(vObj.xz * vec2(1.9, 1.0));
      float n = vnoise(vObj.xz * 5.0 + vCol.rg * 13.0);
      vec3 c = vCol;
      c = mix(c * 0.5, c, smoothstep(0.26, 0.34, e + n * 0.12));
      c = mix(c, vec3(1.25, 1.15, 0.95) * max(vCol.r, 0.4), smoothstep(0.38, 0.42, e + n * 0.06));
      writeOut(c * 1.25, 1.0, NV, vDepth, uId);
    }
  `;
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: vs, fragmentShader: fs, side: THREE.DoubleSide });
}

export async function createFx(ctx) {
  const { scene, overlay, engine, camera, CUES: C } = ctx;
  const S = engine.S;

  // ---------------------------------------------------- batches
  const puffs = new PuffBatch(puffMaterial(S), 6000);
  const petals = new ChunkBatch(GEO.petal(), petalMaterial(), 500);
  const stones = new ChunkBatch(GEO.block(3), chunkMaterial({ id: 73, sat: 0.9 }), 400);
  const cols = createColumns(64);
  scene.add(puffs.mesh, petals.mesh, stones.mesh, cols.mesh);
  const glows = new GlowBatch(glowMaterial(S), 500);
  const cones = new RibbonBatch(coneMaterial(S), 4000);
  const beams = new RibbonBatch(beamMaterial(S), 60000);
  const trails = new RibbonBatch(trailMaterial(S), 12000);
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), screenFlashMaterial());
  flash.frustumCulled = false; flash.visible = false;
  cones.mesh.renderOrder = 1; trails.mesh.renderOrder = 2; glows.mesh.renderOrder = 4; beams.mesh.renderOrder = 5; flash.renderOrder = 10;
  overlay.add(cones.mesh, trails.mesh, glows.mesh, beams.mesh, flash);
  flash.material.uniforms.uRes.value.set(engine.IW, engine.IH);

  // ---------------------------------------------------- environment
  const lightReq = [];
  const skyFlash = new THREE.Color();
  function anchorOf(obj, name, fb) {
    try {
      if (obj && typeof obj.anchor === 'function') {
        const v = new V();
        const r = obj.anchor(name, v);
        const got = r && r.isVector3 ? r : v;
        const unknown = got.x === 0 && got.z === 0 && (got.y === 0 || got.y === 120);      // land answers (0, DAM.y, 0) for names it does not know
        if (Number.isFinite(got.x + got.y + got.z) && !unknown) return got.clone();
      }
    } catch { /* fall back */ }
    return fb ? v3(fb) : null;
  }
  const E = {
    C, CUES: C, ctx, scene, camera, puffs, petals, stones, glows, beams, trails, tq: 0, t: 0, draw: 0, sid: '',
    inkZ(x, y, z) { const m = camera.matrixWorldInverse.elements; return Math.max(-(m[2] * x + m[6] * y + m[10] * z + m[14]), 0.5); },
    light: {
      line(a, b, color, radius, power = 1) { lightReq.push({ a: [a.x, a.y, a.z], b: [b.x, b.y, b.z], r: radius, c: color.map((x) => x * power), s: power * radius * 1.5 }); },
      point(p, color, radius, power = 1) { lightReq.push({ a: [p.x, p.y, p.z], r: radius * 2.2, c: color.map((x) => x * 2.0 * power), s: 2.0 * power * radius }); },
      raw(p, color, r, score) { lightReq.push({ a: [p.x, p.y, p.z], r, c: color, s: score }); },
    },
    sky(r, g, b) { skyFlash.r = Math.max(skyFlash.r, r); skyFlash.g = Math.max(skyFlash.g, g); skyFlash.b = Math.max(skyFlash.b, b); },
  };
  let flashA = 0, flashCol = WHITE, flashAt = null;
  const screenFlash = (a, col, p) => { if (a > flashA) { flashA = a; flashCol = col; flashAt = p; } };
  const camDist = (p) => camera.position.distanceTo(p);

  // ---------------------------------------------------- where things are
  function irisFb(t) {
    if (t < C.standUp) return [SLAB[0] + 2.6, 63.3, SLAB[2]];
    if (t < C.leap) return [-104, 67.2, 0];
    if (t < C.burst) return [WELL.center[0], lerp(67, 122, (t - C.leap) / (C.burst - C.leap)), WELL.center[1]];
    if (t < 20.9) return [COURT.center[0] + 3, 123.4, 4];
    if (t < C.headRise) return [0.5, lerp(150, 214.6, clamp((t - 20.9) / (C.headRise - 20.9))), 2.2];
    if (t < C.shell1Hit) return [ROOF.lanternKneel[0], 216.6, ROOF.lanternKneel[2] - 0.6];
    if (t < 44.9) return [ROOF.keepFall[0], 151.3, ROOF.keepFall[2]];
    return [ROOF.lanternStand[0], 218.6, ROOF.lanternStand[2]];
  }
  const irisAt = (t) => anchorOf(ctx.mech, 'iris', irisFb(t));
  // where a ray leaves the head: just in front of the iris along the head's forward axis (mech)
  const rayFrom = (t) => { const I = irisAt(t); try { if (ctx.mech?.headForward) I.addScaledVector(ctx.mech.headForward(new V()), 0.22); } catch { /* iris itself */ } return I; };
  const chestAt = (t) => { const f = irisFb(t); return anchorOf(ctx.mech, 'chest', [f[0], f[1] - 1.7, f[2]]); };
  const seedAt = (t) => {
    if (t >= C.irisOut) return v3([ROOF.lanternStand[0] - 0.4, 214.5, ROOF.lanternStand[2] - 0.3]);     // the rubble on the roof
    return anchorOf(ctx.folk, 'seed', t < 20.9 ? SEEDROOM.window : [ROOF.girlStand[0], 215.0, ROOF.girlStand[2]]);
  };
  const shipAnchor = (name, off, t) => { const s = shipPos(t); return anchorOf(ctx.land, name, [s[0] + off[0], s[1] + off[1], s[2] + off[2]]); };
  const shellFrom = (s) => (s.from === 'gun' ? anchorOf(ctx.land, 'gunMuzzle', GUN.pos) : shipAnchor(s.from, [(+s.from.slice(4) - 2) * 30, 6, -17], s.t0));
  const doorPts = () => {
    const D = VAULT.door;       // the east wall is the plane x = -88: the door face seen from inside sits a touch in front of it
    return [new V(D[0] - 0.3, D[1] + 5.2, D[2] - 3.4), new V(D[0] - 0.3, D[1] + 1.0, D[2] + 3.4)];
  };

  // ---------------------------------------------------- small drawing helpers
  // hair-thin ray: white core, gold edge, a thin soft halo for the bloom
  function ray(a, b, o = {}) {
    const d = a.distanceTo(b), n = Math.max(8, Math.min(60, Math.round(d / 4)));
    beams.push(linePts(a, b, n), { px: o.px ?? 1.2, m: o.m ?? 0.02, color: o.color ?? GOLD, hot: o.hot ?? WHITE, power: o.power ?? 1.5, core: o.core ?? 0.55, soft: o.soft ?? 9, seed: o.seed ?? 0.4, mode: o.mode ?? 0, bias: o.bias ?? Math.max(0.5, d * 0.02), width: o.width });
  }
  // a glowing scratch between two points, cooling from white through gold to dull amber with age (0 fresh .. 1 cold)
  function scratch(pts, age, o = {}) {
    const c = age < 0.3 ? GOLD : [1.0, lerp(0.72, 0.4, age), lerp(0.24, 0.1, age)];
    const hot = age < 0.3 ? WHITE : [1, lerp(0.98, 0.74, age), lerp(0.85, 0.3, age)];
    beams.push(pts, { px: o.px ?? 1.3, m: o.m ?? 0.03, color: c, hot, power: (o.power ?? 1) * (1.5 - 0.7 * age), core: 0.55, soft: o.soft ?? 5, seed: o.seed ?? 0.9, mode: 0, bias: o.bias ?? 1.2, width: o.width });
  }
  // short spark strokes flying off a point: a handful of drawn lines, two drawings long
  function sparks(p, t0, n, seed, o = {}) {
    const a = E.tq - t0, life = o.life ?? 0.36;
    if (a < 0 || a >= life) return;
    const u = a / life, R = (o.R ?? 1.2) * (0.35 + 0.65 * easeOut(u, 2)), nrm = o.n ?? null;
    for (let i = 0; i < n; i++) {
      const d = new V(hash(i, seed, 1) - 0.5, hash(i, seed, 2) - 0.3, hash(i, seed, 3) - 0.5).normalize();
      if (nrm && d.dot(nrm) < 0) d.reflect(nrm);
      const len = R * hr(i, seed, 4, 0.5, 1.2);
      const g = new V(0, -(o.g ?? 3) * a * a, 0);
      const a0 = p.clone().addScaledVector(d, len * 0.45).add(g), a1 = p.clone().addScaledVector(d, len).add(g);
      beams.push(linePts(a0, a1, 4), { px: 1.3, m: (o.m ?? 0.025), width: (s) => 1 - s * 0.7, color: o.color ?? AMBER, hot: GOLD_HOT, power: 1.4 * (1 - u * u), core: 0.6, soft: 3, seed: i, mode: o.mode ?? 0, bias: 1.5 });
    }
    if (a < 0.13) glows.push(p, { kind: GLOW.kira, m: (o.R ?? 1.2) * 1.3, color: o.color ?? GOLD, power: 1.3, mode: o.mode ?? 0, bias: 1.5, rot: hash(seed, 9) * 1.5 });
  }
  // a standing drawn flame: layered tongues (deep red skirt, orange body, yellow heart, white root) that redraw on threes
  function flame(x, y, z, H, R, seed, o = {}) {
    if (H <= 0.05) return;
    const D = E.draw, n = o.n ?? 3;
    const cx = camera.position.x - x, cz = camera.position.z - z, cl = Math.hypot(cx, cz) || 1, tx = cx / cl, tz = cz / cl;
    for (let j = 0; j < n; j++) {
      const hh = H * (0.55 + 0.6 * hash(seed + j, D, 1)), off = (j - (n - 1) / 2) * R * 0.9;
      const lean = (hash(seed + j, D, 2) - 0.5) * 0.5 + (o.lean ?? 0.12);
      const bx = x - tz * off, bz = z + tx * off;
      const L = [[1.0, 1.0, 0.95, 61 + (j % 3) * 2], [0.7, 0.72, 0.15, 101], [0.42, 0.45, -1.0, 103]];
      for (let q = 0; q < L.length; q++) {
        const [rk, hk, tone, id] = L[q];
        const fwd = q * R * 0.5;
        puffs.push(bx + tx * fwd, y + R * rk * 0.5, bz + tz * fwd, R * rk, hh * hk, 0.06, 0.5, lean, 1, lean * 0.4, (seed * 7 + j * 3 + q + (D % 5) * 11) % 97, tone, 0, KIND.TONGUE, PAL.FIRE, id);
      }
    }
  }
  // a dust or smoke lobe (no kids)
  const lobe = (x, y, z, r, seed, tone, fade, pal, id) => { if (r > 0.02 && fade < 0.98) puffs.push(x, y, z, r * (1 - fade * fade * fade), 0, 1, 0.4, 0, 1, 0, seed % 97, tone, Math.max(0, fade - 0.05), KIND.PUFF, pal, id); };
  // stone blocks thrown from a point on ballistic arcs
  function debris(p, t0, n, seed, o = {}) {
    const a = E.t - t0, life = o.life ?? 2.6;
    if (a < 0 || a > life) return;
    const sp = o.speed ?? 14, sz = o.size ?? 0.6, up = o.up ?? 1, col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const az = hash(i, seed, 1) * 6.283, v = sp * hr(i, seed, 2, 0.3, 1), vy = sp * up * hr(i, seed, 3, 0.6, 1.3);
      let dx = Math.cos(az) * v, dz = Math.sin(az) * v;
      if (o.dir) { dx = dx * 0.5 + o.dir[0] * v; dz = dz * 0.5 + o.dir[2] * v; }
      const x = p.x + dx * a, y = p.y + vy * a - 4.9 * a * a * (o.g ?? 1), z = p.z + dz * a;
      if (o.floor != null && y < o.floor) continue;
      const s = sz * hr(i, seed, 4, 0.5, 1.5), rot = a * hr(i, seed, 5, 2, 7);
      const hot = o.hot ? Math.max(0, 1 - a / (life * 0.6)) * hash(i, seed, 6) : 0;
      col.set(o.color ?? '#cfc8b4').lerp(new THREE.Color(1.6, 0.6, 0.15), hot);
      stones.push(x, y, z, rot + i, rot * 0.7, i * 1.3, s * (o.flat ? 1.5 : 1), s * (o.flat ? 0.22 : 0.8), s, col);
    }
  }
  // fire thrown in a few fat tapered arcs from a point
  function fireArcs(p, t0, n, seed, R, o = {}) {
    const a = E.tq - t0, life = o.life ?? 1.6;
    if (a < 0 || a > life) return;
    for (let i = 0; i < n; i++) {
      const b = hash(i, seed, 31) * 0.25, aa = a - b;
      if (aa <= 0) continue;
      const az = hash(i, seed, 32) * 6.283, v = hr(i, seed, 33, 0.4, 1.0) * R * 1.5, vy = hr(i, seed, 34, 0.9, 1.7) * R * 1.3;
      const pts = [], tail = Math.max(0, aa - 0.35);
      for (let q = 0; q <= 8; q++) { const u = tail + (aa - tail) * (q / 8); pts.push(new V(p.x + Math.cos(az) * v * u, p.y + vy * u - 0.5 * R * 2.4 * u * u, p.z + Math.sin(az) * v * u)); }
      const fade = 1 - smooth(invLerp(life * 0.55, life, a + hash(i, seed, 35) * 0.2));
      beams.push(pts, { m: R * 0.035, px: 1.2, width: (s) => 0.2 + 0.8 * s, color: AMBER, hot: GOLD_HOT, power: 1.3 * fade, core: 0.45, soft: 4, seed: 0.3 + i, bias: R * 0.5 });
    }
  }
  // flat drawn burst in layers: white core, yellow, vermilion, a dark smoke rim. Out in four frames, fire gone in ten, smoke drifts off.
  function burst(p, t0, R, seed, o = {}) {
    const a = E.tq - t0;
    if (a < 0 || a > 1.7) return 0;
    const g = easeOut(clamp((a + 0.04) / 0.2), 2.2);
    const c = camera.position.clone().sub(p).normalize();
    puffs.inkZ = E.inkZ(p.x, p.y, p.z);
    const sn = o.smokeN ?? 7, sl = o.smokeLife ?? 1.3, sk = o.smokeR ?? 1;
    if (a > 0.4 + sl) { puffs.inkZ = 0; return 0; }
    const smokeFade = clamp((a - 0.4) / sl), sp = o.smoke ?? PAL.SOOT;
    for (let i = 0; i < sn; i++) {
      const az = (i / 7) * 6.283 + hash(i, seed, 1) * 0.7, el = hr(i, seed, 2, -0.35, 0.9), ce = Math.cos(el);
      const k = R * (0.72 + 0.3 * hash(i, seed, 3)) * g * (1 + 0.35 * a);
      lobe(p.x + Math.cos(az) * ce * k, p.y + Math.sin(el) * k + a * R * 0.55, p.z + Math.sin(az) * ce * k, R * sk * (0.4 + 0.24 * hash(i, seed, 4)) * g * (1 + 0.3 * a), seed + i * 3, 0.12 + 0.1 * hash(i, seed, 5), smokeFade, sp, ID.STEAM[i % 3]);
    }
    const layer = (n, until, rr, spread, tone, fwd, id) => {
      if (a >= until) return;
      const f = clamp((a - until * 0.45) / (until * 0.55));
      for (let i = 0; i < n; i++) {
        const az = (i / n) * 6.283 + hash(i, seed, 6 + id), d = n > 1 ? R * spread * g : 0;
        const x = p.x + Math.cos(az) * d * (1 - Math.abs(c.x)) + c.x * fwd * R, y = p.y + Math.sin(az * 1.7 + 1) * d * 0.7 + c.y * fwd * R, z = p.z + Math.sin(az) * d * (1 - Math.abs(c.z)) + c.z * fwd * R;
        puffs.push(x, y, z, R * rr * g * (1 - f * f * 0.5), 0, 1, 0.5, x - p.x, y - p.y + 0.01, z - p.z, (seed * 3 + i + id) % 97, tone, f * 0.9, KIND.PUFF, PAL.FIRE, id);
      }
    };
    layer(5, 0.42, 0.5, 0.5, 0.85, 0.25, 65);
    layer(3, 0.3, 0.42, 0.3, 0.1, 0.55, 101);
    layer(1, 0.17, 0.36, 0, -1.6, 0.85, 103);
    puffs.inkZ = 0;
    if (a < 0.125) glows.push(p.clone().addScaledVector(c, R), { kind: GLOW.kira, m: R * 1.5, color: GOLD_HOT, power: 1.2, mode: 0, bias: R * 1.5, rot: 0.4 + seed, cap: 0.09 });
    if (a < 0.5) E.light.point(p, [1.0, 0.66, 0.36], R * 4, 1.5 * (1 - a / 0.5));
    return 1 - clamp(a / 0.5);
  }
  // one drawn smoke column (see fx-smoke.js). Wind blows east and a little upstream.
  const WIND = new V(1, 0, -0.35).normalize();
  const SMOKE = { night: [[0.035, 0.085, 0.1], [0.2, 0.34, 0.35]], fire: [[0.075, 0.06, 0.055], [0.2, 0.2, 0.185]], dust: [[0.46, 0.42, 0.33], [0.9, 0.84, 0.66]], gold: [[0.5, 0.36, 0.14], [0.98, 0.82, 0.45]] };
  function column(p, t0, R, H, seed, o = {}) {
    const a = E.tq - t0;
    if (a < 0) return;
    const end = o.end != null ? clamp((E.tq - o.end) / (o.fadeOut ?? 2)) : 0;
    if (end >= 1) return;
    const risen = H * (1 - Math.exp(-a / (o.tau ?? 2.6)));
    const fx = camera.position.x - p.x, fz = camera.position.z - p.z, l = Math.hypot(fx, fz) || 1;
    const sign = (WIND.x * fz - WIND.z * fx) / l;
    const pal = o.pal ?? (E.t > C.erupt ? SMOKE.fire : SMOKE.night);
    cols.push([p.x, p.y, p.z], [R, H, (seed % 31) * 0.137 + 0.11, risen], [(o.lean ?? 2.6) * sign * (H / (R * 12)), o.fire ?? (E.t > C.erupt ? 1 : 0), 83 + (seed % 3) * 2, Math.max(o.dissolve ?? 0.55, end * 2.2)], pal[0], pal[1]);
  }

  // ---------------------------------------------------- 1. the gold thread
  function thread(st) {
    const t = E.t, on = threadOn(t);
    if (on <= 0.004) return;
    const Sd = seedAt(t);
    const up = new V(0.045, 1, 0.075).normalize();
    let L = 2600, dir = up, bend = 0;
    if (t > C.handChest - 0.7 && t < C.shell1Hit) bend = smooth((t - (C.handChest - 0.7)) / 0.7) * (1 - smooth((t - (C.shell1Hit - 0.15)) / 0.15));
    let pts;
    if (bend > 0.001) {
      const ch = chestAt(t), to = ch.clone().sub(Sd), dist = to.length();
      to.normalize();
      // the thread tips over like a reed and its end comes to rest on the chest plate
      const q = new THREE.Quaternion().setFromUnitVectors(up, to), id = new THREE.Quaternion();
      dir = up.clone().applyQuaternion(id.slerp(q, bend));
      L = Math.exp(lerp(Math.log(2600), Math.log(dist), bend));
      const end = Sd.clone().addScaledVector(dir, L), mid = Sd.clone().addScaledVector(up, Math.min(L * 0.5, dist * 0.55)).lerp(Sd.clone().lerp(end, 0.5), 1 - bend * 0.9);
      pts = [];
      for (let i = 0; i <= 28; i++) { const u = i / 28, w = 1 - u; pts.push(new V().addScaledVector(Sd, w * w).addScaledVector(mid, 2 * w * u).addScaledVector(end, u * u)); }
      if (bend > 0.9) {
        glows.push(end, { kind: GLOW.kira, m: 0, px: 10, color: GOLD, power: 0.9 * bend, mode: 0, bias: 0.8, rot: 0.4 });
        E.light.raw(end, [0.8 * bend, 0.55 * bend, 0.2 * bend], 2.2, 30);
      }
    } else {
      // dense near the seed so the ribbon stays straight in close shots, long strides into the sky
      pts = [];
      for (let i = 0; i <= 30; i++) pts.push(Sd.clone().addScaledVector(dir, L * Math.pow(i / 30, 3)));
    }
    const d = camDist(Sd), far = smooth(invLerp(40, 300, d));
    const shimmer = 0.92 + 0.08 * hash(E.draw, 3, 1);
    const bias = 0.25 + d * 0.012;
    // halo first, then the hair-thin line itself: gold edge, pale core
    beams.push(pts, { px: lerp(0.8, 1.2, far), m: 0, color: GOLD, hot: GOLD_HOT, power: 1.2 * on * shimmer, core: 0.6, soft: lerp(4, 8, far), seed: 0.5, mode: 0, bias });
    // the seed's own light
    glows.push(Sd, { kind: GLOW.soft, m: 0, px: 9, color: GOLD, power: 0.6 * on, mode: 0, bias: bias + 0.3 });
    glows.push(Sd, { kind: GLOW.kira, m: 0, px: lerp(12, 16, far), color: GOLD_HOT, power: 0.9 * on * shimmer, mode: 0, bias: bias + 0.3, rot: 0.2 });
    E.light.raw(Sd, [0.95 * on, 0.62 * on, 0.2 * on], d > 60 ? 6 : 2.6, 60 * on);
    // a few motes riding up the thread near the seed
    if (d < 40) {
      for (let i = 0; i < 5; i++) {
        const u = (t * 0.35 + i / 5 + hash(i, 4, 4)) % 1;
        const p = Sd.clone().addScaledVector(dir, 0.15 + u * 2.4);
        p.x += Math.sin(t * 2 + i * 2.1) * 0.05; p.z += Math.cos(t * 1.7 + i) * 0.05;
        glows.push(p, { kind: GLOW.soft, m: 0.035, px: 1.5, color: GOLD_HOT, power: 1.2 * on * Math.sin(Math.PI * u), mode: 0, bias: 0.5 });
      }
    }
  }

  // ---------------------------------------------------- 1b. motes through the vault grate (s01c - s04)
  function motes() {
    const t = E.t;
    if (t < 2.0 || t > C.standUp + 2) return;
    const k = 1 - smooth(invLerp(C.standUp, C.standUp + 2, t));
    const top = VAULT.floorY + VAULT.size[1], c = irisFb(1);
    for (let i = 0; i < 16; i++) {
      const sp = hr(i, 7, 1, 0.5, 1.1), ph = hash(i, 7, 2) * 14;
      const fall = (t * sp + ph) % 14;
      const x = c[0] + hr(i, 7, 3, -1.6, 2.4) + Math.sin(t * 0.9 + i) * 0.12, z = c[2] + hr(i, 7, 4, -1.4, 1.4) + Math.cos(t * 0.7 + i * 2) * 0.12;
      const y = top - fall;
      if (y < VAULT.floorY + 0.1) continue;
      const tw = 0.6 + 0.4 * Math.sin(t * 5 + i * 1.9);
      const p = new V(x, y, z);
      glows.push(p, { kind: GLOW.soft, m: 0.07, px: 1.6, color: GOLD_HOT, power: 1.3 * k * tw, mode: 0, bias: 0.6 });
      if (i % 4 === 0) glows.push(p, { kind: GLOW.kira, m: 0.22, color: GOLD, power: 0.9 * k * tw, mode: 0, bias: 0.6 });
    }
    // the shaft of gold falling through the grate, faint
    if (t < C.twitch + 1) {
      const a = new V(c[0] + 0.4, top, c[2]), b = new V(c[0] + 0.2, VAULT.floorY + 1, c[2]);
      cones.push(linePts(a, b, 6), { m: 1.5, px: 0, width: (s) => 0.5 + 0.5 * s, color: [0.9, 0.62, 0.2], hot: [1.0, 0.8, 0.4], power: 0.12 * k, core: 0, soft: 0, seed: 0.7, mode: 0, bias: 1 });
    }
  }

  // ---------------------------------------------------- 2. the iris: its light on the world, and the kiss of a flare when it faces the lens
  const irisColor = (h) => (h <= 1 ? [1.0, 0.7, 0.26] : [lerp(1.0, 1.0, h - 1), lerp(0.7, 0.97, h - 1), lerp(0.26, 0.88, h - 1)]);
  function iris(st) {
    const t = E.t, h = irisHeat(t);
    if (h <= 0.01) return;
    const I = irisAt(t), c = irisColor(h), pw = Math.min(h, 1) * (1 + 0.5 * Math.max(0, h - 1));
    const inside = t < C.leap + 0.5;
    E.light.raw(I, c.map((x) => x * (inside ? 1.5 : 1.3) * pw), inside ? 26 : 14, 500);
    let facing = 0.6;
    const toCam = camera.position.clone().sub(I).normalize();
    try {
      if (ctx.mech?.headForward) facing = ctx.mech.headForward(new V()).dot(toCam);
      else { const head = anchorOf(ctx.mech, 'head', null); if (head) { const f = I.clone().sub(head); if (f.lengthSq() > 1e-4) facing = f.normalize().dot(toCam); } }
    } catch { /* keep the default */ }
    const d = camDist(I), fk = smooth(invLerp(0.6, 0.95, facing));
    const flick = 0.9 + 0.1 * hash(E.draw, 11, 2);
    glows.push(I, { kind: GLOW.soft, m: 0.5 + 0.25 * (h - 1), px: 3, color: c, power: 0.45 * pw * flick * (0.4 + 0.6 * fk), mode: 0, bias: 1.2, cap: 0.05 });
    // the kiss of a flare: a small four-point star, only when it looks into the lens
    if (fk > 0.02 && d < 400) glows.push(I, { kind: GLOW.kira, m: 0.9 * (0.7 + 0.4 * h), px: 4, color: c, power: 0.9 * fk * pw * flick, mode: 0, bias: 1.5, rot: 0.12, cap: 0.05 });
  }

  // ---------------------------------------------------- 3. rifles: muzzle flashes at the door, ricochets on the porcelain
  function rifles(st) {
    const t = E.tq;
    if (t > C.volley - 0.2 && t < C.ray1) {
      const D = VAULT.door, ch = chestAt(E.t);
      const shots = [[0, 0.0], [1, 0.14], [2, 0.31], [0, 0.92], [2, 1.05], [1, 1.3], [0, 1.62]];
      for (let s = 0; s < shots.length; s++) {
        const [g, dt] = shots[s], t0 = onThrees(C.volley + dt) , a = t - t0;
        if (a < 0 || a > 0.5) continue;
        const mz = anchorOf(ctx.folk, 'muzzle' + g, [D[0] - 1.9, D[1] + 1.15, D[2] + (g - 1) * 1.25]);
        if (a < 0.125) {
          glows.push(mz, { kind: GLOW.burst, m: 0.75, color: AMBER, power: 1.6, mode: 0, bias: 1, seed: 0.2 + s * 0.17, cap: 0.3 });
          glows.push(mz, { kind: GLOW.soft, m: 2.4, color: [1, 0.8, 0.45], power: 0.8, mode: 0, bias: 1 });
          E.light.point(mz, [1.0, 0.75, 0.42], 7, 1.6);
          // the shot itself: one drawing of a hard line to the chest
          const hit = ch.clone().add(new V(0.2, hr(s, 3, 1, -0.7, 0.7), hr(s, 3, 2, -0.8, 0.8)));
          ray(mz, hit, { px: 1.0, color: AMBER, hot: GOLD_HOT, power: 0.8, soft: 2, core: 0.5 });
        }
        const hit = ch.clone().add(new V(0.25, hr(s, 3, 1, -0.7, 0.7), hr(s, 3, 2, -0.8, 0.8)));
        sparks(hit, t0, 6, 40 + s, { R: 1.5, n: new V(1, 0.2, 0), life: 0.375 });
        if (a < 0.25) E.light.point(hit, [1.0, 0.8, 0.5], 3, 1.0);
        if (a > 0.1) lobe(mz.x - 0.4 - a * 0.8, mz.y + 0.1 + a * 0.6, mz.z, 0.3 + a * 0.5, 30 + s, 0.1, a / 0.5, PAL.STEAM, ID.STEAM[s % 3]);
      }
    }
    // s11: rifle fire from the courtyard sparks on its back as it climbs
    if (t > 23.4 && t < 26.4) {
      const ch = chestAt(E.t);
      const times = [23.7, 24.05, 24.3, 24.9, 25.2, 25.55, 25.9, 26.1];
      for (let s = 0; s < times.length; s++) {
        const hit = ch.clone().add(new V(hr(s, 5, 1, -1.2, 1.2), hr(s, 5, 2, -1.4, 1.6), 0.9 + hr(s, 5, 3, 0, 0.5)));
        sparks(hit, onThrees(times[s]), 5, 60 + s, { R: 1.6, n: new V(0, 0.1, 1), life: 0.375 });
      }
    }
  }

  // ---------------------------------------------------- 4a. ray 1: the line across the iron door
  function ray1(st) {
    const t = E.t, tq = E.tq;
    if (t < C.ray1 - 0.4 || t > C.doorBurst + 3.2) return;
    const [P0, P1] = doorPts(), I = rayFrom(t), D = VAULT.door;
    const draw = 0.42;
    // the charge: the iris pinches to a star before it fires
    if (t < C.ray1) { const k = smooth((t - (C.ray1 - 0.4)) / 0.4); glows.push(I, { kind: GLOW.kira, m: 2.6 * (1.2 - k), color: GOLD_HOT, power: 1.2 * k, mode: 0, bias: 1.5, rot: 0.78 }); return; }
    const u = clamp((t - C.ray1) / draw);
    const tip = P0.clone().lerp(P1, easeOut(u, 1.6));
    if (t < C.ray1 + draw + 0.08) {
      ray(I, tip, { px: 1.0, m: 0, power: 1.7, soft: 7 });
      glows.push(tip, { kind: GLOW.kira, m: 0.9, color: GOLD_HOT, power: 1.5, mode: 0, bias: 1, rot: hash(E.draw, 5) });
      glows.push(tip, { kind: GLOW.soft, m: 1.3, color: GOLD, power: 1.0, mode: 0, bias: 1 });
      glows.push(I, { kind: GLOW.kira, m: 2.0, color: WHITE, power: 1.4, mode: 0, bias: 1.5, rot: 0.3 });
      sparks(tip, tq, 6, 80 + E.draw, { R: 1.3, n: new V(-1, 0.2, 0), life: 0.25, color: GOLD });
      E.light.line(I, tip, [2.2, 1.9, 1.3], 14, 1);
      E.light.point(tip, [1.0, 0.85, 0.5], 6, 1.6);
    }
    if (t < C.doorBurst) {
      // the line it leaves: white, then gold, then it sags and begins to run
      const a = (t - C.ray1 - draw) / (C.doorBurst - C.ray1 - draw), age = clamp(a) * 0.55;
      const sag = easeIn(clamp(a), 2);
      const pts = [];
      for (let i = 0; i <= 26; i++) {
        const s = (i / 26) * easeOut(u, 1.6);
        const p = P0.clone().lerp(P1, s);
        p.y -= sag * (0.1 + 0.34 * Math.pow(Math.sin(s * 9.4 + 1.3) * 0.5 + 0.5, 3));
        pts.push(p);
      }
      const hotter = 1 + 0.6 * smooth((a - 0.6) / 0.4);    // just before it goes, it flares
      scratch(pts, a > 0.6 ? 0 : age, { px: 1.3 + 1.6 * sag, m: 0.004 + 0.02 * sag, power: hotter, soft: 8 + 8 * sag, bias: 0.9 });
      // molten runs dripping from the cut
      if (a > 0.15) for (let i = 0; i < 6; i++) {
        const s = hr(i, 91, 1, 0.08, 0.95), p = P0.clone().lerp(P1, s), len = (0.3 + 1.5 * hash(i, 91, 2)) * easeIn(clamp((a - 0.15 - i * 0.05) / 0.8), 1.5);
        if (len > 0.02) scratch(linePts(p, p.clone().add(new V(0, -len, 0)), 5), 0.35, { px: 1.3, m: 0.016, width: (q) => 1 - 0.6 * q, bias: 0.9 });
      }
      const mid = P0.clone().lerp(P1, 0.5); mid.x -= 0.6;
      E.light.line(P0.clone().add(new V(-0.6, 0, 0)), tip.clone().add(new V(-0.6, 0, 0)), [1.0, 0.62, 0.22], 7, 1.4 + 1.2 * sag);
      if (a > 0.5) glows.push(mid, { kind: GLOW.soft, m: 5, color: AMBER, power: 0.5 * smooth((a - 0.5) / 0.5), mode: 0, bias: 1.5 });
      return;
    }
    // the door goes: sheets of molten iron blown outward (+X), a hard flash, fire in the frame
    const a = tq - C.doorBurst, at = t - C.doorBurst;
    const c = new V(D[0] + 0.4, D[1] + 3.0, D[2]);
    if (a < 0.25) {
      screenFlash(a < 0.125 ? 0.14 : 0, [1.0, 0.9, 0.7], c);
    }
    if (at < 2.6) {
      const R3 = new V(0, 0, 1), U3 = new V(0, 1, 0), N3 = new V(1, 0, 0);
      for (let i = 0; i < 9; i++) {
        const sp = at * hr(i, 9, 2, 1.6, 4.6), big = i < 4;
        const v = hr(i, 9, 3, 9, 20), vy = hr(i, 9, 4, 1, 7), vz = hr(i, 9, 5, -4.5, 4.5);
        const P = new V(D[0] + 0.3 + v * at * (1 - 0.14 * at), D[1] + hr(i, 9, 6, 1.2, 5) + vy * at - 4.9 * at * at, D[2] + hr(i, 9, 7, -2.2, 2.2) + vz * at);
        if (P.y < D[1] + 0.1) P.y = D[1] + 0.1;
        const len = big ? hr(i, 9, 8, 2.4, 3.6) : hr(i, 9, 8, 0.9, 1.7), wid = hr(i, 9, 10, 0.5, 0.85);
        const heat = clamp(1 - at / 2.2);
        const edge = [1.0, 0.36 + 0.5 * heat, 0.1 + 0.3 * heat], inner = heat > 0.55 ? [1.0, 0.95, 0.7] : [0.5 * heat + 0.12, 0.2 * heat + 0.07, 0.06];
        const A = new V().addScaledVector(R3, Math.cos(sp + i * 1.7)).addScaledVector(U3, Math.sin(sp + i * 1.7)).addScaledVector(N3, 0.3 * Math.sin(sp * 1.4)).normalize();
        const flip = 0.35 + 0.65 * Math.abs(Math.cos(sp * 1.25 + i));
        const J = []; for (let q = 0; q <= 6; q++) J.push(hr(i, 40 + q, 9, 0.45, 1));
        const pts = [];
        for (let q = -5; q <= 5; q++) { const f = q / 5, bend = (0.2 + 0.3 * Math.sin(sp * 0.7 + i)) * f * f; pts.push(P.clone().addScaledVector(A, f * len * 0.5).addScaledVector(U3, bend * len * 0.4).addScaledVector(N3, bend * len * 0.3)); }
        const w = (s) => { const q = Math.min(5, Math.floor(s * 6)), f = s * 6 - q; return (J[q] + (J[q + 1] - J[q]) * f) * flip; };
        beams.push(pts, { m: len * wid * 0.5, px: 0, width: w, color: edge, hot: inner, power: 1.2, core: 0.72, soft: 3 * heat, seed: 0.2 + i * 0.37, mode: 0, bias: 2 });
      }
      fireArcs(c, C.doorBurst, 8, 17, 4.5, { life: 1.4 });
    }
    burst(c, C.doorBurst, 3.3, 5);
    // the cut edge of the frame keeps glowing as it cools
    const cool = clamp(at / 3.0);
    if (cool < 1) {
      const y0 = D[1] + 0.1, y1 = D[1] + 6.2, z0 = D[2] - 2.9, z1 = D[2] + 2.9, x = D[0] - 0.2;
      const fr = [new V(x, y0, z0), new V(x, y1 - 1.6, z0 - 0.2), new V(x, y1, z0 + 1.6), new V(x, y1 - 0.3, z1 - 1.2), new V(x, y1 - 1.9, z1 + 0.2), new V(x, y0, z1)];
      const pts = []; for (let i = 0; i < fr.length - 1; i++) for (let q = 0; q < 5; q++) pts.push(fr[i].clone().lerp(fr[i + 1], q / 5)); pts.push(fr[fr.length - 1]);
      scratch(pts, 0.25 + 0.75 * cool, { px: 2.2 * (1 - cool * 0.5), m: 0.05, power: 1 - cool * 0.6, bias: 1.4 });
      E.light.point(new V(D[0] - 1, D[1] + 3, D[2]), [1.0, 0.5, 0.2], 8, 1.3 * (1 - cool));
    }
  }

  // ---------------------------------------------------- 4b. THE SWEEP and the running wall of fire
  const wallTop = 130.55, NS = 22;      // merlon tops at 130.4 (land)
  const wallP = (u, y = wallTop) => new V(lerp(WALL.a[0], WALL.b[0], u), y, lerp(WALL.a[2], WALL.b[2], u));
  const stationT = (i) => C.erupt + ((i + 0.5) / NS) * (Math.min(C.eruptEnd, 42.15) - C.erupt);      // the front reaches the wall's end before the cut
  function sweep(st) {
    const t = E.t;
    if (t < C.irisBack || t > C.erupt + 0.3) return;
    const I = rayFrom(t), su = sweepU(t);
    if (t >= C.sweep - 0.35 && t < C.sweep) {
      const k = smooth((t - (C.sweep - 0.35)) / 0.35);
      glows.push(I, { kind: GLOW.kira, m: 9 * (1.3 - k), color: WHITE, power: 1.3 * k, mode: 0, bias: 4, rot: 0.78 });
    }
    if (t >= C.sweep && t < C.sweepEnd + 0.06) {
      const sp = sweepPoint(t), tip = new V(sp[0], wallTop, sp[2]);
      ray(I, tip, { px: 1.3, m: 0.03, power: 1.9, soft: 16, bias: 4 });
      glows.push(tip, { kind: GLOW.kira, m: 9, px: 5, color: GOLD_HOT, power: 1.5, mode: 0, bias: 4, rot: hash(E.draw, 6) * 1.5 });
      glows.push(tip, { kind: GLOW.soft, m: 12, color: GOLD, power: 0.9, mode: 0, bias: 4 });
      glows.push(I, { kind: GLOW.kira, m: 8, px: 5, color: WHITE, power: 1.5, mode: 0, bias: 4, rot: 0.3 });
      sparks(tip, E.tq, 6, 120 + E.draw, { R: 7, life: 0.25, color: GOLD, m: 0.12, g: 6 });
      E.light.line(I, tip, [2.2, 2.0, 1.5], 40, 1);
      E.light.point(tip, [1.0, 0.85, 0.55], 26, 1.6);
      E.sky(0.05, 0.05, 0.04);
    }
    // the faint glowing scratch it leaves along the wall, holding its breath, brightening the instant before it goes
    if (t >= C.sweep) {
      const eu = eruptU(t), from = eu, to = su;
      if (to - from > 0.002) {
        const pts = []; for (let i = 0; i <= 40; i++) pts.push(wallP(lerp(from, to, i / 40)));
        const hold = clamp((t - C.sweepEnd) / (C.erupt - C.sweepEnd)), pre = smooth((hold - 0.6) / 0.4);
        scratch(pts, 0.5 - 0.5 * pre, { px: 1.3 + 0.8 * pre, m: 0.08, power: 0.62 + 0.6 * pre, soft: 4 + 6 * pre, bias: 5 });
        E.light.line(wallP(from), wallP(to), [1.0, 0.7, 0.3], 10, 0.8 + pre);
      }
    }
  }
  function eruption(st) {
    const t = E.t, tq = E.tq;
    if (t < C.erupt) return;
    const eu = eruptU(t), front = wallP(eu, WALL.a[1] + 4);
    const cd = camDist(wallP(0.5));
    const since = t - C.erupt, late = t > C.eruptEnd + 2.5;
    // the dam lit vermilion from the burning line, flickering on threes
    const s20 = t >= 48.4 && t < 51.4, u0 = s20 ? 0.16 : 0;
    const fl = 0.85 + 0.15 * hash(E.draw, 31, 1);
    const settle = lerp(1.9, 0.95, smooth((since - 1.6) / 4));
    E.light.line(wallP(u0, WALL.a[1] + 14), wallP(Math.max(eu, u0), WALL.a[1] + 14), [1.0, 0.4, 0.13], s20 ? 200 : 420, settle * fl);
    if (eu < 1) {
      E.light.point(front, [1.0, 0.75, 0.4], 70, 2.0);
    }
    const fk = Math.exp(-Math.max(0, since - (C.eruptEnd - C.erupt) * 0.5) * 0.9);
    E.sky(0.55 * fk + 0.06, 0.2 * fk + 0.02, 0.06 * fk);
    if (since < 0.125) screenFlash(0.35, [1.0, 0.85, 0.6], wallP(0));
    if (cd > 1500) return;
    const wide = cd > 120;
    for (let i = 0; i < NS; i++) {
      const u = (i + 0.5) / NS, ti = stationT(i), a = tq - ti;
      if (a < 0) continue;
      const jz = hr(i, 51, 1, -4, 3), p = wallP(u, WALL.a[1] + 3); p.z += jz;
      if (s20 && p.x < 84) continue;
      const R = hr(i, 51, 2, 19, 31);
      // flat anime explosion domes in sequence
      if (a < 2.4) {
        if (a < 0.25) {
          glows.push(p, { kind: GLOW.burst, m: R * (1.3 + 3 * a), color: AMBER, power: 1.6, mode: 0, bias: R * 1.5, seed: 0.2 + i * 0.11 + (a < 0.125 ? 0 : 0.3), cap: 0.13 });
        }
        fireDome(E, p, ti, R, 100 + i, 2.4, { n: wide ? 13 : 18, collar: 0 });
        fireArcs(p, ti, 3, 200 + i, R, { life: 1.5 });
        debris(p, ti, 4, 300 + i, { speed: 34, size: 2.4, life: 2.4, up: 1.1, hot: true });
        debris(p, ti, 5, 330 + i, { speed: 50, size: 3.4, life: 2.6, up: 1.25, color: '#15100e', dir: [0.5, 0, 0.25] });
      }
      // tall cel flames: the line stands up as a wall of fire, then settles into standing fires
      const rise = 1 - Math.exp(-a / 0.16), fall = lerp(1, 0.42, smooth((a - 0.9) / 4));
      const tall = hr(i, 51, 3, 56, 104) * (i % 3 === 0 ? 1.25 : 1) * rise * fall;
      if (!late || i % 2 === 0) flame(p.x, WALL.a[1] + 1.5, p.z, tall, hr(i, 51, 4, 6.5, 10), 400 + i * 5, { n: a < 3 ? 3 : 2 });
      // smoke columns from every third fire
      // the leading flames: a few really tall tongues that stand up at the front and fall back
      if (i % 2 === 0 && a < 0.75) flame(p.x + 4, WALL.a[1] + 1.5, p.z, hr(i, 52, 1, 150, 210) * (1 - Math.exp(-a / 0.09)) * (1 - 0.6 * a / 0.75), hr(i, 52, 2, 8, 11), 470 + i * 3, { n: 1, lean: 0.3 });
      if (i % 3 === 1) column(new V(p.x, WALL.a[1] + 6, p.z - 5), ti + 0.5, hr(i, 51, 5, 9, 15), hr(i, 51, 6, 130, 230), 500 + i, { tau: hr(i, 51, 7, 2.6, 4.2), lean: hr(i, 51, 8, 1.6, 3.6) });
    }
  }

  // ---------------------------------------------------- 4c. ray 2: a long slanted cut across the ironclad
  const hullPts = (t) => [shipAnchor('shipHullA', [-74, 9, -17.5], t), shipAnchor('shipHullB', [58, -9, -17.5], t)];
  function ray2(st) {
    const t = E.t, tq = E.tq;
    if (t < C.ray2 - 0.4) return;
    const [A, B] = hullPts(t), I = rayFrom(t), draw = 0.5;
    const cd = camDist(A.clone().lerp(B, 0.5));
    if (t < C.ray2) { const k = smooth((t - (C.ray2 - 0.4)) / 0.4); glows.push(I, { kind: GLOW.kira, m: 3.4 * (1.25 - k), color: WHITE, power: 1.3 * k, mode: 0, bias: 1.5, rot: 0.78 }); return; }
    const u = clamp((t - C.ray2) / draw), tip = A.clone().lerp(B, easeOut(u, 1.4));
    if (t < C.ray2 + draw + 0.1) {
      ray(I, tip, { px: 1.3, m: 0.03, power: 1.9, soft: 16, bias: 6 });
      glows.push(tip, { kind: GLOW.kira, m: 12, px: 5, color: GOLD_HOT, power: 1.5, mode: 0, bias: 8, rot: hash(E.draw, 6) * 1.5 });
      glows.push(I, { kind: GLOW.kira, m: 3.2, px: 5, color: WHITE, power: 1.5, mode: 0, bias: 2, rot: 0.3 });
      sparks(tip, tq, 6, 140 + E.draw, { R: 8, life: 0.25, color: GOLD, m: 0.14, g: 6, n: new V(0, 0, -1) });
      E.light.line(I, tip, [2.2, 2.0, 1.5], 30, 1);
      E.light.point(tip, [1.0, 0.85, 0.55], 30, 1.6);
    }
    if (t < C.hullBurn + 0.3) {
      const a = clamp((t - C.ray2 - draw) / (C.hullBurn - C.ray2 - draw)), pre = smooth((a - 0.5) / 0.5);
      const pts = []; for (let i = 0; i <= 30; i++) pts.push(A.clone().lerp(B, (i / 30) * easeOut(u, 1.4)));
      scratch(pts, 0.4 - 0.4 * pre, { px: 1.5 + 1.5 * pre, m: 0.12 + 0.3 * pre, power: 0.9 + 0.7 * pre, soft: 5 + 8 * pre, bias: 8 });
      E.light.line(A, tip, [1.0, 0.7, 0.3], 22, 1 + pre);
    }
    if (t < C.hullBurn) return;
    // the line blooms into fire along the hull, bow to stern in a quick run, and keeps burning
    const N = 7, since = t - C.hullBurn;
    if (since < 0.125) screenFlash(0.25, [1.0, 0.85, 0.6], A.clone().lerp(B, 0.5));
    E.sky(0.3 * Math.exp(-since * 1.5), 0.12 * Math.exp(-since * 1.5), 0.03);
    const out = new V(0, 0, -1);
    for (let i = 0; i < N; i++) {
      const s = (i + 0.5) / N, ti = C.hullBurn + s * 0.5, a = tq - ti;
      if (a < 0) continue;
      const p = A.clone().lerp(B, s).addScaledVector(out, 3);
      const R = hr(i, 71, 1, 9, 15);
      if (cd < 1200) {
        if (a < 2.2) { fireDome(E, p, ti, R, 600 + i, 2.2, { n: 12, collar: 0 }); fireArcs(p, ti, 3, 620 + i, R, { life: 1.4 }); }
        const rise = 1 - Math.exp(-a / 0.2), fall = lerp(1, 0.5, smooth((a - 0.8) / 3));
        flame(p.x, p.y - 2, p.z - 1, hr(i, 71, 2, 16, 30) * rise * fall, hr(i, 71, 3, 3.5, 5.5), 640 + i * 5, { n: 2, lean: 0.3 });
        if (i % 3 === 1) column(new V(p.x, p.y + 4, p.z), ti + 0.5, hr(i, 72, 1, 5, 8), hr(i, 72, 2, 70, 120), 660 + i, { tau: 3, lean: hr(i, 72, 3, 2, 4) });
      }
    }
    const fl = 0.85 + 0.15 * hash(E.draw, 33, 1);
    E.light.line(A.clone().addScaledVector(out, 8), B.clone().addScaledVector(out, 8), [1.0, 0.42, 0.14], 110, (0.9 + 1.2 * Math.exp(-since)) * fl);
  }

  // ---------------------------------------------------- 5. shaft dust, the courtyard burst, roof dust under the kneel
  function dusts(st) {
    const t = E.t, tq = E.tq;
    // the torn arm hits the flags: dust jumps out from under it, low and uneven
    if (tq >= C.armDrop && tq < C.armDrop + 1.5) {
      const a = tq - C.armDrop, u = a / 1.5, A = anchorOf(ctx.mech, 'looseArm', [SLAB[0] - 1, VAULT.floorY + 0.4, SLAB[2] + 2]);
      puffs.inkZ = E.inkZ(A.x, VAULT.floorY, A.z) + 1;
      for (let i = 0; i < 6; i++) {
        const az = (i / 6) * 6.283 + hash(i, 12, 1) * 0.9, rr = (0.7 + 2.4 * hash(i, 12, 3)) * easeOut(clamp(a / 0.6), 2);
        lobe(A.x + Math.cos(az) * rr * 1.5, VAULT.floorY + 0.3 + 0.5 * a * hash(i, 12, 4), A.z + Math.sin(az) * rr, (0.35 + 0.6 * hash(i, 12, 2) * hash(i, 12, 5)) * (0.6 + u), 14 + i, 0.08, clamp((u - 0.3) / 0.7), i % 2 ? PAL.GOLDDUST : PAL.DUST, ID.DUST[i % 3]);
      }
      puffs.inkZ = 0;
      debris(new V(A.x, VAULT.floorY + 0.2, A.z), C.armDrop, 6, 12, { speed: 3.5, size: 0.14, life: 1.2, up: 1.0, floor: VAULT.floorY });
    }
    // the leap: a ring of dust kicked off the vault floor under the shaft
    if (tq >= C.leap && tq < C.leap + 1.6) {
      const a = tq - C.leap, u = a / 1.6;
      puffs.inkZ = 0;
      for (let i = 0; i < 10; i++) {
        const az = (i / 10) * 6.283 + hash(i, 13, 1), rr = 2.2 + 6.5 * easeOut(clamp(a / 0.8), 2);
        lobe(WELL.center[0] + Math.cos(az) * rr, VAULT.floorY + 0.5 + a * 0.8, WELL.center[1] + Math.sin(az) * rr, (0.9 + 0.7 * hash(i, 13, 2)) * (0.5 + u), 10 + i, 0.05, clamp((u - 0.4) / 0.6), PAL.GOLDDUST, ID.DUST[i % 3]);
      }
    }
    // dust shaken from the shaft walls as it rises
    if (tq >= C.leap && tq < C.burst + 0.5) {
      for (let i = 0; i < 8; i++) {
        const a = tq - (C.leap + 0.2 + i * 0.2);
        if (a < 0 || a > 1.4) continue;
        const y = lerp(WELL.bottom + 4, WELL.top - 3, (i + 0.5) / 8) - a * 3, az = hash(i, 15, 1) * 6.283;
        lobe(WELL.center[0] + Math.cos(az) * (WELL.r - 1.2), y, WELL.center[1] + Math.sin(az) * (WELL.r - 1.2), 0.8 + a * 0.7, 20 + i, 0.1, clamp((a / 1.4 - 0.4) / 0.6), PAL.DUST, ID.DUST[i % 3]);
      }
    }
    // THE COURTYARD BURST: the well cap goes up on a column of dust and embers, flagstones flying
    if (tq >= C.burst - 0.01 && t < C.burst + 5) {
      const a = tq - C.burst, p = anchorOf(ctx.land, 'wellMouth', [WELL.center[0], WELL.top, WELL.center[1]]);
      const life = 4.6, age = a / life, pal = PAL.GOLDDUST;
      if (a < 0.25) {
        glows.push(new V(p.x, p.y + 2, p.z), { kind: GLOW.burst, m: 6 + 8 * a, color: GOLD, power: 1.4, mode: 0, bias: 14, seed: 0.5 + (a < 0.125 ? 0 : 0.3), cap: 0.11 });
      }
      E.light.point(new V(p.x, p.y + 6, p.z), [1.0, 0.74, 0.34], 26, 2.0 * Math.exp(-a * 1.6));
      // one big erupting column of dust, torn at the top
      column(new V(p.x, p.y, p.z), C.burst, 3.6, 34, 5, { tau: 0.5, lean: 1.2, pal: SMOKE.dust, fire: 0, dissolve: 0.5 + 1.4 * smooth((a - 1.6) / 2.6), end: C.burst + 3.4, fadeOut: 1.6 });
      column(new V(p.x + 1.5, p.y, p.z - 2.5), C.burst + 0.125, 2.4, 22, 9, { tau: 0.7, lean: -1.4, pal: SMOKE.gold, fire: 0, dissolve: 0.6 + 1.4 * smooth((a - 1.2) / 2.4), end: C.burst + 3.0, fadeOut: 1.6 });
      // a low skirt rolling out along the flagstones: a few fat uneven rolls, not a ring
      puffs.inkZ = E.inkZ(p.x, p.y + 2, p.z) + 4;
      for (let i = 0; i < 7; i++) {
        const az = (i / 7) * 6.283 + hash(i, 18, 1) * 0.8, g = easeOut(clamp(a / 1.1), 2.2), rr = WELL.r + (3 + 11 * hash(i, 18, 4)) * g;
        const big = 1.6 + 2.6 * hash(i, 18, 2) * hash(i, 18, 5);
        lobe(p.x + Math.cos(az) * rr, p.y + big * 0.45 + 0.6 * g, p.z + Math.sin(az) * rr, big * (0.5 + 0.7 * g), 60 + i, 0.12, clamp(invLerp(0.3, 0.85, age + hash(i, 18, 3) * 0.12)), i % 3 ? PAL.DUST : PAL.PALE, ID.DUST[i % 3]);
      }
      puffs.inkZ = 0;
      debris(new V(p.x, p.y + 0.5, p.z), C.burst, 16, 19, { speed: 13, size: 1.0, life: 3.0, up: 1.5, flat: true, floor: p.y - 0.3 });
      fireArcs(new V(p.x, p.y + 1, p.z), C.burst, 7, 21, 7, { life: 1.5 });
      // embers riding the column
      const col = new THREE.Color();
      for (let i = 0; i < 26; i++) {
        const b = hash(i, 23, 1) * 1.2, aa = a - b, L = hr(i, 23, 2, 1.4, 2.6);
        if (aa < 0 || aa > L) continue;
        const u = aa / L, az = hash(i, 23, 3) * 6.283, off = 1 + 6 * hash(i, 23, 4) * u;
        col.setRGB(1.0, 0.5 + 0.3 * (1 - u), 0.14);
        const sz = hr(i, 23, 5, 0.12, 0.26) * (1 - u * u);
        petals.push(p.x + Math.cos(az) * off, p.y + 2 + 24 * (1 - Math.exp(-aa * 0.9)) * hr(i, 23, 6, 0.5, 1), p.z + Math.sin(az) * off, aa * 4 + i, aa * 3, i, sz, sz * 0.6, sz, col);
      }
    }
    // the kneel: the roof shakes, dust jumps from the flagstones around its knee and hand
    const tk = 29.6;
    if (tq >= tk && tq < tk + 1.5) {
      const a = tq - tk, u = a / 1.5, K = ROOF.lanternKneel;
      for (let i = 0; i < 9; i++) {
        const az = Math.PI + (i / 8 - 0.5) * 3.6 + hash(i, 25, 1) * 0.3, rr = 1.6 + 3.2 * easeOut(clamp(a / 0.7), 2);
        lobe(K[0] + Math.cos(az) * rr * 0.9, K[1] + 0.35 + 0.5 * a, K[2] + Math.sin(az) * rr * 0.55 - 0.6, (0.45 + 0.35 * hash(i, 25, 2)) * (0.6 + u), 70 + i, 0.05, clamp((u - 0.35) / 0.65), PAL.PALE, ID.DUST[i % 3]);
      }
    }
  }

  // ---------------------------------------------------- 6. shells: muzzle flash, the shell and its trail, the flat burst
  function shells(st) {
    const t = E.t, tq = E.tq;
    for (let si = 0; si < SHELLS.length; si++) {
      const s = SHELLS[si];
      if (t < s.t0 - 0.05 || t > s.t1 + 9) continue;
      const big = s.id === 'shell1', onL = s.hit === 'lantern';
      const from = shellFrom(s), to = v3(s.to), dist = from.distanceTo(to), dir = to.clone().sub(from).normalize();
      const ms = big ? 1 : 2.4;      // the ship's guns are bigger
      // muzzle: a hard star for one drawing, a tongue of fire for two, smoke rolling out for a second
      const am = tq - onThrees(s.t0);
      if (am >= 0 && am < 1.4) {
        const mz = from.clone().addScaledVector(dir, 1.5 * ms);
        if (am < 0.125) {
          glows.push(mz, { kind: GLOW.burst, m: 5 * ms, color: AMBER, power: 1.6, mode: 0, bias: 6 * ms, seed: 0.21 + si * 0.13, cap: 0.13 });
          glows.push(mz, { kind: GLOW.soft, m: 12 * ms, color: [1, 0.8, 0.45], power: 0.5, mode: 0, bias: 8 * ms, cap: 0.2 });
        }
        if (am < 0.25) {
          puffs.push(mz.x, mz.y, mz.z, 1.3 * ms, 6.5 * ms * (1 - am * 2), 0.1, 0.4, dir.x, dir.y, dir.z, 11 + si, -0.5, 0, KIND.TONGUE, PAL.FIRE, 101);
          E.light.point(mz, [1.0, 0.72, 0.38], 22 * ms, 2.0 * (1 - am / 0.25));
        }
        for (let i = 0; i < 4; i++) {
          const u = am / 1.4, k = easeOut(clamp(am / 0.6), 2);
          lobe(mz.x + dir.x * (2 + i * 2.2) * k * ms + hr(i, si, 1, -1, 1), mz.y + dir.y * (2 + i * 2.2) * k * ms + u * 2 + hr(i, si, 2, -0.6, 0.6), mz.z + dir.z * (2 + i * 2.2) * k * ms + hr(i, si, 3, -1, 1), (1.1 + 0.5 * i) * ms * (0.5 + 0.6 * k), 90 + si * 4 + i, 0.08, clamp((u - 0.3) / 0.7), PAL.STEAM, ID.STEAM[i % 3]);
        }
      }
      // the shell: a white-hot dash with an amber tail and a thin smoke trail behind it
      if (t >= s.t0 && t < s.t1) {
        const u = (t - s.t0) / (s.t1 - s.t0), arc = (q) => from.clone().lerp(to, q).add(new V(0, Math.sin(Math.PI * q) * dist * 0.012, 0));
        const u0 = Math.max(0, u - Math.min(0.14, 60 / dist));
        const pts = []; for (let i = 0; i <= 8; i++) pts.push(arc(lerp(u0, u, i / 8)));
        const cd = camDist(pts[8]);
        beams.push(pts, { px: 2.2, m: 0.22, width: (q) => 0.15 + 0.85 * q, color: AMBER, hot: WHITE, power: 1.6, core: 0.5, soft: 8, seed: si, mode: 0, bias: 2 + cd * 0.01 });
        glows.push(pts[8], { kind: GLOW.kira, m: 2.2, px: 4, color: GOLD_HOT, power: 1.3, mode: 0, bias: 3 + cd * 0.01, rot: 0.4 });
        const tp = []; for (let i = 0; i <= 14; i++) tp.push(arc(u * (i / 14)));
        trails.push(tp, { m: 0.5 * ms, px: 0.8, color: [0.16, 0.25, 0.28], hot: [0.62, 0.76, 0.76], power: (q) => 0.75 - 0.5 * q, seed: si * 0.37, bias: 3 + cd * 0.01, width: (q) => 0.4 + 0.6 * q });
        E.light.point(pts[8], [1.0, 0.75, 0.4], 9, 1.0);
      }
      // impact
      const t1 = onThrees(s.t1), ai = tq - t1;
      if (ai >= 0) {
        const R = big ? 5.2 : onL ? 2.9 : 5.5;
        // on the Lantern the burst blooms on the side the shell came from, so the figure stays readable against it
        const p = onL ? anchorOf(ctx.mech, 'chest', s.to).addScaledVector(dir, -R * 1.05).add(new V(0, R * 0.3, 0)) : to.clone().addScaledVector(dir, -R * 0.4);
        if (ai < 1.8) {
          burst(p, t1, R, 700 + si * 9, { smoke: t > C.erupt ? PAL.SOOT : PAL.SMOKE, ...(onL && !big ? { smokeN: 3, smokeLife: 0.55, smokeR: 0.7 } : {}) });
          if (ai < 0.125 && big) screenFlash(0.16, [1.0, 0.92, 0.75], p);
          E.sky(0.22 * Math.exp(-ai * 5), 0.12 * Math.exp(-ai * 5), 0.04 * Math.exp(-ai * 5));
          if (s.id !== 'e1') {
            fireArcs(p, t1, big ? 7 : 4, 740 + si * 7, R * 0.9, { life: 1.1 });
            debris(p, t1, onL ? 5 : 9, 760 + si * 7, { speed: 11, size: onL ? 0.28 : 0.7, life: 1.8, up: 0.9, dir: [-dir.x * 0.5, 0, -dir.z * 0.5], color: onL ? '#efe6d2' : '#cfc8b4', hot: true });
          }
        }
        // a wound in the tower smokes for a while (never across the line of the catch)
        if (s.hit === 'tower' && s.id !== 'e1') {
          const end = Math.min(t1 + 9, 66.6);
          column(new V(to.x + 0.6, to.y, to.z + 1.2), t1 + 0.375, 1.5, Math.max(6, Math.min(24, 210 - to.y)), 780 + si, { tau: 1.6, lean: 2.2, end, fadeOut: 0.8 });
          if (ai > 0.6 && E.t < end) { flame(to.x, to.y - 1, to.z + 0.6, 3.6, 1.1, 800 + si * 5, { n: 2 }); if (ai < 10) E.light.point(to, [1.0, 0.5, 0.2], 5, 0.7); }
        }
      }
    }
  }

  // ---------------------------------------------------- 7a. standing fires in the courtyard, debris into the reservoir, embers past the lens
  const COURT_FIRES = [[-84, 120, 18, 9, 3.2], [-132, 120, -14, 7, 2.6], [-96, 120, -26, 11, 3.6], [-40, 120, 30, 8, 3], [56, 120, -30, 12, 4]];
  function afterFires(st) {
    const t = E.t, tq = E.tq;
    if (t < C.eruptEnd) return;
    const cd = camera.position.distanceTo(new V(0, 130, 0)), s20 = t >= 48.4 && t < 51.4;
    if (cd < 900) {
      for (let i = 0; i < COURT_FIRES.length; i++) {
        const f = COURT_FIRES[i], ti = C.eruptEnd + 0.3 + i * 0.35;
        if (tq < ti || (s20 && f[0] < 60)) continue;
        const k = smooth((tq - ti) / 1.2);
        flame(f[0], f[1], f[2], f[3] * k, f[4], 900 + i * 5, { n: 2 });
        if (i % 2 === 0) column(new V(f[0], f[1] + f[3] * 0.3, f[2]), ti + 0.5, f[4] * 1.2, 60 + i * 14, 930 + i, { tau: 3.2, lean: 2 + i * 0.4 });
      }
      if (!s20) E.light.point(new V(-95, 128, 0), [1.0, 0.45, 0.16], 40, 0.9);
    }
    // s18: burning debris raining into the reservoir, each on a drawn arc with a tail of fire, a white ring where it lands
    if (t > C.erupt && t < C.eruptEnd + 4) {
      for (let i = 0; i < 14; i++) {
        const t0 = C.erupt + 0.3 + hash(i, 61, 1) * 3.2, a = t - t0;
        if (a < 0) continue;
        const x0 = lerp(WALL.a[0], WALL.b[0], hash(i, 61, 2)), vz = -hr(i, 61, 3, 26, 44), vy = hr(i, 61, 4, 22, 40), vx = hr(i, 61, 5, -8, 8);
        const pos = (q) => new V(x0 + vx * q, WALL.a[1] + 8 + vy * q - 4.9 * q * q, WALL.a[2] - 10 + vz * q);
        // time it meets the water
        const tw = (vy + Math.sqrt(vy * vy + 19.6 * (WALL.a[1] + 8 - RESERVOIR_Y))) / 9.8;
        if (a < tw) {
          const pts = []; for (let q = 0; q <= 8; q++) pts.push(pos(Math.max(0, a - 0.45) + (a - Math.max(0, a - 0.45)) * (q / 8)));
          beams.push(pts, { m: 0.7, px: 1.3, width: (s) => 0.15 + 0.85 * s, color: AMBER, hot: GOLD_HOT, power: 1.4, core: 0.45, soft: 6, seed: i, mode: 0, bias: 6 });
          const tp = []; for (let q = 0; q <= 10; q++) tp.push(pos(a * (q / 10)));
          trails.push(tp, { m: 1.6, px: 0.8, color: [0.1, 0.09, 0.09], hot: [0.42, 0.24, 0.16], power: (s) => 0.8 - 0.55 * s, seed: i * 0.61, bias: 6, width: (s) => 0.4 + 0.6 * s });
          const P = pos(a), rot = a * 3;
          stones.push(P.x, P.y, P.z, rot + i, rot * 0.6, i, 2.6, 1.8, 2.2, new THREE.Color(1.2, 0.5, 0.2));
        } else if (a < tw + 1.2) {
          const P = pos(tw); P.y = RESERVOIR_Y + 0.3;
          const u = (a - tw) / 1.2;
          glows.push(P, { kind: GLOW.ring, m: 4 + 22 * easeOut(u, 2), aspect: 1, color: [0.8, 0.95, 0.95], power: 0.9 * (1 - u), mode: 0, bias: 8, seed: 0.12 });
          for (let q = 0; q < 3; q++) lobe(P.x + (q - 1) * 2.2, P.y + 2 + 9 * easeOut(u, 2) * (1 - 0.3 * q), P.z + hr(i, q, 9, -1, 1), 2.4 - 0.5 * q, 96 + i + q, 0, clamp((u - 0.3) / 0.7), PAL.STEAM, ID.STEAM[q]);
        }
      }
    }
    // embers drifting past the lens wherever the camera is in the fire's updraft (the roof, the crown)
    if (camera.position.y > 118 && Math.abs(camera.position.z) < 420) {
      const B = 26, cp = camera.position, col = new THREE.Color();
      const k = smooth((t - C.erupt) / 2.5);
      const wrap = (v, c) => c + ((((v - c) % B) + B * 1.5) % B) - B * 0.5;
      for (let i = 0; i < 44; i++) {
        if (hash(i, 77, 9) > k) continue;
        const vx = hr(i, 77, 1, 1.0, 3.2), vy = hr(i, 77, 2, 1.2, 3.6), vz = hr(i, 77, 3, -1.4, 0.6);
        const x = wrap(hash(i, 77, 4) * B + vx * t + Math.sin(t * 1.3 + i) * 0.6, cp.x), y = wrap(hash(i, 77, 5) * B + vy * t, cp.y), z = wrap(hash(i, 77, 6) * B + vz * t + Math.cos(t * 1.1 + i * 2) * 0.6, cp.z);
        const d = Math.hypot(x - cp.x, y - cp.y, z - cp.z);
        if (d < 2.5) continue;
        const edge = 1 - smooth(invLerp(B * 0.36, B * 0.5, Math.max(Math.abs(x - cp.x), Math.abs(y - cp.y), Math.abs(z - cp.z))));
        const sz = hr(i, 77, 7, 0.05, 0.13) * edge * (0.6 + 0.4 * Math.sin(t * 6 + i));
        if (sz < 0.01) continue;
        col.setRGB(1.0, 0.45 + 0.35 * hash(i, 77, 8), 0.12);
        petals.push(x, y, z, t * 3 + i, t * 2.3, i, sz, sz * 0.6, sz, col);
      }
    }
  }

  // ---------------------------------------------------- 7b. searchlights: flat cold cones, a disc of light where they land
  function cone(a, b, R, pw, seed) {
    const d = a.distanceTo(b);
    cones.push(linePts(a, b, 10), { m: R, px: 0, width: (s) => 0.07 + 0.93 * s, color: [0.5, 0.85, 0.95], hot: [0.85, 1.0, 1.0], power: (q) => pw * (1 - 0.72 * q) * (1 - 0.72 * q), core: 0, soft: 0, seed, mode: 0, bias: Math.max(3, d * 0.015) });
    glows.push(a, { kind: GLOW.kira, m: 1.8, px: 4, color: [0.8, 1, 1], power: 0.9, mode: 0, bias: 4, rot: 0.1 + seed, cap: 0.04 });
    // the disc where it lands
    glows.push(b, { kind: GLOW.soft, m: R * 1.5, color: [0.7, 0.95, 1.0], power: 0.42, mode: 0, bias: 2.5, cap: 0.08 });
  }
  function searchlights(st) {
    const t = E.t;
    if (t < C.alarm) return;
    for (let n = 0; n < 6; n++) {
      const lamp = anchorOf(ctx.land, 'searchlight' + n, [-250 + n * 96, DAMTOP + 15, n % 2 ? -40 : 40]);
      const on = C.alarm + 0.1 + n * 0.13;
      if (t < on) continue;
      if (t >= C.erupt && lamp.x > WALL.a[0] - 4 && lamp.x < lerp(WALL.a[0], WALL.b[0], eruptU(t)) + 6) continue;      // the fire takes the east lamps
      let target = null;
      try { if (ctx.land?.searchlightTarget) target = ctx.land.searchlightTarget(n, t, new V()); } catch { target = null; }
      if (!target || !Number.isFinite(target.x)) target = new V(COURT.center[0] + Math.sin(t * 1.3 + n) * 3, 121, COURT.center[2] + Math.cos(t * 1.1 + n * 2) * 3);
      else target = target.clone();
      const L = lamp.distanceTo(target);
      cone(lamp, target, 1.1 + L * 0.011, 0.34, n * 0.37);
      E.light.raw(target, [0.75, 1.15, 1.25], 7 + L * 0.012, t < 26.4 ? 90 - n : 20 - n);
    }
    // the ironclad's belly lamps, sweeping up the tower
    if (t > C.shipRise + 1.0) {
      for (let n = 0; n < 4; n++) {
        const lamp = shipAnchor('shipLamp' + n, [(n - 1.5) * 34, -13, -8], t);
        const up = smooth((t - (C.shipRise + 1.0 + n * 0.4)) / 2.4);
        const target = new V(Math.sin(t * 0.8 + n * 3) * 3.5 + (n - 1.5) * 2.2, lerp(132, [204, 212, 190, 176][n], up) + Math.sin(t * 0.6 + n) * 3, 1.2);
        const L = lamp.distanceTo(target);
        cone(lamp, target, 1.6 + L * 0.011, 0.34, 2.1 + n);
        if (n < 2) E.light.raw(target, [0.7, 1.1, 1.2], 11, 70 - n);
      }
    }
  }
  const DAMTOP = WALL.a[1];

  // ---------------------------------------------------- 7c. speed lines (skiff shots)
  function speedLines(st) {
    const sid = st.sid;
    if (sid !== 's21' && sid !== 's25' && sid !== 's27') return;
    const D = E.draw, d = 8, th = Math.tan((camera.fov * Math.PI) / 360) * d, asp = camera.aspect;
    const R = new V(1, 0, 0).applyQuaternion(camera.quaternion), U = new V(0, 1, 0).applyQuaternion(camera.quaternion), F = new V(0, 0, -1).applyQuaternion(camera.quaternion);
    const at = (x, y) => camera.position.clone().addScaledVector(F, d).addScaledVector(R, x * th * asp).addScaledVector(U, y * th);
    const n = sid === 's27' ? 12 : 16;
    for (let i = 0; i < n; i++) {
      if (hash(i, D, 3) < 0.4) continue;
      let a, b;
      if (sid === 's21') {
        const an = hash(i, D, 4) * 6.283, r0 = 0.62 + 0.3 * hash(i, D, 5), r1 = r0 + 0.2 + 0.5 * hash(i, D, 6);
        a = at(Math.cos(an) * r0, Math.sin(an) * r0 * 1.2); b = at(Math.cos(an) * r1, Math.sin(an) * r1 * 1.2);
      } else {
        const y = (hash(i, D, 4) - 0.5) * 1.9;
        if (Math.abs(y) < 0.3 && sid === 's27') continue;
        const x0 = hr(i, D, 5, -1.1, 0.5), len = hr(i, D, 6, 0.25, 0.8), tilt = sid === 's25' ? 0.12 : 0.03;
        a = at(x0, y + x0 * tilt); b = at(x0 + len, y + (x0 + len) * tilt);
      }
      beams.push(linePts(a, b, 6), { px: 1.1 + 1.2 * hash(i, D, 7), m: 0, width: (s) => Math.sin(Math.PI * s), color: [0.82, 0.95, 0.92], hot: [0.95, 1, 0.98], power: 0.5, core: 0.7, soft: 0, seed: i, mode: 2 });
    }
  }

  // ---------------------------------------------------- 7d. the Lantern's inner fire: glow through the cracks, the coming apart, the dying light
  function lanternGlow(st) {
    const t = E.t, tq = E.tq;
    const tHit = SHELLS.find((s) => s.id === 'd0').t1, tApart = C.lastSalvo + 0.8;
    if (t < tHit) return;
    const ch = chestAt(t);
    const dying = 1 - smooth(invLerp(tApart + 0.1, C.irisOut, t));
    const swell = smooth(invLerp(C.lastSalvo - 0.3, tApart, t));
    const k = (0.55 + 0.25 * smooth((t - tHit) / 0.4) * 0 + 0.75 * swell) * smooth((t - tHit) / 0.3) * dying;
    if (k <= 0.005) return;
    const fl = 0.8 + 0.2 * hash(E.draw, 41, 1), D = E.draw;
    const hot = swell > 0.5 ? WHITE : GOLD_HOT;
    glows.push(ch, { kind: GLOW.soft, m: 2.6 + 3 * swell, color: [1.0, 0.62, 0.2], power: 0.6 * k * fl, mode: 0, bias: 2.5 });
    glows.push(ch, { kind: GLOW.soft, m: 0.9 + 1.4 * swell, color: hot, power: 0.9 * k * fl, mode: 0, bias: 2.5 });
    // light leaking in blades through the cracks, redrawn on threes
    const nb = 5 + Math.round(6 * swell);
    for (let i = 0; i < nb; i++) {
      if (hash(i, D, 42) < 0.3) continue;
      const dir = new V(hash(i, 43, 1) - 0.5, hash(i, 43, 2) - 0.45, hash(i, 43, 3) - 0.5).normalize();
      const o = ch.clone().add(new V(hr(i, 44, 1, -0.7, 0.7), hr(i, 44, 2, -1.6, 1.2), hr(i, 44, 3, -0.5, 0.5)));
      const len = (1.2 + 3.2 * hash(i, D, 45)) * (0.6 + 1.3 * swell);
      beams.push(linePts(o.clone().addScaledVector(dir, 0.35), o.clone().addScaledVector(dir, len), 5), { px: 1.2, m: 0.05 + 0.1 * swell, width: (s) => 1 - s, color: GOLD, hot, power: 1.2 * k, core: 0.5, soft: 4, seed: i, mode: 0, bias: 1.5 });
    }
    E.light.raw(ch, [2.6 * k * fl, 1.6 * k * fl, 0.6 * k * fl], 12 + 14 * swell, 300);
    // it comes apart: one flat gold-white star, a ring, plates and dust thrown out, then the light sinks and goes
    const a = tq - onThrees(tApart);
    if (a >= 0) {
      burst(ch.clone().add(new V(0, 0.4, -0.6)), onThrees(tApart), 2.6, 47, { smoke: PAL.GOLDDUST, smokeN: 4, smokeLife: 0.9, smokeR: 0.8 });
      if (a < 0.25) { glows.push(ch, { kind: GLOW.kira, m: 3, color: GOLD_HOT, power: 1.2, mode: 1, rot: 0.2, cap: 0.07 }); E.sky(0.2, 0.15, 0.07); }
      debris(ch, tApart, 14, 47, { speed: 9, size: 0.42, life: 2.4, up: 0.9, color: '#efe6d2', flat: true, floor: ROOF.lanternStand[1] - 12 });
      fireArcs(ch, tApart, 8, 48, 4, { life: 1.3 });
      for (let i = 0; i < 9; i++) {
        const az = (i / 9) * 6.283 + hash(i, 49, 1), g = easeOut(clamp(a / 1.0), 2), u = a / 2.2;
        if (u < 1) lobe(ch.x + Math.cos(az) * (1 + 4.5 * g), ch.y - 1.5 + 1.2 * g + hash(i, 49, 3), ch.z + Math.sin(az) * (1 + 4.5 * g), (0.9 + 0.8 * hash(i, 49, 2)) * (0.5 + g), 50 + i, 0, clamp((u - 0.3) / 0.7), PAL.GOLDDUST, ID.DUST[i % 3]);
      }
    }
  }

  // ---------------------------------------------------- frame
  const fu = flash.material.uniforms;
  function update(st) {
    const t = st.t;
    E.t = t; E.tq = onThrees(t); E.draw = Math.floor(t * 8 + 1e-6); E.sid = st.sid;
    cols.begin(); puffs.begin(camera.position); petals.begin(); stones.begin(); glows.begin(camera); beams.begin(); trails.begin(); cones.begin();
    lightReq.length = 0; skyFlash.setRGB(0, 0, 0); flashA = 0; flashAt = null;
    puffs.camNear = 0.6;
    const pu = puffs.mesh.material.uniforms;
    pu.uFogD.value = engine.mAtmos.uniforms.uFogDensity.value;
    pu.uFogC.value.copy(engine.mAtmos.uniforms.uFogCool.value);
    pu.uDrawing.value = E.draw;
    for (const b of [beams, cones]) {
      const bu = b.mesh.material.uniforms, th = Math.tan((camera.fov * Math.PI) / 360);
      bu.uDrawing.value = E.draw; bu.uCam.value.copy(camera.matrixWorld); bu.uCamPos.value.copy(camera.position); bu.uTan.value.set(th * camera.aspect, th);
    }
    trails.mesh.material.uniforms.uDrawing.value = E.draw;

    const steps = [searchlights, thread, motes, iris, rifles, ray1, dusts, shells, sweep, eruption, afterFires, ray2, lanternGlow, speedLines];
    for (const f of steps) { try { f(st); } catch (e) { console.error(`[fx] ${f.name || 'step'} failed: ${e.stack || e}`); } }

    cols.end(); cols.mesh.material.uniforms.uDrawing.value = E.draw; puffs.end(); petals.end(); stones.end(); glows.end(); beams.end(); trails.end(); cones.end();

    // full-frame flash: one drawing, always with its source in frame
    fu.uA.value = flashA;
    if (flashA > 0.002 && flashAt) {
      fu.uColor.value.setRGB(flashCol[0], flashCol[1], flashCol[2]);
      const sp = flashAt.clone().project(camera);
      fu.uCenter.value.set(clamp(sp.x * 0.5 + 0.5, -0.5, 1.5), clamp(sp.y * 0.5 + 0.5, -0.5, 1.5));
    }
    flash.visible = flashA > 0.002;

    // light the world: the strongest requests take the slots the other departments left free
    lightReq.sort((a, b) => b.s - a.s);
    const free = MAX_WAR - G.uWarN.value;
    for (const l of lightReq.slice(0, Math.max(0, free))) addWarLight(l);
    const su = ctx.world?.sky?.material?.uniforms?.uSkyFlash;
    if (su && (skyFlash.r > 0 || skyFlash.g > 0 || skyFlash.b > 0)) su.value.setRGB(Math.max(su.value.r, skyFlash.r), Math.max(su.value.g, skyFlash.g), Math.max(su.value.b, skyFlash.b));
  }

  return { update, irisAt, chestAt, seedAt, shellFrom, hullPts, irisColor, _meshes: { puffs: puffs.mesh, glows: glows.mesh, beams: beams.mesh } };
}
