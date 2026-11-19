import * as THREE from 'three';
import { G, COMMON, MRT_OUT } from './glsl.js';
import { SEA_U } from './look.js';
import { WAVES_GLSL, GRID } from './sea-waves.js';
import { MOUTH } from './layout.js';

// The storm sea, drawn as a cel: two hard body tones (trough / face) and a lighter face toward the deck glow,
// a hard sky sheen at grazing angles, crisp white foam on crests with a shaded underside, long wind streaks,
// the beam's pale gold track and the boat lanterns' broken reflections. Ink on crest silhouettes comes from the
// ink pass (id 13); the far sea melts into the horizon of the sky dome.
export function seaMaterial(skyU) {
  const u = {
    ...G, ...SEA_U,
    uCenter: { value: new THREE.Vector2() }, uTw: { value: 0 },
    uSw: { value: new THREE.Vector4() }, uSw2: { value: new THREE.Vector4() }, uBore: { value: new THREE.Vector4() },
    uBeamO: { value: new THREE.Vector4(160, 70.4, -300, 0) }, uBeamD: { value: new THREE.Vector3(0, -0.035, -1) },
    uLant: { value: Array.from({ length: 6 }, () => new THREE.Vector4()) },
    uFlashPos: skyU.uFlashPos,
    uHorCool: skyU.uHorizonCool, uHorWarm: skyU.uHorizonWarm, uSkyMid: skyU.uMid, uCloudMid: skyU.uCloudMid, uCloudLit: skyU.uCloudLit,
  };
  const vs = /* glsl */ `
    ${WAVES_GLSL}
    varying vec3 vWorld;
    varying vec3 vNG;
    varying float vDepth, vSp;
    void main(){
      vec2 rel = position.xz;
      float r = length(rel);
      vec2 p = uCenter + rel;
      float sp = spacingAt(r);
      float h = seaHeight(p, sp);
      float e = max(sp * 0.6, 0.25);
      float hx = seaHeight(p + vec2(e, 0.0), sp), hz = seaHeight(p + vec2(0.0, e), sp);
      vNG = normalize(vec3(-(hx - h) / e, 1.0, -(hz - h) / e));
      vec4 wp = vec4(p.x, h, p.y, 1.0);
      vWorld = wp.xyz; vSp = sp;
      // the rim of the mesh rises to eye level, so the sea always reaches the true horizon (no sky shows below it)
      wp.y = mix(wp.y, cameraPosition.y - 1.0, smoothstep(${(GRID.RMAX * 0.72).toFixed(1)}, ${(GRID.RMAX * 0.999).toFixed(1)}, r));
      vWorld = wp.xyz;
      vec4 mv = viewMatrix * wp;
      vDepth = -mv.z;
      gl_Position = projectionMatrix * mv;
    }
  `;
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    ${WAVES_GLSL}
    uniform vec3 uSeaDeep, uSeaBody, uSeaSheen, uSeaLit, uSeaFoam, uSeaFoamShade, uSeaGlint;
    uniform float uSeaStorm, uSeaFlash, uSeaSheenK;
    uniform vec4 uBeamO;
    uniform vec3 uBeamD;
    uniform vec4 uLant[6];
    uniform vec3 uFlashPos, uHorCool, uHorWarm, uSkyMid, uCloudMid, uCloudLit;
    varying vec3 vWorld, vNG;
    varying float vDepth, vSp;
    float swellGrad(vec2 p, out vec2 g){
      float h = swellAt(p) + boreAt(p);
      float e = 1.5;
      g = vec2(swellAt(p + vec2(e, 0.0)) + boreAt(p + vec2(e, 0.0)) - h, swellAt(p + vec2(0.0, e)) + boreAt(p + vec2(0.0, e)) - h) / e;
      return h;
    }
    // two nearest cells: their difference draws the lace foam leaves behind a breaking crest
    float lace(vec2 p){
      vec2 ip = floor(p), fp = fract(p); float d1 = 8.0, d2 = 8.0;
      for(int y = -1; y <= 1; y++) for(int x = -1; x <= 1; x++){
        vec2 gg = vec2(float(x), float(y));
        vec2 o = hash22(ip + gg);
        float d = length(gg + o - fp);
        if(d < d1){ d2 = d1; d1 = d; } else if(d < d2) d2 = d;
      }
      return d2 - d1;
    }
    void main(){
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
      vec3 P = vWorld;
      vec3 Vv = cameraPosition - P;
      float dist = length(Vv);
      vec3 V = Vv / dist;
      vec2 fw = fwidth(P.xz);
      float px = max(max(fw.x, fw.y), 1e-3);         // metres per pixel
      float tt = uTw;
      float rough = uSw2.w;
      float calm = calmAt(P.xz) * rough;
      float near = 1.0 - smoothstep(0.6, 3.5, px);   // fine drawing fades out with distance
      // ---- normal: the storm sea analytically (faded by pixel size), the swell and the bore, ripples for shading only
      vec2 g;
      float hw = wavesAt(P.xz, px * 2.5, g) * calm;
      g *= calm;
      vec2 gs;
      float hs = swellGrad(P.xz, gs);
      g += gs;
      for(int i = 0; i < NRP; i++){
        vec4 R = RP[i];
        float L = 6.2831853 / length(R.xy);
        float fr = 1.0 - smoothstep(L / 16.0, L / 6.0, px);
        if(fr <= 0.0) continue;
        float ph = R.x * P.x + R.y * P.z - R.w * tt + float(i) * 1.7;
        g += fr * R.z * cos(ph) * normalize(R.xy) * (0.35 + 0.65 * calm);
      }
      vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
      // long swell and short chop, separately: the long one shapes the tones, both make the whitecaps
      float cl = 0.0, cs = 0.0;
      for(int i = 0; i < NW; i++){
        vec4 K = WK[i], O = WO[i];
        float ph = K.x * P.x + K.y * P.z - O.x * tt + O.y;
        float v = K.z * (2.0 * pow(max(0.5 + 0.5 * sin(ph), 1e-5), K.w) - 2.0 * O.z);
        v *= fadeW(O.w, px * (i < 3 ? 0.7 : 2.5));              // far away the drawing simplifies instead of aliasing into bands
        if(i < 3) cl += v; else cs += v;
      }
      cl *= calm / 4.6; cs *= calm / 1.15;
      float swellK = clamp(hs / 18.0, 0.0, 1.5);
      float fn = fbm2(P.xz / 7.0 + vec2(tt * 0.3, -tt * 0.6)) - 0.5;
      float fn2 = vnoise(P.xz / 2.3 + tt) - 0.5;
      float bn = fbm2(P.xz / 90.0 + 3.0) - 0.5;

      // ---- body: the trough tone and the face tone split along a drawn line that follows the swell
      vec3 L = normalize(uSunDir + vec3(0.0, 0.25, 0.0));
      float split = cl + cs * 0.3 + bn * 0.18 * rough + swellK * 0.5 + (1.0 - rough) * 0.12;
      vec3 col = mix(uSeaDeep, uSeaBody, smoothstep(-0.06, -0.02, split));
      // cold light on the faces turned toward the deck glow: a third, lighter tone in long bands
      float ndl = dot(N, L);
      float litF = smoothstep(0.0, 0.03, ndl - 0.9 + bn * 0.04) * smoothstep(-0.3, 0.1, split);
      col = mix(col, uSeaLit, litF * 0.8);
      // ---- the great swell's face: black at the foot, a translucent teal band under the crest, foam drips down the face
      float zc0 = uSw.x + crestOff(P.x);
      float sz0 = P.z - zc0;
      float Hloc = max(uSw.y * (1.0 - 0.85 * uSw2.x) * latAt(P.x), 0.01);
      float hf = clamp(hs / Hloc, 0.0, 1.2);
      float steep = smoothstep(0.12, 0.35, length(gs));
      float onFace = step(0.0, sz0) * smoothstep(0.06, 0.16, hf) * step(1.0, uSw.y) * steep;
      // a long gentle front slope (s10) reads as one darker sheet of water sliding down toward the fleet
      float gentle = step(0.0, sz0) * smoothstep(0.1, 0.4, hf) * (1.0 - steep) * smoothstep(0.004, 0.012, length(gs));
      col = mix(col, uSeaDeep * 0.85, gentle * 0.75);
      // ... with long lit ridges of the storm sea riding up it, cold light catching their backs
      col = mix(col, mix(uSeaLit, uSeaSheen, 0.4), gentle * smoothstep(0.3, 0.36, cl + cs * 0.4 + bn * 0.2) * 0.75);
      float onBack = step(sz0, 0.0) * smoothstep(0.1, 0.3, hf) * step(1.0, uSw.y);
      // the face: black foot -> deep body -> a translucent teal band under the lip, in hard painted steps with drawn edges
      float fw1 = fbm2(vec2(P.x / 26.0, hf * 3.0 - tt * 0.2)) - 0.5;
      float fw2 = vnoise(vec2(P.x / 7.0, hf * 7.0 - tt * 0.35)) - 0.5;
      float hq = hf + fw1 * 0.12 + fw2 * 0.04;
      vec3 faceC = uSeaDeep * 0.6;
      faceC = mix(faceC, uSeaDeep * 1.05, smoothstep(0.3, 0.33, hq));
      faceC = mix(faceC, mix(uSeaDeep, uSeaBody, 0.7), smoothstep(0.55, 0.58, hq));
      vec3 glass = uSeaLit * 1.45 + vec3(0.0, 0.03, 0.035);
      faceC = mix(faceC, glass, smoothstep(0.78, 0.81, hq) * 0.85);
      // backlight: lightning behind the wall and the beam passing over it light the thin water under the lip
      float backK = clamp(uSeaFlash * 1.2 + uBeamO.w * 0.25 * exp(-pow(length((P - (uBeamO.xyz + uBeamD * max(dot(P - uBeamO.xyz, uBeamD), 0.0))).xz) / 60.0, 2.0)), 0.0, 1.0);
      faceC = mix(faceC, vec3(0.5, 0.66, 0.66), smoothstep(0.62, 0.7, hq) * backK * 0.8);
      // water drawn up the face and pouring off the lip: long streaks, pale near the top, dark near the foot
      float sx = P.x / 4.5 + fbm2(vec2(P.x / 70.0, hf * 1.5)) * 3.0;
      float fs1 = vnoise(vec2(sx, hf * 1.8 - tt * 0.3));
      float fs2 = vnoise(vec2(sx * 2.3 + 7.0, hf * 3.5 - tt * 0.45));
      faceC = mix(faceC, mix(uSeaBody, uSeaSheen, 0.35) * 1.15, step(0.72, fs1) * smoothstep(0.4, 0.62, hf) * 0.6);
      faceC = mix(faceC, uSeaDeep * 0.45, step(fs1, 0.26) * (1.0 - smoothstep(0.35, 0.6, hf)) * 0.75);
      faceC = mix(faceC, glass * 1.1, step(0.8, fs2) * smoothstep(0.7, 0.85, hf) * 0.6);
      // foam lace hanging down the face from the lip (a net of thin lines), thinning toward the foot
      vec2 lq2 = vec2(P.x / 3.0, hf * 9.0 - tt * 0.6) + vec2(fbm2(vec2(P.x / 9.0, hf * 4.0)), fbm2(vec2(P.x / 9.0 + 5.0, hf * 4.0))) * 1.4;
      float lline = step(abs(vnoise(lq2) - 0.5), 0.03 + 0.04 * smoothstep(0.6, 0.95, hf));
      faceC = mix(faceC, mix(uSeaFoamShade, uSeaFoam, 0.3), lline * smoothstep(0.5, 0.85, hf) * (0.4 + 0.6 * uSw2.y) * 0.85);
      float drip = smoothstep(0.76, 0.8, vnoise(vec2(P.x / 3.2, sz0 / 30.0 - tt * 0.7))) * smoothstep(0.45, 0.8, hf) * uSw2.y;
      faceC = mix(faceC, uSeaFoamShade * 0.9, drip * 0.7);
      col = mix(col, faceC, onFace);
      // the long back slope reads as one sheet of dark water with the sky on its ridges
      col = mix(col, mix(col, uSeaDeep, 0.45), onBack * smoothstep(0.3, 0.8, hf) * 0.6);
      // ---- sky sheen at grazing angles (hard edged), the far sea goes flat and painted
      float ndv = max(dot(N, V), 0.0);
      float fres = pow(1.0 - ndv, 4.0);
      vec3 Rf = reflect(-V, N);
      float sunSide = dot(normalize(Rf.xz + 1e-5), normalize(uSunDir.xz + 1e-5)) * 0.5 + 0.5;
      vec3 skyR = mix(mix(uHorCool, uHorWarm, smoothstep(0.5, 1.0, sunSide)), mix(uCloudMid, uSkyMid, 1.0 - uSeaStorm), smoothstep(0.02, 0.35, Rf.y));
      // water in front of the wall mirrors the wall, not the sky
      float wallTop = uSw.y * (1.0 - 0.85 * uSw2.x);
      if(wallTop > 2.0 && sz0 > 0.0 && Rf.z < 0.0 && onFace < 0.5){
        float wallEl = (wallTop - P.y) / max(sz0, 1.0);
        float rEl = Rf.y / max(-Rf.z, 1e-3);
        skyR = mix(skyR, uSeaDeep * 1.2, smoothstep(0.0, 0.12, wallEl - rEl + (vnoise(P.xz / 6.0) - 0.5) * 0.15) * 0.9);
      }
      float sheenN = vnoise(P.xz / 14.0 + tt * 0.1) - 0.5;
      float sheen = smoothstep(0.3, 0.33, fres + sheenN * 0.05 + (1.0 - uSeaStorm) * 0.04 - (1.0 - uSeaStorm) * clamp(-cl, 0.0, 1.0) * 0.25);
      float faceKeep = (1.0 - onFace * 0.85) * (1.0 - gentle * 0.8) * uSeaSheenK;
      col = mix(col, mix(uSeaSheen, skyR, 0.3), sheen * (0.8 + 0.12 * (1.0 - uSeaStorm)) * faceKeep);
      col = mix(col, skyR, smoothstep(0.6, 0.66, fres) * 0.55 * faceKeep);
      // ---- wind lines: long thin foam streaks laid along the wind
      vec2 wd = normalize(vec2(0.1, 1.0));
      vec2 q = vec2(dot(P.xz, vec2(wd.y, -wd.x)), dot(P.xz, wd));
      float sw = vnoise(vec2(q.x / 1.6, q.y / 48.0 - tt * 0.3));
      float sw2 = vnoise(vec2(q.x / 7.0 + 7.0, q.y / 120.0 - tt * 0.2));
      float streak = smoothstep(0.84, 0.88, sw) * smoothstep(0.45, 0.7, sw2) * smoothstep(-0.1, 0.25, cl + cs * 0.4) * near * calm;
      col = mix(col, mix(col, uSeaFoamShade, 0.75), streak * (0.4 + 0.5 * uSeaStorm));
      // ---- whitecaps: crisp white where the swell and the chop crest together, lace trailing behind
      float wc = 0.55 * cl + 0.45 * cs + fn * 0.14;
      float capM = smoothstep(0.84, 0.86, wc + fn2 * 0.08) * smoothstep(0.5, 1.0, rough) * (1.0 - smoothstep(2.5, 7.0, px));
      // whitecaps are broken lace, never flat blobs: holes of dark water and a shaded underside
      { float nearL = 1.0 - smoothstep(250.0, 600.0, dist);   // near the lens: local caps where the chop breaks, never 100 m bands
        capM *= mix(1.0, smoothstep(0.5, 0.56, vnoise(P.xz / 16.0 + vec2(tt * 0.2, -tt * 0.5)) * 0.7 + cs * 0.25 + fn * 0.3), nearL); }
      capM *= step(0.36, vnoise(P.xz / 1.9 + tt * 0.8) * 0.6 + vnoise(P.xz / 5.0 - tt * 0.3) * 0.4 + smoothstep(0.84, 0.95, wc) * 0.4);
      // lace: wormy foam lines (thin bands of a warped noise), thicker near the caps
      vec2 lq = vec2(q.x / 5.0, q.y / 9.0) + vec2(fbm2(P.xz / 11.0), fbm2(P.xz / 11.0 + 5.0)) * 1.6 - vec2(0.0, tt * 0.25);
      float lw = abs(vnoise(lq) - 0.5);
      float laceZone = smoothstep(0.5, 0.66, wc) * (1.0 - capM) * near * smoothstep(0.5, 1.0, rough);
      float laceM = step(lw, 0.025 + 0.05 * smoothstep(0.64, 0.8, wc)) * laceZone;
      // the great swell: a spilling cap on its crest, the white field of the break, the bore
      float zc = uSw.x + crestOff(P.x);
      float sz = P.z - zc;
      float cap = uSw2.y * smoothstep(-16.0, -3.0, sz) * (1.0 - smoothstep(2.0, 12.0, sz)) * step(0.5, uSw.y);
      // the cap breaks first on the peaks; the saddles stay glassy
      cap *= smoothstep(0.5, 0.62, vnoise(vec2(P.x / 85.0, tt * 0.12)) * 0.8 + (latAt(P.x) - 0.9) * 2.0);
      float white = uSw2.z * smoothstep(zc - 150.0, zc - 40.0, P.z) * (1.0 - smoothstep(zc + 30.0, zc + 90.0, P.z)) * (1.0 - smoothstep(-210.0, -160.0, P.z)) * (1.0 - smoothstep(350.0, 800.0, abs(P.x)));
      float bore = clamp(boreAt(P.xz) / 2.5, 0.0, 1.0);
      // white water boiling round the reef teeth and the sea stack (radius ~13 m)
      float rocks = 0.0;
      {
        vec3 RK[3] = vec3[](vec3(${MOUTH.toothL[0].toFixed(1)}, ${MOUTH.toothL[2].toFixed(1)}, 14.0), vec3(${MOUTH.toothR[0].toFixed(1)}, ${MOUTH.toothR[2].toFixed(1)}, 14.0), vec3(150.0, -418.0, 12.0));
        for(int i = 0; i < 3; i++){
          float d = length(P.xz - RK[i].xy) - RK[i].z;
          float ang = atan(P.z - RK[i].y, P.x - RK[i].x);
          float tongue = 0.5 + 0.5 * sin(ang * 7.0 + float(i) * 2.0 + tt * 1.3) * vnoise(vec2(ang * 3.0, tt * 0.7 + float(i)));
          rocks = max(rocks, (1.0 - smoothstep(0.0, (3.0 + 9.0 * tongue) * (0.5 + 0.5 * rough) + 30.0 * uSw2.x, d + fn * 9.0)) * (0.5 + 0.4 * rough));
        }
      }
      float big = max(max(cap * 0.9, rocks), max(white, bore));
      // big white water: churned foam with holes of dark water, two tones of white, lace drawn inside it
      vec2 fp = P.xz + vec2(0.0, -tt * 3.0);
      float b1 = fbm2(fp / 10.0 + 4.0), b2 = vnoise(fp / 2.8 + tt * 0.7);
      float bigM = smoothstep(0.5, 0.52, b1 * 0.8 + b2 * 0.32 + big * 0.5 - 0.36) * step(0.05, big);
      float bigLace = step(abs(vnoise(fp / 5.0 + vec2(fbm2(fp / 9.0), fbm2(fp / 9.0 + 3.0)) * 1.5) - 0.5), 0.045 + 0.04 * big) * smoothstep(0.1, 0.35, big) * (1.0 - bigM);
      float foamM = max(capM, bigM) * (1.0 - smoothstep(3.0, 9.0, px));
      float fLit = N.y * 0.5 + dot(N, L) * 0.35 + (b2 - 0.5) * 0.45 + (b1 - 0.5) * 0.5 * step(0.05, big);
      vec3 fc = mix(uSeaFoamShade, uSeaFoam, smoothstep(0.5, 0.54, fLit + 0.12));
      float inLace = step(abs(vnoise(fp / 3.5 + vec2(fbm2(fp / 6.0), fbm2(fp / 6.0 + 5.0)) * 1.4) - 0.5), 0.028) * near * step(0.05, big);
      fc = mix(fc, mix(uSeaFoamShade, uSeaBody, 0.45), inLace * 0.8);
      col = mix(col, mix(col, uSeaFoamShade, 0.9), max(laceM, bigLace) * 0.85);
      col = mix(col, fc, foamM);
      // ---- the beam: a pale gold track on the water under it, glints on the crests
      if(uBeamO.w > 0.001){
        vec3 v = P - uBeamO.xyz;
        float along = dot(v, uBeamD);
        if(along > 0.0){
          vec3 axis = uBeamO.xyz + uBeamD * along;
          float rc = 1.5 + along * 0.045;
          float hp = length((P - axis).xz);
          float below = max(axis.y - P.y - rc, 0.0);
          float pool = exp(-pow(hp / (rc * 1.6 + 5.0), 2.0)) * exp(-below / (22.0 + along * 0.025));
          float glints = smoothstep(0.55, 0.75, N.y * 0.5 + 0.5 + fn2 * 0.4 + cl * 0.3);
          vec3 bc = vec3(1.0, 0.9, 0.72);
          col += bc * uBeamO.w * (smoothstep(0.18, 0.22, pool) * 0.16 + smoothstep(0.4, 0.44, pool * glints) * 0.75 + pool * 0.08) * (1.0 + foamM);
        }
      }
      // ---- boat lanterns: a warm pool round each hull and broken reflection streaks toward the camera
      for(int i = 0; i < 6; i++){
        vec4 Lt = uLant[i];
        if(Lt.w < 0.01) continue;
        vec3 toL = Lt.xyz - P;
        float dl = length(toL);
        // light broken on the chop round the hull (never a disc) and a glitter column toward the camera
        float poolL = exp(-dl / 6.0) * smoothstep(0.45, 0.75, vnoise(P.xz / 0.9 + tt * 2.0) + fn * 0.5);
        float gl = dot(Rf, toL / dl);
        float rr = 0.0007 + 0.0025 * uSeaStorm + px * 0.0004;
        float refl = smoothstep(1.0 - rr * 2.0, 1.0 - rr * 0.4, gl + fn2 * 0.003) * smoothstep(0.1, 0.5, fn2 + 0.5);
        vec3 lc2 = vec3(1.0, 0.8, 0.52);
        col += lc2 * Lt.w * (smoothstep(0.25, 0.3, poolL) * 0.5 + refl * 0.7 / (1.0 + dl / 120.0));
      }
      // ---- lightning: the sea turns to beaten silver where it mirrors the lit deck
      if(uSeaFlash > 0.001){
        vec3 toF = normalize(uFlashPos - P);
        float mirror = dot(Rf, toF);
        vec3 silver = vec3(0.74, 0.83, 0.92);
        col = mix(col, col * 1.4 + vec3(0.015, 0.025, 0.035), uSeaFlash * 0.6);
        float wallHide = (wallTop > 2.0 && sz0 > 0.0 && Rf.z < 0.0 && Rf.y / max(-Rf.z, 1e-3) < (wallTop - P.y) / max(sz0, 1.0) + 0.1) ? 0.0 : 1.0;
        float silverM = step(0.72, mirror * 0.55 + Rf.y * 0.15 + fn * 0.35 + fn2 * 0.15 + cl * 0.15);
        col = mix(col, silver, silverM * uSeaFlash * (1.0 - foamM) * wallHide * 0.85);
        col = mix(col, vec3(0.95, 0.98, 1.0), foamM * uSeaFlash * 0.6);
      }
      // ---- event light (addWarLight: beam, lightning, lanterns, land's mouth light): hard cel pools on the water,
      //      foam and crests catch it brightest
      {
        vec3 wAlb = mix(mix(uSeaSheen, uSeaLit, 0.5) * 0.9, uSeaFoam, max(foamM, laceM * 0.6));
        vec3 wl = warLight(wAlb, P, normalize(N + vec3(0.0, 0.6, 0.0)));
        float wk = dot(wl, vec3(0.333));
        col += wl * (0.55 + 0.9 * smoothstep(0.35, 0.65, fn2 + 0.5 + cl * 0.4)) * (0.6 + 0.4 * step(0.08, wk));
      }
      // ---- dawn: the low sun lays a glitter path
      vec3 sd = normalize(uSunDir);
      float sg = dot(Rf, sd);
      float spark = step(0.62, vnoise(P.xz / 1.3 + tt * 3.0) + fn * 0.3) * near + (1.0 - near) * 0.5;
      col += uSeaGlint * smoothstep(0.993, 0.998, sg + fn2 * 0.006) * spark * (1.0 - uSeaStorm) * 0.7;
      col = mix(col, uSeaGlint * 0.9, smoothstep(0.9985, 0.9995, sg) * spark * (1.0 - uSeaStorm) * 0.5);
      // ---- far water melts into the sky's horizon (no seam)
      vec3 wdir = -V;
      float hy = wdir.y;
      // the sky's own colour at the horizon (same recipe as world-sky.js at el = 0)
      float sSide = dot(normalize(wdir.xz + 1e-5), normalize(uSunDir.xz + 1e-5)) * 0.5 + 0.5;
      vec3 hz = mix(uHorCool, uHorWarm, smoothstep(0.7, 1.0, sSide) * 0.7);
      hz = mix(hz, uHorWarm * 1.04, smoothstep(0.4, 1.0, sSide) * 0.8);
      hz = mix(hz, mix(mix(uHorCool, uHorWarm, smoothstep(0.7, 1.0, sSide) * 0.7), uCloudMid, 0.35), 0.4 * uSeaStorm);
      // the far sea is the sea's own sheen dissolving into that horizon (a shade darker than the sky's bright band)
      vec3 farSea = mix(hz, uSeaSheen, mix(0.5, 0.45, uSeaStorm));
      col = mix(col, farSea, exp(-pow(max(-hy, 0.0) / 0.035, 1.2)) * 0.9);
      // the rim skirt (rises to eye level) is painted as a plain gradient: far sea at its foot, the sky's horizon at its top
      float rimK = smoothstep(${(GRID.RMAX * 0.55).toFixed(1)}, ${(GRID.RMAX * 0.72).toFixed(1)}, length(P.xz - uCenter));
      float tSk = clamp(-hy / max(cameraPosition.y / ${(GRID.RMAX * 0.9).toFixed(1)}, 1e-4), 0.0, 1.0);
      // painted far water: once a pixel covers metres of sea, the drawing simplifies to the far tone (no aliasing bands)
      float farK = smoothstep(4.0, 14.0, px);
      col = mix(col, farSea, farK * 0.92);
      col = mix(col, farSea, rimK);
      vec3 NG = normalize(vNG);
      vec3 NV = normalize((viewMatrix * vec4(NG, 0.0)).xyz);
      // far sea: flat normal for the ink, and a depth ramp that ends behind the sky (9000) at the mesh rim,
      // so neither the distant chop nor the rim against the sky draws an ink line
      NV = normalize(mix(NV, vec3(0.0, 0.0, 1.0), smoothstep(1500.0, 3000.0, vDepth)));
      float dOut = min(vDepth, 7900.0);   // never classified as sky by the atmosphere pass (that cut a wavy fog seam)
      writeOut(col, 1.0, NV, dOut, 13.0);
    }
  `;
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: vs, fragmentShader: fs, side: THREE.DoubleSide });
}
