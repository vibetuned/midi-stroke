/**
 * Telling the player's notes from the app's own.
 *
 * The app sends notes to MIDI outputs — a score played to a synth or to the
 * keyboard itself (utils/midiOut.ts), the guide lights on a ROLI keyboard
 * (utils/keyLights.ts) — and a keyboard that is both the output and the input
 * can send them straight back: a ROLI Piano does. Back on the input they
 * looked like keys pressed: dots on the visual metronome, notes for the
 * judging. So every note-on the app sends is noted here, and a note-on that
 * comes in as its echo — the same key, the same velocity, within a few
 * milliseconds of when it was sent — is not the player's (utils/midiInput.ts).
 *
 * A key pressed by a hand matching all three is vanishingly rare; on a device
 * that does not echo, nothing matches, and nothing is dropped. Note-offs are
 * left alone: dropping a real one would leave a key held forever.
 */

/** How soon after it was sent an echo arrives, at most; and how early, for clock skew. */
const LATE_MS = 40;
const EARLY_MS = 5;
/** Sends long past are forgotten. */
const KEEP_MS = 2000;

interface Sent { note: number; velocity: number; at: number }
let sent: Sent[] = [];

/** Note what the app sends: any note-ons among these bytes, at `atMs` (performance.now() time, default now). */
export function noteSent(bytes: number[], atMs?: number): void {
    if (bytes.length < 3 || (bytes[0] & 0xf0) !== 0x90 || bytes[2] === 0) return;
    const now = performance.now();
    if (sent.length > 512) sent = sent.filter(s => s.at > now - KEEP_MS);
    sent.push({ note: bytes[1], velocity: bytes[2], at: atMs ?? now });
}

/** Is this incoming note-on the echo of one the app sent? Each sent note answers for one echo. */
export function isEcho(note: number, velocity: number, nowMs: number = performance.now()): boolean {
    const k = sent.findIndex(s => s.note === note && s.velocity === velocity && nowMs >= s.at - EARLY_MS && nowMs <= s.at + LATE_MS);
    if (k < 0) return false;
    sent.splice(k, 1);
    return true;
}

/** Forget everything sent (for the checks). */
export function resetEchoes(): void {
    sent = [];
}
