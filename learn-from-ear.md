# **Functional & Pedagogical Specification: Additive Melodic Ear Training**

## **1\. Pedagogical Objective & Foundations**

This mode trains **audiation**—the ability to hear, internalize, and comprehend musical pitch without physical notation as a crutch. It implements an **additive call-and-response dictation method**:

* The instrument presents an acoustic phrase (Call).  
* The student internalizes the intervals and reproduces them on the keyboard (Response).  
* Each successful reproduction extends the phrase by one note, progressively strengthening auditory short-term memory and relative pitch perception.

## **2\. Score Reduction & Melodic Voice Isolation**

Real piano scores frequently contain polyphonic voices, homophonic chords, or counterpoint. Before ear training begins, the score must undergo melodic reduction to yield an unambiguous monophonic target.

* **Staff Isolation:** The student selects one clef/staff to study (Treble / Right Hand or Bass / Left Hand).  

* **Rhythmic Normalization:** Durations can either adhere strictly to the written notation tempo or play back as evenly spaced pulses to focus purely on pitch discrimination.

## **3\. Visual Masking ("Blind Audiation" Rule)**

Sight-reading directly compromises pitch internalization during ear training. Therefore, visual score feedback is strictly inverted:

* **Initial State:** All notes in the target piece are masked (veiled, hidden, or displayed as neutral placeholders) on the musical staff. The on-screen keyboard displays no visual landing targets.  
* **Progressive Revelation:** A note appears on the staff in its standard notation (clef position, accidental, notehead) and illuminates on the virtual keyboard **only after** the student strikes the correct pitch by ear.  
* **Forward Horizon:** The student never sees upcoming notes before they are sounded and played.

## **4\. The Call-and-Response Melodic Loop**

The session progresses through an incremental phrase-building cycle across $N$ total notes:

### **Phase 1: The Acoustic Demonstration (Call)**

> 1. In round $K$ (where $K$ begins at 1 and ascends to $N$), the sound engine sounds the sub-phrase from the beginning up through note $K$: $\[P\_1, P\_2, \\dots, P\_K\]$.  
> 2. While the call is sounding, student performance inputs are muted or locked to ensure focused auditory attention.

### **Phase 2: Performance & Reproduction (Response)**

> 1. Once the call finishes, a prompt signals that it is the student's turn.  
> 2. The student must play the phrase from memory, starting from pitch $P\_1$ through pitch $P\_K$.  
> 3. As the student plays each pitch:  
   * **Correct Pitch ($P\_i \== \\text{Target}$):** The key illuminates with a positive cue, the notehead becomes permanently visible on the score, and the system waits for pitch $P\_{i+1}$.  
   * **Sequence Completion ($i \== K$):** If the student successfully reaches note $K$, the phrase boundary expands ($K \= K \+ 1$). After a brief musical breath (half-second rest), the engine triggers Phase 1 for the extended phrase $\[P\_1 \\dots P\_{K+1}\]$.

### **Phase 3: The Climax (Session Complete)**

When the student successfully performs all $N$ notes of the piece in one continuous response, the entire score is unveiled, and the ear-training assessment summary appears.

## **5\. Pedagogical Error Handling & Recovery**

When the student plays an incorrect pitch, immediate feedback prevents the muscle memory of an erroneous interval from taking root.

### **1\. Interruption & Acoustic Cue**

* The incorrect key emits an error marker (visual alert and a muted/dissonant cue).  
* The response phase halts immediately to avoid compounding mistakes.

### **2\. Formative Assessment Display**

A performance modal appears showing:

* **Pitch Accuracy:** Percentage of correct key strikes across all attempts.  
* **Audiation Depth:** Maximum consecutive phrase length achieved (e.g., "Retained 7 notes by ear").  
* **Longest Pitch Streak:** Unbroken series of correct intervals.

### **3\. Recovery Modalities**

The student is given two pedagogical paths to continue:

| Path | Pedagogical Intent | System Action |
| :---- | :---- | :---- |
| **Retry from Here** | **Local Interval Reinforcement:** Focuses on resolving the immediate harmonic leap or tricky interval that caused the stumble. | Maintains current phrase length $K$. Re-plays the acoustic call for $\[P\_1 \\dots P\_K\]$ so the student can re-hear the passage. Student retries from $P\_1$. |
| **Restart from Beginning** | **Tonal Anchor Re-establishment:** Clears working memory and rebuilds the phrase from the tonic center. | Resets phrase length $K$ back to 1\. Re-masks the entire score. Plays acoustic call for pitch $P\_1$. |

## **6\. Music Theory Configuration Rules**

The following musical parameters dictate how strictly pitches are evaluated:

* **Pitch Class vs. Absolute Register (Octave Strictness):**  
  * *Absolute Pitch (Default):* The student must hit the exact register indicated on the staff (e.g., $C\_4$ must be played as $C\_4$; striking $C\_3$ or $C\_5$ is counted as an incorrect register).  
  * *Pitch Class Equivalence (Optional):* Any octave of the correct pitch name ($C$) is accepted, accommodating different keyboard sizes or vocalizations.    
* **Accidentals & Enharmonic Spelling:**  
  * Visual notation revelation must reflect the true harmonic spelling dictated by the piece's key signature (e.g., displaying $F\\sharp$ rather than $G\\flat$ in G Major).

## **7\. Functional Acceptance Criteria**

* \[ \] Isolates either the Treble (Soprano lead) or Bass (Root foundation) staff into a strictly monophonic melodic sequence.  
* \[ \] Completely masks downstream notation on the staff until successfully sounded and played.  
* \[ \] Round 1 prompts pitch 1; succeeding advances to prompt pitches 1 and 2; this continues cumulatively through the full melody.  
* \[ \] Prevents student input while the auditory demonstration is sounding.  
* \[ \] An incorrect pitch halts input instantly and presents the formative assessment summary.  
* \[ \] Selecting "Retry from Here" replays the demonstration for the current phrase length without resetting overall progress.  
* \[ \] Selecting "Restart from Beginning" resets the target sequence back to the opening single note.  
* \[ \] Completing the entire melody reveals the full score and performance summary.
