# Changelog

The release record of Midi Stroke, newest first. Each entry lists what the
release ships, user-visible first, with the platform behaviours probed along
the way. Install channels and downloads:
[ms.vibetuned.com/desktop](https://ms.vibetuned.com/desktop/) ·
[GitHub releases](https://github.com/vibetuned/midi-stroke/releases).

## Unreleased

### Learn by ear

- **A third mode, By ear**, on the piano and the saxophone: additive melodic dictation. The instrument plays a phrase, the
  student plays it back from memory, and each correct response adds a note, until the whole melody
  comes back in one go. Built from a functional and pedagogical specification; the design record is
  [docs/learn-by-ear.md](docs/learn-by-ear.md).
- **One staff, one line**: the student picks treble or bass, and where notes start together the
  treble keeps the top one and the bass the bottom one.
- **Nothing gives the next note away.** The keyboard's expected-note glow, the ROLI key lights and
  the scale shading are all off. The other staff, and everything from the first unplayed note to
  the end, show as empty bars in the page colour, lined up with the real ones. Notes are revealed
  strictly in order, so what is visible is always a prefix of the melody, and one cut hides every
  later note completely, beam slopes included. A note appears in its real engraving once it has
  been played.
- **Input is locked while the call sounds**; a wrong note stops the response at once with a short
  dissonant cue and an assessment — pitch accuracy, audiation depth ("retained 7 notes by ear"),
  longest streak — and two ways on: *Retry from here* (same phrase, learned notes kept) or *Restart
  from beginning* (one note, everything veiled).
- **Settings**: rhythm as written (at the score's own tempo, changes included) or even pulses; exact
  octave or any octave. The call goes to the chosen MIDI output when there is one.
- **Notes without ids** in an imported file used to be filed under staff 1, which silently dropped
  the left hand from hand selection; the viewers now give every note an id before loading.
- **Drums practice mode** accepts either pad of an instrument (rim or snare, open or closed hi-hat),
  as rhythm mode already did. Id-less charts now reveal which pad is written, and without this they
  would have started refusing the alternate.
- **On the saxophone** the fingering chart never gives the next note away. It shows the fingering
  of the note just played right and a red "not that one" after a wrong note, and the controller's
  octave is handled as in the other modes. The saxo viewer shows the same empty bars
  ([src/hooks/useEarVeil.ts](src/hooks/useEarVeil.ts), shared by both viewers).
- **The page glides** from place to place instead of jumping: to each new note during a response,
  and back to the start for each call. It always heads for the latest place, so a quick player
  never waits for the scroll to catch up.
- **A passage instead of the whole piece**, chosen with the minimap's handles (below). The call
  starts from the passage's first note, so a long piece no longer means a 52-round session.
- `npm run check:ear` states the specification's acceptance criteria as 49 checks, and the mode was
  driven end to end in the browser with a simulated MIDI keyboard.

### Loop a passage

- **Two handles on the minimap** (piano and saxo) choose a stretch of bars. They snap to bar lines,
  keep at least one bar between them, and darken the rest of the minimap
  ([src/components/LoopRangeSelector.tsx](src/components/LoopRangeSelector.tsx)).
- **Rhythm and Practice loop it.** It is Tone's own transport loop, so the wrap happens on the
  audio clock, and the practice pauses and score playback (both scheduled on the transport) come
  round again on every pass. Choosing the bars moves the playhead into them, ↺ goes back to their
  start, and the transport shows *⟲ bars 5–8* with a ✕ for the whole piece again.
- **Repeat signs on the score** mark the range in the instrument's colour, blue on the piano and
  gold on the saxo: ‖: at its first bar line and :‖ at its last
  ([src/hooks/useLoopMarks.ts](src/hooks/useLoopMarks.ts)). Both sit in the space before their
  bar line, where they cover no note. Once the music scrolls past the start sign, it waits at the
  cursor over the clef strip, so a running loop always shows where it began.
- **By ear it is the passage to learn**, with the same chip and ✕ in the transport to go back to
  the whole piece. A new score clears it.
- `npm run check:loop` (21 checks) covers snapping, labels and passages. In the browser, a
  one-bar loop wrapped twice in five seconds without leaving the bar, and practice mode waited at
  the bar's notes, then wrapped and waited at the first again.

### Your drum kit's pad map

- **Every note from a drum controller now goes through one editable map** to the kit voice it
  plays ([src/utils/drumMap.ts](src/utils/drumMap.ts)). The kit sound, rhythm scoring and
  practice-mode waiting all use it. It starts as General MIDI, so a GM kit behaves exactly as
  before: all 17 pads of the old fixed table are checked one by one.
- **The 🥁 button** in the drums header opens the editor
  ([src/components/drums/DrumMapEditor.tsx](src/components/drums/DrumMapEditor.tsx)). Press
  **Learn** on a voice and hit the pads and zones that should play it, or type a note number. The
  panel shows what each hit sends and plays, and the kit sounds through the new map at once. A note
  plays one voice, so re-learning moves it. The map is saved on this device.
- **Clap, cowbell and tambourine now score.** The old table had no entry for them, so those
  generator voices could never be hit in rhythm mode.
- The pad tables moved to [src/utils/drumPads.ts](src/utils/drumPads.ts), free of Tone, so the
  checks can load them. `npm run check:pads` (43 checks) covers the default, a remapped kit,
  storage, and every drum in the 518 bundled charts (8,613 notes), all playable on a GM kit.

### Playback moves to the header

- **The transport's playback selector is now a 🎧 button beside the stats**, opening a panel that
  lays the three choices out as cards — off, play in sound, send to MIDI — with what each one does,
  instead of a select squeezed into the transport. The MIDI card lists the output ports to pick
  from, says so plainly when there are none, and keeps showing a remembered port that is not
  plugged in, marked *not connected*, so it is clear why nothing sounds
  ([src/components/PlaybackPanel.tsx](src/components/PlaybackPanel.tsx)).
- The button lights up whenever the score is being played, and its tooltip names where.
- The exercise builders keep their compact selector beside ▶ Listen; both set the same remembered
  choice.

### The score's own tempo

- **A score that states its tempo now opens at it.** Every piece used to play at whatever the
  slider said, because the viewers keep time from the transport rather than from Verovio. The
  tempo is read from the MEI and handed to the transport; the slider moves to the marking and
  shows where it came from — *score ♩ = 160* — with a way back once you have moved off it
  ([src/utils/tempo.ts](src/utils/tempo.ts)).
- **Every MEI encoding**, in order of precedence: `@midi.bpm`, `@midi.mspb` (the literal MIDI
  set-tempo value, microseconds per quarter), `@mm` with `@mm.unit` and `@mm.dots`, and tempo
  text that spells a metronome mark ("♩ = 132", "♩. = 60", SMuFL glyphs in a `<rend>`). On
  `<scoreDef>` it is the opening tempo; a `<tempo>` element is a change at its note, its beat, or
  its measure.
- **Tempo changes are followed** as the piece plays, and seeking back across one restores the
  earlier tempo. The slider sets the opening tempo and every later section keeps its proportion,
  so half speed halves a faster middle section too. Auditions honour the same map.
- **One piece's marking never leaks into the next**: an unmarked score opens at the tempo you last
  chose for unmarked scores, not at whatever the previous piece was marked.
- **The slider now runs 20–240 in single steps**, instead of four positions from 30 to 120 —
  Bartók's Mikrokosmos marks ♩ = 160, which the old slider could not show at all.
- Verovio is not trusted for the values: it ignores `@midi.mspb`, reads a dotted metronome unit
  as 4/3 of the unit rather than 3/2 (dotted quarter = 60 plays at 80), and ignores tempo text.
  `npm run check:tempo` asserts both the right answers and those two Verovio behaviours, so a fix
  upstream is noticed. It still supplies where each mark falls.
- The timemap's DOM access is now DOM Level 2 only, so it also runs on xmldom in the node checks;
  verified byte-identical to the previous version on all 716 bundled scores.

Checked end to end with the Mikrokosmos files: the six that mark a tempo open at exactly their
`@midi.bpm` (96, 160, 104, 144, 160, 88), the playhead advances at 512 ticks a second at ♩ = 160
— which is 160 BPM — and the other 41 keep the tempo you chose.

## 0.0.2 — 2026-09-20

Generators for every instrument, and a way to hear them. The saxophone gained a
jazz scale generator and the drums a pattern generator, both built on the same
engraving engine as the piano's; drums stopped sounding like a piano; and any
piece or generated exercise can now be played back, as sound or out to a MIDI
device.

### Playback — in sound or in MIDI

- **Every generator can be auditioned.** Each exercise builder gained a **▶ Listen** button that
  plays what you just built, so a scale, a bebop pattern or a drum groove can be heard before you
  commit to practising it.
- **The transport can sound the score too**, on the instrument you are practising, following the
  tempo slider, seeking and the practice-mode pauses because it is scheduled on the same Tone
  transport as the scroll.
- **Or send it out as MIDI**: pick an output port and playback sends note-on/note-off there and
  sounds nothing locally — your synth, module or DAW plays the part. Drums go out as General MIDI
  pads on channel 10, everything else on channel 1.
- One remembered setting (off / sound / a port) shared by the transport and all three builders
  ([src/utils/playback.ts](src/utils/playback.ts), [src/utils/midiOut.ts](src/utils/midiOut.ts)).
- Notes are handed to the sink a quarter of a second ahead of the clock rather than all at once,
  which is what makes **Stop** stop: queue a whole exercise up front and everything already inside
  Web Audio or the MIDI port keeps playing after the button is pressed. MIDI ports are cleared as
  well as panicked, so nothing queued lands after the silence.
- Playback is driven from the **same timemap as the scrolling score**, so what you hear and what
  the page shows cannot drift apart, and it borrows the instrument `useAudio()` already built
  rather than loading a second copy of it.
- The timemap now carries each note's **notehead**, because drum voices share staff positions: a
  c5 with a slash head is a rim shot, a g5 with a "+" an open hi-hat. Generated drum scores carry
  note ids so that mapping survives into playback, and practice mode gained the same precision.
- The Tauri MIDI shim caches **one connection per port** instead of one overall, so the ROLI key
  lights and playback can be aimed at different devices without tearing a connection down on
  every note.
- [dev/playback-lab.html](dev/playback-lab.html) checks all of it without a MIDI device or a pair
  of ears: a spy instrument records what the audio sink would play and when, and the MIDI sink's
  bytes are built directly. 21 checks, including the scheduling, tempo scaling, every generator's
  output, the drum pad translation and a missing port.

### Drums finally sound like drums

- **Pads play a synthesized kit instead of the piano sampler.** A pad hit used to
  come out as a piano note at whatever pitch the pad mapped to; it now plays its
  own voice — twelve of them, covering kick, snare, rim, closed and open hi-hat,
  ride, crash, three toms, clap, cowbell and tambourine
  ([src/utils/drumKit.ts](src/utils/drumKit.ts)).
- **Synthesis, not samples, and deliberately**: the app notates twelve voices and
  the drum kits on the Tone.js CDN carry six (kick, snare, hi-hat, three toms), so
  half the kit would have been silent or wrong. The kit also needs no download and
  works offline in the desktop app — the Drums app now fetches **none** of the
  ~10 MB of piano samples it used to pull in.
- Membrane synths for kick and toms, filtered noise for the snare wash, hats, rim,
  clap and tambourine, an inharmonic oscillator bank for ride and crash, two
  squares through a band-pass for the cowbell. Velocity-sensitive throughout, a
  closed hi-hat chokes the open one, and the bus runs through a limiter because
  four full-velocity hits landing together summed past full scale.
- Tone's `MetalSynth` is avoided for the cymbals: in this version a bare
  `MetalSynth` stays silent for about a second after being triggered and then
  bursts, in every configuration including the default.
- **A way to check it without ears**: [dev/drum-kit-lab.html](dev/drum-kit-lab.html)
  auditions each voice and renders them offline to measure level, onset, ring time
  and spectral centroid against the range that makes each one that instrument,
  plus the no-clipping, choke and velocity checks. Every voice is in range; four
  at once peak at 0.82.

### The drums pattern generator

- **A 16-step sequencer that writes its own patterns.** Drums have no scales,
  so the song picker's **🎛 Pattern generator** entry asks for a kit and a
  density instead: pick the voices, say how many times each hits in the bar,
  and one of the classical rhythm algorithms places them. Every cell stays
  editable, 🎲 Propose rolls playable numbers *and* a new seed, and the result
  starts like any other piece through a synthetic `drums:` URL. Placement is
  deterministic, so the panel offers no "regenerate everything" button — with
  nothing changed it could only hand back the bar already on the grid; the per
  voice ↻ looks for a genuinely different bar and is disabled, with a reason,
  where the engine has only one way to place that voice. Design record
  in [docs/drums-patterns.md](docs/drums-patterns.md).
- **Five placement engines**, each answering the same question — given k hits,
  which of the 16 steps:
  - **Euclidean (Bjorklund)** — the even distribution behind most world
    ostinatos, with per-voice rotation so a snare lands on 2 and 4;
  - **Metric-weighted Bernoulli** — k steps sampled without replacement
    against the metric hierarchy of the bar;
  - **Shift register** — the Turing-machine write head: a locked loop that
    mutates as the variation rises;
  - **Time-dependent Markov** — a transition row per step, so the chain cannot
    drift off the downbeat;
  - **Cellular automata** — Wolfram rules 30, 90 and 110, one generation per
    bar, so patterns evolve instead of looping.
- **Two engines on top**: Bernoulli pulse jitter makes later bars drop or nudge
  the odd hit, so a repeat is a variation rather than a copy; and 1/f pink
  noise (Voss-McCartney) drives accents and velocities, which groups dynamics
  across a phrase the way a player's do.
- **Real percussion engraving**, in the dialect of the bundled charts: one
  perc-clef staff, two layers with the kick stems down, beat-local durations
  with `<space>` fills, chords for simultaneous voices, per-beat beaming,
  `<artic artic="acc"/>` accents and `@vel` dynamics. The app's own
  step-sequencer grid reads the generated score back with no special casing.
- **Seeded and self-contained**: the bar lives in the URL as a 16-bit mask per
  voice, so hand-edited cells survive exactly, and the seed regenerates later
  bars, accents and velocities identically every time.
- `npm run check:drums` sweeps every engine over every voice and hit count:
  the Euclidean reference rhythms, that **every engine places exactly the
  number of hits asked for**, that Verovio renders each score, that each note
  sounds the pitch the pad map targets and is identifiable by the drum map,
  that every layer adds up to four quarters, and that bar 1 of the score is
  the bar the sequencer shows.

### The saxo jazz scale generator

- **Jazz exercises engraved on demand**, the saxophone counterpart of the
  piano scale generator: the song picker's **🎼 Jazz generator** entry builds
  bebop scales, patterns and enclosures across the horn, started like any
  other piece through a synthetic `sax:` URL that doubles as its stats key.
  Full design record in [docs/saxo-scales.md](docs/saxo-scales.md).
- **Concert pitch and written pitch are separate.** Pick the key the band is
  playing and the part is engraved transposed for your horn — alto, tenor,
  soprano or baritone — with both keys shown as you work. Transposition keeps
  the spelling, and a written root that would need nine sharps is respelled
  (concert F♯ on alto reads E♭, not D♯).
- **Exercises are laid out on the real keyed range** (written B♭3–F6, or F♯6
  with the extra key), so the generator can never ask for a note the horn
  does not have. *Full horn* is the Bergonzi-style traversal — root to the
  top of the instrument, down to the bottom, back to the root — alongside the
  usual 1–3 octaves.
- **22 scales**: the four bebop scales plus a ♮7 bebop minor, the parent
  scales, the six melodic-minor modes, the symmetrical scales, and the
  pentatonic/blues family including the 9-note jazz blues.
- **8 patterns**: scalar, thirds, the digital cells (1-2-3-5, 3-5-7-9), triad
  pairs, and three chromatic approach/enclosure figures around every chord
  tone. Cells that would run off the end of the horn are skipped rather than
  clipped, so each keeps its shape.
- **Jazz articulation**: slurs each offbeat into the downbeat, accents the top
  note of every leap wider than a minor third. Playback stays straight —
  scoring follows the engraved rhythm, so swung eighths would be marked wrong.
- **Chord tones on the downbeats** is treated as a property to verify, not to
  assume: the builder badges only the scales where it actually holds, and it
  is preserved through the turnarounds at both ends of the horn and across
  repeats (a pass is an odd number of notes, so repeats drop the duplicated
  root at the seam).

### Notation engine

- **One engraving layer for both generators** — measure layout, durations,
  beaming, tuplets and the accidental rules moved out of the piano generator
  into `src/utils/meiNotation.ts`. Verified by generating 5632 piano exercise
  specs before and after: byte-identical output.
- Accidentals reset at every barline, and an alteration that sounds without a
  glyph is written `@accid.ges`, because Verovio's MIDI export resolves
  neither the key signature nor carried accidentals — without it the
  engraving and hit-detection would disagree.

### Corrections to the source brief

- Three of the drum engines were **adapted to honour a hit count**, which the
  brief's formulations cannot express: Bernoulli masking samples k steps
  without replacement instead of thresholding each step; the shift register
  gets one register per voice and ranks steps by its value instead of mapping
  single bits to single voices; and the Markov chain runs per voice, then
  corrects to k. Each keeps the character of the original, and
  [docs/drums-patterns.md](docs/drums-patterns.md) records why.
- The **bebop dorian** was specified with the ♮3 passing tone *and* with all
  four m7 chord tones on the downbeats; those cannot both hold, since the
  passing tone pushes the 5 and ♭7 onto odd scale steps. The scale is kept as
  written (it is the same collection as the bebop dominant a fourth below,
  whose chord tones are what land on the beat) and **bebop minor (♮7)**, the
  variant that does put all four on the beat, was added beside it.
- The **double chromatic above** was specified as ♭6 → ♮6 → 5, which steps up
  before descending; the standard figure descends chromatically onto the
  target and that is what is generated.

### Verification

- `npm run check:jazz` sweeps ~850 specs — every scale × pattern, every root ×
  horn × key domain, every rhythm × range × repeat count — checking that
  Verovio renders each one, that every note is inside the horn, that the
  exported MIDI sounds exactly what was engraved, that the timemap starts
  after the count-in and the last bar is complete, and that downbeat-aligned
  scales stay aligned.
- Driven end to end in a headless browser, splash through to the scrolling
  score view.

### Docs

- New [docs/saxo-scales.md](docs/saxo-scales.md) and
  [docs/drums-patterns.md](docs/drums-patterns.md); the user guide's saxo and
  drums pages gained generator sections with screenshots.
- **The guide now leads with the native app**: install moves to the top of
  the sidebar, the landing page's first action installs the desktop build with
  per-platform commands, and getting-started treats the browser as the
  alternative rather than the default.

## 0.0.1 — 2026-08-30

The first release: the complete four-instrument training suite as a web app
([ms.vibetuned.com/app](https://ms.vibetuned.com/app/)) and as a desktop app
for macOS, Windows and Linux. Validated on all three platforms before
tagging.

### The instruments

- **🎹 Piano** — grand-staff training with hand selection (L / R / both),
  key-range calibration (the virtual keyboard only draws keys you have), a
  sticky clef strip, a seekable minimap with wrong-note markers, and a full
  virtual keyboard that glows the expected keys per hand.
- **🥁 Drums** — finger-drumming patterns on a percussion staff, built for
  the Yamaha FGDP-50: looping playback, MEI-to-pad MIDI mapping, and a
  step-sequencer grid that tracks the playhead column by column.
- **🎷 Saxo** — single-voice melodic training for wind controllers (built
  for the TravelSax): the score engraved transposed for E♭ alto, a full-key
  fingering chart that glows keys to press and reddens keys to release, a
  live breath meter (CC 2/7/11 + channel pressure), and a mirror toggle.
- **🎼 Theory** — a course player pairing lesson videos with
  fill-in-the-blank worksheet exercises rendered as real engraved scores:
  you *write* music (from the clickable piano, the circle-of-fifths wheel,
  or a MIDI keyboard), then check, reveal, or listen. Ships with the
  Elementary rudiments and Notation courses; per-exercise progress and
  watched-video state persist locally.

### The engine

- **Verovio → Pixi.js score pipeline**: SMuFL-compliant engraving from MEI,
  rasterised into textures and scrolled on a WebGL canvas for
  frame-accurate playhead tracking. Tone.js drives the transport,
  metronome, and instrument synthesis (piano samples download on first
  use).
- **Two game modes on every piece** — *Rhythm* (play along in time, scored
  with hit/miss windows) and *Practice* (playback pauses on each note group
  and waits for the correct notes — chords included).
- **Tempo control and seeking** — slow-motion drills to full speed, with
  per-song accuracy, combos and history persisted locally.
- **Bring your own scores** — load a single MEI file, or import a ZIP of
  MEI scores as a permanent on-device collection (browser OPFS,
  offline-capable, deletable). A one-beat count-in measure is injected at
  load time when missing, so scores need no preparation.
- **Optional score server** — a small self-hosted Node companion
  (`server/`, Express + built-in `node:sqlite`, no build step) that stores
  MEI collections by instrument and category; the song selector connects,
  browses, caches for offline, and uploads into new or existing categories.
- **PWA** — the web app installs and auto-updates; scores, stats and
  imports live on-device.

### The scale generator (piano)

- Technique exercises in all 24 keys, engraved on demand — no score files:
  pick a key on the **circle of fifths** (natural / harmonic / melodic for
  minors) and one of **eleven forms**: parallel and contrary motion, scales
  in thirds / sixths / tenths, scale triads, triad inversions, broken
  triads, tonic and dominant-seventh arpeggios, and cadences (I–IV–V7–I) —
  in quarters, eighths, sixteenths or triplets, over 1–4 octaves, with
  optional repeats.
- **Conservatory fingering** engraved on the staff (toggleable) and a live
  preview before starting. The exercise URL is its stable identity, so
  precision history accumulates per key/form like any piece.
- As a practice guide, the virtual keyboard **grays out keys foreign to the
  exercise's key** (they stay playable).

### ROLI hardware light guide

- With a ROLI Piano / LUMI Keys connected, expected notes also light up on
  the **physical keys** (per key, octave-accurate, chords included), by
  mirroring the guide as note-on/off to the device — established with a
  hardware probe (`src-tauri/examples/lumi_probe.rs`) after the
  reverse-engineered SysEx protocol turned out to only move the root pitch
  class. Scale exercises additionally paint the exercise's **key across the
  whole keyboard** (SysEx root + scale).
- The device wipes a guide light itself when you press and release that
  key, so the guide re-sends the note-on after release — repeated notes and
  common tones between chords light up again instead of staying dark.

### The desktop app (Tauri)

- The same trainer with **native MIDI** (midir: CoreMIDI / WinMM / ALSA) —
  no Web MIDI needed, so it runs where browsers can't, and hot-plugging
  devices just works. Full 3-byte messages stream to the trainer: velocity
  for piano/drums, breath CCs and channel pressure for saxo.
- **Distribution**: signed + notarized macOS universal dmg
  (`brew install --cask vibetuned/tap/midi-stroke`), Windows NSIS installer
  (`winget install Vibetuned.MidiStroke`), Debian package via a signed
  [apt repository](https://ms.vibetuned.com/desktop/), and an AppImage —
  all built by CI from a version tag and attached to the
  [GitHub release](https://github.com/vibetuned/midi-stroke/releases).

### Platform behaviours probed for this release

- **Linux/WebKitGTK form controls**: the `<select>` popup is drawn on the
  GTK side (tauri#11755) — white default background plus the app's
  inherited white text. Fixed app-wide with `appearance:none` +
  `color-scheme:dark` + explicit option colors and an SVG chevron.
- **Linux/WebKitGTK SVG filters**: `filter: invert(1)` is not applied to
  SVG `<g>` elements, which left the circle-of-fifths hub engraving black
  on black; the engraving is now recolored with plain CSS `fill`/`color`.
- **ALSA MIDI loopback**: midir gives every output connection a *readable*
  client port, so a connect-everything input bridge reads its own key-light
  stream back as key presses (practice mode advanced by itself). The
  desktop shell now skips its own ports everywhere
  (`src-tauri/examples/loopback_probe.rs` demonstrates the loop); verified
  against the real device that the ROLI itself does not echo.
