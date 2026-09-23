---
title: Saxo
description: Single-voice melodic training for wind controllers, with a live fingering chart, breath meter, mirror view and a jazz scale generator — built for the TravelSax.
---

The saxo app is single-voice melodic training for **wind controllers**,
built and tested with the **TravelSax**. Scores are engraved transposed for
E♭ alto, exactly as a saxophonist reads them.

![Saxo app](/screenshots/saxo.png)

## The layout

The score scrolls on the right; on the left, a minimalist full-key
saxophone shows **the fingering for the current note**: keys to press glow,
keys to release show red, and the note name sits right above the chart.

- **Mirror toggle (⇄)** — by default the sax is mirrored, the way you see
  your own hands looking down; toggle for a front-facing chart.
- **Breath meter** — a live column showing your breath level, read from the
  controller (CC 2 / 7 / 11 or channel pressure).

## Live key display (no breath needed)

The TravelSax reports which keys your fingers are holding independently of
breath, and each switch on the chart is mapped to its physical key on the
device — so the chart lights exactly what you're pressing **before you
blow**, handy for checking a fingering or switching cleanly between notes
without an accidental note sounding.

## Pitch and transposition

The scores are in **written pitch** for E♭ alto and the app expects your
controller in its default octave: the TravelSax sends the written pitch
class one octave below the staff, and the app compensates automatically. If
notes register an octave off, adjust the controller's octave setting.

:::tip[Wind controllers work best on the desktop app]
The [desktop app](../../desktop/) reads your controller through the operating
system's own MIDI stack, so the TravelSax is picked up the moment you plug it
in — including on Safari- and Firefox-only machines, where Web MIDI does not
exist. Nothing else changes: same scores, same fingering chart.
:::

## Learn by ear

The **By ear** mode trains you to hear a melody and play it back without reading it, exactly as on
the [piano](../piano/#learn-by-ear). The app plays a phrase, you play it back from memory, and each
time you get it right the phrase grows by one note. The score shows empty bars until each note has
been played. You can also pick a passage with the handles on the minimap.

The fingering chart never gives the next note away. It shows the fingering of the note you just
played right, and "not that one" after a wrong note. It still shows the keys you are holding,
since that is your own hand. Your controller's octave is handled as in the other modes.

The same minimap handles loop a passage in Rhythm and Practice.

## Accompaniment

Give a piece a recording to play along with: a backing track, a band, your teacher. Open 🎧 and
choose **Accompaniment → Add…**, then pick the file. Anything your browser plays works: WAV, MP3,
AAC/M4A, FLAC, OGG, Opus and more.

- **Line it up once.** The recording's waveform fills the view, with the piece laid over it as a
  band, bar lines drawn in. Drag the band so bar 1 sits where the music starts, and drag its end
  so the piece lasts as long as the recording does (that sets the tempo). Zoom in on either end to
  be exact, or nudge it with the buttons or the arrow keys. **▶ Check** plays the recording with a
  click on every beat of the piece, so you can hear whether they agree.
- **It plays along in Rhythm mode**, following play, pause, seeking and loops. The piece plays at
  the recording's tempo, so the tempo slider is locked, and the metronome is quiet.
- **The recording can be longer than the piece**: an intro, an outro.
- **It stays with the piece** on this device: bundled, from the score server, or in an uploaded
  collection. A piece opened from a single local file keeps it for the session only. The song list
  marks pieces that have one with 🎶🗑, which deletes it.

## Jazz scale generator

The song picker's **🎼 Jazz generator** entry engraves jazz practice material
on the fly, the saxophone counterpart of the piano
[scale generator](../piano/#scale-generator).

![Jazz scale generator](/screenshots/jazz-generator.png)

Pick a root on the circle of fifths in **concert pitch** — the key the band is
playing — and the part is engraved transposed for your horn: alto, tenor,
soprano or baritone. The panel always shows both, so a B♭ blues reads as
"sounds in B♭, you read G". Switch the toggle to **written key** if you would
rather name the key you read.

### What you can build

- **Scales** — the four bebop scales plus the ♮7 bebop minor; the parent
  scales they came from; the melodic-minor modes (lydian dominant, altered,
  locrian ♯2 and the rest); the symmetrical scales (half-whole and whole-half
  diminished, whole tone); and the pentatonic and blues family, including the
  9-note jazz blues.
- **Patterns** — the scale itself, scales in thirds, the digital cells
  1-2-3-5 and 3-5-7-9, triad pairs, and three kinds of chromatic approach and
  **enclosure** around every chord tone.
- **Range** — *full horn* traverses the whole instrument: start on the root,
  climb to the top of the keyed range, descend to the bottom, return to the
  root. Or take the usual 1 to 3 octaves.
- **Rhythm and repeats** — quarters, eighths, sixteenths or triplets, up to
  four times through.
- **Jazz articulation** — slurs each offbeat into the downbeat, the way the
  line is tongued, and accents the top note of every leap wider than a minor
  third.

### Chord tones on the downbeats

A bebop scale is its parent scale plus one chromatic passing tone, placed so
that the chord tones land on the beat when you play the line in straight
eighths. The builder shows a **♪ chord tones land on the downbeats** badge on
the scales where that is actually true, and the generator keeps the property
through the turnarounds at the top and bottom of the horn, and across
repeats.

Everything stays inside the real keyed range — written B♭3 to F6, or F♯6 if
you tick the high F♯ key — so an exercise never asks for a note your horn
does not have. Generated exercises play like any other piece and keep their
own stats:

![A generated bebop exercise in the score view](/screenshots/jazz-exercise.png)

Playback is **straight, not swung**: scoring follows the engraved rhythm, so
swinging the eighths would be marked as wrong notes. Swing them once you are
off the trainer.
