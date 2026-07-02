# Saxo App — Design & Implementation

> Status: **implemented**. Read [architecture.md](architecture.md),
> [piano-app.md](piano-app.md), and [drums-app.md](drums-app.md) first — this doc only describes
> what is *new* for the saxophone.

The Saxo app is a **single-voice melodic** trainer. Musically it behaves like the Piano app with
one staff (treble only), but the screen is laid out as a **left/right split**: a large scrolling
score on the right and a minimalist **saxophone fingering display** on the left.

> ⚠️ Terminology: a saxophone has **keys / tone holes**, not "valves" (those are brass). This doc
> uses "keys". The `VirtualSaxo` shows which keys are closed for the current note — a live
> fingering chart.

---

## 1. Visual layout

```
┌───────────────────────────────────────────────────────────┐
│ header  (Back · "Midi Stroke - Saxo" · LiveStats · Nav · 📊) │
├──────────────┬────────────────────────────────────────────┤
│              │                                              │
│  VirtualSaxo │   SaxoScoreView                              │
│   ~1/4 width │     ~3/4 width — single staff, scrolling     │
│  (fingering) │     (larger than piano: one voice → bigger)  │
│              │                                              │
├──────────────┴────────────────────────────────────────────┤
│ PlayControls  (mode toggle · transport · shortcuts)          │
└───────────────────────────────────────────────────────────┘
```

This is the key structural departure from Piano/Drums, which stack the score *above* the virtual
instrument. Here `main` is a **horizontal flex row**: `VirtualSaxo` (`flex: 0 0 25%`) + a
`SaxoScoreView` (`flex: 1`). Because there is only one staff, the score can use a larger Verovio
`scale` and fill the taller area comfortably.

No `PianoSetup`, no hand-selection toggle, no minimap-hand-overlays.

---

## 2. Reusing piano scores — the offline MEI adaptation pipeline ✅ built

**Decision: this is done offline, not at runtime.** A Node script pre-bakes transformed MEI into
`public/saxo/<collection>/*.mei` and writes a curated `public/saxo_files.json`. The runtime loading
(`SaxoScoreView`) and selection (`SongSelector`/`SongNavigator`) code then treats saxo scores
exactly like piano scores — **no per-load transformation, no special-casing**.

Script: [scripts/build-saxo-scores.mjs](../scripts/build-saxo-scores.mjs) — run with
`npm run build:saxo`. It uses the Node Verovio build for transposition and `@xmldom/xmldom` for the
structural surgery, then **re-renders each output to validate it**. For every source file:

1. **Transpose** (key-signature aware) via Verovio: `setOptions({ transpose: 'M6' })`,
   `loadData(mei)`, `getMEI({})`. Verified that `getMEI()` bakes the transposition — a C-major
   treble `e4 e4 d4` becomes `c5 c5 b4` under a new `3s` (A-major) key signature, i.e. sounding up
   a major sixth. The derived MIDI (`renderToMIDI()`) reflects the same transposition, so notation,
   playback, and hit-detection all agree. *(This resolves the old "where does transposition happen"
   question — Verovio is consistent across SVG and MIDI.)*
2. **Drop the bass staff.** Remove `<staffDef n="2">`, every `<staff n="2">`, and anything with
   `@staff="2"`. Result: a single treble staff.
3. **Flatten chords to one voice.** Replace each `<chord>` with its **top** note (the melody),
   migrating the chord's timing attributes onto the surviving note.
4. **Strip fingerings & dangling refs.** Remove `<fing>` (piano-specific, references both staves),
   then drop any control event (`slur`/`tie`/`dir`…) whose `startid`/`endid`/`plist` now points at
   a deleted element.
5. **Validate.** Re-render to SVG + MIDI; report written range, residual chords/staff-2 (must be 0),
   and that the `n="0"` count-in measure survives.

The output is plain single-staff MEI that flows through the existing ScoreView pipeline unchanged.

### Curated first set (8 files, alto, written A4–E5)
All in `public/saxo/first_two_hand_exercises/`, listed in `public/saxo_files.json`:

| File | Notes | Why |
|---|---|---|
| 001 Czerny Op.824 Nr.1 | 29 | classic study |
| 005 Beyer Op.101 Nr.8 | 62 | melodic study |
| 007 Beyer Op.101 Nr.10 | 60 | melodic study |
| 014 Gubben Noak (folk) | 38 | recognizable tune |
| 015 Hänschen klein (folk) | 49 | recognizable tune |
| 021 Der Kuckuck und der Esel (folk) | 41 | recognizable tune |
| 022 Hänsel und Gretel (folk) | 46 | recognizable tune |
| 105 Czerny Recreations Nr.3 | 28 | **chord-flatten test** (23 chords → melody) |

A survey of all 188 piano files found 105 whose transposed treble fits a comfortable alto range;
the script's `SOURCES` array is the curation knob — add more by editing it and re-running. Pick
pieces whose **melody is in the treble** (right hand): a "b"-variant left-hand study like
`080_..._Op_27_Nr_1b` collapsed to 8 repeated notes because its melody lived in the dropped bass —
the validation report's note-count / range columns flag such degenerate cases.

---

## 3. Transposition

Saxophones are transposing instruments. The printed part sounds *lower* than written:

| Sax | Key | Written → sounding | Concert → **written** (what we apply) |
|---|---|---|---|
| **Alto** (default) | E♭ | sounds a major 6th lower | transpose **up M6** (+9 semitones) |
| Tenor | B♭ | sounds a major 9th lower | transpose **up M9** (+14 semitones) |
| Soprano | B♭ | sounds a major 2nd lower | transpose up M2 (+2 semitones) |

Our piano source is in **concert pitch**, so to show an authentic sax part we transpose the
notation **up** by the instrument's interval. **Default: Alto saxophone, up a major sixth.**

After transposition the baked scores live entirely in the **written domain**: the score SVG, the
derived MIDI, `expectedNotes`, and the fingering chart are all in written pitch.

### Input domain — the TravelSax wind controller

The target input device is a **TravelSax** (Odisei Music) digital wind controller, not a piano-style
keyboard. It is played with **saxophone fingerings** and emits MIDI notes. The only question that
matters for hit-detection is whether it emits the **written** note or the **sounding/concert** note:

- If the TravelSax is configured **non-transposing** ("concert C" / written output), the note you
  finger arrives as the literal written MIDI number → it matches the baked (written) score directly.
- If it is left in **true-alto** mode, fingering written A4 emits sounding C4 (MIDI 60), a major
  sixth below the written A4 (MIDI 69) the score expects.

To stay robust against either configuration, the saxo path applies **one configurable offset** to
incoming notes before comparison:

```ts
// useGameLogic.ts — applied to incoming notes in the saxo path
export const SAXO_INPUT_TRANSPOSE_SEMITONES = 12;
const incoming = rawMidiNote + SAXO_INPUT_TRANSPOSE_SEMITONES;
```

**Measured value: `+12`.** The `VirtualSaxo` panel has a built-in calibration readout: with a song
loaded (paused), it shows the expected written note + its fingering, plus `played: <note>` and
`⇒ offset <N>` for whatever the controller last sent. Fingering the displayed note on the TravelSax
produced the **written pitch class one octave below the staff** (e.g. written C#5/73 → device C#4/61),
i.e. the device is non-transposing but an octave low → offset `+12`. The readout turns green when the
last note matches the configured offset. (Alternatively, raise the TravelSax octave by one and set
the constant to `0`.) It's a single shared constant, imported by both `useGameLogic` and `VirtualSaxo`.

### Range
Alto written range ≈ **B♭3–F6**. The curated first set (§2) is deliberately A4–E5, well inside both
the instrument range and the basic fingering table, so no clamping/octave-folding is needed yet.
When broadening the song list, either keep within range via curation or have `VirtualSaxo` degrade
gracefully for out-of-range notes (palm-key fingerings, or a neutral "—").

---

## 4. VirtualSaxo — the fingering display

A minimalist saxophone rendered as SVG, with a **MIDI-note → pressed-keys** lookup table — the
structural analogue of the drums' `DRUM_MAP`. The display is driven by `expectedNotes` from
`useGameLogic()` (what to play next) and optionally `activeNotes` from `useMidi()` (what's pressed).

### Key model (minimalist)
Seven indicators, top-to-bottom, mirroring the real instrument:

```
   ○  Octave key   (left thumb)
  ━━━
   ●  Key 1  B     (left index)
   ●  Key 2  A     (left middle)
   ●  Key 3  G     (left ring)
  ━━━
   ●  Key 4  F     (right index)
   ●  Key 5  E     (right middle)
   ●  Key 6  D     (right ring)
```

Filled = closed/pressed. This 6-keys-plus-octave set covers the core diatonic range; sharps/flats,
low pinky keys (C/B/B♭) and high palm keys are extensions to add later.

### Starter fingering table (written pitch)

```ts
// src/components/saxo/saxoFingering.ts
// MIDI note → which of [oct, k1, k2, k3, k4, k5, k6] are closed
const SAXO_FINGERING: Record<number, SaxoKeys> = {
  62: { keys: [1,2,3,4,5,6], oct: false }, // D4
  64: { keys: [1,2,3,4,5],   oct: false }, // E4
  65: { keys: [1,2,3,4],     oct: false }, // F4
  67: { keys: [1,2,3],       oct: false }, // G4
  69: { keys: [1,2],         oct: false }, // A4
  71: { keys: [1],           oct: false }, // B4
  72: { keys: [2],           oct: false }, // C5
  74: { keys: [1,2,3,4,5,6], oct: true  }, // D5  (= D4 + octave key)
  76: { keys: [1,2,3,4,5],   oct: true  }, // E5
  77: { keys: [1,2,3,4],     oct: true  }, // F5
  79: { keys: [1,2,3],       oct: true  }, // G5
  // … chromatic notes + extremes filled in during implementation
};
```

`VirtualSaxo` looks up the (single) expected note, resolves its key set, and renders the sax body
with those indicators filled. The whole widget lives in the left 1/4 column. Use the saxo accent
colour for the "expected" highlight (see §6).

> A monophonic instrument expects **one note at a time**; if `expectedNotes` ever contains more
> than one (it shouldn't, post-chord-flatten), show the first/highest.

---

## 5. Audio / timbre

[useAudio.ts](../src/hooks/useAudio.ts) currently always loads the Salamander piano sampler. For a
sax timbre, make the sampler instrument-aware: branch on `instrument` to pick a sax sample set, or
(faster to prototype) fall back to a `Tone.Synth`/`Tone.FMSynth` voiced to approximate a reed. This
is **cosmetic for the MVP** — leaving the piano sampler works for scoring and is acceptable for a
first cut. Track it as a polish task.

---

## 6. Concrete edits (the switch-point checklist)

Walking the table from [architecture.md](architecture.md) §9:

1. **[App.tsx](../src/App.tsx)**
   - Widen state: `useState<'splash' | 'piano' | 'drums' | 'saxo'>`.
   - Add branch: `if (currentApp === 'saxo') return <StatsProvider><GameProvider instrument="saxo"><SaxoApp onBack={…}/></GameProvider></StatsProvider>;`

2. **[GameContext.tsx](../src/context/GameContext.tsx)**
   - `instrument: 'piano' | 'drums' | 'saxo'` in `GameState` and the `GameProvider` props union.
   - Decide the playback hook: reuse `useMidiFile()` (it filters by `handSelection`, which defaults
     fine if we force `'both'` for saxo), or add a thin **`useSaxoMidiFile()`** that mirrors the
     piano loop without hand filtering and with end-of-song = pause+reset. **Recommendation:** reuse
     `useMidiFile()` and ensure `handSelection` is `'both'` for saxo (it already is unless the user
     toggles it — and we hide the toggle).

3. **[SplashScreen.tsx](../src/components/SplashScreen.tsx)**
   - Widen `onSelectApp` prop union to include `'saxo'`.
   - Add a `card-saxo` card (🎷) calling `onSelectApp('saxo')`.

4. **[useGameLogic.ts](../src/hooks/useGameLogic.ts)**
   - `activeHand`: already `'both'` for non-piano — no change needed.
   - Note remap: drums remap via `MIDI_PAD_MAP`; saxo instead adds the **`SAXO_INPUT_TRANSPOSE_SEMITONES`
     offset** (§3) to the incoming note before matching, gated on `instrument === 'saxo'`. Default `0`.

5. **[PlayControls.tsx](../src/components/PlayControls.tsx)**
   - Hand-selection UI is gated on `instrument === 'piano'`, so it's automatically hidden for saxo.
     Verify no other piano-only assumption leaks in.

6. **[SongSelector.tsx](../src/components/SongSelector.tsx)** / **[SongNavigator.tsx](../src/components/SongNavigator.tsx)**
   - Both fetch `/${instrument}_files.json` → `/saxo_files.json` (**already generated**, §2). The
     piano-range gate (`instrument === 'piano' && !pianoRange`) doesn't apply to saxo, so the
     selector shows immediately. No code change expected — verify the grouping UI looks right.

7. **[index.css](../src/index.css)**
   - Add a `.theme-saxo` block (suggest a gold/brass accent, e.g. `--color-accent: #d4a017`), and a
     `.card-saxo` style in [SplashScreen.css](../src/components/SplashScreen.css).

8. **[useAudio.ts](../src/hooks/useAudio.ts)** — optional sax timbre (see §5).

---

## 7. New files & folders

```
scripts/
  build-saxo-scores.mjs  ✅ DONE — offline adapter (npm run build:saxo)

public/
  saxo_files.json        ✅ DONE — generated manifest (8 curated files)
  saxo/
    first_two_hand_exercises/*.mei  ✅ DONE — baked single-staff, transposed scores

src/components/saxo/     ✅ DONE (runtime phase)
  SaxoApp.tsx            ✅ PianoApp-style, main = horizontal split; useMidiFile() ('both')
  SaxoScoreView.tsx      ✅ ScoreView fork, single-staff, container-width math; baked MEI as-is
  VirtualSaxo.tsx        ✅ minimalist sax SVG + fingering, driven by expectedNotes
  saxoFingering.ts       ✅ SAXO_FINGERING table + key model types

docs/
  saxo-app.md            ← this file
```

> Because adaptation is **offline**, `SaxoScoreView` loads the baked `saxo/...` MEI with **no
> transform step** — the only fork from `ScoreView` is the layout/width math below.

### `SaxoScoreView` vs `ScoreView`
Fork `ScoreView` and:
- Load the baked saxo MEI directly (no runtime adaptation).
- Remove the grand-staff hand-overlay block (single staff → no midpoint).
- Keep the sticky clef + minimap (still useful) or trim to taste.
- Bump Verovio `scale` (single staff has vertical room; ~80–90 like drums).
- **Main porting detail:** the piano view assumes the score spans the full `window.innerWidth`
  (fixed-cursor X, drag bounds, scroll math all use `window.innerWidth`). In the saxo layout the
  score lives in the right 3/4 **column**, so these must switch to the score container's measured
  width. Plumb a container `ResizeObserver`/ref width through instead of `window.innerWidth`.

---

## 8. Phased implementation plan

0. ✅ **Offline score pipeline** — `scripts/build-saxo-scores.mjs`, baked
   `public/saxo/first_two_hand_exercises/*.mei`, generated `public/saxo_files.json`. Validated:
   single staff, no chords, count-in preserved, written range A4–E5, transposition correct. *(done)*
1. ✅ **Scaffolding** — `saxo` added to the 4 type unions, splash card + gold `.card-saxo`, route in
   `App.tsx`, `.theme-saxo` accent. *(done)*
2. ✅ **`SaxoScoreView`** — `ScoreView` fork; baked MEI loaded as-is; hand overlays dropped;
   `window.innerWidth` → `app.screen.width` so cursor/scroll/drag work in the 3/4 column;
   single-staff render at Verovio `scale: 80`, scale cap 2. *(done)*
3. ✅ **`SaxoApp`** — left/right `main` layout (VirtualSaxo 1/4 + SaxoScoreView 3/4); reuses
   header/PlayControls/SongSelector/StartOverlay; `useMidiFile()` with default `'both'`. *(done)*
4. ✅ **`VirtualSaxo` + `saxoFingering.ts`** — minimalist sax SVG; A4–E5 fingering table; driven by
   `expectedNotes`; `SAXO_INPUT_TRANSPOSE_SEMITONES` wired in `useGameLogic` (default 0). *(done)*
   - Verified headless (CDP): splash→saxo→song loads; score renders transposed to A major; the
     expected note's keys light up (C#5→all-open, B4→key 1); no runtime exceptions.
   - ✅ Input offset measured against a real TravelSax via the calibration readout = `+12`.
   - ⏳ **Still TODO here:** source the awkward chromatic fingerings (bis Bb, fork F#) from a chart.
5. **Polish** — ✅ sax timbre in `useAudio` (saxo uses a reed-ish sawtooth `PolySynth` + lowpass +
   vibrato instead of the piano sampler); ✅ `VirtualSaxo` redrawn as a thin **outline** sax with the
   **full key layout** (octave, front F, bis, B/A/G + F/E/D stacks, palm cluster, side keys, left
   pinky table, F♯ alternates, low Eb/C) — pressed keys light gold per note. ⏳ remaining: broaden the
   curated set + fingering range, fine-tune score vertical sizing.

---

## 9. Decisions & open questions

**Decided / resolved:**
- ✅ **Sax default = Alto (E♭, transpose up M6).** Single constant (`SAX.interval`) in the build
  script; Tenor/Soprano are config flips later.
- ✅ **Adaptation is offline** (build script + baked `public/saxo/`), keeping runtime loading clean.
- ✅ **Chord flatten = top note** (the melody).
- ✅ **Verovio transpose is consistent** across `getMEI()`/SVG and `renderToMIDI()` — verified, so
  no hand-rolled pitch math needed.
- ✅ **First range = A4–E5** via curation; no clamping/octave-folding required for the MVP set.

**Decided / resolved (cont.):**
- ✅ **TravelSax input offset = `+12`** — measured via the `VirtualSaxo` calibration readout: the
  controller sends the written pitch class one octave below the staff (§3). Shared constant in
  `useGameLogic`, also used for the panel's "held" cue.

**Still open:**
- **Audio timbre** — keep the piano sampler for the MVP, or wire a sax sample set / reed synth in
  `useAudio` (§5). Cosmetic; deferred.
- **Broadening the song list** — when going past A4–E5, extend the `VirtualSaxo` fingering table to
  the chromatic + altissimo/low-pinky range, and add a graceful out-of-range fallback.
</content>
