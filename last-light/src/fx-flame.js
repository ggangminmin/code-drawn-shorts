import * as THREE from 'three';
import { hash, hr, GLOW } from './fx-core.js';
import { LENS, beamOn } from './layout.js';
import { clamp, smooth, invLerp, noise1 } from './util.js';
import { STAGE } from './cams/fx.js';

// The fire of the lamp: the match strike (s08), the kerosene mantle catching, the light multiplying through the lens
// prisms, the flame guttering in the spray and holding (s22), and the lamp seen from outside (the source of the beam).
const V = THREE.Vector3;
const AMBER = [1.0, 0.62, 0.26], GOLDW = [1.0, 0.88, 0.62];

export function createFlame(E) {
  const { C, camera } = E;

  const burner = () => E.anchor(E.ctx.mech, 'burner', LENS.center);
  const focus = () => E.anchor(E.ctx.mech, 'lensFocus', LENS.center);
  // her paw with the match; without Folk, a place just beside the burner on the room side
  function matchPos(b) {
    const h = E.folkAnchor('suri', 'handR');
    if (h) return h;
    // carried in from her side of the lens toward the mantle, just in front of the burner
    const t = E.t, u = smooth(invLerp(C.matchStrike + 0.15, C.mantleCatch, t));
    const toCam = camera.position.clone().sub(b); toCam.y = 0;
    const toH = new V(STAGE.suriHead[0] - b.x, 0, STAGE.suriHead[2] - b.z).normalize();
    const side = new V(-toH.z, 0, toH.x);
    return b.clone().addScaledVector(toH, 0.24 - 0.12 * u).addScaledVector(side, -0.1 + 0.05 * u).add(new V(0, -0.05 + 0.04 * u, 0));
  }

  // how big the mantle flame is (0 out .. 1 full) and how hard it is being pushed by the wind (lean)
  function flameState(t) {
    if (t < C.mantleCatch) return { size: 0, lean: 0 };
    // catches small and blue, then climbs gold
    let size = smooth(invLerp(C.mantleCatch, C.mantleCatch + 0.6, t)) * (0.35 + 0.65 * smooth(invLerp(C.mantleCatch + 0.15, C.mantleCatch + 0.9, t)));
    let lean = 0;
    if (t > C.sprayHit - 0.1 && t < C.flameSave + 0.6) {
      // the spray hits: the flame is flattened, almost drowned, flickers on threes; cupped paws save it
      const hit = smooth(invLerp(C.sprayHit - 0.1, C.sprayHit + 0.1, t)) * (1 - smooth(invLerp(C.flameSave, C.flameSave + 0.55, t)));
      const fl = 0.5 + 0.5 * noise1(Math.floor(t * 8) * 3.1, 7);
      size *= 1 - hit * (0.55 + 0.35 * fl);
      lean = hit * (0.5 + 0.5 * fl);
    }
    if (t > C.cupFall && t < C.mantleCatch) size = 0;
    return { size, lean };
  }

  function lampFlame(b, size, lean, near) {
    if (size <= 0.01) return;
    const D = Math.floor(E.t * 8);
    const flick = 0.92 + 0.12 * hash(D, 3, 1);
    // the mantle: a white-hot sock with a gold flame wrapped round it
    const h = 0.13 * size * flick;
    const P = b.clone().add(new V(0, h * 0.45, 0));
    const rot = -lean * 0.9;
    E.glows.push(P, { kind: GLOW.flame, m: h, aspect: 0.62, color: AMBER, power: 1.25, mode: near ? 2 : 0, bias: 0.4, seed: (D % 5) * 0.31 + 0.1, rot, cap: 0.6 });
    E.glows.push(b.clone().add(new V(0, 0.035, 0)), { kind: GLOW.disc, m: 0.012 * (0.6 + 0.4 * size), color: GOLDW, power: 1.3, mode: near ? 2 : 0, bias: 0.4, cap: 0.3 });
    E.glows.push(P, { kind: GLOW.soft, m: 0.4 * size, color: AMBER, power: 0.4 * size, mode: near ? 2 : 0, bias: 1.5, cap: 0.5 });
  }

  // the lens multiplies the flame: horizontal prism rings each carry a slice of it, the bullseye a big disc;
  // drawn on the lens face toward the camera, so it reads as the brass-and-glass beehive full of fire
  function lensBloom(f, k) {
    if (k <= 0.01) return;
    const cam = camera.position;
    const toCam = cam.clone().sub(f); toCam.y = 0;
    const dCam = toCam.length();
    if (dCam < LENS.radius + 0.35) return;
    toCam.normalize();
    const side = new V(-toCam.z, 0, toCam.x);
    const R = LENS.radius * 0.98, D = Math.floor(E.t * 8);
    const face = f.clone().addScaledVector(toCam, R);
    // central bullseye
        E.glows.push(face, { kind: GLOW.flame, m: 0.09 * k, aspect: 0.62, color: AMBER, power: 1.2 * k, mode: 0, bias: 0.6, seed: (D % 5) * 0.29, cap: 0.3 });
    // prism rings above and below: horizontal bars of fire, each with flame images strung along it
    for (let j = -5; j <= 5; j++) {
      if (j === 0) continue;
      const y = j * 0.17 + (j > 0 ? 0.08 : -0.08);
      if (Math.abs(y) > LENS.height * 0.5) continue;
      const fall = 1 - Math.abs(j) / 7;
      const curve = Math.sqrt(Math.max(0, 1 - (y / (LENS.height * 0.6)) ** 2));
      const c = f.clone().addScaledVector(toCam, R * curve).add(new V(0, y, 0));
      E.glows.push(c, { kind: GLOW.streak, m: 0.5 * curve * k, aspect: 1.0, color: GOLDW, power: 0.55 * fall * k, mode: 0, bias: 0.6, cap: 0.6 });
      for (let q = -2; q <= 2; q++) {
        const th = q * 0.32 + (hash(j, q, D % 3) - 0.5) * 0.04;
        const p = f.clone().addScaledVector(toCam, R * curve * Math.cos(th)).addScaledVector(side, R * curve * Math.sin(th)).add(new V(0, y, 0));
        E.glows.push(p, { kind: GLOW.flame, m: 0.045 * fall * k, aspect: 0.6, color: AMBER, power: 1.1 * fall * k, mode: 0, bias: 0.6, seed: (j * 5 + q) * 0.17, cap: 0.3 });
      }
    }
    // a few kira on the prism edges
    for (let i = 0; i < 6; i++) {
      const th = hr(i, D % 4, 7, -0.9, 0.9), y = hr(i, D % 4, 8, -0.9, 0.9);
      const p = f.clone().addScaledVector(toCam, R * Math.cos(th)).addScaledVector(side, R * Math.sin(th)).add(new V(0, y, 0));
      E.glows.push(p, { kind: GLOW.kira, m: 0.07 * k, color: GOLDW, power: 0.8 * k, mode: 0, bias: 0.6, rot: 0.2 + i });
    }
  }

  // the match: a spark burst at the strike, then a small flame in her paw carried to the mantle
  function match() {
    const t = E.t;
    if (t < C.matchStrike - 0.05 || t > C.mantleCatch + 0.5) return;
    const b = burner(), p = matchPos(b);
    const a = t - C.matchStrike;
    if (a < 0) return;
    const D = Math.floor(t * 8);
    if (a < 0.2) {
      // the strike: a burst of sparks and a hard white flare
      E.glows.push(p, { kind: GLOW.burst, m: 0.022, color: [1, 0.8, 0.45], power: 1.5, mode: 2, seed: 0.2 + D * 0.13, cap: 0.18 });
      for (let i = 0; i < 9; i++) {
        const th = hash(i, 41, 1) * 6.283, el = hr(i, 41, 2, -0.3, 1.2), v = hr(i, 41, 3, 0.6, 1.8);
        const dir = new V(Math.cos(th) * Math.cos(el), Math.sin(el), Math.sin(th) * Math.cos(el));
        const P = p.clone().addScaledVector(dir, v * (a + 0.03)), Q = p.clone().addScaledVector(dir, v * a * 0.5);
        E.beams.push([Q, Q.clone().lerp(P, 0.5), P], { m: 0.004, px: 1.4, width: (s) => s, color: [1, 0.75, 0.35], hot: [1, 1, 0.9], power: 1.5 * (1 - a / 0.2), core: 0.5, soft: 2, seed: i * 0.3, mode: 2 });
      }
    }
    const grow = smooth(invLerp(0.02, 0.25, a)) * (1 - smooth(invLerp(C.mantleCatch - C.matchStrike + 0.15, C.mantleCatch - C.matchStrike + 0.5, a)));
    if (grow > 0.01) {
      E.glows.push(p.clone().add(new V(0, 0.018, 0)), { kind: GLOW.flame, m: 0.032 * grow, aspect: 0.55, color: AMBER, power: 1.3, mode: 2, seed: (D % 5) * 0.23, cap: 0.5 });
      E.glows.push(p, { kind: GLOW.soft, m: 0.12 * grow, color: AMBER, power: 0.4 * grow, mode: 2, cap: 0.4 });
      E.light.point(p, [1.0, 0.66, 0.34], 2.2, 1.5 * grow);
    }
  }

  return {
    flameState,
    update(st) {
      const t = E.t;
      match();
      const b = burner(), f = focus();
      const { size, lean } = flameState(t);
      const camD = camera.position.distanceTo(b);
      const near = camD < 25;
      if (t < C.bolt) {
        // the old lamp, before the strike: the source of the hook's beam
        lampFlame(b, 1, 0, near);
      } else lampFlame(b, size, lean, near);
      const lit = t < C.bolt ? 1 : beamOn(t);
      if (near) {
        if (t >= C.mantleCatch) {
          // the lens fills with light a breath after the mantle catches
          lensBloom(f, 0.45 * smooth(invLerp(C.mantleCatch + 0.1, C.mantleCatch + 0.9, t)) * lit * (0.6 + 0.4 * size));
          // (the burner's warm light on her face is Mech's warLight)
        }
      } else if (lit > 0.01) {
        // from outside: the lamp is a hard gold-white point inside the lantern, and a glare when the beam looks at us
        const toCam = camera.position.clone().sub(f).normalize();
        const az = E.beamDir;
        let face = 0;
        for (const dir of [az, az.clone().multiplyScalar(-1)]) face = Math.max(face, dir.dot(toCam));
        const g = Math.pow(clamp(face), 30) * lit;
        const pxk = clamp(60 / Math.max(camera.position.distanceTo(f), 1), 0.25, 1.6);   // bigger when close
        E.glows.push(f, { kind: GLOW.disc, px: (6 + 10 * g) * pxk, color: GOLDW, power: 1.4 * lit, mode: 0, bias: 5 });
        E.glows.push(f, { kind: GLOW.soft, px: (110 + 420 * g) * pxk, color: GOLDW, power: (0.55 + 0.6 * g) * lit, mode: 0, bias: 5 });
        E.glows.push(f, { kind: GLOW.kira, px: (70 + 200 * g) * pxk, color: GOLDW, power: (0.6 + 0.6 * g) * lit, mode: 0, bias: 5, rot: 0.08 });
      }
    },
  };
}
