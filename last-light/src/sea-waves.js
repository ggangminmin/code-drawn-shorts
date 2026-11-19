// LAST LIGHT sea (Sea department): the one wave function, written twice from the same numbers —
// in JS for heightAt/normalAt/foamAt (boats query it every frame) and as generated GLSL for the rendered surface.
// The rendered grid is a polar mesh centred under the camera; waves too short for the local grid spacing are faded
// out, and heightAt applies the very same fade (from the camera position), so a boat sits exactly on the drawn water.
import { CUES } from './shots.js';
import { swellFront, swellHeight, boatPath, storm } from './layout.js';
import { smooth, invLerp, clamp, onTwos, easeOut } from './util.js';

export const GRAV = 9.81;
// [wavelength m, amplitude m, direction (rad from +Z toward +X: the storm runs toward the island), crest sharpness]
const WDEF = [
  [240, 2.7, 0.1, 1.7],
  [158, 1.6, -0.2, 1.9],
  [104, 1.0, 0.3, 2.1],
  [64, 0.62, -0.08, 2.3],
  [40, 0.38, 0.5, 2.5],
  [25, 0.22, -0.42, 2.6],
  [15.5, 0.13, 0.2, 2.8],
];
// shading-only ripples (fragment normals), [wavelength, slope amplitude, direction]
export const RIPPLES = [[9.1, 0.07, 0.9], [6.2, 0.06, -0.4], [4.1, 0.05, 0.15], [2.6, 0.04, -1.1], [1.7, 0.03, 0.6]];

function meanOf(s) { let m = 0; const N = 512; for (let i = 0; i < N; i++) m += Math.pow(0.5 + 0.5 * Math.sin((i / N) * Math.PI * 2), s); return m / N; }
export const WAVES = WDEF.map(([L, A, ang, s], i) => {
  const k = (2 * Math.PI) / L;
  return { L, A, s, kx: k * Math.sin(ang), kz: k * Math.cos(ang), w: Math.sqrt(GRAV * k), ph: (i * 2.399 + 0.7) % (Math.PI * 2), mean: meanOf(s) };
});
export const AMP_SUM = WAVES.reduce((a, w) => a + w.A, 0);

// polar grid: ring radius r(j) = R0 (exp(j C) - 1), NA spokes
export const GRID = { NA: 512, NR: 300, R0: 2.0, RMAX: 8800 };
GRID.C = Math.log(GRID.RMAX / GRID.R0 + 1) / GRID.NR;
export function spacingAt(r) { return Math.max(GRID.C * (r + GRID.R0), (2 * Math.PI * r) / GRID.NA); }
const fadeW = (L, sp) => 1 - smooth(invLerp(L / 8, L / 4, sp));

// the harbour: calm inside the reef line and the basin
export function calmAt(x, z) {
  const inside = smooth(invLerp(-262, -195, z)) * (1 - smooth(invLerp(240, 330, Math.abs(x))));
  return 1 - 0.86 * inside;
}

// ---------------------------------------------------------------- the great swell, as plain numbers per drawing
// Lead's swellHeight(t) rises with a slow smoothstep (1.5 m at the end of s10). The film needs "a vast slope of black water"
// in s10, so the drawn swell also takes an early rise; it is never lower than swellHeight(t).
// the lead's swell clock (layout.swellHeight) now rises fast enough for s10; no private override any more
export const swellH = (t) => swellHeight(t);
export function seaParams(t) {
  const tw = onTwos(t);
  const F = swellFront(tw), H = swellH(tw);
  const prog = smooth(invLerp(CUES.swellRise, CUES.crest, tw));
  const Lf = 720 + (30 - 720) * Math.pow(prog, 0.45);           // early: a vast gentle slope reaching the fleet; then it steepens as it shoals
  const Lb = 520 + (260 - 520) * prog;
  const brk = smooth(invLerp(CUES.waveBreak - 0.12, CUES.waveBreak + 1.3, tw));
  // the broken wave becomes a white bore that runs into the basin, carrying Kestrel on its back
  let zb = -262, xb = 0, Hb = 0, wb = 60;
  if (tw > CUES.waveBreak) {
    const k0 = boatPath(0, Math.min(tw, CUES.dadIn + 3.2));
    zb = Math.max(-262, k0.z - 15) + Math.max(0, tw - CUES.dadIn - 3.2) * 9;
    xb = k0.x * 0.7;
    Hb = 5.2 * smooth(invLerp(CUES.waveBreak, CUES.waveBreak + 0.5, tw)) * (1 - smooth(invLerp(CUES.dadIn + 1.6, CUES.dadIn + 6.5, tw)));
    wb = 70 + (tw - CUES.waveBreak) * 45;
  }
  const cap = smooth(invLerp(CUES.crest - 1.5, CUES.crest + 2.5, tw));   // foam cap spilling on the crest
  const white = brk * (1 - smooth(invLerp(CUES.waveBreak + 3, CUES.waveBreak + 11, tw)));
  const rough = 0.3 + 0.7 * storm(tw);                           // the storm sea lies down at dawn
  return { tw, F, H, Lf, Lb, brk, zb, xb, Hb, wb, cap, white, prog, rough };
}

const W0 = (x) => 30 * Math.sin(x / 310 + 0.7) + 18 * Math.sin(x / 127 + 2.1);
const WOFF0 = W0(0);
// peaks and saddles along the crest (the mouth, x ~ 0, is always a peak)
export function latAt(x) {
  const m = Math.min(1, Math.abs(x) / 160);
  return (0.8 + 0.14 * Math.cos(x / 610) + m * (0.13 * Math.sin(x / 233 + 1.7) + 0.08 * Math.sin(x / 97 + 0.4))) * (1 - smooth(invLerp(2600, 3600, Math.abs(x))));
}
export const crestZ = (x, P) => P.F + W0(x) - WOFF0;
// height of the great swell at (x, z)
export function swellAt(x, z, P) {
  if (P.H <= 0.01) return 0;
  const s = z - crestZ(x, P);
  let p;
  if (s < 0) p = Math.exp(-((s / P.Lb) ** 2));
  else p = Math.exp(-Math.pow(s / P.Lf, 1.35)) - 0.13 * Math.exp(-(((s - 1.9 * P.Lf) / (0.9 * P.Lf)) ** 2));   // concave face, steepest under the lip
  const lat = latAt(x);
  const reef = 1 - smooth(invLerp(-275, -238, z));
  return P.H * p * lat * reef * (1 - 0.85 * P.brk);
}
export function boreAt(x, z, P) {
  if (P.Hb <= 0.01) return 0;
  const s = z - P.zb;
  const p = s > 0 ? Math.exp(-((s / 10) ** 2)) : Math.exp(-((s / 48) ** 2));
  const lat = Math.exp(-(((x - P.xb) / P.wb) ** 2));
  return P.Hb * p * lat * (z > -280 ? 1 : 0.5);
}
// the storm sea without the swell (fade = grid spacing at this point, 0 = full detail)
export function wavesAt(x, z, tw, sp) {
  let h = 0;
  for (const w of WAVES) {
    const f = sp > 0 ? fadeW(w.L, sp) : 1;
    if (f <= 0) continue;
    const ph = w.kx * x + w.kz * z - w.w * tw + w.ph;
    h += f * w.A * (2 * Math.pow(0.5 + 0.5 * Math.sin(ph), w.s) - 2 * w.mean);
  }
  return h;
}
export function heightFull(x, z, P, sp) {
  return wavesAt(x, z, P.tw, sp) * calmAt(x, z) * P.rough + swellAt(x, z, P) + boreAt(x, z, P);
}
// 0..1 foam: crests of the storm sea, the swell's spilling cap, the white field after the break, the bore
export function foamFull(x, z, P) {
  let cl = 0, cs = 0;
  WAVES.forEach((w, i) => {
    const ph = w.kx * x + w.kz * z - w.w * P.tw + w.ph;
    const v = w.A * (2 * Math.pow(0.5 + 0.5 * Math.sin(ph), w.s) - 2 * w.mean);
    if (i < 3) cl += v; else cs += v;
  });
  let f = smooth(invLerp(0.78, 0.95, 0.55 * cl / 4.6 + 0.45 * cs / 1.15)) * calmAt(x, z) * smooth(invLerp(0.5, 1, P.rough));
  if (P.H > 0.5) {
    const s = z - crestZ(x, P);
    f = Math.max(f, P.cap * smooth(invLerp(-40, -6, s)) * (1 - smooth(invLerp(4, 30, s))));
  }
  if (P.white > 0) {
    const zf = crestZ(x, P);
    const band = smooth(invLerp(zf - 150, zf - 40, z)) * (1 - smooth(invLerp(zf + 30, zf + 90, z))) * (1 - smooth(invLerp(-210, -160, z)));
    f = Math.max(f, P.white * band * (1 - smooth(invLerp(350, 800, Math.abs(x)))));
  }
  if (P.Hb > 0.2) f = Math.max(f, clamp(boreAt(x, z, P) / 2.5) * 0.95);
  return clamp(f);
}

// ---------------------------------------------------------------- GLSL twin
const f = (v) => (Number.isInteger(v) ? v.toFixed(1) : String(+v.toPrecision(8)));
export const WAVES_GLSL = /* glsl */ `
const int NW = ${WAVES.length};
const vec4 WK[NW] = vec4[](${WAVES.map((w) => `vec4(${f(w.kx)}, ${f(w.kz)}, ${f(w.A)}, ${f(w.s)})`).join(', ')});
const vec4 WO[NW] = vec4[](${WAVES.map((w) => `vec4(${f(w.w)}, ${f(w.ph)}, ${f(w.mean)}, ${f(w.L)})`).join(', ')});
const int NRP = ${RIPPLES.length};
const vec4 RP[NRP] = vec4[](${RIPPLES.map(([L, a, ang]) => { const k = (2 * Math.PI) / L; return `vec4(${f(k * Math.sin(ang))}, ${f(k * Math.cos(ang))}, ${f(a)}, ${f(Math.sqrt(GRAV * k))})`; }).join(', ')});
const float GR_C = ${f(GRID.C)}, GR_R0 = ${f(GRID.R0)}, GR_NA = ${f(GRID.NA)};
uniform vec2 uCenter;
uniform float uTw;
uniform vec4 uSw;     // F, H, Lf, Lb
uniform vec4 uSw2;    // brk, cap, white, rough
uniform vec4 uBore;   // zb, xb, Hb, wb
float spacingAt(float r){ return max(GR_C * (r + GR_R0), 6.2831853 * r / GR_NA); }
float fadeW(float L, float sp){ return 1.0 - smoothstep(L / 8.0, L / 4.0, sp); }
float calmAt(vec2 p){ return 1.0 - 0.86 * smoothstep(-262.0, -195.0, p.y) * (1.0 - smoothstep(240.0, 330.0, abs(p.x))); }
// height of the storm sea and its gradient (d/dx, d/dz)
float wavesAt(vec2 p, float sp, out vec2 grad){
  float h = 0.0; grad = vec2(0.0);
  for(int i = 0; i < NW; i++){
    vec4 K = WK[i], O = WO[i];
    float fw = sp > 0.0 ? fadeW(O.w, sp) : 1.0;
    if(fw <= 0.0) continue;
    float ph = K.x * p.x + K.y * p.y - O.x * uTw + O.y;
    float u = max(0.5 + 0.5 * sin(ph), 1e-5);
    h += fw * K.z * (2.0 * pow(u, K.w) - 2.0 * O.z);
    float dph = fw * K.z * K.w * pow(u, K.w - 1.0) * cos(ph);
    grad += dph * K.xy;
  }
  return h;
}
float crestOff(float x){ return 30.0 * sin(x / 310.0 + 0.7) + 18.0 * sin(x / 127.0 + 2.1) - ${f(WOFF0)}; }
float latAt(float x){
  float lm = min(1.0, abs(x) / 160.0);
  return (0.8 + 0.14 * cos(x / 610.0) + lm * (0.13 * sin(x / 233.0 + 1.7) + 0.08 * sin(x / 97.0 + 0.4))) * (1.0 - smoothstep(2600.0, 3600.0, abs(x)));
}
float swellAt(vec2 p){
  if(uSw.y <= 0.01) return 0.0;
  float s = p.y - (uSw.x + crestOff(p.x));
  float pr = s < 0.0 ? exp(-pow(s / uSw.w, 2.0)) : exp(-pow(s / uSw.z, 1.35)) - 0.13 * exp(-pow((s - 1.9 * uSw.z) / (0.9 * uSw.z), 2.0));
  float lat = latAt(p.x);
  float reef = 1.0 - smoothstep(-275.0, -238.0, p.y);
  return uSw.y * pr * lat * reef * (1.0 - 0.85 * uSw2.x);
}
float boreAt(vec2 p){
  if(uBore.z <= 0.01) return 0.0;
  float s = p.y - uBore.x;
  float pr = s > 0.0 ? exp(-pow(s / 10.0, 2.0)) : exp(-pow(s / 48.0, 2.0));
  return uBore.z * pr * exp(-pow((p.x - uBore.y) / uBore.w, 2.0)) * (p.y > -280.0 ? 1.0 : 0.5);
}
float seaHeight(vec2 p, float sp){ vec2 g; return wavesAt(p, sp, g) * calmAt(p) * uSw2.w + swellAt(p) + boreAt(p); }
`;
