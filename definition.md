Building a saxophone jazz scale generator requires shifting away from fixed-pitch keyboard mechanics to address single-line transposition, instrument-specific range limits, and bebop rhythmic placement.

A production-ready architecture must account for four distinct layers:

**1\. Transposition & Tessitura Engine**

Unlike the piano, all standard saxophones read exclusively in treble clef but sound at different pitches. The engine must decouple **Concert Pitch** (internal harmonic state) from **Written Pitch** (rendered staff notation).


* **Standard Keyed Range (Written Pitch):**  
  * Lowest note: Low $B\\flat3$.  
  * Highest standard note: High $F6$ or $F\\sharp6$.  
* **Full-Range Traversal (The "Bergonzi / Viola" Model):**  
  * Piano students practice scales root-to-root across 1 to 4 octaves.  
  * Jazz saxophonists train over the **entire functional horn range**: start on the root, climb scalar degrees to the highest available note under $F6$, descend to the lowest available note above $B\\flat3$, and return to the root.

**2\. Scale Taxonomy & Bebop Theory Rules**

Bebop scales are specifically 8-note synthetic scales created by inserting a chromatic passing tone so that **chord tones align with the downbeats** when played as straight eighth notes starting on a chord tone.

| Scale Name | Parent Scale / Chord Type | Scale Formula | Added Passing Tone | Downbeat Chord Tones |
| :---- | :---- | :---- | :---- | :---- |
| **Bebop Dominant** | Dominant 7th ($V7$) | $1 \- 2 \- 3 \- 4 \- 5 \- 6 \- \\flat7 \- 7$ | Natural 7 between $\\flat7$ and $1$ | $1, 3, 5, \\flat7$ |
| **Bebop Major** | Major 7th ($I\\text{maj}7$) | $1 \- 2 \- 3 \- 4 \- 5 \- \\sharp5 \- 6 \- 7$ | $\\sharp5 / \\flat6$ between $5$ and $6$ | $1, 3, 5, 6$ |
| **Bebop Dorian (Minor)** | Minor 7th ($ii\\text{m}7$) | $1 \- 2 \- \\flat3 \- 3 \- 4 \- 5 \- 6 \- \\flat7$ | Natural 3 between $\\flat3$ and $4$ | $1, \\flat3, 5, \\flat7$ |
| **Bebop Melodic Minor** | Minor-Major / Tonic Minor | $1 \- 2 \- \\flat3 \- 4 \- 5 \- \\sharp5 \- 6 \- 7$ | $\\sharp5$ between $5$ and $6$ | $1, \\flat3, 5, 6$ |

Beyond bebop scales, include core modern jazz vocabularies:

* **Melodic Minor Modes:** Dorian $\\flat2$, Lydian Augmented, Lydian Dominant, Mixolydian $\\flat6$, Locrian $\\sharp2$, Altered (Super Locrian).  
* **Symmetrical Scales:** Half-Whole Diminished (dominant), Whole-Half Diminished (diminished 7th), and Whole Tone.  
* **Pentatonics & Blues:** Major/Minor Pentatonic, Traditional Blues ($1 \- \\flat3 \- 4 \- \\flat5 \- 5 \- \\flat7$), and the 9-note Jazz Blues scale.

**3\. Pattern & Articulation Generators**

Jazz players rarely play continuous straight scalar runs. To train practical improvisation vocabulary, the generator should output structural permutations:

* **Digital Patterns:**  
  * $1-2-3-5$ (Coltrane changes foundation)  
  * $3-5-7-9$ (Rootless arpeggiation)  
  * Triadic pairs (e.g., alternating $C$ and $D$ major triads over $C$ Lydian)  
* **Approaches & Enclosures:**  
  * Single chromatic below: $\\sharp4 \\rightarrow 5$  
  * Double chromatic above: $\\flat6 \\rightarrow \\natural6 \\rightarrow 5$  
  * Diatonic above \+ chromatic below (Enclosure): $6 \\rightarrow \\sharp4 \\rightarrow 5$  
* **Jazz Articulation Rules:**  
  * Slur offbeats to onbeats ("doo-dl-doo-dl"): tongue the "and" of the beat, slur into the downbeat.  
  * Accent top notes of intervals larger than a minor third.

**4\. Notation Engine & Enharmonics**

* **Strict Enharmonic Spelling:** Chromatic passing tones must reflect the direction of line and standard theory. In a $C$ Bebop Dominant scale, render $B\\flat$ to $B\\natural$, never $A\\sharp$ to $B\\natural$. In Bebop Major, write $G\\sharp$, not $A\\flat$, if ascending into $A$.  
* **Accidental Safety:** Chromatics must reset cleanly across measure barlines to avoid visual clutter for students.