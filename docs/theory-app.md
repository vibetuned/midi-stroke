# Theory App — Design & Implementation

> Status: **implemented**. Read [architecture.md](architecture.md) first — this doc only
> describes what is *new* for the theory mode.

The Theory app is a **train & practice course player**: each course module pairs lesson
**videos** (train) with fill-in-the-blank **worksheet exercises** (practice). Unlike the
instrument apps it has no transport/game loop — the student *edits* a score instead of playing
along with one. Notes are entered from the reused **VirtualPiano**, a new **Circle of Fifths**
wheel, or a MIDI keyboard.

---

## 1. Visual layout

```
┌───────────────────────────────────────────────────────────────┐
│ header  (Back · "Midi Stroke" · module label · ◀ ▶ · 🎼 Course) │
├───────────────────────────────────────────────────────────────┤
│ exercise title · type/key/progress chips · instructions        │
│ ┌───────────────────────────────────────────────────────────┐ │
│ │  TheoryScoreView — white "paper", horizontal scroll,       │ │
│ │  fillable measures tinted, selected measure darker         │ │
│ └───────────────────────────────────────────────────────────┘ │
│ ✓ Check · 👁 Show answer · ⌫ Clear measure · ↺ Reset · ▶ Listen │
├───────────────────────────────────────────────────────────────┤
│ VirtualPiano (clickable)  ⇄  CircleOfFifths   (dock toggle)    │
└───────────────────────────────────────────────────────────────┘
```

Overlays: `CourseNavigator` (module list → videos + exercises, opens on entry like the
SongSelector) and `VideoSplash` (fullscreen player with a per-module playlist, auto-advance,
watched tracking).

## 2. Course content & manifest

Content lives in `public/courses/<course>/<NN-module>/`:

- `videos/*.mp4` — lesson videos.
- `exercises/<type>/<id>/` — `exercise.yaml` (title, instructions, key, …) +
  `worksheet.musicxml` (given notes, blanks) + `answer.musicxml` (model solution).

`npm run build:course-manifest` (`scripts/build-course-manifest.mjs`) scans this tree and
writes **`public/courses_files.json`** with the yaml metadata embedded, so the app needs no
YAML parser at runtime. Run it whenever course content changes. It also validates that every
worksheet/answer pair aligns measure-for-measure.

## 3. The slot model (`src/utils/musicxml.ts`)

Worksheet and answer come from the same generator: identical measures and rhythm. A **slot** is
one chord-event the student must complete:

- a whole-measure rest in the worksheet → every answer event in that measure is a slot with no
  given pitches;
- a chorale-style measure (melody given) → each event is a slot whose given pitches are a
  subset of the answer chord.

Rendering builds MusicXML from the **answer's rhythm skeleton**: given pitches stay black,
entered pitches are spliced in with a `color` attribute (Verovio renders it as fill), unfilled
slots become rests. Direction words always come from the **worksheet** (chorale/plan-design
answers carry the roman-numeral solution — rendering the answer's words would leak it; the
worksheet uses `?`). Checking compares MIDI pitch sets per slot (enharmonic-tolerant); matched
entries adopt the answer's spelling, unmatched ones are spelled by key signature.

Gotchas learned the hard way:

- Verovio ignores `color` on whole-measure rests — selection is signalled by the measure tint
  instead.
- Verovio renders `<dir>` words at 405 internal units (huge); there is no toolkit option, so
  `useTheoryExercise` rescales them to 210 in the SVG string and sets `measureMinWidth: 30`
  (the allowed max) to keep prompts from colliding.
- The score SVG only has a `viewBox`; it is sized by the `.theory-score-svg svg` CSS rule —
  don't size it from an effect (flaky on first mount).

## 4. Components (`src/components/theory/`)

| File | Role |
|---|---|
| `TheoryApp.tsx` | shell: manifest fetch, navigation, progress (localStorage `theory-progress-v1`), audio; `ExercisePanel` is keyed by exercise id so attempt state resets by remount |
| `useTheoryExercise.ts` | one exercise attempt: fetch/parse, entries per slot, selection, check/reveal, Verovio render |
| `TheoryScoreView.tsx` | injects the SVG, maps clicks on `g.measure` groups to slot selection, paints tint rects |
| `CircleOfFifths.tsx` | major/minor wheel; clicking a sector enters that tonic at a chosen octave; exercise key outlined |
| `CourseNavigator.tsx` | course overlay: modules → videos + exercises with ✓ progress |
| `VideoSplash.tsx` | fullscreen video player with playlist, ← → keys, auto-advance |

## 5. Instrument switch-points touched

`App.tsx` + `SplashScreen` unions (`'theory'`), `GameContext` instrument union,
`.theme-theory` / `.card-theory` CSS, and `VirtualPiano` gained two opt-in props
(`onNoteClick`, `highlightNotes`) — with neither set its behavior is unchanged for the piano
app. `useAudio` treats theory like piano (Salamander sampler). The piano range is set
per-exercise from the answer's pitch range (octave-aligned, ≥3 octaves) instead of via
`PianoSetup`.
