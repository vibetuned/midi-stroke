# Jazz Licks — Design & Implementation

> Read [saxo-scales.md](saxo-scales.md) first: the lick builder shares the jazz
> generator's horns, keys and spelling. This doc covers the **🎷 Jazz licks**
> entry of the Saxo and Piano song selectors, and the **jazz licks** collections
> of the saxophone and piano libraries.
>
> Code: [src/utils/jazzLicks.ts](../src/utils/jazzLicks.ts) (the generator),
> [src/components/saxo/JazzLickBuilder.tsx](../src/components/saxo/JazzLickBuilder.tsx) (UI),
> [scripts/build-jazz-licks.py](../scripts/build-jazz-licks.py) (the data),
> [scripts/build-jazz-lick-scores.mjs](../scripts/build-jazz-lick-scores.mjs) (the library scores),
> [scripts/check-jazz-licks.mjs](../scripts/check-jazz-licks.mjs) (validation).

Whole solos from the Weimar Jazz Database (`npm run build:jazz-scores`) turned
out to be the wrong material for beginners and intermediate players: a chorus
of Coltrane is something to study, not to practise. What players practise is
vocabulary — the phrases the masters come back to — and the Jazzomat Research
Project has measured exactly that.

## 1. The patterns

The **Pattern History Explorer** (Frieler, Höger, Pfleiderer & Dixon,
*Two web applications for exploring melodic patterns in jazz solos*, ISMIR 2018)
lists 653 interval patterns: sequences of at least six semitone intervals that
one eminent player used in at least three of their solos (for Bob Berg, seven
intervals in two solos; Charlie Parker's were mined from the Omnibook, in ten).
Together they have 11,630 instances in the database's 456 solos. The list is
in [scripts/data/jazzomat-653-patterns.json](../scripts/data/jazzomat-653-patterns.json),
most instances first, with the Explorer's counts. A pattern is bare intervals:
`[-1, -1, -1, -2, -2, -1]`.

## 2. How they are played (`build-jazz-licks.py`)

Every instance of every pattern is found again in the database's solos (11,676
against the Explorer's 11,630: 631 of the 653 counts are identical), and each
instance is read for:

- **its rhythm** — every note's place in beats, from the transcription's bar,
  beat and position on that beat's grid, simplified for reading onto quarters,
  eighths, triplets or sixteenths (the simplest grid that keeps the beat's notes
  apart; an instance that needs a finer one is not counted);
- **its chords** — the chord under the first note, and each change up to the
  last note: whole beats from the first note's beat, the note it arrives at, the
  root above the first chord's root, and the quality as a chart writes it
  (`E-7` → m7, `A79#` → 7♯9, `Db7913` → 13: see `scripts/wjazzd_chords.py`);
- **who** played it, in which style, and the **earliest recording** in the
  database.

A lick keeps the most common rhythm (its onsets, and where it starts in a 4/4
bar) and the most common chord context — taken from the instances played in
that rhythm when there are a couple, so the changes fit it — each with how
often it is played exactly so (typically a fifth of the time). The kind (scale
run, chromatic, arpeggio, mixed) and shape (ascending, descending, arch, valley,
winding) are read from the intervals. The result is
[public/jazz/jazzomat-licks.json](../public/jazz/jazzomat-licks.json) (≈290 KB,
fetched when the builder or a lick first needs it).

## 3. A lick written out (`jazzLicks.ts`)

```
lick:10-C-played-circle-alto-c1w0
     │  │ │      │      │    └── flags: chord symbols, written key
     │  │ │      │      └─────── horn — or "piano"
     │  │ │      └────────────── one key, or round the circle of fourths
     │  │ └───────────────────── rhythm: played, quarters, eighths, triplets, 16ths
     │  └─────────────────────── the root of the chord it is played over
     └────────────────────────── rank (1 = most instances)

lick:10-C-played-circle-piano-c1w0la      the piano's: its left hand in the flags,
                                          ls shells, la arpeggios
```

- **Placement.** The key is the root of the lick's first chord; its first note
  is its usual degree above it (lick #10 starts on the fifth of Cm7, and runs
  over Cm7 → F7 → B♭maj7). Round the circle, each key starts in a new bar, at
  the lick's usual place in the bar.
- **Range.** Each key is moved by whole octaves into the horn's written range,
  B♭3–F6, nearest its middle; for the piano, the right hand into C4–C6.
- **Spelling.** No key signature — the keys change — so every note is spelled
  for the chord under it: a letter of the chord's scale (mixolydian for a
  dominant, dorian for a minor seventh…), a chromatic note as the neighbour
  degree that needs no accidental (B♮ between C and B♭ over C7, not C♭), else
  sharp going up and flat coming down.
- **Rhythm.** As played, the notes fall on their beats' grids; the layout
  writes each beat as plain values on its grid, a triplet beat as a tuplet,
  notes tied across beats and whole beats merged into halves and wholes on the
  strong beats. The plain rhythms are even. The last note holds to its bar line.
- **Chords.** A change goes on its beat, as played, or with the note it arrives
  at, in even notes; the symbols are written above the staff, or not.
- **Piano**: a grand staff at concert pitch, the lick in the right hand, and in
  the left each chord from its change to the next, either
  - held as a **shell** — root (from E2), third and seventh — or
  - broken in **arpeggios**: eighths up root, fifth, seventh and tenth (root
    from C2), again and again, from the first eighth at or after the change.

  A 6th chord has its sixth for a seventh; a diminished chord its flat fifth
  and diminished seventh.

## 4. The builder

The **🎷 Jazz licks** entry — in the Saxo song selector, and in the Piano's —
lists the 653 with their notes and chords over C
and their instance counts, filtered by kind, shape, length and player. For the
lick chosen it says what it sounds over and what the player reads, how often it
is played so, how many times in how many solos, who played it most and who
first. The key wheel, concert/written toggle and horn work as in the jazz
generator; the rhythm, one key or round the circle, and the chord symbols are
the lick's own. On the piano there is no horn or written key — it plays at
concert pitch — and a **left hand** choice instead: shells or arpeggios. A
preview, an audition, and **Start**.

## 5. The library

The 50 most common licks are in the saxophone and piano libraries as
**jazz licks** (`npm run build:jazz-lick-scores`): each as played, round the
circle from concert C — the saxophone's in alto written pitch, the piano's with
shells in the left hand — named by rank, chords and notes over C
(`04 Cm7 F7 - C B♭ A G F E♭ D.mei`).

## 6. Credits and licence

[public/jazz/CREDITS.md](../public/jazz/CREDITS.md). The Weimar Jazz Database is
under the Open Database License; the licks' data is derived from it and released
under the same licence, with the Jazzomat Research Project credited in the data,
the builder and the scores. The licks are the app's own notation of a pattern's
intervals, over its usual chords, in its usual rhythm; no solo is reproduced.

## 7. Validation (`npm run check:licks`)

Every lick is written out and read back through Verovio as the apps read it:
round the circle as played for the alto, one key in eighths for the tenor, and
the piano with shells and with arpeggios — 37 keys each. It must play its
intervals in every key, stay inside B♭3–F6, keep its rhythm (as played, or
even), write its chords; on the piano put a shell under every chord, or keep the
arpeggios on the eighths, in the bass. Plus the URL codec (the piano's too), the
spelling of #1 (C B B♭ A G F E over C7) and its arpeggio (C2 G2 B♭2 E3), a ii–V,
the other rhythms, the circle in written pitch, and the 50 library scores in
both manifests.
