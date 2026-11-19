"""LAST LIGHT soundtrack: score + designed SFX + storm, mixed and mastered to out/soundtrack.wav.

Deterministic: same samples + same code -> same file.  Usage (from the project root):
    node audio/tools/dump_timeline.mjs && ~/.venvs/opus_audio/bin/python -I audio/render.py
(render.py runs the node dump itself when node is on PATH.)
Every time below derives from CUES / SHOTS / LIGHTNING / beamAz / beamOn / storm / swellHeight / boatPass in src/
(sampled by audio/tools/dump_timeline.mjs). Key: D minor storm, F/Bb major hope, D major home (first at CUES.pierBump).
Emotion map: audio/cuesheet.md.
"""
import os, sys, math, time, json, inspect, re, subprocess, site
sys.path.append(site.getusersitepackages())
import numpy as np
import soundfile as sf
from scipy import signal
from scipy.ndimage import minimum_filter1d, uniform_filter1d

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, 'lib'))
sys.path.insert(0, os.path.join(HERE, 'tools'))
from dsp import *  # noqa
import sfx as X  # noqa
import storm as W  # noqa
import notches as NOTCH  # noqa

PROJ = os.path.dirname(HERE)
OUT = os.path.join(PROJ, 'out', 'soundtrack.wav')
CACHE = os.path.join(HERE, 'cache')
T0 = time.time()


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
SH = {s['id']: s for s in TL['SHOTS']}
SHOTS = TL['SHOTS']
LIGHT = TL['LIGHTNING']
N = secs(DUR)
GEAR = NOTCH.compute(TL)
json.dump(GEAR, open(os.path.join(HERE, 'notches.json'), 'w'), indent=0)
log(f'timeline: {DUR} s ({N} samples), {len(SHOTS)} shots, {len(GEAR["teeth"])} gear teeth, {len(GEAR["panels"])} panel knocks')


def clock(name):
    """A layout.js clock resampled to audio rate."""
    t = np.array(TL['t'])
    return np.interp(np.arange(N) / SR, t, np.array(TL[name]))


STORM = clock('storm')
SWELL = clock('swellHeight')
BEAMON = clock('beamOn')


def s0(sid):
    return SH[sid]['start']


def s1(sid):
    return SH[sid]['end']


# ------------------------------------------------------------------------------------------------ buses
MUSIC = ['str', 'brass', 'wind', 'harp', 'perc']
FX = ['ext', 'sky', 'int', 'hit', 'gear', 'panel']
SENDS = ['hall', 'tower', 'room', 'lamp', 'out']
B = {k: np.zeros((N, 2)) for k in MUSIC + FX + ['hush'] + ['rv_' + s for s in SENDS]}
NOTES, EVENTS = [], []
_add = add


def add(bus, x, t, gain=1.0, send=None):  # noqa: F811
    """Mix into a bus at t; send = {'tower': 0.3, ...} also feeds that reverb. Logs non-note events for the cue sheet."""
    fr = inspect.currentframe().f_back
    if fr.f_code.co_name not in ('note', 'gliss'):
        while fr.f_code.co_name in ('put', 'perc', 'timp', 'timp_roll') and fr.f_back is not None:
            fr = fr.f_back
        line = (inspect.getframeinfo(fr).code_context or [''])[0]
        m = re.search(r"W\.(\w+)\(", line) or re.search(r"perc\('(\w+)'", line) or re.search(r"(timp\w*)\(", line) or re.search(r'(\w+)\(', line)
        y = x if x.ndim == 1 else np.abs(x).max(1)
        pk = np.abs(y).max() * gain + 1e-12
        idx = np.where(np.abs(y) * gain > pk * 0.1)[0]
        name = [k for k, v in B.items() if v is bus][0]
        if len(idx) and len(x) < secs(20):
            EVENTS.append([round(t + idx[0] / SR, 3), round(t + idx[-1] / SR, 3), name, m.group(1) if m else 'sound',
                           round(float(20 * np.log10(pk)), 1)])
    _add(bus, x, t, gain)
    for k, v in (send or {}).items():
        _add(B['rv_' + k], x, t, gain * v)


SEAT = {'vn_sus': -0.45, 'vn_trem': -0.45, 'vn_spic': -0.45, 'vn_pizz': -0.45, 'va_sus': 0.15, 'va_trem': 0.15, 'va_spic': 0.1,
        'va_pizz': 0.15, 'vc_sus': 0.4, 'vc_trem': 0.4, 'vc_spic': 0.35, 'vc_pizz': 0.4, 'cb_sus': 0.55, 'cb_trem': 0.55,
        'cb_spic': 0.5, 'cb_pizz': 0.55, 'hn_sus': -0.3, 'tb_sus': 0.3, 'tu_sus': 0.45, 'tp_sus': 0.05,
        'fl': -0.1, 'fl_nv': -0.1, 'ob': 0.1, 'cl': -0.15, 'bn': 0.2, 'harp': -0.6, 'glock': -0.25, 'glass': 0.0, 'vib_bow': 0.0}
BUSOF = {'vn': 'str', 'va': 'str', 'vc': 'str', 'cb': 'str', 'hn': 'brass', 'tb': 'brass', 'tu': 'brass', 'tp': 'brass',
         'fl': 'wind', 'ob': 'wind', 'cl': 'wind', 'bn': 'wind', 'harp': 'harp', 'glock': 'harp', 'glass': 'harp', 'vib': 'harp'}
INST = {}


def M(n):
    return midi(n) if isinstance(n, str) else n


def I(key):
    if key not in INST:
        INST[key] = Inst(key)
    return INST[key]


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


def note(key, n, t, dur, vel=0.6, g=0.0, att=0.0, rel=0.6, shape=None, bus=None, cents=0.0, rr=0):
    """One sampled note. g = gain dB; shape = [(t_rel, gain), ...] inside the note."""
    NOTES.append({'t': round(t, 3), 'dur': round(dur, 3), 'midi': M(n), 'vel': vel, 'g': g, 'inst': key})
    x = I(key).note(M(n), dur, vel=vel, att=att, rel=rel, cents=cents, rr=rr)
    if shape:
        x = x * env_points(len(x), shape)[:, None]
    bk = bus or BUSOF[key.split('_')[0]]
    add(B[bk], spread(x, SEAT.get(key, 0.0)), t, db(g), {'hall': 1.0})


def chord(key, notes, t, dur, rr=0, **kw):
    for i, n in enumerate(notes):
        note(key, n, t, dur, rr=rr + i, **kw)


def gliss(key, n, t, dur, pts, vel=0.6, g=0.0, att=0.1, rel=0.3, shape=None, rr=0):
    """A sampled note that bends: pts = [(t_rel, semitones), ...]."""
    NOTES.append({'t': round(t, 3), 'dur': round(dur, 3), 'midi': M(n), 'vel': vel, 'g': g, 'inst': key, 'bend': pts[-1][1]})
    total = secs(dur + rel)
    x = I(key).note(M(n), (dur + rel) * 2 + 0.5, vel=vel, att=0, rel=0.05, rr=rr)
    y = varispeed(x, 2 ** (env_points(total, pts) / 12))[:total]
    e = env_points(len(y), [(0, 0), (att, 1), (dur, 1), (dur + rel, 0)])
    if shape:
        e = e * env_points(len(y), shape)
    add(B[BUSOF[key.split('_')[0]]], spread(y * e[:, None], SEAT.get(key, 0.0)), t, db(g), {'hall': 1.0})


def timp(n, t, g=0.0, drum=2, dur=2.5):
    f, pk = X.TIMP[drum]
    x = load(f)
    ratio = hz(M(n)) / (pk or 150.0)
    while ratio > 1.26:
        ratio /= 2
    while ratio < 0.63:
        ratio *= 2
    y = varispeed(x, ratio)[:secs(dur)]
    NOTES.append({'t': round(t, 3), 'dur': 0.3, 'midi': M(n), 'vel': 0.8, 'g': g, 'inst': 'timp'})
    add(B['perc'], fade(y.copy(), 0.0005, 0.3), t, db(g), {'hall': 1.0})


def timp_roll(n, t, d, g=0.0, shape=None):
    x = W.N('timp_roll', 1.0)
    ratio = hz(M(n)) / 181.0
    while ratio > 1.26:
        ratio /= 2
    while ratio < 0.63:
        ratio *= 2
    y = varispeed(x, ratio)
    while len(y) < secs(d):
        y = np.concatenate([y, y])
    y = y[:secs(d)].copy()
    sh = shape or [(0, 0.3), (d, 1.0)]
    y = fade(y * env_points(len(y), sh)[:, None], 0.05, 0.05)
    add(B['perc'], y, t, db(g), {'hall': 1.0})


def perc(key, t, g=0.0, ratio=1.0):
    add(B['perc'], W.N(key, ratio), t, db(g), {'hall': 1.0})


# ------------------------------------------------------------------------------------------------ material
MOTIF = [(0.0, 'D5', 0.4), (0.4, 'F5', 0.6), (1.0, 'E5', 0.2), (1.2, 'A4', 0.8), (2.0, 'Bb4', 0.4), (2.4, 'C5', 0.4), (2.8, 'D5', 1.2)]
MOTIF_MAJ = [(a, n.replace('F5', 'F#5').replace('Bb4', 'B4').replace('C5', 'C#5'), d) for a, n, d in MOTIF]


def motif(key, t, notes=None, oct=0, g=0.0, vel=0.6, last=None, stretch=1.0, att=0.06, rel=0.5, legato=1.08, count=7):
    notes = notes or MOTIF
    for i, (a, n, d) in enumerate(notes[:count]):
        dd = (last if (last is not None and i == count - 1) else d * legato) * stretch
        note(key, M(n) + 12 * oct, t + a * stretch, dd, vel=vel, g=g + (1.0 if i in (0, 3, 6) else 0.0), att=att, rel=rel, rr=i)


STEPS = [0, 0, 0, -5, 0, 0, 3, 0]          # 3+3+2 accents on 0, 3, 6: the storm gallop (relative to the chord root)
ACC = (0, 3, 6)


def ostinato(t0, t1, step, roots, g0, g1, v0, v1, steps=STEPS, viola=False, bass=True, timp_g=None, timp_notes=('D2', 'A1')):
    """Low strings spiccato on the grid; roots = [(t, 'D3'), ...] chord roots over time (for cello)."""
    k = int(round((t1 - t0) / step))
    for i in range(k):
        t = t0 + i * step
        u = i / max(1, k - 1)
        root = M([r for tt, r in roots if tt <= t + 1e-6][-1])
        j = i % 8
        nm = root + steps[j]
        acc = j in ACC
        v = min(1.0, v0 + (v1 - v0) * u + (0.18 if acc else 0.0))
        g = g0 + (g1 - g0) * u + (2.5 if acc else 0.0)
        note('vc_spic', nm, t, step * 0.8, vel=v, g=g, rel=0.12, rr=i)
        if bass:
            note('cb_spic', nm - 12 if nm - 12 >= 28 else nm, t, step * 0.8, vel=v, g=g - 2.0, rel=0.14, rr=i)
        if viola:
            note('va_spic', nm + 12, t, step * 0.7, vel=v * 0.85, g=g - 5.0, rel=0.1, rr=i + 1)
        if timp_g is not None and acc:
            timp(timp_notes[0] if j != 3 else timp_notes[1], t, timp_g + (g1 - g0) * u + (0 if j == 0 else -2.5), dur=1.4)


# ================================================================================================================
# SCORE
# ================================================================================================================
def sc_hook():
    """0-2.9: the storm ostinato already running on frame 0; the bolt cuts it dead."""
    log('score: hook')
    b = C['bolt']
    ostinato(0.0, b, 0.2, [(0, 'D3')], -12, -8, 0.6, 0.85, timp_g=-9)
    note('cb_trem', 'D2', 0.0, b + 0.05, vel=0.55, g=-12, att=0.0, rel=0.05)
    note('vc_trem', 'D3', 0.0, b + 0.05, vel=0.5, g=-15, att=0.0, rel=0.05)
    note('tb_sus', 'D2', 0.0, b + 0.05, vel=0.4, g=-17, att=0.0, rel=0.05)
    note('vn_trem', 'A4', 1.2, b - 1.2 + 0.05, vel=0.5, g=-16, att=1.2, rel=0.05, shape=[(0, 0.4), (b - 1.2, 1.3)])
    note('va_trem', 'F4', 1.6, b - 1.6 + 0.05, vel=0.45, g=-18, att=0.9, rel=0.05, shape=[(0, 0.4), (b - 1.6, 1.2)])


def sc_dread():
    """4-10.5: dread in the wheelhouse and kitchen, solitude at the stair foot (motif, first four notes, oboe)."""
    log('score: dread / solitude')
    t, e = s0('s03'), s0('s05')
    note('cb_sus', 'D2', t, e - t, vel=0.4, g=-14, att=0.8, rel=0.6)
    note('vc_sus', 'D3', t + 0.3, 2.0, vel=0.35, g=-17, att=0.9, rel=0.8)
    note('va_trem', 'Eb4', t + 0.8, 1.3, vel=0.25, g=-24, att=0.6, rel=0.5)      # the whisper of the threat
    note('va_trem', 'D4', t + 2.0, 1.5, vel=0.25, g=-24, att=0.4, rel=0.6)
    # kitchen: Dm(add9), very thin and high, held
    k = s0('s04')
    note('vn_sus', 'A5', k, 2.0, vel=0.25, g=-24, att=0.8, rel=0.6)
    note('vn_sus', 'E5', k + 0.4, 1.6, vel=0.25, g=-26, att=0.8, rel=0.6)
    note('va_sus', 'F4', k + 0.2, 1.8, vel=0.25, g=-24, att=0.8, rel=0.6)
    note('vc_sus', 'D3', k, 2.0, vel=0.3, g=-20, att=0.6, rel=0.6)
    # solitude: Dm -> Bb at the key, oboe motif's falling half
    g = s0('s05')
    note('cb_sus', 'D2', g, C['keyHand'] - g + 0.2, vel=0.35, g=-16, att=0.4, rel=0.4)
    note('vc_sus', 'A2', g, C['keyHand'] - g + 0.2, vel=0.3, g=-19, att=0.4, rel=0.4)
    note('va_sus', 'F3', g, C['keyHand'] - g + 0.2, vel=0.3, g=-21, att=0.4, rel=0.4)
    kh = C['keyHand']
    for key, n, gg in [('cb_sus', 'Bb1', -16), ('vc_sus', 'F2', -19), ('va_sus', 'D3', -21), ('va_sus', 'F3', -23)]:
        note(key, n, kh, s1('s05') - kh + 0.3, vel=0.3, g=gg, att=0.3, rel=0.5)
    motif('ob', kh, g=-11, vel=0.5, count=4, last=1.3, att=0.04, rel=0.8)


def sc_spiral():
    """10.5-13: the run up the stair: the ostinato returns at a run, rising i - VI - VII."""
    log('score: spiral')
    t, e = s0('s06'), s1('s06')
    roots = [(t, 'D3'), (11.3, 'Bb2'), (12.1, 'C3'), (12.7, 'A2')]
    ostinato(t, e, 0.2, roots, -15, -9, 0.5, 0.85, timp_g=-14, steps=[0, 0, 0, -5, 0, 0, 4, 0], viola=True)
    gliss('va_trem', 'F4', t, e - t, [(0, 0), (0.8, 0), (1.0, -1), (1.6, -1), (1.8, 2), (2.5, 4)], vel=0.4, g=-19, att=0.3, rel=0.15)
    gliss('vn_trem', 'A4', t + 0.8, e - t - 0.8, [(0, 0), (0.8, 1), (1.4, 3), (1.7, 4)], vel=0.4, g=-21, att=0.4, rel=0.15)


def sc_lamp():
    """13-17.9: the dark lantern room (open fifth), then the flame: F major(add9) blooms, the flute waits on E."""
    log('score: lamp room / flame')
    t = s0('s07')
    mc = C['mantleCatch']
    note('cb_sus', 'D2', t, mc - t + 0.3, vel=0.35, g=-15, att=0.3, rel=0.6)
    note('vc_sus', 'A2', t + 0.1, mc - t + 0.2, vel=0.3, g=-18, att=0.5, rel=0.6)
    note('vn_sus', 'A5', t + 0.6, mc - t - 0.4, vel=0.2, g=-26, att=1.0, rel=0.6)
    note('glass', 'D5', t + 0.3, 2.4, vel=0.5, g=-24, att=0.8, rel=1.0)
    # flame: harp unfolds F(add9), strings bloom
    for i, n in enumerate(['F2', 'C3', 'F3', 'A3', 'C4', 'G4', 'A4', 'C5']):
        note('harp', n, mc + 0.07 * i, 2.0, vel=0.55, g=-10 - 0.3 * i, rel=1.2, rr=i)
    for key, n, gg in [('cb_sus', 'F2', -15), ('vc_sus', 'C3', -17), ('va_sus', 'A3', -19), ('va_sus', 'F3', -20),
                       ('vn_sus', 'G4', -21), ('vn_sus', 'C5', -22)]:
        note(key, n, mc, C['pushStart'] - mc + 0.4, vel=0.4, g=gg, att=0.6, rel=0.8)
    motif('fl', mc + 0.4, g=-10, vel=0.55, count=3, last=1.6, att=0.06, rel=1.0)
    note('glock', 'C6', mc + 0.02, 0.5, vel=0.4, g=-22, rel=1.2)


def sc_strain():
    """17.9-25.6: stuck (strain), the swell (threat D-Eb), the lookout, the notch climb, held breath, CLUNK on A."""
    log('score: strain / swell / notch')
    p = C['pushStart']
    sw = C['swellRise']
    d = sw - p
    note('cb_trem', 'D2', p, d + 0.2, vel=0.5, g=-14, att=0.5, rel=0.2, shape=[(0, 0.5), (d, 1.3)])
    note('vc_trem', 'D3', p, 0.9, vel=0.45, g=-17, att=0.3, rel=0.3)
    chord('vc_trem', ['D3', 'G3'], p + 0.8, d - 0.6, vel=0.45, g=-17, att=0.3, rel=0.3, shape=[(0, 0.6), (d - 0.6, 1.3)])
    note('va_trem', 'Bb3', p + 0.8, d - 0.6, vel=0.4, g=-19, att=0.4, rel=0.3)
    for i, tt in enumerate(np.arange(18.0, sw - 0.01, 0.8)):
        timp('D2', tt, -16 + 1.5 * i, dur=1.4)
    # the swell: low brass on the semitone, the ostinato on eighths with Eb
    lk = s0('s11')
    note('tb_sus', 'D2', sw, lk - sw + 0.3, vel=0.55, g=-12, att=0.8, rel=0.5)
    note('tb_sus', 'Eb3', sw + 0.6, lk - sw - 0.3, vel=0.5, g=-14, att=0.8, rel=0.5)
    note('tu_sus', 'D2', sw, lk - sw + 0.3, vel=0.5, g=-13, att=1.0, rel=0.5)
    note('hn_sus', 'D3', sw + 1.2, lk - sw - 1.0, vel=0.45, g=-16, att=0.6, rel=0.5)
    note('vn_trem', 'Eb5', sw + 0.4, lk - sw, vel=0.3, g=-22, att=1.0, rel=0.4)
    note('cb_trem', 'D2', sw, s0('s12') - sw, vel=0.45, g=-15, att=0.4, rel=0.3)
    ostinato(sw, s0('s12'), 0.4, [(0, 'D3')], -14, -15, 0.6, 0.5, steps=[0, 0, 0, 1, 0, 0, 3, 1], timp_g=-12)
    # lookout: held, an alto line in clarinet
    note('va_sus', 'F4', lk, s0('s12') - lk, vel=0.3, g=-22, att=0.6, rel=0.4)
    note('cl', 'A4', lk + 0.4, 1.0, vel=0.35, g=-17, att=0.3, rel=0.4)
    note('cl', 'G4', lk + 1.4, 0.6, vel=0.35, g=-18, att=0.2, rel=0.5)
    # notch: semitone climb, timpani roll crescendo, gated hold (render.windows), then CLUNK and the A chord
    n0, nt = s0('s12'), C['notch']
    hold = nt - 0.25
    d = hold - n0
    gliss('vn_trem', 'A4', n0, d + 0.02, [(0, 0), (d * 0.3, 1), (d * 0.6, 2), (d, 3)], vel=0.6, g=-13, att=0.2, rel=0.03, shape=[(0, 0.6), (d, 1.4)])
    gliss('va_trem', 'D4', n0, d + 0.02, [(0, 0), (d * 0.5, 1), (d, 3)], vel=0.55, g=-15, att=0.2, rel=0.03, shape=[(0, 0.6), (d, 1.4)])
    note('vc_trem', 'D3', n0, d + 0.02, vel=0.6, g=-13, att=0.2, rel=0.03, shape=[(0, 0.6), (d, 1.4)])
    note('cb_trem', 'D2', n0, d + 0.02, vel=0.6, g=-13, att=0.2, rel=0.03, shape=[(0, 0.6), (d, 1.4)])
    note('tb_sus', 'D2', n0 + 0.2, d - 0.18, vel=0.6, g=-14, att=0.4, rel=0.03, shape=[(0, 0.5), (d - 0.2, 1.4)])
    timp_roll('D2', n0, d + 0.02, -8, [(0, 0.15), (d, 1.0)])
    ring = C['sweepStart'] - nt
    for key, n, gg in [('cb_sus', 'A1', -10), ('vc_sus', 'A2', -12), ('vc_sus', 'E3', -14), ('va_sus', 'C#4', -15), ('va_sus', 'E4', -16),
                       ('hn_sus', 'A3', -12), ('hn_sus', 'C#4', -13), ('tb_sus', 'A2', -12), ('vn_sus', 'A4', -16)]:
        note(key, n, nt, ring, vel=0.75, g=gg, att=0.0, rel=0.4, shape=[(0, 1.0), (0.3, 0.55), (ring, 0.7)])
    timp('A1', nt, -4, dur=2.0)


def sc_hope():
    """26.4-35.5: the beam turns. The motif whole (horns + violins, F major), recognition at 31.0, the mouth at 34.6."""
    log('score: hope')
    s = C['sweepStart']
    m0 = s + 0.4
    # chords under the motif: Bb | C | F | Gm7 | C | Bb(add9)
    CH = [(s, 1.4, ['Bb1', 'F2', 'D3', 'F3', 'Bb3']), (s + 1.4, 0.2, ['C2', 'G2', 'E3', 'G3', 'C4']),
          (s + 1.6, 0.8, ['F1', 'F2', 'C3', 'A3', 'C4']), (s + 2.4, 0.4, ['G1', 'G2', 'D3', 'F3', 'Bb3']),
          (s + 2.8, 0.4, ['C2', 'G2', 'E3', 'G3', 'C4']), (s + 3.2, s1('s13') - s - 3.2, ['Bb1', 'F2', 'D3', 'F3', 'C4'])]
    keys = [('cb_sus', -9), ('vc_sus', -10), ('va_sus', -11), ('va_sus', -12), ('vn_sus', -13)]
    for i, (t, d, ns) in enumerate(CH):
        for (key, gg), n in zip(keys, ns):
            note(key, n, t, d + 0.05, vel=0.7, g=gg + (2 if i == 0 else 0), att=0.6 if i == 0 else 0.08, rel=0.35, rr=i)
    note('tb_sus', 'Bb1', s, 1.4, vel=0.6, g=-12, att=0.6, rel=0.4)
    note('tb_sus', 'F2', s + 1.6, 0.8, vel=0.6, g=-12, att=0.1, rel=0.4)
    note('tb_sus', 'Bb1', s + 3.2, 1.0, vel=0.6, g=-12, att=0.1, rel=0.6)
    motif('hn_sus', m0, oct=-1, g=-6, vel=0.8, legato=1.05)
    motif('vn_sus', m0, oct=0, g=-9, vel=0.75, legato=1.05)
    motif('fl', m0, oct=0, g=-14, vel=0.6, legato=1.05)
    for i, (t, d, ns) in enumerate(CH):
        for j, n in enumerate(ns[1:] + [M(ns[-1]) + 12]):
            note('harp', n, t + 0.05 * j, 0.8, vel=0.6, g=-11, rel=0.9, rr=j)
    timp('Bb1', s, -9)
    timp('F2', s + 1.6, -10)
    timp('C2', s + 2.8, -11)
    perc('sus_cresc', s - 1.0, -20)
    # seen (30.5-32.5): Dm, then the bright F swell at beamOnFleet; a light eighth pulse keeps the boats moving
    t = s0('s14')
    f = C['beamOnFleet']
    for key, n, gg in [('cb_sus', 'D2', -12), ('vc_sus', 'A2', -14), ('va_sus', 'F3', -15), ('vn_sus', 'A4', -17)]:
        note(key, n, t, f - t + 0.05, vel=0.55, g=gg, att=0.15, rel=0.3)
    sus = W.N('sus_cresc', 1.0, 1.0)
    pk = int(np.argmax(np.abs(sus).max(1)))
    add(B['perc'], sus, f - pk / SR, db(-16), {'hall': 1.0})
    e2 = s0('s15')
    for key, n, gg in [('cb_sus', 'F1', -9), ('vc_sus', 'F2', -11), ('vc_sus', 'C3', -12), ('va_sus', 'A3', -12), ('va_sus', 'C4', -13),
                       ('vn_sus', 'F4', -13), ('vn_sus', 'A4', -13), ('vn_sus', 'C5', -14), ('hn_sus', 'A3', -12), ('hn_sus', 'F3', -12)]:
        note(key, n, f, e2 - f + 0.1, vel=0.75, g=gg, att=0.05, rel=0.35)
    note('vn_sus', 'F5', f + 0.4, 0.4, vel=0.6, g=-14, att=0.05, rel=0.2)
    note('vn_sus', 'E5', f + 0.8, 0.3, vel=0.6, g=-14, att=0.05, rel=0.2)
    note('vn_sus', 'C5', f + 1.1, 0.4, vel=0.6, g=-14, att=0.05, rel=0.3)
    ostinato(t, s1('s15'), 0.4, [(t, 'D3'), (f, 'F2'), (s0('s15'), 'Bb2'), (33.3, 'C3'), (34.1, 'D3'), (C['mouthLit'], 'F2')],
             -17, -13, 0.5, 0.7, steps=[0, 0, 0, -5, 0, 0, 7, 0], bass=True)
    timp('F2', f, -9)
    # mouth (32.5-35.5): Bb - C - Dm, harp glissando onto F at mouthLit; motif tail in violins
    m = C['mouthLit']
    for (t, d, ns) in [(s0('s15'), 0.8, ['Bb1', 'F2', 'D3', 'F3', 'Bb3']), (33.3, 0.8, ['C2', 'G2', 'E3', 'G3', 'C4']),
                       (34.1, m - 34.1, ['D2', 'A2', 'F3', 'A3', 'D4'])]:
        for (key, gg), n in zip(keys, ns):
            note(key, n, t, d + 0.05, vel=0.6, g=gg - 2, att=0.1, rel=0.3)
    note('vn_sus', 'Bb4', 33.4, 0.42, vel=0.65, g=-11, att=0.05, rel=0.2)
    note('vn_sus', 'C5', 33.8, 0.42, vel=0.65, g=-11, att=0.05, rel=0.2)
    note('vn_sus', 'D5', 34.2, 0.42, vel=0.7, g=-10, att=0.05, rel=0.2)
    note('hn_sus', 'Bb3', 33.4, 0.42, vel=0.6, g=-11, att=0.05, rel=0.2)
    note('hn_sus', 'C4', 33.8, 0.42, vel=0.6, g=-11, att=0.05, rel=0.2)
    note('hn_sus', 'D4', 34.2, 0.42, vel=0.65, g=-10, att=0.05, rel=0.2)
    gl = ['F3', 'G3', 'A3', 'Bb3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'Bb4', 'C5', 'D5', 'E5', 'F5']
    for i, n in enumerate(gl):
        note('harp', n, m - 0.4 + 0.4 * i / len(gl), 1.0, vel=0.45 + 0.02 * i, g=-12, rel=1.0, rr=i)
    e = s1('s15')
    for key, n, gg in [('cb_sus', 'F1', -9), ('vc_sus', 'F2', -11), ('va_sus', 'C4', -12), ('va_sus', 'A3', -12),
                       ('vn_sus', 'F5', -11), ('vn_sus', 'C5', -13), ('hn_sus', 'F3', -10), ('hn_sus', 'A3', -10), ('hn_sus', 'C4', -11), ('tb_sus', 'F2', -11)]:
        note(key, n, m, e - m + 0.1, vel=0.8, g=gg, att=0.03, rel=0.3)
    timp('F2', m, -7)
    perc('crash_ff', m, -22)


def sc_terror():
    """35.5-46.05: crest (D with Eb), tired (oboe strain, low strings take the motif), together (accelerating), race."""
    log('score: terror')
    t, e = s0('s16'), s1('s16')
    cr = C['crest']
    ostinato(t, e, 0.2, [(t, 'D3')], -11, -7, 0.75, 1.0, steps=[0, 0, 0, 1, 0, 0, 3, 1], viola=True, timp_g=-8)
    note('tb_sus', 'D2', t, cr - t, vel=0.6, g=-12, att=0.4, rel=0.3)
    note('tu_sus', 'D2', t, e - t, vel=0.6, g=-11, att=0.5, rel=0.4)
    chord('hn_sus', ['D4', 'F4'], t + 0.4, cr - t - 0.4, vel=0.6, g=-12, att=0.5, rel=0.2)
    gliss('vn_trem', 'D5', t, e - t, [(0, 0), (1.3, 0), (1.5, 1), (2.6, 1), (2.8, 3), (3.0, 3)], vel=0.6, g=-12, att=0.3, rel=0.3)
    # the crest: brass cluster D-Eb-F, wide strings, everything
    for key, n, gg in [('hn_sus', 'D4', -8), ('hn_sus', 'Eb4', -8), ('hn_sus', 'F4', -9), ('tb_sus', 'D2', -8), ('tb_sus', 'Eb3', -9),
                       ('tb_sus', 'A2', -10), ('cb_sus', 'D2', -8), ('vc_sus', 'D3', -9), ('va_sus', 'Eb4', -11), ('vn_trem', 'D6', -14)]:
        note(key, n, cr, e - cr + 0.05, vel=0.9, g=gg, att=0.02, rel=0.4, shape=[(0, 1.2), (0.4, 0.85), (e - cr, 1.0)])
    timp('D2', cr, -3)
    perc('bd_vsco_fff', cr, -8, 0.8)
    perc('gong_ff', cr + 0.01, -14, 0.8)
    # tired: thins to the low pulse and a strained oboe; grandpa's paws: the low strings take the motif
    t, gj = s0('s17'), C['grandpaJoins']
    ostinato(t, s0('s18'), 0.4, [(t, 'D3'), (40.0, 'G2')], -17, -15, 0.45, 0.55, bass=True, timp_g=-17)
    note('cb_sus', 'D2', t, gj - t + 0.2, vel=0.35, g=-16, att=0.3, rel=0.3)
    note('ob', 'A4', t + 0.2, 0.5, vel=0.45, g=-13, att=0.05, rel=0.2)
    note('ob', 'Bb4', t + 0.7, 0.35, vel=0.5, g=-13, att=0.05, rel=0.2)
    note('ob', 'A4', t + 1.05, 0.5, vel=0.4, g=-14, att=0.05, rel=0.4)
    motif('vc_sus', gj, oct=-2, g=-9, vel=0.7, count=4, last=0.9, stretch=0.85, rel=0.4)
    motif('bn', gj, oct=-2, g=-14, vel=0.55, count=4, last=0.9, stretch=0.85, rel=0.4)
    note('va_sus', 'Bb3', 40.0, 0.6, vel=0.45, g=-17, att=0.2, rel=0.3)
    note('va_sus', 'D4', 40.0, 0.6, vel=0.45, g=-18, att=0.2, rel=0.3)
    # together: Dm - Bb - C - Dm, ostinato accelerates at fastSweep, horns rise
    t, fs, e = s0('s18'), C['fastSweep'], s1('s18')
    ostinato(t, fs, 0.4, [(t, 'D3')], -13, -11, 0.6, 0.7, timp_g=-12)
    ostinato(fs, e, 0.2, [(fs, 'Bb2'), (41.8, 'C3'), (42.6, 'D3')], -11, -8, 0.75, 0.95, viola=True, steps=[0, 0, 0, -5, 0, 0, 4, 0], timp_g=-9,
             timp_notes=('D2', 'A1'))
    for (tt, d, ns) in [(t, fs - t, ['D2', 'A2', 'F3', 'A3', 'D4']), (fs, 0.8, ['Bb1', 'F2', 'D3', 'F3', 'Bb3']),
                        (41.8, 0.8, ['C2', 'G2', 'E3', 'G3', 'C4']), (42.6, e - 42.6, ['D2', 'A2', 'F3', 'A3', 'D4'])]:
        for (key, gg), n in zip([('cb_sus', -11), ('vc_sus', -12), ('va_sus', -13), ('va_sus', -14), ('vn_sus', -14)], ns):
            note(key, n, tt, d + 0.05, vel=0.7, g=gg, att=0.1, rel=0.25)
    for i, (n, tt) in enumerate([('D4', fs), ('F4', 41.6), ('G4', 42.2), ('A4', 42.6)]):
        note('hn_sus', n, tt, 0.65 if i < 3 else e - tt, vel=0.7, g=-9, att=0.08, rel=0.3)
        note('hn_sus', M(n) - 5 if i < 3 else 'D4', tt, 0.65 if i < 3 else e - tt, vel=0.65, g=-11, att=0.08, rel=0.3)
    # race: full drive, Dm / Eb over D alternating, every accent on the grid, crescendo into the inhale
    t, inh = s0('s19'), C['waveBreak'] - 0.32
    ostinato(t, inh, 0.2, [(t, 'D3')], -9, -5, 0.85, 1.0, steps=[0, 0, 0, 1, 0, 0, 3, 1], viola=True, timp_g=-6)
    for i, tt in enumerate(np.arange(t, inh - 0.01, 0.8)):
        perc('bd2_f', tt, -14 + 0.8 * i, 1.0)
        maj = i % 2 == 1
        d = min(0.8, inh - tt)
        for key, n, gg in [('hn_sus', 'Eb4' if maj else 'D4', -8), ('hn_sus', 'G4' if maj else 'F4', -9), ('hn_sus', 'Bb3' if maj else 'A3', -9),
                           ('tb_sus', 'Eb3' if maj else 'D3', -9), ('tb_sus', 'D2', -9), ('tu_sus', 'D2', -10)]:
            note(key, n, tt, d, vel=0.85, g=gg + 0.6 * i, att=0.03, rel=0.05)
    dd = inh - t
    gliss('vn_trem', 'D5', t, dd + 0.01, [(0, 0), (0.8, 1), (1.6, 0), (2.4, 1), (dd, 3)], vel=0.8, g=-11, att=0.1, rel=0.01, shape=[(0, 0.8), (dd, 1.4)])
    gliss('vn_trem', 'D6', t + 1.6, dd - 1.6 + 0.01, [(0, 0), (dd - 1.6, 1)], vel=0.7, g=-15, att=0.4, rel=0.01)
    note('cb_trem', 'D2', t, dd + 0.01, vel=0.8, g=-10, att=0.1, rel=0.01)
    timp_roll('D2', inh - 1.6, 1.6, -6, [(0, 0.3), (1.6, 1.0)])


def sc_release():
    """49.0-54.6: the release (Bb major, motif climb in horns), the flicker (one flute E, harp), A leading home."""
    log('score: release / flicker')
    r = s0('s21')
    e = s0('s22')
    for key, n, gg in [('cb_sus', 'Bb1', -8), ('vc_sus', 'F2', -9), ('vc_sus', 'D3', -10), ('va_sus', 'F3', -10), ('va_sus', 'Bb3', -11),
                       ('vn_sus', 'D4', -11), ('vn_sus', 'F4', -11), ('vn_sus', 'Bb4', -12), ('tb_sus', 'Bb1', -11), ('hn_sus', 'F3', -11)]:
        note(key, n, r, 1.6, vel=0.75, g=gg, att=0.45, rel=0.4)
    for i, (n, tt) in enumerate([('Bb3', r + 0.4), ('C4', r + 0.8), ('D4', r + 1.2)]):
        note('hn_sus', n, tt, 0.42 if i < 2 else 1.4, vel=0.8, g=-6, att=0.06, rel=0.4)
        note('vn_sus', M(n) + 12, tt, 0.42 if i < 2 else 1.4, vel=0.7, g=-10, att=0.06, rel=0.4)
    for key, n, gg in [('cb_sus', 'F1', -9), ('vc_sus', 'C3', -11), ('va_sus', 'A3', -11), ('va_sus', 'F3', -11), ('vn_sus', 'C5', -12), ('vn_sus', 'A4', -12)]:
        note(key, n, r + 1.6, e - r - 1.6 + 0.5, vel=0.7, g=gg, att=0.15, rel=0.6, shape=[(0, 1), (e - r - 1.6 + 0.4, 0.5)])
    for i, n in enumerate(['Bb2', 'F3', 'Bb3', 'D4', 'F4', 'Bb4', 'D5']):
        note('harp', n, r + 0.06 * i, 1.2, vel=0.55, g=-11, rel=1.2, rr=i)
    timp('Bb1', r, -10)
    # flicker: one flute note waiting (E over the dying F chord), harp harmonics on the flame, the breath in at flameSave
    sp, fsv = C['sprayHit'], C['flameSave']
    note('fl', 'E5', sp + 0.1, fsv - sp + 0.6, vel=0.4, g=-13, att=0.3, rel=0.6)
    for i, tt in enumerate((sp + 0.15, sp + 0.45)):
        note('harp', 'A5', tt, 0.5, vel=0.3, g=-18, rel=1.0, rr=i)
    pb = C['pierBump']
    for key, n, gg in [('cb_sus', 'D2', -14), ('vc_sus', 'A2', -16), ('va_sus', 'F3', -17), ('va_sus', 'E4', -19), ('vn_sus', 'A4', -20)]:
        note(key, n, fsv, 53.8 - fsv + 0.1, vel=0.45, g=gg, att=0.6, rel=0.3)
    for key, n, gg in [('cb_sus', 'A1', -13), ('vc_sus', 'E3', -15), ('va_sus', 'A3', -16), ('va_sus', 'C#4', -16), ('vn_sus', 'E4', -18),
                       ('hn_sus', 'A3', -16)]:
        note(key, n, 53.8, pb - 53.8 + 0.08, vel=0.55, g=gg, att=0.25, rel=0.15, shape=[(0, 0.7), (pb - 53.8, 1.2)])
    note('fl', 'C#5', 54.2, pb - 54.2 + 0.1, vel=0.45, g=-14, att=0.1, rel=0.2)


def sc_home():
    """54.6-62.5: D major arrives at the pier; the motif in D major peaks on Dad's smile; tender pizzicato for the laugh."""
    log('score: home')
    pb = C['pierBump']
    m0 = C['dadSmile'] - 2.8
    for key, n, gg in [('cb_sus', 'D2', -10), ('vc_sus', 'A2', -11), ('vc_sus', 'D3', -12), ('va_sus', 'F#3', -12), ('va_sus', 'A3', -13),
                       ('vn_sus', 'D4', -14), ('vn_sus', 'F#4', -14), ('hn_sus', 'F#3', -13), ('hn_sus', 'A3', -13)]:
        note(key, n, pb, m0 - pb + 0.05, vel=0.6, g=gg, att=0.12, rel=0.3)
    for i, n in enumerate(['D3', 'A3', 'D4', 'F#4', 'A4', 'D5']):
        note('harp', n, pb + 0.07 * i, 1.0, vel=0.55, g=-11, rel=1.2, rr=i)
    timp('D2', pb, -12)
    # the motif in D major: D | A/C# | D/F# | G | A | D (tutti on the smile)
    CH = [(m0, 1.0, ['D2', 'A2', 'F#3', 'A3', 'D4']), (m0 + 1.0, 0.2, ['C#2', 'A2', 'E3', 'A3', 'C#4']),
          (m0 + 1.2, 0.8, ['F#1', 'A2', 'D3', 'F#3', 'A3']), (m0 + 2.0, 0.4, ['G1', 'G2', 'D3', 'G3', 'B3']),
          (m0 + 2.4, 0.4, ['A1', 'A2', 'E3', 'G3', 'C#4']), (m0 + 2.8, s1('s24') - m0 - 2.8, ['D2', 'A2', 'F#3', 'A3', 'D4'])]
    for i, (t, d, ns) in enumerate(CH):
        last = i == len(CH) - 1
        for (key, gg), n in zip([('cb_sus', -9), ('vc_sus', -10), ('va_sus', -11), ('va_sus', -12), ('vn_sus', -12)], ns):
            note(key, n, t, d + (0.6 if last else 0.05), vel=0.7, g=gg + (1.5 if last else 0), att=0.1, rel=0.6 if last else 0.25, rr=i)
    motif('hn_sus', m0, MOTIF_MAJ, oct=-1, g=-6, vel=0.75, last=s1('s24') - m0 - 2.8 + 0.4)
    motif('vn_sus', m0, MOTIF_MAJ, oct=0, g=-9, vel=0.7, last=s1('s24') - m0 - 2.8 + 0.4)
    motif('fl', m0, MOTIF_MAJ, oct=1, g=-17, vel=0.5, last=s1('s24') - m0 - 2.8 + 0.4)
    sm = C['dadSmile']
    for key, n, gg in [('tb_sus', 'D2', -11), ('tb_sus', 'A2', -12), ('hn_sus', 'F#4', -10), ('vn_sus', 'A5', -14)]:
        note(key, n, sm, s1('s24') - sm + 0.3, vel=0.7, g=gg, att=0.15, rel=0.8)
    timp('D2', sm, -8)
    perc('sus_roll_p', sm - 1.2, -26)
    for i, n in enumerate(['D3', 'F#3', 'A3', 'D4', 'F#4', 'A4', 'D5', 'F#5']):
        note('harp', n, sm + 0.06 * i, 1.3, vel=0.6, g=-10, rel=1.4, rr=i)
    # ruffle: G - D/F# - Em - A in pizzicato and harp; a little flourish on the laugh
    t = s0('s25')
    pl = [(t, ['G2', 'D3', 'B3', 'G4']), (60.3, ['F#2', 'D3', 'A3', 'F#4']), (61.1, ['E2', 'B2', 'G3', 'E4']), (61.8, ['A2', 'E3', 'C#4', 'A4'])]
    for i, (tt, ns) in enumerate(pl):
        note('vc_pizz', ns[0], tt, 0.4, vel=0.6, g=-9, rel=0.6, rr=i)
        note('va_pizz', ns[1], tt + 0.2, 0.3, vel=0.5, g=-12, rel=0.5, rr=i)
        note('vn_pizz', ns[2], tt + 0.4, 0.3, vel=0.5, g=-13, rel=0.5, rr=i)
        note('va_sus', ns[2], tt, 0.75, vel=0.35, g=-21, att=0.2, rel=0.4)
        note('vn_sus', ns[3], tt, 0.75, vel=0.3, g=-23, att=0.25, rel=0.4)
    note('cb_sus', 'G1', t, 0.8, vel=0.35, g=-18, att=0.2, rel=0.4)
    note('cl', 'B4', t + 0.2, 0.8, vel=0.35, g=-17, att=0.15, rel=0.4)
    note('cl', 'A4', 61.1, 0.7, vel=0.35, g=-18, att=0.15, rel=0.4)
    note('cl', 'C#5', 61.8, 0.7, vel=0.35, g=-18, att=0.15, rel=0.4)
    lg = C['laugh']
    for i, n in enumerate(['D5', 'F#5', 'A5', 'D6']):
        note('harp', n, lg + 0.06 * i, 0.6, vel=0.5, g=-13, rel=1.0, rr=i)


def sc_dawn():
    """62.5-73: the storm tears open (Bm - G - D), the rhyme (harp rolling D major), asleep (flute's last climb)."""
    log('score: dawn')
    cp = C['cloudsPart']
    for (t, d, ns) in [(cp, 1.3, ['B1', 'F#2', 'D3', 'F#3', 'B4', 'D5', 'F#5']), (cp + 1.3, 1.4, ['G1', 'D3', 'B3', 'G4', 'B4', 'D5', 'G5']),
                       (cp + 2.7, s1('s26') - cp - 2.7, ['D2', 'A2', 'F#3', 'A3', 'D5', 'F#5', 'A5'])]:
        for (key, gg), n in zip([('cb_sus', -12), ('vc_sus', -13), ('va_sus', -14), ('va_sus', -15), ('vn_sus', -15), ('vn_sus', -15), ('vn_sus', -16)], ns):
            note(key, n, t, d + 0.3, vel=0.55, g=gg, att=0.6, rel=0.6)
    note('hn_sus', 'A3', cp + 2.7, 1.3, vel=0.45, g=-14, att=0.6, rel=0.6)
    # the sky opening: one long rising line over the three chords (D E F# | G A | A), the clarinet answering low
    for n, tt, d in [('D6', cp + 0.2, 0.8), ('C#6', cp + 1.0, 0.3), ('D6', cp + 1.3, 0.6), ('E6', cp + 1.9, 0.8), ('F#6', cp + 2.7, 1.3)]:
        note('vn_sus', n, tt, d * 1.05, vel=0.45, g=-17, att=0.15, rel=0.5)
    note('cl', 'F#4', cp + 1.3, 1.2, vel=0.35, g=-17, att=0.3, rel=0.6)
    note('cl', 'A4', cp + 2.7, 1.2, vel=0.35, g=-17, att=0.3, rel=0.6)
    # rhyme: harp rolling D major, a low drone, the strings very quiet
    r0, r1 = s0('s27'), s1('s27')
    for i, tt in enumerate(np.arange(r0, r1 - 0.01, 0.2)):
        prog = 'G' if 68.0 <= tt < 69.2 else 'D'
        pat = ['D3', 'A3', 'D4', 'F#4', 'A4', 'F#4', 'D4', 'A3'] if prog == 'D' else ['D3', 'G3', 'B3', 'D4', 'G4', 'D4', 'B3', 'G3']
        note('harp', pat[i % 8], tt, 0.6, vel=0.45 + (0.1 if i % 8 == 0 else 0), g=-14, rel=1.0, rr=i)
    note('vc_sus', 'D2', r0, r1 - r0 + 0.3, vel=0.3, g=-20, att=1.0, rel=0.5)
    note('va_sus', 'A3', r0 + 0.4, r1 - r0, vel=0.25, g=-24, att=1.2, rel=0.5)
    note('vn_sus', 'F#4', r0 + 0.8, r1 - r0 - 0.8, vel=0.25, g=-26, att=1.2, rel=0.5)
    note('fl', 'A5', r0 + 1.0, 1.2, vel=0.3, g=-20, att=0.4, rel=0.6)
    note('fl', 'F#5', r0 + 2.4, 1.0, vel=0.3, g=-21, att=0.3, rel=0.6)
    # asleep: the last climb (B C# D) lands on CUES.sleep, D major(add9), the film breathes out
    sl = C['sleep']
    end = DUR
    note('fl', 'B4', sl - 0.8, 0.42, vel=0.4, g=-14, att=0.08, rel=0.2)
    note('fl', 'C#5', sl - 0.4, 0.42, vel=0.4, g=-14, att=0.08, rel=0.2)
    note('fl', 'D5', sl, end - sl - 0.2, vel=0.4, g=-13, att=0.08, rel=0.5, shape=[(0, 1), (end - sl - 0.6, 0.6), (end - sl - 0.2, 0.0)])
    for key, n, gg in [('cb_sus', 'D2', -18), ('vc_sus', 'A2', -20), ('va_sus', 'F#3', -22), ('va_sus', 'E4', -24), ('vn_sus', 'A4', -25)]:
        note(key, n, s0('s28'), end - s0('s28') - 0.3, vel=0.3, g=gg, att=0.8, rel=0.3, shape=[(0, 1), (end - s0('s28') - 0.6, 0.5), (end - s0('s28') - 0.3, 0.0)])
    note('harp', 'D2', sl, 1.5, vel=0.4, g=-14, rel=1.0)
    note('harp', 'D3', sl + 0.02, 1.5, vel=0.4, g=-15, rel=1.0)
    note('harp', 'A4', sl + 0.5, 1.2, vel=0.3, g=-19, rel=1.0)


# ================================================================================================================
# SOUND DESIGN
# Every element is placed at a loudness target (LUFS, pre-master; the master shifts all by one constant):
#   'mom' = loudest 400 ms of the event, 'int' = gated integrated loudness of a bed.
# ================================================================================================================
PERSP = {   # set -> (lowpass Hz on the exterior world, gain dB) : what the camera hears of the storm
    'sea': (20000, 0), 'towerExt': (20000, 0), 'harbourHigh': (20000, -2), 'mouth': (20000, 0), 'harbour': (20000, 0), 'sky': (20000, 0),
    'wheelhouse': (750, -9), 'kitchen': (650, -11), 'stairsBase': (420, -12), 'stairs': (380, -13), 'lamproom': (9000, -3),
}
BED_RIDE = {  # shot -> dB on the storm / room beds: the storm owns the night until the light wins the room
    's08': -2, 's12': -1, 's13': -7, 's14': -6, 's15': -6, 's16': -2, 's17': -3, 's18': -5, 's19': -3, 's21': -6, 's22': -2,
    's23': -6, 's24': -8, 's25': -6, 's26': -3,
}
GEAR_G = {  # shot -> gear click level (dB); the lens is close in the lantern room, a far clock elsewhere
    's01': -14, 's02': -8, 's12': 0, 's13': -6, 's14': -24, 's15': -22, 's16': -30, 's17': -2, 's18': 0, 's19': -30, 's20': -40,
    's21': -28, 's22': -3, 's23': -26, 's24': -22, 's25': -5, 's26': -22, 's27': -16, 's28': -4,
}
HIT_STEMS = {}
DUCKS = []   # (t, depth dB, length s): music dips under thunder


def loud_mom(x):
    k = kweight(x)
    nn, hh = secs(0.4), secs(0.025)
    if len(k) <= nn:
        return -0.691 + 10 * np.log10(np.mean(k ** 2, 0).sum() * len(k) / nn + 1e-12)
    c = np.cumsum(np.concatenate([np.zeros((1, 2)), k ** 2]), 0)
    idx = np.arange(0, len(k) - nn + 1, hh)
    ms = ((c[idx + nn] - c[idx]) / nn).sum(1)
    return float(-0.691 + 10 * np.log10(ms.max() + 1e-12))


def loud_int(x):
    return float(lufs(x))


def put(bus, x, t, target, send=None, mode='mom', cue=None):
    """Add x at t scaled to a loudness target (LUFS). cue: also keep an isolated copy for the analyser."""
    x = x if x.ndim == 2 else np.stack([x, x], 1)
    L = loud_mom(x) if mode == 'mom' else loud_int(x)
    g = db(target - L)
    add(B[bus], x, t, g, send)
    if cue:
        HIT_STEMS[cue] = (round(t, 6), (x[:secs(0.8)] * g).mean(1))


def shot_env(table, default, fade=0.01):
    """Per-sample value stepping at each shot cut (short smoothing)."""
    pts = []
    for s in SHOTS:
        v = table.get(s['id'], table.get(s['set'], default))
        pts += [(s['start'] + (fade if s['start'] > 0 else 0), v), (s['end'] - fade, v)]
    return env_points(N, pts)


def fx_storm():
    """Exterior storm beds over the whole film: rain, wind, surf, the great swell, dawn water. All shaped by storm(t)."""
    log('fx: storm beds')
    st_ = STORM
    gust = W.gust_curve(DUR, 11, 0.8)
    full = slice(0, secs(C['cloudsPart']))
    r = W.rain(DUR, 21, 1.0, st_ ** 1.3)
    put('ext', r, 0.0, -23.5 - loud_int(r[full]) + loud_int(r), mode='int')
    wnd = W.wind(DUR, 31, gust * (0.25 + 0.75 * st_), howl=0.0) * (0.12 + 0.88 * st_)[:, None]
    put('ext', wnd, 0.0, -27 - loud_int(wnd[full]) + loud_int(wnd), mode='int')
    sea = W.surf(DUR, 41, 0.25 + 0.75 * st_)
    put('ext', sea, 0.0, -25 - loud_int(sea[full]) + loud_int(sea), mode='int')
    sw = W.swell_roar(SWELL, 51)
    near = shot_env({'s10': 1.0, 's16': 1.3, 's19': 1.2, 's20': 0.6, 's14': 0.6, 's15': 0.45, 's13': 0.4, 's11': 0.6}, 0.35)
    ref = loud_mom(sw[secs(C['crest']):secs(C['crest'] + 2)])
    add(B['ext'], sw * near[:, None], 0.0, db(-19 - ref))          # -19 LUFS at the crest when near = 1
    lap = W.lapping(DUR - 60.0, 61)
    lap = lap * (1 - STORM[secs(60.0):])[:len(lap), None]
    put('ext', lap, 60.0, -29, mode='int')
    return gust


def fx_thunder():
    log('fx: thunder')
    b = C['bolt']
    k = 0
    for L in LIGHT:
        if abs(L - b) < 1e-6:
            continue
        # distance (0 overhead .. 1 far), delay after the flash (sound travels ~340 m/s), level, orchestra duck (dB, s)
        dist, delay, lv, duck = [(0.6, 0.97, -12.0, (4, 1.2)), (0.4, 0.73, -10.5, (5, 1.2)),
                                 (0.0, 0.10, -8.0, (3, 0.35)), (0.05, 0.31, -7.5, (5, 0.6)),
                                 (0.5, 0.85, -13.0, (3, 0.8)), (0.3, 0.60, -11.5, (3, 0.8)), (0.5, 0.85, -12.5, (3, 0.8))][k]   # 5.3 / 7.2 / 23.4 (added strikes)
        put('sky', W.thunder(300 + k, dist, 1.0 - dist * 0.6, 6.0), L + delay, lv, {'out': 0.3})
        DUCKS.append((L + delay, duck[0], duck[1]))          # the orchestra gives way to the thunder
        k += 1
    # the bolt's own roll (CUES.thunder) after the direct hit
    put('sky', W.thunder(320, 0.15, 0.5, 7.0), C['thunder'], -8.5, {'out': 0.35})


def fx_hits():
    """Cue-synced hits. Each hit's attack sits exactly on its CUE (checked by tools/analyse.py)."""
    log('fx: cue hits')
    b = C['bolt']
    put('hit', W.bolt_strike(500), b, -9.5, {'out': 0.3}, cue='bolt')
    put('hit', W.glass_burst(520, 1.0, 2.4), b + 0.012, -15, {'lamp': 0.25})
    put('hit', W.cup_clink(200, 1.0), C['cupFall'], -23, {'room': 0.3}, cue='cupFall')
    put('hit', W.cup_clink(201, 0.5), C['cupFall'] + 0.16, -29, {'room': 0.3})
    put('hit', W.cup_shatter(210), C['cupFall'] + 0.62, -31, {'room': 0.4})
    put('hit', W.key_jingle(230), C['keyHand'], -26, {'tower': 0.2}, cue='keyHand')
    put('hit', W.match_strike(600), C['matchStrike'], -20, {'lamp': 0.25}, cue='matchStrike')
    put('hit', W.mantle_whoomp(620), C['mantleCatch'], -17, {'lamp': 0.3}, cue='mantleCatch')
    put('hit', W.clunk(700), C['notch'], -10.5, {'tower': 0.5, 'lamp': 0.4}, cue='notch')
    put('hit', W.wave_break(900), C['waveBreak'], -7.5, {'out': 0.4}, cue='waveBreak')
    put('hit', W.bow_burst(940), C['dadIn'], -14, {'out': 0.3})
    put('hit', W.spray_slap(960), C['sprayHit'], -14, {'lamp': 0.35}, cue='sprayHit')
    put('hit', W.pier_bump(980, 1.0), C['pierBump'], -18, {'out': 0.2}, cue='pierBump')
    for i, tt in enumerate((55.45, 56.3)):
        put('hit', W.pier_bump(985 + i, 1.0), tt, -26, {'out': 0.3})


def fx_gear():
    """The lens clock: every tooth from notches.json (bus 'gear'), every panel knock (bus 'panel'); level by shot (GEAR_G)."""
    log('fx: gear clicks')
    gl = shot_env(GEAR_G, -40)
    ref = loud_mom(W.tooth_click(1000, 1.0))
    for k, e in enumerate(GEAR['teeth']):
        t = e['t']
        if abs(t - C['notch']) < 1e-3:
            continue                     # the notch tooth is the CLUNK (fx_hits)
        lv = gl[min(N - 1, secs(t))]
        if lv <= -39:
            continue
        size = 0.75 if t > C['fastSweep'] else 1.0
        dawn = t > C['cloudsPart'] + 3.0          # layout.beamAz eases the lens to 0.3 rad/s: one slow click every ~0.4 s
        if dawn:
            size = 0.85
        add(B['gear'], W.tooth_click(1000 + k, size), t, db(-24 + lv - ref + (2 if dawn else 0)), {'lamp': 0.25})
    ref = loud_mom(W.panel_knock(2000, 1.0))
    for k, e in enumerate(GEAR['panels']):
        t = e['t']
        lv = gl[min(N - 1, secs(t))]
        if lv <= -39:
            continue
        add(B['panel'], W.panel_knock(2000 + k, 1.0), t, db(-23 + lv - ref + (3 if t > C['cloudsPart'] else 0)), {'lamp': 0.35})


def fx_interiors(gust):
    log('fx: interiors')
    # --- wheelhouse (s03, s11): diesel inside, wipers, rain drumming on the glass and roof, the hull working
    for sid, seed in (('s03', 100), ('s11', 110)):
        t, e = s0(sid), s1(sid)
        d = e - t
        x = W.diesel(d, seed, 8.5 + 0.6 * np.sin(np.arange(secs(d)) / SR * 0.7), 0.6, 0.7)
        put('int', fade(x, 0.004, 0.004), t, -29, {'room': 0.2}, mode='int')
        put('int', fade(W.wiper(d, seed + 1, 1.0), 0.004, 0.004), t, -31, {'room': 0.2}, mode='int')
        dr = W.rain(d, seed + 2, 0.5, np.ones(secs(d)), 1.6)
        put('int', fade(lp(dr, 5000), 0.004, 0.004), t, -27, {'room': 0.2}, mode='int')
        put('int', fade(W.creak(d, seed + 3, (10, 26), (180, 410, 690, 1100)), 0.004, 0.004), t, -36, mode='int')
    put('int', W.sleeve_wipe(0.75, 120), s0('s11') + 0.45, -27, {'room': 0.2})
    # --- kitchen (s04): rain ticking on the window, a quiet room
    t, e = s0('s04'), s1('s04')
    win = W.rain(e - t, 130, 0.25, np.ones(secs(e - t)), 0.3)
    put('int', fade(bp(win, 900, 9000), 0.004, 0.004), t, -31, {'room': 0.3}, mode='int')
    put('int', fade(X.room_tone(e - t, 131), 0.004, 0.004), t, -45, mode='int')
    # --- tower stair (s05, s06): wind moaning inside the stone, footsteps up the spiral
    t, e = s0('s05'), s1('s06')
    mo = W.tower_moan(e - t, 140, gust[secs(t):])
    put('int', fade(mo, 0.004, 0.004), t, -30, {'tower': 0.3}, mode='int')
    r = rng(150)
    st_t, k = s0('s06') + 0.05, 0
    while st_t < s1('s06') - 0.05:
        u = (st_t - s0('s06')) / (s1('s06') - s0('s06'))
        put('int', W.boot_step(150 + k, 1.0), st_t, -29 + 6 * u, {'tower': 0.55})
        st_t += 0.235 + r.uniform(-0.02, 0.02)
        k += 1
    put('int', W.boot_step(170, 1.0), s0('s05') + 0.3, -34, {'tower': 0.4})
    # --- lantern room: wind howling in through the panes (storm), rain spatter, the burner, strain, gutter, ruffle, laugh
    lamp_shots = [s for s in SHOTS if s['set'] == 'lamproom']
    sel = np.zeros(N)
    for s in lamp_shots:
        sel[secs(s['start']) + 48:secs(s['end']) - 48] = 1.0
    sel = uniform_filter1d(sel, 96)
    howl = W.wind(DUR, 160, gust * 1.15, howl=1.0, bright=1.3)
    ref = loud_int(howl[secs(13.0):secs(20.0)])
    add(B['int'], howl * (sel * (0.08 + 0.92 * STORM))[:, None], 0.0, db(-24 - ref), {'lamp': 0.2})
    spat = bp(W.rain(DUR, 165, 0.35, np.ones(N), 0.8), 700, 9000)
    ref = loud_int(spat)
    add(B['int'], spat * (sel * STORM)[:, None], 0.0, db(-29 - ref), {'lamp': 0.15})
    mc = C['mantleCatch']
    burn = np.clip((np.arange(N) / SR - mc) / 0.6, 0, 1) * sel
    hiss = W.lamp_hiss(DUR, 170, np.clip(BEAMON, 0.05, 1.0))
    ref = loud_int(hiss[secs(20):secs(30)])
    add(B['int'], hiss * burn[:, None], 0.0, db(-37 - ref), {'lamp': 0.1})
    gut_t = C['sprayHit']
    gut_d = C['flameSave'] + 0.4 - gut_t
    put('int', W.flame_gutter(gut_d, 175, BEAMON[secs(gut_t):]), gut_t, -24, {'lamp': 0.2})
    put('int', W.door_bang(640), s0('s07') + 0.08, -20, {'lamp': 0.35})
    r = rng(180)
    for k, tt in enumerate(np.arange(s0('s07') + 0.4, s1('s07') - 0.2, 0.33)):
        put('int', W.glass_burst(181 + k, 0.12, 0.5), tt + r.uniform(0, 0.05), -33, {'lamp': 0.2})
        put('int', W.boot_step(190 + k, 1.0), tt, -31, {'lamp': 0.2})
    p = C['pushStart']
    put('int', W.strain(SH['s09']['end'] - p, 200), p, -22, {'lamp': 0.3})
    n0 = s0('s12')
    put('int', W.strain(C['notch'] - 0.25 - n0, 210), n0, -20, {'lamp': 0.3})
    put('int', W.creak(1.5, 220, (14, 34), (260, 560, 1000, 1700)), s0('s17'), -27, {'lamp': 0.3})
    put('int', W.creak(1.0, 225, (30, 60), (260, 560, 1000, 1700)), C['grandpaJoins'] - 0.05, -25, {'lamp': 0.3})
    put('int', W.boot_step(226, 1.0), C['grandpaJoins'] - 0.25, -28, {'lamp': 0.3})
    put('int', W.laugh_breath(260), C['laugh'], -31, {'lamp': 0.2})
    put('int', W.fur_ruffle(0.9, 270), C['laugh'] + 0.6, -31, {'lamp': 0.15})
    t = s0('s28')
    put('int', W.gulls(DUR - t, 280, 0.35), t, -34, {'lamp': 0.1})


def fx_boats():
    log('fx: boats')
    # seen (s14): far engines throttling up when the beam finds them
    t, e = s0('s14'), s1('s14')
    for i in range(4):
        n = secs(e - t)
        f = np.interp(np.arange(n) / SR, [0, C['beamOnFleet'] - t, C['beamOnFleet'] - t + 0.8, e - t], [8.0, 8.0, 11.0, 11.5]) * (1 + 0.04 * i)
        x = W.diesel(e - t, 400 + i, f, 0.7)
        x = lp(x, 1200) * env_points(n, [(0, 0.5), (C['beamOnFleet'] - t + 0.6, 1.0), (e - t, 1.0)])[:, None]
        put('int', fade(spread(x, -0.6 + 0.4 * i), 0.004, 0.004), t, -29 - 2 * i, {'out': 0.2})
    for k in range(3):
        put('int', W.lantern_creak(410 + k, 1.0), C['beamOnFleet'] + 0.1 + 0.25 * k, -32, {'out': 0.2})
    t, e = s0('s15'), s1('s15')
    put('int', fade(lp(W.diesel(e - t, 420, 11.0, 0.8), 600), 0.004, 0.004), t, -38, {'out': 0.3})
    # race (s19): each boat passes the mouth at boatPass(i)
    t, e = s0('s19'), s1('s19')
    for b in TL['boats']:
        tp = b['pass']
        if b['i'] == 0 or not (t - 1 < tp < e + 1):
            continue
        a0, a1 = max(t, tp - 2.0), min(e, tp + 2.0)
        x = W.passby(a1 - a0, 430 + b['i'], tp - a0, 11.0 + 0.5 * b['i'], 1.0, -0.8 if b['i'] % 2 else 0.8, 0.8 if b['i'] % 2 else -0.8)
        put('int', fade(x, 0.004, 0.004), a0, -18, {'out': 0.25})
    # surf (s21): Kestrel close, engine easing off
    t, e = s0('s21'), s1('s21')
    put('int', fade(W.diesel(e - t, 440, np.linspace(12.0, 8.5, secs(e - t)), 0.8), 0.004, 0.004), t, -23, {'out': 0.25}, mode='int')
    # pier (s23, s24): engines idling down, lanterns raised, Kestrel's idle close on Dad
    t, e = s0('s23'), s1('s24')
    for i in range(3):
        x = lp(W.diesel(e - t, 450 + i, 7.0 + 0.4 * i, 0.3), 900)
        x *= env_points(secs(e - t), [(0, 1), (e - t - 1.0, 0.6), (e - t, 0.4)])[:, None]
        put('int', fade(x, 0.004, 0.004), t, -33 - 2 * i, {'out': 0.3}, mode='int')
    for k, tt in enumerate((55.2, 55.5, 55.9, 56.4)):
        put('int', W.lantern_creak(460 + k, 1.0), tt, -31, {'out': 0.3})
    put('int', W.lapping(e - t, 470), t, -31, mode='int')
    # break: the spray falls back over the basin, the roar of the broken swell recedes (no music: rule 5)
    wb = C['waveBreak']
    d = s1('s21') - wb - 0.2
    n = secs(d)
    lvl = env_points(n, [(0, 0), (0.3, 0.4), (0.9, 1.0), (2.6, 0.75), (d, 0.2)])
    put('ext', W.spray_fall(d, 480, lvl), wb + 0.2, -25)
    put('ext', W.surf(d, 485, env_points(n, [(0, 1.6), (2.5, 1.0), (d, 0.5)]), 1.2), wb + 0.2, -20)


def fx_inhale():
    """The sea inhales before the break: almost nothing, a thin draw of water (hush bus: never gated)."""
    d = 0.3
    put('hush', W.suck_back(d, 880), C['waveBreak'] - d - 0.02, -46)


def fx_dawn():
    log('fx: dawn')
    cp = C['cloudsPart']
    g = W.gulls(DUR - cp - 1.0, 290, 0.45)
    g = g * (1 - STORM[secs(cp + 1.0):])[:len(g), None]
    put('ext', g, cp + 1.0, -25)


# ================================================================================================================
# MIX + MASTER
# ================================================================================================================
def windows():
    """Gates: (t0, t1, group, floor dB). 'music' = the orchestra buses, 'all' = everything but hush."""
    b, wb = C['bolt'], C['waveBreak']
    return [
        (b, s0('s03'), 'music', -200),                    # the music cut dead on the strike
        (C['notch'] - 0.25, C['notch'], 'music', -26),     # the held breath before the CLUNK
        (C['notch'] - 0.25, C['notch'], 'fx', -8),
        (wb - 0.32, wb, 'all', -60),                       # the sea inhales
        (wb, s0('s21'), 'music', -200),                    # no music between the break and the surf
    ]


def gate_env(group):
    g = np.ones(N)
    for a, b, grp, floor in windows():
        if grp not in (group, 'all'):
            continue
        ia, ib = secs(a), secs(b)
        f = db(floor)
        e = np.full(ib - ia, f)
        dn = min(ib - ia, secs(0.004))
        e[:dn] = np.linspace(1.0, f, dn)
        up = min(ib - ia, secs(0.0008))
        e[-up:] = np.linspace(f, 1.0, up)
        g[ia:ib] = np.minimum(g[ia:ib], e)
    return g


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


def momentary(x):
    k = kweight(x)
    nn, hh = secs(0.4), secs(0.05)
    ms = np.array([np.mean(k[i:i + nn] ** 2, 0).sum() for i in range(0, len(k) - nn + 1, hh)])
    return np.arange(len(ms)) * 0.05 + 0.2, -0.691 + 10 * np.log10(ms + 1e-12)


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
    up = np.abs(signal.resample_poly(x, 4, 1, axis=0)).max(1)
    pk = up.reshape(-1, 4).max(1)[:len(x)]
    if len(pk) < len(x):
        pk = np.pad(pk, (0, len(x) - len(pk)))
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


def seg_table():
    """Emotion map as loudness at -16 LUFS integrated: (t0, t1, target LUFS, measure).
    'p70' = 70th percentile of momentary loudness (the body of the scene, robust to single hits), 'max' = loudest 400 ms.
    Boundaries sit on shot cuts or cues."""
    c = C
    return [
        (0.0, c['bolt'], -16.0, 'p70'), (c['bolt'], s0('s03'), -9.5, 'max'), (s0('s03'), s0('s04'), -22, 'p70'),
        (s0('s04'), s0('s05'), -25, 'p70'), (s0('s05'), s0('s06'), -24.5, 'p70'), (s0('s06'), s0('s07'), -19, 'p70'),
        (s0('s07'), c['matchStrike'], -21.5, 'p70'), (c['matchStrike'], c['pushStart'], -19.5, 'p70'), (c['pushStart'], c['swellRise'], -17, 'p70'),
        (c['swellRise'], s0('s11'), -16.5, 'p70'), (s0('s11'), s0('s12'), -20, 'p70'), (s0('s12'), c['notch'] - 0.25, -14, 'p70'),
        (c['notch'], c['sweepStart'], -11.0, 'max'), (c['sweepStart'], s0('s14'), -12.5, 'p70'), (s0('s14'), s0('s16'), -14.5, 'p70'),
        (s0('s16'), s0('s17'), -13.0, 'p70'), (s0('s17'), s0('s18'), -17, 'p70'), (s0('s18'), s0('s19'), -13.5, 'p70'),
        (s0('s19'), c['waveBreak'] - 0.32, -12.5, 'p70'), (c['waveBreak'], c['waveBreak'] + 0.9, -8.5, 'max'),
        (c['waveBreak'] + 0.9, s0('s21'), -15.5, 'p70'), (s0('s21'), s0('s22'), -12.5, 'p70'), (s0('s22'), c['pierBump'], -22.5, 'p70'),
        (c['pierBump'], s0('s24'), -16.5, 'p70'), (s0('s24'), s0('s25'), -14, 'p70'), (s0('s25'), s0('s26'), -20.5, 'p70'),
        (s0('s26'), s0('s27'), -19.5, 'p70'), (s0('s27'), s0('s28'), -21.5, 'p70'), (s0('s28'), DUR, -25, 'p70'),
    ]


MUSIC_AT_SWEEP = -11.5


def master_eq(x):
    """Tame the storm's sub: 30 Hz high-pass (24 dB/oct) and a ~-4 dB shelf below 80 Hz. Applied before the gates."""
    y = hp(x, 30, 4)
    return y - 0.4 * lp(y, 80, 2)


def premix():
    """Reverbs per space, perspective on the exterior world, groups. Returns {'music', 'fx', 'hush'} stereo arrays."""
    log('reverbs + perspective')
    hall = make_ir(3.4, 2.8, 1.6, 77, predelay=0.025)
    tower = make_ir(3.2, 3.0, 1.4, 78, predelay=0.03, width=0.9)
    room = make_ir(0.5, 0.35, 0.2, 79, predelay=0.006, width=0.6)
    lamp = make_ir(1.3, 1.1, 0.7, 80, predelay=0.01, width=0.9)
    out = make_ir(1.6, 1.2, 0.6, 81, predelay=0.02, width=1.0)
    # the hall is convolved per stretch between the hard music cuts, and each stretch's tail dies at the next cut:
    # no reverb tail of the race may leak back in when the music returns with the surf (and the same at the bolt)
    hard = [(a, b) for a, b, grp, fl in windows() if grp == 'music' and fl <= -100]
    edges = [0] + [secs(a) for a, b in hard] + [N]
    starts = [0] + [secs(b) for a, b in hard]
    wet = np.zeros((N, 2))
    for k in range(len(hard) + 1):
        dry = np.zeros((N, 2))
        dry[starts[k]:edges[k + 1]] = B['rv_hall'][starts[k]:edges[k + 1]]
        w = convolve(dry, hall)
        if k < len(hard):
            w[edges[k + 1]:] = 0.0
        wet += w
    music = sum(B[k] for k in MUSIC) + wet * 0.32
    ref = loud_mom(music[secs(C['sweepStart']):secs(s1('s13'))])
    music *= db(MUSIC_AT_SWEEP - ref)
    log(f'music group {MUSIC_AT_SWEEP - ref:+.1f} dB (sweep at {MUSIC_AT_SWEEP} LUFS)')
    # exterior world through the camera's perspective (filter ladder switched at each cut)
    ride = db(shot_env(BED_RIDE, 0.0, 0.03))[:, None]
    ext = (B['ext'] + convolve(B['rv_out'], out) * 0.4) * ride + B['sky']     # thunder is never ridden down
    cuts = sorted(set(v[0] for v in PERSP.values()))
    vers = {f: (lp(lp(ext, f, 2), f, 2) if f < 20000 else ext) for f in cuts}
    pe = np.zeros((N, 2))
    for s in SHOTS:
        f, g = PERSP[s['set']]
        a, b = secs(s['start']), secs(s['end'])
        xf = secs(0.006)
        a0, b0 = max(0, a - xf), min(N, b + xf)
        w = np.ones(b0 - a0)
        if a0 < a:
            w[:a - a0 + xf] = np.linspace(0, 1, a - a0 + xf)
        if b0 > b:
            w[-(b0 - b + xf):] = np.linspace(1, 0, b0 - b + xf)
        pe[a0:b0] += vers[f][a0:b0] * (db(g) * w)[:, None]
    fx = pe + B['int'] * ride + B['hit'] + B['gear'] + B['panel']
    fx += convolve(B['rv_tower'], tower) * 0.45 + convolve(B['rv_room'], room) * 0.4 + convolve(B['rv_lamp'], lamp) * 0.4
    hush = B['hush']
    # high-pass before the gates, so no filter ringing leaks into the silences
    return {'music': master_eq(music), 'fx': master_eq(fx), 'hush': hush}


def assemble(G, trims, music_db=0.0, fx_db=0.0):
    segs = seg_table()
    cuts = {round(sh['start'], 3) for sh in SHOTS} | {round(C['bolt'], 3), round(C['notch'], 3), round(C['waveBreak'], 3)}
    pts = []
    for (a, b, _, _), v in zip(segs, trims):
        ra = 0.012 if round(a, 3) in cuts else 0.3       # level moves are hidden in cuts; elsewhere they ride slowly
        rb = 0.012 if round(b, 3) in cuts else 0.3
        pts += [(a + ra, v), (b - rb, v)]
    tr = db(env_points(N, pts))[:, None]
    duck = np.zeros(N)
    for t, d, ln in DUCKS:
        a, b = secs(t - 0.05), min(N, secs(t + ln))
        u = np.arange(b - a) / SR
        duck[a:b] = np.minimum(duck[a:b], -d * np.minimum(1, u / 0.05) * np.clip((ln - u) / (ln * 0.7), 0, 1))
    mix = G['music'] * db(music_db + duck)[:, None] * gate_env('music')[:, None] + G['fx'] * db(fx_db) * gate_env('fx')[:, None]
    mix = mix * tr + G['hush']
    # the picture closes to black over the last 0.35 s: so does the sound (no fade at the start: the storm is on sample 0)
    mix *= env_points(N, [(0, 1), (DUR - 0.35, 1), (DUR, 0)])[:, None]
    return mix


def calibrate(G):
    segs = seg_table()
    trims = [0.0] * len(segs)
    for it in range(8):
        mix = assemble(G, trims)
        g = db(-16 - lufs(mix))
        tt, mom = momentary(mix * g)
        worst = 0.0
        for i, (a, b, target, how) in enumerate(segs):
            sel = (tt >= a + 0.2 - 1e-6) & (tt <= b - 0.2 + 1e-6)
            if not sel.any():
                sel = (tt >= a) & (tt <= b)
            m = mom[sel].max() if how == 'max' else np.percentile(mom[sel], 70)
            dv = float(np.clip(target - m, -10, 10))
            trims[i] = float(np.clip(trims[i] + dv * 0.8, -8, 8))
            worst = max(worst, abs(dv))
        log(f'  calibrate {it}: worst segment error {worst:.1f} dB')
        if worst < 0.6:
            break
    log('segment trims (dB): ' + ', '.join(f'{a:g}:{v:+.1f}' for (a, b, _, _), v in zip(segs, trims)))
    json.dump({'segments': segs, 'trims': trims}, open(os.path.join(CACHE, 'trims.json'), 'w'))
    return assemble(G, trims), trims


def finalize(mix, target=-16.0):
    log('loudness + limiter')
    y = mix.copy()
    for it in range(5):
        L = lufs(y)
        y = y * db(target - L)
        low = lp(lp(y, 140, 2), 140, 2)
        y = (y - low) + softclip(low, db(-8.0))
        y = softclip(y, db(-4.0))
        y, gr = limiter(y, -2.0)
        L2 = lufs(y)
        log(f'  iter {it}: {L:.2f} -> {L2:.2f} LUFS, max GR {gr:.1f} dB')
        if abs(L2 - target) < 0.1:
            break
    a_ = np.abs(mix).max(1) * db(target - lufs(mix))
    np.save(os.path.join(CACHE, 'master_gain.npy'), (np.abs(y).max(1) + 1e-9) / (a_ + 1e-9))
    r = rng(4242)
    d = (r.random(y.shape) - r.random(y.shape)) / 32768
    y16 = np.clip(np.round((y + d) * 32767), -32768, 32767).astype(np.int16)[:N]
    assert len(y16) == N
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    sf.write(OUT, y16, SR, subtype='PCM_16')
    log('wrote', OUT, f'{len(y16) / SR:.4f} s', f'LUFS {lufs(y):.2f}', f'TP {20 * np.log10(true_peak(y)):.2f} dBTP')
    return y


if __name__ == '__main__':
    sc_hook()
    sc_dread()
    sc_spiral()
    sc_lamp()
    sc_strain()
    sc_hope()
    sc_terror()
    sc_release()
    sc_home()
    sc_dawn()
    gust = fx_storm()
    fx_thunder()
    fx_hits()
    fx_gear()
    fx_interiors(gust)
    fx_boats()
    fx_inhale()
    fx_dawn()
    json.dump(NOTES, open(os.path.join(HERE, 'notes.json'), 'w'))
    json.dump(sorted(EVENTS), open(os.path.join(HERE, 'events.json'), 'w'))
    if os.environ.get('DEBUG_STEMS'):
        np.savez(os.path.join(CACHE, 'buses.npz'), **{k: v.astype(np.float32) for k, v in B.items() if not k.startswith('rv_')})
    G = premix()
    mix, trims = calibrate(G)
    y = finalize(mix)
    # stems for the analyser: the dry hit bus, the gear bus, the gated music group (post-gate, pre-master scale)
    hs = {f'hit_{k}': v[1].astype(np.float32) for k, v in HIT_STEMS.items()}
    json.dump({k: v[0] for k, v in HIT_STEMS.items()}, open(os.path.join(CACHE, 'hit_offsets.json'), 'w'))
    np.savez_compressed(os.path.join(CACHE, 'stems.npz'), hit=B['hit'].astype(np.float32), gear=B['gear'].astype(np.float32), **hs,
                        music=(G['music'] * gate_env('music')[:, None]).astype(np.float32),
                        fx=(G['fx'] * gate_env('fx')[:, None]).astype(np.float32))
    log('done')
