// LAST LIGHT, land department: the black basalt island. Terrain, harbour quays and the stone pier, the fishing village,
// the reef teeth at the mouth, the headland with the 38 m cliff, the keeper's cottage and the 30 m tower (up to the lantern floor).
// API: groundY(x, z), anchor(name, vec3): pierEnd, toothL, toothR, cliffEdge, cottageDoor (+ towerDoor, cottageWindow, villageCentre).
import * as THREE from 'three';
import { landMap, MAP, TEETH_TOP } from './land-map.js';
import { LU, MAX_LAMPS, terrainMaterial, structMaterial, reefMaterial, grassMaterial, placeholderSeaMaterial } from './land-mat.js';
import { Geo, ID, PATCH, terrainPatch, buildVillage, buildCottage, buildTower, buildPier, buildQuay, buildTeeth, buildBoulders, terrainGrid, grassList } from './land-build.js';
import { MOUTH, TOWER, LENS, PIER, HEADLAND, lightningAt, LIGHTNING, beamAz, beamOn, storm } from './layout.js';
const HEADLAND_TOP = HEADLAND.cliffTop;
const MOUTH_AZ = Math.atan2(MOUTH.center[0] - LENS.center[0], -(MOUTH.center[2] - LENS.center[2]));   // beam azimuth that points at the mouth
import { onThrees, onTwos } from './util.js';
import { overlayMaterial } from './materials.js';
import { addWarLight } from './glsl.js';
import { LOOK_STATE } from './look.js';

let land_halos = null;
export async function buildLand(ctx) {
  const { scene } = ctx;
  const root = new THREE.Group(); root.name = 'land'; scene.add(root);
  const M = landMap();

  const tex = new THREE.DataTexture(M.bakeTexelData(), MAP.n, MAP.n, THREE.RGBAFormat, THREE.FloatType);
  tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.needsUpdate = true;
  LU.uMask.value = tex;

  const add = (g, m, name) => { const me = new THREE.Mesh(g, m); me.frustumCulled = false; me.name = name; me.userData.noShadow = true; root.add(me); return me; };

  const tmain = terrainMaterial();
  tmain.uniforms.uCut.value.set(PATCH.x0 + 0.01, PATCH.z0 + 0.01, PATCH.x1 - 0.01, PATCH.z1 - 0.01);
  add(terrainGrid(M), tmain, 'land-ground');
  add(terrainPatch(M), terrainMaterial(), 'land-ground-head');

  // structures: one merged geometry for the hero pieces (tower, cottage, pier, quay lamps), one for the village
  const hero = new Geo();
  const tower = buildTower(hero);
  const cottage = buildCottage(M, hero);
  const pier = buildPier(M, hero);
  const quayLamps = buildQuay(M, hero);
  const sm = structMaterial({ cel: 1 });
  add(hero.build(), sm, 'land-hero');
  const village = buildVillage(M);
  add(village.geo, structMaterial({ cel: 0.6 }), 'land-village');

  // halos round every oil lamp: soft additive sprites drawn after the atmosphere (they glow through the rain)
  {
    const pts = [...village.lanterns.map((v) => [v.x, v.y, v.z, 1.6]), ...pier.lamps.map((p) => [p[0], p[1], p[2], 2.6]), ...quayLamps.map((p) => [p[0], p[1], p[2], 2.4]), [cottage.lampP.x, cottage.lampP.y, cottage.lampP.z, 1.8]];
    const hm = overlayMaterial({ color: '#ffb466', opacity: 0.32, additive: true, soft: 2.5 });
    const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), hm, pts.length);
    const aS = new Float32Array(pts.length * 4);
    const Mx = new THREE.Matrix4();
    pts.forEach(([x, y, z, r], i) => { Mx.makeScale(r * 2, r * 2, 1).setPosition(x, y, z); im.setMatrixAt(i, Mx); aS.set([1, 0, 1, 0], i * 4); });
    im.geometry.setAttribute('aSprite', new THREE.InstancedBufferAttribute(aS, 4));
    im.frustumCulled = false; im.name = 'land-lamp-halos';
    ctx.overlay.add(im);
    land_halos = im;
  }
  const teeth = buildTeeth();
  const toothMeshes = teeth.map((t) => add(t.geo, reefMaterial({ id: t.name === 'stack' ? ID.rocks : ID.teeth, cols: 1 }), 'land-' + t.name));
  add(buildBoulders(M), reefMaterial({ id: ID.rocks }), 'land-boulders');

  // grass tufts: crossed cards, combed by the gale
  {
    const list = grassList(M);
    const card = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    const card2 = card.clone().rotateY(Math.PI / 2);
    const g = new THREE.BufferGeometry();
    const merged = [card, card2];
    const pos = [], uv = [], idx = [];
    for (const c of merged) { const base = pos.length / 3; pos.push(...c.attributes.position.array); uv.push(...c.attributes.uv.array); for (const i of c.index.array) idx.push(i + base); }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    const im = new THREE.InstancedMesh(g, grassMaterial(), list.length);
    const aG = new Float32Array(list.length * 4);
    const Mx = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const hs = (a, b) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };
    list.forEach(([x, y, z, tall = 1], i) => {
      const h = (0.35 + 0.6 * hs(x, z)) * tall;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), hs(z, x) * 6.28);
      Mx.compose(p.set(x, y, z), q, s.set(0.5 + 0.5 * hs(x * 2, z), h, 0.5 + 0.5 * hs(x * 2, z)));
      im.setMatrixAt(i, Mx);
      aG.set([hs(x * 3, z), hs(x, z * 3), 0.8 + 0.4 * hs(x * 5, z), 0], i * 4);
    });
    g.setAttribute('aG', new THREE.InstancedBufferAttribute(aG, 4));
    im.frustumCulled = false; im.userData.noShadow = true; im.name = 'land-grass'; root.add(im);
  }

  // a stand-in sea for land previews when the sea department is not loaded
  const placeholder = new THREE.Mesh(new THREE.PlaneGeometry(16000, 16000).rotateX(-Math.PI / 2), placeholderSeaMaterial());
  placeholder.position.y = 0; placeholder.frustumCulled = false; placeholder.userData.noShadow = true; placeholder.name = 'land-placeholder-sea';
  placeholder.visible = false; root.add(placeholder);

  // ---- colliders (QA): pier deck + head, the plateau ground near the cottage and tower, the tower shaft, the teeth
  const colMat = new THREE.MeshBasicMaterial();
  const col = (g, name, pos) => { const m = new THREE.Mesh(g, colMat); m.visible = false; m.name = name; if (pos) m.position.set(...pos); root.add(m); ctx.colliders.push({ name, dept: 'land', obj: m, kind: 'solid' }); return m; };
  {
    const L = PIER.from[2] + 4 - PIER.to[2];
    col(new THREE.BoxGeometry(PIER.width, 12, L), 'pier', [PIER.to[0], PIER.from[1] - 6, (PIER.from[2] + 4 + PIER.to[2]) / 2]);
    col(new THREE.CylinderGeometry(5.2, 5.2, 12, 24), 'pier-head', [PIER.to[0], PIER.from[1] - 6, PIER.to[2]]);
    col(new THREE.CylinderGeometry(TOWER.radiusTop, TOWER.radiusBase + 0.05, 28.2, 32), 'tower', [TOWER.base[0], TOWER.base[1] + 14.1 - 0.5, TOWER.base[2]]);
    col(heightSolid(M, TOWER.base[0] - 40, TOWER.base[0] + 30, TOWER.base[2] - 45, TOWER.base[2] + 40, 2), 'headland');
    toothMeshes.forEach((m, i) => { ctx.colliders.push({ name: teeth[i].name, dept: 'land', obj: m, kind: 'solid' }); });
  }

  // ---- anchors
  const cliffEdge = (() => {
    // walk from the tower toward the mouth (south-west) to the last point still on the cliff top
    const dx = -0.62, dz = -0.78;
    let last = [TOWER.base[0], TOWER.base[2]];
    for (let r = 6; r < 120; r += 0.5) {
      const x = TOWER.base[0] + dx * r, z = TOWER.base[2] + dz * r;
      if (M.terrainY(x + dx * 1.5, z + dz * 1.5) < M.terrainY(x, z) - 2.5) { last = [x, z]; break; }
      last = [x, z];
    }
    // step back onto the lip so a camera or a foot there stands on the grass, not the face
    last = [last[0] - dx * 0.6, last[1] - dz * 0.6];
    return new THREE.Vector3(last[0], M.terrainY(last[0], last[1]), last[1]);
  })();
  const anchors = {
    pierEnd: pier.end.clone().setY(PIER.from[1]),
    toothL: new THREE.Vector3(MOUTH.toothL[0], TEETH_TOP.toothL, MOUTH.toothL[2]),
    toothR: new THREE.Vector3(MOUTH.toothR[0], TEETH_TOP.toothR, MOUTH.toothR[2]),
    seaStack: new THREE.Vector3(150, 33, -418),
    cliffEdge,
    cottageDoor: cottage.door.clone().setY(M.groundY(cottage.door.x, cottage.door.z)),
    towerDoor: tower.door.clone(),
    villageCentre: new THREE.Vector3(0, M.groundY(0, 200), 200),
  };

  // the oil lamps that throw pools of light: pier and quay lamp posts, the cottage porch lamp, a few lit windows near the quay
  const lamps = [];
  for (const p of pier.lamps) lamps.push([p[0], p[1], p[2], 14]);
  for (const p of quayLamps) lamps.push([p[0], p[1], p[2], 14]);
  lamps.push([cottage.lampP.x, cottage.lampP.y, cottage.lampP.z, 7]);
  const litNear = village.houses.filter((h) => h.lit > 0 && M.coast(h.x, h.z) < 22).slice(0, 2);
  for (const h of litNear) lamps.push([h.x + Math.sin(h.yaw) * (h.d / 2 + 1.5), h.y + 1.8, h.z + Math.cos(h.yaw) * (h.d / 2 + 1.5), 6]);
  lamps.slice(0, MAX_LAMPS).forEach((l, i) => LU.uLamps.value[i].set(...l));
  LU.uLampN.value = Math.min(MAX_LAMPS, lamps.length);

  // lightning direction per strike: from the bolt side of the sky
  const flashDirs = LIGHTNING.map((s, i) => new THREE.Vector3(Math.sin(i * 2.4 + 0.6) * 0.6, 0.9, -0.5 - 0.3 * Math.cos(i * 1.7)).normalize());

  const land = {
    root, groundY: M.groundY, map: M, houses: village.houses, lamps,
    anchor(name, v = new THREE.Vector3()) { const a = anchors[name]; return a ? v.copy(a) : v.set(0, 0, 0); },
    update(st) {
      const t = st.t;
      LU.uLandTime.value = onThrees(t);
      // lightning: the look already lifts the key and the fill; this adds the hard directional modelling from the bolt
      LU.uFlash.value = LOOK_STATE.flash ?? lightningAt(t);
      let li = 0; for (let i = 0; i < LIGHTNING.length; i++) if (t >= LIGHTNING[i]) li = i;
      const fa = ctx.world?.flashAt?.(t);
      if (fa && fa.pos) LU.uFlashDir.value.set(fa.pos[0] - 80, Math.max(fa.pos[1], 300), fa.pos[2] + 150).normalize();
      else LU.uFlashDir.value.copy(flashDirs[li]);
      LU.uBeam.value.set(LENS.center[0], LENS.center[1], LENS.center[2], beamAz(onTwos(t)));
      LU.uBeamOn.value = beamOn(t) * (1 - 0.55 * (1 - storm(t)));   // at dawn the beam pales against the sky (as FX draws it)
      LU.uStorm.value = storm(t);
      LU.uWinGlow.value = 0.6 + 0.4 * storm(t);
      LU.uBeamK.value = st.look.landBeam ?? 1;
      placeholder.visible = !(ctx.sea && ctx.sea.heightAt);
      if (land_halos) { land_halos.visible = !['lamproom', 'kitchen', 'stairs', 'wheelhouse'].includes(st.set); land_halos.material.uniforms.uOpacity.value = 0.32 * (0.35 + 0.65 * storm(t)); }
      // when the blade crosses the mouth, its vertical spread floods the gap: light the teeth and the water between them
      // (one event light, only while the beam bearing is within ~6 degrees of the mouth)
      const on = LU.uBeamOn.value;
      if (on > 0.01 && st.set !== 'lamproom' && st.set !== 'kitchen' && st.set !== 'stairs' && st.set !== 'wheelhouse') {
        let da = beamAz(t) - MOUTH_AZ; da = Math.atan2(Math.sin(da), Math.cos(da));
        const k = Math.exp(-(da * da) / (2 * 0.05 * 0.05)) * on;
        if (k > 0.03) addWarLight({ a: [MOUTH.toothL[0] - 6, 2, MOUTH.toothL[2]], b: [MOUTH.toothR[0] + 6, 2, MOUTH.toothR[2]], r: 46, c: [2.2 * k, 1.95 * k, 1.45 * k] });
      }
    },
  };
  ctx.land = land;
  return land;
}

// a closed solid under the terrain over a rectangle, for QA
function heightSolid(M, x0, x1, z0, z1, s) {
  const xs = [], zs = [];
  for (let x = x0; x <= x1; x += s) xs.push(x);
  for (let z = z0; z <= z1; z += s) zs.push(z);
  const W = xs.length, Hn = zs.length;
  const pos = [], idx = [];
  for (let j = 0; j < Hn; j++) for (let i = 0; i < W; i++) pos.push(xs[i], M.terrainY(xs[i], zs[j]), zs[j]);
  const bot = pos.length / 3;
  for (let j = 0; j < Hn; j++) for (let i = 0; i < W; i++) pos.push(xs[i], -20, zs[j]);
  const at = (i, j, b = 0) => j * W + i + b * bot;
  for (let j = 0; j < Hn - 1; j++) for (let i = 0; i < W - 1; i++) {
    idx.push(at(i, j), at(i, j + 1), at(i + 1, j), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1));
    idx.push(at(i, j, 1), at(i + 1, j, 1), at(i, j + 1, 1), at(i + 1, j, 1), at(i + 1, j + 1, 1), at(i, j + 1, 1));
  }
  for (let i = 0; i < W - 1; i++) for (const j of [0, Hn - 1]) { const a = at(i, j), b = at(i + 1, j), c = at(i, j, 1), d = at(i + 1, j, 1); if (j === 0) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d); }
  for (let j = 0; j < Hn - 1; j++) for (const i of [0, W - 1]) { const a = at(i, j), b = at(i, j + 1), c = at(i, j, 1), d = at(i, j + 1, 1); if (i === 0) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}
