import * as THREE from 'three';

// Lantern glows (overlay pass): a warm drawn point of light with a soft halo for each boat lantern, sized in pixels so the
// six lanterns still read from the high hook shot (s01) and the harbour view (s15). Hidden behind anything nearer.
export function buildGlows(ctx, n) {
  const pos = new Float32Array(n * 3), k = new Float32Array(n);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aK', new THREE.BufferAttribute(k, 1));
  const m = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: { uSceneData: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uProj: { value: 500 }, uSize: { value: 0.7 }, uMinPx: { value: 3 }, uDim: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float aK;
      uniform float uProj, uSize, uMinPx;
      varying float vK, vDepth, vPx;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDepth = -mv.z; vK = aK;
        float px = uSize * uProj / max(vDepth, 0.1);
        vPx = px;
        gl_PointSize = clamp(px * 2.0 * (1.0 + 0.25 * aK), uMinPx * 30.0, 160.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uSceneData;
      uniform vec2 uRes;
      uniform float uMinPx, uDim;
      varying float vK, vDepth, vPx;
      out vec4 oColor;
      void main(){
        if(vK < 0.01) discard;
        float sceneD = texture(uSceneData, gl_FragCoord.xy / uRes).b;
        if(sceneD > 0.01 && sceneD < vDepth - 1.5) discard;
        vec2 q = gl_PointCoord * 2.0 - 1.0;
        float d = length(q);
        float far = 1.0 - smoothstep(4.0, 14.0, vPx);          // far lanterns: a crisp star of light; near: only a soft halo
        float core = (1.0 - smoothstep(0.09, 0.15, d)) * far;
        float halo = exp(-d * d * 7.0) * 0.35 * (1.0 - far) + exp(-d * d * 18.0) * 0.9 * far + exp(-d * d * 5.0) * 0.3 * far;
        float rays = far * (1.0 - smoothstep(0.0, 0.03, min(abs(q.x), abs(q.y)))) * (1.0 - smoothstep(0.1, 0.7, d)) * 0.7;
        vec3 c = vec3(1.7, 1.15, 0.6) * (halo + rays) + vec3(2.2, 1.9, 1.4) * core;
        oColor = vec4(c * vK * uDim, 1.0);
      }`,
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false; pts.name = 'mech:lanternGlows';
  ctx.overlay.add(pts);
  return {
    set(i, p, kk) { pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z; k[i] = kk; },
    update(cam, engine) {
      g.attributes.position.needsUpdate = true; g.attributes.aK.needsUpdate = true;
      const S = engine ? engine.S : 1, IH = engine ? engine.IH : 1080;
      m.uniforms.uProj.value = IH / (2 * Math.tan((cam.fov * Math.PI) / 360));
      m.uniforms.uMinPx.value = S;
    },
  };
}
