/**
 * Collections whose folder was renamed, so that what the device remembers by
 * a song's path — its statistics (context/StatsContext.tsx), the games' best
 * results (games/progress.ts) — follows the songs to their new names.
 */
const RENAMED: Array<[from: string, to: string]> = [
    // October 2026: the drum pattern collections, cut to fifty each, named for what they are.
    ['/200_machine_drum_patterns/', '/classic_machine_drum_patterns/'],
    ['/260_machine_drum_patterns/', '/common_machine_drum_patterns/'],
];

/** A song's path under its collection's current name. */
export function currentPath(path: string): string {
    for (const [from, to] of RENAMED) if (path.includes(from)) return path.replace(from, to);
    return path;
}

/**
 * A record kept by song path, with its old paths renamed — or null when it has
 * none. A song remembered under both names keeps what is under the new one.
 */
export function renamePaths<T>(record: Record<string, T>): Record<string, T> | null {
    if (!Object.keys(record).some(k => currentPath(k) !== k)) return null;
    const out: Record<string, T> = {};
    for (const [k, v] of Object.entries(record)) if (currentPath(k) === k) out[k] = v;
    for (const [k, v] of Object.entries(record)) {
        const now = currentPath(k);
        if (now !== k && !(now in out)) out[now] = v;
    }
    return out;
}
