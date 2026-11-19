import * as THREE from 'three';
import { G, COMMON, MRT_OUT, VERT_STD } from './glsl.js';
import { DETAIL_GLSL } from './detail.js';

// MECH (LAST LIGHT): one cel material for every machine part, chosen per vertex by `kind` (aEx.z):
//   0 iron   green-black painted cast iron: plate seams, rivets, rust runs, chipped paint
//   1 brass  wet brass: tarnish blotches (macro), engraved rings / hammer marks (meso), scratches (micro), verdigris in the creases
//   2 copper dome copper: verdigris rain-streaks running down, sheet seams, dents
//   3 hull   painted planked wood: strakes along the hull, caulked seams, nail heads, paint chips showing grey wood
//   4 wood   bare weathered deck wood: planks, grain, knots
//   5 rope   rope / net / rubber: dull, fibrous banding
// Three scales of detail fade by pixel footprint and distance. Lights: the storm key (uKeyDir), the kerosene lamp (warm, hard bands),
// lightning (cold flash from above), the six boat lanterns, and every department's war lights.
export const ML = {
  uLampP: { value: new THREE.Vector3(160, 70.4, -300) },
  uLampC: { value: new THREE.Vector3(0, 0, 0) },        // kerosene amber * intensity
  uLampR: { value: 7.5 },
  uFlash: { value: 0 },                                  // lightning 0..1
  uFlashDir: { value: new THREE.Vector3(-0.3, 0.85, -0.4).normalize() },
  uBoatL: { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, -999, 0, 0)) },   // xyz lantern, w intensity
  uWetK: { value: 1 },                                   // rain wetness (sheen + darkening)
  uBeamP: { value: new THREE.Vector3(160, 70.4, -300) }, // lens centre, for the beam sweeping across boats
  uBeamDir: { value: new THREE.Vector3(0, 0, -1) },
  uBeamK: { value: 0 },
  uRoomFill: { value: new THREE.Vector3(0.1, 0.13, 0.17) },   // cold sky light through the lantern-room glazing
  uRoomC: { value: new THREE.Vector3(160, 68, -300) },
  uPuddle: { value: 0 },                                 // rain blown in through the broken panes pools on the lamp-room floor
};

export function mechMaterial(o = {}) {
  const u = { ...G, ...ML, uLitGain: { value: o.litGain ?? 1.25 }, uLampMul: { value: o.lampMul ?? 1 }, uDim: { value: 1 } };
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
    uniform vec3 uLampP, uLampC, uFlashDir, uBeamP, uBeamDir, uRoomFill, uRoomC;
    uniform float uLampR, uFlash, uWetK, uLitGain, uLampMul, uBeamK, uDim, uPuddle;
    uniform vec4 uBoatL[6];
    varying vec3 vWorld, vNormalW, vNormalV, vCol, vLocal, vLocalN, vEx, vPan;
    varying vec4 vMat;
    varying float vDepth;
    varying vec2 vUv;

    float band2(float x){ return smoothstep(0.0, 0.06, x) * (0.72 + 0.28 * step(0.45, x)); }

    void main(){
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
      vec3 N = normalize(vNormalW), NV = normalize(vNormalV);
      if(!gl_FrontFacing){ N = -N; NV = -NV; }
      vec3 V = normalize(cameraPosition - vWorld);
      vec3 col = vCol;
      float metal = vMat.x, detail = vMat.y, emis = vMat.z, idF = floor(vMat.w + 0.5);
      float edge = vEx.x, wearK = vEx.y, kind = floor(vEx.z + 0.5);
      float pw = vPan.x, ph = vPan.y, riv = vPan.z;
      float dist = vDepth;
      vec3 p = vLocal;
      vec2 uv = vUv;
      float px = max(length(vec2(dFdx(uv.x), dFdy(uv.x))), length(vec2(dFdx(uv.y), dFdy(uv.y))));
      px = max(px, 1e-4);
      float pxW = length(fwidth(vWorld)) + 1e-4;
      float near = 1.0 - smoothstep(6.0, 60.0, dist);
      float mid = 1.0 - smoothstep(40.0, 400.0, dist);
      float gloss = 0.0;    // drawn specular strength
      float shin = 0.0;     // 0 broad, 1 tight
      float wetDark = 0.0;

      if(kind < 0.5){
        // ---------------- iron: plate grid, rivets, chips, rust
        float row = floor(uv.y / ph);
        vec2 q = vec2(uv.x / pw + fract(row * 0.37) * 0.8, uv.y / ph);
        vec2 cell = floor(q), f = fract(q);
        vec2 pm = f * vec2(pw, ph);
        float dE = min(min(pm.x, pw - pm.x), min(pm.y, ph - pm.y));
        float lineW = 0.006 + 0.004 * ph;
        float seamL = clamp((lineW + px * 0.5 - dE) / px, 0.0, 1.0) * clamp(lineW / px * 2.2, 0.0, 1.0) * detail;
        col *= 1.0 + (hash12(cell + 7.0) - 0.5) * 0.12 * smoothstep(0.3, 0.05, px) * detail;
        float rivM = 0.0, rivH = 0.0;
        if(riv > 0.0 && px < riv * 0.4){
          float inset = 0.03 + ph * 0.04;
          vec2 d1 = vec2(mod(pm.x + riv * 0.5, riv) - riv * 0.5, min(pm.y, ph - pm.y) - inset);
          vec2 d2 = vec2(min(pm.x, pw - pm.x) - inset, mod(pm.y + riv * 0.5, riv) - riv * 0.5);
          vec2 dr = length(d1) < length(d2) ? d1 : d2;
          float rr = length(dr), R = 0.012 + riv * 0.12;
          float rF = smoothstep(riv * 0.4, riv * 0.1, px);
          rivM = (1.0 - smoothstep(R - px, R + px, rr)) * rF * detail;
          rivH = (1.0 - smoothstep(R * 0.45 - px, R * 0.45 + px, length(dr - vec2(-R * 0.3, R * 0.3)))) * rF * detail;
        }
        vec3 sd = surfaceDetail(p * 3.0, dist, 2.0);
        col *= mix(1.0, sd.x, 0.6 * detail);
        float rs = fbm3(vec3(p.x * 9.0, p.y * 0.9, p.z * 9.0) + 19.0);
        float rust = smoothstep(0.66, 0.69, rs) * smoothstep(0.4, 0.6, fbm3(p * 2.5)) * wearK * detail * mid;
        col = mix(col, mix(col, vec3(0.26, 0.21, 0.18), 0.55), rust);
        float edgeProx = max(smoothstep(0.06, 0.0, dE), edge);
        float chipN = fbm3(p * 14.0 + 11.0) + 0.3 * vnoise3(p * 60.0) + 0.12 * edgeProx;
        float chip = smoothstep(0.9, 0.91, chipN) * near * detail * wearK;
        col = mix(col, vec3(0.16, 0.15, 0.15), chip);
        col = mix(col, col * vec3(0.5, 0.52, 0.55), seamL * 0.85);
        col = mix(col, col * 0.6, rivM * 0.7);
        col = mix(col, col * 1.7 + 0.03, rivH * 0.8);
        gloss = 0.35 + 0.4 * rivH; shin = 0.4; wetDark = 0.12;
      } else if(kind < 1.5){
        // ---------------- antique brass / bronze: dark oily mid-tones, grime in the recesses, bright worn edges
        float tar = fbm3(p * 1.6 + 3.0);
        float tarM = smoothstep(0.5, 0.56, tar) * detail;
        col = mix(col, col * vec3(0.62, 0.56, 0.44), tarM * 0.7 * wearK);
        // grime: settles under things and in the low-frequency hollows
        float hollow = (1.0 - smoothstep(-0.7, 0.3, N.y)) * 0.6 + smoothstep(0.55, 0.7, fbm3(p * 5.0 + 17.0)) * 0.5;
        col = mix(col, col * vec3(0.38, 0.34, 0.28), clamp(hollow, 0.0, 1.0) * 0.6 * detail);
        float vg = fbm3(p * 4.0 + 7.0) + 0.25 * (1.0 - smoothstep(-0.6, 0.2, N.y));
        float verd = smoothstep(0.72, 0.74, vg) * detail * wearK * mid;
        col = mix(col, vec3(0.18, 0.27, 0.23), verd * 0.7);
        // hammer facets and fine scratches
        col *= 1.0 + (vnoise3(p * 34.0) - 0.5) * 0.12 * near;
        float scr = step(0.93, vnoise3(vec3(p.x * 140.0, p.y * 9.0, p.z * 140.0))) * smoothstep(0.004, 0.001, px);
        col = mix(col, col * 1.3, scr * 0.5);
        // worn bright edges: where the normal turns fast (chamfers, tooth tips, rims) the metal is polished pale
        float curv = smoothstep(0.12, 0.45, length(fwidth(vNormalW)));
        float worn = max(curv, smoothstep(0.2, 0.9, edge));
        col = mix(col, vec3(0.62, 0.54, 0.38), worn * 0.65 * detail);
        // antique: pull the saturation down
        float lumB = dot(col, vec3(0.3, 0.55, 0.15));
        col = mix(vec3(lumB), col, 0.7);
        gloss = (0.85 - verd * 0.7 - tarM * 0.3) * (0.6 + 0.4 * worn); shin = 1.0; wetDark = 0.08;
      } else if(kind < 2.5){
        // ---------------- copper dome
        float sheet = abs(fract(uv.x / max(pw, 0.1)) - 0.5) * pw;
        float seamC = (1.0 - smoothstep(0.008, 0.008 + px, sheet)) * detail;
        float streak = fbm3(vec3(p.x * 6.0, p.y * 0.6, p.z * 6.0) + 2.0) + 0.35 * fbm3(p * 1.2);
        float verd = smoothstep(0.6, 0.66, streak);
        col = mix(col, vec3(0.22, 0.34, 0.31), verd * 0.85 * detail);
        if(!gl_FrontFacing) col = mix(vec3(0.07, 0.08, 0.08), col, 0.15);   // the dome's inside is sooted dark
        col = mix(col, col * 0.78, step(0.62, fbm3(p * 3.0 + 4.0)) * 0.5 * detail);
        col = mix(col, col * 0.55, seamC * 0.8);
        float dent = vnoise3(p * 18.0);
        col *= 1.0 + (dent - 0.5) * 0.12 * near;
        gloss = 0.6 * (1.0 - verd); shin = 0.6; wetDark = 0.08;
      } else if(kind < 4.5){
        // ---------------- planks: hull (3, painted) or deck (4, bare)
        float row = floor(uv.y / ph);
        float lx = uv.x + hash12(vec2(row, 3.0)) * 7.0;
        float butt = floor(lx / pw);
        vec2 pm = vec2(fract(lx / pw) * pw, fract(uv.y / ph) * ph);
        float dE = min(pm.y, ph - pm.y);
        float dB = min(pm.x, pw - pm.x);
        float seamL = (1.0 - smoothstep(0.006, 0.006 + px, dE)) * detail;
        float buttL = (1.0 - smoothstep(0.005, 0.005 + px, dB)) * detail * near;
        float plankN = hash12(vec2(row, butt) + 4.0);
        float grain = fbm3(vec3(uv.x * 0.8, uv.y * 30.0 + plankN * 20.0, plankN * 9.0));
        float grainL = smoothstep(0.55, 0.6, fract(grain * 6.0)) * smoothstep(0.02, 0.004, px);
        vec3 wood = mix(vec3(0.42, 0.37, 0.31), vec3(0.55, 0.49, 0.40), plankN);
        if(kind < 3.5){
          // painted strakes
          col *= 1.0 + (plankN - 0.5) * 0.08 * detail;
          float chipN = fbm3(vec3(uv.x * 7.0, uv.y * 16.0, plankN * 5.0)) + 0.25 * vnoise3(p * 40.0) + 0.1 * edge;
          float chip = smoothstep(0.76, 0.77, chipN) * detail * wearK * mid;
          col = mix(col, wood * 0.8, chip);
          // salt and grime runs down from the gunwale
          float run = fbm3(vec3(uv.x * 3.0, uv.y * 0.3, 1.0) + 9.0);
          col = mix(col, col * vec3(0.82, 0.84, 0.86), smoothstep(0.55, 0.6, run) * 0.6 * detail);
          col = mix(col, col * 0.85, grainL * 0.25);
          gloss = 0.45; shin = 0.3;
        } else {
          col = mix(col, wood, 0.25);
          col *= 1.0 + (plankN - 0.5) * 0.2 * detail;
          col = mix(col, col * 0.78, grainL * 0.6);
          float knot = smoothstep(0.08, 0.04, length(fract(vec2(lx * 0.6, uv.y / ph) + plankN) - 0.5)) * near * step(0.8, plankN);
          col = mix(col, col * 0.55, knot);
          gloss = 0.25; shin = 0.2;
        }
        // nail heads at the frames
        float nail = (1.0 - smoothstep(0.012, 0.012 + px, length(vec2(mod(lx + 0.25, 0.5) - 0.25, pm.y - ph * 0.5)))) * near * detail * step(px, 0.01);
        col = mix(col, col * 0.45, nail * 0.8);
        col = mix(col, col * 0.42, max(seamL, buttL) * 0.85);
        wetDark = 0.18;
      } else {
        // ---------------- rope / rubber / net
        float b = fract(uv.x * 14.0 + uv.y * 5.0);
        col *= 0.85 + 0.3 * smoothstep(0.3, 0.6, b) * smoothstep(0.02, 0.005, px);
        gloss = 0.1; shin = 0.1; wetDark = 0.2;
      }

      // macro wash for everything: big soft value shifts so nothing large is flat
      float macro = fbm3(vWorld * 0.18 + 5.0);
      col *= 1.0 + (macro - 0.5) * 0.18 * detail;
      col *= mix(1.0, 1.0 - wetDark, uWetK);

      // ---- two hard tones from the storm key
      float ndl = dot(N, uKeyDir);
      float sh = sunShadow(vWorld, N);
      float lit = smoothstep(-0.03, 0.05, ndl) * sh;
      vec3 litCol = col * mix(uSkyTint, uSunColor * 1.06, uSunStrength) * uLitGain;
      float up = smoothstep(-0.7, 0.6, N.y);
      vec3 shadeCol = col * uShadeTint * mix(uBounce, vec3(1.0), up) * 1.3 + col * vec3(0.12, 0.18, 0.3) * (0.3 + 0.4 * up);
      vec3 outc = mix(mix(shadeCol, litCol, 0.12), litCol, lit);
      float deep = step(ndl, -0.45) * step(N.y, -0.3);
      outc = mix(outc, col * uDeepTint * 1.4, deep * 0.8);

      // ---- wet metal: a hard painted sky band in the reflection
      vec3 R = reflect(-V, N);
      float skyBand = smoothstep(0.30, 0.34, R.y) * (1.0 - smoothstep(0.62, 0.66, R.y));
      outc = mix(outc, outc * vec3(1.15, 1.22, 1.32) + vec3(0.02, 0.03, 0.05), skyBand * (metal * 0.7 + 0.3 * uWetK) * gloss);

      // ---- oil sheen on brass: a thin dark-iridescent band in the reflection
      if(kind > 0.5 && kind < 1.5){ float ob = smoothstep(0.05, 0.08, R.y) * (1.0 - smoothstep(0.1, 0.13, R.y)); outc = mix(outc, outc * vec3(0.8, 0.95, 1.05) + vec3(0.03, 0.035, 0.03), ob * 0.6 * near); }
      // ---- key glint (cold), tight on brass
      vec3 H = normalize(uKeyDir + V);
      float sp = dot(N, H);
      float spK = step(mix(0.93, 0.985, shin), sp) * lit * gloss;
      outc = mix(outc, mix(vec3(0.9, 0.95, 1.05), uSunColor, 0.3), spK * 0.6);

      // ---- rim on the shadow side so dark iron never merges with the night
      float fres = 1.0 - max(dot(N, V), 0.0);
      float rimS = smoothstep(0.62, 0.8, fres) * (1.0 - lit) * smoothstep(-0.3, 0.5, N.y);
      outc += col * vec3(0.25, 0.36, 0.6) * rimS * 0.5 + vec3(0.02, 0.035, 0.07) * rimS;

      // ---- the kerosene lamp: warm hard bands + a tight gold glint on brass
      vec3 lampAdd = vec3(0.0);
      if(dot(uLampC, vec3(1.0)) > 0.001){
        vec3 L = uLampP - vWorld; float d = length(L); L /= max(d, 1e-3);
        float fall = clamp(1.0 - d / uLampR, 0.0, 1.0); fall *= fall;
        float nl = dot(N, L);
        lampAdd += col * uLampC * band2(nl) * fall * 0.3;   // the burner war light (mech.js) does most of the diffuse
        vec3 HL = normalize(L + V);
        float sl = step(mix(0.9, 0.975, shin), dot(N, HL)) * step(0.0, nl);
        lampAdd += uLampC * vec3(1.0, 0.95, 0.85) * sl * gloss * fall * 0.9;
        outc += lampAdd * uLampMul;
      }

      // ---- lightning: cold white from above, lights everything wet
      if(uFlash > 0.001){
        float nf = dot(N, uFlashDir);
        float fb = smoothstep(-0.05, 0.05, nf) * (0.6 + 0.4 * step(0.5, nf));
        outc += col * vec3(1.1, 1.2, 1.45) * fb * uFlash * 1.4;
        vec3 HF = normalize(uFlashDir + V);
        outc += vec3(0.9, 0.95, 1.1) * step(mix(0.9, 0.97, shin), dot(N, HF)) * uFlash * gloss;
      }

      // ---- boat lanterns (warm, small)
      for(int i = 0; i < 6; i++){
        vec4 bl = uBoatL[i];
        if(bl.w < 0.001) continue;
        vec3 L = bl.xyz - vWorld; float d = length(L); L /= max(d, 1e-3);
        float fall = clamp(1.0 - d / 7.0, 0.0, 1.0); fall *= fall;
        outc += col * vec3(1.6, 1.05, 0.55) * band2(dot(N, L)) * fall * bl.w;
      }

      // ---- the beam passing over (boats): a hard sheet of pale gold light
      if(uBeamK > 0.001){
        vec3 d = vWorld - uBeamP;
        float along = dot(d, uBeamDir);
        vec3 perp = d - uBeamDir * along;
        float w = 1.2 + along * 0.05;
        float inBeam = (1.0 - smoothstep(w * 0.8, w, length(perp))) * smoothstep(5.0, 9.0, along);
        float nb = dot(N, -uBeamDir);
        outc += col * vec3(1.7, 1.45, 1.05) * inBeam * uBeamK * smoothstep(-0.1, 0.1, nb);
      }

      // ---- inside the lantern room: the storm sky comes in through every pane (cold, from outside and above)
      vec3 rr = vWorld - uRoomC;
      float inRoom = (1.0 - smoothstep(3.2, 3.6, length(rr.xz))) * step(-0.3, rr.y) * step(rr.y, 6.0);
      if(inRoom > 0.0){
        vec3 outDir = normalize(vec3(rr.x, 0.0, rr.z) + vec3(1e-4));
        float f = max(dot(N, outDir), 0.0) * 0.7 + max(N.y, 0.0) * 0.5 + max(-N.y, 0.0) * 0.18;
        float fb = smoothstep(0.05, 0.15, f) * 0.6 + smoothstep(0.45, 0.55, f) * 0.4;
        outc += col * uRoomFill * (0.35 + 1.6 * fb) * inRoom;
      }
      outc += warLight(col, vWorld, N);
      // ---- puddles on the lamp-room floor: dark mirror patches with ripple rings, catching the lamp and the lightning
      if(uPuddle > 0.001 && N.y > 0.9 && inRoom > 0.5 && rr.y < 0.05){
        float pm = fbm3(vec3(vWorld.x * 0.9, 0.0, vWorld.z * 0.9) + 31.0) + 0.18 * smoothstep(1.5, 3.1, length(rr.xz));
        float pud = smoothstep(0.6, 0.62, pm) * uPuddle;
        if(pud > 0.0){
          float tt = floor(uDrawTime * 8.0);
          vec2 cellP = vWorld.xz * 2.2;
          vec2 ci = floor(cellP); vec2 cf = fract(cellP) - 0.5;
          float ph = fract(hash12(ci + tt * 0.37) + tt * 0.21);
          float ring = (1.0 - smoothstep(0.0, 0.04, abs(length(cf) - ph * 0.45))) * (1.0 - ph) * step(0.55, hash12(ci + 7.0 + tt));
          vec3 pc = outc * 0.45 + vec3(0.03, 0.045, 0.06);
          vec3 Rp = reflect(-V, vec3(0.0, 1.0, 0.0));
          vec3 Lp = normalize(uLampP - vWorld);
          float glint = smoothstep(0.985, 0.995, dot(Rp, Lp));
          pc += uLampC * vec3(1.0, 0.85, 0.6) * glint * 0.9;
          pc += vec3(0.6, 0.7, 0.85) * uFlash * 0.8;
          pc += vec3(0.25, 0.32, 0.4) * ring * (0.4 + dot(uLampC, vec3(0.3)));
          float edgeP = smoothstep(0.6, 0.605, pm) - smoothstep(0.605, 0.615, pm);
          outc = mix(outc, pc, pud);
          outc += vec3(0.04, 0.05, 0.06) * edgeP * uPuddle;
        }
      }

      // ---- emissive: 1 mantle / lamp glass (driven by uLampC), 2 boat lantern glass, 3 wheelhouse window glow
      if(emis > 0.5 && emis < 1.5){
        float k = clamp(dot(uLampC, vec3(0.333)), 0.0, 1.5);
        vec3 hot = mix(vec3(1.0, 0.7, 0.35), vec3(1.9, 1.7, 1.25), smoothstep(0.3, 0.9, max(dot(N, V), 0.0)));
        outc = mix(outc * 0.7 + col * 0.15, hot * (0.8 + 0.8 * k), clamp(k, 0.0, 1.0));
      } else if(emis > 1.5 && emis < 2.5){
        outc = mix(vec3(1.6, 1.1, 0.55), vec3(2.2, 1.9, 1.3), smoothstep(0.4, 0.95, max(dot(N, V), 0.0))) * col.r;
      } else if(emis > 2.5){
        float fr = smoothstep(0.0, 0.8, max(dot(N, V), 0.0));
        outc = mix(vec3(0.12, 0.09, 0.06), vec3(0.95, 0.62, 0.3) * (0.6 + 0.4 * fr), col.r);
      }
      outc *= uDim;
      writeOut(outc, 1.0, NV, vDepth, idF);
    }
  `;
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: vs, fragmentShader: fs, side: THREE.DoubleSide, transparent: false });
}

// ---------------------------------------------------------------- glass (overlay pass)
// Rendered in ctx.overlay after ink and atmosphere: hand-drawn glass. It hides behind anything nearer (scene view depth),
// tints what is behind it, draws its own facet lines, and when the lamp burns it fills with stacked gold bands
// (each prism ring throws its own line of light toward the eye), brightest across the flash panel facing the eye.
// aG: x part (0 prism ring, 1 bullseye, 2 pane, 3 chimney), y across-profile 0..1 (prism root..tip / ring radius), z ring index, w seed.
export const GL = {
  uLampK: { value: 0 },
  uFlashG: { value: 0 },
  uBroken: { value: 0 },                     // panes: 0 intact, 1 shattered pattern active
  uLensC: { value: new THREE.Vector3(160, 70.4, -300) },
  uRoomC: { value: new THREE.Vector3(160, 68, -300) },
  uPuddle: { value: 0 },                                 // rain blown in through the broken panes pools on the lamp-room floor
};
export function glassMaterial(o = {}) {
  const u = {
    ...GL,
    uTime: G.uTime, uDrawTime: G.uDrawTime, uKeyDir: G.uKeyDir, uSunColor: G.uSunColor, uSkyTint: G.uSkyTint,
    uSceneData: { value: null }, uRes: { value: new THREE.Vector2(1, 1) },
    uTint: { value: new THREE.Color(o.tint ?? '#2c5452') },
    uAlpha: { value: o.alpha ?? 0.4 },
    uMode: { value: o.mode ?? 0 },            // 0 lens, 1 panes
    uFade: { value: 1 },
  };
  const vs = /* glsl */ `
    attribute vec4 aG;
    varying vec4 vG;
    varying vec3 vWorld, vN, vLocal;
    varying float vDepth;
    varying vec2 vUv;
    void main(){
      vG = aG; vUv = uv; vLocal = position;
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorld = wp.xyz;
      vN = normalize(mat3(modelMatrix) * normal);
      vec4 mv = viewMatrix * wp;
      vDepth = -mv.z;
      gl_Position = projectionMatrix * mv;
    }
  `;
  const fs = /* glsl */ `
    uniform sampler2D uSceneData;
    uniform vec2 uRes;
    uniform vec3 uTint, uKeyDir, uSunColor, uSkyTint, uLensC, uRoomC;
    uniform float uAlpha, uMode, uLampK, uFlashG, uBroken, uTime, uDrawTime, uFade;
    varying vec4 vG;
    varying vec3 vWorld, vN, vLocal;
    varying float vDepth;
    varying vec2 vUv;
    out vec4 oColor;
    float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    float vn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.-2.*f);
      return mix(mix(h12(i), h12(i+vec2(1,0)), u.x), mix(h12(i+vec2(0,1)), h12(i+vec2(1,1)), u.x), u.y); }
    void main(){
      float sceneD = texture(uSceneData, gl_FragCoord.xy / uRes).b;
      if(sceneD > 0.01 && sceneD < vDepth - 0.02) discard;          // something solid is in front of the glass
      vec3 N = normalize(vN);
      vec3 V = normalize(cameraPosition - vWorld);
      if(dot(N, V) < 0.0) N = -N;
      float fres = 1.0 - max(dot(N, V), 0.0);
      float px = length(fwidth(vWorld)) + 1e-5;
      float part = floor(vG.x + 0.5), across = vG.y, ringI = vG.z, seed = vG.w;
      vec3 col = vec3(0.0); float a = 0.0;

      if(uMode < 0.5){
        // ================= LENS
        vec3 rel = vWorld - uLensC;
        vec3 radial = normalize(vec3(rel.x, 0.0, rel.z));
        vec3 Vh = normalize(vec3(V.x, 0.0, V.z));
        float facing = dot(radial, Vh);                         // 1 where this side of the lens faces the eye
        float elev = V.y;
        // Thick cast glass: every prism ring is a solid band (lit upper facet, darker lower facet), with a near-black gap at
        // its root and a thin bright refraction line along its tip. The lamp warms the bands; only the bullseye centres and
        // the tips facing the eye get hot, so the structure always survives.
        float lw = clamp(px * 1.4 / 0.03, 0.03, 0.3);
        float root = (1.0 - smoothstep(0.0, lw * 1.6 + 0.06, across)) * step(part, 0.5);
        float tip = (1.0 - smoothstep(0.0, lw, 1.0 - across)) * step(part, 0.5);
        float faceUp = smoothstep(-0.05, 0.05, N.y * sign(rel.y + 1e-3));      // facet turned away from the lens equator
        vec3 R = reflect(-V, N);
        float sky = smoothstep(0.25, 0.3, R.y) * (1.0 - smoothstep(0.55, 0.6, R.y));
        float k = uLampK;
        float face = smoothstep(-0.2, 0.9, facing);
        float vis = 0.3 + 0.7 * face;
        vec3 cr = cameraPosition - uLensC;
        float camIn = (1.0 - smoothstep(0.85, 1.0, length(cr.xz))) * step(abs(cr.y), 1.1);   // looking out from inside the lens
        vis = mix(vis, 0.75, camIn);
        float flick = 0.94 + 0.06 * sin(uTime * 23.0 + ringI * 1.7);
        vec3 gold = vec3(0.78, 0.56, 0.3), hot = vec3(1.45, 1.3, 1.05), coolG = vec3(0.13, 0.22, 0.22), deepG = vec3(0.03, 0.065, 0.07);
        if(part < 0.5){
          vec3 body = mix(deepG, coolG, faceUp * 0.8 + 0.2 * fres);
          body += gold * k * vis * flick * mix(0.22, 0.75, faceUp);
          // a second, thinner internal line inside the lit facet (the light folding inside the prism)
          float inner = smoothstep(0.5, 0.54, across) * (1.0 - smoothstep(0.6, 0.66, across)) * faceUp;
          body += hot * inner * k * vis * 0.5;
          col = body;
          a = 0.62 + 0.25 * fres;
          col = mix(col, hot * (0.35 + 0.9 * k * smoothstep(0.3, 0.95, facing)) + vec3(0.25, 0.32, 0.38) * (1.0 - k), tip);
          a = max(a, tip * 0.95);
        } else if(part < 1.5){
          float rr = across;
          float rf = fract(rr * 7.0);
          float groove = (1.0 - smoothstep(0.0, 0.1 + lw, rf)) * step(0.1, rr);
          float edgeL = smoothstep(0.1, 0.14, rf) * (1.0 - smoothstep(0.16, 0.24, rf));
          float bull = pow(max(dot(N, V), 0.0), 4.0);
          vec3 body = mix(deepG, coolG, 0.5 + 0.5 * (1.0 - rf)) + gold * k * vis * (0.35 + 0.5 * (1.0 - rf)) * flick;
          col = body;
          col += hot * edgeL * (0.25 + 0.75 * k * vis);
          col = mix(col, deepG * 0.6, groove * 0.85);
          // the hot core: only the very centre, only when it looks at the eye
          float core = (1.0 - smoothstep(0.06, 0.2, rr)) * (0.35 + 0.65 * bull);
          col = mix(col, hot * 1.15, core * k);
          col += gold * (1.0 - smoothstep(0.15, 0.5, rr)) * (0.3 + 0.7 * bull) * k * 0.45;
          a = 0.55 + 0.3 * fres;
          a = max(a, groove * 0.9);
        } else {
          col = gold * 0.7 * k * vis + coolG * 0.4;
          a = 0.45;
        }
        col += vec3(0.16, 0.22, 0.28) * sky * (0.3 + 1.5 * uFlashG) * (1.0 - root);
        col += vec3(0.6, 0.7, 0.85) * uFlashG * 0.3 * tip;
        col = mix(col, vec3(0.012, 0.02, 0.022), root * 0.9);
        a = max(a, root * 0.9);
        col = min(col, vec3(1.5));
        a *= uAlpha / 0.32;
        a = mix(a, a * 0.62, camIn * (1.0 - tip) * (1.0 - root));
      } else {
        // ================= PANES (diamond glazing). uv: x around in m, y up in m. aG.z = facet index.
        vec2 q = vUv;
        // diamond cell: rotate 45 deg in the facet's own frame (facet width pw, row height ph)
        float pw = vG.y, ph = 0.966;
        vec2 c = vec2(q.x / pw, q.y / ph);
        vec2 d = vec2(c.x + c.y, c.x - c.y);
        vec2 cid = floor(d);
        vec2 f = fract(d);
        float edgeD = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
        float cellSeed = h12(cid + vec2(ringI * 7.0, 3.0));
        float brokenRim = 0.0;
        // shattered: some cells empty with jagged glass left in their frame
        if(uBroken > 0.5){
          float ang = atan(f.y - 0.5, f.x - 0.5);
          float jag = 0.05 + 0.13 * abs(sin(ang * 3.0 + cellSeed * 20.0)) + 0.08 * h12(vec2(floor(ang * 4.0), cellSeed * 50.0));
          bool broken = cellSeed < vG.w;
          if(broken && edgeD > jag) discard;
          if(broken) brokenRim = 1.0 - smoothstep(0.0, clamp(px / pw * 2.0, 0.006, 0.05), jag - edgeD);
        }
        // rain on the glass: running drips and a streaky film (outside face)
        float colX = floor(q.x * 22.0);
        float drip = fract(q.y * 1.4 + uDrawTime * (0.6 + h12(vec2(colX, 1.0)) * 0.9) + h12(vec2(colX, 2.0)));
        float dripL = smoothstep(0.86, 0.9, drip) * (1.0 - smoothstep(0.97, 1.0, drip)) * step(0.55, h12(vec2(colX, 5.0)));
        float lx = abs(fract(q.x * 22.0) - 0.5);
        dripL *= 1.0 - smoothstep(0.1, 0.22, lx);
        float film = vn(vec2(q.x * 6.0, q.y * 1.2 + uDrawTime * 0.4));
        col = uTint * (0.25 + 0.55 * fres) + vec3(0.04, 0.06, 0.08) * film;
        a = uAlpha * (0.25 + 0.75 * fres * fres);
        // painted reflection band of the storm sky
        vec3 R = reflect(-V, N);
        float sky = smoothstep(0.08, 0.14, R.y) * (1.0 - smoothstep(0.45, 0.5, R.y));
        col += vec3(0.05, 0.075, 0.1) * sky * (0.6 + 4.0 * uFlashG);
        col += vec3(0.3, 0.36, 0.45) * dripL * (0.35 + 2.0 * uFlashG);
        a = max(a, dripL * 0.6);
        // lamp glow seen in the glass
        if(uLampK > 0.001){
          vec3 rel = vWorld - uLensC;
          float glow = exp(-abs(rel.y) * 0.9) * uLampK;
          col += vec3(0.85, 0.6, 0.3) * glow * 0.35 * (0.4 + 0.6 * film);
        }
        // lead edge of each diamond pane: a thin dark putty line
        float putty = 1.0 - smoothstep(0.0, clamp(px / pw * 1.5, 0.01, 0.08), edgeD);
        col = mix(col, vec3(0.02, 0.03, 0.03), putty * 0.7);
        a = max(a, putty * 0.7);
        // the fresh break catches every light: a hard pale line along the jagged edge
        col = mix(col, vec3(0.55, 0.68, 0.72) + vec3(0.9, 0.7, 0.4) * uLampK * 0.6 + vec3(0.8) * uFlashG, brokenRim * 0.9);
        a = max(a, brokenRim * 0.9);
        // lightning whitens the whole pane for a moment
        col += vec3(0.5, 0.58, 0.7) * uFlashG * 0.25;
      }
      a = clamp(a * uFade, 0.0, 1.0);
      oColor = vec4(col * uFade, a);
    }
  `;
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, uniforms: u, vertexShader: vs, fragmentShader: fs,
    transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
  });
}
