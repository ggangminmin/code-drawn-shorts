# SEEDLIGHT cue sheet (what plays when, and why)

Times are the current values in `src/shots.js` / `src/layout.js`; the render derives them from `cache/timeline.json`, so
this table moves with the cues (the exact as-rendered list, 160+ events with levels, is `cache/events.json`).
Key of D: **minor** = the vault and the war, **major** = the seed. One theme, five notes: **A D F# E D** (the seed theme).
One tone frames the film: a single high **glass A** (wine glass + glockenspiel + two pure partials).
The ray is never a zap: it is a thin **singing glass tone** (E7, two beating partials), so the weapon and the seed are
audibly the same material. Porcelain is the Lantern's voice: every move is plate contacts, never servos.

| Time | Shot / cue | Music | Sound design | Why |
|---|---|---|---|---|
| 0.0 | s01 thread, s01b seed | the glass A, already sounding at frame 0, alone | the thread's shimmer (level = `threadOn`), night wind | the hook: one pure tone = the gold thread |
| 2.6 | `irisOpen` | low held D (contrabasses, tuba, bassoon), soft bass drum, dark gong | iris shutter: ceramic blades clicking open, a glass shing; iris hum (`irisHeat`) | "what did she just wake up?" |
| 3.9 | s02 `twitch` | bass tremolo, two cello pizzicati | one finger scrapes; all fingers curl; gravel; chain slides off and drops | small sounds in a big dark room (vault reverb) |
| 5.4 | s03 guards, `lampDrop` 6.6 | gong scrape, bowed vibraphone, pizzicato | steps back; tin lamp hits, bounces, rolls in a slowing wobble | fear, seen from the machine's side |
| 7.6 | s04 `standUp` | low strings + trombone climbing by half steps | stone grinding, deep plate creaks, rubble pouring | mass without motors |
| 9.4 | `armDrop` | cut dead | staples tear, then the crash: sub, bass drums, a deep plate bong, porcelain shattering | it does not look at it: no music comment either |
| 10.6 | s05 `volley` | none, then a high cluster tightening | six ragged carbine shots, each with a ricochet whine off porcelain | their worst is nothing to it |
| 12.9 | s06 `ray1` | cut | THE RAY (0.45 s), then the line hissing, crackling, sagging | first hearing of the glass tone as a weapon |
| 14.0 | `doorBurst` | brass stab, timpani | molten door: sub, gong smack, anvil, steam, falling sheets | release |
| 14.9 | s07 shaft, `fansOpen` 15.4, `leap` 16.0 | **rising ostinato begins** (spiccato cellos, D) | heavy steps; copper fans ratchet open twice; push-off and the rush past camera | the escape starts |
| 17.9 | s08 `burst` | ostinato up a third, tutti stab + cymbal | well cap explosion, dust column, then the heavy landing (burst + 0.85) | |
| 19.4 | s09 `alarm` | stab, ostinato rising | hand-cranked siren winds up (then stays low under everything until the eruption); six searchlight clunks (alarm + 0.1 + i x 0.13, mirrors `land-weir.js`) | the garrison wakes |
| 20.9 | s10 stairs | violas, violins join, horn line climbing | her paws on the stair, shimmer, siren | two climbs at once |
| 23.4 | s11 climb | ostinato at full height, trumpets | a slam every 0.62 s, crumbling stone, distant rifles, sparks on its back | |
| 26.4 | s12 roof, `gripParapet` 27.0, `headRise` 27.8 | ostinato stops: high tremolo and a slow bass pulse; a stab on the hand; a horn swell on the head | the hand on the parapet (stone crunch, three finger clacks); plate creak | held breath before the meeting |
| 28.9 | s13 kneel | **everything drops away** | step over the parapet; the kneel thud at 29.6 (the roof shakes); plate creaks as the head lowers | the emotional centre |
| 30.6 | `handChest` | the seed theme, harp + clarinet: third note on the hand | a soft hollow porcelain touch | |
| 31.4 | `chestLit` | fifth note on the light; warm low strings (G) | a glass ping opening into a warm D hum | gold |
| 32.4 | s14 wonder | second phrase, flute + violins, D major | iris hum, shimmer | fear turning into wonder |
| 34.9 | `shell1` | (continues, unaware) | cannon report, whistle | the audience knows first |
| 35.4 | `shell1Hit` | **brutal cut**: music gated to nothing in 4 ms | the biggest burst so far: sub, drums, porcelain and copper | the idyll is over |
| 36.4 | s16 down | one very low D, two muffled drum beats | smoulder, plates ticking, low siren | is it dead? |
| 37.9 | `irisBack` | white-hot violin cluster, crescendo | the shutter snaps open again; the hum hardens to a whine | anger |
| 39.4 | s17 `sweep` .. `sweepEnd` | **silence** | only THE RAY, panning and rising with `sweepU` | the image |
| 40.6 | held breath | nothing | the whole mix at -42 dB (about -70 dBFS) for 0.4 s | the breath |
| 41.0 | `erupt` .. `eruptEnd` | **full orchestra on the cue**; the theme in minor in the brass | ten blasts where `eruptU` crosses k/10, running across the stereo field; fire roar begins and stays to the end | the answer |
| 42.4 | s18 burning | heavy chords Bb, G minor, A, falling away | fire, a gun tower leaning and toppling, debris into the water | cost |
| 44.9 | s19 `lift` 45.6, `setDown` 47.6 | low warm strings; the theme, hesitant, on a clarinet; last note as it sets her down | hand slides under her, plate creak, a soft touch on the dais | gold again, with great care |
| 48.4 | s20 `shipRise` | low brass rising by half steps, tritones, timpani roll | the ironclad: 37 Hz engine drone, rotor chop (level from `shipPos`, pitch sags with `shipList`); turrets | menace by mass |
| 51.4 | s21 skiff | quick bright violins in D major, pizzicato, a trumpet call on the theme's rise | propeller buzz, wind of speed | help is coming |
| 54.9 | s22 `broadside` | stab, tremolo, a timpani stroke with every impact | SHELLS b0..b4: far report at t0, whistle, burst at t1 (stone on the tower, porcelain on the Lantern) | it takes the last two |
| 57.4 | s23 `ray2` | out | THE RAY across the hull | |
| 58.2 | `hullBurn` | **the theme, heroic, in major**: three notes, then broken off by the ship's answer (d0) into a Bb minor wall | whoomp, fire, the hull groaning as it lists | broken and heroic |
| 59.9 | s24 `wake` 60.4 | grief: sighing violins, an oboe with the theme in minor | cloth, fire, the iris whine | she sees it burning |
| 61.9 | s25 approach, `hang` 62.9 | the ostinato returns (D, G, A); horns: the theme's rise | propeller, wind; knees lock on the hook bar; shell e0 | |
| 65.4 | s26 `push` | Bb then C under the ostinato, trumpets climbing, cymbal and bass drum swells | plates creak as the arm extends; shell e1 kept behind the music | bVI, bVII, then home |
| **67.4** | s27 **`catch`** | **the peak: D major, full orchestra, the theme whole for the only time** (trumpets, violins, horns) | two cloth slaps, a soft thud of weight, the hook bar straining; the skiff's doppler pass centred on the cue | the loudest music in the film |
| 69.9 | s28 `lastSalvo` | major turns minor; a line falls step by step | SHELLS f0..f2 (the last one as big as shell 1); the Lantern coming apart and sinking | |
| 71.6 | `irisOut` | a catch of breath, then only violas and a cello | the shutter closes, slowing; a glass tone sinks a fifth and dies; the shimmer dies with `threadOn` | grief |
| 72.4 | s29 away | quiet resolve: G, D/F#, A; the theme slow on a clarinet with harp | wind over the salt flats, the propeller, the fire far behind | |
| 75.4 | s30 ember | D major fading out before the cue | wind, fire burning low | |
| 77.0 | `threadBack` | **the glass A from frame 0, alone** | the shimmer returns with `threadOn` | the last shot rhymes with the first |
| 78.05 | fade | 0.35 s fade to silence with the cut to black | | |

No voices, no dialogue, no crowd walla anywhere.
