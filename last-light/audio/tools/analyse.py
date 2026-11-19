"""LAST LIGHT: verify out/soundtrack.wav against the contract and the emotion map.
Run from the project root after render.py:  ~/.venvs/opus_audio/bin/python -I audio/tools/analyse.py
Prints a report, writes out/sound_env.png and audio/analysis.json. Exits non-zero if a hard check fails.

Hard checks: exact length / format; integrated loudness about -16 LUFS; true peak below -1.5 dBFS; storm on sample 0;
every cue hit's attack lands on its CUE within one frame (in the final mix, band-limited) and its source is sample-exact;
the gear clicks follow the beamAz notch table; thunder follows every lightning; the inhale before the break is near-silent;
the break is the loudest moment; no music between the break and Kestrel's surf, music back at the surf; music cut on the bolt;
no D major triad before the pier, D major (no F natural) at the end; silence at the very end.
"""
import os, sys, json, re, subprocess, site
sys.path.append(site.getusersitepackages())
import numpy as np
import soundfile as sf
from scipy import signal

HERE = os.path.dirname(os.path.abspath(__file__))
AUD = os.path.dirname(HERE)
PROJ = os.path.dirname(AUD)
wav = os.path.join(PROJ, 'out', 'soundtrack.wav')
info = sf.info(wav)
x, sr = sf.read(wav, always_2d=True)
mono = x.mean(1)
TL = json.load(open(os.path.join(AUD, 'cache', 'timeline.json')))
C, DUR, FPS = TL['CUES'], float(TL['DURATION']), TL['FPS']
SH = {s['id']: s for s in TL['SHOTS']}
FRAME = 1.0 / FPS
stems = np.load(os.path.join(AUD, 'cache', 'stems.npz'))
GEAR = json.load(open(os.path.join(AUD, 'notches.json')))
notes = json.load(open(os.path.join(AUD, 'notes.json')))
HOFF = json.load(open(os.path.join(AUD, 'cache', 'hit_offsets.json')))
rep, FAIL = {'checks': []}, []


def check(name, ok, detail=''):
    print(('PASS ' if ok else 'FAIL ') + name + ('  ' + detail if detail else ''))
    rep['checks'].append([name, bool(ok), detail])
    if not ok:
        FAIL.append(name)


def dbv(v):
    return float(20 * np.log10(v + 1e-10))


def rms_db(a, b, sig=None):
    s = (x if sig is None else sig)[int(a * sr):int(b * sr)]
    return dbv(np.sqrt(np.mean(s ** 2)))


def peak_db(a, b, sig=None):
    s = (x if sig is None else sig)[int(a * sr):int(b * sr)]
    return dbv(np.abs(s).max())


# ---------------------------------------------------------------------------------------------- format and loudness
p = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', wav, '-af', 'ebur128=peak=true', '-f', 'null', '-'],
                   capture_output=True, text=True, encoding='utf-8', errors='ignore').stderr
tail = p[p.rfind('Summary:'):]
I = float(re.search(r'I:\s+(-?[\d.]+) LUFS', tail).group(1))
LRA = float(re.search(r'LRA:\s+([\d.]+) LU', tail).group(1))
TP = float(re.search(r'Peak:\s+(-?[\d.]+) dBFS', tail).group(1))
rep.update(integrated=I, lra=LRA, true_peak=TP, duration=len(x) / sr, sr=sr)
print(f'integrated {I} LUFS, LRA {LRA} LU, true peak {TP} dBFS, {len(x) / sr:.4f} s, {sr} Hz, {info.subtype}, {x.shape[1]} ch')
check(f'length exactly DURATION {DUR} s', len(x) == round(DUR * 48000), f'{len(x)} samples')
check('48 kHz stereo 16-bit', sr == 48000 and x.shape[1] == 2 and info.subtype == 'PCM_16')
check('integrated about -16 LUFS (+-0.5)', abs(I + 16) <= 0.5, str(I))
check('true peak below -1.5 dBFS', TP < -1.5, str(TP))
first = peak_db(0, 0.01)
check('the storm is already there on sample 0 (no fade in)', first > -40, f'peak in first 10 ms {first:.1f} dB')
endr = rms_db(DUR - 0.01, DUR)
check('silent at the very end', endr < -55, f'last 10 ms {endr:.1f} dB')

# momentary loudness (400 ms, 50 ms hop), time = window centre
_b1, _a1 = [1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585]
_b2, _a2 = [1, -2, 1], [1, -1.99004745483398, 0.99007225036621]
kx = signal.lfilter(_b2, _a2, signal.lfilter(_b1, _a1, x, axis=0), axis=0)
n4, h4 = int(0.4 * sr), int(0.05 * sr)
tm = np.arange(0, len(x) - n4 + 1, h4) / sr + 0.2
mom = np.array([-0.691 + 10 * np.log10(np.mean(kx[i:i + n4] ** 2, 0).sum() + 1e-12) for i in range(0, len(x) - n4 + 1, h4)])
mom_at = lambda a, b: float(mom[(tm >= a) & (tm <= b)].max())
rep['momentary_max_per_shot'] = {s['id']: round(mom_at(s['start'], s['end']), 1) for s in TL['SHOTS']}
print('\nshot  name        momentary max  RMS')
for s in TL['SHOTS']:
    print(f"  {s['id']} {s['name']:10s} {mom_at(s['start'], s['end']):7.1f} {rms_db(s['start'], s['end']):7.1f}  {'#' * max(0, int((mom_at(s['start'], s['end']) + 40) / 1.0))}")

# ---------------------------------------------------------------------------------------------- cue hits
HITS = [  # cue, band (Hz) where the hit is characteristic in the mix
    ('bolt', 2000, 12000), ('cupFall', 1800, 9000), ('keyHand', 2500, 9000), ('matchStrike', 1500, 8000),
    ('mantleCatch', 40, 250), ('notch', 40, 400), ('waveBreak', 25, 250), ('sprayHit', 400, 8000), ('pierBump', 50, 250),
]
print('\nCue hits (attack = steepest rise of the band envelope within +-0.1 s; source = first sample above 10% in the hit stem)')
hit = stems['hit'].astype(np.float64).mean(1)


def env_db(sig, lo, hi, smooth_ms=4):
    sos = signal.butter(4, [lo, min(hi, sr / 2 - 100)], 'bandpass', fs=sr, output='sos')
    y = signal.sosfilt(sos, sig)
    w = max(1, int(smooth_ms * sr / 1000))
    e = np.sqrt(np.convolve(y ** 2, np.ones(w) / w, 'same'))
    return 20 * np.log10(e + 1e-9)


rep['hits'] = {}
for cue, lo, hi in HITS:
    t = C[cue]
    a, b = int((t - 0.3) * sr), int((t + 0.15) * sr)
    e = env_db(mono[a:b], lo, hi)
    lag = int(0.01 * sr)
    rise = e[lag:] - e[:-lag]
    w0, w1 = int(0.2 * sr), int(0.4 * sr)          # search t-0.1 .. t+0.1
    k = w0 + int(np.argmax(rise[w0:w1]))
    t_on = (a + k + lag) / sr
    jump = float(rise[k])
    pre = float(np.median(e[int(0.05 * sr):int(0.25 * sr)]))
    post = float(e[k + lag:k + lag + int(0.06 * sr)].max())
    hs = np.abs(stems[f'hit_{cue}'].astype(np.float64))      # the isolated hit, starting 0.2 s before its placement
    src = (np.argmax(hs > 0.1 * hs.max()) / sr) + HOFF[cue]
    err = t_on - t
    print(f'  {cue:12s} t={t:6.2f}  attack {t_on:7.3f} ({1000 * err:+6.1f} ms)  rise {jump:5.1f} dB/10ms  band {pre:6.1f} -> {post:6.1f} dB  source {1000 * (src - t):+5.1f} ms')
    rep['hits'][cue] = dict(t=t, attack=round(t_on, 4), err_ms=round(1000 * err, 1), rise=round(jump, 1), band_jump=round(post - pre, 1))
    check(f'hit {cue} lands on its cue (+-1 frame)', abs(err) <= FRAME, f'{1000 * err:+.1f} ms')
    check(f'hit {cue} source sample-exact (+-2 ms)', abs(src - t) <= 0.002, f'{1000 * (src - t):+.1f} ms')
    check(f'hit {cue} audible in the mix (band rises >= 6 dB)', post - pre >= 6, f'{post - pre:.1f} dB')

# ---------------------------------------------------------------------------------------------- the break
wb = C['waveBreak']
print('\nThe break')
v, pk = rms_db(wb - 0.30, wb - 0.01), peak_db(wb - 0.30, wb - 0.01)
check('inhale before the break is near-silent (rms < -42, peak < -30 dBFS)', v < -42 and pk < -30, f'rms {v:.1f}, peak {pk:.1f}')
top = float(mom.max())
tb = mom_at(wb, wb + 0.7)
check('the break is the loudest moment of the film (within 0.5 LU)', tb >= top - 0.5, f'break {tb:.1f}, film max {top:.1f} at {tm[np.argmax(mom)]:.2f} s')
jump = rms_db(wb, wb + 0.25) - rms_db(wb - 0.12, wb - 0.02)
check('the break rises out of the silence (>= 30 dB)', jump >= 30, f'{jump:.1f} dB')
mus = stems['music'].astype(np.float64)
mref = rms_db(SH['s19']['start'], wb - 0.4, mus)
msil = rms_db(wb + 0.02, SH['s21']['start'] - 0.01, mus)
mrel = rms_db(SH['s21']['start'] + 0.1, SH['s21']['start'] + 1.2, mus)
check('no music between the break and the surf (music stem < race - 60 dB)', msil < mref - 60, f'race {mref:.1f}, gap {msil:.1f} dB')
check('the music returns with the surf (within 8 dB of the race)', mrel > mref - 8, f'{mrel:.1f} dB')
mbolt = rms_db(C['bolt'] + 0.01, SH['s03']['start'] - 0.01, mus)
check('music cut dead on the bolt', mbolt < -90, f'{mbolt:.1f} dB')
hold = rms_db(C['notch'] - 0.24, C['notch'] - 0.01)
pre_h = rms_db(C['notch'] - 0.6, C['notch'] - 0.3)
check('held breath before the CLUNK (>= 6 dB below the climb)', pre_h - hold >= 6, f'{pre_h:.1f} -> {hold:.1f}')

# ---------------------------------------------------------------------------------------------- thunder after lightning
print('\nThunder after lightning (roll band 30-1000 Hz, crack band 2-9 kHz)')
low = signal.sosfilt(signal.butter(4, [30, 1000], 'bandpass', fs=sr, output='sos'), mono)
hop = int(0.1 * sr)
high = signal.sosfilt(signal.butter(4, [2000, 9000], 'bandpass', fs=sr, output='sos'), mono)
band100 = lambda sig, a, b: np.array([dbv(np.sqrt(np.mean(sig[i:i + hop] ** 2))) for i in range(int(a * sr), int(b * sr) - hop + 1, hop // 2)])
for L in TL['LIGHTNING']:
    r = []
    for sig in (low, high):      # far thunder rolls (low band), close thunder cracks (high band)
        a = float(np.median(band100(sig, L - 0.6, L - 0.02)))
        r.append((float(band100(sig, L + 0.05, L + 1.6).max()) - a, a))
    best = max(x[0] for x in r)
    check(f'thunder follows the lightning at {L} (100 ms peak >= 4 dB over the pre-flash body, roll or crack band)', best >= 4,
          f'roll +{r[0][0]:.1f} dB, crack +{r[1][0]:.1f} dB')

# ---------------------------------------------------------------------------------------------- gear clicks
gear = stems['gear'].astype(np.float64).mean(1)
ok, tot, errs = 0, 0, []
for e in GEAR['teeth']:
    t = e['t']
    if abs(t - C['notch']) < 1e-3:
        continue
    seg = np.abs(gear[int((t - 0.01) * sr):int((t + 0.02) * sr)])
    if seg.max() < 1e-5:
        continue
    tot += 1
    on = np.argmax(seg > 0.2 * seg.max()) / sr + t - 0.01
    errs.append(on - t)
    ok += abs(on - t) <= 0.002
print(f'\nGear: {tot} audible tooth clicks, {ok} within 2 ms of the beamAz notch table; median error {1000 * np.median(np.abs(errs)):.2f} ms')
check('gear clicks follow layout.beamAz (all within 2 ms)', tot > 100 and ok == tot, f'{ok}/{tot}')
notch_tooth = GEAR['notch_tooth']['t']
check('the notch tooth of beamAz is CUES.notch (the CLUNK)', abs(notch_tooth - C['notch']) < 1.5 / 960, f'{notch_tooth}')

# ---------------------------------------------------------------------------------------------- harmony (symbolic)
pb = C['pierBump']
dmaj = []
for tt in np.arange(0.0, DUR, 0.05):
    on = {n['midi'] % 12 for n in notes if n['t'] <= tt < n['t'] + n['dur'] and not n['inst'].startswith('timp')}
    if {2, 6, 9} <= on:
        dmaj.append(round(float(tt), 2))
first_dmaj = dmaj[0] if dmaj else None
check('no D major triad before the pier bump', first_dmaj is not None and first_dmaj >= pb - 0.01, f'first D major at {first_dmaj}')
late_f = [n for n in notes if n['midi'] % 12 == 5 and n['t'] + n['dur'] > C['sleep'] - 1.0]
check('the end is D major (no F natural after the last climb)', len(late_f) == 0, str(len(late_f)))
eb = [n for n in notes if n['midi'] % 12 == 3 and n['t'] > pb - 0.01]
check('no Eb (the sea threat) after home', len(eb) == 0, str(len(eb)))

with open(os.path.join(AUD, 'analysis.json'), 'w') as f:
    json.dump(rep, f, indent=1)

# ---------------------------------------------------------------------------------------------- plot
try:
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    fig, (ax, ax2) = plt.subplots(2, 1, figsize=(18, 7.5), dpi=100, gridspec_kw={'height_ratios': [3, 1]}, sharex=True)
    for s in TL['SHOTS']:
        ax.axvspan(s['start'], s['end'], color='#eef1f5' if int(s['id'][1:]) % 2 else '#ffffff', lw=0)
        ax.text((s['start'] + s['end']) / 2, -58, s['id'], ha='center', fontsize=7, color='#667')
    ax.plot(tm, mom, color='#1f5f8b', lw=0.9, label='momentary loudness (LUFS, 400 ms)')
    st = np.arange(0, len(x) - int(3 * sr), int(0.1 * sr))
    stl = [-0.691 + 10 * np.log10(np.mean(kx[i:i + 3 * sr] ** 2, 0).sum() + 1e-12) for i in st]
    ax.plot(st / sr + 1.5, stl, color='#c0392b', lw=1.4, label='short-term loudness (3 s)')
    ax.axhline(-16, color='#999', lw=0.6, ls=':')
    for k, v in C.items():
        if k in ('end',):
            continue
        ax.axvline(v, color='#8a8f98', lw=0.5, ls='--')
        ax.text(v, -2, k, rotation=90, fontsize=6.5, va='top', ha='right', color='#333')
    for L in TL['LIGHTNING']:
        ax.axvline(L, color='#e0b000', lw=1.0, alpha=0.6)
    ax.set_ylim(-60, 0)
    ax.set_ylabel('LUFS')
    ax.set_title(f'LAST LIGHT soundtrack: loudness over the film with cues (integrated {I} LUFS, true peak {TP} dBFS)')
    ax.legend(loc='lower left', fontsize=8)
    ax.grid(alpha=0.2)
    # music vs fx balance
    fx = stems['fx'].astype(np.float64)
    hop = int(0.1 * sr)
    tt = np.arange(0, len(mus) - hop, hop)
    mdb = [dbv(np.sqrt(np.mean(mus[i:i + hop] ** 2))) for i in tt]
    fdb = [dbv(np.sqrt(np.mean(fx[i:i + hop] ** 2))) for i in tt]
    ax2.plot(tt / sr, mdb, color='#7a5195', lw=0.9, label='music stem (dB, pre-master)')
    ax2.plot(tt / sr, fdb, color='#3a8d6e', lw=0.9, label='sfx + storm stem (dB, pre-master)')
    gt = [e['t'] for e in GEAR['teeth']]
    ax2.plot(gt, [-75] * len(gt), '|', color='#b8860b', ms=6, label='gear teeth (beamAz)')
    ax2.set_ylim(-80, max(max(mdb), max(fdb)) + 3)
    ax2.set_xlim(0, DUR)
    ax2.set_xlabel('film seconds')
    ax2.legend(loc='lower left', fontsize=7, ncol=3)
    ax2.grid(alpha=0.2)
    fig.tight_layout()
    fig.savefig(os.path.join(PROJ, 'out', 'sound_env.png'))
    print('\nplot -> out/sound_env.png')
except ImportError:
    print('matplotlib missing: no plot')

print('\nFAILED:' if FAIL else '\nALL CHECKS PASSED', FAIL)
sys.exit(1 if FAIL else 0)
