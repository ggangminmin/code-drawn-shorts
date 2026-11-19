import * as THREE from 'three';
import { G, COMMON, MRT_OUT, VERT_STD } from './glsl.js';
import { SL } from './sets-mat.js';

// Wet window panes that paint the storm outside them. The pane works out the camera ray through each pixel, bends it by
// the water on the glass and paints what lies behind: so the view has true parallax and the drops refract it.
//   mode 0 kitchen: storm clouds and the dark tower on the headland, looming above the cottage
//   mode 1 wheelhouse: the storm sea from a pitching boat, the headland and its light on the horizon, wipers clearing arcs
//   mode 2 slit: the tower's slit windows, rain and black sky, white in a lightning flash
// Painted (id 0): the brushwork pass turns it to gouache.
export function windowMat(mode, o = {}) {
  const u = {
    ...G, ...SL,
    uMode: { value: mode },
    uWinC: { value: new THREE.Vector3() }, uOut: { value: new THREE.Vector3(0, 0, -1) }, uRight: { value: new THREE.Vector3(1, 0, 0) },
    uFlash: { value: 0 }, uStorm: { value: 1 },
    uLamp: { value: new THREE.Vector3() }, uLampC: { value: new THREE.Color('#000000') },
    // kitchen: tower distance, x offset, base y (relative to window centre), lantern state (0 dark, 1 lit)
    uTower: { value: new THREE.Vector4(58, 1.8, -3.0, 0) }, uBroken: { value: 0 },
    // wheelhouse: boat pitch, roll, heave (rad, rad, m); travel offset on the sea; eye height
    uBoat: { value: new THREE.Vector4(0, 0, 0, 2.6) }, uTravel: { value: new THREE.Vector2() },
    uHead: { value: new THREE.Vector4(0.12, 0.08, 0, 0) },       // headland azimuth (rad, + right), half width, light k, beam phase
    uWipe: { value: new THREE.Vector4(0, 0, 0, 0) },          // pivot (pane local x,y), blade length, on
    uWipeA: { value: new THREE.Vector4(0.9, 2.4, 0, 0) },        // amplitude (rad), angular speed, phase, centre angle
    uRainK: { value: o.rain ?? 1 }, uId: { value: o.id ?? 0 },
    uSeaK: { value: 1 }, uSpray: { value: 0 }, uSprayT: { value: 0 }, uFog: { value: new THREE.Vector3(0, 0.5, 0) },   // spray sheet strength + its age; condensation (k, pane half height, -)
  };
  const vs = /* glsl */ `varying vec3 vLocal; ${VERT_STD} void main(){ vLocal = position; stdVertex(position, normal); }`;
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    uniform float uMode, uFlash, uStorm, uBroken, uRainK, uId, uSpray, uSprayT, uSeaK;
    uniform vec3 uFog;
    uniform vec3 uWinC, uOut, uRight, uLamp, uLampC;
    uniform vec4 uTower, uBoat, uHead, uWipe, uWipeA;
    uniform vec2 uTravel;
    varying vec3 vWorld, vNormalW, vNormalV, vLocal; varying float vDepth; varying vec2 vUv;

    // ---------- water on the glass: beads, and runs sliding down with a trail. Returns (refraction offset xy, wetness)
    vec3 glassWater(vec2 q, float t, float density){
      vec2 off = vec2(0.0); float m = 0.0;
      // beads at two sizes
      for(int L = 0; L < 2; L++){
        float s = L == 0 ? 0.028 : 0.012;
        vec2 g = q / s + float(L) * 17.0; vec2 id = floor(g); vec2 f = fract(g) - 0.5;
        vec2 h = hash22(id);
        float on = step(1.0 - density * (L == 0 ? 0.55 : 0.75), hash12(id + 5.3));
        vec2 c = (h - 0.5) * 0.5;
        float r = mix(0.16, 0.36, hash12(id + 3.1));
        vec2 d = f - c; d.y *= 1.0 + 0.25 * step(d.y, 0.0);
        float k = (1.0 - smoothstep(r * 0.82, r, length(d))) * on;
        off += d / r * k * s * 0.9; m = max(m, k);
      }
      // runs: a drop slides down a column, wobbling, leaving a broken trail
      float colW = 0.045;
      float cx = floor(q.x / colW), ch = hash12(vec2(cx, 9.0));
      if(ch < 0.55 * density){
        float sp = mix(0.12, 0.42, hash12(vec2(cx, 4.0)));
        float cyc = 0.9 + ch;
        float y = q.y + t * sp + ch * 13.0;
        float fy = fract(y / cyc);
        float wob = 0.18 * sin(q.y * 26.0 + ch * 40.0) + 0.1 * sin(q.y * 61.0 + ch * 7.0);
        float lx = (fract(q.x / colW) - 0.5 - wob * 0.6) * colW;
        float headY = fy * cyc;                          // distance above the head
        float head = 1.0 - smoothstep(0.006, 0.0085, length(vec2(lx, (headY - 0.012) * 0.7)));
        float trail = (1.0 - smoothstep(0.0012, 0.0024, abs(lx))) * step(0.02, headY) * (1.0 - smoothstep(0.1, 0.45, headY)) * step(0.35, vnoise(vec2(cx, q.y * 40.0)));
        off += vec2(lx / 0.0085, 0.3) * head * 0.006 + vec2(lx, 0.0) * trail * 2.0;
        m = max(m, max(head, trail * 0.7));
      }
      // wind-driven streamers: water dragged sideways and down across the glass in quick broken threads (boat panes)
      if(density > 0.9){
        vec2 sq = vec2(q.x + q.y * 0.55, q.y);
        float lane = floor(sq.y / 0.03), lh = hash12(vec2(lane, 2.0));
        float along = sq.x * 3.0 + t * (1.2 + 2.0 * lh) + lh * 10.0;
        float seg = step(0.55, fract(along * 0.7)) * step(0.5, lh);
        float ly = (fract(sq.y / 0.03) - 0.5 + 0.2 * sin(along * 6.0)) * 0.03;
        float thread = (1.0 - smoothstep(0.0012, 0.0026, abs(ly))) * seg;
        off += vec2(0.0, ly) * thread * 3.0; m = max(m, thread * 0.8);
      }
      return vec3(off, m);
    }

    // ---------- the storm sky by direction: low ragged cloud deck, darker above; lit from below in a flash
    vec3 stormSky(vec3 rd, float flash){
      float el = asin(clamp(rd.y, -1.0, 1.0)), az = atan(rd.x, -rd.z);
      vec2 cp = vec2(az * 2.2 + uTime * 0.03, el * 5.0);
      float n = fbm2(cp * 1.6 + vec2(0.0, uTime * 0.02));
      float n2 = fbm2(cp * 4.0 + 7.0 + vec2(uTime * 0.05, 0.0));
      vec3 top = vec3(0.035, 0.05, 0.065), low = vec3(0.1, 0.14, 0.17);
      vec3 c = mix(low, top, smoothstep(0.0, 0.55, el));
      // cloud masses: two hard tones, ragged
      float mass = smoothstep(0.48, 0.52, n + 0.15 * n2 - el * 0.25);
      vec3 cloudLit = vec3(0.16, 0.21, 0.25), cloudShade = vec3(0.055, 0.075, 0.095);
      float under = smoothstep(0.5, 0.56, n2);
      c = mix(c, mix(cloudShade, cloudLit, under * 0.6), mass);
      // a lighter band low down: the far sea sky
      c += vec3(0.06, 0.08, 0.09) * exp(-max(el, 0.0) * 14.0);
      // lightning: the clouds light up from inside, hard-edged
      c += vec3(0.55, 0.62, 0.75) * flash * (0.35 + 0.65 * mass * (0.4 + 0.6 * under));
      return c;
    }

    // ---------- rain falling outside, slanted streaks on twos
    float rainAir(vec2 p, float t, float density){
      p.x += p.y * 0.28;
      vec2 g = vec2(p.x * 38.0, p.y * 2.6 + t * 14.0);
      vec2 id = floor(g); vec2 f = fract(g);
      float h = hash12(id);
      float on = step(1.0 - density, h);
      float x = abs(f.x - (0.2 + 0.6 * hash12(id + 1.7)));
      return on * (1.0 - smoothstep(0.03, 0.08, x)) * smoothstep(0.0, 0.3, f.y) * (1.0 - smoothstep(0.6, 1.0, f.y));
    }

    // ---------- mode 0: the tower on the headland
    vec3 kitchenView(vec3 ro, vec3 rd, float flash){
      vec3 c = stormSky(rd, flash);
      float D = uTower.x, tx = uTower.y, by0 = uTower.z;
      float dn = dot(rd, uOut);
      if(dn > 0.01){
        float th = (D - dot(ro - uWinC, uOut)) / dn;
        vec3 B = ro + rd * th;
        float bx = dot(B - uWinC, uRight), by = B.y - uWinC.y;
        // a paler tear in the clouds behind the lantern, so the dark tower reads as a silhouette (painted, not lit)
        vec2 lq = vec2(bx - tx, by - by0 - 33.0) / vec2(16.0, 9.0);
        float tear = exp(-dot(lq, lq)) * (0.7 + 0.3 * fbm2(vec2(bx, by) * 0.08 + uTime * 0.02));
        c += vec3(0.12, 0.15, 0.18) * tear + vec3(0.7, 0.78, 0.95) * flash * (0.35 + 0.65 * tear);
        // headland: a rising grassy slope toward the tower, its edge ragged with grass tufts against the sky
        float ridge = by0 + 0.6 + 0.9 * smoothstep(-30.0, 10.0, -abs(bx - tx) * 0.8) - 0.05 * abs(bx - tx) + 0.25 * fbm2(vec2(bx * 0.15, 1.0)) + 0.12 * sin(bx * 3.0 + vnoise(vec2(bx * 6.0, 0.0)) * 3.0);
        if(by < ridge){
          vec2 gp = vec2(bx, by);
          float wind = vnoise(vec2(gp.x * 0.6 - uTime * 1.4, gp.y * 5.0));
          vec3 g = mix(vec3(0.03, 0.05, 0.045), vec3(0.06, 0.09, 0.07), smoothstep(0.4, 0.7, wind));
          g += vec3(0.4, 0.45, 0.5) * flash * (0.3 + 0.4 * wind);
          c = g;
        }
        // THE TOWER as a bold silhouette (shaft, bracketed gallery, railing, lantern with its astragals and broken panes,
        // cornice, dome, vent ball, rod). At night it is a dark shape with a cold rim; in a flash the sky behind it goes
        // white and the tower stays black: the lantern-room shape reads at a glance.
        float H = 30.0, r0 = 4.6, r1 = 3.6;
        float ty = by - by0, lx = bx - tx, ax = abs(lx);
        float rH = mix(r0, r1, clamp(ty / H, 0.0, 1.0));
        vec3 sil = vec3(0.045, 0.055, 0.07) * (1.0 - 0.5 * flash);
        vec3 rimC = vec3(0.3, 0.36, 0.42) + vec3(0.9, 1.0, 1.15) * flash;
        float inside = 0.0, rim = 0.0; vec3 fillC = sil;
        // shaft: a little of the white paint shows on the village side, the red band, rain streaks
        if(ty > -2.0 && ty < H && ax < rH){
          inside = 1.0; float sx = lx / rH;
          vec3 paint = mix(vec3(0.06, 0.07, 0.09), vec3(0.13, 0.15, 0.18), smoothstep(-0.2, -0.6, sx));
          if(ty > 17.0 && ty < 19.5) paint = vec3(0.075, 0.04, 0.04);
          paint *= 1.0 - 0.2 * smoothstep(0.55, 0.8, vnoise(vec2(sx * 30.0, ty * 0.25)));
          fillC = mix(paint, sil, flash * 0.85);
          rim = step(rH - ax, 0.22) * step(lx, 0.0);
        }
        // gallery brackets and deck
        float gy = ty - H;
        if(gy > -0.9 && gy < 0.0 && ax < r1 + 0.95 * (gy + 0.9) / 0.9){ inside = 1.0; fillC = sil; }
        if(gy >= 0.0 && gy < 0.32 && ax < r1 + 0.95){ inside = 1.0; fillC = sil; rim = max(rim, step(0.24, gy)); }
        // railing: posts and a top rail, sky between
        if(gy >= 0.32 && gy < 1.45 && ax < r1 + 0.9){
          float post = step(fract((lx + 20.0) / 0.62), 0.16);
          float rail = step(abs(gy - 1.38), 0.07) + step(abs(gy - 0.85), 0.035);
          if(post + rail > 0.5){ inside = 1.0; fillC = sil; }
        }
        // lantern: solid lower wall, then glazing in tall panes between thick astragals and one transom
        if(gy >= 0.32 && gy < 4.3 && ax < 2.75){
          inside = 1.0;
          if(gy < 1.25) fillC = sil;
          else {
            float pa = fract((lx + 20.0) / 0.92), astr = step(pa, 0.14) + step(abs(gy - 2.8), 0.07);
            vec2 pid = floor(vec2((lx + 20.0) / 0.92, gy > 2.8 ? 1.0 : 0.0));
            float hole = uBroken * step(0.5, hash12(pid + 3.0));
            vec3 glass = mix(vec3(0.07, 0.09, 0.11), vec3(0.11, 0.14, 0.17), smoothstep(0.3, 0.8, vnoise(vec2(lx * 0.8, gy))));
            glass += vec3(1.0, 0.82, 0.5) * uTower.w;                               // lit before the bolt
            glass = mix(glass, vec3(0.02, 0.025, 0.03), flash * 0.7);
            vec3 pane = hole > 0.5 ? c : glass;                                       // broken panes: the sky shows through
            fillC = astr > 0.5 ? sil : pane;
            if(hole > 0.5 && astr < 0.5) inside = 0.0;
          }
          rim = max(rim, step(2.75 - ax, 0.12) * step(lx, 0.0));
        }
        // cornice, dome, vent ball, lightning rod
        if(gy >= 4.3 && gy < 4.55 && ax < 3.0){ inside = 1.0; fillC = sil; }
        float dy = gy - 4.55;
        if(dy >= 0.0){
          vec2 e = vec2(lx / 2.9, dy / 2.0);
          if(dot(e, e) < 1.0){ inside = 1.0; fillC = mix(vec3(0.05, 0.075, 0.07), sil, flash); rim = max(rim, step(0.8, dot(e, e)) * step(lx, 0.3)); }
          if(length(vec2(lx, dy - 2.2)) < 0.42){ inside = 1.0; fillC = sil; }
          if(dy < 5.6 && ax < 0.07){ inside = 1.0; fillC = sil; }
        }
        if(inside > 0.5) c = mix(fillC, rimC, rim * (0.35 + 0.65 * flash));
        // rain sheets between the window and the tower
        float rn = rainAir(vec2(bx, by) * 0.25, uDrawTime, 0.35 * uRainK);
        c = mix(c, vec3(0.32, 0.38, 0.44) + flash * 0.5, rn * 0.55);
      }
      return c;
    }

    // the storm swell around the boat (metres): long rollers from ahead, a cross sea, chop; crests sharpened
    float roller(vec2 p, vec2 d, float L, float A, float sp, float ph){
      float k = 6.2831853 / L;
      float s = 0.5 + 0.5 * sin(dot(p, d) * k - uTime * sp * k + ph);
      return A * (pow(s, 1.7) * 2.0 - 0.75);
    }
    float swellH(vec2 p){
      float K = uSeaK, Lk = pow(uSeaK, 0.25);
      float h = roller(p, normalize(vec2(0.15, 1.0)), 58.0 * Lk, 1.5 * K, 9.0 * Lk, 0.0);
      h += roller(p, normalize(vec2(-0.45, 1.0)), 29.0 * Lk, 0.7 * K, 6.5 * Lk, 1.3);
      h += roller(p, normalize(vec2(0.8, 0.6)), 13.0, 0.32, 4.5, 2.1);
      h += roller(p, normalize(vec2(-0.2, -1.0)), 6.0, 0.14, 3.0, 0.7);
      h += (vnoise(p * 0.45 + uTime * 0.3) - 0.5) * 0.3;
      return h;
    }

    // ---------- mode 1: the storm sea from the wheelhouse
    vec3 seaView(vec3 rdB, float flash){
      // boat frame -> world: undo pitch (about x) and roll (about z)
      float p = uBoat.x, r = uBoat.y;
      vec3 rd = rdB;
      rd = vec3(rd.x * cos(r) - rd.y * sin(r), rd.x * sin(r) + rd.y * cos(r), rd.z);
      rd = vec3(rd.x, rd.y * cos(p) - rd.z * sin(p), rd.y * sin(p) + rd.z * cos(p));
      float eye = uBoat.w + uBoat.z;
      vec3 c = stormSky(rd, flash);
      float az = atan(rd.x, -rd.z), el = asin(clamp(rd.y, -1.0, 1.0));
      // the headland: a low black hump on the horizon with the tower on it
      float ha = az - uHead.x;
      float hump = (0.018 + 0.012 * fbm2(vec2(ha * 30.0, 2.0))) * smoothstep(uHead.y, uHead.y * 0.4, abs(ha));
      float towerA = abs(ha - uHead.y * 0.25);
      float towerH = hump + step(towerA, 0.0035) * 0.026;
      if(el < towerH && el > -0.01){
        c = vec3(0.02, 0.03, 0.035) + flash * vec3(0.12, 0.14, 0.18);
      }
      // the light: a hard warm star on the tower, and the beam's fan when it swings past us
      float lightK = uHead.z;
      vec2 lp = vec2(ha - uHead.y * 0.25, el - hump - 0.028);
      float star = exp(-dot(lp, lp) / 0.000004);
      float fan = exp(-abs(lp.y) / 0.004) * exp(-abs(lp.x) / mix(0.004, 0.25, uHead.w)) * uHead.w;
      c += vec3(1.4, 1.1, 0.7) * lightK * (star * 1.6 + fan * 0.6);
      // march the storm swell: waves taller than the eye, so near crests cut the horizon
      if(rd.y < 0.06){
        float t = 1.0, tHit = -1.0, tPrev = 1.0;
        vec3 ro = vec3(uTravel.x, eye, -uTravel.y);
        for(int i = 0; i < 64; i++){
          vec3 p = ro + rd * t;
          float h = swellH(p.xz);
          if(p.y < h){ tHit = t; break; }
          tPrev = t;
          t += max(0.4, (p.y - h) * 0.55 + t * 0.012);
          if(t > 1400.0) break;
        }
        if(tHit > 0.0){
          float a0 = tPrev, a1 = tHit;
          for(int j = 0; j < 5; j++){ float m = 0.5 * (a0 + a1); vec3 p = ro + rd * m; if(p.y < swellH(p.xz)) a1 = m; else a0 = m; }
          float dist = a1;
          vec3 p = ro + rd * dist;
          vec2 e = vec2(0.35 + dist * 0.004, 0.0);
          float h0 = swellH(p.xz);
          vec3 n = normalize(vec3(h0 - swellH(p.xz + e.xy), e.x, h0 - swellH(p.xz + e.yx)));
          // cel tones: the black face, the slate back lit by the sky, the pale sky glint on slopes turned up
          float up = n.y, toward = dot(n, -rd);
          vec3 deep = vec3(0.007, 0.013, 0.018), face = vec3(0.02, 0.034, 0.045), back = vec3(0.06, 0.085, 0.1);
          vec3 sc = mix(deep, face, smoothstep(0.55, 0.6, up));
          sc = mix(sc, back, smoothstep(0.85, 0.88, up) * smoothstep(0.1, 0.4, -dot(n.xz, normalize(rd.xz))));
          float fres = pow(1.0 - max(toward, 0.0), 4.0);
          sc += vec3(0.08, 0.1, 0.12) * step(0.5, fres) * 0.6;
          // foam: whitecaps where the crests break, streaks blown downwind, lace on the faces
          float crestK = smoothstep(1.3 * uSeaK, 1.8 * uSeaK, h0);
          float cap = crestK * step(0.5, vnoise(p.xz * vec2(0.3, 0.14) + uTime * vec2(0.0, 0.4))) * (1.0 - 0.75 * smoothstep(120.0, 500.0, dist));
          // wind streaks: long thin lines downwind (along z), broken
          float wob = (vnoise(p.xz * 0.04 + 2.0) - 0.5) * 6.0;
          float streak = (1.0 - smoothstep(0.0, 0.03, abs(vnoise(vec2(p.x * 0.5 + wob, p.z * 0.03 + uTime * 0.2)) - 0.5))) * step(0.55, vnoise(vec2(p.x * 0.25, p.z * 0.09) + 9.0));
          // foam lace: a net of thin veins left behind by broken crests, densest on the backs of the waves
          float lv = abs(vnoise(p.xz * vec2(0.9, 0.6) + 3.0 + uTime * 0.05) - 0.5) + abs(vnoise(p.xz * 2.1 + 7.0) - 0.5) * 0.5;
          float lace = (1.0 - smoothstep(0.03, 0.06, lv)) * smoothstep(0.0, 1.2 * uSeaK, h0);
          float nearK = 1.0 - smoothstep(30.0, 320.0, dist);
          sc = mix(sc, vec3(0.36, 0.42, 0.46), cap * 0.85);
          sc = mix(sc, vec3(0.24, 0.29, 0.33), max(streak * 0.8, lace * 0.7) * nearK);
          sc += vec3(0.55, 0.62, 0.75) * flash * smoothstep(0.82, 0.92, up) * (0.4 + 0.6 * (1.0 - smoothstep(0.0, 0.5, dot(n, -rd))));
          // the headland's light glitters on the water toward us
          sc += vec3(1.0, 0.75, 0.4) * lightK * exp(-abs(ha - uHead.y * 0.25) / 0.008) * step(0.55, vnoise(p.xz * 0.7 + uTime)) * 0.6 * smoothstep(500.0, 40.0, dist);
          // far water melts into the rain haze at the horizon (darker than the sky above it)
          float haze = smoothstep(60.0, 1300.0, dist);
          c = mix(sc, vec3(0.05, 0.068, 0.082) + vec3(0.25, 0.28, 0.34) * flash, haze * 0.9);
        } else if(rd.y < 0.0){
          c = vec3(0.05, 0.068, 0.082);
        }
      }
      // rain in the air
      c = mix(c, vec3(0.3, 0.36, 0.42) + flash * 0.4, rainAir(vec2(az * 9.0, el * 9.0), uDrawTime, 0.3 * uRainK) * 0.5);
      return c;
    }

    vec3 slitView(vec3 rd, float flash){
      vec3 c = stormSky(rd, flash) * 1.4 + vec3(0.03, 0.04, 0.05);
      c = mix(c, vec3(0.3, 0.36, 0.42) + flash * 0.4, rainAir(vec2(atan(rd.x, -rd.z) * 9.0, rd.y * 9.0), uDrawTime, 0.35) * 0.4);
      // a slit is small: in a flash it goes white
      c += vec3(1.0, 1.08, 1.25) * flash * 0.9;
      return c;
    }

    // wiper: the last time the blade passed this pixel (in seconds ago), or 99
    float wipedAgo(vec2 q){
      if(uWipe.w < 0.5) return 99.0;
      vec2 d = q - uWipe.xy;
      float L = length(d);
      if(L > uWipe.z || L < 0.05 || d.y < -0.02) return 99.0;
      float phi = atan(d.x, d.y) - uWipeA.w;          // angle from straight up, relative to the sweep centre
      float A = uWipeA.x, w = uWipeA.y, ph = uWipeA.z;
      if(abs(phi) > A) return 99.0;
      float a0 = asin(clamp(phi / A, -1.0, 1.0));
      float T = 6.2831853 / w;
      float now = uDrawTime * w + ph;
      // blade angle = A sin(w t + ph): passes at w t + ph = a0 + 2 pi k and pi - a0 + 2 pi k
      float ago = 99.0;
      for(int s = 0; s < 2; s++){
        float base = s == 0 ? a0 : 3.14159265 - a0;
        float k = floor((now - base) / 6.2831853);
        float ta = now - (base + k * 6.2831853);
        ago = min(ago, ta / w);
      }
      return ago;
    }

    void main(){
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
      vec3 NV = normalize(vNormalV);
      vec3 ro = cameraPosition;
      vec3 rd = normalize(vWorld - ro);
      vec2 q = vec2(dot(vWorld - uWinC, uRight), vWorld.y - uWinC.y);
      float density = uMode > 0.5 && uMode < 1.5 ? 1.0 : 0.75;
      float ago = wipedAgo(q);
      // a freshly wiped arc is clear, re-wetting in about a second; a little water smear at the blade's edge
      float clear = 1.0 - smoothstep(0.15, 1.1, ago);
      vec3 w = glassWater(q + vec2(0.0, floor(ago * 4.0) * 0.37 * step(ago, 5.0)), uDrawTime, density * uRainK * (1.0 - clear * 0.9));
      vec3 rdb = normalize(rd + (uRight * w.x + vec3(0.0, 1.0, 0.0) * w.y) * 1.6);
      float flash = uFlash;
      vec3 c;
      if(uMode < 0.5) c = kitchenView(ro, rdb, flash);
      else if(uMode < 1.5) c = seaView(rdb, flash);     // the wheelhouse set is built unrotated: bow = -Z, so the boat frame is the set frame
      else c = slitView(rdb, flash);
      // a sheet of spray thrown over the bow: the whole pane runs with water for a moment, the view smears and greys out
      if(uSpray > 0.001){
        // runs: long wavering streaks pouring down (the sheet slides off as it ages)
        vec2 sq = vec2(q.x * 46.0 + sin(q.y * 13.0 + q.x * 41.0) * 0.45, q.y * 2.2 + uSprayT * 3.0);
        float runs = smoothstep(0.7, 0.84, vnoise(sq)) * smoothstep(0.45, 0.7, vnoise(vec2(q.x * 9.0, q.y * 2.5 + uSprayT * 3.0)));
        float sheet = smoothstep(0.2, 0.9, fbm2(q * vec2(3.0, 1.2) + vec2(0.0, uSprayT * 1.5)));
        c = mix(c, vec3(0.1, 0.125, 0.15) + vec3(0.5, 0.55, 0.65) * flash, uSpray * (0.35 + 0.4 * sheet));
        c += vec3(0.12, 0.145, 0.17) * uSpray * runs;
      }
      // condensation creeping up from the bottom of a cold pane (the warm kitchen side)
      if(uFog.x > 0.0){
        float fy = (q.y + uFog.y) / (2.0 * uFog.y);
        float fogK = uFog.x * (1.0 - smoothstep(0.0, 0.32 + 0.08 * fbm2(q * 6.0), fy)) * (0.7 + 0.3 * fbm2(q * 14.0));
        c = mix(c, vec3(0.16, 0.19, 0.22) + vec3(0.5, 0.55, 0.65) * flash, fogK * (1.0 - w.z));
      }
      // water film: a faint grey sheen; drops catch the light (rim highlight on their lower side)
      c = mix(c, c * 0.8 + vec3(0.03, 0.04, 0.05), w.z * 0.5);
      c += vec3(0.25, 0.3, 0.35) * w.z * step(0.6, -w.y / max(length(w.xy), 1e-4)) * 0.5 * (0.4 + flash);
      // the warm lamp behind the camera reflected in the glass, and its glints in the drops
      vec3 rr = reflect(rd, -uOut);
      vec3 ld = normalize(uLamp - vWorld);
      float ref = dot(rr, ld);
      c += uLampC * (pow(max(ref, 0.0), 900.0) * 0.9 + pow(max(ref, 0.0), 40.0) * 0.05 + w.z * pow(max(ref, 0.0), 12.0) * 0.25);
      // the wiper edge leaves a thin streak of water
      c = mix(c, vec3(0.2, 0.25, 0.3), (1.0 - smoothstep(0.0, 0.04, abs(ago - 0.03))) * 0.25 * step(ago, 1.0));
      writeOut(c, 1.0, NV, vDepth, uId);
    }
  `;
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: vs, fragmentShader: fs, side: THREE.DoubleSide });
}
