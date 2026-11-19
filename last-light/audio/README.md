# LAST LIGHT soundtrack (sound department)

Output: `out/soundtrack.wav`, 48 kHz, stereo, 16-bit, exactly `DURATION` of `src/shots.js` (73.000 s = 3,504,000 samples),
about -16 LUFS integrated, true peak below -1.5 dBFS (limiter ceiling -2.0 dBTP). Original score + sound design, no voices,
no AI music, no paid services.

## Rebuild (from the project root)

```
# once: a Python with numpy / scipy / soundfile / matplotlib (Python 3.14 here)
/opt/homebrew/bin/python3.14 -m venv ~/.venvs/opus_audio && ~/.venvs/opus_audio/bin/pip install numpy scipy soundfile matplotlib
# once: the CC0 samples (~1.7 GB, VSCO-2-CE + VCSL) and their index
~/.venvs/opus_audio/bin/python -I audio/tools/fetch_samples.py
~/.venvs/opus_audio/bin/python -I audio/tools/build_index.py
# every time (about 25 s): node dumps the shared clocks, the gear table is derived, score + SFX + mix + master
~/.venvs/opus_audio/bin/python -I audio/render.py
~/.venvs/opus_audio/bin/python -I audio/tools/analyse.py          # hard checks, out/sound_env.png, audio/analysis.json
~/.venvs/opus_audio/bin/python -I audio/tools/cuesheet.py --write # as-mixed table appended to audio/cuesheet.md
```

`render.py` calls `node audio/tools/dump_timeline.mjs`, which imports `src/shots.js` and `src/layout.js` and samples
`beamAz`, `beamOn`, `storm`, `swellHeight`, `swellFront`, `lightningAt`, `boatPath` into `audio/cache/timeline.json`.
Nothing is retyped: if the lead moves a CUE or a shot, re-running `render.py` follows it (the analyser re-reads the same file).
All randomness is seeded: same samples + same code give a bit-identical file.

| File | What |
|---|---|
| `cuesheet.md` | the emotion map (written before the music) + the as-mixed table |
| `render.py` | score (by section), sound design placement at LUFS targets, perspective per shot set, gates, loudness calibration to the emotion map, master |
| `notches.json` | gear table: every tooth (0.12 rad, the CUES.notch jump) and lens-panel crossing of `layout.beamAz`, with times and frames |
| `lib/storm.py` | this film's sounds: rain, wind (+ howl through broken panes), surf, the great swell, thunder, bolt, glass burst, match, mantle, burner hiss, flame gutter, tooth click, panel knock, CLUNK, crank strain, cup, key, boots, wipers, sleeve, fur, breath-laugh, lanterns, diesel, pass-by, wave break, spray, pier bump, gulls, tower moan |
| `lib/dsp.py`, `lib/sfx.py` | sample engine, filters, reverb (inherited from BLACKOUT), generic sounds + the percussion sample map |
| `tools/dump_timeline.mjs` | node: samples the lead's clocks to `cache/timeline.json` |
| `tools/notches.py` | derives `notches.json` numerically from `beamAz` (also importable; render.py uses it) |
| `tools/analyse.py` | checks (length, format, loudness, true peak, hits on cues +-1 frame, source sample-exact, gear vs table, thunder after every flash, the inhale/break/no-music window, harmony rules) + plot |
| `tools/cuesheet.py` | as-mixed cue sheet per shot |
| `tools/fetch_samples.py`, `tools/build_index.py` | CC0 sample download and index (octave fix by pitch detection) |

Stems for checking are in `audio/cache/` (`stems.npz`: dry hit bus, each cue hit isolated, gear bus, gated music and sfx groups;
`DEBUG_STEMS=1` also dumps every bus to `buses.npz`).

## Mix structure
Music buses (strings, brass, winds, harp, percussion) → one hall, convolved per stretch between hard music cuts so no tail leaks
back. SFX: `ext` (storm beds; filtered by the camera's set: wheelhouse / kitchen / stair hear the storm through walls, the lantern
room through broken panes; ridden down per shot with `BED_RIDE` when the music must win), `sky` (thunder, never ridden),
`int` (rooms and foley), `hit` (cue hits), `gear`, `panel`, `hush` (never gated: the inhale before the break). Every SFX is placed
at a loudness target (momentary max or integrated LUFS). Gates: music dead from the bolt to s03, held breath before the CLUNK,
everything down 46.08-46.40 (the sea inhales), no music from the break to the surf (49.0). Then per-segment trims bring the 70th
percentile of momentary loudness of each emotion-map segment to its target, the master normalises to -16 LUFS integrated.
