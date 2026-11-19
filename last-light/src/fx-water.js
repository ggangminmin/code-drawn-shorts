import * as THREE from 'three';
import { hash, hr, KIND, PAL, ID, GLOW } from './fx-core.js';
import { MOUTH, LAMPROOM, boatPath, swellFront, swellHeight } from './layout.js';
import { clamp, smooth, invLerp, easeOut } from './util.js';
import { Sheet } from './fx-sheet.js';

// Spray: the white explosion of the swell breaking on the reef teeth (s20, with Sea's water body), spray streaming off
// the great swell's crest, bow spray off the boats, falling spray over Kestrel (s21) and the gust of spray that reaches
// the lantern room (s22). Few big drawn billows and strokes; nothing that reads as particle soup near a face.
const V = THREE.Vector3;
const WIND = new V(0.55, 0, 0.32);     // storm wind toward +X, a little onshore: spray drifts this way

export function createWater(E) {
  const { C, camera, ctx } = E;
  // the break's water bodies: two great torn fans off the teeth, a curtain across the mouth, two low flank sheets
  const sheets = [new Sheet(ctx.scene, 56, 18, 34), new Sheet(ctx.scene, 56, 18, 34), new Sheet(ctx.scene, 80, 18, 44), new Sheet(ctx.scene, 32, 10, 30), new Sheet(ctx.scene, 32, 10, 30)];

  // palette for spray at a point: lit by the beam, lit by lightning, or the cold night
  function palAt(p) {
    if (E.flash > 0.45) return PAL.FLASHWATER;
    if (E.beamLitAt(p) > 0.5) return PAL.GOLDWATER;
    return PAL.WATER;
  }
  const near = (p, d) => camera.position.distanceToSquared(p) < d * d;

  // ------------------------------------------------------------------ the break on the reef teeth
  // Two great white towers thrown up off the teeth and a lower curtain between them, each a fan of drawn jets with a
  // boiling crown, falling back as streaks into a churn of foam, hanging mist drifting downwind.
  function reefBreak() {
    const a = E.tq - C.waveBreak;
    if (a < -0.05 || a > 6.5) { for (const sh of sheets) sh.hide(); return; }
    const Z = MOUTH.center[2] + 2;
    const L = new V(...MOUTH.toothL), R = new V(...MOUTH.toothR);
    // Kestrel punches out of the white at CUES.dadIn: no billow may cover her from the camera
    const bp = E.boatPos(0);
    if (E.t > C.dadIn - 0.12 && bp) {
      const yaw = boatPath(0, E.t).yaw, fwd = new V(Math.sin(yaw), 0, Math.cos(yaw));
      E.puffs.guard = [{ x: bp.x + fwd.x * 3, y: bp.y + 2.5, z: bp.z + fwd.z * 3, R: 6.5 }, { x: bp.x - fwd.x * 3, y: bp.y + 3, z: bp.z - fwd.z * 3, R: 5.5 }];
    }
    const pal = E.flash > 0.45 ? PAL.FLASHWATER : PAL.CLEAN;
    // Kestrel's bow punches through the white at CUES.dadIn: a ragged hole round her, growing
    let hole = null;
    if (bp && E.t > C.dadIn - 0.15) {
      const yaw = boatPath(0, E.t).yaw, fw = new V(Math.sin(yaw), 0, Math.cos(yaw));
      const hk = smooth(invLerp(C.dadIn - 0.15, C.dadIn + 0.35, E.t));
      hole = [bp.x + fw.x * 2, bp.y + 3, bp.z + fw.z * 2, 3 + 9 * hk];
    }
    const gold = E.beamLitAt(new V(0, 30, Z)) > 0.4 ? 0.6 : 0;
    const nz = (x, k) => Math.sin(x * 1.7 + k) * 0.5 + Math.sin(x * 4.3 + k * 2.1) * 0.3 + Math.sin(x * 9.1 + k * 0.7) * 0.2;
    // a fan of water thrown up the seaward face of a tooth and over its top, flaring as it climbs
    const fan = (sh, Tx, H0, span, rb, t0, seed) => {
      const aa = a - t0;
      if (aa < 0 || aa > 6) { sh.hide(); return null; }
      const up = 1 - Math.exp(-aa / 0.42), slump = smooth(invLerp(1.4, 4.6, aa)), fade = smooth(invLerp(1.9, 5.8, aa));
      const H = H0 * up * (1 - 0.5 * slump), drift = WIND.x * 5 * aa;
      const shape = (u, v) => {
        const th = Math.PI + (u - 0.5) * span;
        const hu = H * (1 - 0.4 * (2 * u - 1) ** 2) * (0.82 + 0.25 * nz(u * 3, seed + Math.floor(E.tq * 8) * 0.05));
        const r = rb + (8 + 30 * up) * Math.pow(v, 1.4) + 14 * slump * v;
        const y = hu * Math.pow(v, 0.72) - 4 * slump * v * v;
        return [Tx + Math.sin(th) * r + drift * v, y, Z + Math.cos(th) * r + hu * 0.42 * v * v * up];
      };
      sh.set(shape, { drawing: E.draw, fade, seed, flash: E.flash > 0.45 ? E.flash : 0, gold, foamLine: 0.3, hole });
      return { H, up, fade, Tx, shape };
    };
    const fL = fan(sheets[0], L.x, 122, 2.8, 10, 0, 1.3);
    const fR = fan(sheets[1], R.x, 112, 2.8, 10, 0.06, 2.7);
    fan(sheets[3], -84, 30, 1.6, 6, 0.12, 4.1);
    fan(sheets[4], 86, 26, 1.6, 6, 0.16, 5.3);
    // the curtain across the mouth: the swell's own lip stood up between the teeth and thrown forward into the basin
    {
      const aa = a - 0.05;
      if (aa < 0 || aa > 5.5) sheets[2].hide();
      else {
        const up = 1 - Math.exp(-aa / 0.45), slump = smooth(invLerp(1.3, 4.2, aa)), fade = smooth(invLerp(1.8, 5.4, aa));
        const Hc = 92 * up * (1 - 0.55 * slump);
        sheets[2].set((u, v) => {
          const x = -60 + 120 * u, hu = Hc * (0.7 + 0.3 * nz(u * 4, 3.3 + Math.floor(E.tq * 8) * 0.05)) * (1 - 0.3 * (2 * u - 1) ** 4);
          return [x + WIND.x * 4 * aa * v, hu * Math.pow(v, 0.75), Z - 3 + 5 * aa * (1 - v * 0.3) + hu * 0.4 * v * v];
        }, { drawing: E.draw, fade, seed: 3.3, flash: E.flash > 0.45 ? E.flash : 0, gold, foamLine: 0.35, hole });
      }
    }
    // the boiling heads on the two fans and drops falling off them: a few big drawn billows, not a heap
    [fL, fR].forEach((F, si) => {
      if (!F) return;
      for (let j = 0; j < 4; j++) {
        const [x, y, z] = F.shape(0.3 + 0.13 * j + hr(si, j, 70, -0.04, 0.04), 0.86);
        E.puffs.push(x, y, z, 5 + 6 * F.up, 0, 1, 0.5, 0, 1, 0, (si * 17 + j * 5) % 97 + 0.63, 0.02 + 0.1 * hash(si, j, 72), Math.min(1, F.fade * 1.2), KIND.PUFF, pal, ID.SPRAY[j % 3]);
      }
      if (a > 0.5 && a < 4.5) for (let q = 0; q < 10; q++) {
        const T = hr(si, q, 57, 0.7, 1.2), ph = ((a - 0.5) / T + hash(si, q, 58)) % 1;
        const fx = F.Tx + hr(si, q, 59, -20, 20), fz = Z + F.H * 0.35 + hr(si, q, 60, -6, 8);
        const y0 = F.H * 0.9, P = new V(fx + WIND.x * 6 * ph, y0 - y0 * ph * ph, fz);
        if (P.y < 1.5) continue;
        const Q = P.clone(); Q.y += 2 + 7 * ph;
        E.beams.push([Q, Q.clone().lerp(P, 0.5), P], { m: 0.14, px: 1.1, width: (s) => Math.sin(Math.PI * s) * (0.4 + 0.6 * s), color: [0.78, 0.87, 0.93], hot: [1, 1, 1], power: 0.9 * (1 - F.fade), core: 0.45, soft: 1, seed: si + q * 0.3, mode: 0, bias: 4 });
      }
    });
    // foam laid flat on the basin side, rushing in
    if (a > 0.2) {
      for (let i = 0; i < 18; i++) {
        const x0 = -90 + 180 * (i + hash(i, 61, 1)) / 18, z0 = Z + 10 + 26 * easeOut(clamp((a - 0.2) / 2.5)) + hr(i, 61, 2, -6, 10);
        const pts = [];
        for (let q = 0; q <= 8; q++) pts.push(new V(x0 + (q - 4) * hr(i, 61, 3, 2.5, 5), 0.6, z0 + Math.sin(q * 0.8 + i) * 1.5));
        E.beams.push(pts, { m: hr(i, 61, 4, 1.2, 2.6), px: 1.2, width: (s) => Math.pow(Math.sin(Math.PI * s), 0.6), color: [0.62, 0.76, 0.86], hot: [0.95, 0.98, 1], power: 0.9 * (1 - smooth(invLerp(3, 6, a))), core: 0.4, soft: 0, seed: i * 0.31, mode: 0, bias: 4 });
      }
    }
    // mist: big soft veils hanging round the towers and drifting downwind
    if (a > 0.4) for (let i = 0; i < 7; i++) {
      const x = -80 + 160 * (i / 6) + WIND.x * 10 * a, z = Z + 6 + WIND.z * 10 * a, y = 14 + 18 * (i % 2) + 5 * a;
      const op = 0.4 * smooth(invLerp(0.4, 1.4, a)) * (1 - smooth(invLerp(3.5, 6.5, a)));
      E.mist([x, y, z], [30 + 6 * a, 20 + 3 * a], i * 3.1, op, 8, 0, [0.5, 0.6, 0.68], [0.24, 0.3, 0.38]);
    }
  }

  // ------------------------------------------------------------------ spray off the great swell's crest
  // spindrift: long torn streamers blown back off the lip, irregular, with a veil of mist behind them
  function crestSpray() {
    const t = E.tq, H = swellHeight(t);
    if (H < 6 || t > C.waveBreak + 0.4) return;
    const Zf = swellFront(t), D = Math.floor(t * 8);
    const fx = camera.position.x;
    const step = 16;
    const x0 = Math.floor((fx - 520) / step);
    const kH = H / 26;
    for (let k = 0; k < 66; k++) {
      const ix = x0 + k;
      // clumps: whole stretches of the lip tear at once, others hold
      const clump = Math.sin(ix * 0.37 + 1.3) + Math.sin(ix * 0.13 + 4.1) * 0.8 + (hash(ix, D % 3, 70) - 0.5) * 0.8;
      if (clump < 0.2) continue;
      const x = ix * step + hr(ix, 71, 1, -7, 7);
      const p = new V(x, H * 0.98, Zf + hr(ix, 71, 2, -2, 2));
      if (!near(p, 1100)) continue;
      const len = hr(ix, 71, 3, 14, 38) * kH * (0.6 + 0.4 * clump);
      const pts = [];
      for (let q = 0; q <= 8; q++) {
        const u = q / 8;
        // up off the lip, then laid back by the wind and falling
        pts.push(new V(x + WIND.x * len * 0.3 * u + Math.sin(u * 3 + ix) * 1.2, p.y + len * (0.42 * u - 0.36 * u * u), p.z - len * u));
      }
      const pal = E.flash > 0.45 ? [0.9, 0.95, 1] : E.beamLitAt(p) > 0.5 ? [1, 0.95, 0.82] : [0.7, 0.8, 0.86];
      E.beams.push(pts, { m: hr(ix, 71, 4, 1.2, 3.2) * kH, px: 1.5, width: (s) => Math.pow(Math.sin(Math.PI * Math.min(1, s * 1.15)), 0.7) * (1 - 0.6 * s), color: pal, hot: [1, 1, 1], power: 0.85, core: 0.28, soft: 4, seed: ix * 0.37 + (D % 3) * 0.11, mode: 0, bias: 6 });
      if (k % 3 === 0) E.mist([x, p.y + len * 0.15, p.z - len * 0.6], [len * 0.9, len * 0.35], ix * 0.7, 0.22 * Math.min(1, clump), 10, 0, [0.4, 0.48, 0.55], [0.2, 0.26, 0.33]);
    }
  }

  // ------------------------------------------------------------------ bow spray: each boat slams into a sea now and then
  function bowSpray() {
    const boats = 6;
    for (let i = 0; i < boats; i++) {
      const bp = E.boatPos(i);
      if (!bp || !near(bp, 420)) continue;
      const pth = boatPath(i, E.t), fwd = new V(Math.sin(pth.yaw), 0, Math.cos(pth.yaw)), side = new V(fwd.z, 0, -fwd.x);
      const period = hr(i, 81, 1, 1.3, 2.0);
      const ph = (E.tq + hr(i, 81, 2, 0, period)) % period;
      const life = 0.75;
      if (ph > life) continue;
      const a = ph, k = 1 - smooth(invLerp(0.2, life, a));
      const bow = bp.clone().addScaledVector(fwd, 5.2); bow.y += 0.6;
      for (const sg of [-1, 1]) {
        for (let j = 0; j < 3; j++) {
          const out = side.clone().multiplyScalar(sg).multiplyScalar(2.5 + 4 * a).addScaledVector(fwd, 1.5 * a);
          const p = bow.clone().add(out); p.y += 2.2 * a * (1 + j * 0.5) - 3 * a * a;
          p.addScaledVector(WIND, 6 * a);
          const r = (0.7 + 0.35 * j) * (0.6 + a * 1.4);
          E.puffs.push(p.x, p.y, p.z, r, 0, 1, 0.45, 0, 1, 0, (i * 11 + j * 5 + (sg > 0 ? 3 : 0)) % 97 + 0.21, 0.05 + 0.1 * j, 1 - k, KIND.PUFF, palAt(p), ID.SPRAY[j]);
        }
        for (let j = 0; j < 4; j++) {
          const v = hr(i, j, 82 + sg, 4, 9), vy = hr(i, j, 84 + sg, 4, 8);
          const dir = side.clone().multiplyScalar(sg * hr(i, j, 86, 0.5, 1)).addScaledVector(fwd, hr(i, j, 87, 0.1, 0.6)).normalize();
          const P = bow.clone().addScaledVector(dir, v * a).add(new V(0, vy * a - 4.9 * a * a, 0)).addScaledVector(WIND, 5 * a);
          const Q = P.clone().addScaledVector(dir, -v * 0.1); Q.y -= (vy - 9.8 * a) * 0.1;
          E.beams.push([Q, Q.clone().lerp(P, 0.5), P], { m: 0.18, px: 1.3, width: (s) => Math.sin(Math.PI * s), color: [0.8, 0.88, 0.95], hot: [1, 1, 1], power: 1.0 * k, core: 0.5, soft: 2, seed: i + j * 0.3, mode: 0, bias: 2 });
        }
      }
    }
  }

  // ------------------------------------------------------------------ s21: falling spray over Kestrel
  function fallingSpray() {
    const t = E.t;
    if (t < C.dadIn - 0.1 || t > C.dadIn + 5.5) return;
    const bp = E.boatPos(0);
    if (!bp || !near(bp, 260)) return;
    const a = t - C.dadIn, k = 1 - smooth(invLerp(2.5, 5.5, a));
    const D = Math.floor(E.tq * 8);
    for (let i = 0; i < 46; i++) {
      // each drop falls on its own loop from 16-30 m, drawn as a short vertical stroke, redrawn on threes
      const T = hr(i, 91, 1, 0.9, 1.6), ph = ((E.tq + hash(i, 91, 2) * T) % T) / T;
      const r = hr(i, 91, 3, 2, 16), th = hash(i, 91, 4) * 6.283;
      const y0 = hr(i, 91, 5, 14, 28), y = y0 * (1 - ph * ph);
      const P = new V(bp.x + Math.cos(th) * r + WIND.x * 6 * ph, bp.y + y, bp.z + Math.sin(th) * r + WIND.z * 6 * ph);
      const Q = P.clone(); Q.y += 0.8 + 1.0 * ph;
      if (hash(i, D, 6) < 0.15) continue;
      E.beams.push([Q, Q.clone().lerp(P, 0.5), P], { m: 0.035, px: 1.0, width: (s) => Math.sin(Math.PI * s), color: [0.62, 0.72, 0.8], hot: [0.85, 0.9, 0.95], power: 0.7 * k, core: 0.3, soft: 0, seed: i * 0.13, mode: 0, bias: 2 });
    }
    for (let i = 0; i < 4; i++) {
      const th = i * 1.7 + a * 0.2;
      E.mist([bp.x + Math.cos(th) * 10 + WIND.x * 6 * a, bp.y + 7 + 3 * (i % 2), bp.z + Math.sin(th) * 10], [16, 9], i * 1.3, 0.32 * k, 4, 0, [0.62, 0.72, 0.8], [0.3, 0.38, 0.48]);
    }
  }

  // ------------------------------------------------------------------ s22: the gust of spray that reaches the lantern room
  function lampSpray(st) {
    const t = E.t, a = t - C.sprayHit;
    if (a < -0.3 || a > 2.2) return;
    const Lc = new V(...LAMPROOM.center);
    if (!near(Lc, 400)) return;
    const k = smooth(invLerp(-0.3, 0.05, a)) * (1 - smooth(invLerp(0.9, 2.2, a)));
    // a white sheet thrown up the seaward face of the tower and over the gallery
    const sea = new V(-0.72, 0, -0.69);    // toward the mouth from the tower
    for (let i = 0; i < 14; i++) {
      const th = Math.atan2(sea.z, sea.x) + hr(i, 101, 1, -0.9, 0.9);
      const rr = LAMPROOM.radius + hr(i, 101, 2, 0.8, 4);
      const y = LAMPROOM.floorY - 6 + 10 * easeOut(clamp((a + 0.3) / 0.6)) * hr(i, 101, 3, 0.4, 1.0) + hr(i, 101, 4, -1, 2);
      const p = new V(Lc.x + Math.cos(th) * rr, y, Lc.z + Math.sin(th) * rr).addScaledVector(WIND, 4 * Math.max(a, 0));
      E.puffs.push(p.x, p.y, p.z, hr(i, 101, 5, 1.0, 2.2), 0, 1, 0.45, 0, 1, 0, (i * 13) % 97 + 0.4, 0.06, 1 - k, KIND.PUFF, palAt(p), ID.SPRAY[i % 3]);
    }
    // inside: drops driven through the broken panes across the room, past the lamp
    const D = Math.floor(E.tq * 8);
    for (let i = 0; i < 30; i++) {
      const ph = ((E.tq * hr(i, 102, 1, 1.4, 2.6)) + hash(i, 102, 2)) % 1;
      const y = LAMPROOM.floorY + hr(i, 102, 3, 0.6, 3.6);
      const off = hr(i, 102, 4, -2.6, 2.6);
      const across = new V(-sea.z, 0, sea.x);
      const P = Lc.clone().addScaledVector(sea, 3.2 - 6.4 * ph).addScaledVector(across, off); P.y = y - 1.2 * ph;
      const Q = P.clone().addScaledVector(sea, 0.5); Q.y += 0.12;
      if (hash(i, D, 3) < 0.2) continue;
      E.beams.push([Q, Q.clone().lerp(P, 0.5), P], { m: 0.012, px: 1.4, width: (s) => s, color: [0.78, 0.86, 0.94], hot: [1, 1, 1], power: 0.95 * k, core: 0.5, soft: 2, seed: i * 0.21, mode: 0, bias: 0.3 });
    }
    E.windGust = Math.max(E.windGust, k);
  }

  return {
    update(st) {
      reefBreak();
      crestSpray();
      fallingSpray();
      lampSpray(st);
    },
  };
}
