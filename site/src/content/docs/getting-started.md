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

### On a phone

The browser app works on a phone too — Chrome on Android plays with a USB or
Bluetooth MIDI instrument; Safari on an iPhone has no Web MIDI, so there the
score and playback work, but not playing in. Hold the phone **sideways**: the
piano, drums and saxophone show the **score**, or your **instrument** (the
keyboard, the drum grid, the fingering), across the whole screen — switch with
the toggle at the top left.

- The **top notch**, with the song's name, opens the menu: back, the song
  navigator, statistics and playback.
- The **bottom notch** opens the play controls — mode, hands, the ⚙
  settings — and its **▶** plays and pauses without opening them.
- In *By ear*, its panel stays on screen.

Installed from the browser (*Add to Home screen*), the app stays in landscape.

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

Pressing **play** counts you in first: a bar, in large numbers over the
score and a click on each beat (unless the sound is muted) — **4, 3, 2,
Start** in 4/4, **3, 2, Start** in 3/4, **2, Start** in 2/4. The score's own
rest is the "1": the music comes in one beat after *Start*. A quick 6/8 is
counted in two dotted quarters (**2, Start**), a slow one in six eighths
(**6, 5, 4, 3, 2, Start**). Press play again while it counts to stop it, or
switch the count-in off in the [settings](#settings).

You can also start from your instrument: while a song waits at its start, a
small **Press any key to start** shows where the count will appear, and any
key (on the drums any pad, on the saxophone any note) starts it, count-in and
all. A key pressed while the song is paused part-way through doesn't restart
it, so you can try a note freely — unless *Start mid-song from the
instrument* is on in the settings, when it says **Press any key to continue**
and does.

## Transport & controls

- **Tempo** — in the ⚙ settings, a slider from 20 to 240 BPM (quarter notes
  per minute), with ↑ / ↓ for steps of 5 as you play; everything (score scroll, practice pauses, hit windows)
  scales musically with it. If the score **states its own tempo** it opens at
  it, and the slider shows the marking — *score ♩ = 160* — with a way back to it
  once you have moved away. A score that changes tempo along the way is
  followed as it plays, and slowing it down keeps every section in proportion.
- **Seek** — drag the score itself, click/drag the minimap strip at the top
  (piano & saxo), or use the arrow keys. Dragging pauses the music; with
  *Pause while scrolling* off in the settings, it plays on from where you let
  go.
- **Hand selection (piano)** — L / R / both; the inactive staff dims and its
  notes stop being expected.
- **Stats** — precision, combos and history are kept per piece and per mode,
  on the device. The 📊 button in the header opens the history. The desktop
  app and your browser keep separate histories, since each stores its own.

## Settings

The **⚙** button at the end of the play controls opens what you set once
rather than play with. Each setting is remembered on the device.

| Setting | On | Off |
|---|---|---|
| **Sound on** | The metronome's click and your instrument's sound. | Silent. |
| **Tempo** | The slider, with the score's own marking and a way back to it. | — |
| **Count in before play** *(on)* | A bar counted in before the music. | Play starts at once. |
| **Start mid-song from the instrument** *(off)* | A song paused part-way through starts again from any key, pad or note. | Only a song waiting at its start does. |
| **Pause while scrolling** *(on)* | Dragging the score or the minimap stops the music. | The music stops only while you drag, and plays on from where you let go. |
| **Visual metronome** *(on)* | The arrow on the cursor and its wave. | Hidden. |

## Hearing the score

The **🎧** button in the header, beside the 📊 stats, opens the playback panel
with three choices. The button lights up whenever the score is being played:

- **Playback off** — the score stays silent and only your own playing sounds, which is how the
  trainer has always worked.
- **Play in sound** — the score plays as it scrolls, on the same instrument you are practising:
  the piano samples, the saxo reed tone, or the drum kit.
- **MIDI → *your device*** — instead of sounding locally, playback sends note-on and note-off to
  that output, so your own synth, module or DAW plays the part. Drums go out as General MIDI
  pads on channel 10.

The setting is remembered, and the exercise builders share it: each has a **▶ Listen** button that
plays the exercise you just built before you commit to practising it.

## The visual metronome

On the cursor — the line that shows what to play now — a small arrow points
back over the music and swings with the tempo: down to the bottom on every
beat, up to the top between beats. As it goes, it draws its wave over the clef
and the key signature, and every key you press leaves a dot on the wave, where
the arrow was.

- A dot in a **trough** is a note on the beat.
- A dot on the **slope before** a trough came early; one on the **slope
  after**, late — the further up the slope, the further off.
- Notes between the beats sit higher up: an eighth halfway between two beats
  lands at the top.

![The visual metronome](/screenshots/visual-metronome.png)

The beat is the meter's — a quarter in 4/4, a dotted quarter in 6/8 — counted
from each bar line, and the arrow follows what you hear: it reaches the bottom
as the metronome clicks. On the drums, which have no clef strip, the wave runs
over the bar you have just played.

*Visual metronome* in the [settings](#settings) hides it, and brings it back;
the app remembers which.

Scores open without instrument names at the start of the staves, so the clef
strip stays clear for the wave.

## MIDI status

The pill in the top-right shows whether MIDI is live and how many input
devices are connected. All connected inputs are listened to at once — no
device picking needed.

In the desktop app the connection is native, so a device plugged in mid-session
appears on its own. In the browser the first session asks for the Web MIDI
permission, and the pill stays red until it is granted.
