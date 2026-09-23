/**
 * The app's drum numbering: General MIDI percussion pads, the kit voice each
 * one plays, and the pad a notated drum note stands for. Pure data, used by
 * the synthesized kit (drumKit.ts), playback, practice mode and the pad map
 * (drumMap.ts).
 */

export type DrumVoiceKey =
    | 'kick' | 'snare' | 'rim' | 'hatClosed' | 'hatOpen' | 'ride' | 'crash'
    | 'tomLow' | 'tomMid' | 'tomHigh' | 'clap' | 'cowbell' | 'tambourine';

/** General MIDI percussion note → voice. */
export const PAD_TO_VOICE: Record<number, DrumVoiceKey> = {
    35: 'kick', 36: 'kick',
    37: 'rim',
    38: 'snare', 40: 'snare',
    39: 'clap',
    41: 'tomLow', 43: 'tomLow', 45: 'tomMid', 47: 'tomMid', 48: 'tomHigh', 50: 'tomHigh',
    42: 'hatClosed', 44: 'hatClosed',
    46: 'hatOpen',
    49: 'crash', 52: 'crash', 55: 'crash', 57: 'crash',
    51: 'ride', 53: 'ride', 59: 'ride',
    54: 'tambourine',
    56: 'cowbell',
};

/**
 * Score pitch (+ notehead) → pad. Verovio renders drum notation as pitches, so
 * f4 is a kick and c5 a snare; voices that share a staff position are told
 * apart by the notehead, which is why `head` matters — a c5 with a slash head
 * is a rim shot, a g5 with a "+" is an open hi-hat.
 */
export function padForScoreNote(midi: number, head?: string): number | undefined {
    switch (midi) {
        case 65: return 36;                                   // f4  bass drum
        case 64: return head === 'x' ? 39 : undefined;        // e4  clap
        case 69: return 43;                                   // a4  low tom
        case 72: return head === 'slash' ? 37 : 38;           // c5  rim shot / snare
        case 74: return 47;                                   // d5  mid tom
        case 76: return 48;                                   // e5  high tom
        case 77: return head === 'diamond' ? 56 : 54;         // f5  cowbell / tambourine
        case 79: return head === '+' ? 46 : 42;               // g5  open / closed hi-hat
        case 81: return 49;                                   // a5  cymbal
        default: return undefined;
    }
}

/** Score pitch → pad, for the voices a notehead cannot disambiguate. */
export const MEI_TO_PAD: Record<number, number> = {
    65: 36, 64: 39, 69: 43, 72: 38, 74: 47, 76: 48, 77: 54, 79: 42, 81: 49,
};
