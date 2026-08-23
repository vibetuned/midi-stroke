---
title: Desktop app
description: The Tauri desktop build — native MIDI on every platform, including browsers without Web MIDI.
---

Midi Stroke also ships as a **desktop app** (built with Tauri): the same
trainer, with MIDI handled **natively** — so it works regardless of browser
Web MIDI support, and hot-plugging devices just works.

## Download

Grab the build for your platform from the
[GitHub releases](https://github.com/vibetuned/midi-stroke/releases):

| Platform | File |
|---|---|
| macOS (Apple Silicon) | `Midi Stroke_…_aarch64.dmg` |
| macOS (Intel) | `Midi Stroke_…_x64.dmg` |
| Linux (Debian/Ubuntu) | `.deb` |
| Linux (other) | `.AppImage` |

**macOS note:** the builds are not code-signed yet, so the first launch is
blocked by Gatekeeper. Right-click the app → **Open** (once), or clear the
quarantine flag:

```sh
xattr -dr com.apple.quarantine "Midi Stroke.app"
```

## What's different from the browser

- **MIDI is native** — the shell connects every MIDI input port directly
  (CoreMIDI / ALSA / WinMM) and streams notes, velocity and breath control
  to the trainer. No Web MIDI needed, no permission prompt.
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
