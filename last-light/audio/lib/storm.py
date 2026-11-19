"""LAST LIGHT sound design: storm, sea, lighthouse machine, boats, dawn.

Every function returns a stereo float buffer (n, 2) that starts at its event time (or covers a bed of `dur` seconds).
All randomness is seeded. Built from filtered noise, modal resonators and a few CC0 percussion samples (sfx.P).
Long beds are vectorised (sparse impulse trains through filters), never per-grain Python loops.
"""
import math
import numpy as np
from dsp import (SR, secs, white, pink, brown, smooth_noise, lp, hp, bp, reson, pan, env_points, db, varispeed,
                 modal, rng, fade, sweep_lp, formant)
import sfx as X
from sfx import S, st, expenv, thump, add_at

PRE = 1.0   # pre-roll for beds so filters are settled on sample 0 (no fade-in: the film opens mid-storm)


def N(key, ratio=1.0, peak=1.0, dur=None):
    x = S(key, ratio, dur)
    return x / (np.abs(x).max() + 1e-12) * peak


def noise2(n, seed, kind=pink):
    return np.stack([kind(n, seed), kind(n, seed + 1)], 1)


def norm_rms(x, rms=0.1):
    return x / (np.sqrt(np.mean(x ** 2)) + 1e-12) * rms


def _bed(n_out, fn):
    """Run fn(n) with a pre-roll and drop it, so beds start settled."""
    p = secs(PRE)
    y = fn(n_out + p)
    return y[p:]


def sparse_impulses(n, rate, seed, sigma=0.9):
    """Poisson impulses with log-normal amplitudes and random sign. rate may be an array (per sample, Hz)."""
    r = rng(seed)
    prob = (rate if np.isscalar(rate) else rate) / SR
    hit = r.random(n) < prob
    a = np.exp(r.normal(0, sigma, n)) * np.sign(r.random(n) - 0.5)
    return np.where(hit, a, 0.0)


# ====================================================================================================================
# STORM BEDS
# ====================================================================================================================
def rain(dur, seed, density=1.0, level_env=None, heavy=1.0):
    """Driving rain on sea and rock: hiss + thousands of drop ticks (band-split) + a low wash. Stereo, decorrelated."""
    n = secs(dur)

    def make(m):
        out = np.zeros((m, 2))
        for ch in range(2):
            s0 = seed + 31 * ch
            hiss = bp(pink(m, s0), 1800, 11000, 2) * 0.55
            drops = np.zeros(m)
            for k, (f, q, rate, g) in enumerate([(1600, 3, 900, 0.5), (2900, 4, 1400, 0.45), (4600, 5, 2000, 0.35),
                                                  (7400, 4, 2600, 0.25), (650, 2, 260 * heavy, 0.9)]):
                imp = sparse_impulses(m, rate * density, s0 + 7 + k, 1.0)
                drops += reson(imp, f, q) * g
            wash = lp(brown(m, s0 + 3), 350) * 0.35 * heavy
            mod = 1 + 0.25 * smooth_noise(m, 0.35, s0 + 9)
            out[:, ch] = (hiss + drops * 0.22 + wash) * mod
        return out
    y = _bed(n, make)
    if level_env is not None:
        y *= level_env[:n, None]
    return norm_rms(y, 0.1) if level_env is None else y / 6.0


def wind(dur, seed, gust, howl=0.0, bright=1.0):
    """Storm wind: broadband roar whose colour follows the gusts, plus (howl > 0) moving whistles through gaps.
    gust: per-sample 0..1.5 control."""
    n = secs(dur)
    g = np.concatenate([np.full(secs(PRE), gust[0]), gust])

    def make(m):
        nz = noise2(m, seed)
        cut = (350 + 1600 * np.clip(g[:m], 0, 1.6) ** 1.3) * bright
        roar = sweep_lp(hp(nz, 70), cut) * (0.45 + 0.75 * g[:m])[:, None]
        low = lp(noise2(m, seed + 4, brown), 120) * (0.3 + 0.6 * g[:m])[:, None]
        y = roar + low * 0.8
        if howl > 0:
            t = np.arange(m) / SR
            for k, (f0, sp, p) in enumerate([(430, 160, -0.5), (660, 220, 0.4), (980, 260, 0.1), (1480, 300, -0.2)]):
                f = f0 + sp * (g[:m] - 0.6) + 25 * smooth_noise(m, 0.7, seed + 20 + k)
                band = lp(white(m, seed + 30 + k), 18, 2) * 9
                tone = band * np.sin(2 * np.pi * np.cumsum(f) / SR)
                amp = np.clip(g[:m] - 0.35, 0, None) ** 1.8 * (0.6 + 0.4 * smooth_noise(m, 0.5, seed + 40 + k))
                y += pan(tone * amp * howl * (0.9 if k < 2 else 0.5), p)
        return y
    return _bed(n, make)


def gust_curve(dur, seed, base=0.75):
    """A storm's gust control: slow swells with sharper peaks."""
    n = secs(dur)
    a = smooth_noise(n, 0.18, seed)
    b = smooth_noise(n, 0.6, seed + 1)
    g = base + 0.35 * a + 0.15 * b
    return np.clip(g, 0.15, 1.5)


def surf(dur, seed, level_env=None, wave_rate=0.35):
    """The storm sea: a constant low roar plus irregular breaking crests (slow attack, long hissing decay)."""
    n = secs(dur)

    def make(m):
        r = rng(seed)
        roar = bp(noise2(m, seed, brown), 55, 420) * 0.7 + bp(noise2(m, seed + 2), 150, 1200) * 0.35
        crest = np.zeros(m)
        t = r.uniform(0, 1.0)
        T = m / SR
        while t < T:
            a = r.uniform(0.25, 0.9)
            att, dec = r.uniform(0.3, 0.9), r.uniform(1.4, 3.2)
            i0, i1 = secs(t), min(m, secs(t + att + dec * 1.5))
            tt = np.arange(i1 - i0) / SR
            e = np.where(tt < att, (tt / att) ** 2, np.exp(-(tt - att) / dec * 2.3))
            crest[i0:i1] += e * a
            t += r.exponential(1 / wave_rate) + 0.6
        crest = np.clip(crest, 0, 1.4)
        cut = 500 + 4500 * crest
        wash = sweep_lp(hp(noise2(m, seed + 5), 160), cut) * crest[:, None]
        return roar + wash * 0.9
    y = _bed(n, make)
    if level_env is not None:
        y *= level_env[:n, None]
    return y


def swell_roar(height, seed):
    """The great swell: a sub-heavy rumble and a deep moving roar that grows with swellHeight (height: per-sample metres)."""
    n = len(height)
    h = np.clip(height / 26.0, 0, 1)

    def make(m):
        hh = np.concatenate([np.zeros(m - n), h])
        sub = lp(noise2(m, seed, brown), 55, 2) * 2.2
        groan = lp(noise2(m, seed + 2, brown), 180) * (0.8 + 0.4 * smooth_noise(m, 0.4, seed + 3))[:, None]
        roar = sweep_lp(bp(noise2(m, seed + 5), 90, 5000), 300 + 2600 * hh ** 1.5) * 0.6
        e = hh ** 1.4
        return (sub + groan + roar) * e[:, None]
    return _bed(n, make)


def thunder(seed, dist=0.5, crack=1.0, dur=6.0):
    """Thunder after a flash. dist 0 = overhead (sharp crack), 1 = far (dull roll)."""
    n = secs(dur)
    r = rng(seed)
    out = np.zeros((n, 2))
    if crack > 0:
        m = secs(0.9)
        for i in range(int(10 + 14 * (1 - dist))):
            t0 = abs(r.normal(0, 0.05)) + (0 if i == 0 else r.uniform(0, 0.35))
            L = secs(r.uniform(0.004, 0.035))
            g = hp(white(L * 4, seed + i), 600 + 1600 * (1 - dist)) * np.exp(-np.arange(L * 4) / L)
            add_at(out, pan(g * r.uniform(0.3, 1.0) * crack * (1.5 if i == 0 else 1), r.uniform(-0.6, 0.6)), t0)
        body = bp(white(m, seed + 50), 120, 2500 + 3000 * (1 - dist)) * expenv(m, 0.004, 0.45)
        add_at(out, st(body * crack, 0.8, seed), 0.0)
    # rolls: three to five overlapping rumbles, the first strongest
    for k in range(int(r.integers(3, 6))):
        t0 = 0.05 + k * r.uniform(0.35, 1.1)
        L = n - secs(t0)
        if L <= 0:
            break
        f = 160 + 300 * (1 - dist) * r.uniform(0.6, 1.0)
        rb = lp(brown(L, seed + 60 + k), f, 2) * expenv(L, r.uniform(0.05, 0.35), r.uniform(1.6, 3.4))
        rb *= 1 + 0.7 * smooth_noise(L, 6, seed + 70 + k)
        add_at(out, st(rb * (2.0 if k == 0 else r.uniform(0.8, 1.6)), 1.0, seed + k), t0)
    sub = thump(48, 26, 1.4, dur, seed) * (1.1 - 0.5 * dist)
    out += st(sub, 0)
    return out / (np.abs(out).max() + 1e-9)


def bolt_strike(seed=500):
    """CUES.bolt: the bolt on the lightning rod: electric snap, overhead crack, immediate boom (direct hit, no delay)."""
    n = secs(4.0)
    out = np.zeros((n, 2))
    m = secs(0.3)
    tt = np.arange(m) / SR
    buzz = (np.sin(2 * np.pi * 117 * tt) > 0.1).astype(float) * 0.7 + 0.3
    z = hp(white(m, seed), 1800) * buzz * expenv(m, 0.0005, 0.12)
    add_at(out, st(z * 0.9, 0.5, seed), 0.0)
    add_at(out, thunder(seed + 1, 0.0, 1.4, 4.0) * 0.9, 0.004)
    add_at(out, S('crash_fff', 0.7) * 0.25, 0.0)
    add_at(out, st(thump(90, 30, 0.7, 3.0, seed + 2) * 0.9, 0), 0.0)
    return out / (np.abs(out).max() + 1e-9)


def glass_burst(seed=520, size=1.0, dur=2.2):
    """Lantern-room panes bursting: a white crash, then ringing shards falling on iron and stone."""
    n = secs(dur)
    r = rng(seed)
    out = np.zeros((n, 2))
    m = secs(0.25)
    crash = hp(white(m, seed), 2500) * expenv(m, 0.0008, 0.09)
    out[:m] += st(crash * 1.2 * size, 0.9, seed)
    k = int(70 * size)
    for i in range(k):
        t0 = r.exponential(0.12) if i < k * 0.6 else r.uniform(0.15, dur * 0.7)
        L = secs(0.6)
        exc = np.zeros(L)
        exc[0] = 1
        exc[:48] += r.standard_normal(48) * 0.3
        f = math.exp(r.uniform(math.log(2600), math.log(9500)))
        y = modal(exc, [f, f * 2.27, f * 3.9], [r.uniform(0.08, 0.35), 0.06, 0.03], [1, 0.5, 0.25])
        a = math.exp(r.normal(0, 0.6)) * 0.25 * (1 - min(0.8, t0 / dur))
        add_at(out, pan(y * a, r.uniform(-0.8, 0.8)), t0)
    return out / (np.abs(out).max() + 1e-9)


# ====================================================================================================================
# LANTERN ROOM
# ====================================================================================================================
def match_strike(seed=600):
    """CUES.matchStrike: scrape on the box, the head flaring, a little sizzle."""
    n = secs(1.4)
    r = rng(seed)
    out = np.zeros((n, 2))
    m = secs(0.11)
    rough = np.clip(0.6 + 0.6 * smooth_noise(m, 180, seed), 0, None)
    scr = bp(white(m, seed + 1), 1400, 7500) * rough * env_points(m, [(0, 0.75), (0.006, 1), (0.08, 0.8), (0.11, 0)])
    add_at(out, pan(scr * 0.9, 0.05), 0.0)
    tk = hp(white(secs(0.004), seed + 9), 2000) * np.exp(-np.arange(secs(0.004)) / secs(0.0008))
    add_at(out, pan(tk * 1.4, 0.05), 0.0)          # the head touching the strip
    # flare: a breathy fffsh that blooms and settles
    L = secs(1.2)
    fl = bp(white(L, seed + 2), 500, 5000) * env_points(L, [(0, 0), (0.03, 1), (0.12, 0.7), (0.5, 0.25), (1.2, 0.0)])
    body = lp(brown(L, seed + 3), 700) * env_points(L, [(0, 0), (0.04, 1), (0.6, 0.3), (1.2, 0)])
    add_at(out, st(fl * 0.55 + body * 0.35, 0.3, seed), 0.075)
    cr = X.grains(0.5, lambda t: 70 * math.exp(-t * 6), seed + 4, 2500, 9000, (0.0005, 0.003), (5, 14), 0.8)
    add_at(out, cr * 0.5, 0.08)
    return out / (np.abs(out).max() + 1e-9)


def mantle_whoomp(seed=620):
    """CUES.mantleCatch: the vapour lights with a soft low whoomp and the burner settles into its roar."""
    n = secs(2.5)
    out = np.zeros((n, 2))
    out += st(thump(120, 44, 0.28, 2.5, seed) * 1.0, 0)
    w = lp(brown(n, seed + 1), 520) * env_points(n, [(0, 0), (0.045, 1), (0.25, 0.5), (1.0, 0.12), (2.5, 0)])
    out += st(w * 1.2, 0.6, seed)
    fl = bp(white(n, seed + 2), 300, 3500) * env_points(n, [(0, 0), (0.05, 0.8), (0.4, 0.3), (2.5, 0.1)])
    out += st(fl * 0.35, 0.8, seed + 1)
    return out / (np.abs(out).max() + 1e-9)


def lamp_hiss(dur, seed, flicker=None):
    """Pressure-kerosene burner: steady hiss + soft roar. flicker (per sample 0..1) modulates it (the gutter)."""
    n = secs(dur)
    h = hp(noise2(n, seed), 3200) * 0.25 + bp(noise2(n, seed + 2), 180, 1400) * 0.35
    h *= (1 + 0.08 * smooth_noise(n, 3, seed + 4))[:, None]
    if flicker is not None:
        h *= flicker[:n, None]
    return h


def flame_gutter(dur, seed, flick):
    """The flame guttering under spray: puffs and sputters where the beam dips (flick = layout beamOn, per sample)."""
    n = secs(dur)
    out = np.zeros((n, 2))
    r = rng(seed)
    d = np.diff(flick[:n], prepend=flick[0])
    # a puff at every local minimum of the flicker
    mins = np.where((d[:-1] < 0) & (d[1:] >= 0))[0]
    for i in mins:
        L = secs(0.12)
        p = lp(white(L, seed + int(i) % 997), 600) * env_points(L, [(0, 0), (0.01, 1), (0.12, 0)])
        p += thump(140, 70, 0.04, 0.12, seed) * 0.4
        add_at(out, pan(p * r.uniform(0.5, 1.0), r.uniform(-0.2, 0.2)), i / SR)
    sp = X.grains(dur, lambda t: 40, seed + 9, 2000, 8000, (0.0005, 0.004), (4, 12), 1.0)
    out += sp[:n] * 0.6 * (1 - flick[:n, None] * 0.6)
    return out


def tooth_click(seed, size=1.0):
    """One pawl click on a tooth of the lens's big brass gear: bright brass tick + pawl bounce + gear body thunk."""
    r = rng(seed)
    n = secs(0.25)
    exc = np.zeros(n)
    exc[0] = 1.0
    exc[:24] += r.standard_normal(24) * 0.4
    s = r.uniform(0.96, 1.04)
    tick = modal(exc, np.array([1720, 2830, 4190, 6020]) * s, [0.05, 0.04, 0.028, 0.018], [1, .7, .45, .25])
    bounce = np.zeros(n)
    j = secs(r.uniform(0.009, 0.016))
    bounce[j] = 0.35
    tick += modal(bounce, np.array([1720, 2830]) * s * 1.01, [0.03, 0.02], [1, .5])
    body = modal(exc, np.array([310, 470, 690]) * s, [0.06, 0.05, 0.03], [1, .6, .3])
    y = tick / (np.abs(tick).max() + 1e-9) * 0.8 + body / (np.abs(body).max() + 1e-9) * 0.5 * size
    return pan(y * size, r.uniform(-0.15, 0.15))


def panel_knock(seed, size=1.0):
    """A heavy lens panel passing the pawl: a deep brass-and-wood knock (the slow clock of the lens)."""
    r = rng(seed)
    n = secs(0.9)
    exc = lp(white(secs(0.006), seed), 2500)
    e = np.zeros(n)
    e[:len(exc)] = exc
    y = modal(e, np.array([148, 222, 371, 590, 902]) * r.uniform(0.98, 1.02), [0.5, 0.35, 0.22, 0.12, 0.07], [1, .7, .5, .3, .2])
    y = y / (np.abs(y).max() + 1e-9)
    y += thump(130, 80, 0.06, 0.9, seed) * 0.5
    return st(y * size, 0.2, seed)


def clunk(seed=700):
    """CUES.notch: ONE huge gear tooth. Iron and brass, the whole tower rings with it."""
    n = secs(4.0)
    out = np.zeros((n, 2))
    exc = lp(white(secs(0.02), seed), 3000) * np.exp(-np.arange(secs(0.02)) / secs(0.004))
    e = np.zeros(n)
    e[:len(exc)] = exc
    body = modal(e, [69.3, 147, 220, 293.7, 440, 587, 880, 1320],
                 [2.6, 1.9, 1.5, 1.1, 0.8, 0.6, 0.35, 0.2], [1, .9, .8, .65, .5, .35, .22, .12])
    out += st(body / (np.abs(body).max() + 1e-9) * 0.8, 0.5, seed)
    out += st(thump(85, 34, 0.55, 4.0, seed + 1) * 1.1, 0)
    add_at(out, lp(N('anvil', 0.42), 2200) * 0.55, 0.0)
    add_at(out, N('bd_vsco_fff', 0.85) * 0.8, 0.002)
    add_at(out, tooth_click(seed + 5, 1.0) * 0.9, 0.0)
    return out / (np.abs(out).max() + 1e-9)


def creak(dur, seed, rate=(18, 46), body=(310, 740, 1260, 2100), level_env=None):
    """Stick-slip creak (iron crank under load, ropes, hull timbers)."""
    n = secs(dur)
    r = rng(seed)
    rt = rate[0] + (rate[1] - rate[0]) * (0.5 + 0.5 * smooth_noise(n, 1.5, seed))
    ph = np.cumsum(rt / SR)
    imp = np.zeros(n)
    idx = np.searchsorted(ph, np.arange(1, int(ph[-1])))
    idx = idx[idx < n]
    imp[idx] = r.uniform(0.3, 1.0, len(idx))
    y = np.zeros(n)
    for f, q in zip(body, (9, 12, 14, 10)):
        y += reson(imp, f * r.uniform(0.95, 1.05), q)
    y *= np.clip(0.4 + 0.9 * smooth_noise(n, 2.2, seed + 3), 0, None)
    if level_env is not None:
        y *= level_env[:n]
    y = y / (np.abs(y).max() + 1e-9)
    return pan(y, r.uniform(-0.2, 0.2))


def strain(dur, seed):
    """The crank pushed with everything: iron creak, a deep groan from the gear train, nothing moving."""
    n = secs(dur)
    out = creak(dur, seed, (12, 30), (240, 520, 980, 1650), env_points(n, [(0, 0.2), (0.4, 1), (dur, 1)])) * 0.6
    g = X.metal_groan(dur, seed + 1, 0.8, 1.0, 0.4)
    out += g / (np.abs(g).max() + 1e-9) * 0.7
    return out


def door_bang(seed=640):
    """The trap-hatch into the lantern room banging open against iron."""
    n = secs(1.5)
    out = np.zeros((n, 2))
    exc = lp(white(secs(0.01), seed), 2000)
    e = np.zeros(n)
    e[:len(exc)] = exc
    y = modal(e, [96, 183, 271, 402, 655], [0.45, 0.3, 0.2, 0.12, 0.08], [1, .7, .5, .35, .2])
    out += st(y / (np.abs(y).max() + 1e-9), 0.4, seed)
    add_at(out, lp(N('bd_muted_ff', 1.0), 1500) * 0.6, 0.0)
    add_at(out, lp(N('anvil_soft', 0.7), 3000) * 0.18, 0.0)
    return out / (np.abs(out).max() + 1e-9)


# ====================================================================================================================
# HUMAN-SCALE FOLEY
# ====================================================================================================================
def cup_clink(seed=200, size=1.0):
    """A stoneware cup knocking on a stone sill."""
    r = rng(seed)
    n = secs(0.8)
    e = np.zeros(n)
    e[:32] = r.standard_normal(32) * np.exp(-np.arange(32) / 6)
    y = modal(e, np.array([2180, 3640, 5370, 7810]) * r.uniform(0.97, 1.03), [0.22, 0.16, 0.1, 0.06], [1, .6, .4, .2])
    y = y / (np.abs(y).max() + 1e-9) + thump(260, 180, 0.03, 0.8, seed) * 0.4
    return pan(y * size, r.uniform(-0.3, 0.1))


def cup_shatter(seed=210):
    """The cup breaking on a stone floor, out of shot."""
    out = glass_burst(seed, 0.45, 1.2) * 0.7
    n = len(out)
    out += st(thump(220, 140, 0.03, n / SR, seed) * 0.6, 0)
    return lp(out, 6500)


def key_jingle(seed=230):
    """The brass crank key pressed into a paw: a small brass tick and the soft pad of the paw closing."""
    r = rng(seed)
    n = secs(0.6)
    out = np.zeros((n, 2))
    for k, t0 in enumerate((0.0, 0.035, 0.09)):
        e = np.zeros(secs(0.5))
        e[0] = 1
        y = modal(e, np.array([3150, 4720, 6930]) * r.uniform(0.97, 1.03), [0.09, 0.06, 0.04], [1, .6, .3])
        add_at(out, pan(y / (np.abs(y).max() + 1e-9) * (1.0, 0.45, 0.3)[k], -0.1), t0)
    pad = lp(white(secs(0.08), seed + 1), 900) * expenv(secs(0.08), 0.005, 0.04)
    add_at(out, st(pad * 0.6, 0.2), 0.0)
    return out


def boot_step(seed, size=1.0):
    """A small rubber boot on a stone step: soft thud + rubber squeak + grit."""
    r = rng(seed)
    n = secs(0.3)
    out = np.zeros((n, 2))
    out += st(thump(170, 95, 0.035, 0.3, seed) * 0.8, 0)
    m = secs(0.05)
    sl = bp(white(m, seed + 1), 300, 2800) * expenv(m, 0.002, 0.018)
    out[:m] += pan(sl * 0.6, r.uniform(-0.3, 0.3))
    if r.random() < 0.5:
        L = secs(0.06)
        tt = np.arange(L) / SR
        sq = np.sin(2 * np.pi * r.uniform(900, 1400) * tt * (1 + 2 * tt)) * np.sin(np.pi * tt / tt[-1]) * 0.08
        add_at(out, pan(sq, 0), 0.02)
    return out * size


def wiper(dur, seed, period=1.0):
    """Wheelhouse wipers: motor whine, rubber dragging over wet glass, a thunk at each end of the stroke."""
    n = secs(dur)
    t = np.arange(n) / SR
    ph = (t / period) % 1.0
    out = np.zeros((n, 2))
    motor = np.sin(2 * np.pi * 118 * t) + 0.5 * np.sin(2 * np.pi * 236 * t + 0.3)
    motor = lp(motor * (0.7 + 0.3 * np.abs(np.sin(np.pi * ph * 2))), 600) * 0.05
    drag = bp(white(n, seed), 500, 3000) * (np.sin(np.pi * (ph * 2 % 1.0)) ** 2) * 0.1
    out += st(motor + drag, 0.2)
    k = 0
    tt = 0.0
    while tt < dur:
        add_at(out, pan(thump(200, 110, 0.04, 0.2, seed + k) * 0.25, -0.4 if k % 2 else 0.4), tt)
        tt += period / 2
        k += 1
    return out


def sleeve_wipe(dur, seed):
    """An oilskin sleeve rubbed across a wet window: squeaky rubbery strokes."""
    n = secs(dur)
    t = np.arange(n) / SR
    stroke = np.sin(np.pi * ((t / 0.35) % 1.0)) ** 2
    sq = np.sin(2 * np.pi * np.cumsum(700 + 500 * stroke) / SR) * stroke
    rub = bp(white(n, seed), 800, 5000) * stroke
    y = sq * 0.08 + rub * 0.15
    y *= env_points(n, [(0, 0), (0.05, 1), (dur - 0.1, 1), (dur, 0)])
    return pan(y, 0.1)


def fur_ruffle(dur, seed):
    """Grandpa's paw ruffling wet fur between the ears."""
    n = secs(dur)
    y = bp(white(n, seed), 1500, 9000) * np.clip(0.3 + smooth_noise(n, 9, seed + 1), 0, None) ** 2
    y *= env_points(n, [(0, 0), (0.1, 1), (dur - 0.15, 0.8), (dur, 0)])
    return st(y * 0.5, 0.4, seed)


def laugh_breath(seed=260):
    """No voice: three unvoiced, exhausted breaths of a laugh (whispered 'ha' noise through a small vocal tract)."""
    n = secs(1.1)
    out = np.zeros((n, 2))
    r = rng(seed)
    t0 = 0.0
    for k in range(3):
        L = secs(r.uniform(0.13, 0.2))
        b = formant(white(L, seed + k) * env_points(L, [(0, 0), (0.02, 1), (L / SR, 0)]), 'a_f', 1.15) * 3
        b += hp(white(L, seed + 10 + k), 3000) * env_points(L, [(0, 0), (0.02, 0.3), (L / SR, 0)]) * 0.3
        add_at(out, pan(b * (1.0, 0.75, 0.5)[k], 0.05), t0)
        t0 += L / SR + r.uniform(0.07, 0.12)
    return out


def lantern_creak(seed, size=1.0):
    """A ship's lantern swinging on its iron bail: a short creak and a small tinkle."""
    r = rng(seed)
    out = creak(r.uniform(0.25, 0.45), seed, (25, 55), (900, 1500, 2300, 3400)) * 0.5
    e = np.zeros(secs(0.4))
    e[0] = 1
    tk = modal(e, [4100 * r.uniform(0.9, 1.1), 6300], [0.08, 0.05], [1, .4])
    add_at(out, pan(tk / (np.abs(tk).max() + 1e-9) * 0.3, r.uniform(-0.3, 0.3)), r.uniform(0.05, 0.2))
    return out * size


# ====================================================================================================================
# BOATS, WATER
# ====================================================================================================================
def diesel(dur, seed, fire_hz, load=0.5, muffle=1.0):
    """A small fishing-boat diesel: firing pulses (fire_hz per sample), knock, harmonic body, wet exhaust."""
    n = secs(dur)
    f = np.broadcast_to(fire_hz, (n,)).astype(float) if not np.isscalar(fire_hz) else np.full(n, float(fire_hz))
    ph = np.cumsum(f / SR)
    frac = ph % 1.0
    pulse = np.exp(-frac * 9.0)
    knock = lp(white(n, seed), 900 * muffle) * pulse ** 2 * (0.4 + load)
    body = np.zeros(n)
    for k, a in enumerate((1.0, 0.7, 0.5, 0.35, 0.2, 0.12), 1):
        body += a * np.sin(2 * np.pi * k * ph + k)
    body = lp(body * (0.6 + 0.4 * pulse), 260 * muffle)
    exh = bp(white(n, seed + 1), 120, 900 * muffle) * (0.3 + pulse) * (0.2 + load)
    gurgle = lp(white(n, seed + 2), 300) * np.clip(smooth_noise(n, 6, seed + 3), 0, None) * 0.4
    y = knock * 0.6 + body * 0.5 + exh * 0.5 + gurgle * 0.3
    return st(y, 0.4, seed)


def passby(dur, seed, t_pass, fire0=11.0, width=1.4, p0=-0.9, p1=0.9):
    """A boat racing past the camera: diesel at full throttle, Doppler drop and pan across at t_pass (relative)."""
    n = secs(dur)
    t = np.arange(n) / SR
    u = (t - t_pass) / width
    dop = 1.0 + 0.045 * np.tanh(-u * 2.2)
    y = diesel(dur, seed, fire0 * dop, load=1.0)
    m = y.mean(1)
    lvl = 1 / (1 + (u * 1.6) ** 2)
    pos = np.clip(p0 + (p1 - p0) * (0.5 + 0.5 * np.tanh(u * 1.5)), -1, 1)
    a = (pos + 1) * math.pi / 4
    hull = bp(white(n, seed + 7), 250, 3000) * lvl * 0.6   # bow wave hiss
    m = m * lvl + hull
    return np.stack([m * np.cos(a), m * np.sin(a)], 1)


def wave_break(seed=900):
    """CUES.waveBreak: the swell detonating on the reef teeth: sub drop, white explosion, rock, a long falling wash."""
    n = secs(7.0)
    out = np.zeros((n, 2))
    out += st(thump(62, 19, 2.0, 7.0, seed) * 1.6, 0)
    det = noise2(n, seed + 1, white)
    cut = np.interp(np.arange(n) / SR, [0, 0.05, 0.6, 2.5, 7.0], [16000, 12000, 4000, 1300, 500])
    det = sweep_lp(hp(det, 35), cut) * env_points(n, [(0, 0), (0.004, 1), (0.25, 0.75), (1.5, 0.4), (4.0, 0.12), (7.0, 0)])[:, None]
    out += det * 1.1
    mass = lp(noise2(n, seed + 3, brown), 320) * env_points(n, [(0, 0), (0.08, 1), (1.2, 0.8), (4.5, 0.25), (7.0, 0)])[:, None]
    out += mass * 1.4
    add_at(out, N('bd_vsco_fff', 0.62) * 0.9, 0.0)
    add_at(out, lp(N('gong_smack_low', 0.55), 900) * 0.4, 0.005)
    add_at(out, lp(N('anvil', 0.3), 1200) * 0.35, 0.003)
    spray = hp(noise2(n, seed + 5), 2200) * env_points(n, [(0, 0), (0.25, 0.4), (0.8, 1), (2.5, 0.6), (7.0, 0)])[:, None]
    out += spray * 0.5
    return out / (np.abs(out).max() + 1e-9)


def suck_back(dur, seed=880):
    """The sea inhaling before the break: a thin rising draw of water over the rocks (reversed wash)."""
    n = secs(dur)
    y = bp(noise2(n, seed), 600, 6000) * env_points(n, [(0, 0.2), (dur * 0.8, 1), (dur, 0)])[:, None]
    y = sweep_lp(y, np.linspace(1500, 7000, n))
    return y


def spray_fall(dur, seed, level_env):
    """Falling spray after the break: heavy, fat drops over the basin."""
    return rain(dur, seed, 2.2, level_env, heavy=2.5)


def bow_burst(seed=940):
    """CUES.dadIn: Kestrel's bow punching out of the white water, the engine roaring through it."""
    n = secs(2.5)
    out = np.zeros((n, 2))
    sp = bp(noise2(n, seed), 200, 4500) * env_points(n, [(0, 0), (0.02, 1), (0.3, 0.6), (1.5, 0.15), (2.5, 0)])[:, None]
    out += sp
    eng = diesel(2.5, seed + 1, np.linspace(13.0, 11.0, n), load=1.0)
    out += eng * env_points(n, [(0, 0), (0.05, 1.2), (2.5, 0.7)])[:, None]
    out += st(thump(80, 40, 0.3, 2.5, seed + 2) * 0.8, 0)
    return out / (np.abs(out).max() + 1e-9)


def spray_slap(seed=960):
    """CUES.sprayHit: a sheet of spray slapping the lantern glass and pouring through the broken panes."""
    n = secs(2.0)
    out = np.zeros((n, 2))
    sl = bp(noise2(n, seed, white), 350, 7500) * env_points(n, [(0, 0), (0.003, 1), (0.12, 0.5), (0.6, 0.15), (2.0, 0)])[:, None]
    out += sl
    out += st(thump(140, 60, 0.12, 2.0, seed) * 0.6, 0)
    dr = rain(2.0, seed + 3, 3.0, env_points(secs(2.0), [(0, 0), (0.05, 1), (2.0, 0)]), 1.5)
    out += dr * 1.5
    return out / (np.abs(out).max() + 1e-9)


def pier_bump(seed=980, size=1.0):
    """CUES.pierBump: a wooden hull (with its rope fender) bumping the stone pier, a creak, a slop of water."""
    n = secs(2.2)
    out = np.zeros((n, 2))
    exc = lp(white(secs(0.015), seed), 1600)
    e = np.zeros(n)
    e[:len(exc)] = exc
    y = modal(e, [78, 131, 214, 352, 540], [0.45, 0.32, 0.22, 0.12, 0.07], [1, .8, .55, .3, .15])
    out += st(y / (np.abs(y).max() + 1e-9), 0.3, seed)
    add_at(out, lp(N('bd_muted_ff', 0.8), 900) * 0.7, 0.0)
    add_at(out, creak(0.6, seed + 3, (20, 40), (420, 880, 1300, 2000)) * 0.25, 0.12)
    slop = bp(noise2(secs(1.2), seed + 5), 150, 1500) * env_points(secs(1.2), [(0, 0), (0.15, 1), (1.2, 0)])[:, None]
    add_at(out, slop * 0.35, 0.08)
    return out / (np.abs(out).max() + 1e-9) * size


def lapping(dur, seed):
    """Calm water at dawn against hulls and stone."""
    return X.water(dur, seed)


def gull(seed, f0=1250.0):
    """One herring-gull 'kyow': a rasping, falling call."""
    r = rng(seed)
    L = r.uniform(0.25, 0.42)
    n = secs(L)
    t = np.arange(n) / SR
    u = t / L
    f = f0 * r.uniform(0.9, 1.1) * np.interp(u, [0, 0.15, 0.5, 1], [0.8, 1.15, 1.0, 0.62])
    ph = np.cumsum(f) / SR * 2 * np.pi
    rasp = 1 + 0.6 * lp(white(n, seed), 160) * 8
    y = (np.sin(ph) + 0.6 * np.sin(2 * ph) + 0.35 * np.sin(3 * ph) + 0.2 * np.sin(4 * ph)) * rasp
    y = bp(y, 700, 5000) * np.sin(np.pi * u) ** 0.7
    return y / (np.abs(y).max() + 1e-9)


def gulls(dur, seed, rate=0.5, start=0.0):
    """A few gulls far off over the basin, calling in short series."""
    n = secs(dur)
    out = np.zeros((n, 2))
    r = rng(seed)
    t = start + r.uniform(0, 1.0)
    while t < dur:
        p = r.uniform(-0.8, 0.8)
        dist = r.uniform(0.3, 1.0)
        tt = t
        for k in range(int(r.integers(2, 5))):
            g = gull(int(r.integers(1 << 30)), r.uniform(1050, 1450))
            add_at(out, pan(lp(g, 6000 - 3000 * dist) * (1.1 - dist) * (0.9 ** k), p), tt)
            tt += len(g) / SR + r.uniform(0.05, 0.18)
        t = tt + r.exponential(1 / rate) + 0.6
    return out


def tower_moan(dur, seed, gust):
    """Wind moaning down the inside of the stone tower: a low hollow tone that rises and falls with the gusts."""
    n = secs(dur)
    g = gust[:n]
    t = np.arange(n) / SR
    out = np.zeros((n, 2))
    for k, (f0, a) in enumerate([(98, 1.0), (147, 0.6), (196, 0.35)]):
        f = f0 * (1 + 0.04 * (g - 0.7)) + 2 * smooth_noise(n, 0.5, seed + k)
        band = lp(white(n, seed + 10 + k), 12, 2) * 9
        out += pan(band * np.sin(2 * np.pi * np.cumsum(f) / SR) * a, (-0.4, 0.3, 0.0)[k])
    out *= (np.clip(g - 0.3, 0, None) ** 1.5)[:, None]
    return out + lp(noise2(n, seed + 20, brown), 200) * 0.3
