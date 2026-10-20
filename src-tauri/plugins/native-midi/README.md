# tauri-plugin-native-midi

Midi Stroke's MIDI on a phone or tablet. The mobile webviews have no Web MIDI and midir has no
Android backend, so the platform's own MIDI does it:

- **iOS** — CoreMIDI (`ios/Sources/NativeMidiPlugin.swift`): every source listened to, MIDI 1.0
  channel voice messages forwarded; MIDI out to any destination; Apple's Bluetooth MIDI view to
  pair an instrument. It also sets the audio session to playback (the app sounds with the silent
  switch on) and keeps the screen awake.
- **Android** — `android.media.midi` (`android/…/NativeMidiPlugin.kt`): every device opened, USB
  as it is plugged in, each source's bytes parsed into messages; MIDI out to any input port; a
  Bluetooth LE scan for MIDI instruments, one tapped connected.

The Rust side (`src/mobile.rs`) starts it and raises the shell's events — `midi-message`
`[status, data1, data2]` and `midi-devices` `[names]` — the same as the desktop's midir bridge,
so the web app reads MIDI the same way everywhere. The shell (`src-tauri/src/lib.rs`) calls it
from its commands; the plugin has none of its own for the web app. See `docs/mobile.md`.
