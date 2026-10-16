/**
 * The session as it is played, for the results at its end
 * (components/SessionResults.tsx): every key the player strikes and every
 * note they let go by, at the transport tick it happened — and how long the
 * piece was played for. The counts live in the stats context; this is the
 * where and the when, kept outside React because keys come faster than renders.
 *
 *   hit    a key that played a note of the score, at the tick it was heard
 *          (rhythm: `offset` is how far from the note's own tick, + late);
 *          in practice, the note answered, at its tick
 *   wrong  a key that played nothing the score asks for, at the tick heard
 *   miss   a note of the score nobody played (rhythm), at the note's tick
 *
 * Cleared with the session's counters (StatsContext resetSession): a new song,
 * the ↺ button, another hand, the end of a piece.
 */

export type SessionEventKind = 'hit' | 'wrong' | 'miss';

export interface SessionEvent {
    tick: number;
    kind: SessionEventKind;
    /** A rhythm hit: heard tick minus the note's tick — negative early, positive late. */
    offset?: number;
}

let events: SessionEvent[] = [];
let playedMs = 0;
let playingSince: number | null = null;

export function logSessionEvent(e: SessionEvent): void {
    events.push(e);
}

/** The session's events, in the order they happened. */
export function sessionEvents(): readonly SessionEvent[] {
    return events;
}

/** Playing or not (the transport's play state, not its practice pauses): time is counted while playing. */
export function sessionPlaying(on: boolean, now = performance.now()): void {
    if (on && playingSince === null) playingSince = now;
    if (!on && playingSince !== null) {
        playedMs += now - playingSince;
        playingSince = null;
    }
}

/** How long this session has been played, in milliseconds. */
export function sessionPlayedMs(now = performance.now()): number {
    return playedMs + (playingSince === null ? 0 : now - playingSince);
}

/** A new session: no events, no time — still counting if it is playing now. */
export function clearSessionLog(now = performance.now()): void {
    events = [];
    playedMs = 0;
    if (playingSince !== null) playingSince = now;
}
