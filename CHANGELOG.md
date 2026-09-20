# Changelog

The release record of Midi Stroke, newest first. Each entry lists what the
release ships, user-visible first, with the platform behaviours probed along
the way. Install channels and downloads:
[ms.vibetuned.com/desktop](https://ms.vibetuned.com/desktop/) ·
[GitHub releases](https://github.com/vibetuned/midi-stroke/releases).

## Unreleased

### Drums finally sound like drums

- **Pads play a synthesized kit instead of the piano sampler.** A pad hit used to
  come out as a piano note at whatever pitch the pad mapped to; it now plays its
  own voice — twelve of them, covering kick, snare, rim, closed and open hi-hat,
  ride, crash, three toms, clap, cowbell and tambourine
  ([src/utils/drumKit.ts](src/utils/drumKit.ts)).
- **Synthesis, not samples, and deliberately**: the app notates twelve voices and
  the drum kits on the Tone.js CDN carry six (kick, snare, hi-hat, three toms), so
  half the kit would have been silent or wrong. The kit also needs no download and
  works offline in the desktop app — the Drums app now fetches **none** of the
  ~10 MB of piano samples it used to pull in.
- Membrane synths for kick and toms, filtered noise for the snare wash, hats, rim,
  clap and tambourine, an inharmonic oscillator bank for ride and crash, two
  squares through a band-pass for the cowbell. Velocity-sensitive throughout, a
  closed hi-hat chokes the open one, and the bus runs through a limiter because
  four full-velocity hits landing together summed past full scale.
- Tone's `MetalSynth` is avoided for the cymbals: in this version a bare
  `MetalSynth` stays silent for about a second after being triggered and then
  bursts, in every configuration including the default.
- **A way to check it without ears**: [dev/drum-kit-lab.html](dev/drum-kit-lab.html)
  auditions each voice and renders them offline to measure level, onset, ring time
  and spectral centroid against the range that makes each one that instrument,
  plus the no-clipping, choke and velocity checks. Every voice is in range; four
  at once peak at 0.82.

### The drums pattern generator

- **A 16-step sequencer that writes its own patterns.** Drums have no scales,
  so the song picker's **🎛 Pattern generator** entry asks for a kit and a
  density instead: pick the voices, say how many times each hits in the bar,
  and one of the classical rhythm algorithms places them. Every cell stays
  editable, 🎲 Propose rolls playable numbers for the kit, and the result
  starts like any other piece through a synthetic `drums:` URL. Design record
  in [docs/drums-patterns.md](docs/drums-patterns.md).
- **Five placement engines**, each answering the same question — given k hits,
  which of the 16 steps:
  - **Euclidean (Bjorklund)** — the even distribution behind most world
    ostinatos, with per-voice rotation so a snare lands on 2 and 4;
  - **Metric-weighted Bernoulli** — k steps sampled without replacement
    against the metric hierarchy of the bar;
  - **Shift register** — the Turing-machine write head: a locked loop that
    mutates as the variation rises;
  - **Time-dependent Markov** — a transition row per step, so the chain cannot
    drift off the downbeat;
  - **Cellular automata** — Wolfram rules 30, 90 and 110, one generation per
    bar, so patterns evolve instead of looping.
- **Two engines on top**: Bernoulli pulse jitter makes later bars drop or nudge
  the odd hit, so a repeat is a variation rather than a copy; and 1/f pink
  noise (Voss-McCartney) drives accents and velocities, which groups dynamics
  across a phrase the way a player's do.
- **Real percussion engraving**, in the dialect of the bundled charts: one
  perc-clef staff, two layers with the kick stems down, beat-local durations
  with `<space>` fills, chords for simultaneous voices, per-beat beaming,
  `<artic artic="acc"/>` accents and `@vel` dynamics. The app's own
  step-sequencer grid reads the generated score back with no special casing.
- **Seeded and self-contained**: the bar lives in the URL as a 16-bit mask per
  voice, so hand-edited cells survive exactly, and the seed regenerates later
  bars, accents and velocities identically every time.
- `npm run check:drums` sweeps every engine over every voice and hit count:
  the Euclidean reference rhythms, that **every engine places exactly the
  number of hits asked for**, that Verovio renders each score, that each note
  sounds the pitch the pad map targets and is identifiable by the drum map,
  that every layer adds up to four quarters, and that bar 1 of the score is
  the bar the sequencer shows.

### The saxo jazz scale generator

- **Jazz exercises engraved on demand**, the saxophone counterpart of the
  piano scale generator: the song picker's **🎼 Jazz generator** entry builds
  bebop scales, patterns and enclosures across the horn, started like any
  other piece through a synthetic `sax:` URL that doubles as its stats key.
  Full design record in [docs/saxo-scales.md](docs/saxo-scales.md).
- **Concert pitch and written pitch are separate.** Pick the key the band is
  playing and the part is engraved transposed for your horn — alto, tenor,
  soprano or baritone — with both keys shown as you work. Transposition keeps
  the spelling, and a written root that would need nine sharps is respelled
  (concert F♯ on alto reads E♭, not D♯).
- **Exercises are laid out on the real keyed range** (written B♭3–F6, or F♯6
  with the extra key), so the generator can never ask for a note the horn
  does not have. *Full horn* is the Bergonzi-style traversal — root to the
  top of the instrument, down to the bottom, back to the root — alongside the
  usual 1–3 octaves.
- **22 scales**: the four bebop scales plus a ♮7 bebop minor, the parent
  scales, the six melodic-minor modes, the symmetrical scales, and the
  pentatonic/blues family including the 9-note jazz blues.
- **8 patterns**: scalar, thirds, the digital cells (1-2-3-5, 3-5-7-9), triad
  pairs, and three chromatic approach/enclosure figures around every chord
  tone. Cells that would run off the end of the horn are skipped rather than
  clipped, so each keeps its shape.
- **Jazz articulation**: slurs each offbeat into the downbeat, accents the top
  note of every leap wider than a minor third. Playback stays straight —
  scoring follows the engraved rhythm, so swung eighths would be marked wrong.
- **Chord tones on the downbeats** is treated as a property to verify, not to
  assume: the builder badges only the scales where it actually holds, and it
  is preserved through the turnarounds at both ends of the horn and across
  repeats (a pass is an odd number of notes, so repeats drop the duplicated
  root at the seam).

### Notation engine

- **One engraving layer for both generators** — measure layout, durations,
  beaming, tuplets and the accidental rules moved out of the piano generator
  into `src/utils/meiNotation.ts`. Verified by generating 5632 piano exercise
  specs before and after: byte-identical output.
- Accidentals reset at every barline, and an alteration that sounds without a
  glyph is written `@accid.ges`, because Verovio's MIDI export resolves
  neither the key signature nor carried accidentals — without it the
  engraving and hit-detection would disagree.

### Corrections to the source brief

- Three of the drum engines were **adapted to honour a hit count**, which the
  brief's formulations cannot express: Bernoulli masking samples k steps
  without replacement instead of thresholding each step; the shift register
  gets one register per voice and ranks steps by its value instead of mapping
  single bits to single voices; and the Markov chain runs per voice, then
  corrects to k. Each keeps the character of the original, and
  [docs/drums-patterns.md](docs/drums-patterns.md) records why.
- The **bebop dorian** was specified with the ♮3 passing tone *and* with all
  four m7 chord tones on the downbeats; those cannot both hold, since the
  passing tone pushes the 5 and ♭7 onto odd scale steps. The scale is kept as
  written (it is the same collection as the bebop dominant a fourth below,
  whose chord tones are what land on the beat) and **bebop minor (♮7)**, the
  variant that does put all four on the beat, was added beside it.
- The **double chromatic above** was specified as ♭6 → ♮6 → 5, which steps up
  before descending; the standard figure descends chromatically onto the
  target and that is what is generated.

### Verification

- `npm run check:jazz` sweeps ~850 specs — every scale × pattern, every root ×
  horn × key domain, every rhythm × range × repeat count — checking that
  Verovio renders each one, that every note is inside the horn, that the
  exported MIDI sounds exactly what was engraved, that the timemap starts
  after the count-in and the last bar is complete, and that downbeat-aligned
  scales stay aligned.
- Driven end to end in a headless browser, splash through to the scrolling
  score view.

### Docs

- New [docs/saxo-scales.md](docs/saxo-scales.md) and
  [docs/drums-patterns.md](docs/drums-patterns.md); the user guide's saxo and
  drums pages gained generator sections with screenshots.
- **The guide now leads with the native app**: install moves to the top of
  the sidebar, the landing page's first action installs the desktop build with
  per-platform commands, and getting-started treats the browser as the
  alternative rather than the default.

## 0.0.1 — 2026-08-30

The first release: the complete four-instrument training suite as a web app
([ms.vibetuned.com/app](https://ms.vibetuned.com/app/)) and as a desktop app
for macOS, Windows and Linux. Validated on all three platforms before
tagging.

### The instruments

- **🎹 Piano** — grand-staff training with hand selection (L / R / both),
  key-range calibration (the virtual keyboard only draws keys you have), a
  sticky clef strip, a seekable minimap with wrong-note markers, and a full
  virtual keyboard that glows the expected keys per hand.
- **🥁 Drums** — finger-drumming patterns on a percussion staff, built for
  the Yamaha FGDP-50: looping playback, MEI-to-pad MIDI mapping, and a
  step-sequencer grid that tracks the playhead column by column.
- **🎷 Saxo** — single-voice melodic training for wind controllers (built
  for the TravelSax): the score engraved transposed for E♭ alto, a full-key
  fingering chart that glows keys to press and reddens keys to release, a
  live breath meter (CC 2/7/11 + channel pressure), and a mirror toggle.
- **🎼 Theory** — a course player pairing lesson videos with
  fill-in-the-blank worksheet exercises rendered as real engraved scores:
  you *write* music (from the clickable piano, the circle-of-fifths wheel,
  or a MIDI keyboard), then check, reveal, or listen. Ships with the
  Elementary rudiments and Notation courses; per-exercise progress and
  watched-video state persist locally.

### The engine

- **Verovio → Pixi.js score pipeline**: SMuFL-compliant engraving from MEI,
  rasterised into textures and scrolled on a WebGL canvas for
  frame-accurate playhead tracking. Tone.js drives the transport,
  metronome, and instrument synthesis (piano samples download on first
  use).
- **Two game modes on every piece** — *Rhythm* (play along in time, scored
  with hit/miss windows) and *Practice* (playback pauses on each note group
  and waits for the correct notes — chords included).
- **Tempo control and seeking** — slow-motion drills to full speed, with
  per-song accuracy, combos and history persisted locally.
- **Bring your own scores** — load a single MEI file, or import a ZIP of
  MEI scores as a permanent on-device collection (browser OPFS,
  offline-capable, deletable). A one-beat count-in measure is injected at
  load time when missing, so scores need no preparation.
- **Optional score server** — a small self-hosted Node companion
  (`server/`, Express + built-in `node:sqlite`, no build step) that stores
  MEI collections by instrument and category; the song selector connects,
  browses, caches for offline, and uploads into new or existing categories.
- **PWA** — the web app installs and auto-updates; scores, stats and
  imports live on-device.

### The scale generator (piano)

- Technique exercises in all 24 keys, engraved on demand — no score files:
  pick a key on the **circle of fifths** (natural / harmonic / melodic for
  minors) and one of **eleven forms**: parallel and contrary motion, scales
  in thirds / sixths / tenths, scale triads, triad inversions, broken
  triads, tonic and dominant-seventh arpeggios, and cadences (I–IV–V7–I) —
  in quarters, eighths, sixteenths or triplets, over 1–4 octaves, with
  optional repeats.
- **Conservatory fingering** engraved on the staff (toggleable) and a live
  preview before starting. The exercise URL is its stable identity, so
  precision history accumulates per key/form like any piece.
- As a practice guide, the virtual keyboard **grays out keys foreign to the
  exercise's key** (they stay playable).

### ROLI hardware light guide

- With a ROLI Piano / LUMI Keys connected, expected notes also light up on
  the **physical keys** (per key, octave-accurate, chords included), by
  mirroring the guide as note-on/off to the device — established with a
  hardware probe (`src-tauri/examples/lumi_probe.rs`) after the
  reverse-engineered SysEx protocol turned out to only move the root pitch
  class. Scale exercises additionally paint the exercise's **key across the
  whole keyboard** (SysEx root + scale).
- The device wipes a guide light itself when you press and release that
  key, so the guide re-sends the note-on after release — repeated notes and
  common tones between chords light up again instead of staying dark.

### The desktop app (Tauri)

- The same trainer with **native MIDI** (midir: CoreMIDI / WinMM / ALSA) —
  no Web MIDI needed, so it runs where browsers can't, and hot-plugging
  devices just works. Full 3-byte messages stream to the trainer: velocity
  for piano/drums, breath CCs and channel pressure for saxo.
- **Distribution**: signed + notarized macOS universal dmg
  (`brew install --cask vibetuned/tap/midi-stroke`), Windows NSIS installer
  (`winget install Vibetuned.MidiStroke`), Debian package via a signed
  [apt repository](https://ms.vibetuned.com/desktop/), and an AppImage —
  all built by CI from a version tag and attached to the
  [GitHub release](https://github.com/vibetuned/midi-stroke/releases).

### Platform behaviours probed for this release

- **Linux/WebKitGTK form controls**: the `<select>` popup is drawn on the
  GTK side (tauri#11755) — white default background plus the app's
  inherited white text. Fixed app-wide with `appearance:none` +
  `color-scheme:dark` + explicit option colors and an SVG chevron.
- **Linux/WebKitGTK SVG filters**: `filter: invert(1)` is not applied to
  SVG `<g>` elements, which left the circle-of-fifths hub engraving black
  on black; the engraving is now recolored with plain CSS `fill`/`color`.
- **ALSA MIDI loopback**: midir gives every output connection a *readable*
  client port, so a connect-everything input bridge reads its own key-light
  stream back as key presses (practice mode advanced by itself). The
  desktop shell now skips its own ports everywhere
  (`src-tauri/examples/loopback_probe.rs` demonstrates the loop); verified
  against the real device that the ROLI itself does not echo.
