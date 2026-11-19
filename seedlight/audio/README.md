# SEEDLIGHT soundtrack (sound department)

Output: `out/soundtrack.wav`, 48 kHz, stereo, 16-bit, exactly `DURATION` of `src/shots.js` (78.400 s = 3,763,200 samples),
-16 LUFS integrated, true peak -2.0 dBTP (limiter ceiling). Original score + sound design, no voices, no AI music,
no paid services.

## Re-render (from the project root, about 15 s)

```
~/.venvs/opus_audio/bin/python -I audio/render.py          # dumps the lead's clocks, then score + SFX + mix + master
~/.venvs/opus_audio/bin/python -I audio/tools/analyse.py   # checks: length, LUFS, true peak, every cue +-1 frame, held breath
ffmpeg -i out/soundtrack.wav -af ebur128=peak=true -f null -   # independent loudness / true peak
```

`render.py` first runs `node audio/tools/dump_timeline.mjs`, which imports `src/shots.js` and `src/layout.js` and writes
`CUES`, `SHOTS`, `SHELLS` and the clocks `threadOn`, `irisHeat`, `sweepU`, `eruptU`, `shipPos`, `shipList`, `quake`
(480 samples per second) to `audio/cache/timeline.json`. **Nothing is retyped**: every time in `render.py` is a cue, a
shot boundary, a SHELLS entry, a clock crossing, or an offset from one of those. Move a cue or add a shell, re-run, and
the sound follows (SHELLS is iterated, its length is never assumed; eruption blasts are placed where `eruptU` crosses
k/10; the sweep tone starts and stops where `sweepU` leaves 0 and reaches 1). All randomness is seeded.
If node is missing, the cached timeline is used and a warning is printed.

Environment: `~/.venvs/opus_audio` (numpy, scipy, soundfile). Samples: `audio/samples` (symlink, CC0, see `CREDITS.md`;
`tools/fetch_samples.py` + `tools/build_index.py` rebuild that folder from scratch, about 1.7 GB, only if it is ever lost).

| File | What |
|---|---|
| `cuesheet.md` | what plays when and why |
| `render.py` | the score (one function per section), SFX placement, buses, gates, mix, master |
| `lib/seedfx.py` | this film's designed sounds (each starts at sample 0 so it can be locked to a cue) |
| `lib/dsp.py`, `lib/sfx.py` | sample engine, filters, reverb, generic impacts and the percussion sample map (inherited) |
| `tools/dump_timeline.mjs` | node: samples the lead's cues, shells and clocks |
| `tools/analyse.py` | hard checks on the rendered file |
| `cache/` | `timeline.json`, `events.json` (every placed sound: time, name, bus, peak; per-shot music/SFX balance), `cues.npz` + `cue_times.json` (isolated cue stems for the lock check), `fx_stem.npy` |

## Mix structure
Buses: `mus` (score, into one hall), `hit` (impacts), `sfx` (foley and tones), `bed` (wind, vault tone, thread shimmer,
iris hum, fire, ship engine). SFX go to a stone-vault reverb in the vault and shaft shots and to an open-air slap outside
(chosen from the shot's `set`). Every SFX is normalised to a stated peak level when placed. The music is ducked by the
`hit` bus (up to about 10 dB under the biggest impacts) and ridden up a few dB in the quiet scenes (kneel, wonder,
carry, wake, away). Gates: music cut dead at `shell1Hit`; music out while the ray sings (sweep, ray 2); the whole mix
at -42 dB for the held breath between `sweepEnd` and `erupt`; a 0.35 s fade to silence with the picture's cut to black.
Master: normalise to -16 LUFS, soft clip, look-ahead true-peak limiter at -2 dBTP, dither.

Balance knobs: `MUS_DB / HIT_DB / SFX_DB / BED_DB` at the top of `render.py`, the `ride` table in `mixdown()`, and the
peak level in each `put(...)` call.
