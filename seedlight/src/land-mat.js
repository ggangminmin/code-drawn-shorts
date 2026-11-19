// SEEDLIGHT, land department: gouache night materials for the Weir, the vault and the ironclad.
// Every surface has three scales of detail computed from world (or ship-local) position; fine layers fade with distance.
import * as THREE from 'three';
import { G, COMMON, MRT_OUT, VERT_STD } from './glsl.js';
import { PAINT_LIGHT } from './bgmaterials.js';
import { DETAIL_GLSL } from './detail.js';

// Shared land uniforms, written by land.update(st).
export const LU = {
  uBurnX: { value: -1e6 },           // world x of the fire front on the east rampart (burnt(x,t) = clamp((uBurnX - x) / 12))
  uBurnAge: { value: 0 },            // seconds since CUES.erupt
  uFire: { value: 0 },               // 0..1 the crown is burning (fire bounce on stone, glitter on the reservoir)
  uGlowY: { value: -1e3 },           // s10: height of the seed's glow inside the tower stair
  uSeedWin: { value: 1 },            // gold in the seed room window
  uLamps: { value: 1 },              // citadel window lamps
  uHits: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, -1e4, 0, 0)) },   // shell scorches on the tower: xyz, strength
  uDoorHot: { value: 0 },            // 0..1 the vault door hole glows (decays)
  uDoorGone: { value: 0 },
  uCapOff: { value: 0 },
  uKey2: { value: new THREE.Vector4(0.7, 0.35, 0.6, 0) },   // poster side light (s01/s30): xyz direction, w strength             // well cap blown: night spills down the shaft
  uCutA: { value: new THREE.Vector3() }, uCutB: { value: new THREE.Vector3() }, uCutK: { value: new THREE.Vector2(0, 0) },   // ship hull cut: x drawn 0..1, y burn 0..1
};
const base = (extra) => ({ ...G, ...LU, ...extra });
function mat(uniforms, vs, fs, opts = {}) {
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms, vertexShader: vs, fragmentShader: fs, side: opts.side ?? THREE.DoubleSide, transparent: false, ...opts });
}
const VS = /* glsl */ `
  varying vec3 vLocal; varying vec3 vLocalN;
  ${VERT_STD}
  void main(){ vLocal = position; vLocalN = normal; stdVertex(position, normal); }
`;

const STONE_GLSL = /* glsl */ `
// running-bond blocks. q in metres. returns x joint mask, y block random, z second random
vec3 blocks(vec2 q, vec2 size, float lw){
  float row = floor(q.y / size.y);
  float off = hash12(vec2(row, 7.3)) * size.x;
  vec2 c = vec2((q.x + off) / size.x, q.y / size.y);
  vec2 id = floor(c); vec2 f = fract(c);
  // every block has its own width: shift the vertical joint
  float j = (hash12(id + 3.1) - 0.5) * 0.3;
  float fx = f.x + j; if(fx < 0.0){ fx += 1.0; id.x -= 1.0; } else if(fx > 1.0){ fx -= 1.0; id.x += 1.0; }
  float dx = min(fx, 1.0 - fx) * size.x, dy = min(f.y, 1.0 - f.y) * size.y;
  float line = min(dx, dy);
  return vec3(1.0 - smoothstep(lw * 0.5, lw, line), hash12(id + 11.7), hash12(id.yx + 5.2));
}
float voro2(vec2 p, out float id){
  vec2 g = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0; id = 0.0;
  for(int y = -1; y <= 1; y++) for(int x = -1; x <= 1; x++){
    vec2 o = vec2(float(x), float(y)); vec2 h = hash22(g + o);
    float d = length(o + h - f);
    if(d < d1){ d2 = d1; d1 = d; id = h.x; } else if(d < d2){ d2 = d; }
  }
  return d2 - d1;
}
`;

// kind: 0 dam face, 1 citadel masonry (walls + flag tops), 2 tower (cylindrical, slit windows), 3 terrain (salt + canyon rock),
//       5 interior (vault, shaft, corridor), 6 jade glazed tile roof
export function stoneMaterial(o = {}) {
  const u = base({
    uKind: { value: o.kind ?? 1 },
    uTint: { value: new THREE.Color(o.color ?? '#d8d2c2') },
    uCyl: { value: new THREE.Vector4(...(o.cyl ?? [0, 0, 1, 0])) },
    uBurnable: { value: o.burnable ?? 0 },
    uBaseY: { value: o.baseY ?? 120 },
    uTopH: { value: o.topH ?? 9 },
    uSeed: { value: o.seed ?? 0 },
    uId: { value: o.id ?? 0 },
    uWin: { value: o.windows ?? 0 },
  });
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    ${PAINT_LIGHT}
    ${DETAIL_GLSL}
    ${STONE_GLSL}
    uniform float uKind, uBurnable, uBaseY, uTopH, uSeed, uId, uWin;
    uniform vec3 uTint;
    uniform vec4 uCyl;
    uniform float uBurnX, uBurnAge, uFire, uGlowY, uSeedWin, uLamps, uDoorHot, uDoorGone, uCapOff;
    uniform vec4 uKey2;
    uniform vec4 uHits[8];
    varying vec3 vWorld, vNormalW, vNormalV, vLocal, vLocalN;
    varying float vDepth; varying vec2 vUv;
    const vec3 BONE = vec3(0.86, 0.83, 0.75);
    void main(){
      vec3 p = vWorld; float dist = vDepth;
      vec3 N = normalize(vNormalW); vec3 NV = normalize(vNormalV);
      if(!gl_FrontFacing){ N = -N; NV = -NV; }
      float u = abs(N.x) > abs(N.z) ? p.z : p.x;
      float cr = 0.0, ca = 0.0;
      if(uCyl.w > 0.5){ vec2 dd = p.xz - uCyl.xy; cr = length(dd); ca = atan(dd.y, dd.x); u = ca * uCyl.z; }
      // ---- the burning rampart: the top is bitten away in a ragged line once the fire has passed
      float burn = 0.0;
      if(uBurnable > 0.5){
        burn = clamp((uBurnX - p.x) / 12.0, 0.0, 1.0);
        if(uBurnable > 1.5 && burn < 0.6) discard;
        float bite = fbm3(vec3(p.x * 0.09, 3.0, p.z * 0.05 + uSeed)) + 0.35 * vnoise3(vec3(p.x * 0.6, p.y * 0.2, 1.0));
        float keep = uTopH * (1.0 - burn * clamp(bite * 1.3 - 0.3, 0.0, 0.62));
        if(uBurnable < 1.5 && burn > 0.0 && p.y - uBaseY > keep) discard;
      }
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
      float top = smoothstep(0.55, 0.8, N.y);
      vec3 det = surfaceDetail(p, dist, 0.0);
      vec3 col = uTint; vec3 emit = vec3(0.0);
      float lw = 0.03 + dist * 0.0011;
      float interior = 0.0; float ao = 1.0;

      if(uKind < 0.5){
        // ---------------- dam face: colossal ashlar courses, centuries of water streaks
        vec3 bk = blocks(vec2(u, p.y), vec2(7.0, 2.6), 0.06 + dist * 0.0012);
        float bf = 1.0 - smoothstep(500.0, 1500.0, dist);
        col *= 0.93 + 0.14 * bk.y * bf;
        col *= 1.0 - 0.3 * bk.x * bf;
        vec3 b2 = blocks(vec2(u, p.y), vec2(1.75, 0.65), lw);
        float nf = 1.0 - smoothstep(60.0, 220.0, dist);
        col *= 1.0 - 0.14 * b2.x * nf; col *= 0.97 + 0.06 * b2.y * nf;
        float hgt = clamp((118.0 - p.y) / 150.0, 0.0, 1.0);
        float s1 = fbm3(vec3(u * 0.045, p.y * 0.004, 1.0 + uSeed));
        float s2 = fbm3(vec3(u * 0.21, p.y * 0.012, 4.0));
        float s3 = vnoise3(vec3(u * 0.9, p.y * 0.03, 8.0));
        float stain = smoothstep(0.42, 0.7, s1 * 0.6 + s2 * 0.4 + hgt * 0.22) * (0.35 + 0.65 * smoothstep(0.0, 0.25, hgt));
        col = mix(col, col * vec3(0.5, 0.58, 0.55), stain * 0.8);
        float runs = smoothstep(0.62, 0.8, s2 * 0.6 + s3 * 0.4) * smoothstep(0.02, 0.2, hgt);
        col = mix(col, col * vec3(0.62, 0.66, 0.62), runs * 0.6);
        // verdigris weeps (copper pipes) and pale lime crusts
        float teal = smoothstep(0.6, 0.78, fbm3(vec3(u * 0.03 + 9.0, p.y * 0.004, 3.0))) * smoothstep(0.1, 0.5, hgt);
        col = mix(col, vec3(0.36, 0.60, 0.53), teal * 0.45);
        float lime = smoothstep(0.7, 0.82, fbm3(vec3(u * 0.3, p.y * 0.02, 12.0)));
        col = mix(col, vec3(0.95, 0.94, 0.88), lime * 0.35);
        // construction ledges every 30 m
        float led = abs(fract(p.y / 30.0) - 0.5) * 30.0;
        col *= 1.0 - 0.3 * (1.0 - smoothstep(14.2, 14.9, led)) * 0.0 - 0.28 * smoothstep(14.4, 14.9, led);
        // a dark wet fan under every sluice, pale lime tongues beside it
        if(abs(p.x) < 231.0 && p.y < 30.0){
          float dx = abs(mod(p.x + 231.0, 66.0) - 33.0);
          float dn = 30.0 - p.y;
          float wn = fbm3(vec3(p.x * 0.2, p.y * 0.03, 2.0)) * 5.0;
          float wet = 1.0 - smoothstep(6.0 + dn * 0.1, 9.0 + dn * 0.22, dx + wn - 2.5);
          col = mix(col, col * vec3(0.36, 0.46, 0.46), wet * 0.85);
          float tongue = (1.0 - smoothstep(0.0, 3.0, abs(dx - 10.0 - dn * 0.18 + wn - 2.5))) * smoothstep(0.0, 20.0, dn);
          col = mix(col, vec3(0.96, 0.95, 0.9), tongue * 0.45);
        }
        // long shadows of the buttresses across the face (drawn, the moon is low)
        if(uSunDir.z > 0.05 && p.y < 108.0 && N.z > 0.3){
          float sgn = uSunDir.x > 0.0 ? -1.0 : 1.0;
          float bx = (mod(p.x + 330.0, 66.0) - 33.0) * sgn;
          float L = (6.0 + 22.0 * clamp((106.0 - p.y) / 190.0, 0.0, 1.0)) * abs(uSunDir.x) / max(uSunDir.z, 0.25) * 1.6;
          float shd = step(6.0, bx) * step(bx, 6.0 + L);
          col *= 1.0 - 0.42 * shd;
        }
        // damp foot
        col = mix(col, col * vec3(0.42, 0.56, 0.52), smoothstep(40.0, -30.0, p.y) * 0.7);
        if(top > 0.5){ vec3 fl = blocks(p.xz, vec2(2.4, 1.6), lw); col = uTint * (0.9 + 0.12 * fl.y) * (1.0 - 0.3 * fl.x * nf); }
        col *= det.x;
      } else if(uKind < 2.5){
        // ---------------- citadel masonry / the tower
        float nf = 1.0 - smoothstep(70.0, 260.0, dist);
        float mf = 1.0 - smoothstep(300.0, 900.0, dist);
        vec3 big = blocks(vec2(u, p.y), vec2(4.8, 1.8), 0.05 + dist * 0.0012);
        vec3 bk = blocks(vec2(u, p.y), vec2(1.5, 0.6), lw);
        col *= 0.94 + 0.1 * big.y * mf;
        col *= 0.95 + 0.1 * bk.y * nf;
        col = mix(col, col * vec3(0.9, 0.86, 0.76), step(0.82, bk.z) * nf * 0.6);       // odd warmer stones
        col *= 1.0 - 0.2 * bk.x * nf - 0.07 * big.x * mf * (1.0 - nf);
        // rain streaks under ledges and lichen
        float streak = smoothstep(0.5, 0.74, fbm3(vec3(u * 0.3, p.y * 0.03, 2.0 + uSeed)));
        col = mix(col, col * vec3(0.66, 0.72, 0.68), streak * (uKind > 1.5 ? 0.75 : 0.5));
        if(uKind > 1.5){ float big = smoothstep(0.45, 0.7, fbm3(vec3(ca * 2.0, p.y * 0.035, 5.0))); col *= 1.0 - 0.2 * big; float under = fract((p.y - 163.0) / 13.0); col *= 1.0 - 0.22 * smoothstep(0.75, 1.0, under) * step(0.4, vnoise3(vec3(ca * 9.0, 1.0, 2.0))); }
        float lich = smoothstep(0.66, 0.74, fbm3(p * 0.45 + 20.0)) * nf;
        col = mix(col, vec3(0.50, 0.62, 0.50), lich * 0.3);
        float foot = smoothstep(2.5, 0.0, p.y - uBaseY);
        col *= 1.0 - 0.25 * foot * (1.0 - top);
        if(top > 0.5){
          // flagstones; radial on round floors
          vec2 q = p.xz; vec2 sz = vec2(1.5, 1.0);
          if(uCyl.w > 0.5){ float ring = floor(cr / 1.1); q = vec2(ca * max(ring, 1.0) * 1.1 * 1.0, cr); sz = vec2(1.4, 1.1); }
          vec3 fl = blocks(q, sz, lw * 1.2);
          col = uTint * (0.84 + 0.2 * fl.y);
          if(uCyl.w > 0.5 && cr < uCyl.z){
            float rr = cr / uCyl.z;
            float band = min(min(abs(rr - 0.36), abs(rr - 0.6)), abs(rr - 0.86)) * uCyl.z;
            float inl = 1.0 - smoothstep(0.17, 0.23, band);
            float spd = abs(fract(ca / 6.2832 * 16.0) - 0.5) * 0.3927 * cr;
            float spoke = (1.0 - smoothstep(0.1, 0.15, spd)) * step(0.36, rr) * step(rr, 0.86);
            col *= 1.0 - 0.13 * step(0.5, fract(floor(ca / 6.2832 * 16.0) * 0.5)) * step(0.6, rr) * step(rr, 0.86);
            col = mix(col, uTint * vec3(0.5, 0.6, 0.6), max(inl, spoke) * 0.85);
          }
          col = mix(col, col * vec3(0.84, 0.9, 0.86), step(0.7, fl.z) * 0.5);
          col *= 1.0 - 0.4 * fl.x * (1.0 - smoothstep(90.0, 300.0, dist));
          float wornP = fbm3(p * 0.22 + 31.0);
          col *= 0.86 + 0.26 * wornP;
          float moss = smoothstep(0.6, 0.7, fbm3(p * 0.7 + 3.0)) * fl.x;
          col = mix(col, vec3(0.34, 0.48, 0.36), moss * 0.7 * nf);
        }
        col *= det.x + det.y * 0.15;
        // ---------------- slit windows of the tower, spiralling up; the seed's glow climbs behind them
        if(uKind > 1.5 && uWin > 0.5 && top < 0.5 && cr > 8.6){
          for(int i = 0; i < 34; i++){
            float wy = 156.0 + float(i) * 1.7;
            float wa = 1.92 + (wy - 201.0) * 0.12;
            float da = atan(sin(ca - wa), cos(ca - wa)) * uCyl.z;
            vec2 d = vec2(da, p.y - wy);
            if(abs(d.x) < 0.5 && abs(d.y) < 1.2){
              float inside = step(abs(d.x), 0.21) * step(abs(d.y), 0.78);
              float frame = step(abs(d.x), 0.34) * step(abs(d.y), 0.92) * (1.0 - inside);
              col = mix(col, uTint * 1.08, frame);
              float g = exp(-pow((wy - uGlowY) / 1.5, 2.0));
              vec3 dark = vec3(0.02, 0.05, 0.06);
              col = mix(col, dark, inside);
              col = mix(col, uTint * 0.5, inside * step(0.07, d.x) * (1.0 - g));
              emit += inside * vec3(1.0, 0.72, 0.22) * 3.2 * g;
              emit += frame * vec3(1.0, 0.7, 0.25) * 0.5 * g;
              // jamb shadow: the slit is deep
              col = mix(col, dark * 3.0, inside * step(d.x, -0.05) * 0.0);
            }
          }
          // the seed room window, +Z face
          vec2 dw = vec2(p.x - 0.0, p.y - 201.0);
          if(p.z > uCyl.y + 4.0 && abs(dw.x) < 1.3 && dw.y > -1.3 && dw.y < 1.9){
            float arch = step(abs(dw.x), 0.72) * step(-1.0, dw.y) * step(dw.y, 0.9 + sqrt(max(0.0, 0.52 - dw.x * dw.x)) * 0.9);
            float fr = step(abs(dw.x), 1.0) * step(-1.2, dw.y) * step(dw.y, 1.25 + sqrt(max(0.0, 1.0 - dw.x * dw.x)) * 0.6) * (1.0 - arch);
            col = mix(col, uTint * 1.1, fr);
            col = mix(col, vec3(0.03, 0.06, 0.07), arch);
            emit += arch * vec3(1.0, 0.74, 0.24) * 2.6 * uSeedWin * (0.75 + 0.25 * smoothstep(1.0, -1.0, dw.y));
          }
        }
        // sparse lamp-lit barrack slits: pale ivory, small
        if(uKind < 1.5 && uWin > 0.5 && top < 0.5){
          vec2 c = vec2(u / 6.4, (p.y - uBaseY) / 5.2); vec2 id = floor(c); vec2 f = fract(c) - 0.5;
          float isW = step(abs(f.x), 0.07) * step(abs(f.y), 0.2) * step(0.0, p.y - uBaseY - 0.6) * step(hash12(id + 2.3), 0.6);
          float litW = step(0.86, hash12(id + uSeed * 7.0));
          col = mix(col, vec3(0.03, 0.06, 0.07), isW);
          emit += isW * litW * vec3(1.0, 0.84, 0.5) * 2.4 * uLamps * (1.0 - burn);
        }
        // shell scorches on the tower
        for(int i = 0; i < 8; i++){
          float k = uHits[i].w; if(k <= 0.0) continue;
          float d = length(p - uHits[i].xyz);
          float n = fbm3(p * 0.5 + float(i));
          float sc = (1.0 - smoothstep(2.0, 7.5, d + (n - 0.5) * 5.0)) * min(k, 1.0);
          col = mix(col, vec3(0.05, 0.045, 0.04), sc * 0.9);
          float hole = 1.0 - smoothstep(0.8, 2.6, d + (n - 0.5) * 2.4);
          emit += hole * sc * vec3(2.6, 0.7, 0.15) * (0.25 + clamp(k - 1.0, 0.0, 1.0) * 1.6) * (0.6 + 0.4 * vnoise3(p * 2.0 + uTime * 3.0));
        }
      } else if(uKind < 3.5){
        // ---------------- terrain: cracked salt flats on the level, banded sandstone on the cliffs
        float flatK = smoothstep(0.62, 0.86, N.y);
        // cliff
        float yy = p.y + fbm3(p * 0.012) * 26.0 + p.x * 0.05;
        float strata = vnoise3(vec3(0.0, yy * 0.11, 3.0)) * 0.6 + vnoise3(vec3(1.0, yy * 0.45, 9.0)) * 0.4;
        vec3 rock = mix(vec3(0.80, 0.74, 0.62), vec3(0.62, 0.60, 0.54), smoothstep(0.35, 0.65, strata));
        rock = mix(rock, vec3(0.90, 0.87, 0.78), smoothstep(0.7, 0.8, strata));
        float gully = fbm3(vec3(p.x * 0.05, p.y * 0.004, p.z * 0.05) + 5.0);
        rock *= 0.8 + 0.4 * gully;
        float vcr = 1.0 - smoothstep(0.0, 0.05, _voroEdge(vec3(p.x * 0.05, p.y * 0.012, p.z * 0.05)));
        rock *= 1.0 - 0.3 * vcr * (1.0 - smoothstep(400.0, 1600.0, dist));
        rock *= det.x;
        // salt
        float cid; float e1 = voro2(p.xz / 11.0 + fbm2(p.xz * 0.01) * 0.6, cid);
        float f1 = 1.0 - smoothstep(350.0, 1300.0, dist);
        float cw = 0.02 + dist * 0.00012;
        float crk = (1.0 - smoothstep(cw, cw * 2.2, e1)) * f1;
        float rim = (1.0 - smoothstep(cw * 2.0, cw * 7.0, e1)) * f1;
        float cid2; float e2 = voro2(p.xz / 3.2, cid2);
        float f2 = 1.0 - smoothstep(40.0, 200.0, dist);
        float crk2 = (1.0 - smoothstep(0.03, 0.07, e2)) * f2;
        vec3 salt = vec3(0.93, 0.93, 0.90) * (0.9 + 0.12 * cid * f1) * (0.94 + 0.08 * cid2 * f2);
        salt *= 0.86 + 0.28 * fbm3(p * 0.004 + 7.0);
        float windS = fbm3(vec3(p.x * 0.002, 0.0, p.z * 0.012) + 3.0);
        salt = mix(salt, vec3(0.74, 0.76, 0.70), smoothstep(0.5, 0.75, windS) * 0.5);
        salt = mix(salt, vec3(1.0, 0.99, 0.95), rim * 0.5);
        salt = mix(salt, vec3(0.5, 0.56, 0.54), crk * 0.8);
        salt *= 1.0 - 0.35 * crk2;
        salt *= 0.97 + 0.06 * vnoise3(p * 9.0) * f2;
        col = mix(rock, salt, flatK);
      } else if(uKind < 5.5){
        // ---------------- interior: damp vault masonry, lit only by events
        interior = 1.0;
        vec3 bk = blocks(vec2(u, p.y), vec2(1.9, 0.8), lw);
        col *= 0.86 + 0.24 * bk.y;
        col = mix(col, col * vec3(0.8, 0.9, 0.84), step(0.75, bk.z) * 0.6);
        col *= 1.0 - 0.5 * bk.x;
        float damp = smoothstep(0.45, 0.7, fbm3(vec3(u * 0.25, p.y * 0.05, 6.0 + uSeed)));
        col = mix(col, col * vec3(0.5, 0.62, 0.6), damp * 0.6);
        float moss = smoothstep(0.58, 0.7, fbm3(p * 0.6 + 14.0)) * (0.4 + 0.6 * bk.x);
        col = mix(col, vec3(0.18, 0.34, 0.33), moss * 0.5);
        if(top > 0.5 || N.y < -0.7){
          vec3 fl = blocks(p.xz, vec2(2.2, 1.5), lw * 1.3);
          col = uTint * (0.74 + 0.34 * fl.y);
          col = mix(col, col * vec3(0.78, 0.9, 0.86), step(0.66, fl.z) * 0.6);
          col *= 1.0 - 0.55 * fl.x;
          // the Lantern's slab and the rosette under the well
          vec2 sl = abs(p.xz - vec2(-118.0, 2.0)) - vec2(7.2, 3.4);
          float sd = max(sl.x, sl.y);
          if(top > 0.5){
            if(sd < 0.0){
              col = uTint * vec3(0.6, 0.72, 0.74) * (0.9 + 0.2 * fbm3(p * 0.8)); col *= 1.0 - 0.3 * step(0.86, vnoise3(p * 3.0));
              // where it lay for centuries: clean pale stone inside, moss and dust outside the outline
              vec2 lq = p.xz - vec2(-118.0, 2.0);
              float sil = min(length(vec2(max(abs(lq.x + 0.6) - 3.4, 0.0), lq.y)) - 1.75, length(lq - vec2(5.2, 0.0)) - 1.05);
              sil = min(sil, length(vec2(max(abs(lq.x + 0.5) - 2.6, 0.0), abs(lq.y) - 2.4)) - 0.55);
              sil += (fbm3(p * 1.4) - 0.5) * 0.3;
              col = mix(mix(col * 0.62, vec3(0.16, 0.3, 0.3), 0.35), col * 1.35, 1.0 - smoothstep(-0.05, 0.1, sil));
              col *= 1.0 - 0.6 * (1.0 - smoothstep(0.0, 0.09, abs(sil)));
            }
            col *= 1.0 - 0.6 * (1.0 - smoothstep(0.0, 0.14, abs(sd)));
            float wr = length(p.xz - vec2(-110.0, 0.0));
            float rings = min(min(abs(wr - 5.5), abs(wr - 3.6)), abs(wr - 1.4));
            col *= 1.0 - 0.55 * (1.0 - smoothstep(0.03, 0.12, rings)) * step(sd, 0.0) * 0.0 - 0.55 * (1.0 - smoothstep(0.03, 0.12, rings)) * step(0.0, sd);
            float wa = atan(p.z, p.x + 110.0);
            float spokes = abs(fract(wa / 6.2832 * 12.0) - 0.5);
            col *= 1.0 - 0.45 * (1.0 - smoothstep(0.0, 0.04 / max(wr, 0.5), spokes)) * step(1.4, wr) * step(wr, 5.5) * step(0.0, sd);
            col = mix(col, col * vec3(0.8, 0.95, 0.9), step(wr, 5.5) * step(0.5, fract(floor(wa / 6.2832 * 12.0) * 0.5)) * 0.35 * step(0.0, sd));
          }
          float pud = smoothstep(0.62, 0.66, fbm3(p * 0.3 + 40.0)) * top;
          col = mix(col, col * 0.55, pud);
          float moss2 = smoothstep(0.6, 0.7, fbm3(p * 0.7 + 3.0)) * fl.x;
          col = mix(col, vec3(0.17, 0.34, 0.32), moss2 * 0.8);
        }
        col *= det.x;
        // the molten hole where the door was: ragged, glowing, in the east wall
        vec2 dq = vec2(p.z, p.y - 65.1);
        float hole = max(abs(dq.x) - 2.9, abs(dq.y) - 3.1) + (fbm3(p * 0.9) - 0.5) * 1.3;
        float nearDoor = step(abs(p.x + 88.0), 2.6);
        float edge = (1.0 - smoothstep(0.0, 1.5, hole)) * nearDoor * step(0.01, uDoorGone);
        col = mix(col, vec3(0.04, 0.035, 0.03), edge * 0.8 * (1.0 - top));
        float hotN = 0.6 + 0.4 * vnoise3(p * 1.7 + vec3(0.0, uDrawTime * 2.0, 0.0));
        emit += edge * edge * mix(vec3(2.4, 0.45, 0.08), vec3(4.0, 2.6, 1.2), uDoorHot * uDoorHot) * uDoorHot * hotN * 1.6;
      } else {
        // ---------------- jade glazed tile roofs
        float rowf = p.y * 3.2; float row = floor(rowf);
        float cu = u * 2.4 + 0.5 * mod(row, 2.0); float cid = hash12(vec2(floor(cu), row));
        float nf = 1.0 - smoothstep(50.0, 200.0, dist);
        vec3 jade = mix(vec3(0.20, 0.50, 0.44), vec3(0.34, 0.66, 0.56), cid);
        jade = mix(jade, vec3(0.50, 0.60, 0.48), step(0.9, cid));
        col = mix(uTint, jade, 0.5 + 0.5 * nf);
        float lip = smoothstep(0.75, 1.0, fract(rowf)); float gap = 1.0 - smoothstep(0.0, 0.12, abs(fract(cu) - 0.5) * 2.0 - 0.0);
        col *= 1.0 - 0.4 * lip * nf; col *= 1.0 + 0.25 * (1.0 - smoothstep(0.0, 0.2, fract(rowf))) * nf;
        col *= 1.0 - 0.3 * (1.0 - smoothstep(0.0, 0.1, abs(fract(cu) - 0.5) - 0.42 + 0.5)) * 0.0;
        float grime = fbm3(vec3(u * 0.2, p.y * 0.6, p.z * 0.2 + uSeed));
        col *= 0.75 + 0.5 * grime;
        col = mix(col, vec3(0.36, 0.44, 0.34), smoothstep(0.62, 0.72, fbm3(p * 0.5 + 9.0)) * 0.4);
        col *= det.x * 0.5 + 0.5;
        // moon glaze
        vec3 V = normalize(cameraPosition - p);
        float sp = pow(max(dot(N, normalize(uSunDir + V)), 0.0), 40.0) * (0.5 + 0.5 * cid);
        emit += uSunColor * sp * 0.5 * uSunStrength;
      }

      // ---- soot and embers where the fire wall has passed
      if(burn > 0.0){
        float sn = fbm3(p * 0.4 + 17.0);
        col = mix(col, vec3(0.07, 0.06, 0.055), burn * (0.3 + 0.45 * sn));
        float cool = exp(-max(uBurnAge - (p.x - 34.0) / 177.0, 0.0) * 0.12);
        float em = smoothstep(0.62, 0.78, fbm3(p * 0.8 + vec3(0.0, -uDrawTime * 0.6, 0.0))) * burn;
        emit += vec3(2.6, 0.62, 0.12) * em * (0.35 + 0.65 * cool) * (gl_FrontFacing ? 0.7 : 1.5);
        emit += vec3(2.2, 0.7, 0.15) * det.y * burn * cool * step(0.62, fbm3(p * 0.3 + 4.0));
      }

      vec3 outc;
      if(interior > 0.5){
        float up = N.y * 0.5 + 0.5;
        float wallK = max(smoothstep(12.6, 14.6, abs(p.z)), max(smoothstep(-130.0, -131.6, p.x), smoothstep(-90.0, -88.4, p.x))) * step(p.y, 79.0);
        vec3 amb = vec3(0.13, 0.27, 0.34) * (0.45 + 0.8 * up) * (1.0 - 0.6 * wallK);
        // night spill: under the ceiling grate always, under the well once the cap is gone
        float gr = exp(-dot(p.xz - vec2(-119.0, 2.0), p.xz - vec2(-119.0, 2.0)) / 14.0) * smoothstep(-0.2, 0.6, N.y);
        float wl = exp(-dot(p.xz - vec2(-110.0, 0.0), p.xz - vec2(-110.0, 0.0)) / 30.0) * smoothstep(-0.2, 0.6, N.y) * (0.45 + 0.55 * uCapOff);
        amb += vec3(0.16, 0.30, 0.34) * (gr * 1.0 + wl * 1.3);
        // the cold shafts also graze pillars and chains near them
        amb += vec3(0.05, 0.10, 0.12) * exp(-dot(p.xz - vec2(-112.0, 1.0), p.xz - vec2(-112.0, 1.0)) / 160.0);
        // inside the shaft the night comes down from the mouth
        amb += vec3(0.08, 0.17, 0.18) * smoothstep(84.0, 122.0, p.y) * uCapOff + vec3(0.02, 0.04, 0.045) * smoothstep(78.0, 120.0, p.y);
        outc = col * amb + warLight(col, p, N) * 1.25 + emit;
      } else {
        outc = paintLight(col, N, p, 1.0, ao);
        float k2 = dot(N, normalize(uKey2.xyz));
        outc += col * uSunColor * (smoothstep(0.0, 0.12, k2) * 0.6 + smoothstep(0.45, 0.55, k2) * 0.4) * uKey2.w;
        // the moon is the key: lit planes go to bone white, shade stays jade
        float mlit = smoothstep(0.0, 0.22, dot(N, uSunDir)) * sunShadow(p, N);
        // fire bounce from the burning east rampart
        float fb = uFire * smoothstep(-0.2, 0.7, dot(N, normalize(vec3(170.0, 126.0, 46.0) - p))) * exp(-length(p - vec3(clamp(p.x, 34.0, 318.0), 124.0, 43.0)) / 260.0);
        outc += col * vec3(0.7, 0.25, 0.07) * fb * (0.85 + 0.15 * sin(uDrawTime * 11.0 + p.x * 0.05));
        outc += emit;
        // mist pooled in the gorge
        float m = smoothstep(34.0, -46.0, p.y + (fbm3(vec3(p.xz * 0.012, uTime * 0.02)) - 0.5) * 40.0);
        vec3 mistC = uSkyTint * 0.62 + uShadeTint * 0.3 + uSunColor * 0.1 * uSunStrength;
        outc = mix(outc, mistC, m * 0.92);
      }
      writeOut(outc, 1.0, NV, vDepth, uId);
    }
  `;
  return mat(u, VS, fs);
}

// kind: 0 verdigris copper, 1 black iron, 2 gunmetal hull plates (ship-local), 3 brass
export function metalMaterial(o = {}) {
  const u = base({
    uKind: { value: o.kind ?? 0 },
    uId: { value: o.id ?? 0 },
    uInterior: { value: o.interior ?? 0 },
    uLocalSpace: { value: o.local ?? 0 },
    uGrille: { value: o.grille ?? 0 },
    uCut: { value: o.cut ?? 0 },
    uEmit: { value: new THREE.Color(o.emit ?? '#000000') },
    uEmitK: { value: o.emitK ?? 0 },
    uBurnable: { value: o.burnable ?? 0 },
  });
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    ${PAINT_LIGHT}
    ${DETAIL_GLSL}
    ${STONE_GLSL}
    uniform float uKind, uId, uInterior, uLocalSpace, uGrille, uCut, uEmitK, uBurnable;
    uniform vec3 uEmit;
    uniform float uBurnX, uFire, uCapOff;
    uniform vec4 uKey2;
    uniform vec3 uCutA, uCutB; uniform vec2 uCutK;
    varying vec3 vWorld, vNormalW, vNormalV, vLocal, vLocalN;
    varying float vDepth; varying vec2 vUv;
    void main(){
      vec3 N = normalize(vNormalW); vec3 NV = normalize(vNormalV);
      if(!gl_FrontFacing){ N = -N; NV = -NV; }
      vec3 p = uLocalSpace > 0.5 ? vLocal : vWorld;
      vec3 Nl = uLocalSpace > 0.5 ? normalize(vLocalN) : N;
      if(uGrille > 0.5){
        // lattice of flat bars: see-through
        vec2 g = abs(fract(vec2(vLocal.z, vLocal.y) / 0.62) - 0.5);
        float open = step(0.2, g.x) * step(0.2, g.y) * step(1.1, vLocal.y) * step(abs(vLocal.z), 2.6) * step(0.12, abs(vLocal.z));
        if(open > 0.5) discard;
      }
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
      float dist = vDepth;
      float nf = 1.0 - smoothstep(40.0, 200.0, dist);
      vec3 col; vec3 emit = uEmit * uEmitK;
      float u2 = abs(Nl.x) > abs(Nl.z) ? p.z : p.x;
      if(abs(Nl.y) > 0.75) u2 = p.x;
      float v2 = abs(Nl.y) > 0.75 ? p.z : p.y;
      if(uKind < 0.5){
        // verdigris: pale jade crust over brown copper that shows on rubbed edges and in streaks
        float pat = fbm3(p * 0.55 + 2.0) * 0.6 + fbm3(p * 2.3) * 0.4;
        vec3 ver = mix(vec3(0.30, 0.58, 0.50), vec3(0.56, 0.80, 0.70), smoothstep(0.3, 0.7, pat));
        vec3 cop = mix(vec3(0.42, 0.24, 0.14), vec3(0.62, 0.38, 0.2), vnoise3(p * 3.0));
        float bare = smoothstep(0.6, 0.7, fbm3(vec3(p.x * 1.3, p.y * 0.25, p.z * 1.3) + 8.0));
        col = mix(ver, cop, bare * 0.75);
        float runs = smoothstep(0.55, 0.8, vnoise3(vec3(p.x * 2.5, p.y * 0.18, p.z * 2.5)));
        col = mix(col, vec3(0.74, 0.90, 0.82), runs * 0.3);
        float seam = 1.0 - smoothstep(0.02, 0.07, abs(fract(v2 / 2.4) - 0.5) * 2.4);
        col *= 1.0 - 0.0 * seam;
        col *= 0.9 + 0.2 * vnoise3(p * 14.0) * nf;
      } else if(uKind < 1.5){
        col = vec3(0.10, 0.12, 0.125) * (0.8 + 0.5 * fbm3(p * 1.5));
        float rust = smoothstep(0.55, 0.7, fbm3(vec3(p.x * 2.0, p.y * 0.6, p.z * 2.0) + 3.0));
        col = mix(col, vec3(0.30, 0.17, 0.10), rust * 0.7);
        col *= 0.85 + 0.3 * vnoise3(p * 18.0) * nf;
      } else if(uKind < 2.5){
        // riveted gunmetal plates with verdigris streaks and soot
        // big simple panels on a straight grid, thin seams
        vec2 pc = vec2(u2 / 21.0, (v2 + 13.0) / 7.5); vec2 pid = floor(pc); vec2 pfr = fract(pc);
        float sd2 = min(min(pfr.x, 1.0 - pfr.x) * 21.0, min(pfr.y, 1.0 - pfr.y) * 7.5);
        float slw = 0.1 + dist * 0.0005;
        vec3 pl = vec3(1.0 - smoothstep(slw * 0.5, slw, sd2), hash12(pid + 3.0), hash12(pid.yx + 9.0));
        float pf = 1.0 - smoothstep(900.0, 2200.0, dist);
        col = vec3(0.15, 0.2, 0.22) * (0.97 + 0.06 * pl.y * pf);
        col *= 1.0 - 0.32 * pl.x * pf;
        // rivet lines beside the seams
        float rl = (1.0 - smoothstep(0.25, 0.4, abs(sd2 - 0.75)));
        vec2 rq2 = fract(vec2(u2, v2) / 1.5) - 0.5;
        col *= 1.0 + 0.55 * rl * (1.0 - smoothstep(0.16, 0.26, length(rq2))) * (1.0 - smoothstep(150.0, 600.0, dist));
        // rivets along the plate edges
        vec2 rq = vec2(u2, v2); vec2 rc = fract(rq / 0.9) - 0.5;
        float nearEdge = step(0.5, pl.x + 0.0) * 0.0;
        float riv = (1.0 - smoothstep(0.1, 0.16, length(rc))) * (1.0 - smoothstep(60.0, 190.0, dist));
        float bandE = 1.0 - smoothstep(0.25, 0.5, abs(fract(v2 / 4.2) - 0.5) * 4.2 - 1.4);
        
        float st = smoothstep(0.5, 0.78, fbm3(vec3(u2 * 0.14, v2 * 0.02, 5.0)) * 0.7 + vnoise3(vec3(u2 * 0.9, v2 * 0.05, 2.0)) * 0.3) * step(abs(Nl.y), 0.75);
        col = mix(col, vec3(0.26, 0.50, 0.44), st * 0.5);
        float soot = smoothstep(0.5, 0.75, fbm3(p * 0.06 + 9.0));
        col *= 1.0 - 0.4 * soot;
        col *= 0.9 + 0.2 * vnoise3(p * 6.0) * nf;
        col *= surfaceDetail(p, dist, 2.0).x * 0.4 + 0.6;
      } else {
        col = mix(vec3(0.62, 0.48, 0.22), vec3(0.80, 0.68, 0.36), fbm3(p * 2.0));
        col = mix(col, vec3(0.34, 0.50, 0.40), smoothstep(0.6, 0.75, fbm3(p * 1.3 + 4.0)) * 0.5);
      }
      // the ray's cut across the hull: a drawn line that glows, then burns
      if(uCut > 0.5 && uCutK.x > 0.0){
        vec3 ab = uCutB - uCutA; float h = clamp(dot(vLocal - uCutA, ab) / dot(ab, ab), 0.0, uCutK.x);
        float d = length((vLocal - uCutA - ab * h) * vec3(1.0, 1.0, 0.12));
        float n = fbm3(vLocal * 0.35);
        float w = 0.35 + uCutK.y * (1.6 + 3.2 * n);
        float sc = 1.0 - smoothstep(w, w * 3.2, d);
        col = mix(col, vec3(0.03, 0.03, 0.03), sc * 0.9);
        float core = 1.0 - smoothstep(0.0, w, d);
        vec3 hot = mix(vec3(4.5, 3.6, 2.4), vec3(3.4, 0.9, 0.18), uCutK.y * (0.5 + 0.5 * n));
        emit += hot * core * (0.75 + 0.25 * sin(uDrawTime * 13.0 + vLocal.x * 0.3));
        emit += vec3(1.6, 0.4, 0.08) * sc * uCutK.y * smoothstep(0.45, 0.7, fbm3(vLocal * 0.5 + vec3(0.0, -uDrawTime, 0.0)));
      }
      float burn = uBurnable > 0.5 ? clamp((uBurnX - vWorld.x) / 12.0, 0.0, 1.0) : 0.0;
      col = mix(col, vec3(0.07, 0.06, 0.055), burn * 0.6);
      vec3 outc;
      if(uInterior > 0.5){
        vec3 amb = vec3(0.16, 0.32, 0.38) * (0.6 + 0.5 * N.y) + vec3(0.08, 0.17, 0.18) * smoothstep(84.0, 122.0, vWorld.y) * uCapOff;
        outc = col * amb + warLight(col, vWorld, N) * 1.25 + emit;
      } else {
        outc = paintLight(col, N, vWorld, 1.0, 1.0);
        outc += col * uSunColor * smoothstep(0.0, 0.12, dot(N, normalize(uKey2.xyz))) * uKey2.w;
        float mlit = smoothstep(0.0, 0.22, dot(N, uSunDir)) * sunShadow(vWorld, N);
        vec3 V = normalize(cameraPosition - vWorld);
        float sp = pow(max(dot(N, normalize(uSunDir + V)), 0.0), uKind > 1.5 ? 24.0 : 12.0);
        outc += uSunColor * sp * 0.22 * uSunStrength * (uKind < 0.5 ? 0.6 : 1.0);
        float fb = uFire * smoothstep(-0.2, 0.7, dot(N, normalize(vec3(170.0, 126.0, 46.0) - vWorld))) * exp(-length(vWorld - vec3(clamp(vWorld.x, 34.0, 318.0), 124.0, 43.0)) / 800.0);
        outc += col * vec3(1.5, 0.55, 0.16) * fb + col * uSkyTint * 0.35;
        if(uLocalSpace > 0.5){
          // the ship: lit hard from the burning dam side and from below, cold moon rim on top
          vec3 Nl2 = normalize(vLocalN);
          float fd = -Nl2.y * 0.8 - Nl2.z * 0.3 - (vLocal.y + 3.0) * 0.04;
          float fk = smoothstep(0.1, 0.15, fd) * 0.55 + smoothstep(0.5, 0.56, fd) * 0.45;
          outc = outc * 0.75 + col * mix(vec3(0.4, 0.6, 0.66), vec3(1.9, 0.5, 0.13), uFire) * fk;
          vec3 Vs = normalize(cameraPosition - vWorld);
          float rimS = smoothstep(0.62, 0.7, 1.0 - max(dot(N, Vs), 0.0)) * smoothstep(-0.1, 0.4, N.y);
          outc += vec3(0.4, 0.78, 0.86) * (rimS * 0.45 + smoothstep(0.55, 0.75, N.y) * 0.2);
        }
        outc += emit;
        float m = smoothstep(10.0, -70.0, vWorld.y + (fbm3(vec3(vWorld.xz * 0.012, uTime * 0.02)) - 0.5) * 40.0);
        outc = mix(outc, uSkyTint * 0.62 + uShadeTint * 0.3 + uSunColor * 0.1 * uSunStrength, m * 0.35);
      }
      writeOut(outc, 1.0, NV, vDepth, uId);
    }
  `;
  return mat(u, VS, fs);
}

// The reservoir: a black mirror with the moon's glitter road, and fire light when the crown burns.
export function waterMaterial() {
  const u = base({});
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    uniform float uFire, uBurnX;
    varying vec3 vWorld, vNormalW, vNormalV; varying float vDepth; varying vec2 vUv;
    void main(){
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
      vec3 p = vWorld; vec3 V = normalize(cameraPosition - p);
      float t = uDrawTime;
      vec2 q = p.xz;
      float far = smoothstep(200.0, 2000.0, vDepth);
      vec3 n = vec3(0.0, 1.0, 0.0);
      float a = mix(0.05, 0.012, far);
      n.x += (fbm2(q * 0.11 + vec2(t * 0.25, 0.0)) - 0.5) * a + (vnoise(q * vec2(0.6, 0.08) + vec2(0.0, t * 0.3)) - 0.5) * a * 0.7;
      n.z += (fbm2(q * 0.09 + vec2(4.0, t * 0.2)) - 0.5) * a * 2.4;
      n = normalize(n);
      vec3 R = reflect(-V, n);
      // mirrored sky: black-teal overhead, paler toward the horizon
      float hz = pow(1.0 - max(R.y, 0.0), 5.0);
      vec3 col = mix(vec3(0.008, 0.035, 0.045), uSkyTint * 0.5, hz * 0.8);
      // stars held in the still water near the camera
      vec2 sq = R.xz / max(R.y, 0.05) * 60.0; float sh = hash12(floor(sq));
      col += vec3(0.7, 0.9, 0.85) * step(0.992, sh) * (1.0 - hz) * 0.5 * step(length(fract(sq) - 0.5), 0.22);
      // the moon's glitter road: drawn broken dashes
      float md = max(dot(R, uSunDir), 0.0);
      float dash = step(0.5, vnoise(q * vec2(0.5, 0.06) + vec2(0.0, t * 0.6)) + 0.25 * vnoise(q * 0.9));
      col += uSunColor * (pow(md, 900.0) * 3.0 + pow(md, 60.0) * 0.5 * dash + pow(md, 12.0) * 0.06) * uSunStrength;
      // dark mirror of the dam wall
      float wallR = smoothstep(120.0, 0.0, -p.z - 45.0) * step(abs(p.x), 345.0);
      col *= 1.0 - 0.55 * wallR;
      // fire on the water
      float fx = smoothstep(20.0, 60.0, p.x) * smoothstep(-30.0, 30.0, uBurnX - p.x);
      float flick = step(0.56, vnoise(q * vec2(0.7, 0.06) + vec2(0.0, t * 1.4)) * 0.7 + vnoise(q * vec2(2.0, 0.2)) * 0.3);
      col += vec3(1.6, 0.52, 0.12) * uFire * fx * exp(-(-p.z - 45.0) / 200.0) * (0.12 + 0.6 * flick) * 0.55;
      writeOut(col, 1.0, normalize(vNormalV), vDepth, 0.0);
    }
  `;
  return mat(u, VS, fs);
}

// Lamp lenses, searchlight glass, rotor blur, falling water: unlit emissive with a drawn pattern.
export function glowMaterial(o = {}) {
  const u = base({ uColor: { value: new THREE.Color(o.color ?? '#ffffff') }, uPower: { value: o.power ?? 1 }, uOff: { value: new THREE.Color(o.off ?? '#0a1416') }, uMode: { value: o.mode ?? 0 }, uId: { value: o.id ?? 0 }, uSpin: { value: 0 } });
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    uniform vec3 uColor, uOff; uniform float uPower, uMode, uId, uSpin;
    varying vec3 vWorld, vNormalW, vNormalV, vLocal; varying float vDepth; varying vec2 vUv;
    void main(){
      if(uPass > 0.5 && uPass < 1.5){ if(uMode > 0.5) discard; oColor = vec4(1); oData = vec4(0); return; }
      vec3 c = mix(uOff, uColor * (1.0 + 2.0 * uPower), clamp(uPower, 0.0, 1.0));
      if(uMode > 0.5 && uMode < 1.5){
        // rotor disc: blurred blades
        vec2 q = vUv - 0.5; float r = length(q) * 2.0; float a = atan(q.y, q.x) + uSpin;
        float blade = smoothstep(0.55, 0.9, abs(sin(a * 3.0)));
        if(r > 1.0 || r < 0.12 || blade < 0.5) discard;
        c = vec3(0.07, 0.10, 0.11) * (0.7 + 0.6 * r);
      } else if(uMode > 1.5){
        // thin falling water on the dam face
        float n = vnoise(vec2(vLocal.x * 1.2, vLocal.y * 0.08 + uDrawTime * 1.6)) * 0.6 + vnoise(vec2(vLocal.x * 4.0, vLocal.y * 0.3 + uDrawTime * 3.0)) * 0.4;
        float edge = 1.0 - abs(vUv.x - 0.5) * 2.0;
        if(n * edge < 0.26) discard;
        c = uSkyTint * 1.1 + uSunColor * 0.25 * uSunStrength;
      }
      writeOut(c, 1.0, normalize(vNormalV), vDepth, uId);
    }
  `;
  return mat(u, VS, fs);
}
