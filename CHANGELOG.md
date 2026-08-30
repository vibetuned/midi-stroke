# Changelog

The release record of Midi Stroke, newest first. Each entry lists what the
release ships, user-visible first, with the platform behaviours probed along
the way. Install channels and downloads:
[ms.vibetuned.com/desktop](https://ms.vibetuned.com/desktop/) ·
[GitHub releases](https://github.com/vibetuned/midi-stroke/releases).

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
