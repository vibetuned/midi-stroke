/**
 * The Slingshot's course, built from a level's rhythm. Pure geometry, for the
 * node checks; the game draws it and moves the probe along it
 * (components/games/SlingshotGame.tsx).
 *
 * Every note is an orbit: the probe latches onto an anchor when the note
 * starts and whips around it while the note is held — a quarter turn per
 * beat, so a quarter note is 90°, a half note 180°, a whole note a full
 * circle. Letting go flings it off along the tangent, and the gap until the
 * next note (a rest, or nothing) is the straight flight to the next anchor,
 * placed so the flight meets its orbit tangentially: the probe arrives
 * exactly as the next note starts. Anchors fall on alternating sides, so
 * orbits turn clockwise and anticlockwise in turn, like meshing gears, and
 * the course winds instead of spiralling.
 */

export interface Point { x: number; y: number }

export interface Orbit {
    cx: number;
    cy: number;
    /** Where the probe comes on, radians. */
    entry: number;
    /** +1 anticlockwise (screen: y down, so visually clockwise), −1 the other way. */
    dir: 1 | -1;
    /** Seconds from the level's first downbeat. */
    start: number;
    end: number;
    /** Beats held. */
    beats: number;
}

export interface Course {
    orbits: Orbit[];
    radius: number;
    /** Radians a second while held. */
    omega: number;
    /** Where the probe starts, one lead-in before the first note. */
    origin: Point;
    leadIn: number;
}

export interface CourseOptions {
    /** Seconds per beat. */
    beat: number;
    radius?: number;
    /** World units a second in flight. */
    speed?: number;
}

const QUARTER_TURN = Math.PI / 2;

/** Seconds → where on the orbit, radians. */
export function angleAt(o: Orbit, omega: number, t: number): number {
    return o.entry + o.dir * omega * (t - o.start);
}

export function onOrbit(o: Orbit, r: number, angle: number): Point {
    return { x: o.cx + r * Math.cos(angle), y: o.cy + r * Math.sin(angle) };
}

/** The direction the probe travels at an angle of an orbit (unit vector). */
export function tangent(o: Orbit, angle: number): Point {
    return { x: -Math.sin(angle) * o.dir, y: Math.cos(angle) * o.dir };
}

export function buildCourse(notes: Array<{ start: number; dur: number }>, opts: CourseOptions): Course {
    const radius = opts.radius ?? 70;
    const speed = opts.speed ?? 260;
    const omega = QUARTER_TURN / opts.beat;
    const orbits: Orbit[] = [];
    // The first anchor, and a straight lead-in towards its top.
    let center: Point = { x: 0, y: 0 };
    let entry = -Math.PI / 2;
    let dir: 1 | -1 = 1;
    for (let i = 0; i < notes.length; i++) {
        const n = notes[i];
        const o: Orbit = {
            cx: center.x, cy: center.y, entry, dir,
            start: n.start * opts.beat, end: (n.start + n.dur) * opts.beat, beats: n.dur,
        };
        orbits.push(o);
        const next = notes[i + 1];
        if (!next) break;
        // Fling off along the tangent at the release point…
        const exitAngle = angleAt(o, omega, o.end);
        const exit = onOrbit(o, radius, exitAngle);
        const t = tangent(o, exitAngle);
        const gap = Math.max(0, next.start * opts.beat - o.end);
        const arrive = { x: exit.x + t.x * speed * gap, y: exit.y + t.y * speed * gap };
        // …and meet the next orbit tangentially, on the far side: its centre
        // lies outward from this one, so it turns the other way.
        const out = { x: Math.cos(exitAngle), y: Math.sin(exitAngle) };
        center = { x: arrive.x + out.x * radius, y: arrive.y + out.y * radius };
        entry = Math.atan2(arrive.y - center.y, arrive.x - center.x);
        dir = dir === 1 ? -1 : 1;
    }
    // The lead-in: approach the first entry point along its tangent.
    const first = orbits[0];
    const leadIn = 1.2;
    let origin: Point = { x: 0, y: -radius - 120 };
    if (first) {
        const p = onOrbit(first, radius, first.entry);
        const t = tangent(first, first.entry);
        origin = { x: p.x - t.x * speed * leadIn, y: p.y - t.y * speed * leadIn };
    }
    return { orbits, radius, omega, origin, leadIn };
}

/**
 * Where the probe should be at time `t` (seconds from the first downbeat) if
 * every note were held exactly: on an orbit while a note sounds, on the
 * straight line between orbits in the gaps.
 */
export function idealPosition(c: Course, t: number): Point {
    const { orbits, radius, omega } = c;
    if (orbits.length === 0) return c.origin;
    const first = orbits[0];
    if (t <= first.start) {
        const p = onOrbit(first, radius, first.entry);
        const k = Math.max(0, Math.min(1, 1 - (first.start - t) / c.leadIn));
        return { x: c.origin.x + (p.x - c.origin.x) * k, y: c.origin.y + (p.y - c.origin.y) * k };
    }
    for (let i = 0; i < orbits.length; i++) {
        const o = orbits[i];
        if (t <= o.end) {
            if (t >= o.start) return onOrbit(o, radius, angleAt(o, omega, t));
            // In flight from the previous orbit to this one.
            const prev = orbits[i - 1];
            const from = onOrbit(prev, radius, angleAt(prev, omega, prev.end));
            const to = onOrbit(o, radius, o.entry);
            const k = (t - prev.end) / Math.max(1e-6, o.start - prev.end);
            return { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
        }
    }
    // After the last note: off along its tangent.
    const last = orbits[orbits.length - 1];
    const a = angleAt(last, omega, last.end);
    const p = onOrbit(last, radius, a);
    const tg = tangent(last, a);
    const d = (t - last.end) * 260;
    return { x: p.x + tg.x * d, y: p.y + tg.y * d };
}

/** The course's extent, for framing a preview. */
export function bounds(c: Course): { minX: number; minY: number; maxX: number; maxY: number } {
    let minX = c.origin.x, minY = c.origin.y, maxX = c.origin.x, maxY = c.origin.y;
    for (const o of c.orbits) {
        minX = Math.min(minX, o.cx - c.radius); maxX = Math.max(maxX, o.cx + c.radius);
        minY = Math.min(minY, o.cy - c.radius); maxY = Math.max(maxY, o.cy + c.radius);
    }
    return { minX, minY, maxX, maxY };
}
