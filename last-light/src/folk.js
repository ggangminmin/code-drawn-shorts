import * as THREE from 'three';
import { buildCritter } from './folk-rig.js';
import { SURI, TOBI, DAD, FISHERS } from './folk-species.js';
import { createPerformances } from './folk-act.js';
import { lightFor } from './folk-lights.js';
import { furMaterial, glowMaterial } from './folk-mat.js';
import { PL, initPlaces, add, mul } from './folk-place.js';
import { paint, hex, merge, ell, limb, torus, tube } from './folk-geo.js';
import { addWarLight } from './glsl.js';
import { noise1, onThrees, smooth, invLerp, clamp } from './util.js';

// FOLK: Suri, Grandpa Tobi, Dad and the fishers. Characters are rigid parts in a pivot hierarchy (folk-rig.js) posed every
// frame from pure functions of film time (folk-act.js), lit by a per-location light table (folk-lights.js).
// Props in their paws are ours too: the cup, the brass crank key, the matchbox and match, the storm lanterns.
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion();

function propMat(id, o = {}) { return furMaterial({ color: '#ffffff', id, fur: 0, gloss: o.gloss ?? 0.4, rim: o.rim ?? 0.6, wet: o.wet ?? 0.6 }); }
function buildProps(group) {
  const P = {};
  // tin cup, enamel white with a blue rim
  {
    const body = limb(0.075, 0.038, 0.034, 20); body.translate(0, 0.075, 0);
    paint(body, (v) => (v.y > 0.067 ? hex('#3a5a8a') : hex('#e8e4dc')));
    const hd = new THREE.TorusGeometry(0.022, 0.006, 6, 14, Math.PI); hd.rotateZ(-Math.PI / 2); hd.translate(0.04, 0.04, 0); paint(hd, () => hex('#e8e4dc'));
    P.cup = new THREE.Mesh(merge([body, hd]), propMat(55)); P.cup.name = 'folk.cup';
  }
  // the brass crank key: a square-socket shaft, a bow, a turned wooden grip
  {
    const shaft = new THREE.CylinderGeometry(0.009, 0.009, 0.16, 8); shaft.rotateX(Math.PI / 2); shaft.translate(0, 0, 0.08);
    const sock = new THREE.BoxGeometry(0.024, 0.024, 0.03); sock.translate(0, 0, 0.165);
    const arm = new THREE.BoxGeometry(0.016, 0.1, 0.012); arm.translate(0, -0.05, 0);
    const bow = torus(0.022, 0.006, 6, 16); bow.translate(0, 0.014, 0);
    const brass = merge([shaft, sock, arm, bow]); paint(brass, () => hex('#c9a24a'));
    const gripG = limb(0.07, 0.012, 0.011, 10); gripG.rotateX(-Math.PI / 2); gripG.translate(0, -0.1, -0.0); paint(gripG, () => hex('#5a3a22'));
    P.key = new THREE.Group(); P.key.name = 'folk.key';
    P.key.add(new THREE.Mesh(brass, propMat(56, { gloss: 1 })), new THREE.Mesh(gripG, propMat(57)));
  }
  // matchbox and match
  {
    const box = new THREE.BoxGeometry(0.05, 0.016, 0.035); paint(box, (v, n) => (Math.abs(n.x) > 0.7 ? hex('#5a3422') : hex('#c8b890')));
    P.matchbox = new THREE.Mesh(box, propMat(58)); P.matchbox.name = 'folk.matchbox';
    const st = new THREE.CylinderGeometry(0.0022, 0.0022, 0.05, 5); st.translate(0, 0.025, 0); paint(st, () => hex('#e8d8b0'));
    const hd = ell(0.004, 0.006, 0.004, 8, 6); hd.translate(0, 0.052, 0); paint(hd, () => hex('#8a2a1a'));
    P.match = new THREE.Mesh(merge([st, hd]), propMat(59)); P.match.name = 'folk.match';
  }
  // storm lanterns: tin cap and base, a glass globe that glows, a wire bail
  const lantern = () => {
    const g = new THREE.Group();
    const base = new THREE.CylinderGeometry(0.055, 0.06, 0.04, 14); base.translate(0, 0.02, 0);
    const cap = new THREE.CylinderGeometry(0.03, 0.06, 0.05, 14); cap.translate(0, 0.205, 0);
    const bail = new THREE.TorusGeometry(0.06, 0.003, 4, 16, Math.PI); bail.translate(0, 0.23, 0);
    const wires = []; for (let i = 0; i < 4; i++) { const w = new THREE.CylinderGeometry(0.003, 0.003, 0.15, 4); w.translate(Math.cos(i * 1.57) * 0.05, 0.11, Math.sin(i * 1.57) * 0.05); wires.push(w); }
    const tin = merge([base, cap, bail, ...wires]); paint(tin, () => hex('#2e3a3a'));
    g.add(new THREE.Mesh(tin, propMat(56, { gloss: 0.6 })));
    const glass = ell(0.045, 0.07, 0.045, 14, 10); glass.translate(0, 0.11, 0);
    glass.setAttribute('aCol', new THREE.BufferAttribute(new Float32Array(glass.attributes.position.count * 3).fill(1), 3));
    const gm = new THREE.Mesh(glass, glowMaterial({ color: '#ffc070', k: 1.6, id: 121 })); g.add(gm);
    g.userData.glass = gm;
    return g;
  };
  P.floorLantern = lantern(); P.floorLantern.name = 'folk.floorLantern';
  P.lanterns = [0, 1, 2, 3, 4].map((i) => { const l = lantern(); l.name = 'folk.lantern' + i; return l; });
  for (const o of [P.cup, P.key, P.matchbox, P.match, P.floorLantern, ...P.lanterns]) { group.add(o); o.visible = false; }
  return P;
}

export async function createFolk(ctx) {
  const { scene } = ctx;
  initPlaces(ctx);
  const group = new THREE.Group(); group.name = 'folk'; scene.add(group);
  const suri = buildCritter(SURI), tobi = buildCritter(TOBI), dad = buildCritter(DAD);
  const fishers = FISHERS.map((s) => buildCritter(s));
  for (const r of [suri, tobi, dad, ...fishers]) { group.add(r.root); ctx.shadowRoots.push(r.root); r.root.visible = false; }
  const props = buildProps(group);

  const R = { suri, tobi, dad, fishers };
  if (ctx.mech && ctx.mech.anchor) R.mechWheel = () => { try { const p = ctx.mech.anchor('boatWheel0', new THREE.Vector3(NaN)); return p && Number.isFinite(p.x) ? [p.x, p.y, p.z] : null; } catch (e) { return null; } };
  // the Kestrel's real deck under a foot (Mech's collider), so boots stand on it however the boat pitches
  {
    const dc = (ctx.colliders || []).find((c) => c.name === 'boatDeck0');
    const rc = new THREE.Raycaster(), o = new THREE.Vector3(), down = new THREE.Vector3(0, -1, 0);
    if (dc) R.deckY = (x, z, yGuess) => { dc.obj.updateMatrixWorld(true); rc.set(o.set(x, yGuess + 1.2, z), down); rc.far = 3; const h = rc.intersectObject(dc.obj, true)[0]; return h ? h.point.y + 0.006 : yGuess; };
  }
  const perf = createPerformances(ctx, R);

  // QA: every rigid part is a body; it may touch (3 cm) the floors, the crank, the pedestal, the wheel and each other's props
  const CONTACT = ['lampFloor', 'crank', 'crankFrame', 'lensPedestal', 'serviceStep', 'kitchen_solid', 'kitchen_sill', 'kitchen_table', 'stairs_floor', 'stairs_steps', 'stairs_solid', 'stairs_wall_solid', 'wheelhouse_solid', 'wheelhouse_wheelRim', 'wheelhouse_wheelSpokes', 'boatDeck0', 'boatDeck1', 'boatDeck2', 'boatDeck3', 'boatDeck4', 'boatDeck5', 'pier', 'pier-head'];
  const reg = (rig) => { for (const m of rig.parts) ctx.colliders.push({ name: `${rig.name}_${m.name}`, dept: 'folk', obj: m, kind: 'body', contact: CONTACT }); };
  for (const r of [suri, tobi, dad, ...fishers]) reg(r);

  const show = (r, P) => { if (P) { r.setPose(P); r.root.visible = true; } else r.root.visible = false; };
  const handAt = (rig, L, out) => rig.arms[L].wr.localToWorld(out.set(0, -rig.D.hand * 1.05, -rig.D.hand * 0.45));
  const holdIn = (obj, rig, L, off = [0, 0, 0], rot = [0, 0, 0]) => {
    rig.arms[L].wr.updateWorldMatrix(true, false);
    obj.position.set(0, -rig.D.hand * 1.05 + off[1], -rig.D.hand * 0.42 + off[2]).add(_b.set(off[0], 0, 0));
    obj.position.applyMatrix4(rig.arms[L].wr.matrixWorld);
    rig.arms[L].wr.getWorldQuaternion(_q); obj.quaternion.copy(_q);
    obj.rotateX(rot[0]); obj.rotateY(rot[1]); obj.rotateZ(rot[2]);
    obj.visible = true;
  };
  // the cup's fall: released between the paws at CUES.cupFall, gravity, a bounce on the floor, then lying on its side
  let cupRelease = null;
  const cupAt = (t) => {
    const c0 = cupRelease;
    const u = t - ctx.CUES.cupFall, fy = PL.kitchen.o[1];
    const g = 9.8, h0 = c0[1] - fy, tf = Math.sqrt(2 * h0 / g);
    if (u < tf) return { p: [c0[0], c0[1] - 0.5 * g * u * u, c0[2]], r: u * 5 };
    const b = u - tf, vb = 1.1, tb = 2 * vb / g;
    const x = c0[0] + PL.kitchen.f[0] * 0.25 * Math.min(1, b / 0.6), z = c0[2] + PL.kitchen.f[2] * 0.25 * Math.min(1, b / 0.6);
    if (b < tb) return { p: [x, fy + 0.04 + vb * b - 0.5 * g * b * b, z], r: tf * 5 + b * 7 };
    return { p: [x, fy + 0.038, z], r: Math.PI / 2, lie: true };
  };
  {
    // where the paws are at the release: pose her at that instant once
    const st0 = { t: ctx.CUES.cupFall - 1 / 24, sid: 's04', lt: 0 };
    const p = perf.poseFor(st0);
    if (p.suri) { suri.setPose(p.suri); suri.root.updateWorldMatrix(true, true); const a = handAt(suri, 'L', new THREE.Vector3()), b = handAt(suri, 'R', new THREE.Vector3()); cupRelease = [(a.x + b.x) / 2, (a.y + b.y) / 2 + 0.01, (a.z + b.z) / 2]; }
    else cupRelease = add(PL.kitchen.o, [0, 1.0, 0]);
  }

  const api = {
    group, perf, props,
    suri: { root: suri.root, anchor: (n, o) => anchorX(suri, n, o), rig: suri },
    grandpa: { root: tobi.root, anchor: (n, o) => anchorX(tobi, n, o), rig: tobi },
    dad: { root: dad.root, anchor: (n, o) => anchorX(dad, n, o), rig: dad },
    fishers: fishers.map((r) => ({ root: r.root, anchor: (n, o) => anchorX(r, n, o), rig: r })),
    update(st) {
      const t = st.t, C = ctx.CUES;
      if (LINEUP) { lineup(st); return; }
      const p = perf.poseFor(st);
      show(suri, p.suri);
      R.suriHead = () => suri.anchor('head', new THREE.Vector3()).toArray();
      show(tobi, p.tobi); show(dad, p.dad);
      fishers.forEach((r, i) => show(r, p.fishers[i]));
      // ---- props
      for (const o of [props.cup, props.key, props.matchbox, props.match, props.floorLantern, ...props.lanterns]) o.visible = false;
      if (p.suri && t > 5 && t < 8.5) {
        if (t < C.cupFall) {
          suri.root.updateWorldMatrix(true, true);
          const a = handAt(suri, 'L', _a), b = handAt(suri, 'R', _b);
          props.cup.position.set((a.x + b.x) / 2, (a.y + b.y) / 2 - 0.05, (a.z + b.z) / 2); props.cup.rotation.set(0, suri.root.rotation.y + 1.2, 0); props.cup.visible = true;
        } else { const c = cupAt(t); props.cup.position.set(...c.p); props.cup.rotation.set(c.r, suri.root.rotation.y + 1.2, 0); props.cup.visible = true; }
      }
      // key: in Grandpa's paw until CUES.keyHand, then hers, then home in the keyhole (Mech's crank takes over at KEYIN)
      if (t > 7.8 && t < 10.6 && t < C.keyHand && p.tobi) holdIn(props.key, tobi, 'R', [0, 0, 0], [Math.PI / 2, 0, 0]);
      else if (t >= C.keyHand && t < 13 && p.suri) holdIn(props.key, suri, 'R', [0, 0, 0], t > 9.75 ? [-Math.PI / 2, 0, 0] : [Math.PI / 2, 0, 0]);
      else if (t >= 13 && t < 15 && p.suri) holdIn(props.key, suri, 'R', [0, 0, 0], [Math.PI / 2, 0, 0]);
      else if (t >= 17.5 && t < perf.KEYIN && p.suri) {
        const k = R.keyMeet(t); props.key.position.set(...k); props.key.lookAt(_a.set(PL.keyhole[0], PL.keyhole[1], PL.keyhole[2]).add(_b.set(-PL.crankAxis[0], 0, -PL.crankAxis[2]))); props.key.rotateY(Math.PI); props.key.visible = true;
        props.key.lookAt(_a.set(k[0] - PL.crankAxis[0], k[1], k[2] - PL.crankAxis[2]));
      } else if (t >= perf.KEYIN && !PL.has.mech.crank && t < 73) {
        // no crank from Mech yet: our key stays in the keyhole, turned by the crank angle
        props.key.position.set(...add(PL.keyhole, mul(PL.crankAxis, 0.02)));
        props.key.lookAt(_a.set(PL.keyhole[0] - PL.crankAxis[0], PL.keyhole[1], PL.keyhole[2] - PL.crankAxis[2]));
        props.key.rotateZ(-PL.crankAngle(t) + Math.PI);
        props.key.visible = true;
      }
      if (t >= 15 && t < 17.2 && p.suri) {
        holdIn(props.matchbox, suri, 'L', [0, 0.01, 0], [0, 0, Math.PI / 2]);
        if (t < 16.9) holdIn(props.match, suri, 'R', [0, 0, 0], [Math.PI / 2 + 0.3, 0, 0]);
        if (t > C.matchStrike && t < 16.9) {
          props.match.updateWorldMatrix(true, false); const tip = props.match.localToWorld(_a.set(0, 0.052, 0));
          st.folkMatchTip = [tip.x, tip.y, tip.z];
          addWarLight({ a: st.folkMatchTip, r: 1.4, c: [1.6 * (0.9 + 0.1 * noise1(onThrees(t) * 9, 1)), 0.9, 0.42] });
        }
      }
      // Grandpa's storm lantern on the stair floor (s05), the fishers' lanterns raised (s23)
      if (t > 7.8 && t < 10.6) {
        const lp = add(PL.grandpaSit.o, mul(PL.grandpaSit.s, -0.45), mul(PL.grandpaSit.f, 0.35));
        props.floorLantern.position.set(...lp); props.floorLantern.rotation.set(0, 0.3, 0.0); props.floorLantern.visible = true;
        st.folkLantern = [lp[0], lp[1] + 0.12, lp[2]];
        props.floorLantern.userData.glass.material.uniforms.uK.value = 1.5 * (0.92 + 0.08 * noise1(onThrees(t) * 5, 2));
      }
      if (p.fishers.length) {
        let sx = 0, sy = 0, sz = 0;
        fishers.forEach((r, i) => { const l = props.lanterns[i]; holdIn(l, r, 'R', [0, 0.0, 0.0], [Math.PI, 0, 0]); l.quaternion.identity(); l.position.y -= 0.2; sx += l.position.x; sy += l.position.y; sz += l.position.z; });
        st.folkLanternP = [sx / 5, sy / 5 + 0.1, sz / 5];
      }
      // light table for whoever is in this shot
      const focus = p.dad && (st.sid === 's03' || st.sid === 's11' || st.sid === 's24') ? dad.anchor('head', _a).toArray() : p.suri ? suri.anchor('head', _a).toArray() : p.tobi ? tobi.anchor('head', _a).toArray() : null;
      lightFor(st, ctx, focus);
    },
  };
  // ---- design lineup (URL: lineup=1&emo=laugh&cam=...&test=1): characters side by side at [0, 4000, 0], neutral light
  const Q = new URLSearchParams(location.search), LINEUP = Q.get('lineup') === '1';
  function lineup(st) {
    const emo = Q.get('emo') || 'neutral', E = perf.EMO[emo] || {};
    const list = [[suri, -1.4], [tobi, 0], [dad, 1.4], ...fishers.map((r, i) => [r, 2.8 + i * 1.2])];
    for (const [r, x] of list) {
      const D = r.D, pos = [x, 4000, 0];
      r.setPose({ pos, yaw: +(Q.get('yaw') ?? 0), hip: [0, r.hipY, 0], waist: [0, 0, 0], spine: [0.02, 0, 0], neck: [0, 0, 0], head: [0, +(Q.get('hy') ?? 0), 0],
        legs: { L: { foot: [x + 0.1, 4000 + D.footH * 0.97, 0], yaw: 0.1 }, R: { foot: [x - 0.1, 4000 + D.footH * 0.97, 0], yaw: -0.1 } },
        arms: { L: { sh: [0.05, 0, 0.25], el: 0.3, curl: 0.4 }, R: { sh: [0.05, 0, -0.25], el: 0.3, curl: 0.4 } },
        face: { ...perf.FACE0, ...E, detail: 1, lens: 0.5 }, ears: [0, 0], tailChain: r.tailLinks.map((_, i) => [i ? 0.1 : -0.5, 0.05]) });
      r.root.visible = true;
    }
    for (const o of [props.cup, props.key, props.matchbox, props.match, props.floorLantern, ...props.lanterns]) o.visible = false;
    lightFor({ ...st, sid: 'lineup' }, ctx, [0, 4001.2, 0]);
  }
  ctx.folk = api;
  return api;
}
function anchorX(rig, n, o = new THREE.Vector3()) {
  if (n === 'pawL' || n === 'handL') return rig.arms.L.wr.localToWorld(o.set(0, -rig.D.hand * 0.9, 0));
  if (n === 'pawR' || n === 'handR') return rig.arms.R.wr.localToWorld(o.set(0, -rig.D.hand * 0.9, 0));
  return rig.anchor(n, o);
}
