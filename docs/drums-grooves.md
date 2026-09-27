# Grooves — Design & Implementation

> Read [drums-app.md](drums-app.md) first. This doc covers the **🥁 Grooves**
> entry of the Drums song selector: the Groove MIDI Dataset's performances, put
> on a grid and written out as drum scores, and what the drums app does with a
> score longer than a pattern.
>
> Code: [src/utils/grooveMidi.ts](../src/utils/grooveMidi.ts) (reading, the grid, the notation, the URL),
> [src/components/drums/GrooveBrowser.tsx](../src/components/drums/GrooveBrowser.tsx) (UI),
> [src/utils/drumGrid.ts](../src/utils/drumGrid.ts) (the step grid),
> [scripts/build-groove.mjs](../scripts/build-groove.mjs) (the data),
> [scripts/check-groove.mjs](../scripts/check-groove.mjs) and
> [scripts/check-drum-grid.mjs](../scripts/check-drum-grid.mjs) (validation).

## 1. The recordings

The [Groove MIDI Dataset](https://magenta.tensorflow.org/datasets/groove) (Magenta,
Google; Gillick et al., ICML 2019; CC BY 4.0) is 1,150 MIDI files, 13.6 hours, some
22,700 bars: ten drummers playing a **Roland TD-11** electronic kit **to a click**.
What the files say about how they were made:

- **The click is the file's grid.** 480 ticks per quarter, one tempo — the stated bpm —
  and a time signature at tick 0; the first hit comes a median fiftieth of a beat after it.
  So bar lines and beats need no finding: they are where the MIDI says.
- **The hits are human.** Onsets sit a median 0.03 beats (some 20 ms) off the nearest
  sixteenth or triplet, 0.08 at the 90th percentile. Each drummer is a little ahead
  of the click or behind it — most takes between 30 ms ahead and 20 ms behind — and
  it drifts, by 40 ms over a take typically. The hi-hat foot often lands a good 50 ms
  ahead of the sticks.
- **Every zone is a note.** Head and rim of the snare and toms, bow and edge of each
  hi-hat and cymbal, the bell of the ride, the pedal: 22 notes where General MIDI
  would have a dozen.
- **Beats and fills.** 503 *beats* — a groove, from a few seconds to 23 minutes —
  and 647 *fills*, mostly a bar or two. 18 style families (rock, funk, jazz, Latin,
  hip-hop…), all but twelve takes in 4/4 (the others in 3/4, 6/8, 5/4 or 5/8).

The bundled copy is the MIDI files, unchanged, in `public/groove/midi/` (5.3 MB), and
`public/groove/index.json`: the dataset's `info.csv` plus each take's bars and swing
(below). `npm run build:groove` makes both from the download in `groove/`.

## 2. The grid (`quantize`)

The same idea as the Weimar solos' grids ([scripts/build-jazz-scores.py](../scripts/build-jazz-scores.py)):
**each beat gets the simplest grid that holds its hits** — quarters, eighths,
sixteenths, thirty-seconds; triplets, sextuplets — so a beat of eighths is not
written in sixteenths, and a triplet is a triplet.

1. **Where the drummer's beat is.** For each beat, the median distance of the hits
   within ±0.12 beats of a beat line, over the four beats either side, is the
   drummer's offset there; it comes off every hit. The hi-hat foot then comes off by
   its own lead. (Not the kick: it plays with the hands, and moving it pulls it off
   them — twice the collisions.)
2. **What each grid costs a beat**: how far its hits move, in units of human spread
   (18 ms), squared; plus how hard the grid is to read (sixteenths 2.5, triplets 3,
   thirty-seconds and sextuplets 7–10); plus 14 for two strokes of one drum pulled
   onto one point. A soft stroke has less say (weighted by its velocity up to 64): a
   ghost note between two sixteenths does not make a beat of thirty-seconds.
3. **The feel holds** (Viterbi over the beats): changing between straight and triplet
   grids costs 6, so a swung groove stays swung through a beat that could be read
   either way, and a straight one turns to triplets only where the playing plainly
   does. A grid finer than 45 ms a step is never used.
4. **Snap.** A hit at the end of its beat is the next beat's first. Two strokes of
   one drum on one point are one: a flam's grace note (under 40 ms apart), or a
   stroke the grid could not keep (counted as lost). Strokes softer than velocity 10
   are left out — the beater resting on the head.

Over the whole dataset: hits move 13 ms on average, 1.3 % of strokes are lost to the
grid, and 0.09 % loud ones. Funk and hip-hop come out in sixteenths, the Purdie
shuffle 93 % in triplets, a bembé all in triplets, bossa and samba straight.

The browser offers the grid **as played** (the above), **straight** (no triplets) or
**triplets** (nothing else).

## 3. The notation (`grooveMei`)

The app's drum positions ([drumPads.ts](../src/utils/drumPads.ts)), plus two a
drummer's chart has that its pattern libraries never needed:

| Voice | TD-11 notes | Written | |
|---|---|---|---|
| crash | 49 55 57 52 | a5 × | |
| open / closed hi-hat | 46 26 / 42 22 | g5 + / g5 × | |
| **ride** | 51 59 53 | **f5 ×** | top line |
| toms | 48 50 · 45 47 · 43 58 41 | e5 · d5 · a4 | |
| snare, cross-stick | 38 40, 37 | c5, c5 slash | |
| kick | 36 35 | f4 | stems down |
| **hi-hat foot** | 44 | **d4 ×** | below the staff, stems down |

- Hands in layer 1, stems up; feet in layer 2, stems down.
- Each beat of each layer on its own grid — the simplest of the beat's family that
  holds that layer's hits. Triplets as 3:2, sextuplets 6:4, beamed by the beat; the
  feet's tuplet number is left off where the hands' says it.
- A note lasts to the next one; what a value cannot hold is a rest. Rests inside a
  beat in both layers; a beat with nothing for the feet is blank. A stroke with
  nothing after it merges with the empty beats that follow into a half or a whole on
  the strong beats.
- **Dynamics**: every note carries its `@vel` — playback and the kit sound it
  (utils/playback.ts) — and a snare or tom stroke under half its drum's usual level
  is a ghost note, in brackets (`@head.mod="paren"`); a hand stroke 30 % above its
  usual and past 110, an accent.
- `midi.bpm` and ♩ = *bpm* on the first bar; no count-in (the app adds its own).

## 4. In the app

**URL**: `groove:<drummer>.<session>.<take>-<grid>[-b<from>-<to>]`, for instance
`groove:drummer1.session1.239-auto-b33-64`. [songUrl.ts](../src/utils/songUrl.ts)
hands it to `grooveMeiForUrl`, which fetches the index and the take's MIDI once each.

**The browser** ([GrooveBrowser.tsx](../src/components/drums/GrooveBrowser.tsx)):
beats, fills or both; style, tempo, length, feel and drummer; the take's style,
drummer, tempo, meter, length, feel and whether it loops; the grid; for a take of
more than 48 bars, a part — 32 bars at a time — or up to 128 bars the whole take; a
preview of four bars, ▶ Listen to eight, and Start.

**Playing through.** A drum score of up to four bars is a pattern and loops, as the
library's always have; anything longer — a groove, a part, an uploaded chart — plays
through once and stops at the end, as a piece does on the piano
([useMidiFile.ts](../src/hooks/useMidiFile.ts), `drumScoreLoops`). A loop range on the
transport still loops a passage of it.

**The score scrolls** when it is wider than the screen
([DrumsScoreView.tsx](../src/components/drums/DrumsScoreView.tsx)): the cursor stays
at 12 % of the width and the music comes to it, as on the saxophone; dragging the page
moves through it. A pattern that fits stays centred with the cursor sweeping it.

**The step grid rolls** ([drumGrid.ts](../src/utils/drumGrid.ts),
[VirtualDrums.tsx](../src/components/drums/VirtualDrums.tsx)). It keeps its columns
— 16 sixteenths, 12 triplet eighths when a 4/4 is played more in triplets than in
sixteenths, 12 eighths in 12/8, 8 sixteenths in 2/4 — and never moves: as the
playhead leaves a column, the column turns to the same step of the next bar. Ahead
of the cursor, the rest of this bar; behind it, faintly shaded, the start of the
next. A pattern reads round and round; a groove reads as it goes; with a loop range,
its first bar follows its last. The grid is built from the timemap now, not the
MEI, so it follows what the app plays — repeats written out, generated and uploaded
scores. Two rows are new: **RD**, the ride on the top line, and **HF**, the hi-hat foot.

**Scoring.** Rhythm mode reads a written drum as the drum it stands for — where its
voice is notated, as practice mode already waited — so the ride on the top line
scores with the cymbals and the hi-hat foot with the hi-hat
(`drumScorePosition` in [drumMap.ts](../src/utils/drumMap.ts)). For every place the
libraries write a drum, that is where it is written: nothing else changes.

## 5. Credits and licence

[public/groove/CREDITS.md](../public/groove/CREDITS.md). CC BY 4.0: the dataset is
credited in the credits, the index, every score's header and the browser, with the
changes stated — put on a grid, flams merged, the softest strokes left out, the pads
read as the app's drums. The MIDI files are shipped unchanged.

## 6. Validation

`npm run check:groove` — every one of the 1,150 takes put on the grid, written out
and read back through Verovio as the app reads it: exactly the hits the grid placed,
each at its time on its drum, the right noteheads, bars that are all full, the index's
bar counts; the grid's losses and moves within bounds; the pads sounding and scoring
each voice as its drum; the grid's own cases (straight, swung, behind the click, a
flam, forced feels), the notation's (a sextuplet, a triplet after a rest, a half note,
a blank kick bar, the tempo, a part) and the URL. About two minutes; `--quick` takes
one in ten.

`npm run check:grid` — the step grid on all 518 library charts exactly as the old
MEI-parsing grid had it (the old parser is kept in the check to compare); the rolling
view through a looping pattern, a long score and a loop range; the grooves' 16 and 12
columns and their RD and HF rows.
