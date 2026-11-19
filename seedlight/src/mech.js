// SEEDLIGHT, mech department: THE LANTERN (hero), its loose arm, and the kite skiff. See CONTRACT.md.
import * as THREE from 'three';
import { addWarLight } from './glsl.js';
import { CUES } from './shots.js';
import { irisHeat } from './layout.js';
import { onTwos, smooth, clamp, lerp } from './util.js';
import { breathe } from './motion.js';
import { mechMaterial } from './mech-mat.js';
import { buildLantern, SK, FAN_A, FAN_B } from './mech-lantern.js';
import { buildSkiff, poseSkiff, SKIFF } from './mech-skiff.js';
import { solveLimb, setWorldQ } from './mech-rig.js';
import { poseAt, flinch, dynAim, dir } from './mech-act.js';

const D = Math.PI / 180;
const V3 = THREE.Vector3;
const _a = new V3(), _b = new V3(), _c = new V3(), _n = new V3(), _f = new V3(), _x = new V3(), _y = new V3(), _z = new V3(), _t = new V3(), _p = new V3();
const _M = new THREE.Matrix4(), _Q = new THREE.Quaternion(), _Q2 = new THREE.Quaternion(), _E = new THREE.Euler();
const basis = (x, y, z, out) => out.setFromRotationMatrix(_M.makeBasis(x, y, z));

export async function createMech(ctx) {
  const lm = mechMaterial(), sm = mechMaterial();
  sm.uniforms.uMoss.value = 0; sm.uniforms.uCrack.value = 0;
  const L = buildLantern(lm), S = buildSkiff(sm);
  const j = L.j;
  ctx.scene.add(L.root, L.loose, S.root);
  ctx.shadowRoots.push(L.root, L.loose, S.root);
  const FLOORS = ['vaultFloor', 'roofFloor', 'keepRoof', 'crown', 'deck', 'court'];
  for (const m of L.meshes) ctx.colliders.push({ name: 'lantern:' + m.parent.name, dept: 'mech', obj: m, kind: 'body', contact: [...FLOORS, 'parapet', 'dais', 'tower'] });
  ctx.colliders.push({ name: 'skiffHull', dept: 'mech', obj: S.hullMesh, kind: 'solid' });
  const DROPS = [['fanBL6', 0, 1], ['fanBR5', 1, -1], ['fanBL3', 2, 1], ['fanBR7', 3, -1], ['fanBL1', 4, 1], ['fanBR2', 5, -1]];
  for (const [n] of DROPS) j[n].userData.rest = j[n].position.clone();
  const leftArm = ['shL', 'elL', 'wrL'].map((n) => j[n]);

  function hand(side, wr, n, f) {
    _n.copy(n).normalize(); _f.copy(f).addScaledVector(_n, -f.dot(_n)).normalize();
    if (side < 0) { _x.copy(_n); _y.copy(_f).negate(); _z.crossVectors(_x, _y); }
    else { _x.copy(_n).negate(); _y.copy(_f).negate(); _z.crossVectors(_x, _y); }
    setWorldQ(wr, basis(_x, _y, _z, _Q));
  }
  function fingers(pre, L_, s, curl, extra0 = 0) {
    for (let i = 0; i < 3; i++) {
      const c = clamp(curl + (i === 0 ? extra0 : 0), -0.1, 1.1);
      j[pre + 'f' + L_ + i + 'a'].rotation.z = -s * c * 1.15; j[pre + 'f' + L_ + i + 'b'].rotation.z = -s * c * 1.35;
    }
    j[pre + 't' + L_ + 'a'].rotation.set(-0.95, -s * (0.2 + curl * 0.7), 0); j[pre + 't' + L_ + 'b'].rotation.z = -s * curl * 0.9;
  }
  const S0 = new V3(-119.0, 65.5, 1.3), S1 = new V3(-116.9, 62.33, -0.85), W0 = new V3(-118.85, 63.0, 1.26), W1 = new V3(-118.9, 62.17, 0.55);

  function poseLantern(t, inside) {
    const tt = onTwos(t);
    const p = poseAt(tt);
    if (p.fly > 0.001) {                                  // flights travel on ones: the whole figure rides the true path
      const q = poseAt(t), dx = (q.pel[0] - p.pel[0]) * p.fly, dy = (q.pel[1] - p.pel[1]) * p.fly, dz = (q.pel[2] - p.pel[2]) * p.fly;
      for (const k of ['pel', 'hR', 'hL', 'fL', 'fR']) { p[k] = [p[k][0] + dx, p[k][1] + dy, p[k][2] + dz]; }
    }
    const fl = flinch(tt), fw = dir(p.yaw, [0, 0, 1]);
    const br = breathe(tt, 3.6, 1);
    j.pelvis.position.set(p.pel[0] - fw[0] * 0.3 * fl, p.pel[1] - 0.08 * fl, p.pel[2] - fw[2] * 0.3 * fl);
    j.pelvis.rotation.set((p.pitch - 12 * fl) * D, p.yaw * D, p.roll * D, 'YXZ');
    j.waist.rotation.set((p.waist[0] - 6 * fl) * D, p.waist[1] * D, p.waist[2] * D, 'YXZ');
    j.chest.rotation.set((p.chest[0] - 5 * fl - 1.2 * br) * D, p.chest[1] * D, (p.chest[2] + 4 * fl) * D, 'YXZ');
    j.pelvis.updateMatrixWorld(true);
    // head: FK, then aimed
    j.head.rotation.set((p.head[0] + 10 * fl) * D, p.head[1] * D, p.head[2] * D, 'YXZ');
    const da = dynAim(t, ctx.land, _t);
    const aim = da || p.aim, aimK = da ? 1 : p.aimK;
    if (aimK > 0.001) {
      _Q2.copy(j.head.quaternion);
      for (let it = 0; it < 2; it++) {
        j.head.updateMatrixWorld(true);
        j.iris.getWorldPosition(_a);
        _z.set(aim[0], aim[1], aim[2]).sub(_a).normalize();
        _y.set(0, 1, 0).transformDirection(j.chest.matrixWorld);
        if (Math.abs(_y.dot(_z)) > 0.97) _y.set(0, 0, -1).transformDirection(j.chest.matrixWorld);
        _x.crossVectors(_y, _z).normalize(); _y.crossVectors(_z, _x);
        setWorldQ(j.head, basis(_x, _y, _z, _Q));
      }
      _Q.copy(j.head.quaternion); j.head.quaternion.copy(_Q2).slerp(_Q, aimK);
    }
    j.head.updateMatrixWorld(true);
    // right arm
    _n.set(...p.hnR); _f.set(...p.hfR); _a.set(...p.hR);
    if (p.chestK > 0.001) {
      _b.set(0, SK.crest[1], SK.crest[2] + 0.07).applyMatrix4(j.chest.matrixWorld);
      _a.lerp(_b, p.chestK);
      _n.lerp(_c.set(0, 0, -1).transformDirection(j.chest.matrixWorld), p.chestK);
      _f.lerp(_c.set(0.9, 0.45, 0).transformDirection(j.chest.matrixWorld), p.chestK);
    }
    const n = _n.clone().normalize(), f = _f.clone().addScaledVector(n, -_f.dot(n)).normalize();
    _b.copy(_a).addScaledVector(n, -SK.palm[0]).addScaledVector(f, SK.palm[1]);
    j.shR.getWorldPosition(_c); _p.set(...p.epR).multiplyScalar(3).add(_c);
    solveLimb(j.shR, j.elR, SK.L1a, SK.L2a, _b, _p);
    hand(-1, j.wrR, n, f);
    const tw = tt - CUES.twitch;
    fingers('', 'R', -1, p.curl, tw > 0 && tw < 0.5 ? 0.55 * Math.sin(Math.PI * tw / 0.5) : 0);
    // left arm (until it tears off)
    const has = t < CUES.armDrop;
    for (const g of leftArm) g.visible = has;
    if (has) {
      _n.set(...p.hnL).normalize(); _f.set(...p.hfL); _f.addScaledVector(_n, -_f.dot(_n)).normalize();
      _b.set(...p.hL).addScaledVector(_n, -SK.palm[0]).addScaledVector(_f, SK.palm[1]);
      j.shL.getWorldPosition(_c);
      if (tt > 8.3) { const k = smooth((tt - 8.3) / 0.5); _b.lerp(_p.copy(_c).add(_t.set(0.15, -2.6, 0)), k); _b.y = Math.max(_b.y, 62.14); _n.lerp(_t.set(0.3, 0, 1), k).normalize(); _f.lerp(_t.set(0, -1, 0), k); _f.addScaledVector(_n, -_f.dot(_n)).normalize(); }
      _p.set(...p.epL).multiplyScalar(3).add(_c);
      solveLimb(j.shL, j.elL, SK.L1a, SK.L2a, _b, _p);
      hand(1, j.wrL, _n.clone(), _f.clone());
      fingers('', 'L', 1, 0.04 + 0.3 * smooth((tt - 8.3) / 0.5));
    }
    // legs
    for (const [s, Ln] of [[1, 'L'], [-1, 'R']]) {
      _y.set(...p['fu' + Ln]).normalize();
      _a.set(...p['f' + Ln]).addScaledVector(_y, SK.ankleH);
      j['hip' + Ln].getWorldPosition(_c); _p.set(...p['kp' + Ln]).multiplyScalar(3).add(_c);
      solveLimb(j['hip' + Ln], j['kn' + Ln], SK.L1, SK.L2, _a, _p);
      _z.set(...p['ff' + Ln]); _z.addScaledVector(_y, -_z.dot(_y)).normalize(); _x.crossVectors(_y, _z);
      setWorldQ(j['an' + Ln], basis(_x, _y, _z, _Q));
    }
    // fans
    for (let i = 0; i < FAN_A; i++) j['fanA' + i].rotation.x = p.fanA * (i - 3) * 0.36;
    for (let i = 0; i < FAN_B; i++) { const a = p.fanB * (0.55 + i * 0.3) + 0.04 * i * (1 - p.fanB); j['fanBL' + i].rotation.z = a; j['fanBR' + i].rotation.z = -a; }
    // after the last salvo, fan blades tear loose and fall to the roof (pure function of t)
    for (const [n, i, sd] of DROPS) {
      const g = j[n], d = t - CUES.lastSalvo - 0.12 * i;
      g.position.copy(g.userData.rest);
      if (d > 0) {
        g.getWorldPosition(_a);
        const fall = Math.min(4.9 * d * d, Math.max(0, _a.y - 214.2)), fr = Math.min(d, Math.sqrt(Math.max(0, _a.y - 214.2) / 4.9));
        _a.set(_a.x + sd * 1.2 * fr, _a.y - fall, _a.z - (0.9 + 0.25 * i) * fr);
        g.parent.worldToLocal(_a); g.position.copy(_a);
        g.rotation.x = fr * (2 + i); g.rotation.y = fr * 1.3 * sd;
      } else { g.rotation.x = 0; g.rotation.y = 0; }
    }
    // the loose arm
    L.loose.visible = !has && t < 17.4;
    if (!has) {
      const u = clamp((t - CUES.armDrop) / 0.42), g = u * u, bo = u >= 1 ? 0.12 * Math.exp(-(t - CUES.armDrop - 0.42) * 9) * Math.abs(Math.sin((t - CUES.armDrop - 0.42) * 16)) : 0;
      L.loose.position.copy(S0).lerp(S1, g); L.loose.position.y += bo;
      L.loose.updateMatrixWorld(true);
      _b.copy(W0).lerp(W1, g); _b.y += bo * 0.5;
      _p.copy(L.loose.position).add(_t.set(0.6, 3 * (1 - g) + 0.25, 1 + g));
      solveLimb(j.looseshL, j.looseelL, SK.L1a, SK.L2a, _b, _p);
      _n.set(0.4 * (1 - g), -g - 0.05, 1 - g).normalize(); _f.set(-0.6 * g, -(1 - g), 0.8 * g + 0.1); _f.addScaledVector(_n, -_f.dot(_n)).normalize();
      hand(1, j.loosewrL, _n.clone(), _f.clone());
      fingers('loose', 'L', 1, 0.35);
    }
    // iris, glass, crest, damage
    const h = irisHeat(t), hot = clamp(h - 1), on = clamp(h);
    const u = lm.uniforms;
    u.uIrisC.value.setRGB(lerp(1.45, 1.9, hot) * on, lerp(0.92, 1.85, hot) * on, lerp(0.28, 1.6, hot) * on);
    u.uIrisK.value = clamp(h * 1.6); u.uGlassK.value = 0.09 * on + 0.08 * hot;
    j.iris.scale.setScalar(Math.max(0.06, smooth(on)) * p.irisS * (1 + 0.04 * Math.sin(tt * 9) * on));
    u.uCrest.value = smooth((t - CUES.chestLit) / 0.35) * (1 - smooth((t - CUES.shell1Hit) / 0.15)) + smooth((t - CUES.lift + 1.2) / 0.6) * (1 - smooth((t - CUES.lastSalvo) / (CUES.irisOut - CUES.lastSalvo)));
    u.uCrack.value = 0.12 + 0.38 * smooth((t - CUES.shell1Hit) / 0.2) + 0.25 * smooth((t - CUES.broadside - 1.2) / 0.4) + 0.25 * smooth((t - CUES.lastSalvo) / 0.6);
    const burn = 0.75 * smooth((t - CUES.hullBurn - 0.9) / 0.6) + 0.25 * smooth((t - CUES.lastSalvo) / 0.3);
    u.uCrackGlow.value = t < CUES.lastSalvo + 0.6 ? burn * (0.85 + 0.15 * Math.sin(tt * 13)) : lerp(1, 0.06, smooth((t - CUES.lastSalvo - 0.6) / 2.2));
    L.root.updateMatrixWorld(true); L.loose.updateMatrixWorld(true);
    // its own light: the iris lights what it looks at, the crest lights the girl
    if (on > 0.02) {
      j.iris.getWorldPosition(_a); _z.set(0, 0, 1).transformDirection(j.head.matrixWorld);
      const k = on * (1 + 0.25 * hot);
      const g = inside ? 0.55 : 0.34, d = inside ? 3.4 : 2.6;
      addWarLight({ a: [_a.x + _z.x * d, _a.y + _z.y * d, _a.z + _z.z * d], r: inside ? 9.5 : 4.8, c: [g * k, lerp(0.64, 0.95, hot) * g * k, lerp(0.22, 0.85, hot) * g * k] });
    }
    if (u.uCrest.value > 0.02) { _b.set(0, SK.crest[1], SK.crest[2] + 1.8).applyMatrix4(j.chest.matrixWorld); addWarLight({ a: [_b.x, _b.y, _b.z], r: 3.6, c: [0.32 * u.uCrest.value, 0.2 * u.uCrest.value, 0.07 * u.uCrest.value] }); }
  }

  const ANCH = {
    iris: (v) => j.iris.getWorldPosition(v),
    head: (v) => v.set(0, 0.74, 0).applyMatrix4(j.head.matrixWorld),
    chest: (v) => v.set(...SK.crest).applyMatrix4(j.chest.matrixWorld),
    palm: (v) => v.set(-SK.palm[0], SK.palm[1], 0).applyMatrix4(j.wrR.matrixWorld).addScaledVector(_x.set(1, 0, 0).transformDirection(j.wrR.matrixWorld), 2 * SK.palm[0]),
    shoulderL: (v) => v.set(SK.shX, SK.shY, SK.shZ).applyMatrix4(j.chest.matrixWorld),
    looseArm: (v) => j.looseelL.getWorldPosition(v),
    shoulderR: (v) => j.shR.getWorldPosition(v),
    tiller: (v) => v.set(0, 0.25, 0.9).applyMatrix4(S.j.tiller.matrixWorld),
    seatPilot: (v) => v.set(...SKIFF.seatPilot).applyMatrix4(S.root.matrixWorld),
    seatBoy: (v) => v.set(...SKIFF.seatBoy).applyMatrix4(S.root.matrixWorld),
    hook: (v) => v.set(...SKIFF.hook).applyMatrix4(S.root.matrixWorld),
    skiffNose: (v) => v.set(...SKIFF.nose).applyMatrix4(S.root.matrixWorld),
  };
  return {
    lantern: L.root, skiff: S.root, looseArm: L.loose,
    anchor(name, v) { const f = ANCH[name]; return f ? f(v) : null; },
    palmUp(v) { return v.set(1, 0, 0).transformDirection(j.wrR.matrixWorld); },
    headForward(v) { return v.set(0, 0, 1).transformDirection(j.head.matrixWorld); },
    update(st) {
      const t = st.t;
      const inside = st.set === 'vault' || st.set === 'shaft' || (st.sid === 's08' && t < CUES.burst - 0.05);
      lm.uniforms.uDim.value = inside ? 0.34 : 1;
      poseLantern(t, inside);
      S.root.visible = t > 49.5;
      poseSkiff(S, t);
      if (st.sid === 's21') { const q = S.root.position; addWarLight({ a: [q.x, q.y - 3.5, q.z - 1], r: 11, c: [1.1, 0.5, 0.18] }); }
      S.root.updateMatrixWorld(true);
    },
  };
}
