# /// script
# requires-python = ">=3.11"
# dependencies = ["music21>=9", "verovio>=4.3"]
# ///
"""
The Weimar Jazz Database's solos as MEI, for the saxophone and piano apps.

  uv run scripts/build-jazz-scores.py [--db jazztube/wjazzd.db] [--out jazztube/mei] [--only 325,1] [--zip]

Every solo becomes two scores:

  saxo/   the solo in alto written pitch (concert up a major sixth), moved by
          whole octaves into the saxophone's keyed range, B-flat 3 to F6, the
          chord symbols transposed with it — as the saxophone library is;
  piano/  the solo at concert pitch in the right hand (moved by whole octaves
          into the treble staff, for the low horns), the database's bass line
          (a pitch for every beat) in the left hand, the chord symbols above.

The database gives every note its bar, its beat and its place on that
beat's grid (tatum of division: eighths, triplets, sixteenths,
quintuplets…), and every beat its chord. So the rhythm is written from
those, not from the seconds: a note starts where the transcriber put it,
and lasts to the next one when it sounds for most of the way there, else to
its own length on its beat's grid, and a rest after. music21 writes the
notation (bars, ties, beams, tuplets) as MusicXML, and Verovio converts it
to MEI, as the library's other scores were. The chords, the tempo and the
title are added to the MEI.

Each score is checked before it is kept: loaded into Verovio, it must play
one note for every note of the solo, at the right pitch, in order.

The solos are transcriptions of recorded improvisations (the database is
ODbL, its contents DbCL, but the music is the players' and the tunes'
composers'): the scores go to a staging folder, not public/. --zip also
packs each folder as a ZIP the apps can import as an on-device collection.
"""
from __future__ import annotations

import argparse
import re
import sqlite3
import statistics
from bisect import bisect_right
import sys
import zipfile
from fractions import Fraction as F
from pathlib import Path

import music21 as m21
import verovio

from wjazzd_chords import LETTERS, PC, chord_text, transpose_name

ROOT = Path(__file__).resolve().parent.parent

# The saxophone's keyed range, written (src/utils/jazzScaleGen.ts): B-flat 3 to F6.
WRITTEN_LOW, WRITTEN_HIGH = 58, 89
ALTO = 9                     # concert → alto written: up a major sixth

# ------------------------------------------------------------------ chords

def key_of(key: str, semitones: int = 0) -> m21.key.Key | None:
    """"D-maj" → D major, "G-min" → G minor; None for modal or chromatic keys."""
    m = re.match(r'^([A-G][#b]?)-(maj|min)$', key or '')
    if not m:
        return None
    tonic = transpose_name(m.group(1), semitones)
    return m21.key.Key(tonic.replace('b', '-'), 'major' if m.group(2) == 'maj' else 'minor')


# ------------------------------------------------------------------ the solo, as positions

def solo_rows(db: sqlite3.Connection, melid: int):
    info = db.execute("""
        select s.performer, s.title, s.titleaddon, s.instrument, s.key, s.signature, s.avgtempo, s.rhythmfeel,
               t.filename_solo, c.composer
        from solo_info s join transcription_info t using(melid) left join composition_info c using(compid)
        where s.melid = ?""", (melid,)).fetchone()
    events = db.execute("""select onset, pitch, duration, division, bar, beat, tatum, num, denom, beatdur
                           from melody where melid = ? order by onset""", (melid,)).fetchall()
    beats = db.execute("""select onset, bar, beat, signature, chord, bass_pitch from beats
                          where melid = ? order by onset""", (melid,)).fetchall()
    return info, events, beats


class Grid:
    """The solo's beats: where each starts and how long it is, in quarter notes, bar by bar — from the
    beat track, else the notes' metre — and the grid each beat's notes sit on."""

    # The grids a beat is written on: eighths, triplets, sixteenths, quintuplets, sextuplets, 32nds.
    ALLOWED = (1, 2, 3, 4, 5, 6, 8)

    def __init__(self, events, beats):
        per_bar: dict[int, int] = {}
        unit: dict[int, F] = {}
        for _, bar, beat, *_ in beats:
            per_bar[bar] = max(per_bar.get(bar, 0), beat)
        for _, _, _, _, bar, beat, _, num, denom, _ in events:
            per_bar[bar] = max(per_bar.get(bar, 0), num or beat)
            unit[bar] = F(4, denom or 4)
        self.first = min(e[4] for e in events)
        self.last = max(max(e[4] for e in events), max((b[1] for b in beats), default=self.first))
        default_unit = next(iter(unit.values()), F(1))
        self.bar_start, self.bar_size = {}, {}
        self.start, self.length, self.bar_of = [], [], []
        self.index = {}
        q = F(0)
        for bar in range(self.first, self.last + 1):
            n = per_bar.get(bar) or per_bar.get(bar - 1) or 4
            u = unit.get(bar, default_unit)
            self.bar_start[bar], self.bar_size[bar] = q, (n, u)
            for b in range(1, n + 1):
                self.index[(bar, b)] = len(self.start)
                self.start.append(q)
                self.length.append(u)
                self.bar_of.append(bar)
                q += u
        self.total = q
        self.grid = [2] * len(self.start)

    def beat_at(self, q: F) -> int:
        """The beat a point falls in."""
        k = bisect_right(self.start, q) - 1
        return max(0, min(k, len(self.start) - 1))

    def set_grid(self, beat: int, positions: list[F]) -> list[F]:
        """The simplest allowed grid the beat's onsets (0–1 of the beat) sit on — or, when none fits
        exactly (septuplets, 32nd-note sextuplets…), the one that moves them least while keeping them
        apart. Returns the positions on it."""
        for g in self.ALLOWED:
            if all((p * g).denominator == 1 for p in positions):
                self.grid[beat] = g
                return positions
        def cost(g):
            snapped = [F(round(p * g), g) for p in positions]
            return (len(set(snapped)) < len(set(positions)), sum(abs(a - b) for a, b in zip(snapped, positions)), g)
        g = min(self.ALLOWED, key=cost)
        self.grid[beat] = g
        return [F(round(p * g), g) for p in positions]

    def snap(self, q: float | F) -> F:
        """A point on the grid of the beat it falls in."""
        k = self.beat_at(F(q).limit_denominator(960))
        g, u = self.grid[k], self.length[k]
        return self.start[k] + F(round((F(q).limit_denominator(960) - self.start[k]) / u * g), g) * u

    def pieces(self, a: F, b: F) -> list[F]:
        """[a, b) cut at the beats, each piece a value music21 writes: whole beats together (up to a
        whole bar's worth in 4/4), parts of a beat on its grid."""
        out = []
        t = a
        while t < b:
            k = self.beat_at(t)
            beat_end = self.start[k] + self.length[k]
            if t == self.start[k] and b >= beat_end:
                end = beat_end
                j = k
                while (j + 1 < len(self.start) and self.bar_of[j + 1] == self.bar_of[k]
                       and self.start[j + 1] + self.length[j + 1] <= b and end - t < 4):
                    j += 1
                    end = self.start[j] + self.length[j]
                out += split_expressible(end - t)
                t = end
            else:
                end = min(b, beat_end)
                out += split_expressible(end - t)
                t = end
        return out


def split_expressible(length: F) -> list[F]:
    """A length as music21 can write it: itself, or tied pieces (5/8 of a beat: a half and an eighth)."""
    if m21.duration.Duration(length).type not in ('complex', 'inexpressible'):
        return [length]
    for part in sorted({F(k, g) for g in (1, 2, 3, 4, 5, 6, 8) for k in range(1, 9)}, reverse=True):
        if part < length and m21.duration.Duration(part).type not in ('complex', 'inexpressible'):
            return [part] + split_expressible(length - part)
    return [length]


def notes_of(events, grid: Grid):
    """(start, end, pitch) in quarter notes: onsets on their beat's grid; each note legato to the next,
    or — when it sounds for well under the way there — to its own length on the grid, a rest after."""
    by_beat: dict[int, list] = {}
    for e in events:
        onset, pitch, dur, division, bar, beat, tatum, num, denom, beatdur = e
        k = grid.index.get((bar, beat))
        if k is None:
            continue
        pos = F(tatum - 1, division) if division and division > 0 else F(0)
        by_beat.setdefault(k, []).append((min(pos, F(division - 1, division) if division else F(0)), e))
    placed = []
    for k, items in by_beat.items():
        positions = grid.set_grid(k, [pos for pos, _ in items])
        u = grid.length[k]
        for pos, (_, e) in zip(positions, items):
            onset, pitch, dur, division, bar, beat, tatum, num, denom, beatdur = e
            sounding = (dur / beatdur) * float(u) if beatdur else 0.25
            placed.append([grid.start[k] + pos * u, sounding, int(round(pitch))])
    placed.sort(key=lambda x: (x[0], -x[2]))
    # One note per onset (a chord in a solo is a slip of the transcription: keep the top).
    merged = []
    for p in placed:
        if merged and p[0] == merged[-1][0]:
            continue
        merged.append(p)
    out = []
    for k, (q, sounding, pitch) in enumerate(merged):
        beat = grid.beat_at(q)
        u = grid.length[beat]
        nxt = merged[k + 1][0] if k + 1 < len(merged) else min(grid.total, q + u)
        gap = nxt - q
        if sounding >= float(gap) * 0.75 or gap <= u / 2:
            end = nxt
        else:
            end = grid.snap(float(q) + sounding)
            end = max(end, q + u / grid.grid[beat])
            end = min(end, nxt)
        out.append((q, end, pitch))
    return out


# ------------------------------------------------------------------ notation

def spelled(midi: int, flats: bool) -> m21.pitch.Pitch:
    p = m21.pitch.Pitch(midi=midi)
    if flats and p.accidental is not None and p.accidental.alter == 1:
        p = p.getEnharmonic()
    return p


def part_of(notes, grid: Grid, key, clef, flats: bool, part_cls=m21.stream.Part):
    """A staff: the notes (start, end, pitch), rests between, every note and rest cut at the beats
    (tied) so each piece is a plain value on its beat's grid."""
    part = part_cls()
    part.append(clef)
    if key is not None:
        part.append(key)
    n, u = grid.bar_size[grid.first]
    part.append(m21.meter.TimeSignature(f"{n}/{int(4 / u)}"))

    def rest(a, b):
        for length in grid.pieces(a, b):
            part.append(m21.note.Rest(quarterLength=length))

    q = F(0)
    for start, end, pitch in notes:
        if start > q:
            rest(q, start)
        lengths = grid.pieces(start, end)
        for k, length in enumerate(lengths):
            note = m21.note.Note(quarterLength=length)
            note.pitch = spelled(pitch, flats)
            if len(lengths) > 1:
                note.tie = m21.tie.Tie('start' if k == 0 else 'stop' if k == len(lengths) - 1 else 'continue')
            part.append(note)
        q = end
    if q < grid.total:
        rest(q, grid.total)
    return part


def bass_of(beats, grid: Grid):
    """The bass line: a quarter (a beat) on every beat that has a pitch. A solo whose bass was not
    transcribed gets the chords' roots instead, low (E2 to D#3), each held until the next chord."""
    out = {}
    for _, bar, beat, _, _, bass in beats:
        k = grid.index.get((bar, beat))
        if k is None or not bass or bass <= 0:
            continue
        out.setdefault(k, int(bass))
    if len(out) >= len(grid.start) * 0.5:
        return [(grid.start[k], grid.start[k] + grid.length[k], p) for k, p in sorted(out.items())], 'bass line'
    changes = []
    for _, bar, beat, _, chord, _ in beats:
        k = grid.index.get((bar, beat))
        if not chord or k is None:
            continue
        m = re.match(r'^([A-G])([#b]?)', chord)
        root = None if not m else 40 + (PC[m.group(1)] + (1 if m.group(2) == '#' else -1 if m.group(2) == 'b' else 0) - 4) % 12
        changes.append((grid.start[k], root))
    changes.sort()
    roots = [(q, changes[k + 1][0] if k + 1 < len(changes) else grid.total, r) for k, (q, r) in enumerate(changes) if r is not None]
    return [(a, b, r) for a, b, r in roots if b > a], 'chord roots'


def octave_fit(pitches, low, high, centre):
    """Whole octaves to move a line by: the most notes inside [low, high], then its middle nearest `centre`."""
    med = statistics.median(pitches)
    best = min(range(-4, 5), key=lambda k: (sum(not (low <= p + 12 * k <= high) for p in pitches), abs(med + 12 * k - centre)))
    return 12 * best


def to_mei(score: m21.stream.Score, tk: verovio.toolkit) -> str:
    xml = m21.musicxml.m21ToXml.GeneralObjectExporter(score).parse().decode('utf-8')
    if not tk.loadData(xml):
        raise RuntimeError('Verovio could not read the MusicXML')
    return tk.getMEI()


def decorate(mei: str, chords, tempo: float, feel: str, staff: int = 1) -> str:
    """The chord symbols (<harm>, on their beat), and the tempo, into the MEI."""
    measures = list(re.finditer(r'<measure\b[^>]*>', mei))
    by_measure: dict[int, list[str]] = {}
    for index, beat, text in chords:
        if 0 <= index < len(measures):
            by_measure.setdefault(index, []).append(f'<harm staff="{staff}" tstamp="{beat}">{text}</harm>')
    out, pos = [], 0
    for k, m in enumerate(measures):
        close = mei.find('</measure>', m.end())
        out.append(mei[pos:close])
        extra = ''.join(by_measure.get(k, []))
        if k == 0:
            label = f"{feel.capitalize()} " if feel else ''
            extra += f'<tempo staff="{staff}" tstamp="1" mm="{round(tempo)}" mm.unit="4" midi.bpm="{round(tempo)}">{label}♩ = {round(tempo)}</tempo>'
        out.append(extra)
        pos = close
    out.append(mei[pos:])
    return ''.join(out)


def check(mei: str, expected: list[int], tk: verovio.toolkit, in_order: bool = True) -> str | None:
    """Loaded into Verovio: one note-on per note of the solo (a tied note's continuation is not one), at
    its pitch, in order — or, for two hands at once, the same pitches as often."""
    if not tk.loadData(mei):
        return 'Verovio could not load the MEI'
    continued = set(re.findall(r'<tie\b[^>]*endid="#([^"]+)"', mei))
    heard = sorted((e['qstamp'], nid) for e in tk.renderToTimemap({'includeMeasures': False})
                   for nid in e.get('on', []) if nid not in continued)
    pitches = [tk.getMIDIValuesForElement(nid).get('pitch') for _, nid in heard]
    if len(pitches) != len(expected):
        return f'{len(pitches)} notes played, {len(expected)} in the solo'
    if not in_order:
        return None if sorted(pitches) == sorted(expected) else 'the pitches played are not the ones written'
    wrong = next((k for k, (a, b) in enumerate(zip(pitches, expected)) if a != b), None)
    return None if wrong is None else f'note {wrong}: {pitches[wrong]} played, {expected[wrong]} written'


def safe(name: str) -> str:
    return re.sub(r'[\\/:*?"<>|]+', '', name).strip()


# ------------------------------------------------------------------ one solo

def convert(db, melid: int, out: Path, tk) -> list[str]:
    info, events, beats = solo_rows(db, melid)
    performer, title, addon, instrument, key, signature, tempo, feel, filename, composer = info
    if not events:
        return [f'{melid}: no notes']
    grid = Grid(events, beats)
    first, last = grid.first, grid.last
    notes = notes_of(events, grid)
    pitches = [p for _, _, p in notes]
    part_no = re.search(r'-(\d+)_Solo$', filename or '')
    name = safe(f"{title}{' ' + addon if addon else ''}{' ' + part_no.group(1) if part_no else ''} - {performer}")
    chords_raw = [(bar - first, beat, chord) for _, bar, beat, _, chord, _ in beats if chord and first <= bar <= last]
    report = []

    # The saxophone: alto written pitch, in range.
    shift = ALTO + octave_fit([p + ALTO for p in pitches], WRITTEN_LOW, WRITTEN_HIGH, 74)
    written = [p + shift for p in pitches]
    folded = 0
    for k, p in enumerate(written):
        while p < WRITTEN_LOW: p += 12; folded += 1
        while p > WRITTEN_HIGH: p -= 12; folded += 1
        written[k] = p
    sax_key = key_of(key, ALTO)
    flats = sax_key is not None and sax_key.sharps < 0
    sax = m21.stream.Score()
    sax.metadata = m21.metadata.Metadata(title=f'{title} — {performer} ({instrument})', composer=composer or '')
    sax.insert(0, part_of([(q, e, w) for (q, e, _), w in zip(notes, written)], grid, sax_key, m21.clef.TrebleClef(), flats))
    mei = to_mei(sax, tk)
    sax_chords = [(i, b, chord_text(c, ALTO)) for i, b, c in chords_raw]
    mei = decorate(mei, [c for c in sax_chords if c[2]], tempo or 120, feel or '')
    problem = check(mei, written, tk)
    if problem:
        report.append(f'saxo ✗ {name}: {problem}')
    else:
        (out / 'saxo' / f'{name}.mei').write_text(mei, encoding='utf-8')
        merged = len(events) - len(notes)
        report.append(f'saxo ✓ {name}: {len(notes)} notes, {last - first + 1} bars' + (f', {folded} folded into range' if folded else '')
                      + (f', {merged} merged on the grid' if merged else ''))

    # The piano: the solo in the right hand, the bass line in the left.
    rh_shift = octave_fit(pitches, 60, 88, 72)
    concert_key = key_of(key)
    flats = concert_key is not None and concert_key.sharps < 0
    piano = m21.stream.Score()
    piano.metadata = m21.metadata.Metadata(title=f'{title} — {performer} ({instrument})', composer=composer or '')
    rh = part_of([(q, e, p + rh_shift) for q, e, p in notes], grid, concert_key, m21.clef.TrebleClef(), flats, m21.stream.PartStaff)
    bass, bass_kind = bass_of(beats, grid)
    lh = part_of(bass, grid, concert_key, m21.clef.BassClef(), flats, m21.stream.PartStaff)
    piano.insert(0, rh)
    piano.insert(0, lh)
    piano.insert(0, m21.layout.StaffGroup([rh, lh], symbol='brace'))
    mei = to_mei(piano, tk)
    mei = decorate(mei, [(i, b, chord_text(c)) for i, b, c in chords_raw if chord_text(c)], tempo or 120, feel or '')
    problem = check(mei, [p + rh_shift for p in pitches] + [p for _, _, p in bass], tk, in_order=False)
    if problem:
        report.append(f'piano ✗ {name}: {problem}')
    else:
        (out / 'piano' / f'{name}.mei').write_text(mei, encoding='utf-8')
        report.append(f'piano ✓ {name}: right hand {len(notes)} notes{f" ({rh_shift:+d})" if rh_shift else ""}, left hand {len(bass)} notes ({bass_kind})')
    return report


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--db', default=str(ROOT / 'jazztube' / 'wjazzd.db'))
    ap.add_argument('--out', default=str(ROOT / 'jazztube' / 'mei'))
    ap.add_argument('--only', default='', help='melids, comma-separated')
    ap.add_argument('--zip', action='store_true', help='also pack saxo/ and piano/ as importable ZIPs')
    args = ap.parse_args()
    out = Path(args.out)
    for d in ('saxo', 'piano'):
        (out / d).mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(args.db)
    melids = [int(x) for x in args.only.split(',') if x] or [r[0] for r in db.execute('select melid from solo_info order by melid')]
    tk = verovio.toolkit()
    tk.setOptions({'header': 'none', 'footer': 'none'})
    failed = 0
    for k, melid in enumerate(melids):
        try:
            lines = convert(db, melid, out, tk)
        except Exception as e:  # one bad solo should not stop the rest
            lines = [f'{melid} ✗ {type(e).__name__}: {e}']
        failed += sum('✗' in line for line in lines)
        print(f'[{k + 1}/{len(melids)}] ' + ' | '.join(lines), flush=True)
    if args.zip:
        # The apps name an imported collection after its ZIP: "Weimar Jazz (saxophone)".
        for d, label in (('saxo', 'saxophone'), ('piano', 'piano')):
            with zipfile.ZipFile(out / f'Weimar Jazz ({label}).zip', 'w', zipfile.ZIP_DEFLATED) as z:
                for f in sorted((out / d).glob('*.mei')):
                    z.write(f, f'Weimar Jazz Database/{f.name}')
    print(f'{len(melids)} solos, {failed} failed')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
