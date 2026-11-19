import * as THREE from 'three';

// The storm air of LAST LIGHT, one full-screen overlay pass (FX department):
//   - the lighthouse beams: two cones out of the lens, integrated along each view ray up to the scene depth, then
//     posterised into anime bands (soft outer air, a solid pale-gold blade, a white-hot core), long falloff over the sea
//   - rain: screen-space streak layers slanted by the wind, redrawn on threes, hidden behind near geometry; dim in the
//     dark, white in a lightning flash, gold-white wherever they cross a beam (the image of the film)
//   - wind sheets: broad bands of denser rain and a faint grey veil sweeping across the frame
// Pure in uniforms; createAir().set(...) fills them from state.t every frame.

const FS_VS = /* glsl */ `void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const FS = /* glsl */ `
uniform sampler2D uSceneData;
uniform vec2 uRes;
uniform mat4 uCam;
uniform vec3 uCamPos;
uniform vec2 uTan;
uniform float uDrawing, uTime;
// beams: xyz origin, w power ; xyz dir, w length ; x r0, y spread, z core width, w falloff (m)
uniform vec4 uB0a, uB0b, uB0c;
uniform vec4 uB1a, uB1b, uB1c;
uniform vec2 uX0;          // where each beam leaves the lantern glass (m from the focus)
uniform float uRainLayer0;  // first rain layer drawn (lamp room: only the rain outside the glass)
uniform vec3 uBeamCol;
// rain: x amount, y screen angle (rad), z speed, w flash 0..1
uniform vec4 uRain;
uniform vec3 uRainCol;
uniform float uSheets, uVeil;
uniform vec2 uWind2;     // screen direction the sheets travel
out vec4 oColor;

float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.-2.*f);
  return mix(mix(h12(i), h12(i+vec2(1,0)), u.x), mix(h12(i+vec2(0,1)), h12(i+vec2(1,1)), u.x), u.y); }
float vn3(vec3 p){ return mix(vn(p.xy + floor(p.z) * 17.13), vn(p.xy + (floor(p.z) + 1.0) * 17.13), smoothstep(0.0, 1.0, fract(p.z))); }

// integrate one beam along the ray o + d s, s in [0, sMax]; returns (body, core, mean distance)
vec3 beam(vec3 o, vec3 d, float sMax, vec4 A, vec4 B, vec4 C, float x0){
  if(A.w <= 0.001) return vec3(0.0);
  vec3 u = B.xyz;
  float L = B.w, r0 = C.x, spr = C.y;
  vec3 w0 = o - A.xyz;
  float b = dot(d, u), dd = dot(d, w0), e = dot(u, w0);
  float den = max(1.0 - b * b, 1e-4);
  float sc = (b * e - dd) / den, xc = (e - b * dd) / den;
  float xcc = clamp(xc, 0.0, L); float Rc = r0 + spr * xcc / (1.0 + xcc / 700.0);
  float hw = Rc * 1.15 / sqrt(den);
  float s0 = max(0.0, sc - hw), s1 = min(sMax, sc + hw);
  // keep x = e + b s inside [x0, L]
  if(abs(b) > 1e-4){
    float sA = (x0 - e) / b, sB = (L - e) / b;
    float lo = min(sA, sB), hi = max(sA, sB);
    s0 = max(s0, lo); s1 = min(s1, hi);
  } else if(e < x0 || e > L) return vec3(0.0);
  s1 = min(s1, s0 + 4000.0);
  if(s1 <= s0) return vec3(0.0);
  const int N = 44;
  float ds = (s1 - s0) / float(N);
  float body = 0.0, core = 0.0, dsum = 0.0, wsum = 0.0;
  vec3 side = normalize(cross(u, abs(u.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 up2 = cross(side, u);
  for(int i = 0; i < N; i++){
    float s = s0 + (float(i) + 0.5) * ds;
    vec3 P = o + d * s - A.xyz;
    float x = dot(P, u);
    vec3 rv = P - u * x;
    float R = r0 + spr * x / (1.0 + x / 700.0);
    float rn = length(rv) / R;
    if(rn > 1.0) continue;
    // long drawn streaks running down the blade (angle around the axis), slowly crawling on threes
    float an = atan(dot(rv, up2), dot(rv, side));
    float st = vn(vec2(an * 2.6 + 3.0, x * 0.0021 - uDrawing * 0.035));
    float st2 = vn(vec2(an * 7.0 + 11.0, x * 0.006 + uDrawing * 0.02));
    float streak = 0.72 + 0.42 * smoothstep(0.42, 0.62, st) - 0.22 * smoothstep(0.55, 0.75, st2);
    float fall = exp(-x / C.w) * (0.55 + 0.45 * smoothstep(0.0, 6.0, x)) * smoothstep(L, L * 0.4, x);
    // gusts of heavier rain drift across the blade: it brightens and dims in long patches as it goes out over the sea
    fall *= 0.78 + 0.44 * smoothstep(0.3, 0.7, vn(vec2(x * 0.006 - uDrawing * 0.11, an * 0.3 + 5.0)));
    // volumetric falloff toward the edge of the cone; the core band rides inside it
    float prof = pow(max(1.0 - rn * rn, 0.0), 1.3);
    // no capsule: the blade thins out as it reaches whatever stops it (sea, cliff), so it sinks into the far rain
    float occ = sMax > 8500.0 ? 1.0 : smoothstep(sMax, sMax - max(30.0, sMax * 0.4), s);
    // seen far off through the rain the blade goes thin and pale: it sinks into the weather, never ends on a cap
    float airK = mix(0.45, 1.0, exp(-max(s - 250.0, 0.0) / 650.0));
    occ *= airK;
    float k = prof * fall * streak * occ;
    body += k * ds;
    core += smoothstep(C.z, C.z * 0.6, rn) * fall * occ * (0.85 + 0.3 * streak) * ds;
    dsum += s * k * ds; wsum += k * ds;
  }
  float Rn = max(Rc, 0.5);
  return vec3(body / (2.0 * Rn), core / (2.0 * Rn * C.z), wsum > 1e-5 ? dsum / wsum : 0.0) * A.w;
}

// screen-space rain: thin slanted streaks in cells, one layer
float rainLayer(vec2 fc, float ang, float cell, float len, float speed, float dens, float seed, float thick){
  vec2 dir = vec2(sin(ang), -cos(ang));            // fall direction on screen
  vec2 q = vec2(dot(fc, vec2(-dir.y, dir.x)), dot(fc, dir));
  q.y -= uDrawing * speed;                         // falls on threes
  vec2 c = vec2(cell, cell * len);
  vec2 id = floor(q / c);
  vec2 f = q / c - id;
  float h = h12(id + seed);
  if(h > dens) return 0.0;
  float x0 = 0.15 + 0.7 * h12(id + seed + 7.1);
  float y0 = 0.6 * h12(id + seed + 3.3);
  float ln = 0.25 + 0.4 * h12(id + seed + 9.7);
  float px = abs(f.x - x0) * c.x;
  float on = smoothstep(thick + 0.6, thick - 0.4, px) * step(y0, f.y) * step(f.y, y0 + ln);
  // tapered ends
  float v = (f.y - y0) / ln;
  return on * (0.45 + 0.55 * sin(3.14159 * clamp(v, 0.0, 1.0)));
}

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 ndc = uv * 2.0 - 1.0;
  vec3 rv = vec3(ndc * uTan, -1.0);
  float cosv = 1.0 / length(rv);
  vec3 d = normalize(mat3(uCam) * rv);
  float sd = texture(uSceneData, uv).b;
  bool open = sd < 0.01 || sd > 8000.0;
  float sMax = open ? 9000.0 : sd / cosv;
  vec2 fc = gl_FragCoord.xy * (1080.0 / uRes.y);   // 1080p pixel units

  vec3 b0 = beam(uCamPos, d, sMax, uB0a, uB0b, uB0c, uX0.x);
  vec3 b1 = beam(uCamPos, d, sMax, uB1a, uB1b, uB1c, uX0.y);
  float I = b0.x + b1.x * 0.8, Ic = b0.y + b1.y * 0.5;
  // anime bands: a breath of lit air, the solid blade in two tones, the white heart near the lens
  // outer band: soft glowing air (continuous) plus one hard step, the core band: a bright solid blade, the heart: white
  float air = smoothstep(0.0, 0.4, I);
  float outer = smoothstep(0.16, 0.21, I);
  float blade = smoothstep(0.45, 0.55, Ic);
  float heart = smoothstep(0.85, 1.0, Ic);
  vec3 bc = uBeamCol;
  vec3 rgb = bc * (0.3 * air + 0.3 * outer + 0.5 * blade) + vec3(1.0, 0.97, 0.9) * heart * 0.5;
  float a = clamp(0.1 * air + 0.1 * outer + 0.14 * blade + 0.1 * heart, 0.0, 0.85);
  float beamLit = clamp(smoothstep(0.03, 0.2, I) * 0.8 + blade, 0.0, 1.0);

  // rain
  float amt = uRain.x;
  if(amt > 0.001){
    float ang = uRain.y;
    // wind sheets: broad soft bands of denser rain travelling across the frame
    vec2 wq = fc / 1080.0;
    float sheet = vn(vec2(dot(wq, vec2(uWind2.y, -uWind2.x)) * 2.2, dot(wq, uWind2) * 0.7 - uDrawing * 0.09)) ;
    sheet = mix(1.0, 0.45 + 1.1 * smoothstep(0.35, 0.75, sheet), uSheets);
    // layers near to far: big fast streaks in front, fine dense ones behind; each hides behind closer geometry
    float r = 0.0, rb = 0.0;
    float dep[4]; dep[0] = 2.5; dep[1] = 7.0; dep[2] = 22.0; dep[3] = 70.0;
    for(int l = 0; l < 4; l++){
      float fl = float(l);
      if(fl < uRainLayer0 - 0.5) continue;
      float vis = (open || sd > dep[l]) ? 1.0 : 0.0;
      if(vis < 0.5) continue;
      float cell = mix(26.0, 7.0, fl / 3.0);
      float k = rainLayer(fc, ang + (fl - 1.5) * 0.025, cell, mix(5.5, 4.0, fl / 3.0), mix(260.0, 95.0, fl / 3.0), clamp(amt * sheet * mix(0.32, 0.6, fl / 3.0), 0.0, 0.9), fl * 13.7, mix(1.25, 0.55, fl / 3.0));
      float w = mix(0.55, 0.32, fl / 3.0);
      r += k * w;
      // a streak is lit by the beam only if the beam passes at about its depth or beyond: use the beam's mean distance
      float bd = max(b0.z, b1.z);
      rb += k * (bd > 0.0 && dep[l] < bd + 40.0 ? 1.0 : 0.35) * mix(1.0, 0.7, fl / 3.0);
    }
    vec3 rc = mix(uRainCol, vec3(0.62, 0.7, 0.82), uRain.w);
    float ra = r * (0.5 + 0.2 * uRain.w) * amt;
    rgb += rc * ra;
    a += ra * 0.35;
    // the beam lights every drop it crosses: gold-white streaks inside the blade
    float lit = rb * beamLit * min(amt * 1.6, 1.0);
    rgb += vec3(1.25, 1.12, 0.85) * lit * 0.9;
    a += lit * 0.15;
    // the grey veil of driven rain
    float veil = uVeil * amt * (0.4 + 0.6 * sheet) * (open ? 1.0 : smoothstep(5.0, 60.0, sd));
    rgb += mix(uRainCol * 0.55, vec3(0.45, 0.52, 0.62), uRain.w) * veil * (1.0 - 0.5 * uRain.w);
    a += veil;
  }
  a = clamp(a, 0.0, 0.92);
  if(a < 0.002 && dot(rgb, rgb) < 1e-6) discard;
  oColor = vec4(rgb, a);
}
`;

export function createAir(ctx) {
  const { THREE: T, overlay, engine, camera } = ctx;
  const u = {
    uSceneData: { value: null }, uRes: { value: new T.Vector2(engine.IW, engine.IH) },
    uCam: { value: new T.Matrix4() }, uCamPos: { value: new T.Vector3() }, uTan: { value: new T.Vector2(1, 1) },
    uDrawing: { value: 0 }, uTime: { value: 0 },
    uB0a: { value: new T.Vector4() }, uB0b: { value: new T.Vector4() }, uB0c: { value: new T.Vector4() },
    uB1a: { value: new T.Vector4() }, uB1b: { value: new T.Vector4() }, uB1c: { value: new T.Vector4() },
    uBeamCol: { value: new T.Color(1.0, 0.9, 0.68) },
    uRain: { value: new T.Vector4(0, 0.2, 200, 0) }, uRainCol: { value: new T.Color(0.42, 0.5, 0.6) },
    uSheets: { value: 1 }, uVeil: { value: 0.05 }, uWind2: { value: new T.Vector2(1, 0) },
    uX0: { value: new T.Vector2(3.3, 3.3) }, uRainLayer0: { value: 0 },
  };
  const m = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: FS_VS, fragmentShader: FS, transparent: true, depthTest: false, depthWrite: false });
  m.blending = THREE.CustomBlending; m.blendEquation = THREE.AddEquation; m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneMinusSrcAlphaFactor;
  m.blendSrcAlpha = THREE.OneFactor; m.blendDstAlpha = THREE.OneMinusSrcAlphaFactor; m.premultipliedAlpha = true;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m);
  mesh.frustumCulled = false; mesh.renderOrder = 1;
  overlay.add(mesh);

  const v = new THREE.Vector3(), w = new THREE.Vector3();
  return {
    mesh, u,
    // beams: [{ a:[x,y,z], dir:[x,y,z], power, len, r0, spread, core, falloff }] (max 2)
    // rain: { amount, flash, sheets, veil, wind:[x,y,z] (world fall direction incl. wind) }
    set({ drawing, t, beams = [], rain = {} }) {
      u.uDrawing.value = drawing; u.uTime.value = t;
      u.uCam.value.copy(camera.matrixWorld); u.uCamPos.value.copy(camera.position);
      const th = Math.tan((camera.fov * Math.PI) / 360);
      u.uTan.value.set(th * camera.aspect, th);
      const slots = [[u.uB0a, u.uB0b, u.uB0c], [u.uB1a, u.uB1b, u.uB1c]];
      for (let i = 0; i < 2; i++) {
        const b = beams[i], [A, B, C] = slots[i];
        if (!b || !(b.power > 0.001)) { A.value.w = 0; continue; }
        A.value.set(b.a[0], b.a[1], b.a[2], b.power);
        B.value.set(b.dir[0], b.dir[1], b.dir[2], b.len ?? 2600);
        C.value.set(b.r0 ?? 1.1, b.spread ?? 0.034, b.core ?? 0.32, b.falloff ?? 1500);
        if (i === 0) u.uX0.value.x = b.x0 ?? 3.3; else u.uX0.value.y = b.x0 ?? 3.3;
      }
      // rain falls along the wind; its slant on screen is the projection of that direction near the view centre
      const amt = rain.amount ?? 0;
      u.uRain.value.x = amt;
      u.uRain.value.w = rain.flash ?? 0;
      u.uSheets.value = rain.sheets ?? 1;
      u.uVeil.value = rain.veil ?? 0.05;
      u.uRainLayer0.value = rain.layer0 ?? 0;
      if (amt > 0) {
        const F = rain.wind ?? [0.35, -1, 0.1];
        const fwd = w.set(0, 0, -1).applyQuaternion(camera.quaternion);
        const p0 = v.copy(camera.position).addScaledVector(fwd, 8);
        const s0 = p0.clone().project(camera);
        const s1 = p0.add(new THREE.Vector3(...F).normalize()).project(camera);
        let dx = (s1.x - s0.x) * camera.aspect, dy = s1.y - s0.y;
        if (Math.hypot(dx, dy) < 1e-4) { dx = 0; dy = -1; }
        // looking straight down or up, rain becomes radial; keep a gentle slant instead of spinning
        u.uRain.value.y = Math.atan2(dx, -dy);
        if (dy > 0) u.uRain.value.y = Math.atan2(-dx, dy);   // never let it fall upward on screen
        u.uRain.value.z = rain.speed ?? 1;
        const wl = Math.hypot(dx, dy) || 1;
        u.uWind2.value.set(dx / wl, dy / wl);
      }
      mesh.visible = amt > 0.001 || beams.some((b) => b && b.power > 0.001);
    },
  };
}
