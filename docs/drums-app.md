# Drums App

> Read [architecture.md](architecture.md) first for the shared engine, and [piano-app.md](piano-app.md)
> for the reference implementation. This doc covers what the Drums app does *differently*.

> The app also ships a **pattern generator** — a 16-step sequencer with
> Euclidean, Bernoulli, shift-register, Markov and cellular-automaton engines
> behind it. It has its own document: [drums-patterns.md](drums-patterns.md).
>
> And **Grooves**: the 1,150 performances of Magenta's Groove MIDI Dataset, put on
> a grid and written out, beats of up to twenty minutes and fills of a bar or two —
> with what the app does with a score longer than a pattern (it plays through, the
> score scrolls, the grid rolls). Its document: [drums-grooves.md](drums-grooves.md).

The Drums app trains rhythm patterns, built for the **Yamaha FGDP-50** finger-drum pad (any
GM-style pad controller works — see the pad maps below). Most scores are short looping patterns
(1–2 measures), so instead of a scrolling keyboard it shows a **step-sequencer grid** that lights
up column by column; the grooves are whole performances, and play through.

---

## 1. Component tree

```
DrumsApp                       src/components/DrumsApp.tsx
├── StartOverlay
├── SongSelector               from public/drums_files.json
│   ├── DrumPatternBuilder     🎛 Pattern generator (drums-patterns.md)
│   └── GrooveBrowser          🥁 Grooves (drums-grooves.md)
├── StatsPanel (modal)
├── header                     "Midi Stroke - Drums" · LiveStats · SongNavigator · stats
├── main
│   ├── MidiStatus
│   └── DrumsScoreView         centred notation (top, 25vh)
├── VirtualDrums               step-sequencer grid (bottom)
└── PlayControls
```

Root div uses `className="app-container theme-drums"` (red accent). Hooks:
`useAudio()`, `useDrumsMidiFile()`, **and an explicit `useGameLogic()`** (drums don't render
`expectedNotes` on a keyboard, so the app calls it directly).

---

## 2. Differences from Piano

| Aspect | Piano | Drums |
|---|---|---|
| Staves / voices | Grand staff, 2 tracks | Single percussion staff |
| Hand selection | Yes | **None** (`activeHand` forced to `'both'`) |
| Key-range setup | `PianoSetup` required | **None** — no `PianoSetup`, `SongSelector` not gated on `pianoRange` |
| Note identity | MIDI pitch == score pitch | MEI pitch **remapped** to drum-pad MIDI |
| Song end | Pause + reset to 0 | **Loop** (`seek(144)`) for a pattern of up to 4 bars; longer, pause + reset to 0 |
| Score view | Scrolls under a fixed cursor; sticky clef; minimap; hand overlays | Centred, only the cursor sweeping; scrolls under a fixed cursor when wider than the screen |
| Theme | purple `#646cff` | red `#f5576c` (`.theme-drums`) |

### Pitch remapping
Drum notation encodes each instrument as a *pitch + notehead shape* on the percussion staff (e.g.
bass drum = `f4`, snare = `c5`, closed hi-hat = `g5` with an `x` head). Two maps bridge notation
and pads:
- `padForScoreNote` / `MEI_TO_PAD` ([drumPads.ts](../src/utils/drumPads.ts)): notation MIDI (and
  notehead) → the General MIDI pad. `useDrumsMidiFile()` uses it for the practice pauses, and
  playback uses it so the score sounds on the right voices.
- The pad map ([drumMap.ts](../src/utils/drumMap.ts)) goes the other way: controller note → kit voice
  → where that voice is notated. It is what `useGameLogic()` matches an incoming hit through, and
  what the live kit sounds. It starts as General MIDI and is edited in the 🥁 panel
  ([DrumMapEditor.tsx](../src/components/drums/DrumMapEditor.tsx)).
- Rhythm mode reads the score's note the same way, as the drum it stands for
  (`drumScorePosition`: note → pad → voice → where that voice is notated), which is how practice
  mode always waited. For the positions the libraries use that is where the note is written; the
  grooves add two that are not — the **ride on the top line** (f5 ×, pad 51) and the **hi-hat
  foot below the staff** (d4 ×, pad 44) — which score as the cymbal and the hi-hat.

---

## 3. DrumsScoreView specifics

[DrumsScoreView.tsx](../src/components/drums/DrumsScoreView.tsx) is a stripped-down `ScoreView`:
no sticky clef, no minimap, no hand overlays. A pattern that fits is **centred** in the
viewport (`offsetX = (innerWidth - scoreWidth*scale) / 2`) and the cursor sweeps across it. A score
wider than the screen — a groove — **scrolls**: the cursor stays at 12 % of the width and the page
moves under it, as on the saxophone, and dragging the page seeks.
Verovio options use a larger `scale: 85` and the scale-factor cap is `1.5` (vs piano's `1`) since
patterns are small and benefit from being drawn bigger.

---

## 4. VirtualDrums specifics

[VirtualDrums.tsx](../src/components/drums/VirtualDrums.tsx) is a **grid sequencer**, not a live
controller; its logic is [drumGrid.ts](../src/utils/drumGrid.ts), pure and checked
(`npm run check:grid`). It:

1. **Reads the timemap** — the same one the score view loaded — for each onset's notes (pitch,
   notehead, fill) and the bars' ticks. (It used to re-parse the MEI itself; the timemap follows
   whatever is played — repeats written out, generated, uploaded and groove scores — and on all
   518 library charts puts every hit in the same cell as before.)
2. Derives the columns from the meter, and keeps them: 16 sixteenths in 4/4, **12 triplet eighths
   when a 4/4 is played more in triplets than in sixteenths**, 12 eighths in 12/8, 8 in 2/4.
3. Identifies each note's row by written pitch + notehead (+ fill for the f5 diamonds) — the drums
   analogue of a fingering table — including the grooves' **RD** (ride, f5 ×) and **HF** (hi-hat
   foot, d4 ×).
4. Renders a row per drum the score uses, a column per step with a darker line on each beat, an
   SVG glyph (`circle`/`cross`/`plus`/`diamond`/`slash`) where a hit lands, and **rolls**: the grid
   never moves, and as the playhead leaves a column, the column turns to the same step of the next
   bar (faintly shaded). Ahead of the cursor, the rest of this bar; behind it, the start of the
   next — round again for a looping pattern, on through a groove, back to a loop range's first bar.

> **Relevance to Saxo:** the grid's rows table (`ROWS` in drumGrid.ts) is the closest existing pattern to what `VirtualSaxo` needs —
> a static table mapping a musical event to a visual representation. The Saxo table maps a **MIDI
> note → set of pressed keys** (a fingering), rendered as a minimalist sax body. See
> [saxo-app.md](saxo-app.md).
</content>


---

## The drum kit (what a pad sounds like)

Pads used to play the **Salamander piano sampler** — a pad hit came out as a piano
note at whatever pitch that pad mapped to. They now play a synthesized kit:
[src/utils/drumKit.ts](../src/utils/drumKit.ts), created by `useAudio()` when
`instrument === 'drums'`.

**Why synthesis rather than samples.** The app notates twelve voices (kick, snare,
rim, closed and open hi-hat, ride/crash, three toms, clap, cowbell, tambourine).
The drum sample kits on the Tone.js CDN — the same host the piano samples come
from — carry six: kick, snare, hi-hat and three toms. Half the kit would have been
silent or wrong. Synthesis covers all of it in one character, needs no download,
and works offline in the desktop app, where the piano samples do not.

**How it is built.** Membrane synths for the kick and toms, noise through an
envelope and a filter for the snare wash, hats, rim, clap and tambourine, an
oscillator bank at inharmonic ratios for the ride and crash, and two squares
through a band-pass for the cowbell. Every voice is velocity-sensitive; a closed
hi-hat chokes the open one, as the pedal does; and the whole kit runs into a
limiter, because kit pieces land on the same beat constantly and four
full-velocity hits used to sum past full scale.

> ⚠️ Tone's `MetalSynth` is **not** used, despite being the obvious choice for
> cymbals: in this version a bare `MetalSynth` stays silent for about a second
> after being triggered and then bursts. Measured in the lab page below, in every
> configuration including the default.

**Pads.** `PAD_TO_VOICE` covers the General MIDI percussion numbers, alternates
included (both snare pads, all the cymbal pads, both pads per tom), so every pad
on a GM controller makes the sound it is labelled.

### Checking it without ears

[dev/drum-kit-lab.html](../dev/drum-kit-lab.html) is a dev page: run `npm run dev`
and open `/dev/drum-kit-lab.html`. It gives you a button per voice to audition,
and renders each voice offline to measure its level, its onset, how long it rings
to −40 dB, and its spectral centroid, checking each against the range that makes
it that instrument. It also verifies that four voices at once stay inside full
scale, that the hi-hat choke works, and that velocity is doing something.

Measured with the current kit:

| voice | peak | rings | centroid |
|---|---|---|---|
| kick | 0.37 | 0.26 s | 61 Hz |
| snare | 0.36 | 0.07 s | 1.2 kHz |
| closed hat | 0.27 | 0.02 s | 7.8 kHz |
| open hat | 0.22 | 0.21 s | 9.4 kHz |
| ride | 0.21 | 0.70 s | 4.3 kHz |
| crash | 0.24 | 1.03 s | 3.1 kHz |
| toms (low/mid/high) | 0.28 | 0.25 s | 54 / 70 / 103 Hz |
| rim, clap, cowbell, tambourine | 0.18–0.25 | 0.02–0.08 s | 1.4–2.7 kHz |

Four voices at full velocity peak at 0.82, so nothing clips.

Its sibling [dev/playback-lab.html](../dev/playback-lab.html) checks the other half of the
sound: that score **playback** schedules the right notes at the right times, and that a drum
score going out as MIDI becomes the right General MIDI pads on channel 10.
