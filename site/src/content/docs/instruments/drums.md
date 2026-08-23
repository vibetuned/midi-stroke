---
title: Drums
description: Finger-drumming patterns on a percussion staff, built for the Yamaha FGDP-50, with a step-sequencer grid tracking the playhead.
---

The drums app trains rhythm patterns — short loops of one or two measures on
a **percussion staff**, built for the **Yamaha FGDP-50** finger-drum pad
(any GM-style pad controller works).

![Drums app](/screenshots/drums.png)

## How it differs from piano

- **No hand selection, no calibration** — pads are pads.
- **Pads map to notation**: drum notation encodes each instrument as a pitch
  and notehead shape (bass drum, snare, hi-hat, toms, cymbal). Incoming pad
  hits are matched back to the notated instrument automatically, and
  alternate pads for the same instrument (rimshot → snare, open → closed
  hi-hat) count as hits.
- **Patterns loop**: at the end of the pattern, playback wraps around with a
  short lead-in — keep grooving.

## The step-sequencer grid

Below the staff, the pattern is also shown as a **grid**: one row per
instrument, one column per subdivision (16 columns for sixteenth feels, 12
for triplet/12-8 feels), with the playhead sweeping column by column. Same
music, two notations — read the staff, verify with the grid.
