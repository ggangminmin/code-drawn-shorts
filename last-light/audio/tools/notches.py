"""Gear-click table for the lens, derived numerically from the lead's beam clock (layout.beamAz).

The lens's big brass gear has one tooth per BEAM jump at CUES.notch (stuckAz -> stuckAz - 0.12 rad): tooth pitch 0.12 rad.
Tooth boundaries sit at stuckAz - k * pitch, so the single tooth of CUES.notch is crossed the instant the lens moves.
A pawl click sounds whenever beamAz crosses a tooth boundary (either direction); the crossing time is interpolated
between clock samples (audio/cache/timeline.json, 960 samples/s, written by dump_timeline.mjs).
Lens panels (LENS.panels = 8) knock against the pawl stop every 2*pi/8, offset by half a panel.

Usage (project root):  node audio/tools/dump_timeline.mjs && python -I audio/tools/notches.py
Writes audio/notches.json  {tooth_pitch, teeth:[{t, frame, dir}], panels:[...]} and prints a summary.
"""
import os, json, math
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
AUD = os.path.dirname(HERE)


def crossings(t, az, origin, pitch, offset=0.0):
    """Times where v = (origin - az) / pitch - offset crosses an integer. Returns [(time, direction)]."""
    v = (origin - az) / pitch - offset
    k = np.ceil(v - 1e-9)
    out = []
    jump = np.abs(np.diff(az)) > 0.02            # a discontinuity in the clock (the bolt resets the lens): no clicks
    for i in np.where((np.diff(k) != 0) & ~jump)[0]:
        a, b = v[i], v[i + 1]
        K0, K1 = int(k[i]), int(k[i + 1])
        for m in (range(K0, K1) if K1 > K0 else range(K0 - 1, K1 - 1, -1)):
            u = min(1.0, max(0.0, (m - a) / (b - a)))
            out.append((float(t[i] + u * (t[i + 1] - t[i])), 1 if b > a else -1))
    return out


def compute(tl):
    t = np.array(tl['t'])
    az = np.array(tl['beamAz'])
    on = np.array(tl['beamOn'])
    stuck = tl['BEAM']['stuckAz']
    C = tl['CUES']
    pitch = 0.12   # = the one-tooth jump of layout.beamAz at CUES.notch
    fps = tl['FPS']
    teeth = [{'t': round(x, 4), 'frame': int(math.floor(x * fps + 1e-6)), 'dir': d} for x, d in crossings(t, az, stuck, pitch)]
    panels = [{'t': round(x, 4), 'frame': int(math.floor(x * fps + 1e-6)), 'dir': d}
              for x, d in crossings(t, az, stuck, 2 * math.pi / tl['LENS']['panels'], 0.5)]
    # the notch tooth itself
    notch = min(teeth, key=lambda e: abs(e['t'] - C['notch'])) if teeth else None
    return {'tooth_pitch': pitch, 'panel_pitch': 2 * math.pi / tl['LENS']['panels'], 'notch_tooth': notch,
            'teeth': teeth, 'panels': panels}


if __name__ == '__main__':
    tl = json.load(open(os.path.join(AUD, 'cache', 'timeline.json')))
    res = compute(tl)
    with open(os.path.join(AUD, 'notches.json'), 'w') as f:
        json.dump(res, f, indent=0)
    th = res['teeth']
    print(f"{len(th)} tooth clicks, {len(res['panels'])} panel knocks; notch tooth at {res['notch_tooth']['t']} s "
          f"(CUES.notch {tl['CUES']['notch']})")
    for a, b in [(0, 3), (25, 27.5), (40.5, 41.5), (70, 73)]:
        sel = [e['t'] for e in th if a <= e['t'] < b]
        print(f'  {a:5.1f}-{b:5.1f}: {len(sel):3d} clicks', sel[:8], '...' if len(sel) > 8 else '')
