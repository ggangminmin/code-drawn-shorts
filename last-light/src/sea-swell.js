import * as THREE from 'three';
import { G, COMMON, MRT_OUT } from './glsl.js';
import { SEA_U } from './look.js';
import { CUES } from './shots.js';
import { smooth, invLerp, clamp } from './util.js';
import { crestZ, swellAt } from './sea-waves.js';

// THE LIP of the great swell: one CPU-deformed sheet hung along the crest line. It is what a heightfield cannot draw:
// the water thrown forward over the face, curling, and finally plunging onto the reef line at CUES.waveBreak.
// Cross-section: an ellipse arc leaving the crest top, swept forward (+Z) and down by the curl angle phi(x, t).
const NT = 260, NV = 28, X0 = 1500;

export function curlAt(x, t) {
  // 0 rad before the crest, ~1.9 at CUES.crest + 3, plunging past pi just after the break
  const a = smooth(invLerp(CUES.crest - 3.6, CUES.crest - 0.2, t)) * 1.5
    + smooth(invLerp(CUES.crest - 0.2, CUES.waveBreak - 0.3, t)) * 0.6
    + smooth(invLerp(CUES.waveBreak - 0.5, CUES.waveBreak + 0.35, t)) * 1.35;
  const peel = 0.72 + 0.28 * Math.sin(x / 210 + 1.3) + 0.12 * Math.sin(x / 77 + 0.4);
  return a * peel;
}
export function lipAlive(t) { return t > CUES.crest - 3.6 && t < CUES.waveBreak + 1.4; }

function lipMaterial() {
  const u = { ...G, ...SEA_U, uDrawing: { value: 0 }, uFade: { value: 1 }, uFlashPos: { value: new THREE.Vector3() } };
  const vs = /* glsl */ `
    attribute float aV;
    attribute float aTh;
    varying float vV, vTh, vDepth;
    varying vec3 vWorld, vN, vNV;
    void main(){
      vec4 w = modelMatrix * vec4(position, 1.0);
      vWorld = w.xyz; vV = aV; vTh = aTh;
      vN = normalize(mat3(modelMatrix) * normal);
      vNV = normalize(mat3(viewMatrix) * vN);
      vec4 mv = viewMatrix * w;
      vDepth = -mv.z;
      gl_Position = projectionMatrix * mv;
    }
  `;
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    uniform vec3 uSeaDeep, uSeaBody, uSeaSheen, uSeaLit, uSeaFoam, uSeaFoamShade, uFlashPos;
    uniform float uSeaStorm, uSeaFlash, uDrawing, uFade;
    varying float vV, vTh, vDepth;
    varying vec3 vWorld, vN, vNV;
    void main(){
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1.0); oData = vec4(0.0); return; }
      vec3 N = normalize(vN), NV = normalize(vNV);
      if(!gl_FrontFacing){ N = -N; NV = -NV; }
      float under = vTh;
      float x = vWorld.x;
      // the lip's torn edge: rounded tongues of water thrown off, redrawn on threes
      float tng = 0.5 + 0.5 * sin(x / 6.5 + 2.0 * vnoise(vec2(x / 30.0, uDrawing * 0.13)));
      float tip = 0.84 + 0.1 * pow(tng, 0.6) * (0.5 + vnoise(vec2(x / 18.0 + 9.0, uDrawing * 0.21))) + 0.05 * vnoise(vec2(x / 4.0, uDrawing * 0.3));
      tip = min(tip, uFade);
      if(vV > tip) discard;
      vec3 V = normalize(cameraPosition - vWorld);
      float flow = vnoise(vec2(x / 2.8, vV * 3.4 - uDrawing * 0.34));
      float flow2 = vnoise(vec2(x / 1.1 + 11.0, vV * 8.5 - uDrawing * 0.61));
      // body: deep under the lip, a translucent teal band where the sheet thins toward the tip
      vec3 col = mix(uSeaDeep, uSeaBody, smoothstep(0.1, 0.3, vV + (flow - 0.5) * 0.15));
      float thin = smoothstep(0.38, 0.5, vV + (flow - 0.5) * 0.12) * (1.0 - smoothstep(0.78, 0.86, vV));
      vec3 teal = uSeaLit * 1.25 + vec3(0.0, 0.015, 0.015);
      col = mix(col, teal, thin * 0.75);
      // long streaks pouring over the lip, light and dark
      float s1 = vnoise(vec2(x / 0.9, vV * 2.6 - uDrawing * 0.42));
      col = mix(col, mix(col, uSeaSheen * 1.2, 0.7), step(0.72, s1) * smoothstep(0.15, 0.4, vV) * 0.6);
      col = mix(col, uSeaDeep * 0.7, step(s1, 0.25) * 0.5);
      // the top of the sheet catches the deck glow
      float up = smoothstep(0.35, 0.45, N.y + (flow2 - 0.5) * 0.2) * (1.0 - under);
      col = mix(col, mix(col, uSeaSheen, 0.6), up * 0.5);
      col = mix(col, uSeaDeep * 0.85, under * (1.0 - thin * 0.6) * 0.7);
      // lightning behind the wave: the thin lip goes luminous
      vec3 toF = normalize(uFlashPos - vWorld);
      float back = smoothstep(0.0, 0.5, dot(-V, toF));
      col = mix(col, vec3(0.42, 0.56, 0.58), uSeaFlash * (thin * (0.5 + 0.5 * back)) * 0.85);
      col = mix(col, col * 1.35 + vec3(0.02, 0.03, 0.04), uSeaFlash * 0.5);
      col += warLight(mix(uSeaSheen, uSeaFoam, 0.4), vWorld, N) * 0.8;
      // foam cap along the tip, two tones
      // foam only where this stretch of lip is already breaking; elsewhere the tip stays glass
      float breaking = smoothstep(0.4, 0.6, vnoise(vec2(x / 70.0, uDrawing * 0.02)) + uFade * 0.0 + (1.0 - uFade) * 2.0 + uSeaFlash * 0.0);
      float foamLine = tip - (0.04 + 0.1 * breaking) - 0.06 * flow - 0.03 * flow2;
      if(vV > foamLine){
        float sh = vnoise(vec2(x / 1.6 + 17.0, vV * 26.0 - uDrawing * 0.46));
        col = mix(uSeaFoam, uSeaFoamShade, step(0.6, sh + (tip - vV) * 2.5 - 0.1));
        float hole = step(0.7, vnoise(vec2(x / 2.2 + 3.0, vV * 14.0 - uDrawing * 0.3)) + (vV - foamLine) * -3.0 + 0.15);
        col = mix(col, mix(uSeaLit, uSeaBody, 0.5), hole * 0.85);
        col = mix(col, vec3(0.95, 0.98, 1.0), uSeaFlash * 0.6);
      } else if(vV > foamLine - 0.035) col = mix(col, uSeaFoam, 0.5);
      writeOut(col, 1.0, NV, vDepth, 14.0);
    }
  `;
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: vs, fragmentShader: fs, side: THREE.DoubleSide });
}

function sprayMaterial() {
  const u = { ...G, ...SEA_U, uDrawing: { value: 0 }, uAmt: { value: 1 } };
  const vs = /* glsl */ `
    attribute float aV;
    varying float vV, vDepth;
    varying vec3 vWorld;
    void main(){
      vec4 w = modelMatrix * vec4(position, 1.0);
      vWorld = w.xyz; vV = aV;
      vec4 mv = viewMatrix * w;
      vDepth = -mv.z;
      gl_Position = projectionMatrix * mv;
    }
  `;
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    uniform vec3 uSeaFoam, uSeaFoamShade, uSeaSheen;
    uniform float uDrawing, uAmt, uSeaFlash;
    varying float vV, vDepth;
    varying vec3 vWorld;
    void main(){
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1.0); oData = vec4(0.0); return; }
      float x = vWorld.x;
      // torn streaks blown off the lip: thick at the root, breaking into threads, redrawn on threes
      float gust = vnoise(vec2(x / 40.0, uDrawing * 0.21));
      float n = vnoise(vec2(x / 0.8, vV * 2.5 - uDrawing * 0.55)) * 0.7 + vnoise(vec2(x / 3.0 + 9.0, vV * 1.2 - uDrawing * 0.3)) * 0.3;
      float keep = n - (0.36 + vV * 0.5 - gust * 0.25) / uAmt;
      if(keep < 0.0 || vV > 0.35 + 0.65 * gust * uAmt) discard;
      vec3 col = mix(uSeaFoam * 0.95, mix(uSeaFoamShade, uSeaSheen, 0.4), smoothstep(0.2, 0.7, vV) + step(keep, 0.04) * 0.4);
      col = mix(col, vec3(0.92, 0.96, 1.0), uSeaFlash * 0.7);
      writeOut(col, 1.0, vec3(0.0, 0.0, 1.0), vDepth, 115.0);
    }
  `;
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: vs, fragmentShader: fs, side: THREE.DoubleSide });
}

export function createLip(ctx, P) {
  const NS = 7;
  const sgeo = new THREE.BufferGeometry();
  const spos = new Float32Array((NT + 1) * (NS + 1) * 3), sV = new Float32Array((NT + 1) * (NS + 1));
  const sidx = [];
  for (let j = 0; j <= NT; j++) for (let i = 0; i <= NS; i++) {
    const k = j * (NS + 1) + i; sV[k] = i / NS;
    if (j < NT && i < NS) sidx.push(k, k + 1, k + NS + 2, k, k + NS + 2, k + NS + 1);
  }
  sgeo.setIndex(sidx);
  sgeo.setAttribute('position', new THREE.BufferAttribute(spos, 3).setUsage(THREE.DynamicDrawUsage));
  sgeo.setAttribute('aV', new THREE.BufferAttribute(sV, 1));
  const smat = sprayMaterial();
  const spray = new THREE.Mesh(sgeo, smat);
  spray.frustumCulled = false; spray.userData.noShadow = true; spray.visible = false; spray.name = 'swellSpray';
  ctx.scene.add(spray);

  const geo = new THREE.BufferGeometry();
  const N = (NT + 1) * (NV + 1);
  const pos = new Float32Array(N * 3), aV = new Float32Array(N), aTh = new Float32Array(N);
  const idx = [];
  for (let j = 0; j <= NT; j++) for (let i = 0; i <= NV; i++) {
    const k = j * (NV + 1) + i;
    aV[k] = 1 - Math.abs((2 * i) / NV - 1); aTh[k] = i > NV / 2 ? 1 : 0;
    if (j < NT && i < NV) idx.push(k, k + 1, k + NV + 2, k, k + NV + 2, k + NV + 1);
  }
  geo.setIndex(idx);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aV', new THREE.BufferAttribute(aV, 1));
  geo.setAttribute('aTh', new THREE.BufferAttribute(aTh, 1));
  const mat = lipMaterial();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.userData.noShadow = true; mesh.visible = false; mesh.name = 'swellLip';
  ctx.scene.add(mesh);
  let last = -1;

  return {
    mesh, spray,
    update(st, flashPos) {
      const t = st.t;
      if (!lipAlive(t) || ctx.camera.position.y > 1500) { mesh.visible = false; spray.visible = false; return; }
      const p = P(t);
      mesh.visible = true; spray.visible = true;
      mat.uniforms.uDrawing.value = Math.floor(t * 8);
      smat.uniforms.uDrawing.value = Math.floor(t * 8);
      smat.uniforms.uAmt.value = smooth(invLerp(CUES.crest - 2.5, CUES.crest, t)) * (1 - smooth(invLerp(CUES.waveBreak, CUES.waveBreak + 0.8, t)));
      if (flashPos) mat.uniforms.uFlashPos.value.copy(flashPos);
      // after the plunge the sheet sinks into the white water
      mat.uniforms.uFade.value = 1 - 0.85 * smooth(invLerp(CUES.waveBreak + 0.3, CUES.waveBreak + 1.35, t));
      if (p.tw === last) return;
      last = p.tw;
      const cx = ctx.camera.position.x;
      const xc = clamp(cx, -400, 400);
      for (let j = 0; j <= NT; j++) {
        const x = xc - X0 + (2 * X0 * j) / NT;
        const zc = crestZ(x, p);
        const H = swellAt(x, zc, p) / Math.max(0.15, 1 - 0.85 * p.brk);   // the lip keeps its height while it plunges
        const taper = smooth(invLerp(X0, X0 * 0.7, Math.abs(x - xc)));
        const phi = curlAt(x, p.tw) * taper;
        const Rs = Math.max(0.05, 0.85 * H * (0.75 + 0.25 * smooth(phi / 2))), Ry = Math.max(0.05, 0.55 * H);
        const half = NV / 2;
        for (let i = 0; i <= NV; i++) {
          // out along the top of the lip to the tip (i = NV/2), back along its underside: a sheet with real thickness
          const inner = i > half;
          const v = inner ? (NV - i) / half : i / half;
          const th = 0.2 * H * Math.pow(1 - v, 0.8) * (inner ? 1 : 0);
          let s, y;
          if (v < 0.2) {      // root: rises out of the face just behind the crest
            const u = v / 0.2;
            s = -16 + 16 * u + th * 0.4; y = H * (0.7 + 0.3 * Math.sin(u * Math.PI * 0.5)) - 0.6 - th;
          } else {
            const u = (v - 0.2) / 0.8, f = phi * u;
            const ox = Rs * Math.sin(f) * (1 + 0.15 * u), oy = H - Ry + Ry * Math.cos(f) - 0.6;
            // the underside runs inside the curve, offset toward its centre
            const cxs = 0, cys = H - Ry - 0.6;
            const dx = ox - cxs, dy = oy - cys, dl = Math.hypot(dx / Rs, dy / Ry) || 1;
            s = ox - (dx / dl / Rs) * th; y = oy - (dy / dl / Ry) * th;
          }
          const k = (j * (NV + 1) + i) * 3;
          pos[k] = x; pos[k + 1] = Math.max(y, -1.5); pos[k + 2] = zc + s;
        }
      }
      geo.attributes.position.needsUpdate = true;
      geo.computeVertexNormals();
      // spray: from the top of the lip, thrown forward and up by the onshore gale, falling away at the end
      const ti = Math.round((NV / 2) * 0.62);
      for (let j = 0; j <= NT; j++) {
        const k0 = (j * (NV + 1) + ti) * 3;
        const x = pos[k0], y0 = pos[k0 + 1], z0 = pos[k0 + 2];
        const zc = crestZ(x, p);
        const L = Math.max(0, y0) * (0.55 + 0.25 * Math.sin(x / 37 + p.tw * 1.3));
        for (let i = 0; i <= NS; i++) {
          const u2 = i / NS, k = (j * (NS + 1) + i) * 3;
          spos[k] = x + Math.sin(x * 0.7) * 0.6 * u2;
          spos[k + 1] = y0 + L * (0.55 * u2 - 0.35 * u2 * u2) + 0.4;
          spos[k + 2] = Math.max(z0, zc) + L * 1.1 * u2;
        }
      }
      sgeo.attributes.position.needsUpdate = true;
    },
  };
}
