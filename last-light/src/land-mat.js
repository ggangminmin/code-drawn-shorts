// LAST LIGHT, land department: storm-night gouache materials for the island.
// Wet black basalt, white-wash and slate darkened by rain, three scales of detail fading with distance.
// Light: the look's key (G uniforms), lightning (uFlash, from layout.lightningAt), the lighthouse beam (a horizontal fan
// from the lens, from layout.beamAz/beamOn), FX event lights (warLight), and the village's own amber oil lamps (uLamps).
import * as THREE from 'three';
import { G, COMMON, MRT_OUT, VERT_STD } from './glsl.js';
import { MAP } from './land-map.js';

export const MAX_LAMPS = 18;
export const LU = {
  uMask: { value: null },                                   // r coast dist, g village, b plateau, a path dist
  uFlash: { value: 0 },                                     // lightning 0..1
  uFlashDir: { value: new THREE.Vector3(-0.3, 0.9, -0.3).normalize() },
  uBeam: { value: new THREE.Vector4(160, 70.4, -300, 0) },  // lens xyz, azimuth
  uBeamOn: { value: 0 },
  uBeamK: { value: 1 },
  uLamps: { value: Array.from({ length: MAX_LAMPS }, () => new THREE.Vector4(0, -999, 0, 1)) },
  uLampN: { value: 0 },
  uStorm: { value: 1 },                                      // 1 storm (soaked, dark), 0 dawn
  uWinGlow: { value: 1 },                                    // village window glow multiplier
  uLandTime: { value: 0 },                                   // film time on threes
};
const base = (extra) => ({ ...G, ...LU, ...extra });
const S = MAP.size.toFixed(1);
function mat(uniforms, vs, fs, opts = {}) {
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms, vertexShader: vs, fragmentShader: fs, side: opts.side ?? THREE.DoubleSide, transparent: false, ...opts });
}

// ---------------------------------------------------------------- shared GLSL
export const LAND_GLSL = /* glsl */ `
uniform sampler2D uMask;
uniform float uFlash, uBeamOn, uBeamK, uLampN, uStorm, uWinGlow, uLandTime;
float uCrackK = 1.0;
uniform vec3 uFlashDir;
uniform vec4 uBeam;
uniform vec4 uLamps[${MAX_LAMPS}];
const vec3 AMBER = vec3(1.0, 0.62, 0.26);
const vec3 BEAMC = vec3(1.0, 0.9, 0.68);
const vec3 FLASHC = vec3(0.82, 0.9, 1.08);
vec4 maskAt(vec2 xz){ return texture(uMask, (xz + ${S}) / (2.0 * ${S})); }
float _vId = 0.0, _vId2 = 0.0, _vId3 = 0.0;
float vEdge(vec3 p){
  vec3 g = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0; _vId = 0.0;
  for(int z = -1; z <= 1; z++) for(int y = -1; y <= 1; y++) for(int x = -1; x <= 1; x++){
    vec3 o = vec3(float(x), float(y), float(z));
    vec3 h = fract(sin(vec3(dot(g + o, vec3(127.1, 311.7, 74.7)), dot(g + o, vec3(269.5, 183.3, 246.1)), dot(g + o, vec3(113.5, 271.9, 124.6)))) * 43758.5453);
    float d = length(o + h - f);
    if(d < d1){ d2 = d1; d1 = d; _vId = h.x; _vId2 = h.y; _vId3 = h.z; } else if(d < d2){ d2 = d; }
  }
  return d2 - d1;
}
// 2D cells (columnar basalt seen from the side: column edges are where the 2D cell boundary is)
float _cId = 0.0;
float cEdge(vec2 p){
  vec2 g = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
  for(int y = -1; y <= 1; y++) for(int x = -1; x <= 1; x++){
    vec2 o = vec2(float(x), float(y));
    vec2 h = hash22(g + o);
    float d = length(o + 0.15 + h * 0.7 - f);
    if(d < d1){ d2 = d1; d1 = d; _cId = hash12(g + o + 3.1); } else if(d < d2){ d2 = d; }
  }
  return d2 - d1;
}
// basalt in three scales. x colour multiplier, y relief, z crack, w lichen
vec4 rockDetail(vec3 p, float d){
  float mid = 1.0 - smoothstep(500.0, 1600.0, d);
  float near = 1.0 - smoothstep(40.0, 220.0, d);
  float macro = fbm3(p * 0.02 + 3.0);
  float streak = fbm3(vec3(p.x * 0.09, p.y * 0.012, p.z * 0.09) + 2.0);
  float m = 0.9 + (macro - 0.5) * 0.3 + (streak - 0.5) * 0.3;
  float crack = 0.0, led = 0.0, lichen = 0.0;
  if(mid > 0.01){
    float joints = vEdge(p * 0.11 + fbm3(p * 0.05) * 0.5);
    float keep = smoothstep(0.45, 0.62, vnoise3(p * 0.06 + 13.0));
    float c1 = (1.0 - smoothstep(0.0, 0.02, joints)) * mid * keep * 0.35 * uCrackK;
    crack = c1; led += joints * 0.35;
    m -= c1 * 0.3;
    m += (_vId - 0.5) * 0.16 * mid;
  }
  if(near > 0.01){
    float cr2 = vEdge(p * 0.7 + fbm3(p * 0.6) * 0.4);
    float keep2 = smoothstep(0.5, 0.66, vnoise3(p * 0.4 + 3.0));
    float c2 = (1.0 - smoothstep(0.0, 0.05, cr2)) * near * keep2 * uCrackK;
    crack = max(crack, c2);
    m -= c2 * 0.28;
    led += cr2 * 0.2 * near;
    float grit = vnoise3(p * 7.0) * 0.55 + vnoise3(p * 19.0) * 0.45;
    float vnear = 1.0 - smoothstep(8.0, 45.0, d);
    m += (grit - 0.5) * (0.16 + 0.22 * vnear) * near;
    // vesicles and chips: small dark pits and pale broken facets that only read up close
    float pit = smoothstep(0.8, 0.86, vnoise3(p * 6.5 + 17.0)) * vnear;
    float chipP = smoothstep(0.78, 0.84, vnoise3(p * 2.2 + 5.0)) * vnear;
    m -= pit * 0.14;
    m += chipP * 0.14;
    lichen = smoothstep(0.64, 0.7, fbm3(p * 0.7 + 21.0)) * near;
  }
  return vec4(m, led, crack, lichen);
}

// the lighthouse beam as seen by the land: a horizontal fan from the lens (the lens throws a tall vertical spread)
float beamFan(vec3 P, vec3 N, vec2 dir, float spill){
  vec3 v = P - uBeam.xyz;
  float dh = length(v.xz);
  if(dh < 18.0) return 0.0;
  float c = dot(v.xz / dh, dir);
  if(c < 0.9) return 0.0;
  float ang = acos(clamp(c, -1.0, 1.0));
  float core = 1.0 - smoothstep(0.03, 0.055, ang);
  float halo = 1.0 - smoothstep(0.05, 0.16, ang);
  // below the beam the light thins out (spill of the vertical spread)
  float beamY = uBeam.y - dh * 0.035;
  float below = exp(-max(beamY - P.y, 0.0) / (spill * mix(45.0, 160.0, smoothstep(80.0, 900.0, dh))));
  float fall = 1.0 / (1.0 + dh * dh * 0.0000012) * smoothstep(18.0, 60.0, dh);
  vec3 L = normalize(-v);
  float ndl = dot(N, L);
  float k = smoothstep(-0.05, 0.08, ndl) * 0.6 + smoothstep(0.25, 0.4, ndl) * 0.4;
  return (core * 2.4 + halo * 0.55) * below * fall * k;
}
// the lighthouse beam as seen by the land: a horizontal fan from the lens (the lens throws a tall vertical spread),
// plus the weaker back beam on the opposite bearing (FX draws it at half power)
vec3 beamLight(vec3 alb, vec3 P, vec3 N){
  if(uBeamOn < 0.01) return vec3(0.0);
  vec2 dir = vec2(sin(uBeam.w), -cos(uBeam.w));
  float f = beamFan(P, N, dir, 1.0) + 0.45 * beamFan(P, N, -dir, 0.8);
  return alb * BEAMC * f * uBeamOn * uBeamK;
}
// the village's oil lamps: small warm pools (positions in uLamps, w = reach)
vec3 lampLight(vec3 alb, vec3 P, vec3 N){
  vec3 s = vec3(0.0);
  for(int i = 0; i < ${MAX_LAMPS}; i++){
    if(float(i) >= uLampN) break;
    vec3 L = uLamps[i].xyz - P;
    float d = length(L);
    float r = uLamps[i].w;
    if(d > r) continue;
    float f = 1.0 - d / r; f *= f;
    float ndl = dot(N, L / max(d, 1e-3));
    s += AMBER * f * (smoothstep(-0.1, 0.1, ndl) * 0.7 + 0.3 * smoothstep(0.3, 0.5, ndl));
  }
  return alb * s * 2.8;
}
// wet surfaces mirror the lamps: a streak of amber toward the camera from every lamp in reach
vec3 lampGlint(vec3 P, vec3 R){
  vec3 s = vec3(0.0);
  for(int i = 0; i < ${MAX_LAMPS}; i++){
    if(float(i) >= uLampN) break;
    vec3 L = uLamps[i].xyz - P;
    float d = length(L);
    float r = uLamps[i].w * 2.5;
    if(d > r) continue;
    float f = 1.0 - d / r;
    float sp = max(dot(R, L / max(d, 1e-3)), 0.0);
    s += AMBER * f * (pow(sp, 40.0) * 2.5 + pow(sp, 8.0) * 0.25);
  }
  return s;
}
// full land light. wet 0..1, cel 1 = hard anime bands (inked parts), 0 = painted soft
vec3 landLight(vec3 alb, vec3 N, vec3 P, float ao, float wet, float cel){
  vec3 V = normalize(cameraPosition - P);
  float ndl = dot(N, uSunDir);
  float sh = sunShadow(P, N);
  float lit = mix(smoothstep(-0.05, 0.25, ndl), smoothstep(-0.02, 0.06, ndl), cel) * sh;
  float up = N.y * 0.5 + 0.5;
  vec3 amb = (mix(uShadeTint * 1.1, uSkyTint * 1.25, up * 0.7 + 0.1) + vec3(0.2, 0.25, 0.3) * (0.55 + 0.45 * up)) * ao;
  vec3 key = uSunColor * uSunStrength * lit * 1.1;
  vec3 col = alb * (amb + key);
  // lightning: cold white from the sky, very strong, readable shapes
  if(uFlash > 0.001){
    float fl = dot(N, uFlashDir);
    float fk = mix(smoothstep(-0.2, 0.5, fl), smoothstep(-0.05, 0.1, fl), cel) * 0.75 + 0.25 * up;
    col += alb * FLASHC * fk * uFlash * mix(1.0, 0.7, cel) * ao;
  }
  vec3 war = warLight(alb, P, N) + beamLight(alb, P, N) + lampLight(alb, P, N);
  float wl = clamp(dot(war, vec3(0.33)) / max(dot(alb, vec3(0.33)), 0.01) * 0.6, 0.0, 0.85);
  col = col * (1.0 - wl) + war;
  // wet sheen: a glossy film catches the sky, the flash, the beam and the lamps
  if(wet > 0.01){
    vec3 R = reflect(-V, N);
    float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
    col += uSkyTint * 0.06 * fres * wet * (0.4 + 0.6 * up);
    col += FLASHC * pow(max(dot(R, uFlashDir), 0.0), 12.0) * uFlash * wet * 0.9;
    vec3 Lb = normalize(uBeam.xyz - P);
    float bk = dot(beamLight(vec3(1.0), P, N), vec3(0.33));
    col += BEAMC * pow(max(dot(R, Lb), 0.0), 20.0) * bk * wet * 1.2;
    col += lampGlint(P, R) * wet * smoothstep(0.3, 0.9, N.y);
  }
  return col;
}
`;

// ---------------------------------------------------------------- terrain
export function terrainMaterial(o = {}) {
  const u = base({ uRock: { value: o.rock ?? 0 }, uCut: { value: new THREE.Vector4(1e6, 1e6, -1e6, -1e6) } });
  const vs = /* glsl */ `${VERT_STD}
    void main(){ stdVertex(position, normal); }`;
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    ${LAND_GLSL}
    uniform float uRock;
    uniform vec4 uCut;
    varying vec3 vWorld, vNormalW, vNormalV;
    varying float vDepth;
    varying vec2 vUv;
    void main(){
      vec3 P = vWorld;
      if(P.x > uCut.x && P.z > uCut.y && P.x < uCut.z && P.z < uCut.w) discard;
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
      if(uPass > 1.5 && P.y < uWaterLevel - 0.03) discard;
      vec3 N = normalize(vNormalW);
      vec3 NV = normalize(vNormalV);
      if(!gl_FrontFacing){ N = -N; NV = -NV; }
      float d = length(cameraPosition - P);
      vec4 m = maskAt(P.xz);
      float coast = m.r, vil = m.g, plat = m.b, pathD = m.a;
      float slope = 1.0 - N.y;
      float near = 1.0 - smoothstep(30.0, 200.0, d);
      float mid = 1.0 - smoothstep(200.0, 1100.0, d);
      float wpx = length(fwidth(P));

      // ---- basalt: blue-black, ochre-grey weathering, columnar jointing on the steep faces
      uCrackK = mix(0.7, 0.12, smoothstep(0.35, 0.6, slope));   // pavement cracks on the flats; the cliffs break in columns instead
      vec4 rock = rockDetail(P, d);
      vec3 cRock = mix(vec3(0.1, 0.11, 0.13), vec3(0.26, 0.28, 0.31), smoothstep(0.55, 1.1, rock.x));
      cRock = mix(cRock, vec3(0.24, 0.24, 0.23), smoothstep(0.62, 0.9, fbm3(P * 0.03 + 9.0)) * 0.35);
      cRock *= clamp(rock.x, 0.3, 1.3);
      float steep = smoothstep(0.45, 0.75, slope) + uRock;
      float colK = 0.0, colTilt = 0.0, colTone = 0.5;
      if(steep > 0.01 && mid > 0.01){
        // columns: vertical prisms ~1.6 m across; the edge between two columns is a dark seam, each column its own tone
        vec2 cp = P.xz / 1.7 + vec2(fbm2(P.xz * 0.05) * 1.5, 0.0);
        float ce = cEdge(cp);
        float tone = _cId;
        float seam = 1.0 - smoothstep(0.0, 0.08 + wpx * 0.4, ce);
        // horizontal breaks across the columns
        float brk = 1.0 - smoothstep(0.0, 0.06 + wpx * 0.3, abs(fract(P.y / (2.2 + 1.8 * tone) + tone * 3.0) - 0.5) * 2.0 - 0.0) ;
        brk *= step(0.55, hash12(vec2(floor(P.y / (2.2 + 1.8 * tone) + tone * 3.0), tone * 91.0)));
        colK = steep * mid * smoothstep(0.35, 0.6, vnoise3(P * 0.025 + 4.0) + 0.25);
        cRock *= mix(1.0, (0.78 + 0.45 * tone) * (1.0 - 0.55 * seam) * (1.0 - 0.35 * brk * near), colK);
        colTilt = (tone - 0.5) * 1.3 * (1.0 - seam * 0.5);
        colTone = tone;
        // chipped column edges catch a pale line, pits and grit on the faces up close
        cRock = mix(cRock, cRock * 1.35 + 0.02, (1.0 - smoothstep(0.06, 0.14, ce)) * smoothstep(0.0, 0.05, ce) * near * colK * 0.6);
      }
      cRock = mix(cRock, vec3(0.28, 0.33, 0.27), rock.w * 0.35);

      // ---- grass: rough sea-grass, dark green-teal, combed by the wind, darker in hollows
      float g1 = fbm3(P * 0.012 + 2.0), g2 = fbm3(P * 0.08 + 7.0);
      vec3 cGrass = mix(vec3(0.09, 0.11, 0.1), vec3(0.19, 0.2, 0.16), smoothstep(0.3, 0.75, g1));
      cGrass *= 0.8 + 0.4 * g2;
      if(near > 0.01){
        // wind-combed strokes running one way (rain wind from the sea, -Z)
        vec2 wq = vec2(P.x * 0.9 + P.z * 0.45, -P.x * 0.45 + P.z * 0.9);
        float comb = vnoise(vec2(wq.x * 3.2, wq.y * 0.6));
        cGrass *= mix(1.0, 0.78 + 0.42 * comb, near);
        cGrass = mix(cGrass, vec3(0.27, 0.3, 0.2), smoothstep(0.78, 0.86, vnoise(P.xz * 4.0)) * near * 0.5);   // pale dead tips
      }
      float rockK = max(steep, smoothstep(0.2, 0.42, slope + (g2 - 0.5) * 0.3));
      // bare rock breaks through the grass in patches, more toward the sea
      rockK = max(rockK, smoothstep(0.6, 0.7, fbm3(P * 0.04 + 31.0) + smoothstep(30.0, 4.0, coast) * 0.3) * (1.0 - plat * 0.6));
      vec3 col = mix(cGrass, cRock, clamp(rockK, 0.0, 1.0));

      // ---- village ground: worn cobbles and setts on the treads, retaining walls of dressed stone on the risers
      if(vil > 0.02){
        float tread = 1.0 - smoothstep(0.12, 0.3, slope);
        vec3 pave = vec3(0.17, 0.18, 0.2) * (0.75 + 0.5 * fbm3(P * 0.12 + 5.0));
        if(near > 0.01){
          vec2 sp = P.xz / vec2(0.55, 0.42);
          float row = floor(sp.y); sp.x += row * 0.5;
          vec2 sf = fract(sp), si = floor(sp);
          float j = 1.0 - smoothstep(0.0, 0.1 + wpx * 2.0, min(min(sf.x, 1.0 - sf.x), min(sf.y, 1.0 - sf.y)));
          pave *= 1.0 - 0.45 * j * near;
          pave *= 1.0 + (hash12(si) - 0.5) * 0.3 * near;
        }
        // grass and moss between the houses
        float green = smoothstep(0.55, 0.68, fbm3(P * 0.05 + 77.0));
        pave = mix(pave, cGrass * 0.9, green * 0.8);
        float wall = smoothstep(0.35, 0.6, slope);
        vec3 wallC = vec3(0.22, 0.22, 0.24);
        {
          float ws = abs(N.x) > abs(N.z) ? P.z : P.x;
          float cy = P.y / 0.55, cI = floor(cy), al = ws / 1.1 + cI * 0.5, aI = floor(al);
          float st = fract(sin(cI * 41.3 + aI * 17.9) * 43758.5);
          wallC *= 0.75 + 0.5 * mix(0.5, st, mid);
          float aaJ = clamp(1.0 - wpx * 4.0, 0.0, 1.0);
          float jH = 1.0 - smoothstep(0.0, 0.08, min(fract(cy), 1.0 - fract(cy)));
          float jV = 1.0 - smoothstep(0.0, 0.06, min(fract(al), 1.0 - fract(al)));
          wallC *= 1.0 - 0.6 * max(jH, jV) * aaJ;
          wallC *= 1.0 - 0.45 * smoothstep(0.55, 0.85, vnoise(vec2(ws * 0.7, P.y * 0.08)));   // rain runs
        }
        vec3 vc = mix(pave, wallC, wall);
        col = mix(col, vc, smoothstep(0.1, 0.5, vil) * (tread + wall > 0.0 ? 1.0 : 0.0));
      }

      // ---- the quay and the shore walls at the basin: dressed granite courses, a black tide band, weed
      float shoreW = smoothstep(14.0, 1.0, coast) * step(0.0, coast);
      float wallSea = smoothstep(0.5, 0.8, slope) * smoothstep(0.0, 0.3, vil + smoothstep(-20.0, 30.0, P.z) * 0.6) * (1.0 - smoothstep(4.0, 6.0, P.y));
      if(wallSea > 0.01){
        float ws = abs(N.x) > abs(N.z) ? P.z : P.x;
        float cy = P.y / 0.7, cI = floor(cy), al = ws / 1.6 + cI * 0.5, aI = floor(al);
        float st = fract(sin(cI * 41.3 + aI * 17.9) * 43758.5);
        vec3 qc = vec3(0.26, 0.27, 0.29) * (0.75 + 0.5 * st);
        float aaJ = clamp(1.0 - wpx * 4.0, 0.0, 1.0);
        qc *= 1.0 - 0.6 * max(1.0 - smoothstep(0.0, 0.07, min(fract(cy), 1.0 - fract(cy))), 1.0 - smoothstep(0.0, 0.05, min(fract(al), 1.0 - fract(al)))) * aaJ;
        float tide = 1.0 - smoothstep(0.6, 1.8 + 0.8 * fbm2(vec2(ws * 0.1, 1.0)), P.y);
        qc = mix(qc, vec3(0.04, 0.06, 0.06), tide * 0.92);
        qc = mix(qc, vec3(0.08, 0.13, 0.09), tide * smoothstep(0.5, 0.7, fbm2(vec2(ws * 0.6, P.y * 2.0))));
        col = mix(col, qc, wallSea);
      }
      // the shore rocks: black, wet, with a pale salt line above the swash
      float swash = smoothstep(3.5 + 5.0 * uStorm * steep, 0.0, P.y) * step(-0.5, P.y) * (1.0 - wallSea);
      col = mix(col, cRock * 0.55, swash * 0.85);
      col = mix(col, vec3(0.3, 0.33, 0.34), smoothstep(3.6, 3.2, P.y) * smoothstep(2.6, 3.0, P.y) * (1.0 - vil) * (1.0 - wallSea) * 0.45 * smoothstep(0.3, 0.6, slope));
      // underwater (only seen through the sea, or in the placeholder): dark shelves
      col = mix(col, vec3(0.03, 0.05, 0.06), smoothstep(0.0, -2.0, P.y));

      // ---- the cliff path: trodden mud and flat stones, puddles
      float pathK = 1.0 - smoothstep(0.9, 1.6 + wpx, pathD);
      if(pathK > 0.0){
        vec3 pc = vec3(0.13, 0.12, 0.11) * (0.8 + 0.4 * fbm3(P * 0.5));
        float flag = step(0.55, vnoise(P.xz * 1.6)) * near;
        pc = mix(pc, vec3(0.24, 0.24, 0.25) * (0.8 + 0.3 * hash12(floor(P.xz * 1.6))), flag * 0.8);
        col = mix(col, pc, pathK * (1.0 - steep));
      }
      // ---- rain: everything soaked; puddles in hollows on the flats
      float wet = 0.55 * uStorm + 0.15;
      float flatK = 1.0 - smoothstep(0.03, 0.12, slope);
      float pud = smoothstep(0.62, 0.7, fbm2(P.xz * 0.35 + 3.0) + pathK * 0.15 + (vil > 0.3 ? 0.06 : 0.0)) * flatK * uStorm;
      col *= mix(1.0, 0.72, wet);
      col = mix(col, vec3(0.02, 0.03, 0.04), pud * 0.85);
      wet = max(wet, pud);

      // ---- light, with detail shaping the normal so rock has facets
      vec3 N2 = N;
      float dd = 1.0 - smoothstep(30.0, 400.0, d);
      // the sheer faces: take the horizontal facing from the smooth coastline, not from the mesh triangles
      // (no terrain-grid facets); the columns and the rock relief below give the face its structure
      float sheer = smoothstep(0.45, 0.8, slope) * step(0.5, P.y);
      if(sheer > 0.01){
        float ec = 2.5;
        vec2 gc = vec2(maskAt(P.xz + vec2(ec, 0.0)).r - maskAt(P.xz - vec2(ec, 0.0)).r, maskAt(P.xz + vec2(0.0, ec)).r - maskAt(P.xz - vec2(0.0, ec)).r);
        if(dot(gc, gc) > 1e-6){
          vec2 oh = -normalize(gc);
          float lxz = length(N.xz);
          vec3 Ns = normalize(vec3(oh.x * lxz, N.y, oh.y * lxz));
          N2 = normalize(mix(N, Ns, sheer * 0.85));
        }
      }
      // each basalt column is its own plane: tilt the normal around the vertical by the column's tone
      if(colK > 0.01){
        vec3 tg = normalize(vec3(-N2.z, 0.0, N2.x) + 1e-4);
        N2 = normalize(N2 + tg * colTilt * colK);
      }
      if(dd > 0.0 && rockK > 0.05){
        float ex = 0.6;
        vec4 ra = rockDetail(P + vec3(ex, 0.0, 0.0), d), rb = rockDetail(P + vec3(0.0, 0.0, ex), d), rc = rockDetail(P + vec3(0.0, ex, 0.0), d);
        vec3 grad = vec3(ra.y - rock.y, rc.y - rock.y, rb.y - rock.y) / ex;
        N2 = normalize(N2 - grad * 0.9 * dd * clamp(rockK, 0.0, 1.0) * (1.0 - 0.6 * colK));
      }
      // big carved facets on the cliffs (the painter's planes), tilted per facet
      float pF = (1.0 - smoothstep(600.0, 2600.0, d)) * clamp(rockK, 0.0, 1.0) * (1.0 - flatK);
      float ao = mix(1.0, 0.6, smoothstep(0.1, 0.5, rock.z));
      if(pF > 0.01){
        vec3 Pw = P + vec3(fbm3(P * 0.02) * 12.0, 0.0, fbm3(P * 0.021 + 7.0) * 12.0);
        float pj = vEdge(Pw * vec3(0.07, 0.035, 0.07));
        vec3 tilt = vec3(_vId, _vId2, _vId3) - 0.5;
        N2 = normalize(N2 + tilt * vec3(1.0, 0.35, 1.0) * 0.9 * pF);
        float crackW = 0.008 + wpx * 0.012;
        ao *= 1.0 - 0.15 * (1.0 - smoothstep(crackW * 0.3, crackW * 1.0, pj)) * pF * smoothstep(0.4, 0.6, vnoise3(P * 0.05));
      }
      if(pud > 0.3) N2 = vec3(0.0, 1.0, 0.0);
      vec3 outc = landLight(col, N2, P, ao, wet, 0.0);
      outc *= 1.0 - 0.45 * rock.z * dd * smoothstep(0.25, 0.6, slope);
      // puddles mirror the sky and the lamp light
      outc += uSkyTint * 0.05 * pud;
      writeOut(outc, 1.0, NV, vDepth, 0.0);
    }
  `;
  return mat(u, vs, fs);
}

// ---------------------------------------------------------------- structures (village, cottage, tower, pier, props)
// All per-surface data rides on vertex attributes so the whole village merges into a few draw calls.
//   aK: kind, seed, ink id, lit (0..1 lit windows on this house)
//   aF: u (m along face), v (m up from the face base), face length, face height
// kinds: 0 whitewash wall, 1 slate roof, 2 chimney stone, 3 tower stone (white), 4 black iron, 5 pier/quay stone,
//        6 wood, 7 dark stone plinth, 8 door (painted), 9 lamp glass (emissive), 10 rope/net (dark), 11 copper/brass dull
export function structMaterial(o = {}) {
  const u = base({ uCel: { value: o.cel ?? 1 } });
  const vs = /* glsl */ `
    attribute vec4 aK;
    attribute vec4 aF;
    varying vec4 vK, vF;
    ${VERT_STD}
    void main(){ vK = aK; vF = aF; stdVertex(position, normal); }`;
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    ${LAND_GLSL}
    uniform float uCel;
    varying vec3 vWorld, vNormalW, vNormalV;
    varying float vDepth;
    varying vec2 vUv;
    varying vec4 vK, vF;
    float box(vec2 p, vec2 c, vec2 h, float aa){ vec2 q = abs(p - c) - h; return 1.0 - smoothstep(-aa, aa, max(q.x, q.y)); }
    void main(){
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
      if(uPass > 1.5 && vWorld.y < uWaterLevel - 0.03) discard;
      vec3 P = vWorld;
      vec3 N = normalize(vNormalW), NV = normalize(vNormalV);
      if(!gl_FrontFacing){ N = -N; NV = -NV; }
      float kind = floor(vK.x + 0.5), seed = vK.y, id = vK.z, litW = vK.w;
      float d = length(cameraPosition - P);
      float near = 1.0 - smoothstep(25.0, 160.0, d);
      float mid = 1.0 - smoothstep(150.0, 900.0, d);
      vec2 f = vF.xy;
      float pxu = max(length(fwidth(f)), 1e-4);
      float aa = pxu * 0.8;
      vec3 col = vec3(0.5);
      vec3 emit = vec3(0.0);
      float wet = 0.6 * uStorm + 0.15, cel = uCel, ao = 1.0;
      float macro = fbm3(P * 0.15 + seed * 13.0);
      if(kind == 0.0 || kind == 3.0){
        // white-wash over rubble stone (houses) / dressed white stone (tower). Rain-greyed, streaked below sills and eaves.
        vec3 wash = kind == 3.0 ? vec3(0.86, 0.87, 0.86) : mix(vec3(0.8, 0.8, 0.77), vec3(0.74, 0.76, 0.76), fract(seed * 7.3));
        col = wash * (0.86 + 0.22 * macro);
        // stone showing through where the wash flaked: rubble outlines
        if(mid > 0.01){
          vec2 sp = f / (kind == 3.0 ? vec2(0.9, 0.45) : vec2(0.55, 0.32));
          sp.x += floor(sp.y) * 0.5;
          vec2 sf = fract(sp);
          float j = 1.0 - smoothstep(0.0, 0.06 + aa * 2.0, min(min(sf.x, 1.0 - sf.x), min(sf.y, 1.0 - sf.y)));
          float flake = smoothstep(0.62, 0.7, fbm3(P * 1.6 + seed * 5.0));
          col *= 1.0 - (kind == 3.0 ? 0.07 : 0.08) * j * mid;
          if(kind == 3.0){
            // dressed stone under lime wash: each block a slightly different white, a few grey replacements, salt-greyed
            float bh = hash12(floor(sp) + seed * 7.0);
            col *= 0.94 + 0.09 * bh * mid;
            col = mix(col, col * vec3(0.84, 0.86, 0.88), step(0.93, bh) * mid * 0.8);
            col = mix(col, col * 0.86, smoothstep(0.6, 0.75, fbm3(P * vec3(0.8, 0.12, 0.8))) * 0.6);
          } else {
            col = mix(col, vec3(0.32, 0.31, 0.3) * (0.8 + 0.4 * hash12(floor(sp))), flake * near * (1.0 - 0.5 * j) * 0.9);
          }
        }
        // rain streaks running down from the top, grime rising from the ground
        float run = vnoise(vec2(f.x * 3.0 + seed * 9.0, f.y * 0.25));
        float topK = smoothstep(vF.w - 2.5, vF.w, f.y);
        col *= 1.0 - 0.32 * smoothstep(0.5, 0.85, run) * (0.4 + 0.6 * topK) * uStorm;
        col *= mix(0.62, 1.0, smoothstep(0.0, 1.2 + 0.5 * macro, f.y));
        col = mix(col, vec3(0.2, 0.26, 0.2), smoothstep(0.6, 0.66, fbm2(f * 0.8 + seed)) * smoothstep(1.6, 0.0, f.y) * 0.6);
        // windows: small deep openings, two per floor per long face; lit ones glow amber with a warm curtain
        if(kind == 0.0 && vF.z > 2.5 && N.y < 0.5){
          float fh = 2.6;
          float floors = max(1.0, floor((vF.w - 0.4) / fh));
          float nW = max(1.0, floor(vF.z / 2.6));
          float cell = vF.z / nW;
          float wi = floor(f.x / cell), wf = fract(f.x / cell);
          float fl = floor((f.y - 0.6) / fh);
          float inF = step(0.0, fl) * step(fl, floors - 1.0);
          float wy = 0.6 + fl * fh + 1.25;
          float hw = 0.38 + 0.1 * fract(seed * 3.1), hh = 0.52;
          float door = step(fl, 0.5) * step(abs(wi - floor(nW * 0.5)), 0.1) * step(0.5, fract(seed * 11.7 + vF.z));
          vec2 wp = vec2((wf - 0.5) * cell, f.y - wy);
          float win = box(wp, vec2(0.0), vec2(hw, hh), aa) * inF * (1.0 - door);
          float frame = box(wp, vec2(0.0), vec2(hw + 0.1, hh + 0.1), aa) * inF * (1.0 - door) - win;
          float sill = box(wp, vec2(0.0, -hh - 0.14), vec2(hw + 0.16, 0.06), aa) * inF * (1.0 - door);
          float on = step(hash12(vec2(wi + seed * 31.0, fl + seed * 7.0)), litW);
          // glass: black-blue, a cold reflection; lit: amber with mullion cross and curtain shape
          vec3 glass = vec3(0.025, 0.035, 0.05) + uSkyTint * 0.04;
          float mull = max(box(wp, vec2(0.0), vec2(0.035, hh), aa), box(wp, vec2(0.0, 0.08), vec2(hw, 0.03), aa));
          float curtain = smoothstep(0.0, 0.05, abs(wp.x) - hw * (0.5 + 0.35 * sin(wp.y * 3.0 + seed * 9.0)));
          vec3 warm = AMBER * mix(1.25, 0.6, curtain) * (0.85 + 0.25 * vnoise(vec2(uLandTime * 3.0 + seed * 40.0 + wi, 0.0)));
          col = mix(col, vec3(0.16, 0.2, 0.24), frame * 0.8);
          col = mix(col, col * 0.7, sill * 0.0);
          col = mix(col, glass, win);
          emit += warm * win * on * (1.0 - mull * 0.8) * uWinGlow * 1.8;
          // the lit window throws a warm patch on the wash below it
          float spill = on * inF * (1.0 - door) * smoothstep(1.3, 0.0, length(wp * vec2(1.0 / (hw + 0.5), 0.6))) * (1.0 - win) * 0.0;
          emit += AMBER * col * spill;
          // door: dark tarred wood with a stone lintel
          float dr = box(vec2((wf - 0.5) * cell, f.y), vec2(0.0, 1.0), vec2(0.5, 1.0), aa) * door;
          vec3 doorC = mix(vec3(0.08, 0.12, 0.15), vec3(0.22, 0.09, 0.07), step(0.6, fract(seed * 17.0)));
          doorC *= 0.85 + 0.3 * vnoise(vec2(f.x * 14.0, f.y * 0.5));
          col = mix(col, doorC, dr);
          col = mix(col, vec3(0.3, 0.3, 0.32), box(vec2((wf - 0.5) * cell, f.y), vec2(0.0, 2.1), vec2(0.65, 0.12), aa) * door);
          ao *= 1.0 - 0.0 * win;
        }
        if(kind == 3.0 && litW >= 0.0){
          // the tower: one oxide-red band, small slit windows climbing in a spiral, a black door at the foot
          float band = step(18.0, f.y) * step(f.y, 21.5);
          col = mix(col, vec3(0.48, 0.17, 0.13) * (0.8 + 0.3 * macro), band);
          float ang = vF.x;           // here u = angle * radius (m along the circumference)
          float circ = vF.z;
          for(int k = 0; k < 5; k++){
            float wy = 4.5 + float(k) * 5.2;
            float wx = fract(float(k) * 0.37 + 0.12) * circ;
            vec2 q = vec2(mod(ang - wx + circ * 0.5, circ) - circ * 0.5, f.y - wy);
            float w = box(q, vec2(0.0), vec2(0.22, 0.6), aa);
            col = mix(col, vec3(0.02, 0.025, 0.035), w);
            col = mix(col, vec3(0.5, 0.5, 0.5), (box(q, vec2(0.0), vec2(0.32, 0.72), aa) - w) * 0.6);
          }
          vec2 qd = vec2(mod(ang - vK.w * circ + circ * 0.5, circ) - circ * 0.5, f.y);
          float dr = box(qd, vec2(0.0, 1.1), vec2(0.55, 1.1), aa);
          col = mix(col, vec3(0.04, 0.05, 0.06), dr);
          col = mix(col, vec3(0.6, 0.6, 0.6), (box(qd, vec2(0.0, 1.15), vec2(0.72, 1.25), aa) - dr) * 0.6);
          wet = 0.5 * uStorm + 0.1;
        }
      } else if(kind == 1.0){
        // slate: courses of small dark blue-grey slates, staggered, a few lighter replacements, moss and lichen near the eaves
        vec3 sl = mix(vec3(0.15, 0.17, 0.21), vec3(0.22, 0.24, 0.27), fract(seed * 5.1)) * (0.85 + 0.3 * macro);
        if(mid > 0.01){
          float cy = f.y / 0.28, ci = floor(cy), cf = fract(cy);
          float cx = f.x / 0.42 + ci * 0.5, cxi = floor(cx), cxf = fract(cx);
          float h = hash12(vec2(cxi + seed * 13.0, ci));
          float mf = clamp(1.0 - pxu * 3.0, 0.0, 1.0) * mid;
          sl *= mix(1.0, 0.7 + 0.45 * smoothstep(0.0, 0.85, cf), mf);
          sl *= mix(1.0, 1.0 - 0.45 * (1.0 - smoothstep(0.0, 0.08, min(cxf, 1.0 - cxf))), mf);
          sl *= 1.0 + (h - 0.5) * 0.3 * mf;
          sl = mix(sl, vec3(0.26, 0.27, 0.28), step(0.96, h) * mf);
        }
        sl = mix(sl, vec3(0.2, 0.25, 0.16), smoothstep(0.62, 0.7, fbm3(P * 0.7 + seed)) * smoothstep(1.8, 0.0, f.y) * 0.7);
        // ridge tiles along the top edge
        sl = mix(sl, vec3(0.2, 0.2, 0.22), step(vF.w - 0.22, f.y));
        col = sl;
        wet = 0.9 * uStorm + 0.15;
      } else if(kind == 2.0){
        // chimney: rubble stone, tarred top, soot
        col = vec3(0.32, 0.31, 0.3) * (0.75 + 0.4 * macro);
        vec2 sp = f / vec2(0.36, 0.22); sp.x += floor(sp.y) * 0.5;
        vec2 sf = fract(sp);
        col *= 1.0 - 0.4 * (1.0 - smoothstep(0.0, 0.08 + aa * 2.0, min(min(sf.x, 1.0 - sf.x), min(sf.y, 1.0 - sf.y)))) * mid;
        col = mix(col, vec3(0.05, 0.05, 0.06), smoothstep(vF.w - 0.6, vF.w, f.y));
      } else if(kind == 4.0){
        // black iron: a little rust in the joints, glossy wet
        col = vec3(0.04, 0.05, 0.055) * (0.8 + 0.4 * macro);
        col = mix(col, vec3(0.2, 0.09, 0.06), smoothstep(0.66, 0.74, fbm3(P * 2.0 + seed)) * 0.6);
        wet = 0.9;
      } else if(kind == 5.0){
        // pier and quay granite: big dressed blocks, coping stones on top, a black tide band, green weed, iron rings
        vec2 bs = N.y > 0.6 ? vec2(1.4, 0.9) : vec2(1.6, 0.62);
        vec2 sp = f / bs; sp.x += floor(sp.y) * 0.5;
        vec2 sf = fract(sp), si = floor(sp);
        float h = hash12(si + seed);
        col = mix(vec3(0.3, 0.31, 0.32), vec3(0.42, 0.42, 0.42), h) * (0.8 + 0.35 * macro);
        float j = 1.0 - smoothstep(0.0, 0.04 + aa, min(min(sf.x, 1.0 - sf.x) * bs.x, min(sf.y, 1.0 - sf.y) * bs.y));
        col *= 1.0 - 0.6 * j * mid;
        col *= 1.0 + (vnoise3(P * 6.0) - 0.5) * 0.25 * near;
        if(N.y < 0.6){
          float tide = 1.0 - smoothstep(0.4, 1.4 + 0.6 * fbm2(vec2(f.x * 0.2, 1.0)), P.y);
          col = mix(col, vec3(0.035, 0.05, 0.05), tide * 0.92);
          col = mix(col, vec3(0.07, 0.12, 0.08), tide * smoothstep(0.45, 0.65, fbm2(f * vec2(0.8, 3.0))));
          col *= 1.0 - 0.3 * smoothstep(0.55, 0.85, vnoise(vec2(f.x * 1.3, f.y * 0.1))) * uStorm;
        } else {
          // the deck: worn smooth in the middle, puddles between the setts
          col *= 1.0 - 0.2 * smoothstep(0.6, 0.72, fbm2(P.xz * 0.5));
          float pud = smoothstep(0.64, 0.7, fbm2(P.xz * 0.45 + 9.0)) * uStorm;
          col = mix(col, vec3(0.03, 0.04, 0.05), pud * 0.8);
          wet = max(wet, pud);
        }
        wet = max(wet, 0.7 * uStorm);
      } else if(kind == 6.0){
        // wood: tarred timber, grain, planks
        float pl = fract(f.y / 0.22);
        col = vec3(0.17, 0.13, 0.1) * (0.8 + 0.35 * vnoise(vec2(f.x * 0.6, f.y * 9.0) + seed));
        col *= 1.0 - 0.45 * (1.0 - smoothstep(0.0, 0.08 + aa * 4.0, min(pl, 1.0 - pl))) * mid;
      } else if(kind == 7.0){
        col = vec3(0.12, 0.13, 0.15) * (0.75 + 0.5 * macro);
      } else if(kind == 8.0){
        col = vec3(0.1, 0.13, 0.15);
      } else if(kind == 9.0){
        // lamp glass: oil flame glow, flickers on threes
        col = vec3(0.1);
        emit = AMBER * (1.4 + 0.4 * vnoise(vec2(uLandTime * 6.0 + seed * 30.0, 1.0))) * mix(1.0, 1.6, smoothstep(0.3, 0.0, abs(f.y - 0.5)));
        cel = 1.0;
      } else if(kind == 10.0){
        col = vec3(0.12, 0.13, 0.12) * (0.8 + 0.4 * vnoise(f * 8.0));
      } else {
        col = vec3(0.3, 0.22, 0.14) * (0.8 + 0.3 * macro);
        wet = 0.8;
      }
      col *= mix(1.0, 0.8, wet * uStorm);
      vec3 outc = landLight(col, N, P, ao, wet, cel) + emit;
      writeOut(outc, 1.0, NV, vDepth, id);
    }
  `;
  return mat(u, vs, fs);
}

// ---------------------------------------------------------------- the reef teeth and the big shore rocks (inked cel rock)
export function reefMaterial(o = {}) {
  const u = base({ uId: { value: o.id ?? 7 }, uCols: { value: o.cols ?? 0 } });
  const vs = /* glsl */ `${VERT_STD}
    void main(){ stdVertex(position, normal); }`;
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    ${LAND_GLSL}
    uniform float uId, uCols;
    varying vec3 vWorld, vNormalW, vNormalV;
    varying float vDepth;
    varying vec2 vUv;
    void main(){
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
      if(uPass > 1.5 && vWorld.y < uWaterLevel - 0.03) discard;
      vec3 P = vWorld;
      vec3 N = normalize(vNormalW), NV = normalize(vNormalV);
      if(!gl_FrontFacing){ N = -N; NV = -NV; }
      float d = length(cameraPosition - P);
      vec4 rock = rockDetail(P * 1.6, d);
      float wpx = length(fwidth(P));
      // columns standing in the sea: vertical prisms with breaks
      vec2 cp = P.xz / 1.9 + vec2(fbm2(P.xz * 0.1) * 1.2, 0.0);
      float ce = cEdge(cp);
      float tone = _cId;
      float seam = 1.0 - smoothstep(0.0, 0.07 + wpx * 0.5, ce);
      if(uCols > 0.5){
        // real prisms: one tone per flat face, a thin pale chipped arris where faces meet
        tone = hash13(floor(N * 9.0 + 0.5) + floor(P * 0.25));
        seam = 0.0;
      }
      float bh = 1.6 + 1.4 * tone;
      float brk = (1.0 - smoothstep(0.0, 0.05 + wpx * 0.4, abs(fract(P.y / bh + tone * 3.0) - 0.5) * 2.0)) * step(0.5, hash12(vec2(floor(P.y / bh + tone * 3.0), tone * 91.0)));
      vec3 col = mix(vec3(0.05, 0.06, 0.075), vec3(0.15, 0.17, 0.2), tone) * clamp(rock.x, 0.4, 1.3);
      col *= 1.0 - 0.6 * seam;
      col *= 1.0 - 0.4 * brk;
      // the wash zone: black slick, green-black weed, white barnacle crust above it, salt crust high up
      float wash = 1.0 - smoothstep(2.0, 5.5 + 2.0 * fbm2(P.xz * 0.2), P.y);
      col = mix(col, vec3(0.02, 0.03, 0.035), wash * 0.85);
      col = mix(col, vec3(0.05, 0.1, 0.07), wash * smoothstep(0.5, 0.7, fbm3(P * 0.8)) * 0.8);
      float barn = smoothstep(2.5, 3.5, P.y) * (1.0 - smoothstep(4.0, 6.0, P.y)) * smoothstep(0.55, 0.7, vnoise3(P * 3.0));
      col = mix(col, vec3(0.3, 0.31, 0.31), barn * 0.35);
      // the swash: white water draining off the steep faces near the waterline, moving on threes
      float t = uLandTime;
      float steepF = 1.0 - smoothstep(0.55, 0.85, abs(N.y));
      float lick = smoothstep(-0.4, 0.3, P.y) * (1.0 - smoothstep(0.8 + 1.4 * vnoise(P.xz * 0.35 + t * 0.7), 2.4, P.y)) * steepF;
      float lace = smoothstep(0.48, 0.62, vnoise3(vec3(P.x * 0.9, P.y * 2.4 + t * 2.5, P.z * 0.9)));
      vec3 N2 = N, Nf = N;
      {
        float ex = 0.5;
        vec4 ra = rockDetail((P + vec3(ex, 0.0, 0.0)) * 1.6, d), rb = rockDetail((P + vec3(0.0, 0.0, ex)) * 1.6, d), rc = rockDetail((P + vec3(0.0, ex, 0.0)) * 1.6, d);
        vec3 grad = vec3(ra.y - rock.y, rc.y - rock.y, rb.y - rock.y) / ex;
        N2 = normalize(N - grad * 0.5 * (1.0 - smoothstep(40.0, 400.0, d)));
        // big cut facets: each 3-4 m plane tilted its own way, hard edged, like a painter blocks a rock
        float fe = vEdge(vec3(P.x * 0.17, P.y * 0.1, P.z * 0.17) + fbm3(P * 0.08) * 0.3);
        vec3 tilt = vec3(_vId, _vId2, _vId3) - 0.5;
        N2 = normalize(N2 + tilt * vec3(1.2, 0.6, 1.2));
        Nf = normalize(N + tilt * vec3(1.2, 0.6, 1.2));
        col *= 1.0 - 0.4 * (1.0 - smoothstep(0.0, 0.05 + wpx * 0.3, fe));
      }
      float wet = mix(0.7, 1.0, wash);
      vec3 outc = landLight(col, N2, P, 1.0, wet, 1.0);
      outc *= 1.0 - 0.35 * rock.z;
      // the beam on wet black rock: the light reads as a hard pale-gold plane on every face turned to the lens
      // (the lens throws a tall vertical spread: the teeth below the blade catch it fully)
      float blk = 0.0;
      if(uBeamOn > 0.01){
        vec2 bdir = vec2(sin(uBeam.w), -cos(uBeam.w));
        blk = (beamFan(P, Nf, bdir, 3.0) + 0.45 * beamFan(P, Nf, -bdir, 2.0)) * uBeamOn * uBeamK;
      }
      float litPlane = smoothstep(0.12, 0.3, blk);
      // seen from the far side the tooth is back-lit: a hard silver-gold rim along the edges that face the blade
      float blkAll = 0.0;
      if(uBeamOn > 0.01){
        vec2 bdir = vec2(sin(uBeam.w), -cos(uBeam.w));
        vec3 Lb = normalize(uBeam.xyz - P);
        blkAll = (beamFan(P, Lb, bdir, 3.0) + 0.45 * beamFan(P, Lb, -bdir, 2.0)) * uBeamOn * uBeamK;
      }
      vec3 Vr = normalize(cameraPosition - P);
      float rimE = smoothstep(0.55, 0.75, 1.0 - abs(dot(Nf, Vr)));
      float towardL = smoothstep(-0.3, 0.2, dot(Nf.xz, normalize(uBeam.xz - P.xz)));
      outc = mix(outc, BEAMC * 1.1, rimE * towardL * smoothstep(0.15, 0.4, blkAll) * 0.95);
      outc = mix(outc, BEAMC * (0.55 + 0.3 * smoothstep(0.6, 1.4, blk)) * (0.75 + 0.25 * tone) * (1.0 - 0.5 * seam), litPlane * 0.9);
      outc = mix(outc, vec3(0.7, 0.76, 0.8) * (0.5 + 0.5 * uFlash), lick * lace * 0.7);
      writeOut(outc, 1.0, NV, vDepth, uId);
    }
  `;
  return mat(u, vs, fs);
}

// ---------------------------------------------------------------- grass tufts (instanced cards on the headland)
export function grassMaterial() {
  const u = base({});
  const vs = /* glsl */ `
    attribute vec4 aG;   // phase, tone, height, lean
    uniform float uDrawTime;
    varying vec3 vWorld, vCard;
    varying float vDepth;
    varying vec2 vUv;
    varying vec4 vG;
    void main(){
      vec3 c = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      vec3 p = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;
      float h = position.y;
      // the gale from the sea combs the tufts toward +Z, gusting on twos; the bend grows with height (rooted)
      float gust = 0.6 + 0.4 * sin(uDrawTime * 2.3 + aG.x * 6.283 + c.x * 0.15);
      float b = h * h * (0.45 + 0.3 * gust) * aG.z;
      p.z += b;
      p.x += h * h * 0.14 * sin(uDrawTime * 3.1 + aG.x * 9.0) * aG.z;
      p.y -= b * 0.35;
      vWorld = p;
      vCard = normalize((modelMatrix * instanceMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz);
      vec4 mv = viewMatrix * vec4(p, 1.0);
      vDepth = -mv.z;
      vUv = uv;
      vG = aG;
      gl_Position = projectionMatrix * mv;
    }`;
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    ${LAND_GLSL}
    varying vec3 vWorld, vCard;
    varying float vDepth;
    varying vec2 vUv;
    varying vec4 vG;
    void main(){
      // a tuft drawn in the card: nine curved, tapering blades of different heights, rooted in a dark clump
      vec2 q = vUv;
      float n = 9.0;
      float bi = floor(q.x * n), bf = fract(q.x * n);
      float hb = 0.45 + 0.55 * hash12(vec2(bi, vG.x * 50.0));
      float lean = (hash12(vec2(bi, 3.0 + vG.x)) - 0.5) * 1.4;
      float cx = 0.5 + lean * q.y * q.y * 1.6;
      float w = 0.46 * pow(max(1.0 - q.y / hb, 0.0), 0.8);
      float blade = step(abs(bf - cx), w) * step(q.y, hb);
      float clump = step(q.y, 0.1 + 0.06 * sin(q.x * 40.0)) * step(abs(q.x - 0.5), 0.42);
      if(max(blade, clump) < 0.5) discard;
      // never a giant blade across the lens: fade out (dithered) inside 2.5 m
      if(hash12(gl_FragCoord.xy) > smoothstep(1.0, 2.6, vDepth)) discard;
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
      float tip = smoothstep(0.0, 1.0, q.y / max(hb, 0.01));
      float tone = vG.y;
      vec3 dark = vec3(0.07, 0.11, 0.1), mid = vec3(0.16, 0.22, 0.17), lit = vec3(0.3, 0.34, 0.23);
      // cel: two hard tones, the upper blade catches the light, the root stays in shadow; dead straw blades here and there
      float side = step(0.5, fract(bi * 0.37 + vG.x * 3.0));
      vec3 col = mix(dark, mix(mid, lit, 0.35 + 0.4 * tone), step(0.38, tip) * (0.55 + 0.45 * side));
      col = mix(col, vec3(0.36, 0.34, 0.24), step(0.86, hash12(vec2(bi, vG.x * 7.0))) * step(0.3, tip) * 0.8);
      vec3 N = normalize(vec3(0.0, 0.6, 0.0) + vCard * (gl_FrontFacing ? 1.0 : -1.0));
      vec3 outc = landLight(col, N, vWorld, 0.55 + 0.45 * tip, 0.4, 1.0);
      writeOut(outc, 1.0, normalize((viewMatrix * vec4(N, 0.0)).xyz), vDepth, vDepth < 14.0 ? 12.0 : 112.0);
    }`;
  return mat(u, vs, fs);
}

// placeholder sea for land previews when no sea department is loaded
export function placeholderSeaMaterial() {
  const u = base({});
  const vs = /* glsl */ `${VERT_STD}
    void main(){ stdVertex(position, normal); }`;
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    ${LAND_GLSL}
    varying vec3 vWorld, vNormalW, vNormalV;
    varying float vDepth;
    varying vec2 vUv;
    void main(){
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
      vec3 P = vWorld;
      vec3 col = vec3(0.015, 0.035, 0.05) * (0.8 + 0.4 * fbm2(P.xz * 0.02));
      col += vec3(0.5) * smoothstep(0.75, 0.8, fbm2(P.xz * vec2(0.05, 0.12))) * 0.15;
      col += FLASHC * uFlash * 0.08 + beamLight(vec3(0.1), P, vec3(0.0, 1.0, 0.0));
      writeOut(col, 1.0, vec3(0.0, 0.0, 1.0), vDepth, 0.0);
    }`;
  return mat(u, vs, fs);
}
