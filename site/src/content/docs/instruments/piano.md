---
title: Piano
description: Grand-staff training with hand selection, key-range calibration, a minimap with wrong-note markers, and a scale generator for all 24 keys.
---

The piano app is the richest of the four: a **grand-staff** trainer with
per-hand filtering, a calibrated virtual keyboard, and a technique-exercise
generator.

![Piano app](/screenshots/piano.png)

## Key-range calibration

On first launch the app asks for your lowest and highest physical key. The
virtual keyboard then matches your actual instrument — a 49-key controller
shows 49 keys, not a phantom 88.

## Hand selection

The two staves map to hands: treble = right, bass = left. The **L / R /
both** toggle in the play controls:

- dims the inactive staff on the score,
- stops its notes from being expected (both for scoring and for practice
  pauses),
- and in practice mode, pauses only on the active hand's notes.

## The score view

- **Sticky clef strip** — clef, key and time signature stay pinned at the
  left edge while the score scrolls under the fixed cursor.
- **Minimap** — the thin strip on top shows measure boundaries, the playhead,
  and **red markers where you played wrong notes** this session. Click or
  drag it to seek.
- **Virtual keyboard** — expected keys glow (color-coded by hand), pressed
  keys light up, and key names are labeled.

## ROLI light guide

With a ROLI Piano / LUMI Keys connected, the expected notes also light up
**on the hardware** — per key, chords included, in your keyboard's own
colors — and for scale exercises the whole keyboard is painted in the
exercise's key (root + scale). Two device notes:

- The incoming-note lights show in every mode, but their brightness is fixed
  by the firmware — the **rainbow mode** (cycle with the power button) looks
  best, since its mid-brightness colors let the guide lights stand out.
- No setup needed: the guide activates automatically when a ROLI output is
  detected, in the browser and in the desktop app.
- **Managed browsers**: enterprise-policy Chrome installs can silently
  swallow outgoing MIDI even while the permission looks granted (the console
  shows the device and the sends, but nothing reaches it). If the lights stay
  dark on a work machine, use an unmanaged browser or the desktop app.

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

## Looping a passage

The minimap along the top of the score has a handle at each end. Drag them in to choose the bars
you want to work on. They snap to bar lines, and the rest of the minimap darkens. In **Rhythm** and
**Practice** those bars loop: at the end of the last bar the playhead jumps back to the start of the
first, and practice mode waits for its notes again on every pass. Repeat signs in the piano's
blue mark the loop on the score. The start sign waits at the cursor while the loop runs, so you
can always see where it began. The transport shows what is looping, *⟲ bars 5–8*. Its ✕ (or a
double-click on a handle) goes back to the whole piece. By ear, the same handles and the same ✕
choose the passage to learn.

## Learn by ear

The **By ear** mode, beside Rhythm and Practice, trains you to hear a melody and play it without
reading it. It works on any piece: the instrument plays a phrase, you play it back from memory,
and every time you get it right it grows by one note.

- **Nothing gives the answer away.** The keyboard shows no targets, the ROLI lights stay dark, the
  other staff and everything ahead of you show as empty bars, laid out like the real ones. A
  note appears, properly engraved, only once you have played it.
- **Pick the staff** you are learning: Treble keeps the top line of each chord, Bass the bottom one.
- **Pick the passage**: drag the handles on the minimap to learn a few bars instead of the whole
  piece.
- **Rhythm**: hear the phrase *as written*, at the score's tempo, or as *even pulses*, one note per
  beat, so only the pitches are left to listen for.
- **Octave**: *exact* register by default, or *any* octave of the right note for smaller keyboards.

Keys pressed while the phrase is playing are ignored. A wrong note stops the response at once —
so the wrong interval doesn't settle in — and shows how you are doing: pitch accuracy, how many
notes you have retained by ear, and your longest streak. Then either **retry** the same phrase, with
what you've learned still on the page, or **restart** from the first note with everything veiled.
Play the whole melody in one go and the score is unveiled.

## Scale generator

The song picker's **🎼 Scale generator** entry engraves technique exercises
on the fly — no score files involved. Pick any major or minor key on a
circle of fifths (natural, harmonic or melodic minors) and one of eleven
forms: parallel and contrary motion, scales in thirds/sixths/tenths, scale
triads, triad inversions, broken triads, tonic and dominant-seventh
arpeggios, and cadences — in quarters, eighths, sixteenths or triplets, over
1–4 octaves, with optional repeats and engraved conservatory fingering.

![Scale generator](/screenshots/scale-generator.png)

Generated exercises play like any piece and keep their own stats per
key/form. As a practice guide, the virtual keyboard **grays out keys foreign
to the exercise's key** (they stay playable):

![Scale exercise with foreign keys grayed out](/screenshots/scale-game.png)
