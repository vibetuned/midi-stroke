# Grooves — credits

The drums app's **Grooves** are the performances of the **Groove MIDI Dataset**: 1,150
MIDI files — 13.6 hours, some 22,700 bars — of ten drummers playing a Roland TD-11
electronic kit to a click, in 18 styles, recorded by Google's Magenta team.

- **Dataset:** Groove MIDI Dataset (GMD), Magenta, Google,
  <https://magenta.tensorflow.org/datasets/groove>.
- **Paper:** J. Gillick, A. Roberts, J. Engel, D. Eck and D. Bamman, "Learning to Groove
  with Inverse Sequence Transformations", Proceedings of the 36th International Conference
  on Machine Learning (ICML), 2019.

The dataset is made available under the
[Creative Commons Attribution 4.0 International licence (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).
The files in `midi/` are its MIDI files, unchanged. `index.json` is its `info.csv`, with
each take's bars and swing added.

**Changes.** The app writes each performance out as a drum score: it puts every stroke
on a grid, per beat, from quarters to thirty-seconds, triplets and sextuplets, leaving the
drummer's timing against the click aside. It merges flams, leaves out strokes too soft to
hear, and reads the kit's pads as the drums the app notates. The scores are the app's
reading of the performances, not transcriptions by the drummers.

## If you made this dataset

Thank you for it. If you would rather it were not used here, or want the credit worded
differently, please email [dev@vibetuned.com](mailto:dev@vibetuned.com) or open an issue at
[github.com/vibetuned/midi-stroke](https://github.com/vibetuned/midi-stroke/issues), and it
will be removed or changed straight away.
