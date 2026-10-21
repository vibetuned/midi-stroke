# Midi Stroke — Docs

Developer documentation for the instrument apps and the shared engine.
Release history lives in [../CHANGELOG.md](../CHANGELOG.md).

- **[architecture.md](architecture.md)** — start here. The shared engine: routing, `GameContext`,
  hooks, the score-rendering pipeline, assets, stats, theming, and the instrument switch-point
  checklist.
- **[piano-app.md](piano-app.md)** — the Piano app (reference implementation): grand staff, hand
  selection, key-range calibration, sticky clef, minimap, virtual keyboard.
- **[drums-app.md](drums-app.md)** — the Drums app: percussion mapping, looping playback, the
  step-sequencer `VirtualDrums` grid.
- **[saxo-app.md](saxo-app.md)** — the Saxo app: single-voice wind-controller trainer (TravelSax),
  left/right split layout, offline MEI adaptation pipeline (drop bass clef, flatten chords,
  transpose for E♭ alto), full-key saxophone fingering display, breath meter, and input calibration.
- **[mobile.md](mobile.md)** — the Android and iOS apps: the Tauri mobile shell, the native MIDI
  plugin (USB and Bluetooth), building, signing, and what a store release needs.
- **[store-listing.md](store-listing.md)** — the App Store and Google Play listings, with the
  Verovio credit, the privacy answers and the screenshots.
- **[store-questions.md](store-questions.md)** — every question App Store Connect and the Play
  Console ask (age rating, privacy, data safety, content rating, app access…), answered, and the
  stores' keywords and tags.
- **[screenshots/](screenshots/)** — app screenshots used by the main README and the site (`npm run build` in `site/` copies them to `site/public/screenshots/`).
</content>
