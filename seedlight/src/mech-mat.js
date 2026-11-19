import * as THREE from 'three';
import { G, COMMON, MRT_OUT, VERT_STD } from './glsl.js';
import { DETAIL_GLSL } from './detail.js';

// MECH dept (SEEDLIGHT): cel material for the Lantern (cracked cream porcelain over verdigris copper) and the kite skiff
// (planked wood, patched canvas). Adapted from BLACKOUT's mechMaterial (MIT). Detail at three scales, glued to each part.
// Vertex attributes come from the Kit in mech-geo.js: aCol, aMat (metal, detail, emis, ink id), aEx (edge, wear, porcelain), aPan.
// emis: 1 iris disc, 2 milk glass (lit from inside by the iris), 3 chest crest.
export function mechMaterial() {
  const u = {
    ...G,
    uIrisC: { value: new THREE.Color(0, 0, 0) },   // colour of the iris light (already scaled by heat)
    uIrisK: { value: 0 },                          // 0 dark .. 1 on
    uGlassK: { value: 0 },                         // how much the milk glass glows
    uCrest: { value: 0 },                          // chest crest gold 0..1
    uCrack: { value: 0.15 },                       // 0..1 how broken the porcelain is
    uCrackGlow: { value: 0 },                      // 0..1 fire inside, seen through the cracks
    uMoss: { value: 1 },
    uDim: { value: 1 },                            // interiors: the moon does not reach, only event lights do
    uLitGain: { value: 1.0 },
  };
  const vs = /* glsl */ `
    attribute vec3 aCol;
    attribute vec4 aMat;
    attribute vec3 aEx;
    attribute vec3 aPan;
    varying vec3 vCol, vLocal, vLocalN, vEx, vPan;
    varying vec4 vMat;
    ${VERT_STD}
    void main(){
      vCol = aCol; vMat = aMat; vEx = aEx; vPan = aPan; vLocal = position; vLocalN = normal;
      stdVertex(position, normal);
    }
  `;
  const fs = /* glsl */ `
    ${COMMON}
    ${DETAIL_GLSL}
    ${MRT_OUT}
    uniform vec3 uIrisC;
    uniform float uIrisK, uGlassK, uCrest, uCrack, uCrackGlow, uMoss, uDim, uLitGain;
    varying vec3 vWorld, vNormalW, vNormalV, vCol, vLocal, vLocalN, vEx, vPan;
    varying vec4 vMat;
    varying float vDepth;
    varying vec2 vUv;

    void main(){
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
      vec3 N = normalize(vNormalW), NV = normalize(vNormalV);
      if(!gl_FrontFacing){ N = -N; NV = -NV; }
      vec3 V = normalize(cameraPosition - vWorld);
      vec3 col = vCol;
      float metal = vMat.x, detail = vMat.y, emis = vMat.z, idF = floor(vMat.w + 0.5);
      float edge = vEx.x, wearK = vEx.y, porc = step(0.5, vEx.z);
      float pw = vPan.x, ph = vPan.y;
      float dist = vDepth;
      vec3 p = vLocal;
      vec2 uv = vUv;
      float px = max(length(vec2(dFdx(uv.x), dFdy(uv.x))), length(vec2(dFdx(uv.y), dFdy(uv.y))));
      px = max(px, 1e-4);
      float nearD = 1.0 - smoothstep(18.0, 90.0, dist);
      float midD = 1.0 - smoothstep(60.0, 320.0, dist);

      // ---- meso: plank / plate lines in metres (wood and copper only)
      float seamL = 0.0;
      if(porc < 0.5 && detail > 0.01){
        float row = floor(uv.y / ph);
        vec2 q = vec2(uv.x / pw + fract(row * 0.37) * 0.8, uv.y / ph);
        vec2 cell = floor(q), f = fract(q);
        vec2 pm = f * vec2(pw, ph);
        float dE = min(min(pm.x, pw - pm.x), min(pm.y, ph - pm.y));
        float lineW = 0.006 + 0.01 * ph;
        float lineAA = clamp(lineW / px * 2.2, 0.0, 1.0);
        seamL = clamp((lineW + px * 0.5 - dE) / px, 0.0, 1.0) * lineAA * detail;
        col *= 1.0 + (hash12(cell + 7.0) - 0.5) * 0.16 * smoothstep(0.7, 0.18, px) * detail;
      }

      // ---- macro: blotches and long stains
      float blotch = fbm3(p * 0.9 + 3.1);
      col *= 1.0 + (blotch - 0.5) * 0.2 * (0.4 + detail);
      float run = fbm3(vec3(p.x * 5.0, p.y * 0.5, p.z * 5.0) + 7.0);
      float runM = smoothstep(0.62, 0.66, run) * smoothstep(0.4, 0.6, fbm3(p * 1.4 + 2.0)) * midD * wearK;

      float crackM = 0.0;
      if(porc > 0.5){
        // tea-stain runs, craze hairlines, big cracks that open as it is hit
        col = mix(col, col * vec3(0.82, 0.74, 0.6), runM * 0.7);
        float cz = _voroEdge(p * 7.0 + fbm3(p * 2.5) * 0.7);
        float hair = (1.0 - smoothstep(0.0, 0.05, cz)) * nearD;
        col = mix(col, col * vec3(0.66, 0.6, 0.5), hair * 0.5);
        float bc = _voroEdge(p * 1.9 + 7.0 + fbm3(p * 1.1) * 0.9);
        float sel = smoothstep(0.62 - uCrack * 0.5, 0.56 - uCrack * 0.5, fbm3(p * 0.8 + 3.0));
        crackM = (1.0 - smoothstep(0.012 + 0.03 * uCrack, 0.03 + 0.05 * uCrack, bc)) * sel * midD;
        col = mix(col, vec3(0.1, 0.09, 0.08), crackM);
        // chips along plate edges show the dark biscuit
        float chipN = fbm3(p * 4.5 + 11.0) + 0.3 * vnoise3(p * 17.0) + 0.2 * edge;
        float chip = smoothstep(0.84, 0.86, chipN) * nearD;
        col = mix(col, vec3(0.42, 0.36, 0.3), chip * 0.8);
        // moss and lichen: on upward faces, in seams (plate edges), in blotches
        float mN = fbm3(p * 2.1 + 1.7) + 0.2 * vnoise3(p * 9.0);
        float moss = smoothstep(0.66, 0.69, mN + 0.14 * N.y + 0.22 * edge) * uMoss * midD;
        vec3 mossC = mix(vec3(0.3, 0.42, 0.2), vec3(0.46, 0.55, 0.24), step(0.5, vnoise3(p * 14.0)));
        col = mix(col, mossC, moss * 0.92);
        crackM *= 1.0 - moss;
      } else if(metal > 0.6){
        // verdigris copper: green crust, bare warm copper where it rubs
        float vg = fbm3(p * 3.2 + 5.0) + 0.25 * vnoise3(p * 13.0);
        col = mix(col, col * vec3(1.9, 1.05, 0.62), smoothstep(0.66, 0.7, vg + edge * 0.3) * wearK * 0.9);
        col = mix(col, col * vec3(0.6, 0.72, 0.7), runM);
        col = mix(col, col * vec3(1.25, 1.3, 1.2), step(0.72, vnoise3(p * 30.0)) * nearD * 0.5);
      } else {
        // wood and canvas: grain and weather
        float grain = vnoise3(vec3(p.x * 40.0, p.y * 40.0, p.z * 3.0));
        col *= 1.0 + (grain - 0.5) * 0.16 * nearD * detail;
        col = mix(col, col * vec3(0.72, 0.7, 0.68), runM * 0.8);
      }
      col = mix(col, col * vec3(0.5, 0.46, 0.44), seamL * 0.85);
      // worn bevels catch the light
      col = mix(col, col * vec3(1.12, 1.1, 1.04), smoothstep(0.3, 0.9, edge) * 0.6);
      float grainF = (vnoise3(p * 60.0) - 0.5) * 0.08 * nearD;
      col *= 1.0 + grainF;

      // ---- two hard tones (moon key) and a third deep tone
      float ndl = dot(N, uKeyDir);
      float sh = sunShadow(vWorld, N);
      float lit = smoothstep(-0.03, 0.05, ndl) * sh;
      vec3 litCol = col * mix(uSkyTint, uSunColor * 1.06, uSunStrength) * uLitGain;
      float up = smoothstep(-0.7, 0.6, N.y);
      vec3 shadeCol = col * uShadeTint * mix(uBounce, vec3(1.0), up) * 1.5 + col * vec3(0.05, 0.16, 0.17) * (0.3 + 0.3 * up);
      vec3 outc = mix(mix(shadeCol, litCol, 0.1), litCol, lit);
      float deep = step(ndl, -0.45) * step(N.y, -0.3);
      outc = mix(outc, col * uDeepTint * 1.6, deep * 0.85);
      // glazed porcelain: one drawn highlight
      vec3 H = normalize(uKeyDir + V);
      float spec = step(0.992, dot(N, H)) * lit * porc * (1.0 - crackM);
      outc = mix(outc, uSunColor * 1.12, spec * 0.6);
      // moon rim, and a cool sky rim on the shadow side so the shape never sinks into the night
      float fres = 1.0 - max(dot(N, V), 0.0);
      float back = smoothstep(0.1, 0.5, dot(-V, uKeyDir));
      float rimL = smoothstep(0.68, 0.72, fres) * smoothstep(-0.05, 0.15, ndl) * back * uSunStrength;
      outc = mix(outc, uSunColor * 1.15, rimL * 0.8);
      float rimS = smoothstep(0.64, 0.8, fres) * (1.0 - lit) * smoothstep(-0.3, 0.5, N.y);
      outc += (col * vec3(0.16, 0.4, 0.42) * 0.5 + vec3(0.01, 0.04, 0.045)) * rimS;

      outc *= uDim;
      vec3 wl = warLight(col, vWorld, N) * 0.7; if(metal < 0.01 && porc < 0.5 && emis < 0.5) wl = max(wl, warLight(col, vWorld, -N) * 0.6); wl = mix(wl, vec3(dot(wl, vec3(0.3, 0.55, 0.15))) * vec3(1.0, 0.97, 0.9), 0.45 * porc); outc += min(wl, col * 1.25 + 0.1);

      // ---- emissive classes
      if(emis > 0.5 && emis < 1.5){
        float r = length(p.xy) / 0.25;
        vec3 off = vec3(0.03, 0.035, 0.035) + 0.05 * smoothstep(0.4, 1.0, r);
        vec3 on = uIrisC * (0.75 + 0.75 * smoothstep(0.85, 0.15, r)) + vec3(0.3) * smoothstep(0.35, 0.0, r) * uIrisK;
        outc = mix(off, on, clamp(uIrisK, 0.0, 1.0));
      } else if(emis > 1.5 && emis < 2.5){
        float paper = 0.75 + 0.25 * fbm3(p * 6.0);
        outc = outc * 0.9 + uIrisC * uGlassK * paper * (0.5 + 0.5 * smoothstep(0.9, 0.2, abs(p.y - 0.74)));
      } else if(emis > 2.5 && emis < 3.5){
        float rr = length(p.xy - vec2(0.0, 0.8));
        float motif = step(abs(rr - 0.22), 0.035) + step(rr, 0.09);
        outc = mix(outc, outc * 0.55, motif * (1.0 - uCrest));
        outc = mix(outc, vec3(1.15, 0.76, 0.24) * (0.5 + 0.55 * motif), uCrest);
      }
      // fire inside, through the cracks
      outc = mix(outc, mix(vec3(2.2, 0.8, 0.2), vec3(2.6, 1.9, 0.9), uCrackGlow), crackM * uCrackGlow);
      writeOut(outc, 1.0, NV, vDepth, idF);
    }
  `;
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: vs, fragmentShader: fs, side: THREE.DoubleSide, transparent: false });
}
