# Sound credits and licenses (LAST LIGHT)

**Music**: original score written for this film in `audio/render.py` (Suri's motif, the storm ostinato, all harmony and
orchestration). No melody, recording or stem of any existing work is used; no AI music generator was used.

**Recorded material**: only single-note instrument and percussion samples from two public-domain (CC0 1.0) libraries,
played note by note by the code. Nothing from the downloads is executed: the files are read as audio data only.

| Library | Author | License | Used for |
|---|---|---|---|
| **VS Chamber Orchestra: Community Edition (VSCO-2-CE)** — github.com/sgossner/VSCO-2-CE | Sam Gossner, Simon Dalzell (Versilian Studios); sample cutting Elan Hickler / Soundemote | **CC0 1.0 Universal** (license file: `audio/samples/vsco/LICENSE` after fetching) | violin section (sustain, tremolo, pizzicato), viola and cello sections (sustain, tremolo, spiccato, pizzicato), solo contrabass (sustain, tremolo, spiccato), harp, horn, tenor trombone, tuba, flute, oboe, clarinet, bassoon, glockenspiel, timpani hits + rolls, bass drum, gong, suspended and clash cymbals |
| **Versilian Community Sample Library (VCSL)** — github.com/sgossner/VCSL | Sam Gossner / Versilian Studios | **CC0 1.0 Universal** (`audio/samples/vcsl/LICENSE`) | concert bass drum, wine glass, bowed brake drum (inside the crank-strain groan), anvil (inside the CLUNK, the wave break and the hatch) |

**Synthesised from code** (`audio/lib/storm.py`, `audio/lib/sfx.py`, `audio/lib/dsp.py`): rain, wind and its howl, surf, the
great swell, thunder and the bolt, glass bursting, match strike, mantle whoomp, burner hiss, flame gutter, gear tooth clicks,
lens panel knocks, the CLUNK's iron body, crank strain and creaks, cup, key, boots, wipers, sleeve on glass, fur ruffle, the
breath of a laugh (filtered noise, no voice), lantern creaks, boat diesels and pass-bys, wave break, spray, pier bump, water
lapping, gulls, tower moan, and all reverbs (synthetic impulse responses). Some of these layer a CC0 drum or anvil sample
listed above.

CC0 means no attribution is required and commercial use is allowed; this file records the sources anyway.
Only the folders listed in `audio/tools/fetch_samples.py` are downloaded (about 1.7 GB of WAV files + license/readme files).
The sound engine (`dsp.py`, parts of `sfx.py`, the master chain) is adapted from BLACKOUT (MIT).
