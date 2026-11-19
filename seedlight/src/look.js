import * as THREE from 'three';
import { G } from './glsl.js';
import { ENV } from './passes-env.js';
import { deg } from './util.js';

// Colour script for SEEDLIGHT: a clean jade-and-bone moonlit night that the Lantern's anger sets on fire.
//   k = 1    moonlit night: pale silver-jade key, deep teal shadows, bone-white stone, dense stars, no aurora
//   k = 0.5  burning: amber-vermilion from below through smoke, teal still alive in the shadows
// GOLD belongs to the seed and the calm Lantern, WHITE-HOT to its anger, VERMILION to fire, cold CYAN-WHITE to the ship's searchlights.
// No purple, no pink, no neon: the palette is jade night + bone + gold, then fire.
export const PRESETS = {
  burn: {
    sunColor: '#ffdcb8', sunStrength: 0.92, skyTint: '#4e7078', shadeTint: '#1c4654', deepTint: '#081c28', bounce: '#b8703c',
    sky: { zenith: '#051824', mid: '#103444', warm: '#c86a30', cool: '#1c4854', cloudLit: '#f2a868', cloudMid: '#4a6068', cloudShade: '#122c36' },
    fog: { warm: '#5a3a2a', cool: '#14323c', density: 0.0004, mist: 0.22, mistHeight: 40 },
    grade: { lift: '#030706', gain: '#fff6ea', sat: 1.1, contrast: 1.22, pivot: 0.3, black: 0.012, shadow: '#d0eee8', high: '#fff0dc', halation: '#ffe2c4' },
    night: 0.8, aurora: 0,
  },
  night: {
    sunColor: '#f2f1e6', sunStrength: 0.98, skyTint: '#5a8490', shadeTint: '#1d4658', deepTint: '#071c28', bounce: '#557c80',
    sky: { zenith: '#03131f', mid: '#0b3046', warm: '#2a5a66', cool: '#164458', cloudLit: '#cfe4dc', cloudMid: '#5a8a8c', cloudShade: '#143038' },
    fog: { warm: '#1c3c40', cool: '#0e2a32', density: 0.00013, mist: 0.07, mistHeight: 30 },
    grade: { lift: '#020605', gain: '#f8fffb', sat: 1.12, contrast: 1.22, pivot: 0.3, black: 0.012, shadow: '#d0f0ea', high: '#fff8ea', halation: '#ffe8d0' },
    night: 1, aurora: 0,
  },
};

const ca = new THREE.Color(), cb = new THREE.Color();
const mixC = (target, a, b, k) => target.copy(ca.set(a)).lerp(cb.set(b), k);
const mixN = (a, b, k) => a + (b - a) * k;
const clamp01 = (x) => Math.min(1, Math.max(0, x));

// look: { k, sunElev (deg), sunAz (deg, 0 = -Z north, + toward +X east), sunDisk, shafts, veil, mistMul, fogMul,
//         fogDensity, fogWarm, fogCool, exposure, gamma, contrast, paintRadius, inkWidth, key: [x,y,z], shadow: {center, radius, depth},
//         fade, fadeColor, cloudDrift, aurora, cityGlow, skyFlash: [r,g,b], vignette, bloom }
export function applyLook(ctx, look) {
  const A = PRESETS.burn, B = PRESETS.night;
  const k = clamp01(((look.k ?? 1) - 0.5) / 0.5);
  const el = deg(look.sunElev ?? 36), az = deg(look.sunAz ?? 232);
  G.uSunDir.value.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
  mixC(G.uSunColor.value, A.sunColor, B.sunColor, k);
  G.uSunStrength.value = mixN(A.sunStrength, B.sunStrength, k);
  mixC(G.uSkyTint.value, A.skyTint, B.skyTint, k);
  mixC(G.uShadeTint.value, A.shadeTint, B.shadeTint, k);
  mixC(G.uDeepTint.value, A.deepTint, B.deepTint, k);
  mixC(G.uBounce.value, A.bounce, B.bounce, k);

  ENV.uRain.value = 0;
  ENV.uRainbow.value = 0;
  ENV.uVeil.value = clamp01(look.veil ?? (1 - k) * 0.5);
  ENV.uWaterOn.value = 0;

  const sky = ctx.world && ctx.world.sky;
  if (sky) {
    const u = sky.material.uniforms;
    mixC(u.uZenith.value, A.sky.zenith, B.sky.zenith, k);
    mixC(u.uMid.value, A.sky.mid, B.sky.mid, k);
    mixC(u.uHorizonWarm.value, A.sky.warm, B.sky.warm, k);
    mixC(u.uHorizonCool.value, A.sky.cool, B.sky.cool, k);
    mixC(u.uCloudLit.value, A.sky.cloudLit, B.sky.cloudLit, k);
    mixC(u.uCloudMid.value, A.sky.cloudMid, B.sky.cloudMid, k);
    mixC(u.uCloudShade.value, A.sky.cloudShade, B.sky.cloudShade, k);
    u.uSunDisk.value = look.sunDisk ?? 1;
    u.uCloudDrift.value = look.cloudDrift ?? 0;
    u.uNight.value = mixN(A.night, B.night, k);
    u.uAurora.value = look.aurora ?? mixN(A.aurora, B.aurora, k);
    u.uCityGlow.value = look.cityGlow ?? 0;
    const fl = look.skyFlash; u.uSkyFlash.value.setRGB(fl ? fl[0] : 0, fl ? fl[1] : 0, fl ? fl[2] : 0);
  }
  const e = ctx.engine;
  const a = e.mAtmos.uniforms;
  mixC(a.uFogWarm.value, A.fog.warm, B.fog.warm, k);
  mixC(a.uFogCool.value, A.fog.cool, B.fog.cool, k);
  if (look.fogWarm) a.uFogWarm.value.set(look.fogWarm);
  if (look.fogCool) a.uFogCool.value.set(look.fogCool);
  a.uFogDensity.value = (look.fogDensity ?? mixN(A.fog.density, B.fog.density, k)) * (look.fogMul ?? 1);
  a.uMist.value = mixN(A.fog.mist, B.fog.mist, k) * (look.mistMul ?? 1);
  a.uMistHeight.value = mixN(A.fog.mistHeight, B.fog.mistHeight, k);
  a.uShafts.value = look.shafts ?? 0;
  const f = e.mFinal.uniforms;
  mixC(f.uLift.value, A.grade.lift, B.grade.lift, k);
  mixC(f.uGain.value, A.grade.gain, B.grade.gain, k);
  f.uSat.value = mixN(A.grade.sat, B.grade.sat, k);
  f.uExposure.value = look.exposure ?? 1.08;
  f.uGamma.value = look.gamma ?? 0.92;
  f.uContrast.value = look.contrast ?? mixN(A.grade.contrast, B.grade.contrast, k);
  f.uPivot.value = mixN(A.grade.pivot, B.grade.pivot, k);
  f.uBlack.value = mixN(A.grade.black, B.grade.black, k);
  mixC(f.uSplitShadow.value, A.grade.shadow, B.grade.shadow, k);
  mixC(f.uSplitHigh.value, A.grade.high, B.grade.high, k);
  mixC(f.uHalation.value, A.grade.halation, B.grade.halation, k);
  f.uVignette.value = look.vignette ?? 0.3;
  if (look.bloom != null) f.uBloom.value = look.bloom;
}
