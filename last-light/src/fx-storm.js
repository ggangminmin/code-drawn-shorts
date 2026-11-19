import * as THREE from 'three';
import { hash, hr, GLOW } from './fx-core.js';
import { LIGHTNING, LAMPROOM } from './layout.js';
import { LIGHTNING_POS } from './world-sky.js';
import { evalFrame } from './shots.js';
import { smooth, invLerp } from './util.js';

// Lightning (inked bolts, a tree of forks: white core, cold blue glow), its local light, and the strike of CUES.bolt on
// the lantern-room rod with the burst of glass. Sea's look.js already lifts the whole world's key and the sky in a flash
// (layout.lightningAt); FX draws the bolt itself where Sea lights the clouds (world-sky LIGHTNING_POS).
const V = THREE.Vector3;
const COLD = [0.55, 0.72, 1.0];
const INTERIOR = new Set(['wheelhouse', 'kitchen', 'stairs', 'stairsBase']);

// a lightning leg: long runs and sharp kinks, displaced sideways (R) and a little in depth (U); decay keeps small kinks bold
function boltPts(a, b, seed, R, U, rough = 0.2, levels = 6, decay = 0.6) {
  let pts = [a.clone(), b.clone()];
  let amp = a.distanceTo(b) * rough;
  for (let l = 0; l < levels; l++) {
    const nx = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1];
      const m = new V().lerpVectors(p, q, 0.3 + 0.4 * hash(seed, l * 31 + 1, i));
      m.addScaledVector(R, (hash(seed, l * 31 + 2, i) - 0.5) * 2 * amp).addScaledVector(U, (hash(seed, l * 31 + 3, i) - 0.5) * 2 * amp);
      nx.push(m, q);
    }
    pts = nx;
    amp *= decay;
  }
  return pts;
}

// how bright a strike is d seconds after it (one flash, a dark gap, a re-strike, the tail)
export const flashCurve = (d) => (d < 0 || d >= 0.5 ? 0 : d < 0.06 ? 1 : d < 0.12 ? 0.3 : d < 0.2 ? 0.8 : 1 - invLerp(0.2, 0.5, d));

export function createStorm(E) {
  const { C, camera } = E;
  // each strike, with the camera of the shot it falls in (pure: evalFrame is a function of the frame)
  const strikes = LIGHTNING.map((t0, i) => {
    const st = evalFrame(Math.round(t0 * 24));
    return { t0, i, set: st.set, sid: st.sid, cam: st.cam, isRod: Math.abs(t0 - C.bolt) < 1e-3 };
  });

  // a far strike stands where Sea lights the clouds: from the cloud base down through that point to the sea
  function placeFar(s) {
    if (s.place) return s.place;
    const c = s.cam, pos = new V(...c.pos);
    let mid = LIGHTNING_POS[s.i] ? new V(...LIGHTNING_POS[s.i]) : null;
    if (!mid) {
      const f = new V(...c.look).sub(pos); f.y = 0; f.normalize();
      mid = pos.clone().addScaledVector(f, 1800); mid.y = 600;
    }
    const toCam = pos.clone().sub(mid); toCam.y = 0; toCam.normalize();
    const side = new V(-toCam.z, 0, toCam.x);
    const top = mid.clone().addScaledVector(side, hr(s.i, 1, 4, -160, 160)); top.y = 820;
    const base = mid.clone().addScaledVector(side, hr(s.i, 1, 5, -120, 120)); base.y = 0;
    s.place = { base, top };
    return s.place;
  }

  function rodTip() { return E.anchor(E.ctx.mech, 'rod', [LAMPROOM.center[0], LAMPROOM.floorY + LAMPROOM.height + 3.4, LAMPROOM.center[2]]); }

  // a tree of forks between top and bottom: kinks go sideways to the stroke on screen, never back along it,
  // so the bolt always reads as falling
  function drawBolt(top, bot, seed, k, scaleM, f0lo = 0.12, thick = 1, forks = -1) {
    const fwd = new V(0, 0, -1).applyQuaternion(camera.quaternion);
    const along = bot.clone().sub(top).normalize();
    const R = new V().crossVectors(along, fwd).normalize();
    const U = new V().crossVectors(R, along).normalize().multiplyScalar(0.25);
    const trunk = boltPts(top, bot, seed, R, U.clone().multiplyScalar(0.3), 0.17, 6, 0.58);
    const pw = 1.6 * k;
    const dist = camera.position.distanceTo(bot.clone().lerp(top, 0.5));
    const mpp = (dist * Math.tan((camera.fov * Math.PI) / 360) * 2) / 1080;
    const w0 = Math.max(2.4, (0.9 / Math.max(mpp, 1e-3)) * scaleM);
    const TW = Math.min(Math.max(w0, 4), 9) * thick;
    const tw = (s) => 0.6 + 0.4 * (1 - s * 0.5);
    // ink under-stroke first: a dark navy outline round the whole trunk, so it reads as drawn
    E.lines.push(trunk, { px: TW * 1.9, m: 0, width: tw, color: [0.03, 0.05, 0.12], hot: [0.03, 0.05, 0.12], power: Math.min(k * 1.2, 1), soft: 0, mode: 0, bias: 30, rim: 0 });
    E.lines.push(trunk, { px: TW, m: 0, width: tw, color: COLD, hot: [1, 1, 1], power: pw, soft: 40, mode: 0, bias: 30, rim: 0.7 });
    const nF = forks >= 0 ? forks : 3 + Math.floor(hash(seed, 2, 1) * 4);
    for (let j = 0; j < nF; j++) {
      const f0 = hr(seed, j, 3, f0lo, 0.88), at = trunk[Math.floor(f0 * (trunk.length - 1))];
      const L = top.distanceTo(bot) * hr(seed, j, 4, 0.35, 0.7) * (1 - f0 * 0.5);
      const sgn = hash(seed, j, 5) < 0.5 ? -1 : 1;
      const end = at.clone().addScaledVector(R, sgn * L * hr(seed, j, 6, 0.4, 0.8)).addScaledVector(along, L * hr(seed, j, 7, 0.5, 0.9));
      const bR = new V().crossVectors(end.clone().sub(at).normalize(), fwd).normalize();
      const br = boltPts(at, end, seed * 7 + j, bR, U.clone().multiplyScalar(0.3), 0.22, 4, 0.5);
      // forks flicker out a frame before the trunk
      const fk = k * (hash(seed, j, 8 + Math.floor(E.t * 24)) < 0.15 ? 0.4 : 1);
      E.lines.push(br, { px: TW * 0.5 * 1.8, m: 0, width: (s) => 1 - s * 0.85, color: [0.03, 0.05, 0.12], hot: [0.03, 0.05, 0.12], power: Math.min(fk * 1.2, 1), soft: 0, mode: 0, bias: 30, rim: 0 });
      E.lines.push(br, { px: TW * 0.5, m: 0, width: (s) => 1 - s * 0.85, color: COLD, hot: [0.95, 0.97, 1], power: 1.3 * fk, soft: 14, mode: 0, bias: 30, rim: 0.4 });
      if (hash(seed, j, 9) < 0.6) {
        const g = br[Math.floor(br.length * hr(seed, j, 10, 0.3, 0.7))];
        const e2 = g.clone().addScaledVector(R, sgn * L * 0.3).addScaledVector(along, L * 0.35);
        const cR = new V().crossVectors(e2.clone().sub(g).normalize(), fwd).normalize();
        E.lines.push(boltPts(g, e2, seed * 13 + j, cR, U, 0.2, 4, 0.6), { px: TW * 0.28, m: 0, width: (s) => 1 - s, color: COLD, hot: [0.9, 0.95, 1], power: 1.1 * fk, soft: 8, mode: 0, bias: 30, rim: 0.3 });
      }
    }
    return trunk;
  }

  // glass of the lantern room thrown out by the strike: a few big drawn shards and a spray of sparks
  function glassBurst() {
    const a = E.t - C.bolt;
    if (a < 0 || a > 2.2) return;
    const Lc = new V(...LAMPROOM.center), rad = LAMPROOM.radius, fy = LAMPROOM.floorY;
    const fl = flashCurve(a);
    for (let i = 0; i < 24; i++) {
      // the bolt came down on the sea side: most panes go out toward +X/-Z (Mech breaks the same quadrant)
      const th = hr(i, 31, 1, -1.6, 1.6), y0 = fy + hr(i, 31, 2, 0.6, 3.6);
      const out = new V(Math.cos(th), 0, Math.sin(th));
      const v0 = hr(i, 31, 3, 4, 10), vy = hr(i, 31, 4, 1, 7);
      const tf = Math.max(0, a - hr(i, 31, 5, 0, 0.05));
      const wind = new V(4, 0, 1.5).multiplyScalar(tf * tf * 0.5);
      const P = Lc.clone().addScaledVector(out, rad + v0 * tf).add(wind); P.y = y0 + vy * tf - 4.9 * tf * tf;
      const sz = hr(i, 31, 6, 0.6, 1.4) * (i < 8 ? 1.6 : 1);
      const sp = hr(i, 31, 7, 4, 11);
      E.shards.push(P.x, P.y, P.z, th + sp * tf, sp * 0.6 * tf + i, sp * 0.3 * tf, sz, sz * hr(i, 31, 8, 0.5, 1.1), 0.03, fl > 0.4 ? '#f2fbff' : '#9fc4d8');
      // a glint on the big ones while the flash lasts, and whenever they turn their face to us
      if (i < 10 && (fl > 0.2 || Math.sin(tf * sp * 1.7 + i) > 0.93)) E.glows.push(P, { kind: GLOW.kira, m: 1.2 * sz, color: [0.8, 0.9, 1], power: 0.9, mode: 0, bias: 2, rot: i * 0.7 });
    }
    // sparks: short white-gold strokes off the rod and the dome, cooling to blue
    if (a < 0.9) {
      const tip = rodTip();
      for (let i = 0; i < 40; i++) {
        const th = hash(i, 33, 1) * 6.283, el = hr(i, 33, 2, -0.6, 1.0), v = hr(i, 33, 3, 8, 26);
        const dir = new V(Math.cos(th) * Math.cos(el), Math.sin(el), Math.sin(th) * Math.cos(el));
        const tf = a, P = tip.clone().addScaledVector(dir, v * tf); P.y -= 4.9 * tf * tf;
        const Q = P.clone().addScaledVector(dir, -v * 0.09); Q.y += 9.8 * tf * 0.09;
        const k = 1 - smooth(invLerp(0.25, 0.9, a));
        E.beams.push([Q, Q.clone().lerp(P, 0.5), P], { m: 0.09, px: 2.4, width: (s) => s, color: a < 0.3 ? [1, 0.9, 0.65] : [0.6, 0.75, 1], hot: [1, 1, 1], power: 1.4 * k, core: 0.5, soft: 3, seed: i * 0.3, mode: 0, bias: 3 });
      }
    }
  }

  return {
    strikes,
    update(st) {
      const t = E.t;
      let flash = 0;
      const interior = INTERIOR.has(st.set);
      for (const s of strikes) {
        const d = t - s.t0;
        if (d < -0.01 || d > 0.55) continue;
        const k = flashCurve(d);
        flash = Math.max(flash, k);
        // three drawings on threes: the strike, a dim gap with the forks redrawn, the re-strike
        const dr = Math.floor(Math.max(d, 0) * 8);
        const pw = dr === 0 ? 1 : dr === 1 ? 0.3 : 0.9;
        if (s.isRod) {
          const tip = rodTip();
          // from the cloud, high and to the upper left of the frame, falling onto the rod (laid out in the camera's own plane)
          const cu = new V(0, 1, 0).applyQuaternion(camera.quaternion), cr = new V(1, 0, 0).applyQuaternion(camera.quaternion);
          // the forked part fills the frame round the rod; above it the trunk runs on up out of frame to the cloud
          const D = camera.position.distanceTo(tip), hf = D * Math.tan((camera.fov * Math.PI) / 360);
          const top = tip.clone().addScaledVector(cu, hf * 1.25).addScaledVector(cr, -hf * 0.7);
          const cloud = top.clone().addScaledVector(cu, hf * 3).addScaledVector(cr, -hf * 0.6).add(new V(0, 200, 0));
          if (!interior && d < 0.375) {
            drawBolt(top, tip, 77, pw, 1.0, 0.04, 1.4);
            drawBolt(cloud, top, 79, pw, 1.0, 0.99, 1.6, 0);
            // the cloud it came from lights up from inside, a cold bloom over the top of the frame
            E.glows.push(top.clone().lerp(cloud, 0.35), { kind: GLOW.soft, m: hf * 2.2, color: [0.45, 0.58, 0.85], power: 0.55 * pw, mode: 2, cap: 0.7 });
            E.glows.push(tip, { kind: GLOW.burst, m: 3.2, color: [0.7, 0.85, 1], power: 1.4 * pw, mode: 2, seed: 0.3 + Math.floor(d * 24) * 0.17 });
            E.glows.push(tip, { kind: GLOW.soft, m: 14, color: [0.6, 0.75, 1], power: 0.55 * pw, mode: 2, cap: 0.35 });
          }
          E.light.point(tip, [0.85, 0.92, 1.0], 45, 0.7 * k);
        } else if (interior) {
          // seen through a window: a cold slab of light across the room
          const o = E.setOrigin(st.set);
          if (o) E.light.point(o.clone().add(new V(2.5, 2.5, 2.5)), [0.7, 0.8, 1.0], 14, 0.6 * k);
        } else {
          const { base, top } = placeFar(s);
          if (d < 0.375) drawBolt(top, base, 101 + s.i * 31, pw, 3.0);
          E.light.point(top.clone().lerp(base, 0.55), [0.7, 0.8, 1.0], 5200, 0.45 * k);
        }
      }
      E.flash = flash;
      glassBurst();
    },
  };
}
