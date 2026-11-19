"""SEEDLIGHT soundtrack: original score + designed SFX, mixed and mastered to out/soundtrack.wav.

Deterministic (seeded): same samples + same code + same timeline -> same file.  Usage (from the project root):
    ~/.venvs/opus_audio/bin/python -I audio/render.py
render.py first runs `node audio/tools/dump_timeline.mjs`, which samples CUES / SHOTS / SHELLS and the shared clocks
(threadOn, irisHeat, sweepU, eruptU, shipPos, shipList, quake) of src/shots.js + src/layout.js into audio/cache/timeline.json.
EVERY time below is derived from that file: move a cue, re-run, and the sound follows. Nothing is typed in seconds except
offsets relative to a cue or a shot boundary. Key: D (minor = the vault and the war, major = the seed theme). Map: cuesheet.md.
"""
import os, sys, math, time, json, subprocess, site
sys.path.append(site.getusersitepackages())
import numpy as np
import soundfile as sf
from scipy import signal
from scipy.ndimage import minimum_filter1d, uniform_filter1d

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, 'lib'))
from dsp import *  # noqa
import sfx as X  # noqa
import seedfx as F  # noqa

PROJ = os.path.dirname(HERE)
OUT = os.path.join(PROJ, 'out', 'soundtrack.wav')
CACHE = os.path.join(HERE, 'cache')
T0 = time.time()
MUS_DB, HIT_DB, SFX_DB, BED_DB = -2.0, 0.0, 0.0, 0.0     # group trims


def log(*a):
    print(f'[{time.time() - T0:6.1f}s]', *a, flush=True)


# ------------------------------------------------------------------------------------------------ timeline
try:
    subprocess.run(['node', os.path.join(HERE, 'tools', 'dump_timeline.mjs')], check=True, cwd=PROJ)
except (OSError, subprocess.CalledProcessError) as e:
    print('node dump failed, using cached timeline:', e)
TL = json.load(open(os.path.join(CACHE, 'timeline.json')))
C = TL['CUES']
DUR = float(TL['DURATION'])
FPS = TL['FPS']
SHOTS = TL['SHOTS']
SH = {s['id']: s for s in SHOTS}
SHN = {s['name']: s for s in SHOTS}
SHELLS = TL['SHELLS']
N = secs(DUR)
TT = np.arange(N) / SR
log(f'timeline: {DUR} s ({N} samples), {len(SHOTS)} shots, {len(SHELLS)} shells')


def clock(name):
    """A layout.js clock resampled to audio rate."""
    return np.interp(TT, np.array(TL['t']), np.array(TL[name], dtype=float))


def ramp_times(name, us):
    """Times at which a 0..1 ramp clock (sweepU, eruptU) reaches each u in us (inverse of the lead's own function)."""
    t = np.array(TL['t'])
    u = np.array(TL[name], dtype=float)
    i0 = max(0, int(np.argmax(u > 0)) - 1)
    i1 = int(np.argmax(u >= 1)) if (u >= 1).any() else len(u) - 1
    return np.interp(us, u[i0:i1 + 1], t[i0:i1 + 1])


def s0(name):
    return SHN[name]['start']


def s1(name):
    return SHN[name]['end']


def shot_env(table, default=0.0, fd=0.03):
    """Per-shot gain (by shot name), with short fades at the cuts."""
    g = np.full(N, float(default))
    for s in SHOTS:
        g[secs(s['start']):secs(s['end'])] = table.get(s['name'], default)
    return uniform_filter1d(g, secs(fd))


def after(t, att=0.02):
    return np.clip((TT - t) / att, 0, 1)


def before(t, rel=0.05):
    return np.clip((t - TT) / rel, 0, 1)


# ------------------------------------------------------------------------------------------------ buses
B = {k: np.zeros((N, 2)) for k in ['mus', 'hit', 'sfx', 'bed', 'rv_hall', 'rv_vault', 'rv_out']}
EVENTS, CUESTEM, NOTES = [], {}, []
INSIDE = ('vault', 'shaft')


def room(t):
    """Reverb send for a sound at time t: the stone vault inside the dam, or the open night outside."""
    for s in SHOTS:
        if t < s['end']:
            return {'vault': 0.4} if s['set'] in INSIDE else {'out': 0.16}
    return {'out': 0.16}


def put(x, t, pk, name, bus='sfx', p=None, cue=None, send=None):
    """Place a sound with its onset at t, normalised to a peak of pk dBFS (pre-master). cue = lock check name."""
    if x.ndim == 1:
        x = pan(x, p or 0.0)
    elif p:
        x = spread(x, p)
    g = db(pk) / (np.abs(x).max() + 1e-12)
    add(B[bus], x, t, g)
    for k, v in (room(t) if send is None else send).items():
        add(B['rv_' + k], x, t, g * v)
    EVENTS.append((round(float(t), 3), name, bus, pk, cue or ''))
    if cue:
        CUESTEM[cue] = (float(t), (x[:secs(0.4)] * g).astype(np.float32))


def spread(x, p):
    gl = min(1.0, 1 - p) ** 0.5 if p > 0 else 1.0
    gr = min(1.0, 1 + p) ** 0.5 if p < 0 else 1.0
    y = x.copy()
    y[:, 0] *= gl
    y[:, 1] *= gr
    if p > 0:
        y[:, 1] += x[:, 0] * (1 - gl) * 0.7
    elif p < 0:
        y[:, 0] += x[:, 1] * (1 - gr) * 0.7
    return y


SEAT = {'vn': -0.45, 'va': 0.15, 'vc': 0.4, 'cb': 0.55, 'hn': -0.3, 'tb': 0.3, 'tu': 0.45, 'tp': 0.05, 'fl': -0.1, 'ob': 0.1,
        'cl': -0.15, 'bn': 0.2, 'harp': -0.5, 'glock': -0.2, 'glass': 0.0, 'vib': 0.0, 'bells': 0.1}
INST = {}


def M(n):
    return midi(n) if isinstance(n, str) else n


def note(key, n, t, dur, vel=0.6, g=0.0, att=0.0, rel=0.5, shape=None, rr=0, hall=1.0):
    """One sampled note (CC0 single-note samples played by code). g = gain dB; shape = [(t_rel, gain), ...]."""
    if key not in INST:
        INST[key] = Inst(key)
    x = INST[key].note(M(n), dur, vel=vel, att=att, rel=rel, rr=rr)
    if shape:
        x = x * env_points(len(x), shape)[:, None]
    x = spread(x, SEAT.get(key.split('_')[0], 0.0))
    add(B['mus'], x, t, db(g))
    add(B['rv_hall'], x, t, db(g) * hall)
    NOTES.append((round(float(t), 3), key, M(n), round(dur, 2), g))


def chord(key, notes, t, dur, **kw):
    for i, n in enumerate(notes):
        note(key, n, t, dur, rr=i, **kw)


def timp(n, t, g=0.0, drum=2, dur=2.5):
    f, pk = X.TIMP[drum]
    ratio = hz(M(n)) / (pk or 150.0)
    while ratio > 1.26:
        ratio /= 2
    while ratio < 0.63:
        ratio *= 2
    y = fade(varispeed(load(f), ratio)[:secs(dur)].copy(), 0.0005, 0.3)
    add(B['mus'], y, t, db(g))
    add(B['rv_hall'], y, t, db(g))


def perc(key, t, g=0.0, ratio=1.0, dur=None, lpf=None):
    y = X.S(key, ratio, dur)
    if lpf:
        y = lp(y, lpf)
    add(B['mus'], y, t, db(g))
    add(B['rv_hall'], y, t, db(g))


def swell(key, t_end, d, g=0.0, ratio=1.0):
    """A sampled crescendo (suspended cymbal / bass drum) whose loudest point lands on t_end."""
    y = X.S(key, ratio)
    k = int(np.argmax(np.abs(y).max(1)))
    y = fade(y[max(0, k - secs(d)):k + secs(0.03)].copy(), min(0.3, d / 2), 0.03)
    add(B['mus'], y, t_end - len(y) / SR + 0.03, db(g))


# ------------------------------------------------------------------------------------------------ SCORE
# The seed theme (D major): A4 D5 F#5 E5 | D5 ... Five notes; the third lands on the hand, the last on the light.
TH = ['A4', 'D5', 'F#5', 'E5', 'D5']
TH_MIN = ['A4', 'D5', 'F5', 'E5', 'D5']
TH2 = ['B4', 'D5', 'A5', 'F#5', 'E5']


def up(n, st_):
    return M(n) + st_


def glass_tone(t, dur, g=0.0, name='glass tone'):
    """The single high glass tone that opens and closes the film (A6: wine glass + glockenspiel + two pure partials)."""
    note('glass', 'A5', t, dur, vel=0.7, g=g - 3, rel=1.2, hall=1.4)
    note('glock', 'A6', t, dur, vel=0.5, g=g - 9, rel=1.0, hall=1.4)
    n = secs(dur + 1.0)
    tt = np.arange(n) / SR
    y = (np.sin(2 * np.pi * 1760 * tt) + 0.6 * np.sin(2 * np.pi * 1762.2 * tt + 1) + 0.15 * np.sin(2 * np.pi * 3520 * tt))
    y *= env_points(n, [(0, 0), (0.003, 1), (0.25, 0.6), (dur, 0.4), (dur + 1.0, 0)]) * (1 + 0.08 * np.sin(2 * np.pi * 5.1 * tt))
    y = F.st(y, 0.6, 5) * db(g - 17)
    add(B['mus'], y, t)
    add(B['rv_hall'], y, t, 1.4)
    EVENTS.append((round(float(t), 3), name, 'mus', g, name if t > 1 else 'frame0'))
    CUESTEM['threadBack' if t > 1 else 'frame0'] = (float(t), y[:secs(0.4)].astype(np.float32))


def sc_hook():
    """0 .. s02: the glass tone is already sounding at frame 0; the dread note arrives with the iris."""
    glass_tone(0.0, C['irisOpen'] - 0.2, 0.0)
    t = C['irisOpen']
    d = s1('fingers') - t
    sh = [(0, 0), (0.06, 1), (d * 0.5, 0.8), (d + 0.5, 0)]
    note('cb_sus', 'D1', t, d, vel=0.8, g=-1, att=0.05, rel=0.6, shape=sh)
    note('cb_sus', 'D2', t, d, vel=0.7, g=-4, att=0.05, rel=0.6, shape=sh)
    note('tu_sus', 'D2', t, d * 0.7, vel=0.4, g=-9, att=0.2, rel=1.0)
    note('bn', 'D2', t, d * 0.7, vel=0.4, g=-12, att=0.15, rel=1.0)
    perc('bd_muted_mf', t, -6, 0.7)
    perc('gong_p', t, -14, 0.6, lpf=1500)


def sc_vault():
    """s02 .. s06: sparse, tense low strings and metal."""
    a, b = s0('fingers'), s0('rise')
    note('cb_trem', 'D2', a, b - a, vel=0.3, g=-13, att=0.6, rel=0.8)
    note('vc_pizz', 'D2', C['twitch'] + 0.55, 0.8, vel=0.5, g=-9)
    note('vc_pizz', 'A2', C['twitch'] + 1.05, 0.8, vel=0.4, g=-11)
    perc('gong_scrape1', s0('guards'), -17, 0.7, dur=2.0)
    note('vib_bow', 'Eb3', s0('guards') + 0.1, 1.6, vel=0.4, g=-15, att=0.3, rel=1.0)
    note('vc_pizz', 'Eb2', s0('guards') + 0.6, 0.8, vel=0.5, g=-10)
    note('cb_pizz', 'D2', C['lampDrop'] + 0.45, 0.8, vel=0.5, g=-9)
    # it stands: a slow chromatic climb of low strings and trombone, cut dead by the arm
    t0, t1 = C['standUp'], C['armDrop']
    seq = ['D2', 'Eb2', 'E2', 'F2', 'F#2', 'G2']
    dd = (t1 - t0) / len(seq)
    for i, n in enumerate(seq):
        g = -15 + 9 * i / (len(seq) - 1)
        note('vc_sus', n, t0 + i * dd, dd * 1.02, vel=0.5 + 0.06 * i, g=g, att=0.08, rel=0.12)
        note('cb_sus', up(n, -12), t0 + i * dd, dd * 1.02, vel=0.5 + 0.06 * i, g=g, att=0.08, rel=0.12)
    note('tb_sus', 'D2', t0, t1 - t0, vel=0.5, g=-12, att=1.2, rel=0.1, shape=[(0, 0.2), (t1 - t0, 1)])
    note('va_trem', 'Ab3', t0 + dd * 2, t1 - t0 - dd * 2, vel=0.4, g=-14, att=0.8, rel=0.08)
    note('cb_sus', 'C#2', t1 + 0.5, s1('rise') - t1 - 0.5, vel=0.4, g=-11, att=0.3, rel=0.4)
    # the head turns: a high cluster tightening until the ray
    a, b = C['volley'] + 0.5, C['ray1']
    for n, g in (('D5', -15), ('Eb5', -16), ('A5', -18)):
        note('vn_trem' if n != 'D5' else 'va_trem', n, a, b - a - 0.05, vel=0.4, g=g, att=0.7, rel=0.04, shape=[(0, 0.3), (b - a, 1)])
    # the line sags: tritone tremolo into the burst
    a, b = C['ray1'] + 0.5, C['doorBurst']
    for k, n in (('vc_trem', 'D2'), ('vc_trem', 'Ab2'), ('cb_trem', 'D2')):
        note(k, n, a, b - a, vel=0.6, g=-9, att=0.3, rel=0.05, shape=[(0, 0.2), (b - a, 1)])
    t = C['doorBurst']
    chord('tb_stac', ['D2', 'A2', 'D3'], t, 0.5, vel=0.9, g=-6)
    chord('hn_stac', ['F3', 'A3'], t, 0.5, vel=0.9, g=-7)
    timp('D2', t, -4)


def ostinato(t0, t1, roots, g0, g1, step=0.2, violins_from=0.5, pattern=(0, 7, 12, 7, 14, 12, 7, 12)):
    """Rising spiccato ostinato: 8 steps per root, crescendo g0 -> g1 dB. The grid starts on t0 (a shot or a cue)."""
    k = 0
    t = t0
    while t < t1 - 0.02:
        u = (t - t0) / max(1e-6, t1 - t0)
        root = M(roots[min(len(roots) - 1, (k // 8))])
        n = root + pattern[k % 8]
        g = g0 + (g1 - g0) * u
        acc = 2.0 if k % 8 == 0 else (0.8 if k % 4 == 0 else 0)
        note('vc_spic', n, t, 0.16, vel=0.55 + 0.35 * u, g=g + acc, rr=k)
        if k % 2 == 0:
            note('cb_spic', root - 12 if root - 12 >= 26 else root, t, 0.16, vel=0.55 + 0.3 * u, g=g - 2 + acc, rr=k)
        if u > violins_from * 0.5:
            note('va_spic', n + 12, t, 0.16, vel=0.5 + 0.35 * u, g=g - 3 + acc, rr=k)
        if u > violins_from:
            note('vn_spic', n + 24, t, 0.14, vel=0.5 + 0.4 * u, g=g - 4 + acc, rr=k)
        t += step
        k += 1


def stab(t, g=0.0, minor=True, crash=False):
    third = 'F' if minor else 'F#'
    chord('tb_stac', ['D2', 'A2', 'D3'], t, 0.45, vel=0.9, g=g - 5)
    chord('hn_stac', [third + '3', 'A3', 'D4'], t, 0.45, vel=0.9, g=g - 6)
    note('tu_stac', 'D2', t, 0.45, vel=0.9, g=g - 5)
    timp('D2', t, g - 4)
    perc('bd_vsco_ff', t, g - 8, 0.9)
    if crash:
        perc('crash_ff', t, g - 12)


def sc_escape():
    """s07 .. s12: the rising ostinato (shaft, burst, alarm, stairs, climb), thinning to a held breath on the roof."""
    a, b = s0('shaft'), s0('roof')
    ostinato(a, b, ['D2', 'D2', 'F2', 'F2', 'G2', 'G2', 'A2', 'Bb2', 'C3'], -15, -5)
    line = ['D4', 'F4', 'G4', 'A4', 'Bb4', 'C5', 'D5']
    dd = (b - a) / len(line)
    for i, n in enumerate(line):
        g = -16 + 8 * i / (len(line) - 1)
        note('hn_sus', up(n, -12), a + i * dd, dd, vel=0.5 + 0.05 * i, g=g, att=0.15, rel=0.25)
        if i >= 3:
            note('tp_sus', n, a + i * dd, dd, vel=0.5, g=g - 5, att=0.15, rel=0.25)
            note('vn_sus', up(n, 12), a + i * dd, dd, vel=0.6, g=g - 4, att=0.15, rel=0.25)
    stab(C['leap'], -6)
    stab(C['burst'], -2, crash=True)
    stab(C['alarm'], -5)
    for t in np.arange(s0('stairs'), b, 1.6):
        timp('D2' if int(round((t - a) / 1.6)) % 2 == 0 else 'A1', t, -9)
    # the roof: only a high tremolo and a slow pulse; the hand; the head against the moon
    a, b = s0('roof'), s1('roof')
    chord('vn_trem', ['A5', 'D6'], a, b - a, vel=0.3, g=-17, att=0.2, rel=0.15)
    for t in np.arange(a + 0.2, C['gripParapet'] - 0.1, 0.4):
        note('cb_pizz', 'D2', t, 0.5, vel=0.5, g=-11)
    t = C['gripParapet']
    chord('tb_stac', ['D2', 'A2'], t, 0.4, vel=0.8, g=-9)
    timp('D2', t, -7)
    t = C['headRise']
    d = b - t
    sh = [(0, 0.15), (d * 0.85, 1), (d, 0.7)]
    chord('hn_sus', ['D3', 'A3', 'D4'], t, d, vel=0.6, g=-11, att=0.3, rel=0.12, shape=sh)
    chord('vc_sus', ['D2', 'A2'], t, d, vel=0.6, g=-11, att=0.3, rel=0.12, shape=sh)
    note('tu_sus', 'D2', t, d, vel=0.5, g=-13, att=0.3, rel=0.12, shape=sh)


def sc_kneel():
    """s13 + s14: everything drops away. The seed theme, five notes; the third on the hand, the fifth on the light."""
    hc, cl_ = C['handChest'], C['chestLit']
    step = min(0.45, (hc - s0('kneel') - 0.9) / 2)          # the theme starts after the kneel has landed
    times = [hc - 2 * step, hc - step, hc, hc + (cl_ - hc) * 0.5, cl_]
    for i, (n, t) in enumerate(zip(TH, times)):
        d = (times[i + 1] - t) if i < 4 else 1.6
        note('harp', n, t, 1.4, vel=0.55, g=-7)
        note('cl', n, t, d * 1.05, vel=0.45, g=-11, att=0.05, rel=0.3)
    note('harp', 'D3', times[0], 2.0, vel=0.45, g=-11)
    note('harp', 'A3', hc, 2.0, vel=0.45, g=-11)
    # warm bed: G (the light) -> D (wonder)
    a = cl_
    b = s0('wonder')
    chord('vc_sus', ['G2', 'D3'], a, b - a + 0.2, vel=0.4, g=-14, att=0.35, rel=0.6)
    chord('va_sus', ['B3', 'D4'], a, b - a + 0.2, vel=0.4, g=-15, att=0.35, rel=0.6)
    note('harp', 'G2', a, 2.5, vel=0.5, g=-9)
    e = C['shell1Hit']
    chord('vc_sus', ['D2', 'A2'], b, e - b, vel=0.45, g=-13, att=0.4, rel=0.3)
    chord('va_sus', ['F#3', 'A3'], b, e - b, vel=0.45, g=-14, att=0.4, rel=0.3)
    note('hn_sus', 'D3', b, e - b, vel=0.3, g=-18, att=0.6, rel=0.3)
    w = s1('wonder') - b
    t2 = [b + 0.1, b + 0.1 + w * 0.22, b + 0.1 + w * 0.44, b + 0.1 + w * 0.72, s1('wonder') + 0.05]
    for i, (n, t) in enumerate(zip(TH2, t2)):
        d = (t2[i + 1] - t) if i < 4 else max(0.2, e - t)
        note('fl', up(n, 12), t, d, vel=0.45, g=-12, att=0.05, rel=0.3)
        note('vn_sus', n, t, d, vel=0.45, g=-13, att=0.08, rel=0.3)
        note('harp', n, t, 1.2, vel=0.5, g=-10)
    note('harp', 'D3', b, 2.0, vel=0.5, g=-10)


def sc_down():
    """s16 + the sweep: after the brutal cut, almost nothing; a white-hot cluster from irisBack, cut for the ray's own voice."""
    a, b = s0('down') + 0.2, C['irisBack']
    note('cb_sus', 'D1', a, b - a, vel=0.3, g=-12, att=0.5, rel=0.3)
    perc('bd_muted_pp', a + 0.5, -9, 0.6)
    perc('bd_muted_pp', a + 1.3, -9, 0.6)
    a, b = C['irisBack'], C['sweep']
    for n, g in (('A5', -13), ('Bb5', -14), ('D6', -15), ('Eb6', -17)):
        note('vn_trem', n, a, b - a - 0.04, vel=0.6, g=g, att=0.05, rel=0.03, shape=[(0, 0.25), (b - a, 1)])
    note('cb_trem', 'D2', a, b - a - 0.04, vel=0.6, g=-9, att=0.1, rel=0.03, shape=[(0, 0.25), (b - a, 1)])


def tutti(t, d, g=0.0, minor=True, top=True):
    third = 'F' if minor else 'F#'
    note('tu_sus', 'D2', t, d, vel=0.9, g=g - 4, rel=0.4)
    chord('tb_sus', ['D2', 'A2', 'D3'], t, d, vel=0.9, g=g - 5, rel=0.4)
    chord('hn_sus', [third + '3', 'A3', 'D4'], t, d, vel=0.9, g=g - 6, rel=0.4)
    if top:
        chord('tp_sus', ['D4', third + '4', 'A4'], t, d, vel=0.9, g=g - 8, rel=0.4)
    chord('vn_trem', ['D5', third + '5', 'A5'], t, d, vel=0.9, g=g - 7, rel=0.4)
    chord('va_trem', ['A3', 'D4'], t, d, vel=0.9, g=g - 8, rel=0.4)
    chord('vc_sus', ['D2', 'A2'], t, d, vel=0.9, g=g - 5, rel=0.4)
    note('cb_sus', 'D1', t, d, vel=0.9, g=g - 3, rel=0.4)
    timp('D2', t, g - 1)
    perc('bd_vsco_fff', t, g - 4, 0.8)
    perc('gong_fff', t, g - 7, 0.8)
    perc('crash_fff', t, g - 9)


def brass_line(notes, times, last, g=0.0, keys=('hn_sus', 'tb_sus'), octs=(-12, -12)):
    for i, (n, t) in enumerate(zip(notes, times)):
        d = (times[i + 1] - t) if i < len(times) - 1 else last
        for k, o in zip(keys, octs):
            note(k, up(n, o), t, d, vel=0.9, g=g, att=0.02, rel=0.2)


def sc_erupt():
    """Silence, then the full orchestra ON CUES.erupt; the theme in minor in the brass; the crown burning."""
    t, e = C['erupt'], C['eruptEnd']
    tutti(t, e - t + 0.4, 0.0)
    dd = (e - t) / 5
    brass_line(TH_MIN, [t + dd * (i + 0.6) for i in range(5)], 0.9, g=-3)
    a, b = s0('burning'), s1('burning')
    seg = (b - e) / 3
    for i, (bass, ch) in enumerate([('Bb1', ['Bb2', 'D3', 'F3']), ('G1', ['G2', 'Bb2', 'D3']), ('A1', ['A2', 'C#3', 'E3'])]):
        tt = e + i * seg
        g = -4 - 2.5 * i
        note('cb_sus', bass, tt, seg, vel=0.8, g=g, att=0.03, rel=0.3)
        note('tu_sus', up(bass, 12), tt, seg, vel=0.8, g=g - 3, att=0.03, rel=0.3)
        chord('tb_sus', ch, tt, seg, vel=0.8, g=g - 4, att=0.03, rel=0.3)
        chord('hn_sus', [up(c, 12) for c in ch], tt, seg, vel=0.8, g=g - 5, att=0.03, rel=0.3)
        chord('vn_trem', [up(c, 24) for c in ch], tt, seg, vel=0.8, g=g - 7, att=0.03, rel=0.3)
        timp(bass if M(bass) >= 31 else up(bass, 12), tt, g - 3)


def sc_carry():
    """s19: gold again. Low warm strings; the theme, hesitant, on a clarinet; the last note as it sets her down."""
    a, b = s0('carry'), s1('carry')
    L, S_ = C['lift'], C['setDown']
    chord('vc_sus', ['D2', 'A2'], a, L - a + 0.3, vel=0.4, g=-13, att=0.5, rel=0.5)
    chord('va_sus', ['F3', 'A3'], a, L - a + 0.3, vel=0.4, g=-15, att=0.5, rel=0.5)
    chord('vc_sus', ['Bb1', 'F2'], L + 0.2, S_ - L, vel=0.4, g=-12, att=0.4, rel=0.5)
    chord('va_sus', ['D3', 'F3', 'Bb3'], L + 0.2, S_ - L, vel=0.4, g=-15, att=0.4, rel=0.5)
    chord('vc_sus', ['D2', 'A2'], S_, b - S_, vel=0.4, g=-12, att=0.3, rel=0.2)
    chord('va_sus', ['F#3', 'A3'], S_, b - S_, vel=0.4, g=-15, att=0.3, rel=0.2)
    dd = (S_ - L) / 4
    for i, n in enumerate(TH):
        t = L + i * dd
        note('cl', n, t, dd * (1.0 if i < 4 else 1.6), vel=0.45, g=-10, att=0.06, rel=0.3)
        if i in (0, 4):
            note('harp', n, t, 1.4, vel=0.5, g=-9)


def sc_ship():
    """s20: the ironclad. Low brass in rising half steps, a timpani roll into the cut."""
    a, b = s0('ship'), s1('ship')
    perc('gong_mf', C['shipRise'], -8, 0.6, lpf=2500)
    seq = [('D1', 'D2'), ('Eb1', 'Eb2'), ('F#1', 'F#2')]
    dd = (b - a) / len(seq)
    for i, (lo, hi) in enumerate(seq):
        t = a + i * dd
        g = -9 + 3 * i
        note('cb_sus', lo, t, dd, vel=0.8, g=g, att=0.08, rel=0.15)
        note('tu_sus', hi, t, dd, vel=0.8, g=g - 2, att=0.08, rel=0.15)
        chord('tb_sus', [hi, up(hi, 6)], t, dd, vel=0.8, g=g - 4, att=0.08, rel=0.15)
        note('hn_sus', up(hi, 13), t, dd, vel=0.7, g=g - 6, att=0.1, rel=0.15)
        timp('D2', t, g - 2)
    y = X.S('timp_roll', hz(M('D2')) / 181.0)
    d = min(b - a - dd * 1.5, len(y) / SR - 0.1)
    y = fade(y[:secs(d)] * env_points(secs(d), [(0, 0.1), (d, 1)])[:, None], 0.1, 0.03)
    add(B['mus'], y, b - d, db(-9))


def sc_skiff():
    """s21: help is coming. Light, quick, in the major: violins and flute over pizzicato, a trumpet call on the theme's rise."""
    a, b = s0('skiff'), s1('skiff')
    step = 0.15
    pat = ['D5', 'A4', 'D5', 'F#5', 'E5', 'A4', 'E5', 'G5', 'F#5', 'D5', 'F#5', 'A5', 'G5', 'E5', 'G5', 'B5']
    k = 0
    t = a
    while t < b - 0.05:
        u = (t - a) / (b - a)
        note('vn_spic', pat[k % len(pat)], t, 0.12, vel=0.6, g=-11 + 4 * u, rr=k)
        if k % 2 == 0:
            note('va_spic', up(pat[k % len(pat)], -12), t, 0.12, vel=0.6, g=-13 + 4 * u, rr=k)
        if k % 4 == 0:
            note('vc_pizz', ['D2', 'D2', 'G2', 'A2'][(k // 4) % 4], t, 0.5, vel=0.7, g=-8)
        t += step
        k += 1
    w = b - a
    for i, n in enumerate(['A4', 'D5', 'F#5']):
        t = a + w * 0.3 + i * 0.3
        note('tp_sus', n, t, 0.3 if i < 2 else 0.9, vel=0.7, g=-11, att=0.02, rel=0.25)
        note('fl', up(n, 12), t, 0.3 if i < 2 else 0.9, vel=0.6, g=-12, att=0.02, rel=0.25)
    swell('sus_cresc', b, 1.2, -14)


def sc_war():
    """s22 + s23: the broadside (timpani with every impact in SHELLS), then the theme, broken and heroic, as its ray answers."""
    a, b = s0('broadside'), s1('broadside')
    stab(C['broadside'], -3)
    for n, g in (('D2', -8), ('A2', -9)):
        note('vc_trem', n, a, b - a, vel=0.8, g=g, att=0.3, rel=0.1, shape=[(0, 0.4), (b - a, 1)])
    chord('vn_trem', ['D5', 'F5', 'Bb5'], a + 0.4, b - a - 0.4, vel=0.7, g=-12, att=0.5, rel=0.1, shape=[(0, 0.3), (b - a - 0.4, 1)])
    for i, s in enumerate(SHELLS):
        if a <= s['t1'] < s1('duel'):
            timp('D2' if i % 2 else 'A1', s['t1'], -5)
    # ray 2: silence in the music while it sings; the theme's rise on hullBurn; broken off by the ship's answer
    h = C['hullBurn']
    ans = [s['t1'] for s in SHELLS if h < s['t1'] < s1('duel')]
    cut = min(ans) if ans else s1('duel')
    dd = min(0.32, (cut - h) / 3.4)
    brass_line(['A4', 'D5', 'F#5'], [h, h + dd, h + 2 * dd], max(0.15, cut - h - 2 * dd), g=-3, keys=('tp_sus', 'hn_sus', 'tb_sus'),
               octs=(0, -12, -24))
    chord('vc_sus', ['D2', 'A2'], h, cut - h, vel=0.9, g=-6, att=0.02, rel=0.1)
    chord('vn_sus', ['A4', 'D5', 'F#5'], h, cut - h, vel=0.8, g=-9, att=0.05, rel=0.1)
    timp('D2', h, -3)
    perc('crash_ff', h, -12)
    if ans:
        e = s1('duel')
        chord('tb_sus', ['Bb1', 'F2', 'Bb2'], cut, e - cut, vel=0.9, g=-5, att=0.01, rel=0.3)
        chord('hn_sus', ['Db3', 'F3'], cut, e - cut, vel=0.9, g=-7, att=0.01, rel=0.3)
        note('cb_sus', 'Bb0', cut, e - cut, vel=0.9, g=-4, att=0.01, rel=0.3)


def sc_wake():
    """s24: grief. A sighing line over D minor, an oboe with the theme in minor."""
    a, b = s0('wake'), s1('wake')
    chord('vc_sus', ['D2', 'A2'], a, b - a, vel=0.5, g=-11, att=0.3, rel=0.3)
    chord('va_sus', ['F3', 'A3'], a, b - a, vel=0.5, g=-13, att=0.3, rel=0.3)
    w = C['wake']
    dd = (b - w) / 4.6
    for i, n in enumerate(TH_MIN[:4]):
        note('ob', n, w + i * dd, dd * (1 if i < 3 else 1.6), vel=0.5, g=-10, att=0.05, rel=0.25)
    note('vn_sus', 'F5', a, (b - a) * 0.5, vel=0.4, g=-14, att=0.4, rel=0.3)
    note('vn_sus', 'E5', a + (b - a) * 0.5, (b - a) * 0.5, vel=0.4, g=-14, att=0.2, rel=0.3)


def sc_rescue():
    """s25 .. s27: the ostinato returns and climbs (D, G, A | Bb, C from the push) into the peak ON CUES.catch:
    D major, full orchestra, the theme whole for the only time."""
    a, p, c = s0('approach'), C['push'], C['catch']
    n1 = max(1, int(round((p - a) / 1.6)))
    ostinato(a, p, (['D2', 'G2', 'A2', 'D2', 'G2', 'A2'])[:max(3, n1)], -12, -6, step=(p - a) / (8 * n1), violins_from=0.3)
    half = (c - p) / 2
    ostinato(p, c, ['Bb2', 'C3'], -6, -2, step=half / 8, violins_from=0.0)
    hg = C['hang']
    brass_line(['A4', 'D5', 'F#5'], [hg, hg + 0.3, hg + 0.6], 0.9, g=-8)
    for i, (bass, ch) in enumerate([('Bb1', ['Bb2', 'D3', 'F3']), ('C2', ['C3', 'E3', 'G3'])]):
        t = p + i * half
        note('cb_sus', bass, t, half, vel=0.9, g=-5, att=0.02, rel=0.1)
        note('tu_sus', up(bass, 12), t, half, vel=0.9, g=-7, att=0.02, rel=0.1)
        chord('tb_sus', ch, t, half, vel=0.9, g=-8, att=0.02, rel=0.1)
        chord('hn_sus', [up(x_, 12) for x_ in ch], t, half, vel=0.9, g=-8, att=0.02, rel=0.1)
        chord('vn_sus', [up(x_, 24) for x_ in ch], t, half, vel=0.9, g=-9, att=0.05, rel=0.1)
        timp(bass if M(bass) >= 31 else up(bass, 12), t, -5)
    brass_line(['A4', 'B4', 'C#5'][:3], [c - 3 * half / 4, c - 2 * half / 4, c - half / 4], half / 4, g=-7, keys=('tp_sus',), octs=(0,))
    swell('sus_cresc', c, 1.6, -9)
    swell('bd2_cresc', c, 1.2, -8)
    # THE CATCH
    e = C['lastSalvo']
    tutti(c, e - c - 0.1, 1.0, minor=False)
    dd = min(0.36, (e - c) / 6.5)
    times = [c + i * dd for i in range(5)] + [c + 5 * dd]
    line = TH + ['A5']
    for i, (n, t) in enumerate(zip(line, times)):
        d = dd if i < 5 else max(0.3, e - t - 0.15)
        note('tp_sus', n, t, d, vel=0.95, g=-3, att=0.01, rel=0.2)
        note('vn_sus', up(n, 12), t, d, vel=0.95, g=-4, att=0.02, rel=0.2)
        note('hn_sus', up(n, -12), t, d, vel=0.95, g=-5, att=0.02, rel=0.2)
        note('fl', up(n, 12), t, d, vel=0.9, g=-8, att=0.02, rel=0.2)


def sc_fall():
    """s28: the last salvo. The major turns minor, a line falls step by step; at irisOut only violas and a cello are left."""
    a, o, b = C['lastSalvo'], C['irisOut'], s1('fall')
    chord('tb_sus', ['D2', 'A2', 'D3'], a, 0.9, vel=0.9, g=-6, rel=0.5)
    chord('hn_sus', ['F3', 'A3'], a, 0.9, vel=0.9, g=-7, rel=0.5)
    note('cb_sus', 'D1', a, o - a, vel=0.8, g=-6, rel=0.3, shape=[(0, 1), (o - a, 0.4)])
    for s in SHELLS:
        if a - 0.01 <= s['t1'] < o:
            timp('D2', s['t1'], -4)
    line = ['F5', 'E5', 'D5', 'C5', 'Bb4', 'A4']
    dd = (o - a - 0.1) / len(line)
    for i, n in enumerate(line):
        g = -6 - 1.3 * i
        note('vn_sus', n, a + 0.1 + i * dd, dd * 1.05, vel=0.8 - 0.06 * i, g=g, att=0.04, rel=0.2)
        note('va_sus', up(n, -12), a + 0.1 + i * dd, dd * 1.05, vel=0.8 - 0.06 * i, g=g - 1, att=0.04, rel=0.2)
    chord('va_sus', ['D3', 'F3'], o, b - o + 0.2, vel=0.35, g=-13, att=0.25, rel=0.6)
    note('vc_sus', 'A3', o + 0.1, (b - o) * 0.5, vel=0.4, g=-11, att=0.2, rel=0.3)
    note('vc_sus', 'G3', o + 0.1 + (b - o) * 0.5, (b - o) * 0.5, vel=0.35, g=-12, att=0.15, rel=0.5)


def sc_resolve():
    """s29 + s30: a quiet resolve (G, D/F#, A; the theme slow on a clarinet), D major fading; at CUES.threadBack the glass
    tone from frame 0, alone."""
    a, b = s0('away'), s1('away')
    seg = (b - a) / 3
    for i, (vc, va) in enumerate([(['G2', 'D3'], ['B3', 'D4']), (['F#2', 'D3'], ['A3', 'D4']), (['A2', 'E3'], ['A3', 'C#4'])]):
        chord('vc_sus', vc, a + i * seg, seg, vel=0.4, g=-12, att=0.35, rel=0.5)
        chord('va_sus', va, a + i * seg, seg, vel=0.4, g=-14, att=0.35, rel=0.5)
    dd = (b - a - 0.4) / 4
    for i, n in enumerate(TH):
        t = a + 0.4 + i * dd if i < 4 else b
        note('cl', n, t, dd if i < 4 else 1.4, vel=0.45, g=-10, att=0.08, rel=0.4)
        note('harp', n, t, 1.5, vel=0.5, g=-10)
    tb = C['threadBack']
    d = max(0.3, tb - b - 0.35)
    sh = [(0, 1), (d * 0.5, 0.7), (d, 0.0), (d + 2, 0)]
    chord('vc_sus', ['D2', 'A2'], b, d, vel=0.4, g=-12, att=0.3, rel=0.2, shape=sh)
    chord('va_sus', ['F#3', 'A3', 'D4'], b, d, vel=0.4, g=-14, att=0.3, rel=0.2, shape=sh)
    note('harp', 'D2', b, 2.0, vel=0.5, g=-9)
    glass_tone(tb, DUR - tb, 0.0)


# ------------------------------------------------------------------------------------------------ SFX
def fx_beds():
    # wind: the night outside, the salt flats at the end
    w = X.wind(DUR, 501)
    lv = shot_env({'thread': 0.45, 'burst': 0.25, 'alarm': 0.3, 'stairs': 0.35, 'climb': 0.45, 'roof': 0.5, 'kneel': 0.3,
                   'wonder': 0.25, 'shell': 0.35, 'down': 0.3, 'sweep': 0.4, 'carry': 0.25, 'ship': 0.4, 'skiff': 0.8,
                   'approach': 0.8, 'reach': 0.4, 'catch': 0.7, 'fall': 0.35, 'away': 1.0, 'ember': 0.75, 'wake': 0.25,
                   'burning': 0.3, 'broadside': 0.35, 'duel': 0.35})
    put(w * lv[:, None], 0, -21, 'wind (night / salt flats)', 'bed', send={})
    # the vault: a dark room tone with drips of grit
    rt = X.room_tone(DUR, 502) * shot_env({'iris': 1, 'fingers': 1, 'guards': 1, 'rise': 1, 'volley': 1, 'firstRay': 1, 'shaft': 0.8})[:, None]
    put(rt, 0, -30, 'vault room tone', 'bed', send={})
    # the gold thread's shimmer, level straight from layout.threadOn
    sh = F.shimmer(N, 503) * (clock('threadOn') * shot_env({'thread': 0.7, 'seed': 1.0, 'stairs': 0.6, 'roof': 0.3, 'kneel': 0.7,
                                                           'wonder': 0.6, 'carry': 0.3, 'wake': 0.3, 'reach': 0.3, 'fall': 0.5,
                                                           'ember': 1.0, 'shell': 0.3}))[:, None]
    put(sh, 0, -25, "the thread's shimmer (threadOn)", 'bed', send={'hall': 0.5})
    # the iris: gold hum / white-hot whine, from layout.irisHeat
    ih = F.iris_hum(N, clock('irisHeat'), 504) * shot_env(
        {'iris': 0.8, 'fingers': 0.3, 'rise': 0.5, 'volley': 0.5, 'firstRay': 0.8, 'shaft': 0.4, 'roof': 0.5, 'kneel': 1.0,
         'wonder': 0.8, 'down': 1.0, 'sweep': 0.3, 'carry': 0.7, 'broadside': 0.6, 'duel': 0.8, 'wake': 0.7, 'reach': 0.6,
         'fall': 1.0, 'thread': 0, 'seed': 0, 'guards': 0.15, 'burst': 0.3, 'alarm': 0, 'stairs': 0, 'ship': 0, 'skiff': 0,
         'approach': 0.1, 'away': 0, 'ember': 0, 'burning': 0, 'catch': 0.3}, 0.25)[:, None]
    put(ih, 0, -27, 'iris hum (irisHeat)', 'bed', send={})


def fx_vault():
    t = C['irisOpen']
    put(F.iris_open(1), t, -9, 'iris opens (ceramic shutter)', cue='irisOpen')
    t = C['twitch']
    put(F.scrape(0.5, 3), t, -13, 'one finger scrapes stone', p=-0.2, cue='twitch')
    put(F.scrape(0.9, 31), t + 0.65, -11, 'all fingers curl and grip', p=-0.1)
    for k in range(3):
        put(F.ceramic(520 + 90 * k, 0.07, 40 + k), t + 0.7 + 0.07 * k, -17, 'knuckles', p=0.1 * k)
    put(X.grains(1.0, lambda u: 40 * math.exp(-u / 0.4) + 4, 44, 800, 5000, (0.003, 0.01), (5, 15)), t + 0.8, -22, 'moss dust and gravel')
    put(F.chain(0.9, 4), t + 0.95, -13, 'chain slides off the wrist', p=0.3)
    # the guards
    a = s0('guards')
    for k, dt in enumerate([0.25, 0.6, 0.95]):
        put(X.footstep_far(50 + k, 1.0)[:secs(0.5)], a + dt, -22, 'guards step back', p=0.3)
    put(F.lamp_drop(5), C['lampDrop'], -10, 'lamp dropped, rolls', p=0.2, cue='lampDrop')
    # it rises
    t = C['standUp']
    put(F.body_rise(C['armDrop'] - t - 0.3, 6), t, -9, 'the ceramic body rises, rubble pours', cue='standUp')
    put(F.tear(0.45, 8), C['armDrop'] - 0.45, -13, 'shoulder staples tear', p=-0.3)
    put(F.arm_crash(7), C['armDrop'], -4, 'the arm crashes down', 'hit', p=-0.2, cue='armDrop')
    # the volley: three kneeling guards, ragged, twice
    v = C['volley']
    r = rng(60)
    shots = [0.0, 0.085, 0.21, 0.74, 0.86, 1.05]
    for k, dt in enumerate(shots):
        put(F.rifle(61 + k), v + dt, -6 - (k > 2), 'rifle volley (ragged)', 'hit', p=[-0.5, 0.1, 0.5][k % 3], cue='volley' if k == 0 else None)
        put(F.ricochet(70 + k), v + dt + r.uniform(0.02, 0.035), -12, 'ricochet off porcelain', p=r.uniform(-0.3, 0.3))
    # the first ray
    t = C['ray1']
    put(F.ray_tone(0.45, 11), t, -9, 'THE RAY (singing glass tone)', p=0.0, cue='ray1')
    put(F.sizzle(C['doorBurst'] - t - 0.35, 12), t + 0.35, -15, 'the line glows and sags')
    put(F.door_burst(13), C['doorBurst'], -4, 'molten door bursts', 'hit', p=0.2, cue='doorBurst')
    # the shaft
    a = s0('shaft')
    for k, dt in enumerate(np.arange(0.1, C['fansOpen'] - a - 0.05, 0.42)):
        put(F.landing(80 + k, 0.5), a + dt, -14, 'heavy porcelain steps', p=0)
    put(F.fans_open(14), C['fansOpen'], -8, 'copper fans snap open', cue='fansOpen')
    put(F.ceramic(170, 0.3, 85), C['leap'] - 0.4, -18, 'crouch creak')
    put(F.leap(16, min(1.5, s1('shaft') - C['leap'] + 0.2)), C['leap'], -6, 'the leap, rush up the shaft', 'hit', cue='leap')


def fx_court():
    t = C['burst']
    put(F.cap_burst(17), t, -3, 'the well cap bursts', 'hit', p=-0.1, cue='burst')
    put(F.landing(18, 1.0), t + min(0.85, (s1('burst') - t) * 0.6), -6, 'heavy landing (knee and hand)', 'hit', p=0.1)
    # hand-cranked siren: rises on CUES.alarm, wails low in the background until the eruption drowns it
    a, e = C['alarm'], C['erupt']
    rel = TT - a
    f = 140 + 400 * (1 - np.exp(-np.clip(rel, 0, None) / 1.0)) + 38 * np.sin(2 * np.pi * 0.21 * rel) * np.clip(rel / 3, 0, 1)
    f *= np.exp(-np.clip(TT - e, 0, None) / 0.9)
    lv = shot_env({'alarm': 1.0, 'stairs': 0.5, 'climb': 0.38, 'roof': 0.26, 'kneel': 0.1, 'wonder': 0.09, 'shell': 0.2, 'down': 0.2,
                   'sweep': 0.22}, 0.0, 0.08) * after(a, 0.05) * before(e + 1.2, 1.2)
    i0, i1 = secs(a), min(N, secs(e + 1.3))
    sr_ = F.siren(f[i0:i1], 19) * lv[i0:i1]
    put(pan(sr_, -0.35), a, -12, 'hand-cranked siren (rises, then low until the eruption)', send={'out': 0.5})
    put(F.metal([480, 790, 1240, 1900], 0.08, 190), a, -14, 'siren crank engages', p=-0.35, cue='alarm')
    # searchlights snap on along the wall (stagger mirrors src/land-weir.js: alarm + 0.1 + i * 0.13)
    for i in range(6):
        put(F.clunk(20 + i), a + 0.1 + i * 0.13, -11 - 0.5 * i, 'searchlight clunk', p=-0.6 + 0.24 * i)
    # the climb: hand over hand, stone crumbling, rifle sparks on its back
    a, b = s0('climb'), s1('climb')
    r = rng(210)
    for k, t in enumerate(np.arange(a + 0.2, b - 0.25, 0.62)):
        put(F.climb_hit(211 + k, 1.0), t, -8, 'climbing impact, crumbling stone', 'hit', p=[-0.2, 0.25][k % 2])
    for k in range(5):
        t = a + 0.35 + (b - a - 0.7) * (k + r.uniform(0, 0.6)) / 5
        put(lp(F.rifle(230 + k), 2500), t, -17, 'rifles from the rampart', p=r.uniform(-0.8, 0.8))
        put(F.ricochet(240 + k), t + 0.09, -16, 'spark on its back', p=r.uniform(-0.3, 0.3))
    for k, t in enumerate(np.arange(s0('stairs') + 0.15, s1('stairs') - 0.1, 0.19)):
        put(lp(F.ceramic(240 + 20 * (k % 3), 0.04, 250 + k), 1400), t, -27, 'bare paws running up the stair', p=-0.1)
    # the roof
    put(F.climb_hit(26, 1.3), C['gripParapet'], -5, 'the hand on the parapet', 'hit', p=0.15, cue='gripParapet')
    put(lp(F.ceramic(150, 0.4, 27), 1500), C['headRise'], -15, 'head rises (plate creak)', cue='headRise')
    a = s0('kneel')
    put(F.climb_hit(28, 0.8), a + 0.2, -11, 'steps over the parapet', p=0.1)
    put(F.kneel_thud(22), a + 1.35, -5, 'the kneel (roof shakes)', 'hit', cue='kneel')
    for k in range(4):
        put(lp(F.ceramic(190 + 30 * k, 0.2, 290 + k), 1500), a + 1.0 + (C['handChest'] - a - 1.2) * k / 4, -22, 'head lowers (plate creaks)')
    put(F.touch(23), C['handChest'], -14, 'soft ceramic touch on the chest plate', cue='handChest', send={'out': 0.1})
    put(F.warm_tone(min(3.6, C['shell1'] - C['chestLit']), 24), C['chestLit'], -13, 'the crest lights (warm tone)', cue='chestLit',
        send={'hall': 0.6})


def fx_shells():
    """Every shell in layout.SHELLS: report at t0, whistle t0 -> t1, burst at t1. Nothing about the table is hard-coded."""
    first = min(SHELLS, key=lambda s: s['t1']) if SHELLS else None
    last = max(SHELLS, key=lambda s: s['t1']) if SHELLS else None
    for i, s in enumerate(SHELLS):
        far = str(s.get('from', '')).startswith('ship')
        on_l = s.get('hit') == 'lantern'
        x = (s.get('to') or [0, 0, 0])[0]
        p = float(np.clip(x / 12, -0.5, 0.5))
        late = s['t1'] > C['push'] and s['t1'] < C['catch']        # under the build to the catch: keep them behind the music
        pk_r = -9 if far else -5
        pk_b = (-3.5 if on_l else -6.5) - (2.0 if late else 0)
        big = 1.0
        if s is first:
            pk_b, big = -1.0, 1.3                                   # shell 1: the biggest so far, ends the idyll
        if s is last:
            pk_b, big = -1.5, 1.3
        put(F.cannon(300 + i, far), s['t0'], pk_r, f"cannon report ({s['id']})", 'hit', p=0.5 if far else 0.6, cue='R_' + s['id'])
        d = s['t1'] - s['t0']
        if d > 0.08:
            put(F.whistle(d, 320 + i, 2100 + 60 * (i % 5)), s['t0'], -15, f"shell whistle ({s['id']})", p=p + 0.3)
        put(F.shell_burst(340 + i, 'lantern' if on_l else 'tower', big), s['t1'], pk_b, f"shell burst ({s['id']})", 'hit', p=p,
            cue='B_' + s['id'])


def fx_sweep_erupt():
    # s16: the Lantern lying broken; then the iris snaps back on
    a = s0('down')
    put(F.sizzle(C['irisBack'] - a, 400), a, -22, 'smoulder, settling plates')
    for k, dt in enumerate([0.5, 1.0]):
        put(lp(F.ceramic(260 + 60 * k, 0.15, 401 + k), 2000), a + dt, -21, 'cracked plates tick')
    put(F.iris_open(402), C['irisBack'], -8, 'the iris snaps back on (white-hot)', cue='irisBack')
    # THE SWEEP: the ray's tone follows layout.sweepU (pan and pitch); then the held breath; then the running eruption
    ts = ramp_times('sweepU', np.array([0.0, 1.0]))
    d = float(ts[1] - ts[0])
    y = F.ray_tone(d, 410, 2637.0, rise=0.12)
    u = np.clip(np.arange(len(y)) / SR / d, 0, 1)
    put(F.panmove(y, -0.75 + 1.5 * u), ts[0], -7, 'THE RAY sweeps the wall (follows sweepU)', cue='sweep', send={'out': 0.35})
    K = 10
    te = ramp_times('eruptU', np.arange(K) / K)
    for k, t in enumerate(te):
        put(F.erupt_blast(420 + k, 1.0 + 0.04 * k), t, -3.0 + 2.0 * k / (K - 1), f'eruption blast {k + 1}/{K} (follows eruptU)', 'hit',
            p=-0.7 + 1.4 * k / (K - 1), cue='erupt' if k == 0 else None)
    # the fire: from the eruption to the end
    fu = clock('eruptU')
    lv = shot_env({'sweep': 1.0, 'burning': 1.0, 'carry': 0.5, 'ship': 0.45, 'skiff': 0.35, 'broadside': 0.5, 'duel': 0.5, 'wake': 0.4,
                   'approach': 0.35, 'reach': 0.42, 'catch': 0.42, 'fall': 0.45, 'away': 0.13, 'ember': 0.2}, 0.0, 0.06)
    fb = F.fire_bed(N - secs(C['erupt']), 430)
    i0 = secs(C['erupt'])
    put(fb * (lv[i0:] * (0.25 + 0.75 * fu[i0:]))[:, None], C['erupt'], -10, 'fire roar bed (to the end)', 'bed', send={'out': 0.1})
    # s18: a gun tower leans and topples, debris into the reservoir
    a = s0('burning')
    put(X.metal_groan(1.2, 440, 0.7), a + 0.1, -13, 'gun tower leans', p=0.4)
    put(X.collapse(441), a + min(1.0, (s1('burning') - a) * 0.4), -7, 'gun tower topples', 'hit', p=0.4)
    put(X.water(1.6, 442), a + min(1.9, (s1('burning') - a) * 0.75), -18, 'debris into the reservoir', p=-0.4)
    # s19: carrying her
    put(F.scrape(0.5, 450), C['lift'] - 0.5, -21, 'hand slides under her')
    put(lp(F.ceramic(200, 0.3, 451), 1500), C['lift'], -18, 'lift (plate creak)', cue='lift')
    put(F.touch(452), C['setDown'], -18, 'sets her down on the dais', cue='setDown')


def fx_ship_skiff():
    # the ironclad: engine drone and rotor throb from CUES.shipRise, level from layout.shipPos, sagging with shipList
    r0 = C['shipRise']
    i0 = secs(r0)
    y = clock('shipY')
    k = (y - y.min()) / max(1e-6, y.max() - y.min())
    k = np.clip(k / max(1e-6, k[i0:].max()), 0, 1)
    sl = clock('shipList')
    sag = sl / max(1e-6, sl.max())
    lv = shot_env({'ship': 1.0, 'skiff': 0.3, 'broadside': 0.9, 'duel': 0.8, 'wake': 0.3, 'approach': 0.42, 'reach': 0.36, 'catch': 0.36,
                   'fall': 0.5, 'away': 0.16, 'ember': 0.05, 'carry': 0.0}, 0.0, 0.06) * after(r0, 0.12) * (0.3 + 0.7 * k)
    eng = F.ship_engine(N - i0, 30, sag[i0:]) * lv[i0:, None]
    put(eng, r0, -8, 'ironclad engine drone + rotor throb (from shipRise)', 'bed', cue='shipRise', send={'out': 0.12})
    put(X.metal_groan(2.0, 460, 0.6), r0 + 1.3, -15, 'turrets turning', p=0.4)
    for k_ in range(2):
        put(F.clunk(462 + k_), r0 + 0.5 + 0.35 * k_, -16, 'belly searchlights', p=0.3)
    # the skiff: propeller buzz and wind of speed
    for j, (nm, g, p0, p1, f0, f1) in enumerate([('skiff', -11, -0.6, 0.3, 88, 104), ('approach', -12, 0.6, -0.2, 100, 92),
                                                 ('catch', -10, -0.8, 0.8, 106, 84), ('away', -15, 0.1, 0.25, 94, 94)]):
        if nm not in SHN:
            continue
        a, b = s0(nm), s1(nm)
        n = secs(b - a)
        u = np.arange(n) / n
        if nm == 'catch':        # the pass: doppler and pan centred on CUES.catch
            x = (np.arange(n) / SR - (C['catch'] - a)) / 0.35
            sg = 0.5 + 0.5 * np.tanh(x)
            fenv, pe = f0 + (f1 - f0) * sg, p0 + (p1 - p0) * sg
            amp = 0.45 + 0.55 * np.exp(-x ** 2 / 2)
        else:
            fenv, pe = f0 + (f1 - f0) * u, p0 + (p1 - p0) * u
            amp = 0.5 + 0.5 * u if nm == 'skiff' else np.ones(n)
        bz = fade(F.prop_buzz(n, 470 + j, fenv) * amp, 0.02, 0.02)
        put(F.panmove(bz, pe), a, g, f'skiff propeller buzz ({nm})', send={'out': 0.1})
        w = fade(F.whoosh(b - a, 480 + j, 500, 2600, 0.5, 2.0) * amp[:, None], 0.02, 0.02)
        put(w, a, g - 3, f'wind of speed ({nm})', send={})
    # ray 2 and the hull
    r2, hb = C['ray2'], C['hullBurn']
    put(F.ray_tone(hb - r2, 490, 2637.0, rise=0.08), r2, -7, 'THE RAY cuts the hull', p=0.25, cue='ray2', send={'out': 0.35})
    put(F.hull_fire(32), hb, -3, 'hull fire blooms, the ship lists', 'hit', p=0.4, cue='hullBurn')
    # the girl, the boy
    n = secs(0.5)
    rus = bp(F.nz2(n, 495), 700, 4500) * (np.abs(smooth_noise(n, 15, 496)) * env_points(n, [(0, 0), (0.03, 1), (0.5, 0)]))[:, None]
    put(rus, C['wake'], -22, 'she stirs (cloth)', cue='wake')
    put(F.whoosh(0.35, 497, 400, 3000, 0.3, 0.3), C['hang'] - 0.1, -17, 'the boy drops over the side')
    put(F.metal([520, 870, 1390, 2100], 0.15, 498), C['hang'], -15, 'knees lock on the hook bar', p=0.2, cue='hang')
    put(lp(F.body_rise(0.9, 499), 2500)[:secs(1.8)], C['push'], -12, 'the glowing hand lifts her (plate creaks)', cue='push')
    put(F.grab(33), C['catch'], -5, 'THE CATCH (cloth / hand grab)', 'hit', cue='catch', send={})
    # the fall
    ls, io = C['lastSalvo'], C['irisOut']
    put(F.lantern_collapse(max(0.5, io - ls), 34), ls, -5, 'the Lantern comes apart and sinks', 'hit')
    put(F.iris_close(2), io, -10, 'the iris goes out', cue='irisOut', send={'hall': 0.5})


# ------------------------------------------------------------------------------------------------ mix + master
def kweight(x):
    b1, a1 = [1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585]
    b2, a2 = [1, -2, 1], [1, -1.99004745483398, 0.99007225036621]
    return signal.lfilter(b2, a2, signal.lfilter(b1, a1, x, axis=0), axis=0)


def lufs(x):
    k = kweight(x)
    blk, hop = secs(0.4), secs(0.1)
    ms = np.array([np.mean(k[i:i + blk] ** 2, 0).sum() for i in range(0, len(k) - blk, hop)])
    l = -0.691 + 10 * np.log10(ms + 1e-12)
    g = ms[l > -70]
    rel = -0.691 + 10 * np.log10(g.mean()) - 10
    return -0.691 + 10 * np.log10(ms[(l > -70) & (l > rel)].mean())


def true_peak(x):
    return np.abs(signal.resample_poly(x, 4, 1, axis=0)).max()


def softclip(x, knee):
    a = np.abs(x)
    over = a > knee
    y = x.copy()
    h = 1.0 - knee
    y[over] = np.sign(x[over]) * (knee + h * np.tanh((a[over] - knee) / h))
    return y


def limiter(x, ceiling_db=-2.0):
    c = db(ceiling_db)
    up_ = np.abs(signal.resample_poly(x, 4, 1, axis=0)).max(1)
    pk = up_.reshape(-1, 4).max(1)[:len(x)]
    req = np.minimum(1.0, c / (pk + 1e-12))
    la = secs(0.004)
    g = minimum_filter1d(req, 2 * la + 1)
    h = 48
    m = len(g) // h
    gc = g[:m * h].reshape(m, h).min(1)
    a = math.exp(-1 / (0.12 * 1000))
    out = np.empty(m)
    prev = 1.0
    for i in range(m):
        v = gc[i]
        prev = v if v < prev else prev * a + v * (1 - a)
        out[i] = prev
    gs = np.interp(np.arange(len(x)), np.arange(m) * h + h / 2, out)
    gs = np.minimum(gs, g)
    gs = uniform_filter1d(minimum_filter1d(gs, la + 1), la)
    return x * gs[:, None], 20 * np.log10(gs.min())


def gates():
    """Music gate (brutal cut at shell1Hit; out for the ray's own voice) and master gate (the held breath; the end)."""
    mg = np.ones(N)
    h = C['shell1Hit']
    mg *= 1 - after(h - 0.004, 0.004) * before(s0('down') + 0.2, 0.05)          # dead from the hit until s16
    mg *= 1 - 0.97 * after(C['sweep'] - 0.03, 0.03) * before(C['erupt'], 0.004)  # nothing but the ray, then the breath
    mg *= 1 - 0.9 * after(C['ray2'] - 0.05, 0.05) * before(C['hullBurn'], 0.01)
    io = C['irisOut']
    mg *= 1 - 0.75 * after(io - 0.03, 0.03) * before(io + 0.12, 0.1)             # a catch of breath as the iris dies
    master = np.ones(N)
    se, er = C['sweepEnd'], C['erupt']
    hold = after(se + 0.03, 0.1) * before(er - 0.003, 0.006)                     # the 0.4 s held breath: near silence
    master *= 1 - (1 - db(-42)) * hold
    fo = 0.35                                                                    # the picture's cut to black
    master *= np.clip((DUR - TT) / fo, 0, 1) ** 2
    return mg, master


def mixdown():
    log('reverbs')
    hall = convolve(B['rv_hall'], make_ir(3.4, 3.0, 1.5, 11, predelay=0.025)) * 0.30
    vault = convolve(B['rv_vault'], make_ir(2.8, 2.6, 1.3, 21, predelay=0.012)) * 0.5
    out = convolve(B['rv_out'], make_ir(2.2, 1.8, 0.7, 31, predelay=0.09, early=False)) * 0.45
    mg, master = gates()
    hitenv = np.abs(B['hit']).max(1)
    hitenv = uniform_filter1d(np.maximum(hitenv, minimum_filter1d(hitenv, 1)), secs(0.12))
    duck = 1 / (1 + 2.2 * np.clip(hitenv, 0, 1))                                 # big hits push the music back up to ~10 dB
    ride = db(shot_env({'kneel': 3.5, 'wonder': 3.5, 'carry': 3.0, 'wake': 2.0, 'away': 3.5, 'ember': 1.0, 'guards': 2.0}, 0.0, 0.1))
    mus = (B['mus'] + hall) * (mg * duck * ride)[:, None] * db(MUS_DB)   # ride = the fader moves of a film mix (quiet scenes up)
    fx = (B['hit'] * db(HIT_DB) + B['sfx'] * db(SFX_DB) + B['bed'] * db(BED_DB) + vault + out)
    mus = hp(mus, 28)
    fx = hp(fx, 24)
    stems = {'mus': mus * master[:, None], 'fx': fx * master[:, None]}
    return (mus + fx) * master[:, None], stems, master


def finalize(mix, master, target=-16.0):
    log('loudness + limiter')
    y = mix.copy()
    for it in range(6):
        L = lufs(y)
        y = y * db(target - L)
        low = lp(lp(y, 140, 2), 140, 2)
        y = (y - low) + softclip(low, db(-7.0))
        y = softclip(y, db(-3.5))
        y, gr = limiter(y, -2.0)
        L2 = lufs(y)
        log(f'  iter {it}: {L:.2f} -> {L2:.2f} LUFS, max GR {gr:.1f} dB')
        if abs(L2 - target) < 0.08:
            break
    y[-1] = 0
    r = rng(4242)
    d = (r.random(y.shape) - r.random(y.shape)) / 32768 * np.minimum(1, master * 50)[:, None]
    y16 = np.clip(np.round((y + d) * 32767), -32768, 32767).astype(np.int16)[:N]
    assert len(y16) == N
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    sf.write(OUT, y16, SR, subtype='PCM_16')
    log('wrote', OUT, f'{len(y16) / SR:.4f} s', f'LUFS {lufs(y):.2f}', f'TP {20 * np.log10(true_peak(y)):.2f} dBTP')
    return y


def report(stems):
    """Per-shot level of the music and SFX groups (dB RMS, pre-master) — the balance at a glance."""
    rows = []
    for s in SHOTS:
        i, j = secs(s['start']), secs(s['end'])
        r = lambda x: 20 * math.log10(np.sqrt(np.mean(x[i:j] ** 2)) + 1e-9)
        rows.append((s['id'], s['name'], s['start'], round(r(stems['mus']), 1), round(r(stems['fx']), 1)))
    return rows


if __name__ == '__main__':
    for f in (sc_hook, sc_vault, sc_escape, sc_kneel, sc_down, sc_erupt, sc_carry, sc_ship, sc_skiff, sc_war, sc_wake, sc_rescue,
              sc_fall, sc_resolve):
        f()
    log('score done')
    for f in (fx_beds, fx_vault, fx_court, fx_shells, fx_sweep_erupt, fx_ship_skiff):
        f()
    log('sfx done')
    mix, stems, master = mixdown()
    rows = report(stems)
    for r in rows:
        print('   %-5s %-10s %6.2f  music %6.1f  fx %6.1f' % r)
    finalize(mix, master)
    json.dump({'events': sorted(EVENTS), 'balance': rows}, open(os.path.join(CACHE, 'events.json'), 'w'), indent=0)
    np.savez_compressed(os.path.join(CACHE, 'cues.npz'), **{k: v[1] for k, v in CUESTEM.items()})
    np.save(os.path.join(CACHE, 'fx_stem.npy'), stems['fx'].mean(1).astype(np.float32))   # SFX group alone, for analyse.py
    json.dump({k: v[0] for k, v in CUESTEM.items()}, open(os.path.join(CACHE, 'cue_times.json'), 'w'), indent=0)
    log('done')
