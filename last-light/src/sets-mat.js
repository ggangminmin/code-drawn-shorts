import * as THREE from 'three';
import { G, COMMON, MRT_OUT, VERT_STD } from './glsl.js';
import { DETAIL_GLSL } from './detail.js';

// SETS light rig. Interiors are lit only by what is in them: oil lamps (warm, flickering), the compass lamp (green),
// the cold storm light at the windows and the lightning that flashes through them. One set is live at a time;
// sets.js writes this table every frame for the set the camera is in.
export const MAX_LAMPS = 5, MAX_FLASH = 24;
export const SL = {
  uAmb: { value: new THREE.Color('#0c1218') },          // flat ambient (deep slate)
  uFillC: { value: new THREE.Color('#1c2a36') },        // cold storm light from the windows (directional, hard band)
  uFillDir: { value: new THREE.Vector3(0, 0.3, 1).normalize() },
  uLp: { value: Array.from({ length: MAX_LAMPS }, () => new THREE.Vector4(0, 0, 0, 1)) },   // xyz world, w reach (m)
  uLc: { value: Array.from({ length: MAX_LAMPS }, () => new THREE.Vector3()) },
  uLN: { value: 0 },
  uFl: { value: Array.from({ length: MAX_FLASH }, () => new THREE.Vector4(0, 0, 0, 1)) },   // window flash sources: xyz, w reach
  uFlD: { value: Array.from({ length: MAX_FLASH }, () => new THREE.Vector3(0, 0, 1)) },    // inward direction of each window
  uFlN: { value: 0 },
  uFlC: { value: new THREE.Vector3() },                 // lightning colour * strength (0 when dark)
  uHazeC: { value: new THREE.Color('#05080c') },
  uHazeK: { value: 0.0 },
  uSetFlick: { value: 1 },
  uWarK: { value: 0.35 },   // event lights from other departments (FX's lightning, flames) count less on set walls: the set already lights its own lightning through its windows
};

const LIGHT_GLSL = /* glsl */ `
uniform vec3 uAmb, uFillC, uFillDir, uFlC, uHazeC;
uniform vec4 uLp[${MAX_LAMPS}]; uniform vec3 uLc[${MAX_LAMPS}]; uniform float uLN;
uniform vec4 uFl[${MAX_FLASH}]; uniform vec3 uFlD[${MAX_FLASH}]; uniform float uFlN;
uniform float uHazeK, uWarK;
// stepped pool of lamp light: anime light pools, three hard rings with a little softness
float poolK(float d, float r){
  float a = clamp(1.0 - d / r, 0.0, 1.0);
  return smoothstep(0.2, 0.24, a) * 0.45 + smoothstep(0.46, 0.5, a) * 0.55;
}
vec3 setLight(vec3 col, vec3 N, vec3 P, vec3 V, float gloss, out float lampLit){
  // two families, never mixed into mud: the cold room (ambient + storm fill) and the warm pools (which REPLACE the
  // cold where they land, the way a painter lays a lamp pool over a blue underpainting)
  vec3 o = col * uAmb;
  float nf = dot(N, uFillDir);
  o += col * uFillC * (smoothstep(-0.06, 0.04, nf) * 0.55 + smoothstep(0.38, 0.46, nf) * 0.45);
  vec3 cold = o; o = vec3(0.0);
  lampLit = 0.0;
  for(int i = 0; i < ${MAX_LAMPS}; i++){
    if(float(i) >= uLN) break;
    vec3 L = uLp[i].xyz - P; float d = length(L); L /= max(d, 1e-4);
    float ndl = dot(N, L);
    float band = smoothstep(-0.03, 0.04, ndl) * 0.7 + smoothstep(0.3, 0.38, ndl) * 0.3;
    float sh = i == 0 ? sunShadow(P, N) : 1.0;
    float k = poolK(d, uLp[i].w) * band * sh;
    o += col * uLc[i] * k;
    lampLit = max(lampLit, k);
    // a hard little highlight on glossy things facing the lamp
    vec3 H = normalize(L + V);
    o += uLc[i] * step(0.982, dot(N, H)) * gloss * k * 0.8;
  }
  o += cold * (1.0 - 0.85 * clamp(lampLit, 0.0, 1.0));
  if(dot(uFlC, uFlC) > 1e-5){
    // several windows light the same wall: take the strongest, not the sum (a flash is one light outside)
    float fk = 0.0;
    for(int i = 0; i < ${MAX_FLASH}; i++){
      if(float(i) >= uFlN) break;
      vec3 L = uFl[i].xyz - P; float d = length(L); L /= max(d, 1e-4);
      // light pours in through the window, so only what the window faces gets it
      float into = smoothstep(-0.2, 0.25, dot(-L, uFlD[i]));
      float ndl = dot(N, L);
      float band = smoothstep(-0.02, 0.05, ndl);
      float a = clamp(1.0 - d / uFl[i].w, 0.0, 1.0);
      fk = max(fk, band * into * (smoothstep(0.0, 0.05, a) * 0.45 + smoothstep(0.35, 0.4, a) * 0.55));
    }
    o += col * uFlC * fk;
  }
  o += warLight(col, P, N) * uWarK;
  // soft knee: nothing in the table pushes a surface into the bloom
  float kn = max(o.r, max(o.g, o.b)); if(kn > 0.62){ o *= (0.62 + 0.26 * (1.0 - exp(-(kn - 0.62) / 0.26))) / kn; }
  return o;
}
vec3 setHaze(vec3 c, float depth){ return mix(c, uHazeC, 1.0 - exp(-depth * uHazeK)); }
`;
export { LIGHT_GLSL };

// cell noise: x = distance to the border between cells, y = hash of the nearest cell
const CELL_GLSL = /* glsl */ `
vec2 cell3(vec3 p){
  vec3 g = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0; vec3 id = vec3(0.0);
  for(int z = -1; z <= 1; z++) for(int y = -1; y <= 1; y++) for(int x = -1; x <= 1; x++){
    vec3 o = vec3(float(x), float(y), float(z));
    vec3 h = fract(sin(vec3(dot(g + o, vec3(127.1, 311.7, 74.7)), dot(g + o, vec3(269.5, 183.3, 246.1)), dot(g + o, vec3(113.5, 271.9, 124.6)))) * 43758.5453);
    float d = length(o + h - f);
    if(d < d1){ d2 = d1; d1 = d; id = g + o; } else if(d < d2){ d2 = d; }
  }
  return vec2(d2 - d1, hash13(id));
}
`;

// Set dressing: colour from aCol, structure at three scales by kind, lit by the set rig.
//   kind 0 rubble masonry, 1 lime plaster, 2 wood planks (uAxis = grain axis, uPlank = plank width), 3 metal (brass/iron),
//   4 flagstone floor, 5 plain (cloth, paper, glazed pottery)
export function setMat(o = {}) {
  const u = {
    ...G, ...SL,
    uId: { value: o.id ?? 20 }, uKind: { value: o.kind ?? 0 }, uScale: { value: o.scale ?? 1 },
    uGrime: { value: o.grime ?? 0.4 }, uGloss: { value: o.gloss ?? 0 }, uAxis: { value: o.axis ?? 1 }, uPlank: { value: o.plank ?? 0.16 },
    uStone: { value: new THREE.Vector3(...(o.stone ?? [0.34, 0.22, 0.3])) }, uSoot: { value: o.soot ?? 0 }, uSootY: { value: new THREE.Vector2(...(o.sootY ?? [1.8, 2.6])) },
    uWear: { value: o.wear ?? 0 }, uWet: { value: o.wet ?? 0 },
    uSlit: { value: new THREE.Vector3(o.slit ? 1 : 0, o.slit?.[0] ?? 0.3, o.slit?.[1] ?? 0.6) }, uCyl: { value: o.cyl ?? 0 },
  };
  const vs = /* glsl */ `
    attribute vec3 aCol; varying vec3 vCol, vLocal, vLocalN;
    ${VERT_STD}
    void main(){ vCol = aCol; vLocal = position; vLocalN = normal; stdVertex(position, normal); }
  `;
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    ${DETAIL_GLSL}
    ${CELL_GLSL}
    ${LIGHT_GLSL}
    uniform float uId, uKind, uScale, uGrime, uGloss, uAxis, uPlank, uSoot, uWear, uWet, uCyl;
    uniform vec3 uStone, uSlit; uniform vec2 uSootY;
    varying vec3 vWorld, vNormalW, vNormalV, vCol, vLocal, vLocalN; varying float vDepth; varying vec2 vUv;
    void main(){
      // window holes cut into a wall: one at every flash source (the tower's slit windows)
      if(uSlit.x > 0.5){
        for(int i = 0; i < ${MAX_FLASH}; i++){
          if(float(i) >= uFlN) break;
          vec3 d = vWorld - uFl[i].xyz;
          if(length(d.xz) < uSlit.y && abs(d.y) < uSlit.z) discard;
        }
      }
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
      vec3 N = normalize(vNormalW), NV = normalize(vNormalV);
      if(!gl_FrontFacing){ N = -N; NV = -NV; }
      vec3 V = normalize(cameraPosition - vWorld);
      vec3 P = vLocal * uScale;
      vec3 col = vCol;
      float gloss = uGloss;
      // distance fade for the fine layers: interiors are close, so the scale is metres, not hundreds
      float nearK = 1.0 - smoothstep(3.0, 14.0, vDepth);
      float midK = 1.0 - smoothstep(10.0, 40.0, vDepth);
      if(uKind < 0.5){
        // coursed rubble: rows of irregular height, stones of irregular length, wobbly mortar joints, each stone its own
        // tone and a darker bevel at its edges. h = the horizontal coordinate along the wall (arc length on a drum).
        vec3 nl = abs(normalize(vLocalN));
        float h = uCyl > 0.0 ? atan(P.x, P.z) * uCyl : (nl.x > nl.z ? P.z : P.x);
        vec2 q = vec2(h, P.y);
        q += (vec2(fbm2(q * 2.3 + 1.0), fbm2(q * 2.3 + 7.0)) - 0.5) * 0.09;      // hand-laid, not ruled
        float ch = uStone.y;
        float row = floor(q.y / ch);
        float rh = hash12(vec2(row, 1.3));
        float len = uStone.x * (0.55 + 1.1 * hash12(vec2(row, floor((q.x + rh * 5.0) / uStone.x) + 0.5)) * 0.6 + 0.5 * rh);
        float fy = fract(q.y / ch);
        float sx = (q.x + rh * 5.0) / len;
        // joints lean a little, each its own way (rubble, not brick)
        float lean = (hash12(vec2(floor(sx), row + 7.0)) - 0.5) * 0.7;
        sx += (fy - 0.5) * lean * ch / len;
        float sid = floor(sx);
        float sh = hash12(vec2(sid, row));
        // some stones are split in two short ones stacked (small packing stones)
        float fx = fract(sx);
        float split = step(0.62, sh);
        float fy2 = split > 0.5 ? fract(fy * 2.0) : fy;
        float ex = min(fx, 1.0 - fx) * len, ey = min(fy2, 1.0 - fy2) * ch * (split > 0.5 ? 0.5 : 1.0);
        float e = min(ex, ey);
        float mortar = 1.0 - smoothstep(0.008, 0.02, e);
        float bevel = 1.0 - smoothstep(0.02, 0.06, e);
        float tone = 0.84 + 0.28 * hash12(vec2(sid + floor(fy * 2.0) * split * 13.0, row + 0.5));
        vec3 stoneC = col * tone * mix(vec3(1.0), vec3(0.95, 0.98, 1.05), step(0.55, sh));
        stoneC *= 1.0 - bevel * 0.14;
        col = mix(stoneC, col * vec3(0.55, 0.55, 0.54), mortar * 0.9);
        vec3 d = surfaceDetail(P * 3.0, vDepth * 6.0, 0.0);
        col *= mix(1.0, d.x, 0.7 * midK);
        col = mix(col, col * 0.7, d.z * nearK * 0.6);
      } else if(uKind < 1.5){
        // lime plaster: blotchy wash, flaked patches where the stone shows, hairline cracks
        float bl = fbm3(P * 1.4 + 2.0);
        col *= 0.9 + 0.2 * bl;
        float flake = smoothstep(0.66, 0.69, fbm3(P * 2.2 + 7.0));
        col = mix(col, col * vec3(0.62, 0.6, 0.6), flake);
        float ring = smoothstep(0.63, 0.66, fbm3(P * 2.2 + 7.0)) * (1.0 - flake);
        col = mix(col, col * 0.8, ring);
        vec3 d = surfaceDetail(P * 4.0, vDepth * 6.0, 1.0);
        col *= mix(1.0, d.x, 0.8 * midK);
      } else if(uKind < 2.5){
        // planks: seams across the grain, grain streaks along it, knots, per-plank tone
        int ax = int(uAxis + 0.5);
        float along = ax == 0 ? P.x : (ax == 1 ? P.y : P.z);
        vec3 nl = abs(normalize(vLocalN));
        // the across coordinate is the other axis lying in the face
        float acrossA = ax == 0 ? (nl.y > nl.z ? P.z : P.y) : (ax == 1 ? (nl.x > nl.z ? P.z : P.x) : (nl.x > nl.y ? P.y : P.x));
        float pi = floor(acrossA / uPlank), pf = fract(acrossA / uPlank);
        float ph = hash12(vec2(pi, 3.7));
        float butt = fract(along / (2.1 + ph * 1.4) + ph * 3.0);
        float seam = 1.0 - smoothstep(0.0, 0.05, min(pf, 1.0 - pf));
        seam = max(seam, (1.0 - smoothstep(0.0, 0.006, min(butt, 1.0 - butt))) * 0.8);
        float grain = vnoise(vec2(along * 1.8 + ph * 40.0, acrossA * 46.0 + ph * 9.0));
        float fine = vnoise(vec2(along * 9.0, acrossA * 160.0));
        col *= (0.8 + 0.34 * ph) * (0.86 + 0.2 * grain) * (0.96 + 0.08 * fine * nearK);
        float kn = length(vec2(fract(along * 0.6 + ph * 5.0) - 0.5, (pf - 0.5) * uPlank * 0.6 * 2.0) * vec2(1.0, 6.0));
        col = mix(col, col * 0.55, (1.0 - smoothstep(0.05, 0.09, kn)) * step(0.6, ph));
        col = mix(col, col * 0.42, seam);
        vec3 d = surfaceDetail(P * 5.0, vDepth * 6.0, 1.0);
        col = mix(col, col * 0.78, d.z * nearK);
      } else if(uKind < 3.5){
        // metal: patina and tarnish blotches, tool marks, chips
        float pat = smoothstep(0.5, 0.75, fbm3(P * 3.0 + 1.0));
        col = mix(col, col * vec3(0.62, 0.72, 0.62), pat * 0.55);
        vec3 d = surfaceDetail(P * 12.0, vDepth * 6.0, 2.0);
        col *= mix(1.0, d.x, 0.6 * midK);
        col = mix(col, col * 0.6, d.z * nearK * 0.5);
      } else if(uKind < 4.5){
        // flagstones: big irregular slabs with dark joints, worn smooth along the path
        vec2 c = cell3(vec3(P.x, 0.0, P.z) / 0.55);
        float joint = 1.0 - smoothstep(0.04, 0.09, c.x);
        col *= 0.78 + 0.34 * c.y;
        col = mix(col, col * 0.4, joint);
        vec3 d = surfaceDetail(P * 4.0, vDepth * 6.0, 0.0);
        col *= mix(1.0, d.x, 0.8 * midK);
        col = mix(col, col * 0.72, d.y * 0.6 * midK);
      } else if(uKind < 5.5){
        float bl = fbm3(P * 6.0);
        col *= 0.93 + 0.12 * bl;
      } else {
        // dressed stone slab: macro blotches, meso veins and cracks, micro grain and chips
        vec3 d = surfaceDetail(P * 4.0, vDepth * 5.0, 0.0);
        col *= mix(1.0, d.x + d.y * 0.2, 0.6 * midK);
        float vein = 1.0 - smoothstep(0.0, 0.015, abs(fbm3(P * vec3(1.5, 3.0, 1.5) + 2.0) - 0.5));
        col = mix(col, col * 0.8, vein * 0.35 * midK);
        col = mix(col, col * 0.75, d.y * 0.25 * nearK);
      }
      // smoke and grime: soot darkening toward the ceiling, grime pooling low and in streaks
      float gr = fbm3(vLocal * vec3(2.6, 0.7, 2.6) + 4.0);
      col = mix(col, col * vec3(0.62, 0.58, 0.56), smoothstep(0.45, 0.75, gr) * uGrime);
      col = mix(col, col * vec3(0.38, 0.35, 0.34), smoothstep(uSootY.x, uSootY.y, vLocal.y + (fbm3(vLocal * 2.0) - 0.5) * 0.6) * uSoot);
      // a worn, lighter path where feet go (treads), set by vertex colour brightness already, polished by uWear
      gloss = max(gloss, uWear * smoothstep(0.55, 0.8, fbm3(vLocal * 3.0)));
      float lampLit;
      vec3 c = setLight(col, N, vWorld, V, gloss, lampLit);
      // wet: darker, with a sharp sheen line toward the window light
      if(uWet > 0.0){ c *= mix(1.0, 0.82, uWet); c += uFillC * step(0.93, dot(reflect(-V, N), uFillDir)) * uWet * 0.6; }
      c = setHaze(c, vDepth);
      writeOut(c, 1.0, NV, vDepth, uId);
    }
  `;
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: vs, fragmentShader: fs, side: o.side ?? THREE.DoubleSide });
}

// Self-lit: lamp glass, flame, compass card, glowing coals. uK may exceed 1 for bloom. id >= 100: no ink.
export function glowMat(o = {}) {
  const u = { ...G, ...SL, uColor: { value: new THREE.Color(o.color ?? '#ffffff') }, uK: { value: o.k ?? 1 }, uId: { value: o.id ?? 120 }, uMap: { value: o.map ?? null }, uUseMap: { value: o.map ? 1 : 0 }, uHazeOn: { value: o.haze ?? 1 } };
  const vs = /* glsl */ `attribute vec3 aCol; varying vec3 vCol; ${VERT_STD} void main(){ vCol = aCol; stdVertex(position, normal); }`;
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    uniform vec3 uColor, uHazeC; uniform float uK, uId, uUseMap, uHazeK, uHazeOn; uniform sampler2D uMap;
    varying vec3 vNormalV, vCol, vWorld, vNormalW; varying float vDepth; varying vec2 vUv;
    void main(){
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
      vec3 c = uColor * vCol * uK;
      if(uUseMap > 0.5){ vec4 m = texture(uMap, vUv); if(m.a < 0.4) discard; c *= m.rgb; }
      c = mix(c, uHazeC, (1.0 - exp(-vDepth * uHazeK)) * uHazeOn);
      writeOut(c, 1.0, normalize(vNormalV), vDepth, uId);
    }
  `;
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: vs, fragmentShader: fs, side: THREE.DoubleSide });
}

// An oil-lamp flame: a teardrop card facing the camera, white-gold core, amber skirt, blue root. Drawn on threes.
export function flameMat(o = {}) {
  const u = { ...G, uK: { value: o.k ?? 1.6 }, uSeed: { value: o.seed ?? 0 }, uId: { value: o.id ?? 121 }, uFT: { value: 0 } };
  const vs = /* glsl */ `
    varying vec2 vP; varying float vDepth; varying vec3 vNormalV;
    void main(){
      vP = position.xy;
      vec3 c = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      float sx = length((modelMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz), sy = length((modelMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
      vec4 mv = viewMatrix * vec4(c, 1.0);
      // stay upright in the world even when the camera rolls: project world up into view space
      vec3 upV = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
      vec2 up2 = normalize(upV.xy + vec2(0.0, 1e-4)); vec2 rt2 = vec2(up2.y, -up2.x);
      mv.xy += rt2 * position.x * sx + up2 * position.y * sy;
      vDepth = -mv.z; vNormalV = vec3(0.0, 0.0, 1.0);
      gl_Position = projectionMatrix * mv;
    }
  `;
  const fs = /* glsl */ `
    ${MRT_OUT}
    uniform float uK, uSeed, uId, uFT;
    varying vec2 vP; varying float vDepth; varying vec3 vNormalV;
    float h1(float n){ return fract(sin(n * 127.1 + uSeed * 31.7) * 43758.5453); }
    void main(){
      // vP: x in [-0.5, 0.5], y in [0, 1]; the tip sways with the draught
      float f = floor(uFT * 8.0);
      float sway = (h1(f) - 0.5) * 0.22 * vP.y * vP.y, tall = 0.88 + 0.2 * h1(f + 7.0);
      vec2 p = vec2(vP.x - sway, vP.y / tall);
      float w = 0.5 * sin(3.14159 * clamp(p.y, 0.0, 1.0) * 0.86 + 0.32) * (1.0 - 0.65 * p.y);
      float d = abs(p.x) / max(w, 1e-3);
      if(d > 1.0 || p.y > 1.0 || p.y < 0.0) discard;
      vec3 skirt = vec3(1.0, 0.52, 0.16), core = vec3(1.0, 0.92, 0.7);
      vec3 c = mix(skirt, core, step(d, 0.55) * step(p.y, 0.75));
      c = mix(c, vec3(0.35, 0.45, 1.0), step(p.y, 0.1) * step(0.35, d));
      writeOut(c * uK, 1.0, vNormalV, vDepth, uId);
    }
  `;
  const m = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: vs, fragmentShader: fs, side: THREE.DoubleSide });
  return m;
}
export function flameMesh(mat, w, h) {
  const g = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const m = new THREE.Mesh(g, mat); m.scale.set(w, h, 1); m.frustumCulled = false; m.userData.noShadow = true; m.name = 'flame';
  return m;
}
