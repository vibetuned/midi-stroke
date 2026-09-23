# Games — Design & Implementation

> The **Games** tab: short rhythm games that need no instrument. They're a way in for people who
> don't play yet, and they lead into the instrument apps.
>
> Code: [src/games/](../src/games/) (the pure core: levels, judging, the Slingshot's geometry,
> calibration), [src/components/games/](../src/components/games/) (the tab, the game, the results),
> [scripts/check-games.mjs](../scripts/check-games.mjs) (`npm run check:games`).

## 1. Why games, and why rhythm

Much of what holds students back is timing, not fingers: a weak inner pulse, fuzzy subdivisions,
notes not held their full length. That can be practised away from the instrument, and a game makes
the practice something people come back for. Each game trains one skill that carries over to
playing. The results always show the notation of what was just played, so feeling the rhythm
leads into reading it, and a song's results offer to open that piece on an instrument.

## 2. Levels (`games/rhythm.ts`)

A level is a line of notes, each a start and a length in beats. Rests are the gaps.

- **Lessons** are written as note values (`"q. e h | w"`). Each bar is checked to add up, and each
  lesson carries its own notation, one line with one note head per note.
- **Songs** come from the library. `levelFromTimemap` takes a piece's top line (the same melody
  extraction as By ear) for up to 12 bars, with each note's pitch and its id in the score. So any
  piece can become a level, and the results can colour its real notation. The first songs are
  well-known one-line tunes from the saxophone library.
- **My pieces** are MEI files people add. A file is checked for a playable melody, then kept on the
  device as an uploaded collection of the piano library (`opfs:piano/My_pieces/…`). So it stays in
  the Games list, opens in the piano app, and can be removed from either. Without OPFS it lasts the
  session only.
- **Lessons sound at C3** (`LESSON_PITCH`). C5 grew shrill over a whole lesson, and A2 is thin on
  laptop speakers.

## 3. Timing (`games/clock.ts`, `judge.ts`, `latency.ts`)

- **The clock** is the audio clock as heard. `getOutputTimestamp` relates the audio context to the
  page's clock, so a key press, a touch or a MIDI note (each stamped on the page's clock) and a
  scheduled click can be compared directly.
- **The picture** follows the sound as heard. **The judging** also takes off the device's
  calibrated delay, which covers input latency and the player's reaction.
- **Calibration** is tapping along to eight clicks. The median gap is the delay, and uneven taps
  are refused.
- **Windows:** a press is Perfect within ±50 ms, Good within ±100 ms and OK within ±170 ms. A
  release gets wider windows (70, 130 and 210 ms), because letting go is harder to feel than a
  strike.
- **A note's grade** is the worse of its press and its release.
- **The summary** gives accuracy, 0–3 stars and the best run. It adds one tip when there's a
  tendency: letting go early, holding too long, rushing or dragging.

## 4. The Slingshot (`games/slingshot/course.ts`, `components/games/SlingshotGame.tsx`)

Every note is an orbit. The probe latches onto an anchor when the note starts and turns a quarter
circle per beat while it's held: a half note is 180°, a whole note a full circle. Letting go flings
it off along the tangent. The gap to the next note is the straight flight to the next anchor, which
is placed so the probe arrives exactly when that note starts. Anchors alternate sides, so orbits
turn in alternate directions like meshing gears, and neighbouring orbits never overlap. Each arc
has a tick per beat and a white mark where to let go, so the length of a note can be seen before
it's played.

**Which note, and which anchor next.** Each anchor carries its note, written out
(`noteShape`):

- an open head for a whole note, and open with a stem for a half;
- filled with a stem for a quarter, with flags for eighths and sixteenths;
- a dot for a dotted value;
- a length no single note writes takes the plain value that tuplets are written with, so a triplet
  eighth shows as an eighth.

The way to go glows: the arc still to travel on the next orbit, up to the release mark, which glows
too. While the note is held, the lit arc shrinks with the probe. (Lighting the whole ring said which
anchor was next but not where to stop.) The three orbits after it stay visible, and the rest of the
course, played or far ahead, fades back, so the way on still reads where the course crosses itself. Crossings are
inevitable when notes follow each other with no gap: the orbits then have to touch, and the chain
folds back.

- **Input:** space (or Enter), a touch or a click, or any MIDI key. With a chord, the first key down
  presses and the last key up releases.
- **Sound:** one bar of count-in, a click on every beat (accented on the downbeat), and the note
  sounds for exactly as long as it's held. For a song, that's the note's own pitch.
- **Misses:** a strike that never comes is a miss once its window has passed. A note held too long
  is released with a missed let-go.
- **Rendering:** Pixi. The course is drawn once; the probe, its trail, the tether and the glow are
  redrawn each frame, and the camera follows the probe. Three things are kept cheap, because WebKit
  (the desktop app's webview on macOS) felt them more than Chrome did:
  - each grade pop-up is one text object for its whole life, not a new one every frame;
  - React hears from the frame loop only when the count-in number changes;
  - the trail is five strokes rather than forty.

  Measured in Chrome, script time while playing went from 66 to 52 ms a second, glow included.

## 5. Results (`components/games/RhythmResults.tsx`)

The level's notation is rendered by Verovio: a lesson's own MEI, or a song's bars cut from the
score with `select({ measureRange })`. Each note is coloured by its grade through its id. For a
song, **Play it on the saxophone →** opens the saxo app with that piece loaded (App's
`initialSong`). The best result per level and speed is kept on the device.

## 6. Next

- **Keep the pulse:** the click drops out for a bar, you keep tapping, then you see the drift.
- **Rhythm echo:** call and response for rhythm, built on the By ear engine.
- **Clockwork:** subdivisions as actions on a running machine.
- **Songs from any piece in the library,** not only the curated list, and from the piano library.
