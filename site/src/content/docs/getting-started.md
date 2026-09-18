---
title: Getting started
description: What you need, how to connect your MIDI instrument, and your first session in Midi Stroke.
---

## What you need

- **A MIDI instrument** — a keyboard for piano, a pad controller (built for
  the Yamaha FGDP-50) for drums, or a wind controller (built for the
  TravelSax) for saxo. Theory works without one.
- **Midi Stroke** — the [desktop app](../desktop/) on macOS, Windows or
  Linux, or the web app in a browser with Web MIDI.

### Install the desktop app

This is the way to run it. MIDI is handled by the operating system
(CoreMIDI, WinMM, ALSA), so no browser support question arises, hot-plugging
a controller works, and everything runs offline.

```sh
brew install --cask vibetuned/tap/midi-stroke   # macOS
winget install Vibetuned.MidiStroke             # Windows
```

On Debian and Ubuntu there is a signed apt repository, and an AppImage for
everything else — see the [desktop app page](../desktop/) for both, and for
what each release ships.

### Or use the browser

**[ms.vibetuned.com/app](https://ms.vibetuned.com/app/)** runs the same
trainer in **Chrome, Edge or Opera**. Safari and Firefox don't ship the Web
MIDI API, so on those the desktop app is the only option.

Either way, plug your instrument in first (so it's detected right away), then
pick an instrument card.

## First session

1. **Start** — the first click boots the audio engine (one gesture is needed
   before any app may make sound).
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
  on the device. The 📊 button in the header opens the history. The desktop
  app and your browser keep separate histories, since each stores its own.

## MIDI status

The pill in the top-right shows whether MIDI is live and how many input
devices are connected. All connected inputs are listened to at once — no
device picking needed.

In the desktop app the connection is native, so a device plugged in mid-session
appears on its own. In the browser the first session asks for the Web MIDI
permission, and the pill stays red until it is granted.
