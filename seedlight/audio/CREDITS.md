# Sound credits and licenses (SEEDLIGHT)

**Music**: an original score composed in code for this film in `audio/render.py` (the five-note seed theme, the rising
ostinato, all harmony and orchestration). No melody, recording or stem of any existing work, film or game is used, and
no AI music generator. It deliberately does not imitate the music or sound of the sequence whose actions the film retells.

**Recorded material**: only single-note instrument and percussion samples from two public-domain (CC0 1.0) libraries,
played note by note by the code. Nothing from the downloads is executed: the files are read as audio data only.
`audio/samples` is a symlink to the copy downloaded for our previous film (not modified, nothing new downloaded).

| Library | Author | License | Used for |
|---|---|---|---|
| **VS Chamber Orchestra: Community Edition (VSCO-2-CE)**, github.com/sgossner/VSCO-2-CE | Sam Gossner, Simon Dalzell (Versilian Studios); sample cutting Elan Hickler / Soundemote | **CC0 1.0 Universal** (`audio/samples/vsco/LICENSE`) | violin, viola, cello sections (sustain, tremolo, spiccato, pizzicato), contrabass (sustain, tremolo, spiccato, pizzicato), harp, horn, trombone, tuba (sustain + staccato), trumpet, flute, oboe, clarinet, bassoon, glockenspiel, timpani hits + roll, bass drum, gong (hits, scrape, smack), suspended and clash cymbals |
| **Versilian Community Sample Library (VCSL)**, github.com/sgossner/VCSL | Sam Gossner / Versilian Studios | **CC0 1.0 Universal** (`audio/samples/vcsl/LICENSE`) | wine glass (the glass tone at frame 0 and at the end), bowed vibraphone, concert bass drum (hits and crescendo), anvil (inside the door burst and the searchlight clunks), bowed brake drum (inside the metal groans) |

**Synthesised from code** (`audio/lib/seedfx.py`, `audio/lib/sfx.py`, `audio/lib/dsp.py`): the thread's shimmer, the iris
hum, the iris shutter opening and closing, porcelain contacts and shattering, fingers scraping stone, the chain, the
dropped lamp, the body rising, the arm crash, rifle shots and ricochets, the ray (a singing glass tone), the sagging
molten line, the door burst, the copper fans, the leap, the well cap burst, landings, the hand-cranked siren,
searchlight clunks, climbing impacts and crumbling stone, the kneel, the touch, the warm tone, cannon reports, shell
whistles and bursts, the running eruption, the fire bed, the ironclad's engine and rotors, the skiff's propeller,
wind, hull fire, the catch, the collapse, and all reverbs (synthetic impulse responses). Some of the impacts layer a
CC0 drum, gong or anvil sample from the table above. No voices, no dialogue.

CC0 means no attribution is required and commercial use is allowed; this file records the sources anyway.
The sound engine (`dsp.py`, `sfx.py`, the master chain) is adapted from BLACKOUT (MIT) via LAST LIGHT.
