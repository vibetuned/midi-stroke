---
title: Getting started
description: What you need, how to connect your MIDI instrument, and your first session in Midi Stroke.
---

## What you need

- **A MIDI instrument** — a keyboard for piano, a pad controller (built for
  the Yamaha FGDP-50) for drums, or a wind controller (built for the
  TravelSax) for saxo. Theory works without one.
- **A browser with Web MIDI** — Chrome, Edge or Opera. Safari and Firefox
  don't ship the Web MIDI API; on those, use the
  [desktop app](../desktop/), which bridges MIDI natively.

Open **[ms.vibetuned.com/app](https://ms.vibetuned.com/app/)**, plug in your
instrument (ideally before opening the page, so it's detected right away),
and pick an instrument card.

## First session

1. **Start** — the first click boots the audio engine (browsers require a
   gesture before an app may make sound).
2. **Piano only: calibrate your keys** — press the lowest and the highest key
   of your keyboard once. The virtual keyboard then only draws keys you
   actually have.
3. **Pick a piece** — collections on the left, pieces on the right. The
   badge on a piece shows your best precision so far.
4. **Play.** The score scrolls under a fixed cursor; the virtual instrument
   at the bottom (or the fingering chart, for saxo) glows the notes to play.

## The two modes

| Mode | What happens |
|---|---|
| **Rhythm** | Playback runs in time. Each note has a hit window; late, missed or wrong notes count against your precision. |
| **Practice** | Playback pauses at every note (or chord) and waits until you press exactly the right keys, then moves on. Wrong presses are counted but never block you. |

Every song starts with a **one-beat count-in** so you're never ambushed by
the first note.

## Transport & controls

- **Tempo** — slider from 30 to 120 BPM; everything (score scroll, practice
  pauses, hit windows) scales musically with it.
- **Seek** — drag the score itself, click/drag the minimap strip at the top
  (piano & saxo), or use the arrow keys.
- **Hand selection (piano)** — L / R / both; the inactive staff dims and its
  notes stop being expected.
- **Stats** — precision, combos and history are kept per piece and per mode,
  locally in your browser. The 📊 button in the header opens the history.

## MIDI status

The pill in the top-right shows whether MIDI is live and how many input
devices are connected. All connected inputs are listened to at once — no
device picking needed.
