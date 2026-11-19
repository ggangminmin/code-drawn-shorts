import * as THREE from 'three';
import { buildCritter } from './folk-rig.js';
import { NARI, TAM, BO, GUARDS } from './folk-species.js';
import { furMaterial, glowMaterial, FL } from './folk-mat.js';
import { paint, hex, merge, ell } from './folk-geo.js';
import { createActing } from './folk-act.js';
import { lightFor } from './folk-lights.js';
import { addWarLight } from './glsl.js';
import { threadOn } from './layout.js';
import { onTwos, noise1 } from './util.js';

// FOLK department: Nari (fennec), Tam (hare), Aunt Bo (stoat), three guards (boar, ram, boar), the glass seed on its cord,
// the hand lamp and the carbines. All poses are pure functions of st.t, sampled on twos (folk-act.js).
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);

function seg(mesh, a, b) {   // stretch a unit Y cylinder between two world points
  _c.copy(b).sub(a); const l = _c.length() || 1e-4;
  mesh.position.copy(a).addScaledVector(_c, 0.5); mesh.quaternion.setFromUnitVectors(UP, _c.multiplyScalar(1 / l)); mesh.scale.set(1, l, 1);
}

function buildCarbine() {
  // local +Z = muzzle direction, origin at the butt plate
  const wood = hex('#5a3a22'), iron = hex('#2e3436'), brass = hex('#b8923e');
  const stock = new THREE.BoxGeometry(0.045, 0.11, 0.34, 1, 2, 4); stock.translate(0, -0.03, 0.17);
  { const p = stock.attributes.position; for (let i = 0; i < p.count; i++) { const z = p.getZ(i); if (p.getY(i) < -0.05) p.setY(i, p.getY(i) + 0.07 * (z / 0.34)); } stock.computeVertexNormals(); }
  paint(stock, () => wood);
  const fore = new THREE.BoxGeometry(0.042, 0.05, 0.42); fore.translate(0, -0.012, 0.56); paint(fore, () => wood);
  const barrel = new THREE.CylinderGeometry(0.014, 0.016, 0.78, 10); barrel.rotateX(Math.PI / 2); barrel.translate(0, 0.022, 0.72); paint(barrel, () => iron);
  const lock = new THREE.BoxGeometry(0.05, 0.06, 0.14); lock.translate(0, 0.0, 0.38); paint(lock, () => iron);
  const band = new THREE.CylinderGeometry(0.03, 0.03, 0.03, 10); band.rotateX(Math.PI / 2); band.translate(0, 0.005, 0.74); paint(band, () => brass);
  const guard = new THREE.TorusGeometry(0.03, 0.006, 5, 12, Math.PI); guard.rotateY(Math.PI / 2); guard.rotateX(Math.PI); guard.translate(0, -0.035, 0.36); paint(guard, () => brass);
  const m = new THREE.Mesh(merge([stock, fore, barrel, lock, band, guard]), furMaterial({ color: '#ffffff', id: 59, fur: 0, gloss: 0.5, side: THREE.DoubleSide }));
  m.name = 'carbine';
  return m;
}

function buildLamp() {
  // a hand lamp: brass cage, a glowing glass, a ring handle. Origin at the handle top, hanging down -Y.
  const g = new THREE.Group(); g.name = 'handLamp';
  const brass = hex('#b8923e');
  const top = new THREE.CylinderGeometry(0.02, 0.07, 0.05, 12); top.translate(0, -0.1, 0); paint(top, () => brass);
  const base = new THREE.CylinderGeometry(0.075, 0.065, 0.035, 12); base.translate(0, -0.3, 0); paint(base, () => brass);
  const ring = new THREE.TorusGeometry(0.045, 0.007, 5, 14); ring.translate(0, -0.035, 0); paint(ring, () => brass);
  const bars = [];
  for (let i = 0; i < 4; i++) { const b = new THREE.CylinderGeometry(0.005, 0.005, 0.17, 5); const a = i * Math.PI / 2 + 0.4; b.translate(Math.cos(a) * 0.066, -0.2, Math.sin(a) * 0.066); paint(b, () => brass); bars.push(b); }
  const cage = new THREE.Mesh(merge([top, base, ring, ...bars]), furMaterial({ color: '#ffffff', id: 59, fur: 0, gloss: 1, side: THREE.DoubleSide })); cage.name = 'lampCage';
  const glassG = paint(new THREE.CylinderGeometry(0.052, 0.052, 0.15, 14).translate(0, -0.2, 0), () => [1, 1, 1]);
  const glass = new THREE.Mesh(glassG, glowMaterial({ color: '#ffd78a', k: 2.6, id: 121 })); glass.name = 'lampGlass';
  g.add(cage, glass);
  return { root: g, cage, glass };
}

export async function createFolk(ctx) {
  const { scene } = ctx;
  const group = new THREE.Group(); group.name = 'folk'; scene.add(group);
  const nari = buildCritter(NARI), tam = buildCritter(TAM), bo = buildCritter(BO);
  const guards = GUARDS.map((s) => buildCritter(s));
  const all = [nari, tam, bo, ...guards];
  for (const r of all) { group.add(r.root); ctx.shadowRoots.push(r.root); r.root.visible = false; }

  // ---- the seed: a glass teardrop with a bright core, on a cord round her neck
  const seedG = ell(0.02, 0.031, 0.02, 14, 12); { const p = seedG.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y > 0) { const k = 1 - 0.45 * (y / 0.031); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); } } seedG.computeVertexNormals(); }
  paint(seedG, () => [1, 1, 1]);
  const seedMat = glowMaterial({ color: '#ffd166', k: 3, id: 120 });
  const seed = new THREE.Mesh(seedG, seedMat); seed.name = 'seed'; group.add(seed);
  const cordMat = furMaterial({ color: '#6a5640', id: 141, fur: 0, rim: 0 });
  const cordG = paint(new THREE.CylinderGeometry(0.0035, 0.0035, 1, 5), () => [1, 1, 1]);
  const cords = [new THREE.Mesh(cordG, cordMat), new THREE.Mesh(cordG, cordMat)]; cords.forEach((c) => { c.name = 'cord'; group.add(c); });
  const seedPos = new THREE.Vector3();

  const carbines = guards.map(() => { const m = buildCarbine(); group.add(m); m.visible = false; return m; });
  const lamp = buildLamp(); group.add(lamp.root); lamp.root.visible = false;

  const act = createActing(ctx, { nari, tam, bo, guards });

  // QA: every rigid part of the three heroes
  const CONTACT = ['roofFloor', 'roof_floor', 'towerRoof', 'tower_roof', 'roof', 'dais', 'daisStep', 'roofDais', 'parapet', 'skiffHull', 'skiff_hull', 'hull', 'skiffDeck', 'hookBar', 'hook', 'mast'];
  for (const r of [nari, tam, bo]) for (const m of r.parts) ctx.colliders.push({ name: m.name, dept: 'folk', obj: m, kind: 'body', contact: CONTACT });

  const P = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
  const lineup = P.get('folktest');   // ?folktest=1: everyone in a row at y = 300 for turnarounds
  const _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();

  const api = {
    group, nari: { root: nari.root, anchor: nari.anchor, rig: nari }, tam: { root: tam.root, anchor: tam.anchor, rig: tam }, bo: { root: bo.root, anchor: bo.anchor, rig: bo },
    guards: guards.map((g) => ({ root: g.root, anchor: g.anchor, rig: g })),
    lamp: lamp.root, seed,
    anchor(name, v = new THREE.Vector3()) { if (name === 'seed') return v.copy(seedPos); if (name.startsWith('muzzle')) { const m = carbines[+name.slice(6)] ?? carbines[0]; m.updateWorldMatrix(true, false); return m.localToWorld(v.set(0, 0.022, 1.12)); } if (name === 'lamp') return lamp.root.getWorldPosition(v); return nari.anchor(name, v); },
    update(st) {
      const t = st.t;
      let R;
      if (lineup) {
        R = act.lineup(st, lineup); st.folktest = 1;
      } else R = act.poseFor(st);
      const show = (rig, Pz) => { if (Pz) { rig.setPose(Pz); rig.root.visible = true; } else rig.root.visible = false; };
      show(tam, R.tam); show(bo, R.bo);
      guards.forEach((g, i) => show(g, R.guards && R.guards[i]));
      // Nari depends on Tam's hands (the catch): act resolves it after Tam is posed
      const PN = typeof R.nari === 'function' ? R.nari() : R.nari;
      show(nari, PN);
      // ---- seed + cord
      const on = !!PN;
      seed.visible = on; cords.forEach((c) => (c.visible = on));
      if (on) {
        if (PN.seed) seedPos.set(...PN.seed);
        else nari.chest.localToWorld(seedPos.set(0, 0.005, 0.112));
        seed.position.copy(seedPos);
        nari.chest.getWorldQuaternion(seed.quaternion);
        const fl = 1 + 0.08 * noise1(onTwos(t) * 9, 4);
        const k = threadOn(t) * (PN.seedK ?? 1);
        seedMat.uniforms.uK.value = (0.5 + 5.0 * k) * fl;
        cords.forEach((c, i) => seg(c, nari.chest.localToWorld(_a.set(i ? -0.04 : 0.04, 0.2, 0.035)), _b.copy(seedPos).add(_c.set(0, 0.03, 0).applyQuaternion(seed.quaternion))));
        if (k > 0.02) addWarLight({ a: [seedPos.x, seedPos.y, seedPos.z], r: PN.seedR ?? 1.5, c: [0.55 * k, 0.42 * k, 0.2 * k] });
      }
      // ---- props
      (R.guns || []).forEach((gp, i) => {
        const m = carbines[i]; m.visible = !!gp && guards[i].root.visible; if (!m.visible) return;
        _z.set(...gp.dir).normalize(); _y.set(...(gp.up ?? [0, 1, 0])); _x.crossVectors(_y, _z).normalize(); _y.crossVectors(_z, _x);
        m.quaternion.setFromRotationMatrix(_m.makeBasis(_x, _y, _z)); m.position.set(...gp.pos);
      });
      for (let i = (R.guns || []).length; i < carbines.length; i++) carbines[i].visible = false;
      if (R.lamp) {
        lamp.root.visible = true; lamp.root.position.set(...R.lamp.pos);
        if (R.lamp.quat) lamp.root.quaternion.copy(R.lamp.quat); else lamp.root.rotation.set(...(R.lamp.rot ?? [0, 0, 0]));
        const k = R.lamp.k ?? 1; lamp.glass.material.uniforms.uK.value = 0.3 + 2.6 * k;
        lamp.root.updateWorldMatrix(true, false); lamp.root.localToWorld(_a.set(0, -0.2, 0));
        st.lampP = [_a.x, _a.y, _a.z]; st.lampK = k;
        if (k > 0.02) addWarLight({ a: st.lampP, r: 9, c: [1.5 * k, 1.05 * k, 0.5 * k] });
      } else lamp.root.visible = false;
      lightFor(st, ctx, seedPos, on ? threadOn(t) : 0);
    },
  };
  ctx.folk = api;
  return api;
}
