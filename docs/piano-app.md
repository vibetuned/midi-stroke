# Piano App

> Read [architecture.md](architecture.md) first for the shared engine. This doc covers only what
> the Piano app does specifically.

The Piano app is the **reference implementation** — the richest of the three. It is a
**grand-staff** (two-voice) trainer with hand selection, key-range calibration, a sticky clef,
a minimap, and a full virtual keyboard.

---

## 1. Component tree

```
PianoApp                       src/components/PianoApp.tsx
├── StartOverlay               full-screen "start" gate; boots the AudioContext
├── PianoSetup                 key-range calibration overlay (piano-only)
├── SongSelector               pick a song from public/piano_files.json
├── StatsPanel (modal)         history, toggled from the header
├── header                     Back · title · LiveStats · SongNavigator · stats button
├── main
│   ├── MidiStatus             MIDI device indicator
│   └── ScoreView              scrolling notation (top, 25vh)
├── VirtualPiano               on-screen keyboard (bottom, full width)
└── PlayControls               mode toggle, hand selection, transport, shortcuts
```

Hooks wired in [PianoApp.tsx](../src/components/PianoApp.tsx): `useAudio()`, `useMidiFile()`.
(`useGameLogic()` is pulled in transitively through `VirtualPiano`/`LiveStats`.)

---

## 2. Layout

Vertical stack, full width:

```
┌──────────────────────────────────────────┐
│ header                                     │
├──────────────────────────────────────────┤
│ ScoreView                          ~25vh   │  ← scrolls horizontally
├──────────────────────────────────────────┤
│ VirtualPiano                               │  ← full-width keyboard
├──────────────────────────────────────────┤
│ PlayControls                        ~80px  │
└──────────────────────────────────────────┘
```

> The Saxo app **breaks this stack into a left/right split** — see [saxo-app.md](saxo-app.md).

---

## 3. Piano-specific concepts

### Key-range calibration — `pianoRange`
[PianoSetup.tsx](../src/components/PianoSetup.tsx) blocks song loading until `pianoRange` is set.
The user presses their lowest and highest physical key; the app stores `{min, max}` MIDI numbers
(default 88-key `{21, 108}`). `VirtualPiano` only draws keys in this range, and
`SongSelector` refuses to show until `pianoRange` is set
(`if (instrument === 'piano' && !pianoRange) return null;`).

### Hand selection — `handSelection`
The two staves map to MIDI tracks: **track 0 = right hand / treble**, **track 1 = left hand /
bass**. `handSelection` is `'right' | 'left' | 'both'` and filters notes everywhere via
`isTrackActiveForHand(trackIndex, hand)`:
- `useMidiFile()` practice look-ahead.
- `useGameLogic()` expected-note computation and rhythm hit detection.
- `ScoreView` dims the inactive staff with a translucent overlay.

The L / R / L+R toggle lives in [PlayControls.tsx](../src/components/PlayControls.tsx), gated on
`instrument === 'piano'`.

---

## 4. ScoreView specifics

[ScoreView.tsx](../src/components/ScoreView.tsx) is the full-featured score canvas. On top of the
shared pipeline (architecture.md §6) it adds:

- **Sticky clef strip** — the first measure (`measureData[0]`, zero ticks) is drawn into a separate
  Pixi container pinned at `x = innerWidth * 0.05`, with a gradient fade, so the clef/key signature
  stays visible while the body scrolls under the cursor.
- **Fixed cursor** — a 4px `#646cff` bar at `innerWidth*0.05 + stickyWidth*scale`; the score scrolls
  to it rather than the cursor moving.
- **Minimap** — a 14px strip across the top: white ticks at measure boundaries, a `#646cff`
  playhead, and red (`#f87171`) **wrong-note markers** captured from `sessionStats.wrongs`. Click /
  drag to seek.
- **Hand overlays** — by clustering `.staff` element Y-positions it finds the grand-staff midpoint,
  then draws two translucent bands (`handTopOverlayRef` / `handBottomOverlayRef`) that show/hide with
  `handSelection`. Single-staff scores leave `staffMidY = null` and get no overlay.

Verovio options: `scale: 60`, `adjustPageHeight: true`.

---

## 5. VirtualPiano specifics

[VirtualPiano.tsx](../src/components/VirtualPiano.tsx) (memoised) draws white + black keys across
`pianoRange`. For each key:
- `activeNotes.has(note)` → pressed styling (`var(--color-accent)`).
- `expectedNotes.find(e => e.note === note)` → glow border. Glow colour encodes the track/hand:
  `trackIndex % 2 === 0 ? '#51A0CF' : '#A351CF'`.
- A "name band" above the keys labels each white key (`Tone.Frequency(i,"midi").toNote()`).

> The Saxo equivalent (`VirtualSaxo`) replaces this with a **fingering chart** — a small set of
> key/tone-hole indicators driven by a MIDI-note → key-set lookup, conceptually like the drums'
> `DRUM_MAP`. See [saxo-app.md](saxo-app.md).
</content>
