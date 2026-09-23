---
title: Drums
description: Finger-drumming patterns on a percussion staff, built for the Yamaha FGDP-50, with a step-sequencer grid and a generator that writes patterns from classical rhythm algorithms.
---

The drums app trains rhythm patterns — short loops of one or two measures on
a **percussion staff**, built for the **Yamaha FGDP-50** finger-drum pad
(any GM-style pad controller works).

![Drums app](/screenshots/drums.png)

## How it differs from piano

- **No hand selection, no calibration** — pads are pads.
- **Pads map to notation**: drum notation encodes each instrument as a pitch
  and notehead shape (bass drum, snare, hi-hat, toms, cymbal). Incoming pad
  hits are matched back to the notated instrument through the pad map (below),
  and alternate pads for the same instrument (rimshot → snare, open → closed
  hi-hat) count as hits, in rhythm and practice mode alike.
- **Patterns loop**: at the end of the pattern, playback wraps around with a
  short lead-in — keep grooving.

## How it sounds

Pads play a **drum kit**, not a piano: twelve voices covering kick, snare, rim,
closed and open hi-hat, ride and crash, three toms, clap, cowbell and tambourine.
They respond to how hard you hit, a closed hi-hat chokes the open one the way the
pedal does, and alternate pads for the same instrument make the same sound.

The kit is synthesized rather than sampled, so there is nothing to download and it
works offline — including in the [desktop app](../../desktop/), where sampled
instruments need the network on first use.

## Your kit's pad map

Every drum module sends its own MIDI notes. General MIDI fixes the common ones: 38 for the snare,
42 for the closed hi-hat, and so on. Many modules add their own, such as edge zones, rims and
extra toms, and many let you re-assign any pad. The **🥁** button in the header opens the pad map:
every kit voice, with the notes that play it.

- **It starts as General MIDI**, alternates included, so a GM kit works with no setup.
- **Teach it your kit**: press **Learn** on a voice and hit every pad or zone that should play it.
  Hit a hi-hat's bow and its edge, and both count as the hi-hat. You can also type a note number.
- **Test as you go**: the panel shows the note each hit sends and what it plays, and the kit sounds
  through the new map straight away. A note that is not assigned makes no sound and scores nothing.
- Each note plays one voice, so learning it for another voice moves it. The ×
  on a note unassigns it, and **Reset to General MIDI** starts over.

The map is saved on this device. The header button is highlighted while a custom map is in use.
Clap, cowbell and tambourine score like the rest of the kit now; before the map, those three
pads were missing from the scoring table.

## The step-sequencer grid

Below the staff, the pattern is also shown as a **grid**: one row per
instrument, one column per subdivision (16 columns for sixteenth feels, 12
for triplet/12-8 feels), with the playhead sweeping column by column. Same
music, two notations — read the staff, verify with the grid.


:::tip[Pads work best on the desktop app]
The [desktop app](../../desktop/) reads your pad controller through the
operating system's own MIDI stack, so it is picked up the moment you plug it
in, hot-plugging included. Nothing else changes.
:::

## Pattern generator

The song picker's **🎛 Pattern generator** entry writes patterns for you. Drums
have no scales, so what you choose is a **kit and a density**: a 16-step
sequencer where you pick the voices and how many times each should hit in the
bar.

![The pattern generator](/screenshots/drum-generator.png)

Set the numbers by hand, or hit 🎲 **Propose** to roll playable ones for the kit
you assembled. Every cell stays editable — click any square to add or remove a
hit, and the counter follows.

### The algorithms

Pure randomness sounds like noise, because rhythm needs metric hierarchy and
anchor points. Each engine below answers the same question — *given this many
hits, which of the 16 steps?*

| Algorithm | What it does |
|---|---|
| **Euclidean (Bjorklund)** | spreads the hits as evenly as possible — the distribution behind most world ostinatos. E(5,8) is the Cuban cinquillo, E(4,16) is four-on-the-floor, E(8,16) straight eighths |
| **Metric-weighted Bernoulli** | samples against the hierarchy of the bar: downbeat, backbeats, half-bar, eighth offbeats, then sixteenth ghost notes |
| **Shift register** | the Turing-machine trick: a locked loop that starts mutating as you raise the variation |
| **Markov chain** | each step conditioned on the one before, with a separate matrix per step so it never loses the downbeat |
| **Cellular automata** | Wolfram rules 30, 90 and 110 over the 16 cells, advancing one generation per bar — patterns that evolve instead of looping |

Each voice bends the hierarchy toward its own job, so a Euclidean snare lands
on 2 and 4 while the kick keeps the downbeat.

### Variation and dynamics

- **Variation between bars** decides how much later bars drift: at 0% the
  pattern is an exact loop, and a few percent drops or nudges the odd hit, the
  way a drummer varies a groove. The automata evolve instead.
- **Accents and velocity** come from 1/f pink noise, so dynamics group across a
  phrase rather than flickering from hit to hit.

Patterns are engraved as real percussion notation — two layers, kick stems
down, beamed per beat, accents marked — and play like any other piece, with
the step grid reading them back:

![A generated pattern in the score view](/screenshots/drum-pattern-play.png)

Every pattern has a seed, so the exercise you started is the one you come back
to, and its stats accumulate like any other piece.
