import * as THREE from 'three';
import { G, COMMON, MRT_OUT } from './glsl.js';
import { QuadBatch } from './fx-core.js';

// Drawn smoke columns: each is ONE merged plume silhouette on an upright card that turns to the camera, with scalloped billow
// edges, a hard two-tone interior, a fire-lit underside, a lean with the wind, and shapes that scroll upward on threes.
// Card space: X across (in base radii), Y up (in base radii). Pure in uDrawing (the drawing number) and the instance data.
export function columnMaterial() {
  const u = { ...G, uDrawing: { value: 0 } };
  const vs = /* glsl */ `
    attribute vec3 iPos;      // base, world
    attribute vec4 iS;        // base radius (m), full height (m), seed, risen height (m)
    attribute vec4 iC;        // lean (radii at the top, signed across the card), fire light 0..1, ink id, dissolve 0..1
    attribute vec3 iDark;     // shadow colour
    attribute vec3 iLit;      // lit colour
    varying vec2 vQ;
    varying vec4 vS, vC;
    varying vec3 vDark, vLit;
    varying float vDepth;
    void main(){
      vec3 toCam = cameraPosition - iPos; toCam.y = 0.0;
      vec3 f = normalize(toCam + vec3(1e-4, 0.0, 0.0));
      vec3 r = vec3(f.z, 0.0, -f.x);
      float halfW = iS.y * 0.5 + iS.x * (2.0 + abs(iC.x));
      vec2 q = position.xy * 2.0;                 // -1..1
      vec3 wp = iPos + r * q.x * halfW + vec3(0.0, (q.y * 0.5 + 0.5) * (iS.y + iS.x * 2.0) - iS.x, 0.0);
      vQ = vec2(q.x * halfW, (q.y * 0.5 + 0.5) * (iS.y + iS.x * 2.0) - iS.x) / iS.x;
      vS = iS; vC = iC; vDark = iDark; vLit = iLit;
      vec4 mv = viewMatrix * vec4(wp, 1.0);
      vDepth = -mv.z;
      gl_Position = projectionMatrix * mv;
    }
  `;
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    uniform float uDrawing;
    varying vec2 vQ;
    varying vec4 vS, vC;
    varying vec3 vDark, vLit;
    varying float vDepth;
    void main(){
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1.0); oData = vec4(0.0); return; }
      float seed = vS.z, Ht = vS.y / vS.x, top = vS.w / vS.x;
      float X = vQ.x, Y = vQ.y;
      float sc = uDrawing * 0.085 + seed * 3.0;            // shapes climb on threes
      float yn = clamp(Y / Ht, 0.0, 1.0);
      // the spine: leans with the wind, wanders a little, each column its own
      float cx = vC.x * pow(yn, 1.35) + 0.55 * sin(Y * 0.23 + seed * 6.3) * yn + 0.3 * sin(Y * 0.61 - sc * 0.6 + seed * 2.1) * yn;
      // the body widens as it climbs, with slow big shoulders
      float w = (0.85 + 1.9 * pow(yn, 0.75) * (Ht / 12.0)) * (0.82 + 0.36 * vnoise(vec2(seed * 7.0, Y * 0.16 - sc * 0.5)));
      float x = X - cx, side = sign(x);
      // billow edges: round scallops of two sizes riding upward, different on each side
      float ph = Y * 0.62 - sc * 1.6 + side * 1.3 + seed * 5.0;
      float lobes = abs(sin(ph)) * 0.34 + abs(sin(ph * 2.3 + 1.7 + side)) * 0.15;
      float edge = w * (0.72 + lobes);
      float d = abs(x) - edge;
      // rounded, lumpy head where the column has risen to
      float capY = top - edge * 0.8;
      if(Y > capY){ vec2 c = vec2(x, (Y - capY) * 0.9); float a = atan(c.y, abs(c.x)); d = length(c) - edge * (0.86 + 0.2 * abs(sin(a * 3.0 + seed * 4.0 + sc))); }
      if(Y < 0.0) d = max(d, -Y - 0.6 + abs(x) * 0.3);
      if(d > 0.0) discard;
      // old smoke tears into ragged holes toward the top
      float n = fbm2(vec2(X * 0.33 + seed * 9.0, Y * 0.26 - sc * 0.9));
      if(n < (yn - 0.42) * 1.25 * vC.w + vC.w * 0.18 - 0.1) discard;
      // interior: big billow shapes, one hard terminator; light from the wind side and from above
      float b = fbm2(vec2(x * 0.42 + seed * 3.0, Y * 0.36 - sc * 1.25));
      float s = b + (x / max(edge, 0.1)) * -0.22 + lobes * 0.25;
      vec3 col = s > 0.56 ? vLit : vDark;
      col = s < 0.34 ? vDark * 0.62 : col;
      // fire-lit underside: vermilion licking up the lower billows, amber at the root
      float fl = (1.0 - yn * 4.2) + (b - 0.5) * 1.0 + lobes * 0.3;
      vec3 fcol = fl > 0.72 ? vec3(1.15, 0.52, 0.14) : vec3(0.78, 0.2, 0.07);
      col = mix(col, fcol, step(0.3, fl) * vC.y);
      // rim of light on the scallops facing the fire below
      col = mix(col, vec3(0.6, 0.2, 0.08), step(-0.05 * w, d) * step(yn, 0.22) * vC.y * 0.8);
      writeOut(col, 1.0, vec3(0.0, 0.0, 1.0), vDepth, vC.z);
    }
  `;
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: vs, fragmentShader: fs, side: THREE.DoubleSide });
}

export function createColumns(max = 48) {
  const batch = new QuadBatch(columnMaterial(), max, { iPos: 3, iS: 4, iC: 4, iDark: 3, iLit: 3 });
  batch.mesh.userData.noShadow = true;
  return batch;
}
