---
title: Desktop app
description: The Tauri desktop build — native MIDI on every platform, including browsers without Web MIDI.
---

Midi Stroke also ships as a **desktop app** (built with Tauri): the same
trainer, with MIDI handled **natively** — so it works regardless of browser
Web MIDI support, and hot-plugging devices just works.

## Install

Every release ships a signed macOS universal dmg, a Windows installer, a
Debian package and an AppImage — all attached to the
[GitHub releases](https://github.com/vibetuned/midi-stroke/releases)
(the [latest release](https://github.com/vibetuned/midi-stroke/releases/latest)
is always the one to grab). What each version ships is recorded in the
[changelog](https://github.com/vibetuned/midi-stroke/blob/main/CHANGELOG.md).

### macOS — Homebrew

One universal build for Apple Silicon and Intel, signed and notarized:

```sh
brew install --cask vibetuned/tap/midi-stroke
```

Updates arrive with `brew upgrade`. (You can also download the `.dmg`
directly from the [GitHub releases](https://github.com/vibetuned/midi-stroke/releases).)

### Windows — winget

```sh
winget install Vibetuned.MidiStroke
```

Or download the `*-setup.exe` installer from the
[GitHub releases](https://github.com/vibetuned/midi-stroke/releases) — it
bootstraps the WebView2 runtime automatically if it's missing.

### Debian / Ubuntu — apt

The site hosts a signed apt repository:

```sh
sudo curl -fsSL https://ms.vibetuned.com/apt/midi-stroke.asc -o /etc/apt/keyrings/midi-stroke.asc
echo "deb [signed-by=/etc/apt/keyrings/midi-stroke.asc] https://ms.vibetuned.com/apt stable main" | sudo tee /etc/apt/sources.list.d/midi-stroke.list
sudo apt update && sudo apt install midi-stroke
```

### Other Linux

Grab the `.AppImage` from the
[GitHub releases](https://github.com/vibetuned/midi-stroke/releases), make
it executable and run it.

## What's different from the browser

- **MIDI is native** — the shell connects every MIDI input port directly
  (CoreMIDI on macOS, WinMM on Windows, ALSA on Linux) and streams notes,
  velocity and breath control to the trainer. No Web MIDI needed, no
  permission prompt.
- Everything else is identical: same scores, same modes, same imports
  (ZIP collections work and persist), same stats. Note that stats and
  imported collections are stored per app — the desktop app and your browser
  each have their own.
- Lesson **videos need network** (they stream from YouTube), and the piano
  sound samples download on first use.

## Building from source

```sh
npm install
npm run tauri dev            # dev shell with hot reload
npx tauri build --bundles app,dmg   # release build (macOS example)
```

Requires the Rust toolchain. Releases are built automatically by CI when a
version tag is pushed.
