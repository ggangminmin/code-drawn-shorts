// Dump the shared clocks (src/shots.js, src/layout.js) to audio/cache/timeline.json for the Python sound pipeline.
// The sound department never re-implements a clock: it samples the lead's own functions here.
// Usage (project root): node audio/tools/dump_timeline.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHOTS, CUES, DURATION, FPS, FRAMES } from '../../src/shots.js';
import * as L from '../../src/layout.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const RATE = 480;   // clock samples per second (2 ms: far finer than one frame)
const n = Math.round(DURATION * RATE) + 1;
const call = (f, t, d) => (typeof f === 'function' ? f(t) : d);
const clocks = { threadOn: [], irisHeat: [], sweepU: [], eruptU: [], shipX: [], shipY: [], shipZ: [], shipList: [], quake: [] };
const t = [];
for (let i = 0; i < n; i++) {
  const tt = i / RATE;
  t.push(+tt.toFixed(6));
  clocks.threadOn.push(call(L.threadOn, tt, 0));
  clocks.irisHeat.push(call(L.irisHeat, tt, 0));
  clocks.sweepU.push(call(L.sweepU, tt, 0));
  clocks.eruptU.push(call(L.eruptU, tt, 0));
  const p = call(L.shipPos, tt, [0, 0, 0]);
  clocks.shipX.push(p[0]); clocks.shipY.push(p[1]); clocks.shipZ.push(p[2]);
  clocks.shipList.push(call(L.shipList, tt, 0));
  clocks.quake.push(call(L.quake, tt, 0));
}
const SHELLS = (L.SHELLS || []).map((s) => ({ ...s }));
const out = {
  FPS, FRAMES, DURATION, CUES, SHOTS, SHELLS, RATE,
  WALL: L.WALL, SHIP: L.SHIP, TOWER: L.TOWER, GUN: L.GUN, CATCH: L.CATCH,
  t, ...clocks,
};
mkdirSync(join(HERE, '..', 'cache'), { recursive: true });
writeFileSync(join(HERE, '..', 'cache', 'timeline.json'), JSON.stringify(out));
console.log(`timeline: ${DURATION} s, ${FRAMES} frames, ${SHOTS.length} shots, ${SHELLS.length} shells, ${n} clock samples -> audio/cache/timeline.json`);
