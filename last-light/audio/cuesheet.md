# LAST LIGHT: emotion map (written before any note)

Every musical and sound decision below comes from this table. Times are film seconds, read from `CUES` / `SHOTS`
in `src/shots.js` and the clocks in `src/layout.js` (sampled by `audio/tools/dump_timeline.mjs`, never retyped).
The as-mixed table (what was actually rendered) is printed by `python -I audio/tools/cuesheet.py`.

## The arc in one line
**dread → solitude → strain → hope → terror → release → dawn calm.** The storm is the loudest "instrument" until
the sweep; the orchestra only wins the room when the light wins.

## Rules
1. **Key: D minor** for the storm (open D / A strings, timpani on D and A). The threat interval is the Phrygian
   **Eb over D** (semitone) and it only appears when the sea is the subject (swell, crest, race, break).
2. **Hope = relative major** (F major and Bb major colours) while the beam turns; **home = D major**, first at the
   pier bump (54.6), fully at Dad's smile (58.4), and it stays major to the end. No D major triad before 54.6.
3. **Suri's motif** (original, 7 notes): `D5 . F5 E5 | A4 —— | Bb4 C5 D5 ——` (minor) — a small question that falls a
   fifth, then climbs back by steps. Solitude states only the first four notes (it falls and does not climb back).
   The beam states it whole and harmonised (F major). Home states it in D major (`D F# E A | B C# D`).
   It is a fragile **solo** (oboe first, flute at the flame, horn when the beam sweeps, flute + harp at dawn).
4. **The storm ostinato** = low strings (cello + bass spiccato) and timpani on a 0.4 s grid (75 bpm quarter = 0.8 s,
   eighths 0.4 s, sixteenths 0.2 s). All CUES are multiples of 0.2 s, so every pulse can land on a cue.
5. **Silence is the biggest hit**: the music and the storm are pulled down to almost nothing for the 0.3 s before the
   wave break (46.1-46.4: the sea "inhales"), the break lands at full level, then the **music stays silent until
   Kestrel surfs in (49.0)**: only water roar, falling spray and the engine. The release at 49.0 is the warmest swell so far.
6. **Perspective follows the camera**: exterior shots hear the storm full; wheelhouse / kitchen / stair hear it through
   wood and stone (low-passed, rain on glass, the room's own sounds); the lantern room hears the wind *howling in* through
   the shattered panes.
7. **The lens is a clock**: every tooth of the big gear (0.12 rad, the size of the one-tooth jump at CUES.notch) is a
   pawl click, every lens panel (2π/8) a soft wooden-brass knock. Click times are derived from `beamAz(t)` numerically
   and exported to `audio/notches.json`. At dawn `beamAz` eases the lens to 0.3 rad/s, so the tooth clicks themselves slow to
   one every ~0.4 s: that is the coda's slow clicking, with a panel knock every ~2.6 s under it.

## Intensity contour (0 silent, 10 biggest)
Hook 6 · bolt 9 · dread 4 · solitude 2 · strain 5 → 7 · notch CLUNK 8 · sweep (hope) 8 · fleet/mouth 7 · crest (terror) 8.5 ·
together 8 · race 9 · inhale 0.5 · **break 10** · roar 6 → 3 (no music) · release 7 · flicker 3 · pier/smile 6.5 (warm) ·
laugh 4 · clearing 5 · rhyme 4 · asleep 2.5 → 0.

## Shot by shot

| shot | sec | on screen | feeling | int | harmony | what you hear |
|---|---|---|---|---|---|---|
| s01 hook | 0-2.5 | black sea from high above, six lanterns, the beam sweeping | dread, scale; a fragile order still working | 6 | Dm pedal | storm at full from sample 0 (rain, wind, surf); the storm ostinato already running (cello/bass spiccato, timpani D); the lens ticking calmly on every gear tooth; low D drone |
| s02 strike | 2.5-2.9 | lantern room against boiling cloud | held breath | 5 | Dm | ostinato swells, a high violin trem on A grows |
| | **2.9 bolt** | the bolt hits the rod, panes burst, lamp dies | shock | 9 | none | **thunder crack on the frame + glass burst**; the music is cut dead on the strike, the lens ticking stops |
| | 3.2 thunder | darkness | the world is bigger than us | 7 | none | the rolling thunder; the storm alone |
| s03 captain | 4-6 | Kestrel's wheelhouse, wipers, the headland light gone | dread | 4 | D + Eb whisper (clusters) | inside a wooden box: diesel throb, wipers, rain drumming on glass, storm muffled; one low cello D, a viola Eb sliding in, no pulse |
| s04 window | 6-8 | Suri at the kitchen window looking up at the dark tower | dread, small | 3 | Dm(add9) thin | kitchen: rain on the window, the storm far; a held high violin harmonic; **cup slips at 6.6** (ceramic clink on the stone sill) |
| s05 grandpa | 8-10.5 | grandpa fallen at the stair foot, presses the key into her paw | solitude, trust | 2 | Dm → Bb | thunder at 8.6 (+0.45 s); **the motif's first four notes on solo oboe at the key (9.4)**, falling, over a soft viola fifth; brass key in the paw (small metal) |
| s06 spiral | 10.5-13 | tiny yellow raincoat running up the spiral | strain, determination | 5 | Dm i - VI - VII | the ostinato returns at a run (0.2 s), rising by step with the stair; boot slaps on stone, echoing in the tower; wind moaning in the stairwell |
| s07 lamproom | 13-15 | shattered panes, rain blowing in, dark lens, snapped chain | awe, cold | 4 | open fifth D-A | wind howls in through the broken glass, rain spatter on brass, glass grit; the ostinato stops; one long cello harmonic |
| s08 flame | 15-17.5 | **match strike (15.6)**, **mantle catches (16.4)**, light blooms | the first warmth | 4 | F major (add9), harp | match scrape + flare; mantle **whoomp** and kerosene hiss; harp unfolds, the motif's first notes on flute: no longer falling, it waits on E |
| s09 stuck | 17.5-20 | beam stuck on the cliff; **she leans on the crank (17.9)**, nothing moves | strain | 5 → 6 | Dm, Gm/D | iron creak and strain under load, no click; low strings crescendo, timpani pulse returns |
| s10 swell | 20-22.5 | far out the sea lifts into a vast slope | terror seeded | 6 | D + Eb | **the great swell rumble rises** (sub + roar, grows with `swellHeight`); thunder after 20.3; trombones on D-Eb |
| s11 lookout | 22.5-24.5 | Dad wipes the window, searching, nothing | worry | 4 | Dm | wheelhouse again: sleeve on glass, engine, rain; the ostinato under, held breath |
| s12 notch | 24.5-27 | her boots braced, scream without sound, the gear jumps ONE tooth | maximum strain | 7 → hold | Dm → A (dominant) | strings climb in semitones, timpani roll grows, strain creaks crowd in; **0.25 s held breath, then the CLUNK at 25.6** (one huge gear tooth, with a timpani + bass drum underneath); the dominant A chord rings |
| s13 sweep | 26.4-30.5 | THE IMAGE: the beam starts to turn, a blade of light over the sea | **hope** | 8 | Bb - F - C - F | the lens turns: the tooth clicks start counting; **the motif whole on horns + violins in F major**, wide strings, harp; storm pulled under the music for the first time |
| s14 seen | 30.5-32.5 | the beam passes over the boats, lanterns turn | recognition | 7 | Dm → F | at 31.0 a bright swell (cymbal roll into a string chord), boat engines throttle up, lanterns creak |
| s15 mouth | 32.5-35.5 | the beam lights the reef teeth, the mouth reads | a way home | 7 | Bb → F | **harp glissando + horn chord at 34.6**; motif tail (Bb C D) in violins; the swell rumble still growing under |
| s16 crest | 35.5-38.5 | low on the water: the swell crests, lightning lights the lip | **terror** | 8.5 | Dm with Eb, Bb/D | lightning 36.8 + very close thunder; **crest at 37.0**: brass cluster D-Eb, the ostinato in sixteenths, timpani, the roar of the curling lip |
| s17 tired | 38.5-40.5 | Suri faltering; Grandpa's paws land on the crank (39.6) | exhaustion → company | 6 | Dm → Gm | the music thins to the low pulse and a strained solo oboe; at 39.6 the low strings take the motif (a second voice joins) |
| s18 together | 40.5-43 | both lean in, the lens accelerates (41.0) | resolve | 8 | Dm - Bb - C | tooth clicks speed up (fast sweep), ostinato accelerates, horns rise |
| s19 race | 43-46 | boats race single-file through the mouth, wall of water behind | terror + speed | 9 | Dm, D-Eb | engines passing (one per boat at `boatPass`), the swell roar, full brass and drums; lightning 45.1 thunder |
| | 46.0-46.4 | the wave rears over the teeth | the sea inhales | 0.5 | — | **almost silence**: everything gated, a single high suck-back of water |
| s20 break | **46.4** | the swell breaks on the reef: white explosion taller than the tower | catastrophe | 10 | — (no music) | **the break impact** (sub drop, water detonation, rock); then 2.5 s of roar, spray and hiss with **no music at all**; **46.9 Kestrel's bow punches out**: engine roars through the water |
| s21 surf | 49.0-51.5 | Kestrel surfs into the calm basin under falling spray | **release** | 7 | Bb major → F | the music returns: warm full strings, the motif's climb (Bb C D) in horns; falling spray rain, engine settling |
| s22 flicker | 51.5-54 | spray hits the lantern room (51.9); the flame gutters; she cups it; it holds (52.6) | fragile | 3 | F → Dm(add9), held | spray slap on the glass, **flame guttering** (sputter, puffs), music thins to one flute note and harp; at 52.6 the flame steadies (hiss returns) and the strings breathe in |
| s23 pier | 54-57 | the boats bump the stone pier; fishers raise lanterns | home | 6 | **D major** arrives | **wooden bump at 54.6** (hull on stone, rope creak); the first D major chord; lanterns' handles creak, engines idle down |
| s24 dad | 57-59.5 | Dad, soaked, looks up at the beam and smiles (58.4) | warm, proud | 6.5 | D major, G/D, A, D | **the motif in D major**, full strings + horn, peaking on his smile |
| s25 ruffle | 59.5-62.5 | Suri laughs, exhausted (60.6); Grandpa ruffles her ears | tender, relief | 4 | G - D/F# - Em - A | intimate: pizzicato and harp, a soft fur ruffle; the wind outside dropping |
| s26 clearing | 62.5-66.5 | the storm tears open, pale dawn | wonder, calm | 5 | Bm - G - D | the rain stops with `storm(t)`, the wind breathes out; high strings open up; first gull |
| s27 rhyme | 66.5-70.5 | same view as s01 at dawn, silver sea, six boats home | peace | 4 | D major | dawn gulls, slow swell lapping; harp arpeggios; the lens panel knocks slowly (the rhyme of the hook's ticking) |
| s28 asleep | 70.5-73 | lens turning; Suri asleep against the crank | quiet love | 2.5 → 0 | D major (add9) | the motif's last climb on flute (B C# D), one low D, harp harmonic; the lens knocks; closes to silence with the picture's last 0.35 s |

## As mixed
Generated by `audio/tools/cuesheet.py --write` from what the renderer played and the measured levels (storm beds, gear clicks and long ambiences are omitted; see render.py).

| shot | sec | max mom. LUFS | music (instrument: pitches) | sound (**bold** = starts in the shot, @time) |
|---|---|---|---|---|
| s01 hook | 0-2.5 | -14.2 | cb spicc A1 D2 F2; timpani A1 D2; cb trem D2; trb D2; vc spicc A2 D3 F3; vc trem D3; vla trem F4; vln trem A4 |  |
| s02 strike | 2.5-4 | -10.7 | cb spicc D2; cb trem D2; trb D2; vc spicc D3; vc trem D3; vla trem F4; vln trem A4 | **bolt_strike** @2.90, **glass_burst** @2.91, **thunder** @3.21 |
| s03 captain | 4-6 | -20.0 | cb D2; vc D3; vla trem Eb4 | bolt_strike, thunder, **wiper** @4.00, **creak** @4.07 |
| s04 window | 6-8 | -20.2 | cb D2; vc D3; vla trem D4 Eb4; vla F4; vln E5 A5 | **cup_clink** @6.60, **cup_clink** @6.76, **cup_shatter** @7.22 |
| s05 grandpa | 8-10.5 | -22.8 | cb Bb1 D2; vc F2 A2; vla D3 F3; oboe D5 E5 F5 | **key_jingle** @9.40, **thunder** @9.57 |
| s06 spiral | 10.5-13 | -15.7 | cb spicc E1 A1 Bb1 C2 D2; timpani A1 D2; cb Bb1; vc spicc E2 A2 Bb2 C3 D3; vc F2; vla D3 F3; vla spicc E3 A3 Bb3 C4 D4; vla trem F4; oboe A4 E5; vln trem A4 | thunder |
| s07 lamproom | 13-15 | -15.9 | cb D2; vc A2; glass D5; vln A5 | **door_bang** @13.08, **glass_burst** @13.43, **glass_burst** @13.76, **glass_burst** @14.09, **glass_burst** @14.40, **glass_burst** @14.73 |
| s08 flame | 15-17.5 | -17.7 | cb D2 F2; harp F2 C3 F3 A3 C4 G4 A4 C5; vc A2 C3; vla F3 A3; vln G4 C5 A5; glass D5; flute D5 F5; glock C6 | **match_strike** @15.60, **mantle_whoomp** @16.40 |
| s09 stuck | 17.5-20 | -16.2 | cb trem D2; timpani D2; harp F2 C3 F3 A3 C4 G4 A4 C5; cb F2; vc C3; vc trem D3 G3; vla F3 A3; vla trem Bb3; vln G4 C5; flute E5 F5 | mantle_whoomp, **strain** @17.94 |
| s10 swell | 20-22.5 | -14.6 | timpani A1 D2; cb trem D2; trb D2 Eb3; tuba D2; cb spicc D2 Eb2 F2; vc trem D3 G3; horns D3; vc spicc D3 Eb3 F3; vla trem Bb3; vln trem Eb5 | **thunder** @21.03 |
| s11 lookout | 22.5-24.5 | -18.2 | trb D2 Eb3; tuba D2; cb trem D2; cb spicc D2 Eb2 F2; timpani D2; horns D3; vc spicc D3 Eb3 F3; vla F4; clar G4 A4; vln trem Eb5 | thunder, **wiper** @22.50, **creak** @22.58, **sleeve_wipe** @23.00 |
| s12 notch | 24.5-27 | -11.6 | cb A1 Bb1; timpani A1 Bb1; trb Bb1 D2 A2; cb trem D2; vc F2 A2 E3; harp F2 D3 F3 Bb3 Bb4; vc trem D3; vla D3 F3 C#4 E4; horns A3 C#4 D4; vln Bb3 A4 D5; vla trem D4; vln trem A4; flute D5 | **timp_roll** @24.53, **strain** @24.54, **clunk** @25.60, **sus_cresc** @26.13 |
| s13 sweep | 27-30.5 | -11.4 | cb F1 G1 Bb1 C2; trb Bb1 F2; timpani C2 F2; vc F2 G2; harp F2 G2 C3 D3 E3 F3 G3 A3 Bb3 C4 Bb4 C5; vla C3 D3 E3 F3 G3 A3; horns A3 Bb3 C4 D4 E4 F4; vln Bb3 C4 A4 Bb4 C5 D5 E5 F5; flute A4 Bb4 C5 D5 E5 F5 | sus_cresc |
| s14 seen | 30.5-32.5 | -13.1 | cb F1 Bb1 D2; cb spicc F1 C2 D2; trb Bb1; vc spicc C2 F2 D3; vc F2 A2 C3; timpani F2; vla D3 F3 A3 C4; horns F3 A3 D4; vln C4 F4 A4 C5 D5 E5 F5; harp C4 C5; flute D5 | sus_cresc, **lantern_creak** @31.15, **lantern_creak** @31.38, **lantern_creak** @31.62 |
| s15 mouth | 32.5-35.5 | -10.2 | cb F1 Bb1 C2 D2; cb spicc Bb1 C2 D2 F2; vc spicc C2 Bb2 C3 D3 F3; vc F2 G2 A2 C3; trb F2; timpani F2; vla D3 E3 F3 G3 A3 C4; horns F3 A3 Bb3 C4 D4; harp F3 G3 A3 Bb3 C4 D4 E4 F4 G4 A4 Bb4 C5 D5 E5 F5; vln Bb3 C4 D4 F4 A4 Bb4 C5 D5 F5 | **diesel** @32.50, **crash_ff** @34.62 |
| s16 crest | 35.5-38.5 | -11.1 | cb F1 D2; timpani A1 D2; trb D2 F2 A2 Eb3; cb spicc D2 Eb2 F2; tuba D2; vc F2 D3; vc spicc D3 Eb3 F3; horns F3 A3 C4 D4 Eb4 F4; vla A3 C4 Eb4; vla spicc D4 Eb4 F4; vln C5 F5; harp D5 E5 F5; vln trem D5 D6 | crash_ff, **thunder** @36.90, **bd_vsco_fff** @37.01 |
| s17 tired | 38.5-40.5 | -13.0 | cb spicc G1 A1 D2; timpani A1 D2; trb D2 A2 Eb3; cb D2; vc spicc G2 A2 D3; vc D3 E3 F3; bsn D3 E3 F3; vla Bb3 D4 Eb4; horns D4 Eb4 F4; oboe A4 Bb4; vln trem D6 | thunder, **creak** @38.53, **creak** @39.57 |
| s18 together | 40.5-43 | -11.9 | cb spicc F1 Bb1 C2 D2 E2; timpani A1 D2; cb Bb1 C2 D2; vc F2 G2 A2 E3; vc spicc F2 Bb2 C3 D3 E3; bsn A2 E3; vla D3 E3 F3 G3 A3 Bb3 D4; vla spicc F3 Bb3 C4 D4 E4; horns A3 C4 D4 F4 G4 A4; vln Bb3 C4 D4 | thunder, creak |
| s19 race | 43-46 | -11.0 | timpani A1 D2; cb D2; cb spicc D2 Eb2 F2; trb D2 D3 Eb3; tuba D2; cb trem D2; vc A2; vc spicc D3 Eb3 F3; vla F3 A3; horns A3 Bb3 D4 Eb4 F4 G4; vln D4; vla spicc D4 Eb4 F4; vln trem D5 D6 | **bd2_f** @43.00, **bd2_f** @43.80, **timp_roll** @44.50, **bd2_f** @44.60, **bd2_f** @45.40, **thunder** @45.41 |
| s20 break | 46-49 | -9.4 | timpani D2; trb D2 Eb3; tuba D2; cb trem D2; horns Bb3 Eb4 G4; vln trem D5 D6 | timp_roll, bd2_f, thunder, **suck_back** @46.08, **wave_break** @46.40, **surf** @46.60, **spray_fall** @46.71, **bow_burst** @46.90 |
| s21 surf | 49-51.5 | -11.7 | cb F1 Bb1; trb Bb1; timpani Bb1; vc F2 C3 D3; harp Bb2 F3 Bb3 D4 F4 Bb4 D5; vla F3 A3 Bb3; horns F3 Bb3 C4 D4; vln D4 F4 A4 Bb4 C5 D5 | thunder, wave_break, surf, spray_fall, bow_burst, **diesel** @49.00 |
| s22 flicker | 51.5-54 | -17.7 | cb F1 A1 D2; vc A2 C3 E3; vla F3 A3 C#4 E4; horns A3 D4; vln E4 A4 C5 D5; flute E5; harp A5 | wave_break, **spray_slap** @51.90, **flame_gutter** @51.90 |
| s23 pier | 54-57 | -13.9 | cb F#1 A1 C#2 D2; timpani D2; vc A2 D3 E3; vla D3 E3 F#3 A3 C#4; harp D3 A3 D4 F#4 A4 D5; horns F#3 A3 D4 E4 F#4; vln A3 C#4 D4 E4 F#4 A4 D5 E5 F#5; flute C#5 A5 D6 E6 F#6 | **lapping** @54.01, **pier_bump** @54.60, **lantern_creak** @55.23, **pier_bump** @55.45, **lantern_creak** @55.52, **lantern_creak** @55.92, **pier_bump** @56.30, **lantern_creak** @56.59 |
| s24 dad | 57-59.5 | -12.8 | cb F#1 G1 A1 D2; trb D2 A2; timpani D2; vc G2 A2; vla D3 E3 F#3 G3 A3; harp D3 F#3 A3 D4 F#4 A4 D5 F#5; vln A3 B3 C#4 D4 A4 B4 C#5 D5 A5; horns A3 B3 C#4 D4 F#4; flute A5 B5 C#6 D6 | lapping, pier_bump |
| s25 ruffle | 59.5-62.5 | -16.1 | cb G1 D2; trb D2 A2; vc pizz E2 F#2 G2 A2; vc A2; vla pizz B2 D3 E3; harp D3 F#3 A3 D4 F#4 A4 D5 F#5 A5 D6; vla F#3 G3 A3 B3 C#4; vln pizz G3 A3 B3 C#4; vln D4 E4 F#4 G4 A4 D5 A5; horns D4 F#4; clar A4 B4 C#5; flute D6 | **laugh_breath** @60.60, **fur_ruffle** @61.22 |
| s26 clearing | 62.5-66.5 | -18.6 | cb G1 B1 D2; vc F#2 A2 D3; vla D3 F#3 A3 B3 C#4 G4; horns A3; clar F#4 A4; vln A4 B4 D5 F#5 G5 A5 C#6 D6 E6 F#6 |  |
| s27 rhyme | 66.5-70.5 | -19.2 | cb D2; vc D2 A2; harp D3 G3 A3 B3 D4 F#4 G4 A4; vla F#3 A3; vln F#4 D5 F#5 A5 F#6; flute B4 F#5 A5 |  |
| s28 asleep | 70.5-73 | -22.2 | harp D2 D3 D4 F#4 A4; vc D2 A2; cb D2; vla F#3 A3 E4; vln A4; flute B4 C#5 D5 | **gulls** @71.51 |
