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
clef strip. When a score's first repeat goes back to the start, its first bar
of music is given a start-repeat bar line: Verovio repeats from the very first
measure, so playback would otherwise sit through the count-in's rest again in
the middle of the piece.

Repeats are written out, so the page reads straight through. The viewers and
the games do it as a score loads (`src/utils/expandRepeats.ts`), so a score
people bring may have repeat bar lines and first and second endings; D.C.,
D.S., segno and coda marks are left as written, for a reader to follow. The
bundled library's scores come written out already: after adding scores, run
`npm run expand-repeats` (`scripts/expand-repeats.mjs`), which bakes the same
step into the files and checks each result against Verovio playing the
original, the same notes at the same times. `npm run check:loop` fails while
any score in `public/` still has a repeat sign.

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
