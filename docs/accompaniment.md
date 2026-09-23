# Accompaniment — Design & Implementation

> A recording attached to a piece, played along with it in Rhythm mode (piano and saxo).
>
> Code: [src/utils/accompanimentSync.ts](../src/utils/accompanimentSync.ts) (the sync maths, pure),
> [src/utils/accompaniment.ts](../src/utils/accompaniment.ts) (storage),
> [src/hooks/useAccompanimentPlayer.ts](../src/hooks/useAccompanimentPlayer.ts) (playback),
> [src/components/AccompanimentPanel.tsx](../src/components/AccompanimentPanel.tsx) (the sync view),
> [scripts/check-accompaniment.mjs](../scripts/check-accompaniment.mjs) (`npm run check:accompaniment`).

## 1. Lining a recording up with a score

Two numbers are enough, because the score keeps its own proportions:

- **offset**: where the score's first bar starts in the recording, in seconds. This is the first
  real bar, after the count-in the viewers add.
- **bpm**: the score's opening tempo that makes it last as long as the music does. As with the
  tempo slider, later tempo marks keep their proportion to it, so a score's duration × its opening
  tempo is constant (`bpmForEnd`).

`audioTimeAt(sync, score, tick)` is where any tick falls in the recording. It can be negative
(before the recording starts) or past its end. The recording may be longer than the score at
either end, or shorter.

The first guess starts the score where the sound starts (the first sample above −40 dBFS), at the
score's own tempo, or at the slider's tempo when the score states none.

## 2. The sync view

It opens from the 🎧 playback panel's Accompaniment card:

- **The waveform**: min/max peaks per 256-sample block, precomputed, with raw samples when zoomed
  right in. The score lies over it as a band from bar 1 to its end, with bar lines and numbers.
- **Editing**:
  - Drag the band to move bar 1, and drag its right edge to set the tempo. Empty space pans, and
    scrolling or pinching zooms.
  - The *⟵ Bar 1* and *End ⟶* buttons zoom in on either end, for exactness.
  - The number fields and nudge buttons do the same, as do ← → (10 ms, shift 100 ms).
- **▶ Check** plays the recording with a click on every beat of the score, accented at each bar
  line. It plays from bar 1, or from wherever the waveform was clicked. This is its own small
  player, apart from the piece's transport.

## 3. Playback

The transport stays in charge. Whenever it plays in Rhythm mode, the recording is started at the
place that matches the playhead, on the audio clock (`transport.getTicksAtTime`). Then:

- **When a loop wraps**, the recording is re-placed at the wrap's exact time (the transport's
  `loop` event).
- **A check every 50 ms** re-places it if it has drifted more than 50 ms, which covers seeks and
  tempo changes in the score.

Practice pauses at every note, which would chop a recording up, and By ear doesn't use the
transport, so the recording plays in Rhythm mode only.

While it plays, the piece runs at the recording's tempo. GameProvider's `tempoLock` becomes the
transport's tempo, the slider and ↑/↓ are disabled, and the metronome is quiet. Time-stretching,
so you could slow down, is left for later.

## 4. Storage

Songs that stay in the library keep their accompaniment on the device, in OPFS:
`accompaniments/index.json` (song key → file details and sync), plus the file itself, byte for
byte. That covers bundled pieces, score-server pieces, uploaded ZIP collections and generated
exercises.

Two kinds of song take theirs with them:

- **A local MEI file opened on its own** is a `blob:` URL that lasts one session. Its
  accompaniment is held in memory only, and dropped when another song replaces it or the app
  closes (`isKeptSong`).
- **Deleting an uploaded ZIP collection** deletes its songs' accompaniments.

The song selector shows a 🎶🗑 chip on pieces that have one, and the chip deletes it. So does the
sync view's Delete button.

Formats are whatever the browser decodes. The file is decoded before anything is stored, so a
format that won't play is refused with a message. WAV, MP3 and AAC play everywhere; FLAC, OGG and
Opus play in most browsers.
