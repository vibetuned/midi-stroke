# Games — Design & Implementation

> The **Games** tab: short rhythm games that need no instrument. They're a way in for people who
> don't play yet, and they lead into the instrument apps.
>
> Code: [src/games/](../src/games/) (the pure core: levels, judging, the Slingshot's geometry,
> the choir, echoes and canons, grooves, calibration), [src/components/games/](../src/components/games/)
> (the tab, the games, the results), [scripts/check-games.mjs](../scripts/check-games.mjs)
> (`npm run check:games`).
>
> Four games: the **Slingshot** (how long a note lasts), the **Conductor** (holding the beat,
> the song following you), **Rhythm echo** (a voice of a canon, against the other), and the
> **Groove Builder** (a part against other parts).

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
  well-known one-line tunes from the saxophone library, and English folk tunes from its
  `english_folk` collection (`FOLK_SONGS`, `CHOIR_FOLK_SONGS`).
- **As written** (`writtenBars`). Verovio's timemap plays a repeat a second time (the copies'
  ids end `-rend2`), and a repeat back to the start used to take the count-in bar the viewers add
  with it: in *Yankee Doodle*, a silent beat in the middle of the tune. A level keeps the first
  time through only, so it is the bars its notation shows, and `barLines` says where each begins.
  (The viewers now give such a score a start-repeat on its first bar of music, see
  `ensureCountInMeasure`, so their playback no longer replays the count-in either.)
- **Counting** (`pulseOf`, `countingOf`). A level's beat is its `pulse`: a quarter, except in
  eighth metres. 6/8 is counted in dotted quarters when they go at 50 a minute or more, and in
  eighths ("in six") when slower. *Pop Goes the Weasel* at ♪ = 120 is conducted in six. The beats
  are laid bar by bar from the bar lines:
  - a pickup is counted back from the bar line after it, so an eighth before a bar of 2/4 is the
    second half of a beat that begins before the tune;
  - a strain that ends on a short bar, followed by a pickup that makes the bar up, is beaten
    straight through the double bar, as a conductor would;
  - the count-in is a bar less the pickup's beats, and a bar more when that would be under three
    ("one two one", in on two).

  The HUD shows the tempo as counted: ♩ = 96, ♪ = 120, ♩. = 72 (`tempoMark`).
- **My pieces** are MEI files people add. A file is checked for a playable melody, then kept on the
  device as an uploaded collection of the piano library (`opfs:piano/My_pieces/…`). So it stays in
  the Games list, opens in the piano app, and can be removed from either. Without OPFS it lasts the
  session only.
- **Lessons sound at C3** (`LESSON_PITCH`). C5 grew shrill over a whole lesson, and A2 is thin on
  laptop speakers.
- **Tunes and backing.** A lesson can also be given a tune, one pitch per note
  (`tune('C4 E4 G4')`, checked to match the rhythm), and its notation is then a real staff at
  those pitches. A song level carries the rest of its score as `backing`, and a lesson can carry
  chords. The Conductor plays both on its piano.

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
- **Sound:** a bar counted in, a click on every beat as the metre counts it (accented on the
  downbeat), and the note sounds for exactly as long as it's held. For a song, that's the note's
  own pitch. The arcs keep a quarter turn per quarter note, with a tick per counted beat.
- **English folk tunes:** *God Save the King*, *Pop Goes the Weasel*, *Ham Frolick*, *Aire de
  l'Opéra françoise* and *Auld Lang Syne*: the ones whose quickest note can still be held (a
  sixteenth at ♩ = 100, 150 ms). *Yankee Doodle*, *Camptown Races*, *The Drunken Sailor*,
  *Ronda* and *The British Grenadiers* have quicker ones, down to a 32nd at 94 ms, and are left
  to the Conductor.
- **Misses:** a strike that never comes is a miss once its window has passed. A note held too long
  is released with a missed let-go.
- **Rendering:** Pixi. The course is drawn once; the probe, its trail, the tether and the glow are
  redrawn each frame, and the camera follows the probe. Three things are kept cheap, because WebKit
  (the desktop app's webview on macOS) felt them more than Chrome did:
  - each grade pop-up is one text object for its whole life, not a new one every frame;
  - React hears from the frame loop only when the count-in number changes;
  - the trail is five strokes rather than forty.

  Measured in Chrome, script time while playing went from 66 to 52 ms a second, glow included.

## 5. The Conductor (`games/choir.ts`, `components/games/ConductorGame.tsx`, `ConductorResults.tsx`)

Conduct the choir, a beat at a time. Every pitch of the tune has its singer, standing low to high,
the way the keys of a piano run. **Each hold of the button is one beat, whatever the notes.**
In 6/8 the beat is an eighth or a dotted quarter, as the tune goes (§2, Counting).
While you hold, the song moves on at the piece's tempo: whoever has a note in that beat sings it,
and the piano plays its part. Two eighths are two singers inside one hold; a half note is the
same singer over two holds, who keeps singing through the lift between them. A ring round the
singer fills as the beat goes by. Let go as it closes and press straight away for the next beat.

**The song follows you.** The piece's tempo is the reference, but nothing runs on a fixed clock:

- **Let go early** and the beat is cut short: the singer stops, surprised, and the rest of the
  beat is skipped.
- **Hold on** and the song waits on that beat while the singer holds the note, reddening. A
  whole extra beat and they run out of breath, and the beat ends for them.
- **Pause** before the next press and the choir stops to wait for you. A note carried into the
  next beat sounds through a lift of up to 0.35 s, then goes quiet.

This came out of a false start. The first version was a piano roll with one button: notes fell
down a lane per singer, and you pressed and released as each arrived. That was the Slingshot
again. The point was for the song to depend on your beat.

- **Judging, per beat** (`beatResult`, `choirBeats`):
  - **The press** is judged against where the beat falls: for the first, the beat the count-in
    leads to; after that, one beat after the previous press. So a pause is
    simply a late entry, and the song's stretch is the sum of the entries.
  - **The let-go** is judged against the ring closing, allowing a finger's lift (`LIFT`, 50 ms)
    so the next press can land on time. Letting go right on the ring is just as good.
  - **Two MIDI keys** can alternate: a new key before the last is up is the next beat, with no
    lift at all.
- **The tip** is about a habit when there is one, taken from the median so one slip is not a
  habit: letting go early, holding on, dragging, rushing. Otherwise it says what happened ("a
  singer ran out of breath once, the choir was cut off once and waited for you once") and what to
  do about the commonest. The choir "waiting" counts only when the pause did it: after a beat held
  on, it was still singing.
- **The picture.**
  - The ring on the singer: a tick at each quarter, a flash as it closes, then red the longer
    it's held. During the count-in it goes round once a beat at the piece's tempo, and between
    beats it waits, pulsing, on whoever sings next.
  - The bar's beats as dots over the choir.
  - The tempo you are conducting at ("yours 76") next to the piece's in the HUD.
  - The conductor, seen from behind. The baton moves with **your** beats: it lands on the ictus
    of the pattern as you press (down, in, out, up in 4/4; down, out, up in 3/4; in six, two
    in, two out and up), travels to the
    next while you hold, and waits there. It beats by itself only during the count-in. The left
    hand reaches out to whoever sings.
  - A word pops up only for a beat that was not perfect ("Cut short", "Held too long", "Late
    in"); the run counter says the rest.
- **The choir.** One singer per distinct pitch (`singersOf`), lowest on the left. Each has a
  robe in its voice's colour (deep violet for the low voices, through teal and green, to gold for
  the highest) and its note name on the robe. Faces tell what is happening:
  - idle, then **breathing in** as their note comes up;
  - **singing** while held: eyes closed, mouth open, a halo, little notes rising;
  - **straining** and turning red when held past the ring, **startled** when cut off.
- **Results**:
  - every beat's length as conducted, press to next press, against one beat, with a mark under
    the beats let go early;
  - how much longer or shorter the song ran;
  - the tune written out, each note coloured by the worst of the beats it sounds in
    (`noteGradesFromBeats`).
- **The voice** is a choir "aah": detuned sawtooths through the three formants of the vowel, a
  low body under them, vibrato and a hall. It is sung at the note's own pitch. A tune that sits
  too high or too low for a choir is moved by octaves (`choirShift`); none of the current levels
  needs it.
- **A piano plays along**: the level's `backing`.
  - **Lessons** carry chords, one or more a bar (`"C | Am | F G | C"`, `chordBacking`), voiced as
    the root low and the triad above.
  - **Songs** use the rest of the score: everything in the level's bars that is not the melody
    (`levelFromTimemap` returns it). The folk songs are the piano library's versions, so the choir
    sings the tune over the left hand.
- **Levels.**
  - **Lessons** are the Slingshot's six rhythms, each with a tune written for it, from three
    singers (C, E, G) to eight. They cover half and whole notes over several holds, rests beaten
    through, a waltz, eighths (two singers in a hold) and a dotted quarter that changes note
    mid-hold. Their results are on a real staff, at the tune's pitches, in the clef it sits best
    in (`lessonMei` with pitches).
  - **Songs** are six folk songs from *first two-hand exercises*: *Hänschen klein*, *Summ, summ,
    summ*, *Kuckuck*, *Hänsel und Gretel*, *Schlaf, Kindchen*, *Gubben Noak*. Each has five
    singers and 12–16 piano notes.
  - **English folk tunes**, a cappella: all ten of the saxophone library's `english_folk`
    collection. They are single lines, so the choir sings alone, with six to eleven singers. The
    quick notes are the choir's (a hold is still one beat), so the fast tunes the Slingshot leaves
    out are here: *The British Grenadiers* has 32nds inside its beats. Each beat lasts 0.43–0.75 s
    as written; *Pop Goes the Weasel* and *Ham Frolick* are conducted in six.
  - **My pieces** work here too.
- **Names and grades are DOM**, laid over the canvas, not Pixi text. With a text label made and
  dropped for every grade, Pixi's shared texture pool was handed a texture it did not know as the
  scene was torn down. The crash was intermittent and blanked the tab. It came from the first,
  piano-roll version: a test run pressing every note too early reproduced it about one run in
  two, and with the labels moved to DOM it no longer happens. The Slingshot's pop-ups, alone on
  their canvas, survived the same test.

## 6. Rhythm echo (`games/echo.ts`, `components/games/EchoGame.tsx`, `EchoResults.tsx`, `DefenceLog.tsx`)

Sing the second voice of a canon by defending the cities from it: a musical *Missile Command*,
with a good ending. A star sings a line and you are the second voice, a bar or two behind. Each of
the star's notes falls as a bolt of plasma on the **city** of its pitch, one city for every pitch
of your voice (`citiesOf`), low on the left. The **satellite**, at the left, watches a line across
the sky, the negative event horizon, and every bolt crosses it just as your note should start.
Hold (space, a touch, any MIDI key) as it crosses and let go as its tail does: the city's turret
fires at the crossing, burning the bolt away as it passes, and your note sounds for as long as you
hold. Defended right, the two voices are the canon. It is judged press and release, as the
Slingshot is, so length counts, not just when.

It has had three shapes. The first was call and answer: tap a rhythm back a bar later, with the
signal fading on its way down to make it harder. Only its canons were liked; the fading felt
artificial, and taps ignored how long a note lasts. The second relayed the canon through a
satellite halfway to Earth, a message written along the bottom (a green tremolo for a note that
got through, a quarter rest for one lost, a tofu box for one garbled). The third, this one, keeps
its canons and its holds, and makes what goes wrong visible where it happens.

- **The bolts** (`packetsOf`): each of your notes is a bolt the star sings a canon's distance
  before it is due, so its head crosses the horizon exactly on time. Its head is the note's start
  and its trail the note's length, so the spacing of the heads is the rhythm, seen. Each flies in
  a straight line from the star to its city's turret, coloured by the city, and the next one to
  defend is drawn bolder.
- **The sight.** For the next bolt the satellite draws a sight on the horizon where it will cross,
  which closes over its last beat and a half and locks, blinking the satellite's lamp, as it
  crosses.
- **The turret** fires a beam from its roof to that point while you hold. What crosses the line
  while it fires is gone; a press that is Good or better catches the head whatever the few
  milliseconds say.
- **What goes wrong** (`outcomeOf`):
  - **intercepted** when the note was Perfect or Good: a green burst at the horizon;
  - **the city** when it was never fired on or let go too soon: what got past burns orange on its
    way down and lands with the meteoroid's thud, and flames rise from the city, more for every
    hit;
  - **the turret** when it was held too long: the beam reddens with the heat once the tail has
    passed, and flames rise from the turret.
- **The shield dome** charges as you go, "12 to go" by the HUD, the last five called out. It goes
  up as your part ends (`domeAt`), and from then on every bolt ends on it. The star's last notes,
  the free ending your voice doesn't imitate, fall **hollow** and burst harmlessly on the dome with
  a bell. (A hollow bolt that comes before the dome is up fades at the horizon; in two of the Kunz
  canons one does, in the last bar.)
- **The ending** is always good: once the last bolt is down, the dome holds, the fires go out, the
  lights come on in every window and fireworks go up over the cities. Then the results.
- **Sound.** The star is *Space Voices'* whistle, far away; your voice, the turrets', its hums,
  close, at your note's pitch, for as long as you hold. The plasma lands with the meteoroid strike
  from the Groove's kit, pitched down; an overheated turret hisses; the dome is charged with a
  chord.
- **The picture** is Pixi, like the others: the ground, the cities and the horizon drawn once;
  the bolts, beams, sight, dome, flames and fireworks each frame. Flames and smoke are particles.
  City names and the horizon's label are DOM, as the Conductor's are.
- **Levels.**
  - **Lessons** are nine canons, one idea each: halves and wholes a bar behind, quarters, rests,
    long notes, *Frère Jacques* as a round two bars behind, eighths, dotted rhythms, 3/4, and
    two bars behind. Their tunes keep to C, E and G so the voices agree however they overlap, and
    the star sings an octave up.
  - **Canons** are Konrad Max Kunz's short canons, Op. 14, in the piano library as
    `piano/kunz_op14`, read from the piano catalog (`canonsFrom`), so a canon added there is a
    level. `canonFromTimemap` takes the voice that starts first as the star's and the other as
    yours, whichever staff it is on. The distance is the gap between their entries, and
    `imitation` counts how many of your onsets the star sang that far before.
  - **The seven so far** are strict (96–100 %), at one bar (No. 1) or two.
    `npm run check:games` checks every canon in the catalog the same way.
  - **Adding more** (the plan is all 200): drop the MEI files in `public/piano/kunz_op14/` and
    run `npm run build:piano-manifest`, which adds them to `piano_files.json`, keeping its order.
  - **My pieces** are accepted when they are canons.
- **Results**: the bolts intercepted, the ones that reached a city and the turrets that
  overheated; the grades; a tip; the defence bar by bar (`DefenceLog`: a green burst, flames on a
  house, flames on a turret); the canon as two lanes (the star's voice above, yours below, each
  note as written with how long you actually fired over it); and the canon written out, your
  voice coloured note by note. **Play both voices on the piano →** opens it.

## 7. Groove Builder (`games/groove.ts`, `components/games/GrooveGame.tsx`, `GrooveResults.tsx`)

A beat from the drum library, built one part at a time, like a looper. A bar is counted in. Then
you play the first part (the kick) once round; from the next time round it plays **as you played
it** while you play the next part on top, and so on through the parts. After the last one, the
whole groove plays twice with no click, to hear it, or what is missing from it. It trains playing
a part against others, the independence every player needs.

The first version held your hand: listen to a part, play it twice, get a verdict, try again, and
a part that failed three times was let in anyway. It was too much. Now a part gets one pass, and
what you play is what the groove keeps.

- **The wheel** is a ring of Simon-style pads for each part, kick innermost: dark gaps, rounded
  edges, a dim glow at rest and a bright flash when a pad plays.
  - **No playhead hand**: the step sounding lights up its whole column, and each pad that plays
    in it flashes.
  - **The part you are playing** has its steps outlined. The next part's show a beat before its
    turn, and the first part's during the count-in.
  - **Parts already played** show as played: a hit on its step in the part's colour, a hit on
    the wrong step red, a missing hit an empty pad outlined red.
  - **The hub** shows the count, then the part and what comes next.
- **The grid** (`gridOf`): sixteenths, 16 steps a bar, even for a groove of eighths, the way a drum
  machine counts. It's eighths in a compound metre (12 steps for the 12/8 shuffle), and finer
  when a hit needs it (triplets make 24). Two bars make 32.
- **Every tap lands on a step** (`cellOfTap`): the nearest one, counted from the start of the
  count-in, so a tap a hair before a loop is its first step. A step keeps the tap closest to it
  (`addTap`). Playback is on the grid, as a drum machine's is: a hit more than half a step off
  lands on the next step, and stays there. You hear your own taps at once, as you play them.
- **The run** (`turnOf`): count-in, one loop per part, `FINAL_LOOPS` (2) of the whole groove, the
  end. Steps go onto the audio clock a quarter of a second ahead, one at a time, so a part is
  heard as played from the very next loop.
- **Score** (`scoreTake`): each step hit that should be is worth how close the tap came (Perfect,
  Good, OK: anywhere in its step lands on it); each wrong step costs half. Parts weigh by their
  hits. The tip names the part that went most wrong: wrong steps first ("the kick landed on the
  wrong step once, and those hits stayed in the groove"), then missing hits, then a lean ahead of
  or behind the beat, taken from the median.
- **Grooves** are one-bar charts from `drums/200_machine_drum_patterns`, easiest first: rock,
  rock ballad, twist, pop, reggae one drop, funk, bossa nova, Afro-Cuban, cha-cha, a 12/8
  shuffle, and a six-part samba. Each has a tempo chosen for it, because the charts state none.
  `grooveFromTimemap` turns the chart's notes into parts through the same pitch-and-notehead map
  as the drums app (`padForScoreNote`).
  - **Order:** kick, then snare, clap and rim, then hi-hats, ride and cymbal, then percussion and
    toms.
  - **Speed:** no part asks for more than about six taps a second at its tempo, and a check keeps
    it that way.
- **Input:** space, a touch, or any MIDI key or pad plays the part being built, on the drums app's
  kit (`createDrumKit`).
- **Results:** each part as a row of the drums app's step grid (coloured on its step by how close,
  red for a wrong step, outlined red for a missing one), how many of its steps landed, one tip,
  and **Play it on the drums →**.

## 8. Sounds (`components/games/sounds.ts`, `scripts/build-game-sounds.py`, `public/games/sounds/`)

Each game has a sampled voice, cut from a sound library into a few small mono MP3s: 476 KB in all,
from libraries that weigh 1.6 GB.

| Game | Voice | From |
|---|---|---|
| Slingshot | the held note: a sonar ping at the note's pitch, a take-off rumble under it | *Nasa Space Pad* (Tim Steemson), NASA recordings |
| Conductor | the choir: six sustained notes, G♯3–D5 | *The Spellsinger* |
| Rhythm echo | the star: a whistle; the turrets: hums; plasma landing on a city: the Groove's meteoroid strike | *Space Voices*; InSight on Mars |
| Groove Builder | the kit | Perseverance and InSight on Mars (NASA/JPL-Caltech) |

- **Built, not copied** (`npm run build:game-sounds`, a uv script with librosa): the source
  libraries stay outside the repository (`../sounds`), and every choice is in the script's tables.
  Who made what is in `public/games/sounds/CREDITS.md`. Only *Space Voices* is known to be a
  Pianobook library. The Pianobook libraries (*Nasa Space Pad*, *Space Voices*) and *The
  Spellsinger* need their makers' leave before a public release. The NASA recordings need only a
  credit.
- **A rhythm game needs a voice that speaks at once.** These libraries swell in slowly, up to three
  seconds for a Spellsinger note. So a sustained note is cut from the steadiest loud stretch after
  the library's own loop point and faded in over 12 ms. Its pitch is measured there (pyin) and
  corrected to its mapped note (up to 41 cents: the singer runs a little sharp), and a singer's
  phrasing is levelled so a held note stays present. Choir notes are 6 s long, Echo voices 5 s:
  enough for a whole note over slow beats, and held on past it.
- **The Mars kit**, all from the recordings:
  - **kick:** a rover wheel's thud, pitched down, with a meteoroid's knock on top for small
    speakers;
  - **snare:** a rover clank with the laser for its snap and a spray of laser clicks for its wires;
  - **rim:** the laser an octave down;
  - **hi-hats:** SuperCam's laser zapping a rock, as it is (closed) or as a decaying burst (open);
  - **cowbell:** MOXIE's hum at about 515 Hz, struck;
  - **toms:** the meteoroid strike, played from its peak and pitched to three drums.

  Every hit was measured to peak within a few milliseconds of its start. A thud that took 135 ms to
  peak would have sounded late on the grid, which is how the first cut of the kick came out. Any
  part a groove needs that the kit lacks (clap, ride, crash, tambourine) comes from the drums app's
  synthesized kit.
- **In the app** (`sounds.ts`):
  - **Loading:** each file is fetched and decoded once a session, starting as a game's screen
    opens, so it's ready by the first press. The silence before its first sound is cut off: an
    MP3 starts with its encoder's padding, kept or not depending on the browser. Rendered offline,
    every sampled note sounds within about 2 ms of its trigger.
  - **Fallback:** a game waits up to 4 s for its sounds and otherwise keeps the synthesized voice
    it had before, so it always has sound. A second press while a game starts can't start it
    twice.
- **Rhythm echo's voices keep their register.** The whistle lives around G♯3 and the hums around
  C3–G3. Each voice sounds in whichever whole octave puts its middle there (`octavesInto`), so no
  note is stretched more than about half an octave, and the canon's harmony is kept. The notes you
  see are as written.

## 9. Results (`components/games/RhythmResults.tsx`, `EchoResults.tsx`, `GrooveResults.tsx`)

Notation is rendered by Verovio (`Notation.tsx`): a lesson's own MEI, or a piece's bars cut from
the score with `select({ measureRange })`. Each played note is coloured by its grade through its
id. A piece offers to open it on its instrument: **Play it on the saxophone / piano / drums →**
opens that app with the piece loaded (App's `initialSong`, now for the drums too). The best result
per game, level and speed is kept on the device.

## 10. Next

- **More canons**, as more of Kunz's Op. 14 goes into the piano library. The Conductor could also
  sing them with two choirs.
- **Rhythm echo in 6/8**, for the rounds in compound time (*Row, row, row your boat*,
  *Three blind mice*): the beat dots and clicks would need the dotted-quarter pulse the Groove
  Builder already has.
- **Grooves from any chart**, the generated patterns included, and a mode where the parts are
  played on the pads they belong to, through the drums app's pad map.
- **Songs from any piece in the library,** not only the curated lists.
