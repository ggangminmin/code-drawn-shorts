// Dump the shared clocks (src/shots.js, src/layout.js) to audio/cache/timeline.json for the Python sound pipeline.
// The sound department never re-implements the beam clock: it samples the lead's own functions here.
// Usage (project root): node audio/tools/dump_timeline.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHOTS, CUES, DURATION, FPS, FRAMES } from '../../src/shots.js';
import * as L from '../../src/layout.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const RATE = 960;   // samples per second for the clocks (fine enough for notch crossings to ~1 ms)
const n = Math.round(DURATION * RATE) + 1;
const t = [], az = [], on = [], storm = [], swellH = [], swellZ = [], light = [];
for (let i = 0; i < n; i++) {
  const tt = i / RATE;
  t.push(+tt.toFixed(6));
  az.push(L.beamAz(tt)); on.push(L.beamOn(tt)); storm.push(L.storm(tt));
  swellH.push(L.swellHeight(tt)); swellZ.push(L.swellFront(tt)); light.push(L.lightningAt(tt));
}
const boats = [];
for (let i = 0; i < 6; i++) {
  const path = [];
  for (let k = 0; k <= DURATION * 8; k++) { const p = L.boatPath(i, k / 8); path.push([+(k / 8).toFixed(3), +p.x.toFixed(2), +p.z.toFixed(2), +p.yaw.toFixed(3)]); }
  boats.push({ i, pass: L.boatPass(i), path });
}
const out = {
  FPS, FRAMES, DURATION, CUES, SHOTS, LIGHTNING: L.LIGHTNING, BEAM: L.BEAM, RATE,
  MOUTH: L.MOUTH, LENS: L.LENS, PIER: L.PIER, DAWN: L.DAWN,
  t, beamAz: az, beamOn: on, storm, swellHeight: swellH, swellFront: swellZ, lightning: light, boats,
};
mkdirSync(join(HERE, '..', 'cache'), { recursive: true });
writeFileSync(join(HERE, '..', 'cache', 'timeline.json'), JSON.stringify(out));
console.log(`timeline: ${DURATION} s, ${FRAMES} frames, ${SHOTS.length} shots, ${n} clock samples -> audio/cache/timeline.json`);
