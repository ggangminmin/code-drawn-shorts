import * as THREE from 'three';
import { SETS, boatPath, beamAz, beamOn, TOWER } from './layout.js';
import { CUES } from './shots.js';
import { bag, box, cyl, sph, ell, torus, lathe, tube, v3, proxy, paint, hex, mixc } from './sets-geo.js';
import { setMat, glowMat } from './sets-mat.js';
import { windowMat } from './sets-window.js';
import { noise1, onTwos } from './util.js';
import { bakeSpring } from './motion.js';

// Kestrel's wheelhouse (s03, s11). Varnished wainscot under cream-painted boards, a brass-bound oak wheel, the compass
// binnacle with its green lamp (the key light), engine telegraph, barometer, clock, a radio; three raked front windows
// with wipers beating on twos and two side windows, all streaming with rain, the storm sea pitching outside.
// Local origin = floor centre, bow = -Z, built unrotated (the boat frame is the set frame).
export const WH = { W: 1.25, D: 1.0, H: 2.25, sill: 1.02, head: 2.02, wheel: [0, 1.06, -0.6], wheelR: 0.36 };

// The boat's motion in the storm, a pure function of film time: { pitch, roll, heave } (rad, rad, m).
// Pitch + = bow up; roll + = starboard (right, +X) side down. Folk can copy it into Dad's balance and the camera.
export function boatMotion(t) {
  const pitch = 0.035 * Math.sin(t * 0.83 + 1.0) + 0.016 * Math.sin(t * 1.9 + 0.4) + 0.012 + 0.012 * noise1(t * 1.3, 5);
  const roll = 0.11 * Math.sin(t * 0.61 + 0.3) + 0.045 * Math.sin(t * 1.47 + 2.0) + 0.015 * noise1(t * 1.1, 9);
  const heave = 0.5 * Math.sin(t * 0.83 + 0.2) + 0.15 * Math.sin(t * 1.9 + 1.4);
  return { pitch, roll, heave };
}

// the helm in a storm: small corrections all the time, a bigger one now and then (rad, + = clockwise seen by the helmsman)
export function wheelAngle(t) { return 0.22 * Math.sin(t * 0.55 + 0.4) + 0.1 * Math.sin(t * 1.3 + 1.1) + 0.04 * noise1(t * 0.9, 17); }

// spray hits: at fixed film times (never in the middle of a line read), each a sharp onset and a 0.9 s run-off; on threes
const SPRAY = [3.5, 5.15, 11.2, 23.15, 24.2];
export function sprayAt(t) {
  const q = Math.floor(t * 8 + 1e-6) / 8;
  let k = 0, age = 0;
  for (const s of SPRAY) { const d = q - s; if (d >= 0 && d < 1.0) { const v = d < 0.08 ? d / 0.08 : Math.exp(-(d - 0.08) * 3.2); if (v > k) { k = v; age = d; } } }
  return { k, age };
}

export function buildWheelhouse(ctx) {
  const O = SETS.wheelhouse;
  const root = new THREE.Group(); root.name = 'set_wheelhouse'; root.position.set(...O); ctx.scene.add(root);
  const { W, D, H, sill, head } = WH;
  const cols = [];

  // ---------------------------------------------------------------- walls: varnished wainscot below, cream boards above
  const panelV = setMat({ id: 20, kind: 2, scale: 1, axis: 1, plank: 0.11, grime: 0.35, gloss: 0.35 });
  const panelH = setMat({ id: 22, kind: 2, scale: 1, axis: 0, plank: 0.1, grime: 0.4 });
  const wain = bag(root, 'wh_wainscot', panelV);
  const upper = bag(root, 'wh_upper', panelH);
  const varn = '#6a4428', cream = '#b4b09e', creamD = '#969482';
  const T = 0.08;
  const wallBox = (bg, w, h, d, x, y, z, c) => { const g = box(w, h, d, x, y, z, 0, 0, 0, 2); bg.add(g, c); cols.push(g.clone()); };
  // front: console face below the sill, header above, mullions between three windows
  const fx = [[-1.17, -0.5], [-0.42, 0.42], [0.5, 1.17]];
  wallBox(wain, 2 * W, sill, T, 0, sill / 2, -D - T / 2, varn);
  wallBox(upper, 2 * W, H - head, T, 0, (H + head) / 2, -D - T / 2, cream);
  for (const [x0, x1] of [[-W, fx[0][0]], [fx[0][1], fx[1][0]], [fx[1][1], fx[2][0]], [fx[2][1], W]]) wallBox(upper, x1 - x0, head - sill, T, (x0 + x1) / 2, (sill + head) / 2, -D - T / 2, cream);
  // sides with one window each
  const sz = [-0.7, 0.15];
  for (const s of [-1, 1]) {
    const x = s * (W + T / 2);
    wallBox(wain, T, sill, 2 * D, x, sill / 2, 0, varn);
    wallBox(upper, T, H - head, 2 * D, x, (H + head) / 2, 0, cream);
    wallBox(upper, T, head - sill, sz[0] + D, x, (sill + head) / 2, (-D + sz[0]) / 2, cream);
    wallBox(upper, T, head - sill, D - sz[1], x, (sill + head) / 2, (sz[1] + D) / 2, cream);
  }
  // back wall with the door
  wallBox(wain, 2 * W, sill, T, 0, sill / 2, D + T / 2, varn);
  wallBox(upper, 2 * W, H - sill, T, 0, (H + sill) / 2, D + T / 2, creamD);
  wain.add(box(0.7, 1.85, 0.03, 0.55, 0.95, D - 0.015), '#5a3a24');   // the door, shut
  wain.add(box(0.3, 0.3, 0.035, 0.55, 1.5, D - 0.02), '#0e1418');     // its little dark window
  // trim: a rail along the sill, posts in the corners
  wain.add(box(2 * W, 0.05, 0.12, 0, sill + 0.02, -D + 0.04), '#4a2e1a');
  for (const s of [-1, 1]) { wain.add(box(0.12, 0.05, 2 * D, s * (W - 0.04), sill + 0.02, 0), '#4a2e1a'); wain.add(box(0.08, H, 0.08, s * (W - 0.03), H / 2, -D + 0.03), '#4a2e1a'); }
  wain.build(); upper.build();
  // floor: wet planks; ceiling boards on two beams
  const floorM = setMat({ id: 21, kind: 2, scale: 1, axis: 2, plank: 0.13, grime: 0.6, wet: 0.5 });
  const fl = bag(root, 'wh_floor', floorM);
  const flG = box(2 * W + 2 * T, 0.12, 2 * D + 2 * T, 0, -0.06, 0, 0, 0, 0, 4); fl.add(flG, '#5a4430'); cols.push(flG.clone());
  fl.add(box(0.7, 0.012, 0.5, 0, 0.006, -0.05), '#2a2a26');   // a rubber mat where he stands
  fl.build();
  const ce = bag(root, 'wh_ceiling', panelH);
  ce.add(box(2 * W + 2 * T, 0.05, 2 * D + 2 * T, 0, H + 0.025, 0, 0, 0, 0, 3), cream);
  for (const z of [-0.45, 0.45]) ce.add(box(2 * W, 0.1, 0.09, 0, H - 0.05, z), '#5a3a22');
  ce.build();

  // ---------------------------------------------------------------- the windows: wet glass panes painting the storm sea
  const panes = [];
  const mkPane = (x0, x1, z, side, wiper) => {
    const w = x1 - x0, h = head - sill;
    const m = windowMat(1, { rain: 1 });
    const g = new THREE.PlaneGeometry(w, h);
    const mesh = new THREE.Mesh(g, m); mesh.userData.noShadow = true;
    if (side) { mesh.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2; mesh.position.set(side * (W + 0.03), (sill + head) / 2, (x0 + x1) / 2); m.uniforms.uOut.value.set(side, 0, 0); m.uniforms.uRight.value.set(0, 0, -side); }
    else { mesh.position.set((x0 + x1) / 2, (sill + head) / 2, -D - 0.03); m.uniforms.uOut.value.set(0, 0, -1); m.uniforms.uRight.value.set(1, 0, 0); }
    m.uniforms.uWinC.value.set(O[0] + mesh.position.x, O[1] + mesh.position.y, O[2] + mesh.position.z);
    if (wiper) m.uniforms.uWipe.value.set(0, -h / 2 + 0.03, Math.min(h - 0.06, w * 0.62), 1);
    mesh.name = 'wh_glass'; root.add(mesh);
    panes.push({ mesh, m, wiper, w, h, x: (x0 + x1) / 2 });
  };
  for (const [x0, x1] of fx) mkPane(x0, x1, -D, 0, Math.abs(x0 + x1) < 0.2 || x0 > 0);
  for (const s of [-1, 1]) mkPane(sz[0], sz[1], 0, s, false);
  // window frames: brass-cornered teak
  const fr = bag(root, 'wh_frames', setMat({ id: 24, kind: 2, scale: 1, axis: 0, plank: 0.5, grime: 0.3, gloss: 0.4 }));
  for (const [x0, x1] of fx) {
    const cx = (x0 + x1) / 2, w = x1 - x0;
    fr.add(box(w + 0.04, 0.035, 0.05, cx, sill + 0.0175, -D - 0.01), '#7a4e2c');
    fr.add(box(w + 0.04, 0.035, 0.05, cx, head - 0.0175, -D - 0.01), '#7a4e2c');
    for (const x of [x0, x1]) fr.add(box(0.035, head - sill, 0.05, x, (sill + head) / 2, -D - 0.01), '#7a4e2c');
  }
  for (const s of [-1, 1]) {
    fr.add(box(0.05, 0.035, sz[1] - sz[0] + 0.04, s * (W - 0.01), sill + 0.0175, (sz[0] + sz[1]) / 2), '#7a4e2c');
    fr.add(box(0.05, 0.035, sz[1] - sz[0] + 0.04, s * (W - 0.01), head - 0.0175, (sz[0] + sz[1]) / 2), '#7a4e2c');
  }
  fr.build();

  // the wipers: a black arm and blade pivoting at the bottom of the pane, just inside the glass (cheat: we see them in front)
  const wipers = [];
  const wipM = setMat({ id: 27, kind: 3, scale: 1, grime: 0.2, gloss: 0.3 });
  for (const P of panes.filter((p) => p.wiper)) {
    const pivot = new THREE.Group(); pivot.position.set(P.x, sill + 0.03, -D - 0.005); root.add(pivot);
    const L = P.m.uniforms.uWipe.value.z;
    const b = bag(pivot, 'wh_wiper', wipM);
    b.add(box(0.014, L * 0.55, 0.008, 0, L * 0.27, 0), '#141618');
    b.add(box(0.02, L * 0.6, 0.012, 0, L * 0.68, 0.004), '#0c0d0e');
    b.add(cyl(0.02, 0.02, 0.02, 0, 0, 0, Math.PI / 2, 0, 0, 12), '#2a2c2e');
    b.build();
    wipers.push({ pivot, P, phase: P.x > 0.2 ? 0.35 : 0 });
  }

  // ---------------------------------------------------------------- console: the shelf under the windows, instruments
  const conM = setMat({ id: 23, kind: 2, scale: 1, axis: 0, plank: 0.14, grime: 0.45, gloss: 0.3 });
  const con = bag(root, 'wh_console', conM);
  const shelf = box(2 * W - 0.1, 0.05, 0.42, 0, sill - 0.08, -D + 0.21); con.add(shelf, '#5a3a22'); cols.push(shelf.clone());
  const cab = box(1.2, sill - 0.1, 0.38, 0, (sill - 0.1) / 2, -D + 0.19, 0, 0, 0, 2); con.add(cab, '#4e321e'); cols.push(cab.clone());
  for (const x of [-0.3, 0.3]) con.add(box(0.5, 0.75, 0.01, x, 0.5, -D + 0.385), '#5e3e26');   // cabinet doors
  con.add(box(0.36, 0.28, 0.02, 0.75, sill - 0.05 + 0.0, -D + 0.25, -1.2), '#d8d0b0');           // a chart on the shelf
  con.build();
  // the wheel: oak spokes and rim, a brass band, a brass hub on its axle
  const wheel = new THREE.Group(); wheel.position.set(...WH.wheel); root.add(wheel);
  const oak = setMat({ id: 25, kind: 2, scale: 1, axis: 1, plank: 0.3, grime: 0.25, gloss: 0.5 });
  const wb = bag(wheel, 'wh_wheel', oak);
  const R = WH.wheelR;
  wb.add(torus(R, 0.032, 0, 0, 0, 0, 0, 0, 10, 48), '#7a4a26');
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const g = lathe([[0.001, -0.02], [0.018, 0], [0.016, 0.1], [0.018, R - 0.02], [0.02, R + 0.04], [0.026, R + 0.08], [0.024, R + 0.13], [0.012, R + 0.16], [0.001, R + 0.165]], 10);
    g.rotateZ(-a); wb.add(g, (v) => (Math.hypot(v.x, v.y) > R + 0.03 ? hex('#8a5a30') : hex('#6e4424')));
  }
  wb.build();
  const brassM = setMat({ id: 26, kind: 3, scale: 1, gloss: 1, grime: 0.25 });
  const wbB = bag(wheel, 'wh_wheelBrass', brassM);
  wbB.add(torus(R, 0.036, 0, 0, 0.012, 0, 0, 0, 6, 48), '#c49a48');
  wbB.add(cyl(0.075, 0.085, 0.07, 0, 0, 0, Math.PI / 2, 0, 0, 20), '#c49a48');
  wbB.add(cyl(0.035, 0.035, 0.03, 0, 0, 0.05, Math.PI / 2, 0, 0, 16), '#e0b860');
  wbB.build();
  const axle = bag(root, 'wh_axle', brassM);
  axle.add(cyl(0.03, 0.03, 0.4, WH.wheel[0], WH.wheel[1], WH.wheel[2] - 0.2, Math.PI / 2, 0, 0, 12), '#8a6a30');
  axle.add(box(0.2, 0.26, 0.12, WH.wheel[0], WH.wheel[1] - 0.04, -D + 0.42), '#3a3a36');
  axle.build();
  // QA: the rim, the hub and the eight spokes, each its own closed piece (hands go between the spokes)
  {
    const wc = WH.wheel;
    proxy(root, 'wheelhouse_wheelRim', [torus(R, 0.034, wc[0], wc[1], wc[2], 0, 0, 0, 8, 32), cyl(0.085, 0.085, 0.07, wc[0], wc[1], wc[2], Math.PI / 2, 0, 0, 12)], ctx);
    const sp = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, g = box(0.04, R + 0.06 - 0.12, 0.04, 0, (R + 0.06 + 0.12) / 2 - 0.0, 0);
      g.rotateZ(-a); sp.push(g);
    }
    proxy(wheel, 'wheelhouse_wheelSpokes', sp, ctx);     // turns with the wheel
  }
  // binnacle: a brass hood on a wooden pedestal, the compass card lit green from inside, glass dome
  const bn = [-0.55, sill - 0.055, -D + 0.3];
  const bin = bag(root, 'wh_binnacle', brassM);
  bin.add(lathe([[0.001, 0], [0.12, 0], [0.13, 0.04], [0.12, 0.1], [0.11, 0.12], [0.001, 0.12]], 24).translate(...bn), '#b88a3c');
  bin.add(torus(0.105, 0.012, bn[0], bn[1] + 0.12, bn[2], Math.PI / 2, 0, 0, 8, 28), '#e0b860');
  // the hood, open toward the helmsman
  const hood = new THREE.SphereGeometry(0.115, 24, 12, Math.PI * 0.2, Math.PI * 1.6, 0, Math.PI * 0.5);
  hood.rotateY(Math.PI); hood.translate(bn[0], bn[1] + 0.13, bn[2]);
  bin.add(hood, '#a8803a');
  bin.add(sph(0.02, bn[0], bn[1] + 0.25, bn[2], 10, 8), '#e0b860');
  for (const s of [-1, 1]) bin.add(sph(0.045, bn[0] + s * 0.17, bn[1] + 0.08, bn[2], 14, 10), s > 0 ? '#7a2a22' : '#2a4a32');   // quadrant spheres (red/green)
  bin.build();
  const cardTex = compassTexture();
  const cardM = glowMat({ color: '#a8f0c4', k: 0.95, id: 123, map: cardTex });
  const card = new THREE.Mesh(paint(new THREE.CircleGeometry(0.095, 40), '#ffffff'), cardM);
  card.rotation.x = -Math.PI / 2; card.position.set(bn[0], bn[1] + 0.105, bn[2]); card.name = 'wh_compassCard'; root.add(card);
  const lampGlow = glowMat({ color: '#6cff9c', k: 1.6, id: 124 });
  const glowDisc = new THREE.Mesh(paint(new THREE.CircleGeometry(0.1, 32), '#ffffff'), lampGlow);
  glowDisc.position.set(bn[0], bn[1] + 0.2, bn[2] - 0.02); glowDisc.rotation.x = Math.PI * 0.25; glowDisc.name = 'wh_compassHoodGlow';
  root.add(glowDisc);
  glowDisc.visible = false;
  // engine telegraph at the right: a brass drum on a column with a lever
  const tg = [0.55, sill - 0.055, -D + 0.28];
  const tel = bag(root, 'wh_telegraph', brassM);
  tel.add(cyl(0.11, 0.11, 0.08, tg[0], tg[1] + 0.2, tg[2], Math.PI / 2, 0, 0, 24), '#c49a48');
  tel.add(cyl(0.04, 0.05, 0.2, tg[0], tg[1] + 0.1, tg[2], 0, 0, 0, 16), '#8a6a30');
  tel.add(box(0.025, 0.2, 0.025, tg[0] + 0.05, tg[1] + 0.25, tg[2] + 0.06, 0, 0, -0.5), '#c49a48');
  tel.add(sph(0.025, tg[0] + 0.1, tg[1] + 0.33, tg[2] + 0.06, 10, 8), '#2a2420');
  tel.build();
  const telFace = new THREE.Mesh(paint(new THREE.CircleGeometry(0.09, 32), '#ffffff'), setMat({ id: 29, kind: 5, scale: 6, grime: 0.1 }));
  telFace.position.set(tg[0], tg[1] + 0.2, tg[2] + 0.041); telFace.name = 'wh_telegraphFace'; root.add(telFace);
  // on the header above the windows: a clock and a barometer in brass cases; a radio set in the corner
  const hdr = bag(root, 'wh_header', brassM);
  for (const [x, label] of [[-0.25, 0], [0.25, 1]]) {
    hdr.add(cyl(0.085, 0.085, 0.05, x, head + 0.11, -D + 0.03, Math.PI / 2, 0, 0, 24), '#c49a48');
    void label;
  }
  hdr.build();
  for (const x of [-0.25, 0.25]) {
    const f = new THREE.Mesh(paint(new THREE.CircleGeometry(0.068, 32), '#e8e2cc'), setMat({ id: 29, kind: 5, scale: 6, grime: 0.15 }));
    f.position.set(x, head + 0.11, -D + 0.056); f.name = 'wh_dialFace'; root.add(f);
  }
  const radio = bag(root, 'wh_radio', setMat({ id: 28, kind: 3, scale: 1, grime: 0.4, gloss: 0.2 }));
  const rb = box(0.42, 0.24, 0.28, -0.95, sill + 0.12 - 0.055, -D + 0.2); radio.add(rb, '#2e3a36'); cols.push(rb.clone());
  for (let i = 0; i < 3; i++) radio.add(cyl(0.022, 0.022, 0.02, -1.08 + i * 0.12, sill + 0.08 - 0.055, -D + 0.345, Math.PI / 2, 0, 0, 12), '#c8c0a8');
  radio.add(box(0.2, 0.06, 0.01, -0.95, sill + 0.17 - 0.055, -D + 0.34), '#0e1210');
  radio.add(cyl(0.008, 0.008, 0.9, -0.82, 1.5, -D + 0.2, 0, 0, 0, 6), '#1a1c1e');   // the handset cord, hanging
  radio.build();
  const dial = new THREE.Mesh(paint(new THREE.PlaneGeometry(0.18, 0.045), '#ffffff'), glowMat({ color: '#7ac8a0', k: 0.22, id: 125 }));
  dial.position.set(-0.95, sill + 0.115, -D + 0.346); dial.name = 'wh_radioDial'; root.add(dial);

  // ---------------------------------------------------------------- things that hang and swing: an oilskin, a mug, a lantern (cold)
  const swingers = [];
  const swing = (name, pivot, build, len, mass) => {
    const g = new THREE.Group(); g.position.set(...pivot); root.add(g);
    const b = bag(g, name, setMat({ id: 26, kind: 5, scale: 3, grime: 0.3 })); build(b); b.build();
    swingers.push({ g, len, mass });
  };
  swing('wh_oilskin', [-0.85, 1.95, D - 0.06], (b) => {
    // a spare oilskin on a peg: hood, shoulders, a body that flares a little, sleeves hanging, folds in the paint
    b.add(cyl(0.012, 0.012, 0.07, 0, 0, 0.02, Math.PI / 2, 0, 0, 6), '#1a1a1a');
    const coat = lathe([[0.001, -0.04], [0.06, -0.05], [0.16, -0.12], [0.2, -0.2], [0.2, -0.45], [0.22, -0.75], [0.24, -0.98], [0.001, -0.98]], 18);
    coat.scale(1, 1, 0.42); coat.translate(0, 0, -0.07);
    b.add(coat, (v) => { const f = 0.85 + 0.15 * Math.sin(Math.atan2(v.x, v.z) * 7 + v.y * 3); return [0.42 * f, 0.38 * f, 0.15 * f]; });
    b.add(ell(0.11, 0.12, 0.08, 0, -0.08, -0.13, 12, 10), '#5e5420');
    for (const sx of [-1, 1]) { const g = cyl(0.05, 0.06, 0.55, sx * 0.21, -0.45, -0.06, 0, 0, sx * 0.08, 10); b.add(g, '#5e5420'); }
  }, 0.55, 1);
  swing('wh_mug', [0.95, 1.8, -0.45], (b) => {
    b.add(cyl(0.004, 0.004, 0.12, 0, -0.06, 0, 0, 0, 0, 4), '#1a1a1a');
    b.add(cyl(0.04, 0.037, 0.09, 0, -0.17, 0, 0, 0, 0, 14), '#2e4a5e');
    b.add(torus(0.025, 0.007, 0.045, -0.17, 0, 0, 0, 0, 6, 12), '#2e4a5e');
  }, 0.17, 0.4);
  swing('wh_lantern', [-0.3, 2.2, 0.45], (b) => {
    b.add(cyl(0.004, 0.004, 0.16, 0, -0.08, 0, 0, 0, 0, 4), '#1a1a1a');
    b.add(lathe([[0.001, 0], [0.07, 0], [0.075, 0.02], [0.07, 0.05], [0.001, 0.05]], 16).translate(0, -0.42, 0), '#5a2420');
    b.add(lathe([[0.05, 0], [0.065, 0.06], [0.05, 0.13], [0.03, 0.14]], 16).translate(0, -0.37, 0), '#3a4848');
    b.add(lathe([[0.07, 0], [0.06, 0.02], [0.02, 0.06], [0.001, 0.07]], 16).translate(0, -0.23, 0), '#7a2a22');
  }, 0.4, 0.8);
  // the swing response to the roll: lag + overshoot, baked once (pure function of t)
  const tEnd = 80;
  const swingRoll = bakeSpring((t) => -boatMotion(t).roll, tEnd, { freq: 0.9, damp: 0.18 });
  const swingPitch = bakeSpring((t) => boatMotion(t).pitch, tEnd, { freq: 0.95, damp: 0.2 });

  proxy(root, 'wheelhouse_solid', cols, ctx);

  const W3 = (p) => [O[0] + p[0], O[1] + p[1], O[2] + p[2]];
  const binLamp = [bn[0], bn[1] + 0.16, bn[2] + 0.05];
  const anchors = {
    wheel: W3(WH.wheel),
    wheelGripL: W3([WH.wheel[0] - Math.sin(Math.PI / 4) * (R + 0.1), WH.wheel[1] + Math.cos(Math.PI / 4) * (R + 0.1), WH.wheel[2] + 0.02]),
    wheelGripR: W3([WH.wheel[0] + Math.sin(Math.PI / 4) * (R + 0.1), WH.wheel[1] + Math.cos(Math.PI / 4) * (R + 0.1), WH.wheel[2] + 0.02]),
    wheelWindow: W3([0, (sill + head) / 2, -D - 0.03]),
    wheelHelm: W3([0, 0, -0.05]),            // where the helmsman stands
    compassLamp: W3(binLamp),
  };

  // where the headland lies, seen from Kestrel, relative to the bow (rad, + to starboard); a gentle art-directed bearing
  function headBearing(t) {
    const p = boatPath(0, t);
    return 0.16 + (p.yaw + 1.2) * 0.35;
  }
  function lightOnUs(t) {
    if (t >= CUES.bolt) return { k: 0, fan: 0 };
    const p = boatPath(0, t);
    const az = Math.atan2(p.x - TOWER.base[0], -(p.z - TOWER.base[2]));
    let d = beamAz(t) - az; d = Math.atan2(Math.sin(d), Math.cos(d));
    return { k: beamOn(t), fan: Math.exp(-(d * d) / 0.02) };
  }

  function table(t, fl) {
    const k = 1 + 0.03 * noise1(t * 3.1, 4);
    const m = boatMotion(t);
    return {
      amb: [0.045, 0.06, 0.075], fill: [0.13, 0.17, 0.21], fillDir: [Math.sin(m.roll) * 0.5, 0.35, -1],
      lamps: [{ p: W3(binLamp), c: [0.24 * k, 0.56 * k, 0.46 * k], r: 1.9 }],
      flash: { c: [0.55 * fl, 0.65 * fl, 0.85 * fl], list: panes.map((P) => ({ p: P.m.uniforms.uWinC.value.toArray(), d: P.m.uniforms.uOut.value.clone().negate().toArray(), r: 4 })) },
      haze: { c: [0.01, 0.015, 0.02], k: 0.02 },
    };
  }

  function update(st, fl) {
    const t = st.t, m = boatMotion(t);
    const hb = headBearing(t), L = lightOnUs(t);
    // spray: the bow drops into a trough and throws a sheet over the windshield (front panes only), then it runs off
    const sp = sprayAt(t);
    for (const P of panes) {
      const u = P.m.uniforms;
      u.uFlash.value = fl;
      u.uSpray.value = P.mesh.rotation.y === 0 ? sp.k : sp.k * 0.3;
      u.uSprayT.value = sp.age;
      // the sea builds as the great swell rises behind the fleet: by s11 the rollers stand over the bow
      u.uSeaK.value = 1 + 1.4 * Math.min(1, Math.max(0, (t - 19) / 4));
      u.uBoat.value.set(m.pitch, m.roll, m.heave, 2.6);
      u.uTravel.value.set(0, -t * 4.0);
      u.uHead.value.set(hb, 0.07, L.k, L.fan);
      u.uLamp.value.set(...anchors.compassLamp);
      u.uLampC.value.setRGB(0.08, 0.3, 0.18);
    }
    // wipers on twos: one beat every 1.25 s, the right one a little behind the centre one
    const w = (Math.PI * 2) / 1.25;
    for (const Wp of wipers) {
      const A = 0.95;
      Wp.P.m.uniforms.uWipeA.value.set(A, w, Wp.phase * w, 0);
      Wp.pivot.rotation.z = -A * Math.sin(w * onTwos(t) + Wp.phase * w);
    }
    // the blade angle in the shader is measured from straight up toward +x; rotation.z is counter-clockwise: matched by the minus sign
    for (const S of swingers) {
      S.g.rotation.z = swingRoll(Math.min(tEnd, Math.max(0, onTwos(t)))) * (0.8 + 0.2 * S.mass);
      S.g.rotation.x = -swingPitch(Math.min(tEnd, Math.max(0, onTwos(t)))) * 0.7;
    }
    // the wheel turns (on twos), and the grips go with it
    const wa = wheelAngle(onTwos(t));
    wheel.rotation.z = -wa;
    for (const [n, a0] of [['wheelGripL', -Math.PI / 4], ['wheelGripR', Math.PI / 4]]) {
      const a = a0 + wa, r = R + 0.11;
      anchors[n] = W3([WH.wheel[0] + Math.sin(a) * r, WH.wheel[1] + Math.cos(a) * r, WH.wheel[2] + 0.02]);
    }
    cardM.uniforms.uK.value = 0.95 + 0.04 * noise1(t * 3.1, 4);
    card.rotation.z = 0.25 + 0.06 * Math.sin(t * 0.7) + 0.03 * Math.sin(t * 2.3);
  }

  return { root, anchors, boatMotion, wheelAngle, table, update, panes };
}

// a compass card: N/E/S/W, the 32 points, a fleur-de-lis north
function compassTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#f2ecd8'; x.beginPath(); x.arc(128, 128, 127, 0, 7); x.fill();
  x.strokeStyle = '#1c1a16'; x.fillStyle = '#1c1a16';
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2, L = i % 8 === 0 ? 100 : i % 4 === 0 ? 80 : i % 2 === 0 ? 62 : 50;
    x.beginPath(); x.moveTo(128, 128); x.lineTo(128 + Math.sin(a - 0.05) * L * 0.25, 128 - Math.cos(a - 0.05) * L * 0.25);
    x.lineTo(128 + Math.sin(a) * L, 128 - Math.cos(a) * L); x.lineTo(128 + Math.sin(a + 0.05) * L * 0.25, 128 - Math.cos(a + 0.05) * L * 0.25); x.closePath();
    x.fillStyle = i % 2 ? '#1c1a16' : (i % 8 === 0 ? '#a42a22' : '#1c1a16'); x.fill();
  }
  x.lineWidth = 3; x.beginPath(); x.arc(128, 128, 112, 0, 7); x.stroke();
  for (let i = 0; i < 72; i++) { const a = (i / 72) * Math.PI * 2; x.lineWidth = i % 2 ? 1 : 2; x.beginPath(); x.moveTo(128 + Math.sin(a) * 112, 128 - Math.cos(a) * 112); x.lineTo(128 + Math.sin(a) * 122, 128 - Math.cos(a) * 122); x.stroke(); }
  x.font = 'bold 22px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#1c1a16';
  [['N', 0], ['E', 1], ['S', 2], ['W', 3]].forEach(([s, i]) => { const a = i * Math.PI / 2; x.fillText(s, 128 + Math.sin(a) * 97, 128 - Math.cos(a) * 97); });
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
