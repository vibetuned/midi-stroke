# Drums App

> Read [architecture.md](architecture.md) first for the shared engine, and [piano-app.md](piano-app.md)
> for the reference implementation. This doc covers what the Drums app does *differently*.

The Drums app trains rhythm patterns, built for the **Yamaha FGDP-50** finger-drum pad (any
GM-style pad controller works — see the pad maps below). Scores are short looping patterns
(1–2 measures), so instead of a scrolling keyboard it shows a **step-sequencer grid** that lights
up per measure.

---

## 1. Component tree

```
DrumsApp                       src/components/DrumsApp.tsx
├── StartOverlay
├── SongSelector               from public/drums_files.json
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
| Song end | Pause + reset to 0 | **Loop** (`seek(144)`) |
| Score view | Scrolls under a fixed cursor; sticky clef; minimap; hand overlays | Centred; only the cursor sweeps |
| Theme | purple `#646cff` | red `#f5576c` (`.theme-drums`) |

### Pitch remapping
Drum notation encodes each instrument as a *pitch + notehead shape* on the percussion staff (e.g.
bass drum = `f4`, snare = `c5`, closed hi-hat = `g5` with an `x` head). Two maps bridge notation
and pads:
- `MEI_TO_PAD` ([GameContext.tsx](../src/context/GameContext.tsx)) — notation MIDI → standard
  GM drum-pad MIDI, used by `useDrumsMidiFile()` so playback matches a real drum controller.
- `MIDI_PAD_MAP` ([useMidi.ts](../src/hooks/useMidi.ts)) — the inverse, used by `useGameLogic()`
  to match an incoming pad hit back to the notated instrument.

---

## 3. DrumsScoreView specifics

[DrumsScoreView.tsx](../src/components/DrumsScoreView.tsx) is a stripped-down `ScoreView`:
no sticky clef, no minimap, no hand overlays. The whole (short) pattern is **centred** in the
viewport (`offsetX = (innerWidth - scoreWidth*scale) / 2`) and the cursor sweeps across it.
Verovio options use a larger `scale: 85` and the scale-factor cap is `1.5` (vs piano's `1`) since
patterns are small and benefit from being drawn bigger.

---

## 4. VirtualDrums specifics

[VirtualDrums.tsx](../src/components/VirtualDrums.tsx) is a **grid sequencer**, not a live
controller. It:

1. **Re-parses the MEI itself** (independently of the MIDI playback) to extract
   `{ tick, instrumentId }[]`, walking layers and honouring beams/tuplets/chords for accurate
   tick math.
2. Derives a grid config from the meter (`columns`, `ticksPerColumn`, `ticksPerMeasure`) — 16 cols
   for 4/4 sixteenths, 12 cols for 12/8 or triplet feel.
3. Identifies each note's instrument via `DRUM_MAP` — an array of
   `{ id, label, color, uiShape, match: {pname, oct, head.shape?, head.fill?}, order }`.
   This **pname/oct/notehead → instrument** matcher is the drums analogue of a fingering table.
4. Renders a row per active instrument (sorted by `order`), a column per step, an SVG glyph
   (`circle`/`cross`/`plus`/`diamond`/`slash`) where a hit lands, and highlights the current
   column from `playPosition`.

> **Relevance to Saxo:** `DRUM_MAP` is the closest existing pattern to what `VirtualSaxo` needs —
> a static table mapping a musical event to a visual representation. The Saxo table maps a **MIDI
> note → set of pressed keys** (a fingering), rendered as a minimalist sax body. See
> [saxo-app.md](saxo-app.md).
</content>
