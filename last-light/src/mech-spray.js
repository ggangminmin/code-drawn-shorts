import * as THREE from 'three';
import { G, COMMON, MRT_OUT, VERT_STD } from './glsl.js';
import { ML } from './mech-mat.js';
import { onThrees, clamp } from './util.js';

// Bow spray: two drawn sheets of white water peeling off the stem, sized by speed and the bow's plunge. FX timing (on threes).
function sprayMaterial() {
  const u = { ...G, uK: { value: 0 }, uSeed: { value: 0 }, uFlash: ML.uFlash, uLampC: ML.uLampC, uBoatL: ML.uBoatL };
  const vs = `${VERT_STD}
    varying vec2 vS;
    void main(){ vS = uv; stdVertex(position, normal); }`;
  const fs = `${COMMON} ${MRT_OUT}
    uniform float uK, uSeed, uFlash;
    varying vec3 vWorld, vNormalW, vNormalV; varying float vDepth; varying vec2 vUv; varying vec2 vS;
    void main(){
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
      float s = vS.x, w = vS.y;     // s along the sheet (0 stem .. 1 tip), w across (0 water .. 1 lip)
      float tt = floor(uDrawTime * 8.0) + uSeed;
      // ragged lip: big lobes plus small teeth, drawn on threes
      float lobes = vnoise(vec2(s * 5.0 - tt * 0.9, tt * 0.37)) * 0.55 + vnoise(vec2(s * 17.0 + tt * 1.3, 2.0)) * 0.2;
      float top = uK * (1.0 - s * 0.55) * (0.55 + lobes);
      if(w > top) discard;
      if(s > uK * 0.95 + 0.08) discard;
      // the far end breaks into separate drops
      vec2 cell = vec2(s * 26.0, w * 9.0);
      vec2 ci = floor(cell), cf = fract(cell) - 0.5;
      float drop = length(cf) - 0.18 - 0.2 * hash12(ci + tt);
      float breakup = smoothstep(0.45, 0.9, s / max(uK, 0.05)) + smoothstep(0.75, 1.0, w / max(top, 0.01)) * 0.6;
      if(breakup > 0.35 && drop > 0.0) discard;
      vec3 N = normalize(vNormalW), NV = normalize(vNormalV);
      if(!gl_FrontFacing){ N = -N; NV = -NV; }
      float lit = smoothstep(-0.05, 0.05, dot(N, uKeyDir));
      // translucent sea-green body, a white foaming lip, white drops
      float lipK = smoothstep(0.62, 0.7, w / max(top, 0.01)) + step(0.35, breakup);
      vec3 body = mix(vec3(0.16, 0.26, 0.3), vec3(0.3, 0.42, 0.46), lit);
      vec3 foam = mix(vec3(0.5, 0.6, 0.66), vec3(0.88, 0.93, 0.95), lit);
      vec3 col = mix(body, foam, clamp(lipK, 0.0, 1.0));
      col = mix(col, foam, step(0.72, vnoise(vec2(s * 14.0 - tt, w * 5.0))) * 0.6);
      col += vec3(0.9, 0.95, 1.0) * uFlash * 0.8;
      col += warLight(vec3(0.9), vWorld, N);
      writeOut(col, 1.0, NV, vDepth, 38.0);
    }`;
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: vs, fragmentShader: fs, side: THREE.DoubleSide });
}

export function buildSpray(i, B) {
  const H = B.H, L = B.b.L;
  const pos = [], uv = [], ns = 14, nw = 6;
  const z0 = H.zOf(0.93), y0 = 0.3;
  for (const side of [1, -1]) {
    const P = (s, w) => {
      // sheet leaves the stem low, flies outward and up, then falls back aft
      const zz = z0 - s * L * 0.42;
      const out = side * (0.5 + s * 2.4 + w * 0.9 * s + w * 0.2);
      const yy = y0 + w * (0.7 + 1.3 * Math.sin(Math.PI * Math.min(1, s * 1.15))) * (1 - s * 0.3);
      return [out, yy, zz];
    };
    for (let a = 0; a < ns; a++) for (let b = 0; b < nw; b++) {
      const s0 = a / ns, s1 = (a + 1) / ns, w0 = b / nw, w1 = (b + 1) / nw;
      const q = [[s0, w0], [s1, w0], [s1, w1], [s0, w0], [s1, w1], [s0, w1]];
      for (const [s, w] of q) { pos.push(...P(s, w)); uv.push(s, w); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  const m = sprayMaterial();
  m.uniforms.uSeed.value = i * 13.7;
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.name = 'mech:spray' + i;
  return {
    mesh,
    update(t, speed, pitch) {
      // speed in m/s (the run is fast); the bow plunging into a sea (pitch < 0) throws more
      const k = clamp(speed / 30, 0, 1) * 0.8 + clamp(-pitch * 3, 0, 0.5);
      m.uniforms.uK.value = clamp(k, 0, 1);
      mesh.visible = k > 0.05;
      void onThrees;
    },
  };
}

// Waterline foam: a ragged white skirt laid on the drawn sea around each hull (rebuilt every frame from Sea's heightAt),
// so the hull reads as sitting IN the water. Wider at the bow and with speed. Drawn on threes.
function foamMaterial() {
  const u = { ...G, uSeed: { value: 0 }, uFlash: ML.uFlash };
  const vs = `${VERT_STD}
    varying vec2 vS;
    void main(){ vS = uv; stdVertex(position, normal); }`;
  const fs = `${COMMON} ${MRT_OUT}
    uniform float uSeed, uFlash;
    varying vec3 vWorld, vNormalW, vNormalV; varying float vDepth; varying vec2 vUv; varying vec2 vS;
    void main(){
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
      float a = vS.x, w = vS.y;     // a around the hull (m), w 0 at the hull .. 1 at the outer edge
      float tt = floor(uDrawTime * 8.0) + uSeed;
      float n = vnoise(vec2(a * 1.7 + tt * 0.6, tt * 0.31)) * 0.6 + vnoise(vec2(a * 6.0 - tt, 3.0)) * 0.3;
      if(w > 0.35 + 0.65 * n) discard;
      // lace holes in the outer half
      float lace = vnoise(vec2(a * 4.0 + tt * 0.4, w * 5.0 - tt * 0.2));
      if(w > 0.25 && lace > 0.68) discard;
      vec3 N = normalize(vNormalW), NV = normalize(vNormalV);
      if(!gl_FrontFacing){ N = -N; NV = -NV; }
      float lit = smoothstep(-0.05, 0.05, dot(N, uKeyDir));
      vec3 col = mix(vec3(0.5, 0.6, 0.66), vec3(0.85, 0.9, 0.93), lit);
      col = mix(col, col * 0.78, smoothstep(0.5, 0.9, w));
      col += vec3(0.8, 0.85, 0.95) * uFlash * 0.6;
      col += warLight(vec3(0.85), vWorld, N);
      writeOut(col, 1.0, NV, vDepth, 37.0);
    }`;
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: vs, fragmentShader: fs, side: THREE.DoubleSide });
}

export function buildFoam(i, B, scene) {
  const H = B.H, M = 28, pts = [];
  // outline around the hull at the waterline, starboard stern -> bow -> port stern
  for (let j = 0; j <= M; j++) { const u = 0.02 + (j / M) * 0.96; pts.push([-H.half(u) * 1.0, H.zOf(u), -1]); }
  for (let j = M; j >= 0; j--) { const u = 0.02 + (j / M) * 0.96; pts.push([H.half(u) * 1.0, H.zOf(u), 1]); }
  const n = pts.length;
  const pos = new Float32Array(n * 2 * 3), uv = new Float32Array(n * 2 * 2), idx = [];
  let acc = 0;
  for (let j = 0; j < n; j++) {
    if (j) acc += Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]);
    uv.set([acc, 0, acc, 1], j * 4);
    if (j < n - 1) { const a = j * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, c, b, b, c, d); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  const m = foamMaterial(); m.uniforms.uSeed.value = i * 7.1;
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.name = 'mech:foam' + i;
  scene.add(mesh);
  const v = new THREE.Vector3(), o = new THREE.Vector3();
  return {
    mesh,
    update(t, speed, heightAt, near) {
      mesh.visible = near;
      if (!near) return;
      B.body.updateMatrixWorld(true);
      for (let j = 0; j < n; j++) {
        const [x, z, side] = pts[j];
        const u = (z / B.b.L) + 0.5;
        v.set(x, 0, z).applyMatrix4(B.body.matrixWorld);
        // outward: across the hull, swept back at the bow
        const bowK = Math.max(0, (u - 0.6) / 0.4);
        o.set(side * (0.9 + 0.6 * bowK), 0, -0.3 - bowK * 0.4).normalize().transformDirection(B.root.matrixWorld);
        const w = (0.55 + 0.9 * bowK) * (0.7 + Math.min(1.2, speed / 18));
        const h0 = heightAt(v.x, v.z, t);
        pos.set([v.x, h0 + 0.06, v.z], j * 6);
        const ox = v.x + o.x * w, oz = v.z + o.z * w;
        pos.set([ox, heightAt(ox, oz, t) + 0.05, oz], j * 6 + 3);
      }
      g.attributes.position.needsUpdate = true;
      g.computeVertexNormals();
    },
  };
}
