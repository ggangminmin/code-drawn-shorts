// SEEDLIGHT, land department: the Ironclad. 210 m flat-iron gunship, five port broadside turrets, four ringed lift rotors,
// a spine of funnels, belly searchlights. Local frame: +X prow, +Y up, -Z port (the side that faces the dam).
import * as THREE from 'three';
import { Bag, xf, loft } from './land-geo.js';
import { metalMaterial, glowMaterial, LU } from './land-mat.js';
import { shipPos, shipList, SHELLS, TOWER } from './layout.js';
import { CUES } from './shots.js';
import { smooth, clamp } from './util.js';

const sm = smooth;
export const beam = (x) => { const s = (x + 105) / 210; return 30 * (s < 0.45 ? 0.84 + 0.16 * sm(s / 0.45) : 1 - 0.78 * Math.pow((s - 0.45) / 0.55, 2.3)); };
const TUR_X = [-66, -36, -6, 24, 54];
export const SHIP_YAW = 0.2;

export function buildShip(ctx) {
  const root = new THREE.Group(); root.name = 'ironclad';
  const M = {
    hull: metalMaterial({ kind: 2, local: 1, cut: 1, id: 6 }),
    upper: metalMaterial({ kind: 2, local: 1, id: 7 }),
    turret: metalMaterial({ kind: 2, local: 1, id: 8 }),
    iron: metalMaterial({ kind: 1, local: 1, id: 9 }),
    copper: metalMaterial({ kind: 0, local: 1, id: 10 }),
    rotor: glowMaterial({ mode: 1 }),
  };
  // ---- hull loft
  {
    const rows = [];
    const N = 34;
    for (let i = 0; i <= N; i++) {
      const x = -105 + 210 * i / N, s = i / N, b = beam(x);
      const rise = 6 * sm((s - 0.72) / 0.28), keel = -13 + 5 * sm((s - 0.8) / 0.2) + 3 * sm((0.12 - s) / 0.12);
      const sec = [[0, keel], [0.6 * b, keel], [0.9 * b, keel + 4], [b, -3], [b + 0.8, -2], [b + 0.8, 1.5], [b, 2.5], [0.965 * b, 9 + rise], [0.9 * b, 11 + rise], [0, 12.2 + rise]];
      const ring = [];
      for (const [z, y] of sec) ring.push([x, y, -z]);
      for (let k = sec.length - 2; k >= 1; k--) ring.push([x, sec[k][1], sec[k][0]]);
      rows.push(ring);
    }
    const b = new Bag();
    b.add(loft(rows, true));
    // transom and prow plates
    for (const end of [0, N]) {
      const ring = rows[end], c = [ring[0][0], 0, 0];
      const pos = [];
      for (let k = 0; k < ring.length; k++) { const a = ring[k], d = ring[(k + 1) % ring.length]; if (end === 0) pos.push(...c, ...d, ...a); else pos.push(...c, ...a, ...d); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3)); g.computeVertexNormals(); b.add(g);
    }
    // ram plate, bilge keels, stern fins
    b.box(7, 22, 9, 103.5, -1, 0); b.box(3, 26, 5, 106, 0, 0);
    b.box(120, 1.2, 3, -10, -12.6, -17, 0, 0.5); b.box(120, 1.2, 3, -10, -12.6, 17, 0, -0.5);
    b.box(22, 9, 1.4, -93, 16, -17); b.box(22, 9, 1.4, -93, 16, 17); b.box(7, 1.2, 36, -99, 20.4, 0);
    // sponsons under the turrets
    for (const x of TUR_X) { b.cyl(9.5, 7.5, 11, x, 3.5, -beam(x) + 2.5, 18); }
    root.add(b.mesh(M.hull, 'hull'));
  }
  // ---- upper works
  {
    const b = new Bag();
    b.box(104, 6, 38, -12, 14.6, 0); b.box(84, 5.5, 28, -14, 20.2, 0); b.box(30, 4, 20, 46, 19, 0);
    b.box(13, 15, 13, 34, 30, 0); b.box(5, 1.6, 30, 34, 33.5, 0); b.cyl(5.6, 6.2, 5.5, 34, 40.2, 0, 14); b.cyl(6.4, 5.6, 1.2, 34, 43.4, 0, 14);
    b.box(16, 5, 14, -70, 20, 0);
    // casemate ribs
    for (let x = -60; x <= 36; x += 12) { b.box(1.4, 6.6, 38.8, x, 14.6, 0); }
    // starboard secondary casemates
    for (const x of [-50, -10, 30]) b.cyl(4.2, 4.2, 4, x, 14, beam(x) - 3, 12);
    const up = new THREE.Group(); up.scale.set(0.92, 0.66, 0.8); up.position.set(0, 12 * (1 - 0.66), 0); root.add(up);
    up.add(b.mesh(M.upper, 'upper'));
    const ir = new Bag(), cu = new Bag();
    // funnels, raked aft
    for (const [i, x] of [[0, 12], [1, -6], [2, -24], [3, -42]]) {
      ir.cyl(4.0, 4.9, 24, x - 1.6, 34, 0, 16, false, 0, 0, 0.13);
      cu.torus(4.35, 0.5, x - 2.9, 44.5, 0, Math.PI / 2, 0, 16, 6); cu.torus(4.6, 0.4, x - 1.0, 29, 0, Math.PI / 2, 0, 16, 6);
      ir.cyl(3.6, 3.9, 1.2, x - 3.2, 46.4, 0, 14, true, 0, 0, 0.13);
    }
    // masts and yards
    ir.cyl(0.35, 0.6, 30, -66, 37, 0, 8); ir.box(0.4, 0.4, 22, -66, 46, 0); ir.cyl(0.3, 0.5, 18, 34, 52, 0, 8); ir.box(0.3, 0.3, 14, 34, 56, 0);
    // rails of ventilator cowls
    for (let x = -56; x <= 6; x += 12.4) for (const z of [-11, 11]) { cu.cyl(1.2, 1.0, 3.4, x, 24.6, z, 10); cu.sph(1.3, x, 26.4, z, 1, 10, 6); }
    // deck guns forward
    ir.cyl(4.6, 5, 3, 72, 19.4, 0, 14); ir.cyl(0.8, 1.0, 16, 81, 20.4, -1.6, 10, false, 0, 0, Math.PI / 2 - 0.08); ir.cyl(0.8, 1.0, 16, 81, 20.4, 1.6, 10, false, 0, 0, Math.PI / 2 - 0.08);
    up.add(ir.mesh(M.iron, 'funnels')); up.add(cu.mesh(M.copper, 'shipCopper'));
  }
  // ---- broadside turrets (port)
  const turrets = TUR_X.map((x, i) => {
    const g = new THREE.Group(); g.position.set(x, 9.2, -beam(x) + 2.5);
    const b = new Bag(); b.cyl(6.6, 7.2, 5.2, 0, 2.6, 0, 20); b.sph(6.6, 0, 5.2, 0, 0.3, 20, 6, Math.PI / 2); b.box(5, 3.4, 3, 0, 3, 6.2);
    g.add(b.mesh(M.turret, 'turret' + i));
    const gun = new THREE.Group(); gun.position.set(0, 3.2, 0);
    const ib = new Bag(); ib.cyl(0.95, 1.3, 17, 0, 0, 12.5, 12, false, Math.PI / 2); ib.cyl(1.5, 1.5, 3.2, 0, 0, 5.6, 12, false, Math.PI / 2); ib.cyl(1.25, 1.25, 1.4, 0, 0, 20.6, 12, false, Math.PI / 2);
    gun.add(ib.mesh(M.iron, 'turretGun' + i));
    g.add(gun); root.add(g);
    return { g, gun };
  });
  // ---- lift rotors in rings under the hull
  const rotors = [];
  {
    const cu = new Bag(), ir = new Bag();
    for (const [x, z] of [[62, -15], [62, 15], [-58, -19], [-58, 19]]) {
      cu.torus(14.5, 1.5, x, -18.5, z, Math.PI / 2, 0, 28, 8);
      ir.cyl(1.6, 1.6, 4, x, -18, z, 10);
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; ir.box(14.5, 0.8, 1.0, x + Math.cos(a) * 7.2, -17, z + Math.sin(a) * 7.2, -a); }
      ir.cyl(1.2, 2.2, 6, x, -14.5, z, 8);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(13.6, 28), M.rotor.clone()); disc.material.uniforms.uSpin = { value: 0 };
      disc.rotation.x = -Math.PI / 2; disc.position.set(x, -19.2, z); disc.userData.noShadow = true; root.add(disc); rotors.push(disc);
    }
    root.add(cu.mesh(M.copper, 'rotorRings')); root.add(ir.mesh(M.iron, 'rotorStruts'));
  }
  // ---- belly searchlights
  const LAMPS = [[-76, -13.6, -9], [-44, -14.2, 9], [-10, -14.2, -10], [22, -14.2, 10], [50, -13.4, -8], [80, -9.5, 0]];
  const lampMat = glowMaterial({ color: '#d2f1ff', power: 0, off: '#0b1a20', id: 0 });
  {
    const ir = new Bag(), lb = new Bag();
    for (const [x, y, z] of LAMPS) { ir.cyl(1.9, 1.5, 2.2, x, y - 0.6, z, 14); ir.torus(1.95, 0.2, x, y - 1.7, z, Math.PI / 2, 0, 14, 5); lb.add(new THREE.CircleGeometry(1.7, 16), xf(x, y - 1.75, z, Math.PI / 2)); }
    root.add(ir.mesh(M.iron, 'lampPods'));
    const l = lb.mesh(lampMat, 'lampLens'); l.userData.noShadow = true; root.add(l);
    // lit ports along the belt, port side
    const pb = new Bag();
    for (let x = -92; x <= 84; x += 5.5) { if (TUR_X.some((tx) => Math.abs(tx - x) < 10)) continue; pb.add(new THREE.CircleGeometry(0.42, 8), xf(x, 5.2, -beam(x) - 0.12 + 0.03 * 5.2, 0, Math.PI)); }
    const pm = pb.mesh(glowMaterial({ color: '#cfeaf2', power: 0.35 }), 'ports'); pm.userData.noShadow = true; root.add(pm);
  }
  root.rotation.order = 'YXZ';
  ctx.scene.add(root);
  ctx.shadowRoots.push(root);

  // hull cut line (ship-local), port side
  const cutA = new THREE.Vector3(-74, -5, -beam(-74) - 0.9), cutB = new THREE.Vector3(66, 7.5, -beam(66) - 0.4);
  LU.uCutA.value.copy(cutA); LU.uCutB.value.copy(cutB);
  const tgtW = new THREE.Vector3(TOWER.center[0], TOWER.roofY + 2, TOWER.center[2] + 6), tl = new THREE.Vector3();
  const shellsBy = (i) => SHELLS.filter((s) => s.from === 'ship' + i);

  function update(st) {
    const t = st.t;
    const p = shipPos(t);
    root.position.set(p[0], p[1], p[2]);
    root.rotation.set(0, SHIP_YAW, 0);
    root.rotateX(-shipList(t));          // lists to port, toward the dam, showing its deck
    root.visible = t > CUES.shipRise - 0.5;
    root.updateMatrixWorld(true);
    // turrets: stowed fore-and-aft, then train on the tower top one after another
    tl.copy(tgtW); root.worldToLocal(tl);
    for (let i = 0; i < turrets.length; i++) {
      const T = turrets[i];
      const dx = tl.x - T.g.position.x, dy = tl.y - (T.g.position.y + 3.2), dz = tl.z - T.g.position.z;
      const yawAim = Math.atan2(dx, dz), k = smooth((t - (CUES.shipRise + 0.7 + i * 0.28)) / 1.5);
      const yaw0 = Math.PI / 2;
      let d = yawAim - yaw0; d = Math.atan2(Math.sin(d), Math.cos(d));
      T.g.rotation.y = yaw0 + d * k;
      T.gun.rotation.x = -Math.atan2(dy, Math.hypot(dx, dz)) * k;
      let rec = 0;
      for (const s of shellsBy(i)) { const tg = t - s.t0; if (tg >= 0 && tg < 1.6) rec = Math.max(rec, tg < 0.05 ? tg / 0.05 : Math.exp(-(tg - 0.05) * 3.2)); }
      T.gun.position.z = -3.4 * rec;
    }
    for (let i = 0; i < rotors.length; i++) rotors[i].material.uniforms.uSpin.value = t * (i % 2 ? 31 : -29) + i;
    lampMat.uniforms.uPower.value = clamp((t - (CUES.shipRise + 0.3)) / 0.2) * (0.85 + 0.15 * Math.sin(t * 40));
    LU.uCutK.value.set(clamp((t - CUES.ray2) / 0.55), smooth((t - CUES.hullBurn) / 1.6));
    root.updateMatrixWorld(true);
  }
  const anchors = {
    shipHullA: (o) => o.copy(cutA).applyMatrix4(root.matrixWorld),
    shipHullB: (o) => o.copy(cutB).applyMatrix4(root.matrixWorld),
    shipBridge: (o) => o.set(31, 30.5, 0).applyMatrix4(root.matrixWorld),
  };
  for (let i = 0; i < 5; i++) {
    const f = (o) => o.set(0, 0, 21.4).applyMatrix4(turrets[i].gun.matrixWorld);
    anchors['ship' + i] = f; anchors['shipGun' + i] = f;
  }
  for (let i = 0; i < LAMPS.length; i++) anchors['shipLamp' + i] = (o) => o.set(LAMPS[i][0], LAMPS[i][1] - 1.8, LAMPS[i][2]).applyMatrix4(root.matrixWorld);
  for (let i = 0; i < 4; i++) anchors['shipFunnel' + i] = (o) => o.set(([12, -6, -24, -42][i] - 3.3) * 0.92, 35.4, 0).applyMatrix4(root.matrixWorld);
  return { root, update, anchors };
}
