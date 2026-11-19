import * as THREE from 'three';
import { COMMON, MRT_OUT, G } from './glsl.js';

// Torn sheets of water (FX): a CPU-deformed ribbon grid (u across, v up) drawn as one cel mass — slate body with pale
// streaks pouring down it, a lace of foam lines under a white torn lip, holes opening as it tears apart (uFade).
// Adapted from BLACKOUT fx-water's wave wall (MIT).

function sheetMaterial() {
  const u = {
    ...G, uDrawing: { value: 0 }, uTear: { value: 60 }, uFade: { value: 0 }, uSeed: { value: 0 }, uFlash: { value: 0 }, uGold: { value: 0 }, uFoamLine: { value: 0.68 }, uHole: { value: new THREE.Vector4(0, 0, 0, 0) },
    uFoam: { value: new THREE.Color('#fbfdff') }, uBody: { value: new THREE.Color('#6f8ea2') }, uDeep: { value: new THREE.Color('#2c4658') }, uShade: { value: new THREE.Color('#4b6a80') },
  };
  const vs = /* glsl */ `
    attribute vec2 aUV;
    varying vec2 vS;
    varying float vDepth;
    varying vec3 vWorld, vN, vNV;
    void main(){
      vec4 w = modelMatrix * vec4(position, 1.0);
      vWorld = w.xyz; vS = aUV;
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
    uniform float uDrawing, uTear, uFade, uSeed, uFlash, uGold, uFoamLine;
    uniform vec4 uHole;
    uniform vec3 uFoam, uBody, uDeep, uShade;
    varying vec2 vS;
    varying float vDepth;
    varying vec3 vWorld, vN, vNV;
    float lace(vec2 p){
      vec2 ip = floor(p), fp = fract(p); float d1 = 8.0, d2 = 8.0;
      for(int y = -1; y <= 1; y++) for(int x = -1; x <= 1; x++){
        vec2 g = vec2(float(x), float(y));
        vec2 o = fract(sin(vec2(dot(ip + g, vec2(127.1, 311.7)), dot(ip + g, vec2(269.5, 183.3)))) * 43758.5453);
        float d = length(g + o - fp);
        if(d < d1){ d2 = d1; d1 = d; } else if(d < d2) d2 = d;
      }
      return d2 - d1;
    }
    void main(){
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1.0); oData = vec4(0.0); return; }
      vec3 N = normalize(vN), NV = normalize(vNV);
      if(!gl_FrontFacing){ N = -N; NV = -NV; }
      float u = vS.x, v = vS.y, sd = uSeed * 13.1, D = uDrawing;
      // torn top: ragged fingers of water, redrawn on threes
      float f1 = u * uTear + 2.4 * vnoise(vec2(u * uTear * 0.25 + sd, D * 0.11));
      float crestE = 0.8 + 0.14 * pow(abs(sin(f1)), 0.5) * (0.5 + 0.9 * vnoise(vec2(u * uTear * 0.2 + 9.0 + sd, 3.0)))
                   + 0.06 * pow(abs(sin(u * uTear * 3.1 + sd)), 0.6);
      if(v > crestE) discard;
      // ragged sides
      float side = min(u, 1.0 - u) * 8.0 + (vnoise(vec2(v * 7.0 + sd, D * 0.2)) - 0.5) * 0.9;
      if(side < 0.15) discard;
      // a hull punching through: a ragged hole round a world point
      if(uHole.w > 0.0){
        float hd = length(vWorld - uHole.xyz) / uHole.w + (vnoise(vWorld.xy * 0.6 + D) - 0.5) * 0.5;
        if(hd < 1.0) discard;
      }
      // tearing apart: holes grow up from the lip and in from the sides as it falls
      float hole = vnoise(vec2(u * uTear * 0.6 + sd, v * 9.0 - D * 0.3)) * 0.7 + vnoise(vec2(u * uTear * 1.7, v * 22.0 + sd)) * 0.3;
      if(hole < uFade * (0.6 + 0.6 * v) - 0.08) discard;
      float flow = vnoise(vec2(u * uTear * 1.2 + sd, v * 3.4 - D * 0.34));
      float flow2 = vnoise(vec2(u * uTear * 3.0 + 11.0, v * 8.5 - D * 0.61));
      float lit = dot(N, normalize(uKeyDir + vec3(0.0, 0.4, 0.0)));
      vec3 col = mix(uShade, uBody, smoothstep(0.02, 0.1, lit + (flow - 0.5) * 0.2));
      col = mix(col, uDeep, step(v, 0.22 + (flow2 - 0.5) * 0.1) * 0.7);
      // pale streaks pouring down the face
      float s1 = vnoise(vec2(u * uTear * 5.0, v * 2.6 - D * 0.42));
      col = mix(col, uBody * 1.6 + vec3(0.12, 0.16, 0.2), step(0.68, s1) * smoothstep(0.1, 0.4, v) * 0.6);
      col = mix(col, uDeep * 0.7, step(s1, 0.25) * 0.5);
      // foam lace under the lip
      float foamLine = uFoamLine + (flow - 0.5) * 0.18;
      float lc = lace(vec2(u * uTear * 2.2 + sd, v * 16.0 - D * 0.3));
      float band = smoothstep(foamLine - 0.3, foamLine - 0.02, v);
      col = mix(col, mix(uBody * 1.7, uFoam, 0.6), step(lc, 0.03 + 0.1 * band) * step(0.05, band) * 0.85);
      if(v > foamLine){
        float sh = vnoise(vec2(u * uTear * 4.0 + 17.0, v * 20.0 - D * 0.46));
        col = mix(uFoam * 1.12, vec3(0.7, 0.8, 0.88), step(0.62, sh + (crestE - v) * 0.5 - 0.05));
      } else if(v > foamLine - 0.05) col = mix(uBody, uFoam, 0.55);
      // white churn at the foot
      if(v < 0.04 + 0.08 * vnoise(vec2(u * uTear * 2.0, D * 0.2))) col = uFoam;
      // lightning turns it to silver, the beam to gold-white
      col = mix(col, col * vec3(1.3, 1.4, 1.6) + vec3(0.12, 0.15, 0.2), uFlash);
      col = mix(col, col * vec3(1.45, 1.32, 1.05) + vec3(0.12, 0.1, 0.05), uGold);
      writeOut(col, 1.0, NV, vDepth, 83.0);
    }
  `;
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: vs, fragmentShader: fs, side: THREE.DoubleSide });
}

// A sheet: NU x NV grid; shape(u, v, out) fills world positions (called once per drawing).
export class Sheet {
  constructor(scene, NU = 48, NV = 14, tear = 60) {
    this.NU = NU; this.NV = NV;
    const g = new THREE.BufferGeometry();
    const n = (NU + 1) * (NV + 1);
    this.pos = new Float32Array(n * 3);
    const uv = new Float32Array(n * 2), idx = [];
    for (let j = 0; j <= NU; j++) for (let i = 0; i <= NV; i++) {
      const k = j * (NV + 1) + i;
      uv[k * 2] = j / NU; uv[k * 2 + 1] = i / NV;
      if (j < NU && i < NV) idx.push(k, k + 1, k + NV + 2, k, k + NV + 2, k + NV + 1);
    }
    g.setIndex(idx);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aUV', new THREE.BufferAttribute(uv, 2));
    this.mesh = new THREE.Mesh(g, sheetMaterial());
    this.mesh.material.uniforms.uTear.value = tear;
    this.mesh.frustumCulled = false; this.mesh.visible = false; this.mesh.userData.noShadow = true;
    scene.add(this.mesh);
    this._o = [0, 0, 0];
  }
  hide() { this.mesh.visible = false; }
  // shape(u, v) -> [x, y, z]
  set(shape, o) {
    const { NU, NV, pos } = this;
    for (let j = 0; j <= NU; j++) for (let i = 0; i <= NV; i++) {
      const p = shape(j / NU, i / NV), k = (j * (NV + 1) + i) * 3;
      pos[k] = p[0]; pos[k + 1] = p[1]; pos[k + 2] = p[2];
    }
    const g = this.mesh.geometry;
    g.attributes.position.needsUpdate = true;
    g.computeVertexNormals();
    const U = this.mesh.material.uniforms;
    U.uDrawing.value = o.drawing; U.uFade.value = o.fade ?? 0; U.uSeed.value = o.seed ?? 0;
    U.uFlash.value = o.flash ?? 0; U.uGold.value = o.gold ?? 0; U.uFoamLine.value = o.foamLine ?? 0.68;
    if (o.hole) U.uHole.value.set(...o.hole); else U.uHole.value.set(0, 0, 0, 0);
    this.mesh.visible = true;
  }
}
