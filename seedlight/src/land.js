// SEEDLIGHT, land department: the Weir (canyon, dam, citadel, tower), the vault and well shaft, the Ironclad.
// Everything is a pure function of st.t. See CONTRACT.md for the API.
import * as THREE from 'three';
import { buildWeir, KEEPBOX, WALK_Y } from './land-weir.js';
import { buildVault } from './land-vault.js';
import { buildShip } from './land-ship.js';
import { terrainY } from './land-geo.js';
import { LU } from './land-mat.js';
import { addWarLight } from './glsl.js';
import { DAM, TOWER, VAULT, WELL, COURT, WALL, ROOF, eruptU } from './layout.js';
import { CUES } from './shots.js';

export async function buildLand(ctx) {
  const weir = buildWeir(ctx);
  const vault = buildVault(ctx);
  const ship = buildShip(ctx);
  const anchors = { ...weir.anchors, ...vault.anchors, ...ship.anchors };

  // top surface at (x, z). Pass yHint < 100 to get the vault floor under the courtyard.
  function groundY(x, z, yHint) {
    if (yHint !== undefined && yHint < 100 && x > -134 && x < -70 && Math.abs(z) < 17) return VAULT.floorY;
    const dt = Math.hypot(x - TOWER.center[0], z - TOWER.center[2]);
    if (dt < TOWER.r) return TOWER.roofY;
    if (x > KEEPBOX.x0 && x < KEEPBOX.x1 && z > KEEPBOX.z0 && z < KEEPBOX.z1) return 150;
    if (Math.abs(x) < 322) {
      if (z > 40.6 && z < 45.4) return WALK_Y;
      if (z < -40.8 && z > -45.6) return 126.5;
    }
    if (Math.abs(x) < 360 && z > DAM.z0 && z < DAM.z1) {
      if (Math.hypot(x - WELL.center[0], z - WELL.center[1]) < WELL.r) return VAULT.floorY;
      return DAM.y;
    }
    return terrainY(x, z);
  }
  const anchor = (name, v) => { const f = anchors[name]; if (f) f(v); else v.set(0, DAM.y, 0); return v; };

  const land = {
    groundY, anchor, ship: ship.root, weir: weir.root, vault: vault.root,
    stairGlowY: () => LU.uGlowY.value,
    searchlightTarget: (i, t, v) => weir.slTarget(i, t, v),
    update(st) {
      weir.update(st); vault.update(st); ship.update(st);
      // the standing fire along the east rampart lights the crown (one long light; FX adds the sharp ones)
      const t = st.t;
      LU.uKey2.value.w = (st.sid === 's01' || st.sid === 's30') ? 0.62 : 0;
      if (t > CUES.erupt + 0.2 && st.set !== 'vault') {
        const u = eruptU(t), k = Math.min(1, (t - CUES.erupt) / 1.2) * (t > 60 ? 0.7 : 1);
        const xb = WALL.a[0] + (WALL.b[0] - WALL.a[0]) * u;
        const fl = 0.85 + 0.15 * Math.sin(Math.floor(t * 8) * 2.4);
        addWarLight({ a: [WALL.a[0], 127, 41], b: [xb, 127, 41], r: 170, c: [0.9 * k * fl, 0.32 * k * fl, 0.09 * k * fl] });
      }
    },
  };
  return land;
}
