// Alto-saxophone fingering table, keyed on WRITTEN MIDI pitch (the note printed
// on the transposed staff — see docs/saxo-app.md §3). VirtualSaxo renders these.
//
// Key model:
//   - octave key (left thumb)
//   - six main keys: LH 1=B, 2=A, 3=G ; RH 4=F, 5=E, 6=D
//   - auxiliary keys (below)
//
// Coverage: the full alto written range A#3..F6 (MIDI 58..89). The middle two
// octaves are the unambiguous standard fingerings. The two extremes use extra
// keys: the low register (≤ D#4) adds the pinky-table spatulas, and the top palm
// register (≥ D6) adds the left-hand palm keys + front F. The palm-key notes
// (E6/F6 especially) have common alternates — see the ⚠ comments.

export type AuxKey =
    | 'bis'      // bis Bb (small key between B and A)
    | 'gsharp'   // G# (LH pinky)
    | 'eb'       // low Eb / D# (RH pinky spatula)
    | 'lowC'     // low C (RH pinky spatula)
    | 'lowCs'    // low C# (LH pinky spatula)
    | 'lowB'     // low B (LH pinky spatula)
    | 'lowBb'    // low Bb (LH pinky spatula)
    | 'palmD'    // palm D (LH palm)
    | 'palmEb'   // palm Eb (LH palm)
    | 'palmF'    // palm F (LH palm)
    | 'frontF'   // front F (teardrop, LH index)
    | 'sideE';   // side E (high E, right-hand side key)

export interface SaxoFingering {
    /** Octave key (left thumb) engaged. */
    oct: boolean;
    /** Closed main keys, a subset of [1,2,3,4,5,6]. */
    main: number[];
    /** Auxiliary keys engaged. */
    aux?: AuxKey[];
    /** Explicitly all-open (no keys), e.g. written C#5. */
    open?: boolean;
}

export const SAXO_MAIN_KEYS = [1, 2, 3, 4, 5, 6] as const;

const ALL = [1, 2, 3, 4, 5, 6];

// Written MIDI note -> fingering. A#3 (58) .. F6 (89).
export const SAXO_FINGERING: Record<number, SaxoFingering> = {
    // --- Low register (octave key up; pinky spatulas) ---
    58: { oct: false, main: ALL, aux: ['lowBb', 'lowC'] }, // Bb3 / A#3
    59: { oct: false, main: ALL, aux: ['lowB', 'lowC'] },         // B3
    60: { oct: false, main: ALL, aux: ['lowC'] },         // C4
    61: { oct: false, main: ALL, aux: ['lowCs', 'lowC'] }, // C#4
    62: { oct: false, main: ALL },                        // D4
    63: { oct: false, main: ALL, aux: ['eb'] },           // Eb4 / D#4
    // --- Middle (lower octave) ---
    64: { oct: false, main: [1, 2, 3, 4, 5] },            // E4
    65: { oct: false, main: [1, 2, 3, 4] },               // F4
    66: { oct: false, main: [1, 2, 3, 5] },               // F#4 (fork)
    67: { oct: false, main: [1, 2, 3] },                  // G4
    68: { oct: false, main: [1, 2, 3], aux: ['gsharp'] }, // G#4
    69: { oct: false, main: [1, 2] },                     // A4
    70: { oct: false, main: [1], aux: ['bis'] },          // Bb4 (bis)
    71: { oct: false, main: [1] },                        // B4
    72: { oct: false, main: [2] },                        // C5
    73: { oct: false, main: [], open: true },             // C#5 (all open)
    // --- Middle (upper octave; same as low octave + octave key) ---
    74: { oct: true, main: ALL },                         // D5
    75: { oct: true, main: ALL, aux: ['eb'] },            // Eb5 / D#5
    76: { oct: true, main: [1, 2, 3, 4, 5] },             // E5
    77: { oct: true, main: [1, 2, 3, 4] },                // F5
    78: { oct: true, main: [1, 2, 3, 5] },                // F#5 (fork)
    79: { oct: true, main: [1, 2, 3] },                   // G5
    80: { oct: true, main: [1, 2, 3], aux: ['gsharp'] },  // G#5
    81: { oct: true, main: [1, 2] },                      // A5
    82: { oct: true, main: [1], aux: ['bis'] },           // Bb5 (bis)
    83: { oct: true, main: [1] },                         // B5
    84: { oct: true, main: [2] },                         // C6
    85: { oct: true, main: [] },                          // C#6 (octave only)
    // --- High palm register (octave + palm keys). ⚠ verify E6/F6 — alternates exist. ---
    86: { oct: true, main: [], aux: ['palmD'] },                       // D6
    87: { oct: true, main: [], aux: ['palmD', 'palmEb'] },             // Eb6 / D#6
    88: { oct: true, main: [], aux: ['palmD', 'palmEb', 'sideE'] },          // E6
    89: { oct: true, main: [], aux: ['palmD', 'palmEb', 'sideE', 'palmF'] }, // F6
};

export function getSaxoFingering(midi: number): SaxoFingering | null {
    return SAXO_FINGERING[midi] ?? null;
}
