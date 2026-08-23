---
title: Development
description: The tech stack, the synchronization engine, and where to find the in-repo developer docs.
---

Midi Stroke is open source —
[github.com/vibetuned/midi-stroke](https://github.com/vibetuned/midi-stroke).
This page is a bird's-eye view; the deep-dive developer docs live in the
repository under [`docs/`](https://github.com/vibetuned/midi-stroke/tree/main/docs).

## Stack

| Concern | Library |
|---|---|
| UI | React 19 + TypeScript + Vite |
| Notation | [Verovio](https://www.verovio.org/) (WASM) — MEI → SVG + timemap |
| Score canvas | Pixi.js (the SVG rasterised into scrolling textures) |
| Audio / transport | Tone.js |
| MIDI input | Web MIDI API in browsers; a native `midir` bridge in the desktop shell |
| Desktop shell | Tauri 2 (Rust) |
| Docs site | Astro Starlight (this site, in `site/`) |

## The synchronization engine

Everything is driven by **one authoritative timeline**: Verovio's
`renderToTimemap()` for the loaded MEI, converted to Tone.js transport ticks
(`qstamp × 192`, tempo-independent so the tempo slider is free). From that
single timemap the app derives:

- **measure start ticks** for the cursor ↔ score-position mapping (exact for
  pickups, meter changes and irregular bars),
- **note onsets** with sounding pitches, staff (hand) assignment and
  tie-merged durations — chords arrive pre-grouped, tie continuations are
  erased so a held note is one event,
- **practice pause points**, scheduled directly on the Tone transport at
  exact ticks (no polling — 32nd notes can't be skipped),
- **scoring windows** for rhythm mode, and song length.

Scores don't need a count-in measure: at load time the app injects a
one-beat rest measure (`n="0"`, one rest per staff) into any MEI whose first
measure contains notes — the engraving of that measure doubles as the sticky
clef strip.

## Local development

```sh
npm install
npm run dev          # https on LAN if certs/ exist (Web MIDI needs a secure context)
npm run build        # web app
npm run tauri dev    # desktop shell
cd site && npm install && npm run dev   # this docs site
```

Deployment: pushing `main` publishes this site to the root of
ms.vibetuned.com with the app under `/app/`; pushing a `v*` tag builds the
desktop bundles into a draft GitHub release.
