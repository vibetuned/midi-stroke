# Midi Stroke — Architecture Overview

This document describes the **shared engine** that every instrument app (Piano, Drums, and
the planned Saxo) is built on. Read this first; the per-instrument docs
([piano-app.md](piano-app.md), [drums-app.md](drums-app.md), [saxo-app.md](saxo-app.md))
only describe what each app does *differently*.

---

## 1. What the app does

Midi Stroke is a sight-reading / rhythm trainer. It:

1. Loads a music score (an **MEI** file) and renders it to an SVG with **Verovio**.
2. Renders that SVG as a horizontally-scrolling "score view" on a **Pixi.js** canvas, with a
   fixed playhead/cursor.
3. Derives a **MIDI** performance from the same MEI (also via Verovio) and plays it back through
   **Tone.js**, driving a metronome and the on-screen scroll.
4. Listens to a connected **MIDI instrument** (Web MIDI API) and compares what the player presses
   against what the score expects, scoring hits / misses / wrongs.
5. Shows a per-instrument "virtual instrument" widget that lights up the keys/pads/keys the player
   should press next.

There are two game modes:

- **`standard`** (a.k.a. *rhythm*): playback runs continuously; you must hit each note within a
  timing window.
- **`practice`**: playback pauses on each note-group and waits until you press the correct
  note(s), then resumes.

---

## 2. Tech stack

| Concern | Library |
|---|---|
| UI | React 18 + TypeScript + Vite |
| Notation rendering | [Verovio](https://www.verovio.org/) (WASM) — MEI → SVG and MEI → MIDI |
| Score canvas | Pixi.js (SVG rasterised into sliced textures) |
| Audio / transport / timing | Tone.js |
| MIDI parsing | `@tonejs/midi` |
| MIDI input | Web MIDI API (`navigator.requestMIDIAccess`) |

---

## 3. Entry & routing

```
main.tsx → App.tsx
                ├── 'splash' → <SplashScreen onSelectApp=… />
                ├── 'piano'  → <StatsProvider><GameProvider instrument="piano"><PianoApp/></…></…>
                └── 'drums'  → <StatsProvider><GameProvider instrument="drums"><DrumsApp/></…></…>
```

- [App.tsx](../src/App.tsx) keeps a single state: `currentApp: 'splash' | 'piano' | 'drums'`.
- [SplashScreen.tsx](../src/components/SplashScreen.tsx) shows one card per instrument and calls
  `onSelectApp('piano' | 'drums')`.
- **`StatsProvider` wraps `GameProvider`** so stats persist across instrument switches.
- The `instrument` prop on `GameProvider` is the single source of truth for which instrument is
  active. It is **read-only** to consumers — set once at mount.

> **Adding an instrument touches the routing in 4 type unions** (see the switch-point table in
> §9). This is the seam the Saxo app plugs into.

---

## 4. State — `GameContext`

[src/context/GameContext.tsx](../src/context/GameContext.tsx) exposes `useGame()`. The most
relevant fields:

| Field | Type | Purpose |
|---|---|---|
| `instrument` | `'piano' \| 'drums'` | Active instrument (provider prop, read-only). |
| `selectedSong` | `string \| null` | Path of the loaded MEI file. |
| `midiData` | `Midi \| null` | Parsed `@tonejs/midi` object derived from the MEI. |
| `ppqRatio` | `number` | `Tone.Transport.PPQ / midi.header.ppq`; scales source ticks → Tone ticks. |
| `playPosition` | `number` | Current transport position in **Tone ticks**. |
| `playSizeTicks` | `number` | Total length in Tone ticks. |
| `isPlaying` / `setIsPlaying` | `boolean` | Transport play/pause state. |
| `tempo` / `setTempo` | `number` | BPM (default 120). |
| `seek(ticks)` | fn | Jump the transport to an absolute tick. |
| `loadMidiData(base64)` | fn | Parse a base64 MIDI string, compute `ppqRatio`, set duration. |
| `gameMode` / `setGameMode` | `'standard' \| 'practice'` | Mode toggle. |
| `waitingForNotes` | `number[]` | Practice mode: MIDI pitches the player must press to continue. |
| `removeWaitingNote` / `resumePractice` | fn | Clear waiting notes / resume transport. |
| `songCompleted` / `setSongCompleted` | `boolean` | Set when a song reaches its end. |
| `pianoRange` / `setPianoRange` | `{min,max} \| null` | **Piano-only**: calibrated key range. |
| `handSelection` / `setHandSelection` | `'right' \| 'left' \| 'both'` | **Piano-only**: which staff is active. |

### Tick model

There are two tick resolutions and a fixed offset you must keep straight:

- **Source ticks** — the MEI/MIDI file's own PPQ (e.g. `ppq="128"` in the sample files).
- **Tone ticks** — `Tone.Transport.PPQ` (192). Everything in `playPosition` / `seek` is in Tone
  ticks. Convert with `ppqRatio`.
- **`OFFSET_TICKS = 192`** — a one-beat count-in. Score tick 0 corresponds to
  `playPosition = OFFSET_TICKS`. Both score views and the virtual widgets subtract this offset
  when mapping playback position to the score.

### The playback hooks

`GameContext` also exports **one playback-loop hook per instrument**, each called by its app:

- `useMidiFile()` — piano. 50 ms poll; **filters notes by `handSelection`**
  (`isTrackActiveForHand(trackIndex, hand)`, where track 0 = right/treble, track 1 = left/bass);
  on song end it pauses and resets to 0.
- `useDrumsMidiFile()` — drums. No hand filtering; remaps MEI pitches to drum-pad MIDI via
  `MEI_TO_PAD`; on song end it **loops** back (`seek(144)`) instead of stopping.

> A new instrument with single-voice melodic behaviour will most likely reuse `useMidiFile()`
> with `handSelection = 'both'`, or get a thin `useSaxoMidiFile()` — see [saxo-app.md](saxo-app.md).

---

## 5. Hooks

[src/hooks/](../src/hooks/) contains four hooks, all but `useGameLogic` are instrument-agnostic.

### `useVerovio()` — [useVerovio.ts](../src/hooks/useVerovio.ts)
Loads the Verovio WASM module once and exposes `{ toolkit }`. The toolkit renders MEI:
`toolkit.loadData(mei)` → `toolkit.renderToSVG(1, {})` and `toolkit.renderToMIDI()`.

### `useMidi()` — [useMidi.ts](../src/hooks/useMidi.ts)
Web MIDI input. Exposes:
- `activeNotes: Map<number, {velocity, timestamp}>` — currently-held notes.
- `lastNote: {note, velocity, channel, timestamp}` — last note-on (drives hit detection).
- `MIDI_PAD_MAP` — drum-pad MIDI → notation MIDI (the inverse of `MEI_TO_PAD`).

### `useGameLogic()` — [useGameLogic.ts](../src/hooks/useGameLogic.ts)
The scoring brain. Exposes `expectedNotes: { note: number; trackIndex: number }[]` — the notes
hittable *right now*, used to glow the virtual instrument. It:
- Computes expected notes from `midiData` + `playPosition` (windowed by tolerance).
- Filters by hand for piano (`activeHand = instrument === 'piano' ? handSelection : 'both'`).
- Remaps drum pads for drums (`MIDI_PAD_MAP`).
- Detects hits / misses / wrongs and records them in `StatsContext`.

> This is the **one hook that already branches on `instrument`** (lines ~28 and ~217). A new
> instrument needs a decision here: does it filter by hand (no) and does it remap notes (probably
> not). Default behaviour = piano-without-hands works for a melodic instrument.

### `useAudio()` — [useAudio.ts](../src/hooks/useAudio.ts)
Tone.js playback of *the player's own input*. Currently a single `Tone.Sampler` loaded with the
Salamander grand-piano samples, plus a `MembraneSynth` metronome (muted in practice mode). It is
**not yet instrument-aware** — adding sax timbre means switching the sample set on `instrument`.

---

## 6. Score rendering pipeline (the ScoreView family)

Both [ScoreView.tsx](../src/components/ScoreView.tsx) (piano) and
[DrumsScoreView.tsx](../src/components/DrumsScoreView.tsx) follow the same shape:

1. **Load MEI** (`fetch`) → parse `meterSig` to compute `ticksInMeasure`
   (`count * (4/unit) * 192`).
2. **Render** with Verovio to one very wide single-page SVG
   (`pageWidth: 60000`, `breaks: 'none'`).
3. **Measure** the SVG offscreen: read each `.system .measure` bounding box to build
   `measureData[] = { id, x, width, startTick, endTick }`. This is the map from score tick ↔
   horizontal pixel.
4. **Rasterise** the SVG into ≤2048px-wide canvas slices, each a Pixi `Sprite`, added to a
   scrolling container.
5. **Animate**: a Pixi ticker reads `playPositionRef` each frame, converts tick → x via binary
   search over `measureData`, and scrolls the container so the current position sits under the
   fixed cursor line.
6. Pointer drag / arrow keys / minimap → `seek()`.

The piano `ScoreView` additionally has: a **sticky clef strip** (the first measure pinned at the
left edge while the rest scrolls), a **minimap** with measure ticks + a playhead + red wrong-note
markers, and **hand-selection overlays** (translucent bands dimming the inactive staff). The drums
view is simpler — the whole pattern is centred and only the cursor sweeps.

> The Saxo view is closest to the piano `ScoreView` (it scrolls) but **single-staff**, so the
> grand-staff / hand-overlay machinery is dropped. See [saxo-app.md](saxo-app.md).

---

## 7. Score assets

- Stored under `public/<instrument>/<collection>/*.mei`.
- Catalogued in `public/<instrument>_files.json` — a flat array of
  `{ path: "<instrument>/<collection>", name: "<file>.mei" }`.
- [SongSelector.tsx](../src/components/SongSelector.tsx) fetches `/${instrument}_files.json`,
  groups by `path`, and lets the user pick. [SongNavigator.tsx](../src/components/SongNavigator.tsx)
  uses the same manifest for prev/next.
- MEI files are cached via the Cache API for offline use (`mei-files` cache).

### MEI shape (piano sample)

```xml
<scoreDef>
  <staffGrp>
    <staffDef n="1" ppq="128"><clef shape="G" line="2"/><meterSig count="3" unit="4"/></staffDef>
    <staffDef n="2" ppq="128"><clef shape="F" line="4"/><meterSig count="3" unit="4"/></staffDef>
  </staffGrp>
</scoreDef>
…
<measure n="1">
  <staff n="1"><layer><note dur="4" oct="4" pname="e"/>…</layer></staff>   <!-- treble -->
  <staff n="2"><layer><note dur="2" oct="3" pname="c"/>…</layer></staff>   <!-- bass   -->
  <fing staff="1" startid="#…">3</fing>…                                    <!-- fingerings -->
</measure>
```

- `n="0"` is a one-measure count-in (a rest).
- Chords appear as `<chord><note/><note/></chord>`.
- This is exactly the structure the Saxo pipeline must transform: **drop staff `n="2"`, flatten
  chords to a single voice, transpose** — see [saxo-app.md](saxo-app.md).

---

## 8. Stats & theming

- **Stats** — [StatsContext.tsx](../src/context/StatsContext.tsx), `useStats()`. Per-song,
  per-mode (`rhythm`/`practice`) counts in `localStorage` (`midi-stroke-stats`). The app records
  `recordPlay` / `recordSessionEnd` on completion and resets `sessionStats` on song change. This is
  instrument-agnostic — a new instrument inherits it for free.
- **Theme** — CSS custom properties in [index.css](../src/index.css). Default = piano (purple
  `--color-accent: #646cff`). `.theme-drums` overrides to red `#f5576c`. The app root div opts in
  via `className="app-container theme-drums"`. A new instrument adds a `.theme-saxo` block + a
  splash card class.

---

## 9. Instrument switch-points (the checklist)

Every place that branches on the instrument string. **Adding a new instrument means visiting each
of these.**

| File | What to change |
|---|---|
| [App.tsx](../src/App.tsx) | Add to `currentApp` union + a routing branch wrapping the new app in `GameProvider instrument="…"`. |
| [SplashScreen.tsx](../src/components/SplashScreen.tsx) | Add card + widen `onSelectApp` prop union. |
| [GameContext.tsx](../src/context/GameContext.tsx) | Widen `instrument` in `GameState` and the `GameProvider` props union. Possibly add a playback hook. |
| [useGameLogic.ts](../src/hooks/useGameLogic.ts) | Decide hand-filter (no) and note-remap (no) behaviour for the new instrument. |
| [useAudio.ts](../src/hooks/useAudio.ts) | (Optional) select a different sample set / synth for timbre. |
| [PlayControls.tsx](../src/components/PlayControls.tsx) | Hand-selection UI is gated on `instrument === 'piano'`; ensure the new instrument is handled. |
| [SongSelector.tsx](../src/components/SongSelector.tsx) | Gating `if (instrument === 'piano' && !pianoRange) return null;` — confirm new instrument's gating. |
| `public/<instrument>_files.json` + `public/<instrument>/…` | New manifest + score assets. |
| [index.css](../src/index.css) | New `.theme-<instrument>` block. |

These are the exact lines the [saxo-app.md](saxo-app.md) plan walks through.
</content>
