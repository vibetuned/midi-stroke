# Drums Pattern Generator — Design & Implementation

> Read [drums-app.md](drums-app.md) first. This doc covers only the **pattern
> generator**: the drums counterpart of the piano
> [scale generator](piano-app.md) and the saxo
> [jazz generator](saxo-scales.md), reached from the Drums song selector's
> **🎛 Pattern generator** entry.
>
> Code: [src/utils/drumPatternGen.ts](../src/utils/drumPatternGen.ts) (algorithms + engraving),
> [src/components/drums/DrumPatternBuilder.tsx](../src/components/drums/DrumPatternBuilder.tsx) (the sequencer),
> [scripts/check-drum-patterns.mjs](../scripts/check-drum-patterns.mjs) (validation).

Drums have no scales, so the thing a drummer chooses is not a key but a **kit
and a density**: which voices play, and how many times each one hits in the
bar. That is exactly the shape of this builder — a 16-step sequencer with a
hit counter per voice, and a set of classical algorithms that decide *where*
those hits land.

![The pattern generator](screenshots/drum-generator.png)

Pick the voices, set the numbers (or roll them), choose an algorithm, and the
pattern is engraved as a percussion score and started like any other piece,
through a synthetic `drums:` URL that doubles as its stats key.

```
drums:euclid-b2-j2-s39u-a1-bd:8888.sd:0808.ch:aaaa.oh:1010
      │      │  │  │    │  └── the bar itself: 16 bits per voice, step 1 first
      │      │  │  │    └───── accents and velocity from pink noise
      │      │  │  └────────── seed (base 36)
      │      │  └───────────── variation between bars, 0–9
      │      └──────────────── bars
      └─────────────────────── algorithm
```

Because the bar is carried in the URL as an explicit bitmask, cells you toggle
by hand survive exactly, and the seed regenerates everything else — later
bars, accents, velocities — identically every time.

---

## Why not just random

A coin flip per step produces unmusical noise. Rhythm perception needs metric
hierarchy, periodicity and anchor points, so every engine here is a form of
**constrained stochasticity**: structure first, randomness inside it.

The five engines below all answer the same question — *given k hits, which of
the 16 steps?* — so the per-voice counter always means what it says. The
validation harness checks that promise over every algorithm, voice and count.

## 1. Euclidean rhythms (Bjorklund's algorithm)

Distribute k onsets over n steps as evenly as possible. Bjorklund wrote it in
2003 for timing pulses in a spallation neutron source; Toussaint showed in
2005 that the same distribution generates a great many traditional world
ostinatos.

The algorithm is Euclid's: pair each onset with a rest, then repeatedly
distribute the remainder across the groups until at most one group is left
over.

```
E(5,8):  [1][1][1][1][1] and [0][0][0]
         [1,0][1,0][1,0]     [1][1]
         [1,0,1][1,0,1]      [1,0]
         1 0 1 1 0 1 1 0     ← the Cuban cinquillo
```

`E(3,8)` is the tresillo, `E(4,16)` is four-on-the-floor, `E(8,16)` is
straight eighths. The generator rotates each voice's figure so it starts where
that voice belongs: a backbeat snare is rotated to land on 2 and 4, anchors
stay on the downbeat, and colour voices take a **stochastic rotation** from the
seed.

## 2. Metric-weighted Bernoulli masking

Each step carries a structural weight, following the metric hierarchy of a 4/4
bar (Lerdahl & Jackendoff's generative theory):

| Position | Steps | Weight | Role |
|---|---|---|---|
| Primary downbeat | 0 | 1.00 | bar anchor |
| Backbeats | 4, 12 | 0.92 | metric pulse |
| Half-bar | 8 | 0.80 | half-bar anchor |
| Eighth offbeats | 2, 6, 10, 14 | 0.40–0.46 | groove, syncopation |
| Sixteenths | odd steps | 0.10–0.18 | ghost notes, fills |

Rather than thresholding a coin flip per step — which cannot honour a hit
count — the generator samples **k steps without replacement**, each step's
chance proportional to its weight. The core groove therefore stays intact
while the decoration moves around.

Each voice bends that hierarchy toward its own job: the kick lifts the
downbeat and half-bar and adds the sixteenth pickups that push a groove, the
snare puts 2 and 4 above everything with ghosts on the sixteenths, hats and
ride weight the eighth grid, and the colour voices sit off the anchors.

## 3. Shift register (the "Turing machine")

A 16-bit linear-feedback shift register whose feedback passes through a
**probabilistic write head**, the trick the Music Thing Modular Turing Machine
made popular:

- **0%** — the register is a locked loop: the pattern repeats forever.
- **a few percent** — it loops for several bars, then mutates one hit, the way
  a drummer introduces a variation.
- **50%** — noise.

The register's running value ranks the steps and the top k become onsets, with
the metric weights breaking ties so the result still sits on the grid. The
write-head probability is the builder's **variation** slider.

## 4. Time-dependent Markov chain

A first-order chain where the probability of a hit depends on the previous
step — but with a **distinct row per step**, because a plain Markov chain has
no memory of absolute time and drifts off the downbeat. A hit makes an
immediate repeat less likely; a rest makes one more likely; the metric weight
sets the base rate. The result is then corrected to exactly k by adding the
strongest free step or dropping the weakest hit.

## 5. Cellular automata (Wolfram rules)

A 16-cell ring updated by a local rule, `s(i,t+1) = f(s(i-1,t), s(i,t), s(i+1,t))`:

- **Rule 30** — chaotic and aperiodic.
- **Rule 90** — fractal, self-similar, good for nested polyrhythms.
- **Rule 110** — gliders that interact: coherent without ever quite repeating.

The automaton runs one generation **per bar**, so a multi-bar pattern evolves
rather than loops. Live cells rank the steps and the top k become onsets.

## Two engines that run on top

**Bernoulli pulse jitter.** For everything except the automata, later bars take
a small per-onset probability of dropping out or nudging one sixteenth. At 0%
the pattern is an exact loop; a few percent makes each repeat a variation.
This is the builder's variation slider again, and it is why a 4-bar pattern
does not sound like a copy-paste.

**1/f pink noise (Voss-McCartney).** Velocities and accents come from a pink
noise sequence: M registers, register k refreshed every 2^k steps, output the
running sum. Voss and Clarke showed in 1978 that musical dynamics follow a 1/f
spectrum — white noise flickers hit to hit, a random walk drifts away. Pink
noise makes accents **group across a phrase**, which is what a player does. The
metric weight is mixed in so a downbeat never gets ghosted into inaudibility.

---

## The engraving

The output is percussion MEI in the dialect of the bundled drum charts, so the
existing score view and the step-sequencer display read it with no special
casing:

- one staff, `clef.shape="perc"`, 4/4, with the `n="0"` count-in measure;
- **two layers** — everything stems up in layer 1, the kick stems down in
  layer 2, which is standard drum-set notation;
- each hit sounds until the next one **within its beat**, so durations stay
  beat-local (sixteenth, eighth, dotted eighth, quarter) and gaps are filled
  with `<space>`, exactly as the bundled charts do;
- simultaneous voices in a layer become a `<chord>`; beats with more than one
  note and nothing longer than an eighth are beamed;
- noteheads carry the same `pname` / `oct` / `head.shape` / `head.fill` that
  `DRUM_MAP` in `VirtualDrums` matches on, which is what lets the app's own
  16-column grid light the right rows;
- accents are `<artic artic="acc"/>` and dynamics ride on `@vel`.

## Where this departs from the brief

The brief describes each algorithm in its natural form, where the number of
onsets is whatever the process happens to produce. The sequencer promises
something stronger — *this voice hits k times* — so three engines were adapted
to honour that count. All three keep the character of the original:

- **Bernoulli masking** is described as a threshold per step (draw r, fire if
  r < P). That cannot hit a target count, so the generator samples **k steps
  without replacement** with the same weights. The hierarchy still decides
  where hits are likely; only the total is pinned.
- **The shift register** is described as mapping individual bits or taps to
  individual voices (bit 0 = kick, bit 4 = snare). That ties the voices'
  densities to each other, so instead each voice gets its own register, and the
  register's running value **ranks** the steps — the top k become onsets. The
  probabilistic write head, which is what makes the engine interesting, works
  exactly as described.
- **The Markov chain** is described over shared states (rest / kick / snare /
  hi-hat), which again cannot express per-voice counts. The generator runs a
  binary chain per voice with a transition row per step — the time-dependent
  variant the brief itself recommends for keeping the downbeat — and then
  corrects the result to k by adding the strongest free step or dropping the
  weakest hit.

Two further notes: pink noise is used for **dynamics**, which is what the brief
proposes it for, rather than for placing onsets; and the automata advance one
generation **per bar** rather than per measure-cell, which is what makes a
multi-bar pattern evolve.

## Validation

`npm run check:drums` sweeps every engine over every voice and hit count and
checks that:

1. Bjorklund reproduces the reference Euclidean rhythms, and every `E(k,n)`
   has k onsets whose gaps differ by at most one step — the defining property;
2. **every engine places exactly the number of hits asked for**, for all 12
   voices, all counts 0–16 and several seeds;
3. Verovio loads and renders every generated score;
4. each note's MIDI pitch is the one the pad map aims at, so hit-detection
   matches the engraved voice;
5. every note is identifiable by the same rules `VirtualDrums` uses;
6. every layer of every bar adds up to exactly four quarters;
7. the timemap holds one count-in plus the right number of bars, and no note
   starts past the last barline;
8. `drums:` URLs round-trip, and bar 1 of the score is exactly the bar the
   sequencer shows.

## Known limits

- **16 steps, 4/4 only.** The app also reads 12-column charts (12/8 or triplet
  feel); the generator does not write them yet.
- **No fills.** A last-bar fill is the obvious next feature, and the automata
  already give a way to build one.
- **No swing.** Playback is straight, because scoring follows the engraved
  rhythm.
- **Velocity is cosmetic.** Hit-detection compares pitches, so `@vel` and the
  accents affect playback and reading, not scoring.
