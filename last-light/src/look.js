import * as THREE from 'three';
import { G } from './glsl.js';
import { ENV } from './passes-env.js';
import { deg } from './util.js';
import { lightningAt, storm } from './layout.js';

// ============================================================================================================
// LAST LIGHT colour script (Sea department owns this file). READ THIS FIRST.
//
//   look.k = 1     STORM NIGHT. Ink teal / slate blue / blue-black. Cold, wet, no moon, no stars, no aurora.
//                  The "sun" is the dull glow of the cloud deck: a weak cold slate key from high above (sunElev ~55).
//                  The lamp and the beam are the only warm colour (use addWarLight with pale gold-white / kerosene amber).
//   look.k = 0.5   DAWN. Pale cool blue sky, a thin warm peach band on the eastern horizon (+X, DAWN.sunAz 95,
//                  sunElev 4), silver sea, soft peach-white key from the east.
//   0.5 < k < 1    a blend (s26 runs k from 1 to 0.5 with layout.storm(t)). Values below 0.5 clamp to dawn.
//   DEFAULT_LOOK in shots.js is k 1, so every storm shot needs nothing. Shots after CUES.dawnFull (s27, s28) use k 0.5.
//
// NOTE: PRESETS.*.sky / .sea / .fog are raw LINEAR values (no sRGB decode); the G tints and the grade are normal sRGB hex.
// LIGHTNING is automatic: applyLook reads layout.lightningAt(t) every frame and, times look.flash (default 1; set
//   look.flash = 0 for sealed interiors, 0.3-0.6 for rooms that only see it through a window), lifts the cel key and
//   fill to a cold blue-white, flashes the sky and the cloud undersides, and silvers the sea. FX may still write
//   uSkyFlash directly in its own update (it runs after applyLook); look.skyFlash [r,g,b] overrides the automatic one.
//   Where each strike happens: LIGHTNING_POS in world-sky.js (ctx.world.flashAt(t) -> { pos:[x,y,z], k }).
//
// look keys: k, sunElev (deg), sunAz (deg, 0 = -Z open sea, + toward +X east), key [x,y,z], shadow {center,radius,depth},
//   flash, skyFlash [r,g,b], seaSheen (0..1, how much grazing water mirrors the bright horizon; long lenses want ~0.4), stars (0..1, only s26), cloudCover (override layout.storm for the cloud deck, 0..1),
//   sunDisk, veil, mistMul, fogMul, fogDensity, fogWarm, fogCool, exposure, gamma, contrast, vignette, bloom,
//   paintRadius, inkWidth, fade, fadeColor.
// ============================================================================================================
export const PRESETS = {
  dawn: {
    sunColor: '#ffe6d2', sunStrength: 0.64, skyTint: '#c9d6e3', shadeTint: '#8092aa', deepTint: '#4c5b70', bounce: '#bccad4',
    sky: { zenith: '#3f6a9e', mid: '#86a6c8', warm: '#f0c7a6', cool: '#c3d3e2', cloudLit: '#e8eef4', cloudMid: '#a2b3c6', cloudShade: '#6e8098' },
    fog: { warm: '#c9cdd2', cool: '#9fb1c2', density: 0.00007, mist: 0.12, mistHeight: 22 },
    grade: { lift: '#080c12', gain: '#fbfcfd', sat: 1.0, contrast: 1.12, pivot: 0.32, black: 0.01, shadow: '#e2eaf6', high: '#fbf7f2', halation: '#ffe8d8' },
    sea: { deep: '#2c4258', body: '#4a6580', sheen: '#b4c6d4', lit: '#6f8aa2', foam: '#eef3f6', foamShade: '#9fb2c2', glint: '#fff4e8' },
    rain: 0,
  },
  storm: {
    sunColor: '#a6b9c9', sunStrength: 0.5, skyTint: '#5d7286', shadeTint: '#25344a', deepTint: '#0e1622', bounce: '#1b313d',
    sky: { zenith: '#0c1720', mid: '#1b2c38', warm: '#3d515c', cool: '#33464f', cloudLit: '#6a8292', cloudMid: '#2c3e4a', cloudShade: '#141f28' },
    fog: { warm: '#33454f', cool: '#26363f', density: 0.00034, mist: 0.3, mistHeight: 34 },
    grade: { lift: '#020407', gain: '#edf5f9', sat: 0.92, contrast: 1.22, pivot: 0.3, black: 0.014, shadow: '#dde9f2', high: '#f1f5f7', halation: '#fff0dc' },
    sea: { deep: '#07141b', body: '#183b47', sheen: '#40606f', lit: '#2f6068', foam: '#dce8ec', foamShade: '#829ba7', glint: '#cfe2ec' },
    rain: 1,
  },
};

// Sea colour uniforms (sea.js reads these objects by reference; applyLook writes them).
export const SEA_U = {
  uSeaDeep: { value: new THREE.Color() }, uSeaBody: { value: new THREE.Color() }, uSeaSheen: { value: new THREE.Color() },
  uSeaLit: { value: new THREE.Color() }, uSeaFoam: { value: new THREE.Color() }, uSeaFoamShade: { value: new THREE.Color() },
  uSeaGlint: { value: new THREE.Color() }, uSeaStorm: { value: 1 }, uSeaFlash: { value: 0 }, uSeaSheenK: { value: 1 },
};
export const FLASH_COLOR = [0.8, 0.9, 1.0];
// the automatic lightning value applyLook used this frame (0..1, already times look.flash)
export const LOOK_STATE = { flash: 0, k: 1, t: 0 };

const ca = new THREE.Color(), cb = new THREE.Color();
const mixC = (target, a, b, k) => target.copy(ca.set(a)).lerp(cb.set(b), k);
// sky, sea and fog palettes are authored as raw linear values (what you write is what the shader gets)
const hexN = (h) => parseInt(h.slice(1), 16);
const mixL = (target, a, b, k) => target.copy(ca.setHex(hexN(a), THREE.LinearSRGBColorSpace)).lerp(cb.setHex(hexN(b), THREE.LinearSRGBColorSpace), k);
const mixN = (a, b, k) => a + (b - a) * k;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const _w = new THREE.Color();
const toward = (c, rgb, k) => c.lerp(_w.setRGB(rgb[0], rgb[1], rgb[2]), clamp01(k));

export function applyLook(ctx, look) {
  const A = PRESETS.dawn, B = PRESETS.storm;
  const k = clamp01(((look.k ?? 1) - 0.5) / 0.5);    // 0 = dawn, 1 = storm
  const t = G.uTime.value;
  const fl = clamp01(lightningAt(t) * (look.flash ?? 1) * (0.25 + 0.75 * k));
  LOOK_STATE.flash = fl; LOOK_STATE.k = k; LOOK_STATE.t = t;
  const el = deg(look.sunElev ?? mixN(4, 55, k)), az = deg(look.sunAz ?? mixN(95, 200, k));
  G.uSunDir.value.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
  mixC(G.uSunColor.value, A.sunColor, B.sunColor, k);
  G.uSunStrength.value = mixN(A.sunStrength, B.sunStrength, k);
  mixC(G.uSkyTint.value, A.skyTint, B.skyTint, k);
  mixC(G.uShadeTint.value, A.shadeTint, B.shadeTint, k);
  mixC(G.uDeepTint.value, A.deepTint, B.deepTint, k);
  mixC(G.uBounce.value, A.bounce, B.bounce, k);
  // lightning: the whole world goes cold blue-white for a few frames, shadows open up
  if (fl > 0) {
    toward(G.uSunColor.value, [1.3, 1.42, 1.55], fl * 0.85);
    G.uSunStrength.value = mixN(G.uSunStrength.value, 1.0, fl);
    toward(G.uSkyTint.value, [1.0, 1.12, 1.25], fl * 0.8);
    toward(G.uShadeTint.value, [0.42, 0.52, 0.64], fl * 0.7);
    toward(G.uDeepTint.value, [0.2, 0.26, 0.34], fl * 0.5);
  }

  ENV.uRain.value = look.rain ?? mixN(A.rain, B.rain, k) * 0.0;   // the engine's rain haze glows toward the sun; our storm has none
  ENV.uRainbow.value = 0;
  ENV.uVeil.value = clamp01(look.veil ?? 0);
  ENV.uWaterOn.value = 0;      // the sea is real geometry (sea.js) with its own horizon haze
  ENV.uWet.value = k;

  const sky = ctx.world && ctx.world.sky;
  if (sky) {
    const u = sky.material.uniforms;
    mixL(u.uZenith.value, A.sky.zenith, B.sky.zenith, k);
    mixL(u.uMid.value, A.sky.mid, B.sky.mid, k);
    mixL(u.uHorizonWarm.value, A.sky.warm, B.sky.warm, k);
    mixL(u.uHorizonCool.value, A.sky.cool, B.sky.cool, k);
    mixL(u.uCloudLit.value, A.sky.cloudLit, B.sky.cloudLit, k);
    mixL(u.uCloudMid.value, A.sky.cloudMid, B.sky.cloudMid, k);
    mixL(u.uCloudShade.value, A.sky.cloudShade, B.sky.cloudShade, k);
    if (u.uSunDisk) u.uSunDisk.value = look.sunDisk ?? (1 - k);
    if (u.uStars) u.uStars.value = look.stars ?? 0;
    if (u.uCover) u.uCover.value = look.cloudCover ?? storm(t);
    if (u.uFlashK) u.uFlashK.value = fl;
    const sf = look.skyFlash;
    if (sf) u.uSkyFlash.value.setRGB(sf[0], sf[1], sf[2]);
    else u.uSkyFlash.value.setRGB(FLASH_COLOR[0] * fl * 0.3, FLASH_COLOR[1] * fl * 0.3, FLASH_COLOR[2] * fl * 0.3);
  }
  // the sea's own palette
  mixL(SEA_U.uSeaDeep.value, A.sea.deep, B.sea.deep, k);
  mixL(SEA_U.uSeaBody.value, A.sea.body, B.sea.body, k);
  mixL(SEA_U.uSeaSheen.value, A.sea.sheen, B.sea.sheen, k);
  mixL(SEA_U.uSeaLit.value, A.sea.lit, B.sea.lit, k);
  mixL(SEA_U.uSeaFoam.value, A.sea.foam, B.sea.foam, k);
  mixL(SEA_U.uSeaFoamShade.value, A.sea.foamShade, B.sea.foamShade, k);
  mixL(SEA_U.uSeaGlint.value, A.sea.glint, B.sea.glint, k);
  SEA_U.uSeaStorm.value = k;
  SEA_U.uSeaFlash.value = fl;
  SEA_U.uSeaSheenK.value = look.seaSheen ?? 1;

  const e = ctx.engine;
  const a = e.mAtmos.uniforms;
  mixL(a.uFogWarm.value, A.fog.warm, B.fog.warm, k);
  mixL(a.uFogCool.value, A.fog.cool, B.fog.cool, k);
  if (fl > 0) { toward(a.uFogWarm.value, [0.36, 0.44, 0.52], fl * 0.6); toward(a.uFogCool.value, [0.3, 0.38, 0.46], fl * 0.6); }
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
  f.uExposure.value = (look.exposure ?? 1.08) * (1 + 0.12 * fl);
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
