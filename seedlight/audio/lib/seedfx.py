"""SEEDLIGHT's own designed sounds. Everything here is synthesised (a few layer a CC0 drum/anvil/gong sample from sfx.P).
Every function returns audio whose ONSET IS SAMPLE 0 (so render.py can lock it to a cue), stereo (n, 2) unless marked mono."""
import math
import numpy as np
from dsp import (SR, secs, white, pink, brown, smooth_noise, lp, hp, bp, reson, pan, env_points, db, modal, sine_sweep, rng,
                 fade, sweep_lp)
from sfx import (S, norm, st, expenv, grains, add_at, thump, stone_crunch, grinding_crack, debris_rattle, steam_burst,
                 metal_groan, dust_roar)


def nz2(n, seed, kind=white):
    return np.stack([kind(n, seed), kind(n, seed + 1)], 1)


def buf(dur):
    return np.zeros((secs(dur), 2))


def panmove(x, p):
    """Mono x with a per-sample pan p in [-1, 1] -> stereo (constant power)."""
    a = (np.clip(p, -1, 1) + 1) * math.pi / 4
    return np.stack([x * np.cos(a), x * np.sin(a)], 1)


# ------------------------------------------------------------------ porcelain
def ceramic(f0=900.0, T=0.12, seed=0):
    """One porcelain contact (mono): a 2 ms click through an inharmonic, quickly damped plate."""
    n = secs(T * 3 + 0.05)
    r = rng(seed)
    exc = np.zeros(n)
    m = secs(0.002)
    exc[:m] = r.standard_normal(m) * np.linspace(1, 0, m)
    ratios = np.array([1, 1.59, 2.32, 3.14, 4.6, 6.3, 8.9]) * (1 + r.uniform(-0.03, 0.03, 7))
    y = modal(exc, f0 * ratios, T * np.array([1, .8, .6, .45, .3, .2, .12]), [1, .8, .7, .5, .4, .3, .2])
    return norm(y + exc * 0.02)


def metal(freqs, T=0.3, seed=0):
    """Struck sheet/link metal (mono)."""
    n = secs(T * 3 + 0.05)
    r = rng(seed)
    exc = np.zeros(n)
    m = secs(0.0015)
    exc[:m] = r.standard_normal(m)
    f = np.array(freqs) * (1 + r.uniform(-0.04, 0.04, len(freqs)))
    return norm(modal(exc, f, T * np.linspace(1, 0.3, len(f)), np.linspace(1, 0.4, len(f))))


def shatter(dur=1.2, seed=0, flo=500, fhi=4000, count=40, tau=0.3):
    """Porcelain breaking: a cascade of plate contacts, the first at t = 0."""
    out = buf(dur + 0.7)
    r = rng(seed)
    for k in range(count):
        t = min(dur, r.exponential(tau)) if k else 0.0
        f = math.exp(r.uniform(math.log(flo), math.log(fhi)))
        c = ceramic(f, r.uniform(0.03, 0.16), seed * 100 + k)
        add_at(out, pan(c * math.exp(r.normal(0, 0.5)) * 0.3 * math.exp(-t / dur), r.uniform(-0.8, 0.8)), t)
    return out


def iris_open(seed=1):
    """A round ceramic/glass shutter: blades clicking open faster and faster, a glass 'shing', a soft low bloom."""
    out = buf(1.4)
    ts = [0, .055, .1, .14, .172, .198, .22]
    for k, t in enumerate(ts):
        add_at(out, pan(ceramic(1700 + 190 * k, 0.035, seed + k) * (0.5 + 0.07 * k), -0.2 + 0.07 * k), t)
    n = secs(1.1)
    sh = reson(white(n, seed + 20), 4186, 40) * expenv(n, 0.02, 0.5) + 0.3 * reson(white(n, seed + 21), 6272, 50) * expenv(n, 0.02, 0.3)
    add_at(out, st(norm(sh) * 0.45, 0.8, seed), 0.2)
    add_at(out, st(thump(95, 55, 0.3, 0.9, seed) * 0.35, 0), 0.2)
    return out


def iris_close(seed=2):
    """The iris going out: the shutter closes slowing down, and a glass tone sinks a fifth and dies."""
    out = buf(1.8)
    ts = [0, .04, .09, .15, .23, .34, .5]
    for k, t in enumerate(ts):
        add_at(out, pan(ceramic(2800 - 200 * k, 0.04, seed + k) * (0.8 - 0.08 * k), 0.1 - 0.05 * k), t)
    n = secs(1.6)
    tt = np.arange(n) / SR
    f = 1760 * 2 ** (-7 / 12 * np.clip(tt / 1.2, 0, 1) ** 0.7)
    y = (sine_sweep(f, seed) + 0.5 * sine_sweep(f * 1.003, seed + 1) + 0.2 * sine_sweep(f * 2.01, seed + 2)) * expenv(n, 0.01, 1.3)
    add_at(out, st(y * 0.3, 0.6, seed), 0.0)
    return out


def scrape(dur=0.9, seed=3):
    """Porcelain fingers dragged over stone flags: stick-slip grit plus tiny plate ticks."""
    n = secs(dur)
    e = env_points(n, [(0, 0), (0.015, 1), (dur * 0.6, 0.8), (dur, 0)])
    ss = np.abs(smooth_noise(n, 45, seed)) ** 1.5
    y = bp(nz2(n, seed + 1), 700, 3800) * (ss * e)[:, None] * 0.8
    y += bp(nz2(n, seed + 3, brown), 90, 420) * (e * (0.4 + 0.6 * ss))[:, None] * 0.6
    y += grains(dur, lambda t: 35, seed + 5, 1500, 5200, (0.002, 0.008), (8, 22)) * 0.6 * e[:, None]
    return y


def chain(dur=1.1, seed=4):
    """A rusted chain sliding off and dropping: links clinking, then the heap."""
    out = buf(dur + 0.8)
    r = rng(seed)
    for k in range(20):
        t = dur * (k / 20) ** 0.75
        m = metal([1900, 3100, 4500, 6200], r.uniform(0.04, 0.1), seed * 50 + k)
        add_at(out, pan(m * r.uniform(0.3, 0.8), r.uniform(-0.2, 0.6)), t)
    y = bp(nz2(secs(dur), seed + 9), 900, 5000) * env_points(secs(dur), [(0, 0), (0.05, 0.25), (dur, 0.1)])[:, None]
    out[:len(y)] += y * 0.25
    add_at(out, st(thump(90, 48, 0.12, 0.5, seed) * 0.7, 0), dur)
    for k in range(5):
        add_at(out, pan(metal([1500, 2600, 3900], 0.12, seed * 70 + k) * 0.6, 0.3), dur + 0.02 * k)
    return out


def lamp_drop(seed=5):
    """A tin hand lamp hits the flags, bounces twice and rolls in a slowing wobble."""
    out = buf(2.2)
    for k, (t, g) in enumerate([(0, 1.0), (0.24, 0.55), (0.39, 0.35), (0.48, 0.2)]):
        hit = metal([690, 1130, 1870, 2600, 3900], 0.16, seed + k) * g
        add_at(out, pan(hit, 0.15), t)
        add_at(out, pan(ceramic(3300, 0.03, seed + 10 + k) * g * 0.4, 0.2), t)
        add_at(out, lp(S('anvil_soft', 1.9, 0.3), 5000) * 0.25 * g, t)
    n = secs(1.5)
    tt = np.arange(n) / SR
    rate = 13 * np.exp(-tt / 0.6) + 2.5
    ph = np.cumsum(rate / SR) * 2 * np.pi
    roll = reson(white(n, seed + 30), 950, 5) + 0.5 * bp(white(n, seed + 31), 400, 2600)
    roll = norm(roll) * (0.35 + 0.65 * np.sin(ph) ** 2) * np.exp(-tt / 0.55)
    add_at(out, panmove(roll * 0.4, np.linspace(0.15, 0.6, n)), 0.52)
    return out


def body_rise(dur=1.8, seed=6):
    """The heavy servo-less ceramic body pushing itself up: stone grinding, deep plate creaks, rubble pouring off."""
    out = buf(dur + 2.2)
    add_at(out, lp(grinding_crack(dur, seed, 1.0), 1800) * 0.9, 0)
    r = rng(seed)
    for k in range(9):
        t = dur * (k / 9) ** 0.9 + (0 if k == 0 else r.uniform(0, 0.06))
        add_at(out, pan(lp(ceramic(r.uniform(120, 260), 0.3, seed * 9 + k), 1600) * r.uniform(0.5, 1), r.uniform(-0.4, 0.4)), t)
    add_at(out, debris_rattle(dur + 1.6, seed + 2, 0.8, 1.4), 0.25)
    n = len(out)
    out += lp(nz2(n, seed + 4, brown), 110) * env_points(n, [(0, 0), (0.3, 0.7), (dur, 0.6), (dur + 1.2, 0)])[:, None] * 0.5
    return out


def arm_crash(seed=7):
    """Its torn-off arm hits the vault floor: mass, a deep plate bong, porcelain shattering, rubble."""
    out = buf(3.2)
    out += st(thump(78, 27, 0.6, 3.2, seed) * 1.5, 0)
    add_at(out, S('bd_vsco_fff', 0.7) * 1.0, 0)
    add_at(out, S('bd2_ff', 0.75) * 0.7, 0.004)
    add_at(out, stone_crunch(1.5, seed + 1, 1.1, 1.2), 0)
    add_at(out, pan(lp(ceramic(150, 0.55, seed + 2), 2200) * 0.9, 0.1), 0)
    add_at(out, shatter(1.1, seed + 3, 350, 3600, 46, 0.22) * 0.9, 0.005)
    add_at(out, debris_rattle(2.4, seed + 4, 0.6, 1.2), 0.2)
    return out


def tear(dur=0.45, seed=8):
    """Copper staples letting go at the shoulder (ends where the arm drops)."""
    n = secs(dur)
    y = grains(dur, lambda t: 30 + 260 * (t / dur) ** 2, seed, 500, 5000, (0.003, 0.012), (5, 18))
    y += bp(nz2(n, seed + 1), 200, 1500) * env_points(n, [(0, 0), (dur, 0.5)])[:, None] * 0.4
    return y


def rifle(seed=9):
    """One carbine shot in a stone vault (mono)."""
    n = secs(0.5)
    y = hp(white(n, seed), 1800) * expenv(n, 0.0004, 0.035) * 1.0
    y += bp(white(n, seed + 1), 160, 1100) * expenv(n, 0.001, 0.11) * 0.9
    y += thump(170, 70, 0.07, 0.5, seed) * 0.8
    return norm(np.tanh(y * 1.5))


def ricochet(seed=10):
    """A ball glancing off porcelain: a plate tick and a falling whine (mono)."""
    r = rng(seed)
    n = secs(0.5)
    tt = np.arange(n) / SR
    f0 = r.uniform(3000, 5200)
    f = f0 * (0.42 + 0.58 * np.exp(-tt / 0.16)) * (1 + 0.012 * np.sin(2 * np.pi * 38 * tt))
    y = sine_sweep(f, seed) * expenv(n, 0.002, 0.3) * 0.6
    c = ceramic(r.uniform(1800, 2900), 0.035, seed + 1)
    y[:len(c)] += c[:n] * 0.9
    return y


def ray_tone(dur, seed=11, f=2637.0, rise=0.03):
    """THE RAY: a thin singing glass tone (a wet finger on a glass rim), not a zap. Mono; onset at 0, release after dur."""
    n = secs(dur + 0.3)
    tt = np.arange(n) / SR
    ff = f * (1 + rise * np.clip(tt / dur, 0, 1))
    y = np.zeros(n)
    for k, (m, g) in enumerate([(1, 1.0), (1.0017, 0.7), (1.4983, 0.22), (2.004, 0.16), (2.99, 0.05)]):
        y += sine_sweep(ff * m, seed + k) * g
    am = 1 + 0.13 * np.sin(2 * np.pi * 8.7 * tt) + 0.1 * smooth_noise(n, 14, seed + 9)
    e = env_points(n, [(0, 0), (0.004, 1), (dur, 0.95), (dur + 0.25, 0), (dur + 0.3, 0)])
    y = y * am * e
    c = ceramic(f, 0.22, seed + 20)
    y[:min(n, len(c))] += c[:n] * 0.7
    y += hp(white(n, seed + 30), 7500) * e * 0.035
    return y / 2.2


def sizzle(dur, seed=12):
    """The line it drew glows and sags: rising hiss, crackle, metal giving."""
    n = secs(dur)
    e = env_points(n, [(0, 0.15), (dur, 1)]) ** 1.5
    y = hp(nz2(n, seed), 3000) * e[:, None] * 0.35
    y += grains(dur, lambda t: 20 + 90 * (t / dur), seed + 2, 1200, 7000, (0.002, 0.008), (6, 20)) * 0.5
    g = metal_groan(dur, seed + 4, 0.7, 0.8)
    y[:len(g)] += g[:n] * 0.5 * e[:len(g), None]
    return fade(y, 0.02, 0.01)


def door_burst(seed=13):
    """The iron door bursting outward in molten sheets."""
    out = buf(3.4)
    out += st(thump(92, 28, 0.55, 3.4, seed) * 1.5, 0)
    add_at(out, S('bd2_ff', 0.7) * 1.0, 0)
    add_at(out, lp(S('gong_smack_low', 0.7), 2600) * 0.8, 0.002)
    add_at(out, S('anvil', 0.42) * 0.5, 0.004)
    m = secs(0.5)
    out[:m] += hp(nz2(m, seed + 1), 1500) * expenv(m, 0.001, 0.2)[:, None] * 0.6
    add_at(out, steam_burst(2.0, seed + 2) * 0.6, 0.02)
    add_at(out, stone_crunch(1.2, seed + 3, 0.7), 0.01)
    for k, t in enumerate([0.14, 0.33, 0.58, 0.95]):
        sheet = metal([190 + 30 * k, 347, 512, 790, 1130, 1700], 0.7, seed + 10 + k)
        add_at(out, pan(sheet * (0.8 - 0.15 * k), 0.5 - 0.3 * k), t)
    add_at(out, debris_rattle(2.4, seed + 5, 0.5), 0.2)
    return out


def fans_open(seed=14):
    """Ribbed copper fans snapping open like hand fans: a fast ratchet of ribs, an air slap, a copper 'chank'. Twice."""
    out = buf(1.3)
    for j, (t0, pitch, g) in enumerate([(0.0, 1.0, 1.0), (0.31, 0.78, 0.9)]):
        for k in range(13):
            t = t0 + 0.2 * (k / 13) ** 0.8
            add_at(out, pan(metal([1500 * pitch, 2450 * pitch, 3900 * pitch], 0.03, seed + 20 * j + k) * (0.35 + 0.04 * k) * g,
                            -0.3 + 0.6 * j), t)
        n = secs(0.3)
        w = bp(nz2(n, seed + 40 + j), 500, 5200) * env_points(n, [(0, 0.3), (0.17, 1), (0.22, 0.5), (0.3, 0)])[:, None]
        add_at(out, w * 0.5 * g, t0)
        add_at(out, pan(metal([610 * pitch, 955 * pitch, 1480 * pitch, 2210 * pitch, 3300 * pitch], 0.3, seed + 60 + j) * g,
                        -0.3 + 0.6 * j), t0 + 0.215)
    return out


def whoosh(dur, seed=15, f0=300, f1=3200, peak=0.5, tail=0.3):
    """Air rush: band noise whose brightness and level swell to `peak` (fraction of dur) and fall away."""
    n = secs(dur)
    tt = np.arange(n) / SR / dur
    e = np.where(tt < peak, (tt / peak) ** 2, np.exp(-(tt - peak) / tail))
    y = sweep_lp(hp(nz2(n, seed, pink), 150), f0 + (f1 - f0) * e) * e[:, None]
    return fade(y, 0.002, 0.05)


def leap(seed=16, dur=1.5):
    """Push-off, then the rush up the well shaft straight past camera (fans fluttering)."""
    out = buf(dur + 0.3)
    out += st(thump(85, 34, 0.3, dur + 0.3, seed) * 1.0, 0)
    add_at(out, stone_crunch(0.7, seed + 1, 0.6), 0)
    w = whoosh(dur, seed + 2, 250, 4200, 0.38, 0.22)
    tt = np.arange(len(w)) / SR
    w *= (1 + 0.35 * np.sin(2 * np.pi * 19 * tt))[:, None]
    out[:len(w)] += w * 1.3
    return out


def cap_burst(seed=17):
    """The well cap blown upward: a stone explosion, slabs landing, a column of dust."""
    out = buf(4.5)
    out += st(thump(84, 25, 0.75, 4.5, seed) * 1.6, 0)
    add_at(out, S('bd_vsco_fff2', 0.6) * 1.1, 0)
    add_at(out, S('bd2_ff', 0.66) * 0.9, 0.003)
    m = secs(0.6)
    out[:m] += hp(nz2(m, seed + 1), 900) * expenv(m, 0.001, 0.22)[:, None] * 0.7
    add_at(out, stone_crunch(2.0, seed + 2, 1.3), 0)
    add_at(out, dust_roar(3.4, seed + 3) * 0.45, 0.05)
    add_at(out, debris_rattle(3.4, seed + 4, 0.8, 1.6), 0.25)
    return out


def landing(seed=18, big=1.0):
    """Six metres of porcelain landing on flagstones (knee and hand)."""
    out = buf(2.2)
    out += st(thump(72, 29, 0.45 * big, 2.2, seed) * 1.4, 0)
    add_at(out, S('bd2_f', 0.7) * 0.9, 0)
    add_at(out, stone_crunch(1.0, seed + 1, 1.0, 1.3), 0)
    add_at(out, pan(lp(ceramic(210, 0.32, seed + 2), 2500) * 0.6, 0), 0)
    add_at(out, pan(ceramic(540, 0.14, seed + 3) * 0.35, 0.3), 0.05)
    add_at(out, debris_rattle(1.4, seed + 4, 0.35), 0.1)
    return out


def siren(f_env, seed=19):
    """A hand-cranked disc siren (mono): hollow pulse tone, uneven with the crank, breathy."""
    n = len(f_env)
    tt = np.arange(n) / SR
    wob = 1 + 0.018 * np.sin(2 * np.pi * 2.3 * tt) + 0.01 * smooth_noise(n, 3, seed)
    ph = np.cumsum(f_env * wob / SR) * 2 * np.pi
    y = np.sin(ph) + 0.55 * np.sin(2 * ph + 0.4) + 0.32 * np.sin(3 * ph + 1.1) + 0.2 * np.sin(4 * ph) + 0.1 * np.sin(6 * ph)
    y *= 1 + 0.14 * np.sin(2 * np.pi * 2.3 * tt + 1.0)
    y += bp(white(n, seed + 1), 600, 3000) * 0.12
    return lp(y, 3200) / 2.0


def clunk(seed=20):
    """A searchlight's knife switch and shutter: a heavy clack, a short arc buzz."""
    out = buf(0.8)
    out += st(thump(130, 62, 0.06, 0.8, seed) * 0.9, 0)
    add_at(out, lp(S('anvil_soft', 0.55, 0.4), 2200) * 0.5, 0)
    add_at(out, pan(metal([420, 760, 1310, 2050], 0.1, seed + 1) * 0.5, 0), 0.001)
    n = secs(0.45)
    tt = np.arange(n) / SR
    bz = (np.sin(2 * np.pi * 100 * tt) + 0.6 * np.sin(2 * np.pi * 300 * tt) + 0.4 * np.sin(2 * np.pi * 700 * tt)) * expenv(n, 0.01, 0.3)
    add_at(out, st(bz * 0.12, 0.3, seed), 0.02)
    return out


def climb_hit(seed=21, big=1.0):
    """A porcelain hand or foot slammed into the tower wall, stone crumbling under the grip."""
    r = rng(seed)
    out = buf(1.8)
    out += st(thump(88, 40, 0.2 * big, 1.8, seed) * 1.1 * big, 0)
    add_at(out, stone_crunch(0.9, seed + 1, 0.9 * big), 0)
    for k, t in enumerate([0, 0.035, 0.08]):
        add_at(out, pan(ceramic(r.uniform(300, 520), 0.11, seed + 2 + k) * 0.5, r.uniform(-0.4, 0.4)), t)
    add_at(out, grains(1.3, lambda t: 70 * math.exp(-t / 0.5) + 6, seed + 7, 300, 3500, (0.004, 0.02), (3, 9)) * 0.7, 0.12)
    return out


def kneel_thud(seed=22):
    """It kneels; the roof shakes."""
    out = buf(2.6)
    out += st(thump(62, 25, 0.65, 2.6, seed) * 1.5, 0)
    add_at(out, S('bd_vsco_ff', 0.6) * 0.9, 0)
    add_at(out, stone_crunch(1.0, seed + 1, 0.6, 1.4), 0)
    add_at(out, pan(lp(ceramic(165, 0.38, seed + 2), 1800) * 0.5, 0), 0)
    add_at(out, grains(1.6, lambda t: 40 * math.exp(-t / 0.6) + 3, seed + 3, 600, 4000, (0.003, 0.012), (4, 12)) * 0.4, 0.15)
    return out


def touch(seed=23):
    """Its one hand laid flat on its own chest plate: a soft, hollow porcelain-on-porcelain contact."""
    out = buf(0.9)
    for k, (t, f, g) in enumerate([(0, 430, 1.0), (0.045, 520, 0.6), (0.085, 610, 0.4)]):
        add_at(out, pan(lp(ceramic(f, 0.16, seed + k), 2600) * g, 0.05 * k), t)
    add_at(out, st(thump(190, 120, 0.08, 0.5, seed) * 0.5, 0), 0)
    return out


def warm_tone(dur=3.2, seed=24, base=62):
    """The crest lighting gold: a glass ping (onset) opening into a warm, slowly beating hum (D major, open)."""
    n = secs(dur)
    tt = np.arange(n) / SR
    y = np.zeros(n)
    for k, (st_, g) in enumerate([(-12, 0.7), (0, 1.0), (7, 0.7), (16, 0.45), (24, 0.15)]):
        f = 440 * 2 ** ((base + st_ - 69) / 12)
        y += (np.sin(2 * np.pi * f * tt) + 0.8 * np.sin(2 * np.pi * f * 1.004 * tt + 1)) * g
    y *= env_points(n, [(0, 0), (0.02, 0.35), (0.5, 1), (dur * 0.6, 0.7), (dur, 0)]) * (1 + 0.06 * np.sin(2 * np.pi * 3.1 * tt))
    ping = np.sin(2 * np.pi * 1480 * tt) * expenv(n, 0.002, 0.9) + 0.4 * np.sin(2 * np.pi * 2960 * tt) * expenv(n, 0.002, 0.4)
    return st(y / 6 + ping * 0.3, 0.7, seed)


def cannon(seed=25, far=False):
    """A cannon report. far = the ironclad's guns across the canyon (deeper, duller, longer)."""
    out = buf(3.0)
    out += st(thump(115, 30, 0.5, 3.0, seed) * 1.5, 0)
    add_at(out, S('bd_vsco_fff', 0.85 if not far else 0.62) * 1.0, 0)
    m = secs(0.5)
    out[:m] += hp(nz2(m, seed + 1), 1400) * expenv(m, 0.0005, 0.04)[:, None] * 0.9
    out[:m] += bp(nz2(m, seed + 3), 140, 1300) * expenv(m, 0.001, 0.2)[:, None] * 0.8
    n = len(out)
    out += lp(nz2(n, seed + 5, brown), 320) * expenv(n, 0.02, 1.6)[:, None] * 0.5
    if far:
        out = lp(out, 2200) + out * 0.12
    return out


def whistle(dur, seed=26, f0=2300.0):
    """An incoming shell (mono): a falling, wavering whistle that swells until impact (ends at dur)."""
    n = max(64, secs(dur))
    tt = np.arange(n) / SR
    u = tt / (n / SR)
    f = f0 * (1 - 0.5 * u ** 1.3) * (1 + 0.012 * smooth_noise(n, 25, seed))
    y = sine_sweep(f, seed) * 0.6 + reson(white(n, seed + 1), f0 * 0.75, 6) * 0.25
    return fade(y * (0.08 + 0.92 * u ** 2.2), 0.01, 0.004)


def shell_burst(seed=27, kind='tower', big=1.0):
    """A shell bursting: on porcelain and copper (kind 'lantern') or on stone (kind 'tower')."""
    out = buf(4.2)
    out += st(thump(88, 23, 0.55 * big, 4.2, seed) * 1.6, 0)
    add_at(out, S('bd_vsco_fff2' if seed % 2 else 'bd_vsco_fff', 0.6 + 0.08 * (seed % 3)) * 1.0, 0)
    add_at(out, S('bd2_ff', 0.68) * 0.8, 0.003)
    m = secs(0.7)
    out[:m] += hp(nz2(m, seed + 1), 1100) * expenv(m, 0.0006, 0.16)[:, None] * 0.9
    n = len(out)
    out += lp(nz2(n, seed + 3, brown), 900) * expenv(n, 0.004, 1.5 * big)[:, None] * 0.7
    if kind == 'lantern':
        add_at(out, shatter(0.9, seed + 5, 400, 4200, 34, 0.2) * 0.8, 0.004)
        add_at(out, pan(lp(ceramic(140, 0.6, seed + 6), 2000) * 0.8, 0), 0)
        add_at(out, pan(metal([230, 390, 610, 940, 1420], 0.8, seed + 7) * 0.5, 0.2), 0.01)
        add_at(out, lp(S('gong_smack_low', 0.8), 3000) * 0.4 * big, 0.0)
    else:
        add_at(out, stone_crunch(1.7, seed + 5, 1.1), 0)
    add_at(out, debris_rattle(3.0, seed + 8, 0.7, 1.4), 0.2)
    return out


def erupt_blast(seed=28, big=1.0):
    """One blast of the running wall of fire: a burst and a tearing fire whoosh."""
    out = shell_burst(seed, 'tower', big)
    w = whoosh(1.8, seed + 20, 300, 5000, 0.12, 0.35)
    out[:len(w)] += w * 0.9
    return out


def fire_bed(n, seed=29):
    """The crown burning: roar, low body, crackle."""
    m1 = 0.65 + 0.35 * smooth_noise(n, 0.7, seed)
    m2 = 0.7 + 0.3 * smooth_noise(n, 2.5, seed + 1)
    y = bp(nz2(n, seed + 2, pink), 140, 1900) * (m1 * m2)[:, None] * 0.6
    y += lp(nz2(n, seed + 4, brown), 170) * m1[:, None] * 0.7
    y += hp(nz2(n, seed + 6), 4500) * (0.5 + 0.5 * smooth_noise(n, 6, seed + 8))[:, None] * 0.05
    dur = n / SR
    cr = grains(dur, lambda t: 16, seed + 9, 900, 7000, (0.002, 0.01), (5, 18), 1.0)
    y[:len(cr)] += cr[:n] * 0.5
    return y


def ship_engine(n, seed=30, sag=None):
    """The ironclad: a deep engine drone with a slow beat, and the chop of four ringed lift rotors."""
    tt = np.arange(n) / SR
    f0 = 37.0 * (1 - 0.07 * (sag if sag is not None else 0)) * (1 + 0.004 * smooth_noise(n, 0.5, seed))
    ph = np.cumsum(np.broadcast_to(f0, (n,)) / SR) * 2 * np.pi
    y = np.zeros(n)
    for k in range(1, 9):
        y += (np.sin(k * ph) + np.sin(k * ph * 1.006 + k)) / k ** 1.1
    y = lp(y, 420) / 3
    chop = (0.5 + 0.5 * np.sin(2 * np.pi * 6.4 * tt)) ** 3
    rot = lp(pink(n, seed + 1), 650) * chop * 0.9 + bp(pink(n, seed + 2), 60, 240) * (0.5 + 0.5 * np.sin(2 * np.pi * 6.4 * tt + 2)) ** 2 * 0.8
    out = st(y + rot * 0.5, 0.5, seed)
    return out


def prop_buzz(n, seed=31, f_env=None):
    """The skiff's small pusher propeller (mono): a reedy two-blade buzz with a canvas flutter."""
    tt = np.arange(n) / SR
    f = (f_env if f_env is not None else np.full(n, 96.0)) * (1 + 0.01 * smooth_noise(n, 5, seed))
    ph = np.cumsum(f / SR) * 2 * np.pi
    y = np.zeros(n)
    for k in range(1, 13):
        y += np.sin(k * ph + 0.7 * k) / k ** 0.85
    y *= 1 + 0.3 * np.sin(2 * np.pi * 23 * tt)
    y = bp(y, 130, 4200) / 3
    y += bp(white(n, seed + 1), 300, 2500) * (0.5 + 0.5 * np.sin(2 * np.pi * 9 * tt)) * 0.12   # canvas
    return y


def hull_fire(seed=32):
    """The cut across the ironclad's hull blooms into fire; the ship groans and lists."""
    out = buf(5.0)
    out += st(thump(74, 28, 0.9, 5.0, seed) * 1.4, 0)
    add_at(out, lp(S('bd_vsco_fff', 0.6), 1800) * 0.9, 0)
    w = whoosh(3.6, seed + 1, 250, 4200, 0.07, 0.4)
    out[:len(w)] += w * 1.1
    g = metal_groan(3.8, seed + 2, 0.6, 1.0)
    add_at(out, g * 0.7, 0.45)
    add_at(out, debris_rattle(2.5, seed + 3, 0.4), 0.3)
    return out


def grab(seed=33):
    """THE CATCH: paws locking on wrists: two quick cloth slaps, a soft thud of weight, the sleeve and the hook bar straining."""
    out = buf(1.4)
    n = secs(0.2)
    out[:n] += bp(nz2(n, seed), 380, 3600) * expenv(n, 0.0015, 0.035)[:, None] * 1.0
    add_at(out, bp(nz2(n, seed + 2), 500, 4500) * expenv(n, 0.0015, 0.03)[:, None] * 0.7, 0.05)
    out += st(thump(150, 78, 0.07, 1.4, seed) * 0.8, 0)
    m = secs(0.5)
    rus = bp(nz2(m, seed + 4), 900, 5200) * (np.abs(smooth_noise(m, 20, seed + 5)) * env_points(m, [(0, 0.6), (0.5, 0)]))[:, None]
    add_at(out, rus * 0.5, 0.02)
    k = secs(0.7)
    r = rng(seed)
    imp = np.zeros(k)
    idx = np.cumsum(r.uniform(0.012, 0.03, 40) * SR).astype(int)
    idx = idx[idx < k]
    imp[idx] = r.uniform(0.3, 1, len(idx))
    creak = modal(imp, [310, 525, 840, 1290], [0.12, 0.1, 0.07, 0.05], [1, .8, .5, .3]) * env_points(k, [(0, 0.3), (0.2, 1), (0.7, 0)])
    add_at(out, st(norm(creak) * 0.35, 0.5, seed), 0.12)
    return out


def lantern_collapse(dur=1.7, seed=34):
    """It comes apart and sinks: heavy plate impacts, porcelain cascading, a long settling rumble."""
    out = buf(dur + 4.0)
    for k, (u, g) in enumerate([(0.0, 0.9), (0.2, 0.7), (0.43, 0.85), (0.68, 0.7), (0.92, 1.0)]):
        t = u * dur
        add_at(out, st(thump(68, 28, 0.45, 2.0, seed + k) * g, 0), t)
        add_at(out, shatter(0.9, seed + 10 + k, 250, 3800, 26, 0.25) * g, t)
        add_at(out, pan(lp(ceramic(120 + 25 * k, 0.5, seed + 30 + k), 1800) * g * 0.7, 0), t)
    add_at(out, lp(grinding_crack(dur, seed + 40, 0.9), 2500), 0)
    add_at(out, debris_rattle(dur + 3.2, seed + 41, 0.9, 1.6), 0.3)
    n = len(out)
    out += lp(nz2(n, seed + 42, brown), 220) * env_points(n, [(0, 0.2), (dur, 1), (dur + 3.5, 0), (dur + 4, 0)])[:, None] * 0.6
    return out


def shimmer(n, seed=35, base=1760.0):
    """The gold thread: a faint high halo of beating glass partials and tiny sparkles (level set by layout.threadOn)."""
    tt = np.arange(n) / SR
    y = np.zeros((n, 2))
    for k, (m, g) in enumerate([(2, 1.0), (3, 0.7), (4, 0.5), (5.04, 0.3), (6.02, 0.2)]):
        for ch in range(2):
            a = 0.5 + 0.5 * smooth_noise(n, 1.7, seed + 10 * k + ch)
            y[:, ch] += np.sin(2 * np.pi * base * m * (1 + 0.0006 * ch) * tt + k + ch) * a * g
    y *= 0.12
    y += grains(n / SR, lambda t: 9, seed + 90, 5000, 11000, (0.002, 0.006), (25, 60), 0.6)[:n] * 0.25
    return y


def iris_hum(n, heat, seed=36):
    """The iris: a low gold hum (heat 1) that hardens to a bright whine when white-hot (heat 2)."""
    tt = np.arange(n) / SR
    gold = np.clip(heat, 0, 1) * (1 - 0.5 * np.clip(heat - 1, 0, 1))
    hot = np.clip(heat - 1, 0, 1)
    y = (np.sin(2 * np.pi * 146.8 * tt) + 0.5 * np.sin(2 * np.pi * 220.4 * tt) + 0.25 * np.sin(2 * np.pi * 293.3 * tt)) * gold * 0.5
    y += (np.sin(2 * np.pi * 1318.5 * tt) + 0.6 * np.sin(2 * np.pi * 1981 * tt) + 0.3 * np.sin(2 * np.pi * 2643 * tt)) * hot * 0.22 \
        * (1 + 0.2 * np.sin(2 * np.pi * 13 * tt))
    return st(y * (1 + 0.05 * smooth_noise(n, 4, seed)), 0.4, seed)
