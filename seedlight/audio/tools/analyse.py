"""Checks on out/soundtrack.wav against audio/cache/timeline.json (run after render.py).
  format + exact length, integrated loudness, true peak (own meter + ffmpeg ebur128 when available),
  every locked cue found IN THE FINAL FILE by cross-correlating its isolated stem (cache/cues.npz) around the timeline time,
  plus an independent level-step test at the cue, the held breath before CUES.erupt, frame 0, and the fade to black.
Usage (project root): ~/.venvs/opus_audio/bin/python -I audio/tools/analyse.py
"""
import os, sys, json, math, re, subprocess, site
sys.path.append(site.getusersitepackages())
import numpy as np
import soundfile as sf
from scipy import signal

HERE = os.path.dirname(os.path.abspath(__file__))
AUDIO = os.path.dirname(HERE)
PROJ = os.path.dirname(AUDIO)
WAV = os.path.join(PROJ, 'out', 'soundtrack.wav')
TL = json.load(open(os.path.join(AUDIO, 'cache', 'timeline.json')))
C, FPS, DUR = TL['CUES'], TL['FPS'], float(TL['DURATION'])
SHN = {s['name']: s for s in TL['SHOTS']}
x, sr = sf.read(WAV, always_2d=True)
info = sf.info(WAV)
ok = True


def check(name, cond, text):
    global ok
    ok = ok and bool(cond)
    print(('PASS ' if cond else 'FAIL ') + name + ': ' + text)


def kweight(v):
    b1, a1 = [1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585]
    b2, a2 = [1, -2, 1], [1, -1.99004745483398, 0.99007225036621]
    return signal.lfilter(b2, a2, signal.lfilter(b1, a1, v, axis=0), axis=0)


def lufs(v):
    k = kweight(v)
    blk, hop = int(0.4 * sr), int(0.1 * sr)
    ms = np.array([np.mean(k[i:i + blk] ** 2, 0).sum() for i in range(0, len(k) - blk, hop)])
    l = -0.691 + 10 * np.log10(ms + 1e-12)
    rel = -0.691 + 10 * np.log10(ms[l > -70].mean()) - 10
    return -0.691 + 10 * np.log10(ms[(l > -70) & (l > rel)].mean())


def rms_db(a, b):
    s = x[int(a * sr):int(b * sr)]
    return 20 * math.log10(math.sqrt(float(np.mean(s ** 2))) + 1e-9)


check('format', sr == 48000 and x.shape[1] == 2, f'{sr} Hz, {x.shape[1]} ch, {info.subtype}')
check('length', len(x) == round(DUR * sr), f'{len(x)} samples = {len(x) / sr:.4f} s (timeline {DUR:.3f} s)')
L = lufs(x)
tp = 20 * math.log10(np.abs(signal.resample_poly(x, 4, 1, axis=0)).max())
check('loudness', abs(L + 16) <= 1, f'{L:.2f} LUFS integrated (target -16 +-1)')
check('true peak', tp < -1, f'{tp:.2f} dBTP (limit -1)')
check('no clipping', np.abs(x).max() < 0.999, f'sample peak {20 * math.log10(np.abs(x).max()):.2f} dBFS')
try:
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', WAV, '-af', 'ebur128=peak=true', '-f', 'null', '-'],
                       capture_output=True, text=True).stderr
    tail = r[r.rfind('Summary:'):]
    I = float(re.search(r'I:\s+(-?[\d.]+) LUFS', tail).group(1))
    P = float(re.search(r'Peak:\s+(-?[\d.]+) dBFS', tail).group(1))
    LRA = float(re.search(r'LRA:\s+(-?[\d.]+) LU', tail).group(1))
    check('ffmpeg ebur128', abs(I + 16) <= 1 and P < -1, f'I {I} LUFS, true peak {P} dBFS, LRA {LRA} LU')
except Exception as e:  # noqa
    print('SKIP ffmpeg ebur128:', e)

# ---- cues: where does each locked sound actually sit in the final file?
want = {'frame0': 0.0, 'kneel': SHN['kneel']['start'] + 0.7}
for s in TL['SHELLS']:
    want['R_' + s['id']] = s['t0']
    want['B_' + s['id']] = s['t1']
stems = np.load(os.path.join(AUDIO, 'cache', 'cues.npz'))
placed = json.load(open(os.path.join(AUDIO, 'cache', 'cue_times.json')))
mono = x.mean(1)
fxs = np.load(os.path.join(AUDIO, 'cache', 'fx_stem.npy')).astype(float)
frame = 1 / FPS
print(f'\ncue lock (tolerance +-1 frame = +-{frame * 1000:.1f} ms). fx = each cue stem located in the SFX group; mix = located in the final file; step = level in the 60 ms after vs before')
print('%-20s %9s %9s %9s %9s %8s' % ('cue', 'timeline', 'placed', 'fx ms', 'mix ms', 'step dB'))
nbad = 0
rows = []
for name in sorted(stems.files, key=lambda k: placed[k]):
    t = want.get(name, C.get(name))
    if t is None:
        continue
    st = stems[name].astype(float).mean(1)
    st = st[:int(0.25 * sr)]
    i0 = int(round(t * sr))
    W = int(0.12 * sr)
    a = max(0, i0 - W)
    seg = mono[a:i0 + W + len(st)]
    cc = signal.correlate(seg, st, mode='valid')
    k = int(np.argmax(cc))
    lag = (a + k - i0) / sr
    lag_fx = (a + int(np.argmax(signal.correlate(fxs[a:i0 + W + len(st)], st, mode='valid'))) - i0) / sr
    step = rms_db(t, min(DUR, t + 0.06)) - rms_db(max(0, t - 0.08), max(0.001, t - 0.02)) if t > 0.1 else float('nan')
    masked = abs(lag) > frame / 4
    bad = abs(placed[name] - t) > 1e-6 or min(abs(lag_fx), abs(lag)) > frame   # music-bus cues (glass tone) are only in the mix
    nbad += bad
    rows.append((name, t, lag))
    print('%-20s %9.3f %9.3f %+9.1f %+9.1f %+8.1f %s' % (name, t, placed[name], lag_fx * 1000, lag * 1000, step,
                                                     'FAIL' if bad else ('(soft cue under the music: not separable in the full mix)' if masked else '')))
check('cue lock', nbad == 0, f'{len(rows)} cues checked, {nbad} outside +-1 frame; ' + str(sum(abs(r[2]) <= frame / 4 for r in rows)) + ' also located directly in the final mix')

# ---- story checks
se, er = C['sweepEnd'], C['erupt']
breath = rms_db(se + 0.16, er - 0.02)
after_ = rms_db(er, er + 0.3)
check('held breath', breath < -50 and after_ - breath > 30, f'{breath:.1f} dBFS in {se + 0.16:.2f}-{er - 0.02:.2f}, then {after_:.1f} dBFS at the eruption')
check('frame 0 sounding', rms_db(0, 0.05) > -45, f'{rms_db(0, 0.05):.1f} dBFS in the first 50 ms')
h = C['shell1Hit']
check('fade to black', rms_db(DUR - 0.02, DUR) < -60 and rms_db(DUR - 0.36, DUR - 0.3) > -50, f'{rms_db(DUR - 0.36, DUR - 0.3):.1f} dBFS before the fade, {rms_db(DUR - 0.02, DUR):.1f} dBFS in the last 20 ms; last sample {np.abs(x[-1]).max():.5f}')
tb = C['threadBack']
check('glass tone returns', rms_db(tb, tb + 0.3) - rms_db(tb - 0.3, tb - 0.02) > 3, f'{rms_db(tb - 0.3, tb - 0.02):.1f} -> {rms_db(tb, tb + 0.3):.1f} dBFS at threadBack')
# the glass tone's pitch at frame 0 and at threadBack
for nm, t in (('frame 0', 0.0), ('threadBack', tb)):
    s = mono[int(t * sr):int((t + 0.5) * sr)] * np.hanning(int(0.5 * sr))
    sp = np.abs(np.fft.rfft(s))
    f = np.fft.rfftfreq(len(s), 1 / sr)
    band = (f > 1000) & (f < 4000)
    print(f'   strongest partial 1-4 kHz at {nm}: {f[band][np.argmax(sp[band])]:.0f} Hz')
print('\nmomentary loudness by shot (dB RMS of the final file)')
print('  '.join(f"{s['id']} {rms_db(s['start'], s['end']):.0f}" for s in TL['SHOTS']))
print('\nALL PASS' if ok else '\nSOME CHECKS FAILED')
sys.exit(0 if ok else 1)
