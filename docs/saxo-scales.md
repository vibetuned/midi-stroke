# Saxo Jazz Scale Generator — Design & Implementation

> Read [saxo-app.md](saxo-app.md) first. This doc covers only the **jazz exercise
> generator**: the saxophone counterpart of the piano
> [scale generator](piano-app.md), reached from the Saxo song selector's
> **🎼 Jazz generator** entry.
>
> Code: [src/utils/jazzScaleGen.ts](../src/utils/jazzScaleGen.ts) (music),
> [src/components/saxo/JazzScaleBuilder.tsx](../src/components/saxo/JazzScaleBuilder.tsx) (UI),
> [src/utils/meiNotation.ts](../src/utils/meiNotation.ts) (engraving, shared with the piano generator),
> [scripts/check-jazz-scales.mjs](../scripts/check-jazz-scales.mjs) (validation).

The piano generator engraves conservatory technique on a grand staff. A
saxophonist needs something else: one treble staff, in **written** pitch for the
horn in their hands, over the **real keyed range** of the instrument, built from
the bebop and modern-jazz vocabulary rather than from major and minor scales.

Pick a key on the circle of fifths, a scale, a pattern and how much of the horn
to cover; the exercise is engraved on the fly and started like any other piece,
through a synthetic `sax:` song URL that doubles as its stats key.

```
sax:Bb-bebopdom-scalar-full-eighths-x1-alto-a1w0h0
    │  │        │      │    │       │  │    └── flags: articulation, written-key, high F♯
    │  │        │      │    │       │  └─────── horn
    │  │        │      │    │       └────────── repeats
    │  │        │      │    └────────────────── rhythm
    │  │        │      └─────────────────────── range: full horn, or 1–3 octaves
    │  │        └────────────────────────────── pattern
    │  └─────────────────────────────────────── scale
    └────────────────────────────────────────── root (concert, unless the w flag is set)
```

The design follows the four layers of the original brief this was built from.
Everything below says what was implemented and — where the brief and the
standard repertoire disagree — which one won and why.

---

## 1. Transposition & tessitura

**Concert pitch is kept separate from written pitch.** You choose the key you
*think* in — the key the band is playing — and the part is engraved transposed
for your horn. The `concert key` / `written key` toggle switches which domain
the circle of fifths is naming; the panel always shows both, so a B♭ blues
reads as "sounds in B♭, you read G" on alto.

| Horn | Key | Concert → written |
|---|---|---|
| **Alto** (default) | E♭ | up a major 6th (+9) |
| Tenor | B♭ | up a major 9th (+14) |
| Soprano | B♭ | up a major 2nd (+2) |
| Baritone | E♭ | up a major 6th + octave (+21) |

Transposition keeps the *spelling*, not just the pitch class: the letter moves
by the interval's letter count, so concert B♭ on alto is written G, never F𝄪.
When the result would be unreadable — concert F♯ on alto transposes to written
D♯, a nine-sharp key — the root is respelled to the enharmonic with the fewest
accidentals (E♭). That only ever fires past the seven-accidental wall.

**Range.** The standard keyed range in written pitch is the same for every
saxophone, which is the whole point of the transposing convention:

```
low B♭3 (MIDI 58)  ──────────────────────────  high F6 (89), or F♯6 (90) with the extra key
```

Every exercise is laid out on the scale tones that actually fall inside that
window, so the generator cannot ask for a note the horn does not have. Two ways
to cover it:

- **Full range** — the Bergonzi/Viola model the brief describes: start on the
  root, climb to the highest scale tone under the top of the range, descend to
  the lowest one above the bottom, and return to the root. One pass covers the
  whole instrument (41 notes for a bebop scale on alto).
- **1–3 octaves** — the piano-style root-to-root run, placed at the lowest root
  that leaves room, and clamped down when the horn cannot hold the request.

---

## 2. Scale taxonomy

### The bebop scales

An 8-note scale is a parent scale plus one chromatic passing tone, placed so
that **chord tones land on the downbeats** when the line is played in straight
eighths starting from a chord tone.

| Scale | Chord | Formula | Passing tone |
|---|---|---|---|
| Bebop dominant | V7 | 1 2 3 4 5 6 ♭7 ♮7 | ♮7 between ♭7 and 1 |
| Bebop major | Imaj7 | 1 2 3 4 5 ♯5 6 7 | ♯5 between 5 and 6 |
| Bebop dorian (♮3) | iim7 | 1 2 ♭3 ♮3 4 5 6 ♭7 | ♮3 between ♭3 and 4 |
| Bebop minor (♮7) | im7 | 1 2 ♭3 4 5 6 ♭7 ♮7 | ♮7 between ♭7 and 1 |
| Bebop melodic minor | mMaj7 | 1 2 ♭3 4 5 ♯5 6 7 | ♯5 between 5 and 6 |

> **One correction to the brief.** The brief lists the bebop dorian with
> the ♮3 passing tone *and* claims its downbeats carry 1, ♭3, 5 and ♭7. Those
> two statements cannot both hold: inserting the passing tone at the third
> degree pushes 5 and ♭7 onto odd scale steps, so they fall on the offbeats.
> The scale is right as written — it is David Baker's bebop minor, and it is
> the same note collection as the bebop dominant a fourth below, which is where
> its downbeat property comes from (the chord tones that land on the beat are
> the *dominant's*). The scale whose own m7 chord tones all land on the beat is
> dorian plus a **♮7** passing tone, so that one was added alongside it as
> **Bebop minor (♮7)**. Both are in the list; the builder shows a
> "♪ chord tones land on the downbeats" badge only on the scales where it is
> true, and `downbeatAligned()` is what decides.

The property holds through the turnarounds and across repeats, not just on the
way up. Ascending, a scale tone at step *j* is played at eighth *j*; after the
turn at the top it is played at eighth *2N − j*, which has the same parity — so
chord tones stay on the beat coming down. Repeats drop the duplicated root at
the seam, because a pass is an odd number of notes and repeating it whole would
flip every later note onto the offbeat. Both are checked by the validation
script, on every root.

### The rest of the vocabulary

- **Parent scales** — major (Ionian), dorian, mixolydian, melodic minor: what
  the bebop scales were built from.
- **Melodic minor modes** — dorian ♭2, lydian augmented, lydian dominant,
  mixolydian ♭6, locrian ♯2, altered (super Locrian). Spelled as modes, each
  letter used once, so the altered scale on C reads C D♭ E♭ F♭ G♭ A♭ B♭ (the
  7th mode of D♭ melodic minor) rather than a mix of sharps and flats.
- **Symmetrical** — half-whole diminished (7♭9), whole-half diminished (°7),
  whole tone (7♯5). The whole-half turns out to be downbeat-aligned for a
  diminished seventh, and the badge says so.
- **Pentatonic & blues** — major and minor pentatonic, the traditional blues
  scale, and the 9-note jazz blues.

---

## 3. Patterns & articulation

Jazz players rarely practise continuous scalar runs, so the traversal above is
only the skeleton. Each pattern re-reads it:

| Pattern | What it plays |
|---|---|
| Scalar run | the traversal itself |
| In thirds | every scale step paired with the one two above |
| Digital 1-2-3-5 | the Coltrane-changes cell, from each successive degree |
| Digital 3-5-7-9 | rootless arpeggiation, from each successive degree |
| Triad pairs | triads on degrees 1 and 2, alternating up the horn |
| Approach from below | one chromatic below each chord tone |
| Double chromatic above | two chromatic steps down onto each chord tone |
| Enclosure | the scale tone above, then the chromatic below, then the target |

Grouped cells are **skipped rather than clipped** when they would run off either
end of the horn, so every cell keeps its shape. Approach notes may leave the
scale but never leave the instrument's range.

> **A second correction.** The brief writes the double chromatic above as
> "♭6 → ♮6 → 5", which moves up a semitone before coming down two. The standard
> figure descends chromatically onto the target — ♮6 → ♭6 → 5, i.e. two
> semitones above, one semitone above, target — and that is what is generated.

**Articulation** (optional, on by default) applies two rules:

- **Slur the offbeat into the downbeat** — tongue the "and", slur across the
  barline into the next beat. Only meaningful when the line is running in
  eighths, so it is only emitted there.
- **Accent the top note of every leap wider than a minor third** — the note you
  arrive on going up, the one you leave going down.

Playback stays **straight**, not swung. Hit-detection follows the engraved
rhythm, so asking the player to swing would score them wrong.

---

## 4. Notation & enharmonics

Handled by [meiNotation.ts](../src/utils/meiNotation.ts), shared with the piano
generator so there is one engraving engine rather than two.

- **Degrees carry their own spelling.** A degree is a figure (`b7`, `#5`), not a
  semitone count: it fixes both the letter (root letter + degree number) and the
  alteration. That is what makes a C bebop dominant render B♭ → B♮ and never
  A♯ → B♮, and a bebop major write G♯ rather than A♭ climbing into A.
- **The key signature is chosen, not assumed.** Every signature from 7 flats to
  7 sharps is scored by how many accidentals it would draw for the scale, and
  the cheapest wins; ties go to the scale's conventional parent (a bebop
  dominant prefers the key it is the V7 of). G bebop dominant therefore reads in
  C major with the F♯ drawn, which is how the etude books print it.
- **Accidentals reset at every barline.** State is per measure, so a chromatic
  is redrawn in the next bar instead of relying on the reader's memory.
- **Silent alterations are still gestural.** An alteration that is heard but not
  drawn (it comes from the key signature, or from an accidental earlier in the
  bar) is written as `@accid.ges`, because Verovio's MIDI export resolves
  neither — only per-note accidentals. Without it the engraving and the
  playback would disagree, and the trainer would mark correct notes wrong.

---

## 5. Validation

`node scripts/check-jazz-scales.mjs` sweeps ~850 specs — every scale × every
pattern, every root × every horn × both key domains, every rhythm × range ×
repeat count — and checks that:

1. Verovio loads and renders every generated MEI;
2. every note is inside the horn's written range;
3. Verovio's MIDI export sounds exactly the pitches that were engraved
   (the `@accid.ges` question above, and what hit-detection compares against);
4. the timemap starts one beat after the count-in measure and the last bar is
   complete — what the scrolling score view and the transport assume;
5. downbeat-aligned scales really do keep their chord tones on the beat;
6. `sax:` URLs round-trip and every one produces a title.

The piano generator's refactor onto the shared notation layer was verified the
same way: 5632 specs generated before and after, byte-identical.

---

## 6. Known limits

- **The app is still alto-only for input.** `SAXO_INPUT_TRANSPOSE_SEMITONES` and
  the `VirtualSaxo` caption assume an alto; the generator's horn selector only
  changes which concert key the written exercise sounds in. The fingering chart
  stays correct either way — it is keyed on written pitch, which is the same for
  every saxophone.
- **The fingering table thins out at the extremes.** Full-range exercises reach
  the palm keys and the low pinky table, where alternates exist and only one is
  shown (see [saxo-app.md](saxo-app.md) §4).
- **No chord progressions.** Everything is one scale over one chord. ii–V–I
  chains, and patterns that move with the changes, are the obvious next step.
- **No swing playback**, as above.
