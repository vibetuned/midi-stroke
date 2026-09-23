# Learn by Ear — Design & Implementation

> Read [piano-app.md](piano-app.md) first. This doc covers the **By ear** game mode: additive
> melodic dictation, built from the functional and pedagogical specification written for it.
>
> Code: [src/utils/earTraining.ts](../src/utils/earTraining.ts) (the rules, pure),
> [src/components/EarTrainingProvider.tsx](../src/components/EarTrainingProvider.tsx) (the session),
> [src/components/EarTrainingPanel.tsx](../src/components/EarTrainingPanel.tsx) (controls and assessment),
> [src/hooks/useEarVeil.ts](../src/hooks/useEarVeil.ts) (the veil over a score viewer),
> [scripts/check-ear-training.mjs](../scripts/check-ear-training.mjs) (the acceptance criteria as checks).

The mode trains **audiation** — hearing and internalising pitch without notation to lean on — by
call and response. The instrument plays a phrase; the student plays it back from memory; every
successful response lengthens the phrase by one note. Nothing on the page gives the next note away.

It is the third mode beside Rhythm and Practice, on the piano and the saxophone, on any piece in
the library: bundled, imported, or generated. It trains the whole melody, or a passage chosen with
the handles on the minimap (§3).

---

## 1. Reducing a score to one line

The student picks a staff — **Treble** (right hand) or **Bass** (left hand) — in the ear panel.
Where several notes start together on that staff (a chord, or two voices), the treble keeps its
**highest** note, the soprano line, and the bass its **lowest**, the root. Ties are already merged
in the timemap, so a held note is one note to play; a repeated pitch is two. A note is cut off where
the next one starts, so the line is strictly monophonic.

A staff with no notes is disabled in the picker. Changing staff starts a new session.

## 2. The veil

Before and during a session, nothing ahead of the student is visible:

- **The keyboard shows no landing targets.** The expected-note glow is off, and so are the ROLI
  key lights (both are driven by the expected notes, which the mode empties), and so is the gray
  scale-shading generated exercises normally get.
- **The other staff shows empty bars**, not just dimmed notes. It is not being trained, and its
  notes would hint at the harmony.
- **Everything from the first unplayed note onwards shows empty bars.** Notes are revealed
  strictly in order, so what is visible is always a *prefix* of the melody. One cut, from the next
  note to the end of the score, hides every later note completely: its pitch, its rhythm, and the
  slope of any beam that would give away the melodic contour. This is the spec's "forward
  horizon": the student never sees an upcoming note.

A note is revealed — in its real engraving, key signature and accidentals included — the moment
it is played correctly, and stays visible. The page shows the phrase from its first note, so what
has been learned is always in view; during a response it follows the student note by note. By ear
the page glides there instead of jumping. It uses an exponential ease with a 140 ms time constant,
always toward the latest target, so a fast player skips straight to the latest note and nothing
queues. The other modes stay locked to the transport.

The empty bars are a second raster of the same Verovio SVG, drawn with the music hidden by a
stylesheet. Staff lines, barlines, the brace, clefs, key and time signatures and bar numbers stay.
Everything inside a layer (notes, rests, beams) goes, along with ledger lines and every measure- or
system-level event (slurs, ties, fingering, dynamics, hairpins). Because it is the same page, the
empty bars sit exactly where the real ones are, and the staff runs straight through the cut. The
raster is opaque, in the page colour, and is masked in over the rest of the page, from each note's
left edge onwards. That edge is measured in the rendered SVG, and a chord is measured as a whole so
its accidentals stay covered. The same mask also covers the other staff along its whole length.

The raster is built when the mode is entered and freed when it is left, so the other modes pay no
memory for it. While it is being built, a plain curtain in the page colour covers the same places,
so nothing shows through even for a frame. Both viewers use the same hook
([src/hooks/useEarVeil.ts](../src/hooks/useEarVeil.ts)); the saxophone has one staff, so there is
no other staff to hide.

**The saxophone's fingering chart** would show the answer, so by ear it never shows the note to
come. It shows the fingering of the note just played right, the way a piano key lights up green,
and a red "not that one" after a wrong note. The chart still shows the keys the player is holding,
which is their own hand, not a hint. A wind controller's notes are shifted into the written
register before they are judged, exactly as in the other modes.

## 3. The loop

**A passage, not only the whole piece.** The two handles on the minimap choose a stretch of bars
(the same range that loops in rhythm and practice). By ear, the melody is that passage's notes,
and the call starts from its first note at the tempo in force there. Changing the range starts a
new session. Everything after the passage stays veiled until it is complete. Everything before
it is not being trained, so it stays on the page.

| Phase | What happens |
|---|---|
| **Call** | The first *K* notes of the melody sound, on the app's instrument — or on the MIDI output chosen in the 🎧 playback panel. Keys pressed now are ignored. |
| **Response** | "Your turn": the student plays notes 1 to *K* from memory. Each right note turns green and is revealed. |
| **Breath** | After the *K*th note, half a second's rest, then the call for *K* + 1 notes. |
| **Complete** | All *N* notes in one response: the whole score is unveiled, the other staff included, and the summary appears. |

**Rhythm** — *As written* plays the phrase in the score's rhythm and tempo (the tempo the score
states, scaled by the slider, including tempo changes along the way); *Even pulses* plays one note
per beat at the slider tempo, slightly detached, so only pitch is left to listen for.

**Octave** — *Exact* (the default) requires the written register; *Any* accepts any octave of the
right note, for smaller keyboards.

## 4. A wrong note

The response stops at once, so a wrong interval is not practised in. The key flashes red, a short
dissonant buzz sounds, and the assessment comes up with the three figures from the specification:

- **Pitch accuracy** — correct keys as a share of all keys struck on the student's turn;
- **Audiation depth** — the longest phrase played back in full ("retained 7 notes by ear");
- **Longest streak** — the longest unbroken run of correct notes.

The modal does not say which note it should have been: that would answer the question the retry is
for. Two ways on:

| Path | What it does |
|---|---|
| **Retry from here** | Same phrase length, the call again, the student starts from note 1. Learned notes stay visible. (Enter.) |
| **Restart from beginning** | Back to a phrase of one note, with the whole score veiled again. |

The assessment covers the whole session, so restarting does not reset the figures.

## 5. Validation

`npm run check:ear` checks the rules against the specification's acceptance criteria — melodic
reduction (top/bottom note, ties, repeats, on a real bundled score as well as a fixture), the
masking prefix, the additive rounds, input locked during the call, the stop on a wrong pitch, the
two recovery paths, completion, the three figures, both octave settings, and both rhythms
including a phrase taken from after a tempo change.

The mode was also driven end to end in the browser with a simulated MIDI keyboard: rounds, a key
pressed during the call (ignored), a wrong note, Retry, completion, Train again, the bass staff and
any-octave matching; and six rounds on a real Mikrokosmos piece.

## 6. Decisions the specification left open

- **Where it lives**: a third mode in the piano and saxophone transports, rather than a separate app.
- **Masking style**: empty bars rather than neutral placeholder noteheads. Placeholders would still
  show how many notes are coming and their rhythm, while empty bars keep only the page's layout.
- **The other staff**: empty bars while training, unveiled with everything else at the end.
- **What the call plays through**: the playback target when one is set, otherwise the app's own
  instrument — the call always sounds, even with playback off.
- **Persistence**: the figures belong to the session; nothing is written to the song statistics yet.

## 7. Known limits

- **Whole pieces make long sessions.** The loop is additive, as specified, so *N* notes take *N*
  rounds and around N²/2 notes of listening: all of Mikrokosmos No. 32 is 52 rounds. Choosing a
  passage on the minimap is the way to keep a session short.
- **No drums.** Pitch dictation has nothing to train on a drum kit.
- **No persistence** of ear-training results in the statistics panel yet.
