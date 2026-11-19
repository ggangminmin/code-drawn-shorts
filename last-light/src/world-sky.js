import * as THREE from 'three';
import { G, COMMON, MRT_OUT } from './glsl.js';
import { ENV } from './passes-env.js';
import { LIGHTNING, lightningAt } from './layout.js';

// LAST LIGHT sky (Sea department): a low, heavy storm deck seen from below, painted in three hard tones,
// rain curtains hanging off it near the horizon, lightning lighting its underside around each strike,
// and the dawn clearing: the deck tears open (uCover 1 -> 0) on a pale cool sky with a thin peach band in the east.

// Where each lightning strike of layout.LIGHTNING happens (world metres). The first one hits the lighthouse rod.
export const LIGHTNING_POS = [
  [160, 74, -300],        // CUES.bolt: the lantern room's lightning rod
  [-700, 600, -1900],     // 8.6: far over the sea, seen from the kitchen window / wheelhouse
  [420, 600, -2700],      // 20.3: out past the fleet, behind the rising swell
  [-60, 600, -1350],      // 36.8 (s16): behind the cresting swell, backlights its lip
  [-380, 600, -760],      // 45.1: over the race to the mouth
  [-500, 600, -1600],     // 5.3 (s03): ahead of Kestrel's wheelhouse window
  [300, 600, -700],       // 7.2 (s04): behind the headland, so the tower stands black in the kitchen window
  [-200, 600, -2000],     // 23.4 (s11): out over the sea Dad is searching
];
// the strike lighting the world at film time t: { pos, k } (k = layout.lightningAt), or null
export function flashAt(t) {
  let best = null;
  // order-independent: the most recent strike still glowing wins
  let bd = 1e9;
  LIGHTNING.forEach((s, i) => { const d = t - s; if (d >= 0 && d < 0.5 && d < bd && LIGHTNING_POS[i]) { bd = d; best = { pos: LIGHTNING_POS[i], k: lightningAt(t), i }; } });
  return best;
}

export const DECK_H = 760;   // cloud base height (m)

export function stormSkyMaterial() {
  const u = {
    ...G,
    uZenith: { value: new THREE.Color('#05090e') }, uMid: { value: new THREE.Color('#0e1922') },
    uHorizonWarm: { value: new THREE.Color('#2a3a43') }, uHorizonCool: { value: new THREE.Color('#22313b') },
    uCloudLit: { value: new THREE.Color('#566b79') }, uCloudMid: { value: new THREE.Color('#202d38') }, uCloudShade: { value: new THREE.Color('#0a1118') },
    uSkyFlash: { value: new THREE.Color(0, 0, 0) },
    uFlashPos: { value: new THREE.Vector3(0, 600, -1000) }, uFlashK: { value: 0 },
    uCover: { value: 1 }, uStars: { value: 0 }, uSunDisk: { value: 0 },
    uEnvTime: ENV.uEnvTime,
  };
  const vs = /* glsl */ `
    varying vec3 vDir;
    varying float vDepth;
    void main(){
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vDir = normalize(wp.xyz - cameraPosition);
      vec4 mv = viewMatrix * wp;
      vDepth = -mv.z;
      gl_Position = projectionMatrix * mv;
      gl_Position.z = gl_Position.w * 0.99999;
    }
  `;
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    uniform vec3 uZenith, uMid, uHorizonWarm, uHorizonCool, uCloudLit, uCloudMid, uCloudShade, uSkyFlash, uFlashPos;
    uniform float uFlashK, uCover, uStars, uSunDisk, uEnvTime;
    varying vec3 vDir;
    varying float vDepth;
    const float DECK = ${DECK_H.toFixed(1)};
    // the deck: long rolls lying across the wind, heavy bands, drifting toward the island (drawn on threes)
    float deckField(vec2 p, float tt){
      vec2 w = p + vec2(tt * 3.0, tt * 11.0);
      float roll = sin(w.y / 520.0 + fbm2(w / vec2(3800.0, 1500.0)) * 6.0) * 0.5 + 0.5;
      float band = fbm2(w / vec2(3600.0, 950.0) + 3.0);
      float mid = fbm2(w / vec2(1300.0, 520.0) + vec2(7.0, 1.0));
      return band * 0.5 + mid * 0.3 + roll * 0.2;
    }
    // round billows hanging under the deck: (offset in the cell, radius) of the nearest one
    vec3 billow(vec2 p){
      vec2 ip = floor(p), fp = fract(p); vec3 best = vec3(0.0, 0.0, 9.0);
      for(int y = -1; y <= 1; y++) for(int x = -1; x <= 1; x++){
        vec2 gg = vec2(float(x), float(y));
        vec2 o = hash22(ip + gg);
        vec2 v = gg + 0.5 + (o - 0.5) * 0.7 - fp;
        float r = 0.55 + 0.4 * o.x;
        float q = length(v) / r;
        if(q < best.z) best = vec3(-v / r, q);
      }
      return best;
    }
    void main(){
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
      vec3 d = normalize(vDir);
      vec3 s = normalize(uSunDir);
      float el = d.y;
      float tt = floor(uEnvTime * 8.0 + 1e-4) / 8.0;     // drawn on threes
      vec2 hs = normalize(s.xz + 1e-5);
      float sunSide = dot(normalize(d.xz + 1e-5), hs) * 0.5 + 0.5;
      float storm = clamp(uCover, 0.0, 1.0);

      // ---- clear sky behind the deck: dawn gradient, thin warm band on the sun side
      vec3 hor = mix(uHorizonCool, uHorizonWarm, smoothstep(0.7, 1.0, sunSide) * 0.7);
      float h = max(el, 0.0);
      vec3 col = mix(hor, uMid, smoothstep(0.0, 0.22, h));
      col = mix(col, uZenith, smoothstep(0.15, 0.95, h));
      float band = exp(-h / 0.022) * smoothstep(0.4, 1.0, sunSide);
      col = mix(col, uHorizonWarm * 1.04, band * 0.8);
      // sun just over the horizon (dawn only)
      float toSun = dot(d, s);
      col += vec3(1.0, 0.95, 0.88) * (smoothstep(0.99985, 0.9999, toSun) * 1.4 + pow(max(toSun, 0.0), 300.0) * 0.35 + pow(max(toSun, 0.0), 40.0) * 0.08) * uSunDisk;
      // a few last stars at the zenith while the deck tears open (s26 only)
      if(uStars > 0.01 && el > 0.2){
        vec3 sp = d * 260.0; vec3 si = floor(sp); vec3 sf = fract(sp) - 0.5;
        float sh = hash13(si);
        float star = sh > 0.992 ? 1.0 - smoothstep(0.08, 0.3, length(sf)) : 0.0;
        col += vec3(0.85, 0.9, 1.0) * star * 0.7 * uStars * smoothstep(0.2, 0.6, el);
      }

      // ---- the cloud deck, hit from below; a lower, faster layer of torn scud in front of it
      float cover = 0.0;
      vec3 cc = col;
      float flashL = clamp(max(uFlashK, dot(uSkyFlash, vec3(0.333)) * 2.5), 0.0, 1.0);
      vec3 fcol = vec3(0.5, 0.58, 0.66);
      if(el > -0.02){
        float camH = cameraPosition.y;
        float tHit = camH < DECK ? (DECK - camH) / max(el, 0.006) : 1e5;
        vec2 hp = cameraPosition.xz + d.xz * tHit;
        vec2 w = hp + vec2(tt * 3.0, tt * 11.0);
        float f = deckField(hp, tt);
        float thr = mix(0.6, 0.0, storm);
        float fw = max(fwidth(f), 1e-4);
        cover = smoothstep(thr - fw, thr + fw * 1.5, f);
        // near the horizon the deck is a few pixels per kilometre: simplify to a soft average instead of aliasing into dashes
        float alias = smoothstep(0.02, 0.08, fw);
        cover = mix(cover, smoothstep(thr - 0.2, thr + 0.2, f) * (0.5 + 0.5 * storm), alias);
        float thick = f - thr;
        // painted value masses: dark heavy bodies, mid sheets, paler thin sheets
        float m = f + (fbm2(w / 300.0) - 0.5) * 0.12;
        vec3 c0 = uCloudShade, c1 = uCloudMid, c2 = uCloudLit;
        cc = mix(c1, c0, smoothstep(0.55, 0.57, m));
        cc = mix(cc, mix(c1, c2, 0.4), smoothstep(0.42, 0.4, m) * storm);
        // billows on the underside: a soft rhythm inside the heavy bodies
        vec3 b1 = billow(w / vec2(560.0, 300.0) + fbm2(w / 900.0) * 0.8);
        float in1 = 1.0 - smoothstep(0.9, 1.0, b1.z);
        vec2 toF = uFlashPos.xz - hp; float fd = length(toF);
        float near = exp(-fd / 1100.0);
        vec2 Ld = normalize(mix(hs, toF / max(fd, 1.0), clamp(flashL * 2.0 * near, 0.0, 1.0)) + 1e-4);
        float lit1 = in1 * smoothstep(0.35, 0.5, dot(b1.xy, Ld));
        cc = mix(cc, cc * 1.3 + c2 * 0.04, lit1 * 0.55 * smoothstep(0.5, 0.6, m));
        // torn rims glow when the deck thins (dawn light through the gaps)
        float rim = 1.0 - smoothstep(0.0, 0.06, thick);
        cc = mix(cc, mix(c2, hor, 0.25) * 1.12, rim * (1.0 - storm * 0.75) * 0.85);
        // lightning lights the undersides round the strike: two hard tones following the deck's own shapes
        float pool = flashL * (near * 1.3 + 0.12) * (0.5 + 0.9 * smoothstep(0.35, 0.65, m + lit1 * 0.1));
        cc = mix(cc, fcol * 0.6, smoothstep(0.22, 0.26, pool));
        cc = mix(cc, fcol, smoothstep(0.55, 0.6, pool + lit1 * 0.12));
        // distance: the deck sinks into the horizon haze
        float far = max(1.0 - exp(-tHit / 6000.0), alias);
        cc = mix(cc, mix(hor, c1, 0.35), clamp(far * 0.9, 0.0, 1.0));
        cover *= smoothstep(0.008, 0.04, el);
        cover = max(cover, storm * smoothstep(0.03, -0.01, el));
        // scud: torn dark rags racing under the deck (parallax against it)
        const float SC = 330.0;
        if(camH < SC - 20.0 && storm > 0.05 && el > 0.0){
          float t2 = (SC - camH) / max(el, 0.006);
          vec2 sp = cameraPosition.xz + d.xz * t2 + vec2(tt * 6.0, tt * 26.0);
          float sf = fbm2(sp / vec2(1100.0, 420.0) + 9.0) + (vnoise(sp / 60.0) - 0.5) * 0.14 + (vnoise(sp / 17.0) - 0.5) * 0.06;
          float rag = smoothstep(0.6, 0.615, sf) * storm * (1.0 - smoothstep(3500.0, 8000.0, t2));
          vec3 sc = mix(c0 * 0.8, fcol * 0.7, smoothstep(0.2, 0.26, flashL * (exp(-length(uFlashPos.xz - sp) / 900.0) * 1.3 + 0.12)) * 0.7);
          sc = mix(sc, c1 * 0.9, smoothstep(0.66, 0.68, sf) * 0.0);
          cc = mix(cc, mix(sc, hor, clamp((1.0 - exp(-t2 / 4500.0)) * 0.85, 0.0, 1.0)), rag);
          cover = max(cover, rag);
        }
      }
      col = mix(col, cc, cover);

      // ---- horizon: a pale band of distant air under the deck, cut by dark rain shafts
      if(storm > 0.01 && el > -0.05){
        float az = atan(d.x, -d.z);
        float gap = smoothstep(0.06, 0.0, el) * storm;
        col = mix(col, mix(hor * 1.3, uCloudLit, 0.25), gap * 0.7);
        float shaftN = fbm2(vec2(az * 7.0 + tt * 0.03, 1.5));
        float fine = vnoise(vec2(az * 220.0 + el * 40.0, el * 4.0 - tt * 1.2));
        float shaft = smoothstep(0.5, 0.55, shaftN + (fine - 0.5) * 0.08) * smoothstep(0.14, 0.0, el) * smoothstep(-0.03, 0.005, el);
        col = mix(col, mix(uCloudMid, hor, 0.4) * (0.9 + 0.2 * fine), shaft * 0.75 * storm);
      }
      // ---- global lightning flash: the air goes a shade lighter; the colour stays the sky's own
      float flashG = clamp(max(uFlashK, dot(uSkyFlash, vec3(0.333)) * 2.5), 0.0, 1.0);
      col += vec3(0.12, 0.15, 0.19) * flashG * (0.35 + 0.65 * smoothstep(0.3, 0.0, el));
      writeOut(col, 1.0, vec3(0.0, 0.0, 1.0), 9000.0, 0.0);
    }
  `;
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: vs, fragmentShader: fs, side: THREE.BackSide, depthWrite: false });
}
