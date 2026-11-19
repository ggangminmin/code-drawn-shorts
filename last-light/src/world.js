import * as THREE from 'three';
import { ENV } from './passes-env.js';
import { stormSkyMaterial, flashAt, LIGHTNING_POS, DECK_H } from './world-sky.js';
import { onThrees } from './util.js';
import { LOOK_STATE } from './look.js';

// World (Sea department): the storm sky dome with its cloud deck, rain curtains, lightning-lit undersides and the dawn clearing.
// API: ctx.world.sky (mesh), ctx.world.flashAt(t) -> { pos:[x,y,z], k } | null (where the current lightning strike is),
//      ctx.world.LIGHTNING_POS, ctx.world.deckHeight.
export async function buildWorld(ctx) {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(8500, 64, 32), stormSkyMaterial());
  sky.renderOrder = -10; sky.frustumCulled = false; sky.userData.noShadow = true;
  ctx.scene.add(sky);
  const au = ctx.engine.mAtmos.uniforms, su = sky.material.uniforms;
  au.uHazeCool = su.uHorizonCool; au.uHazeWarm = su.uHorizonWarm;
  const world = {
    sky, flashAt, LIGHTNING_POS, deckHeight: DECK_H,
    update(st) {
      ENV.uEnvTime.value = onThrees(st.t);
      sky.position.copy(ctx.camera.position);
      const f = flashAt(st.t);
      if (f) su.uFlashPos.value.set(...f.pos);
      su.uFlashK.value = LOOK_STATE.flash;
    },
  };
  ctx.world = world;
  return world;
}
