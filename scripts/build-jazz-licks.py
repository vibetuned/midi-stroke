# /// script
# requires-python = ">=3.9"
# dependencies = []
# ///
"""
The Jazzomat Research Project's 653 interval patterns as licks for the saxophone's lick
builder and the lick scores: public/jazz/jazzomat-licks.json.

  uv run scripts/build-jazz-licks.py [--db jazztube/wjazzd.db]      (or: npm run build:jazz-licks)

The patterns (scripts/data/jazzomat-653-patterns.json) come from the Pattern History
Explorer: semitone interval patterns of at least six intervals that eminent players used
in at least three of their solos (Frieler, Höger, Pfleiderer, Dixon, ISMIR 2018). They are
bare intervals; their use is in the Weimar Jazz Database. So every instance of every
pattern is found in the database's solos, and from those instances each lick gets:

  - how it is usually played: the most common rhythm (onsets on eighths, triplets or
    sixteenths — the grid of each beat, simplified for reading), where in the bar it
    starts, and how often it is played exactly so;
  - what it is usually played over: the chord under its first note — the note's place in
    that chord — and a change during the lick (a ii–V, say), and how often;
  - who played it most, in which style, and the earliest recording in the database.

The output is data derived from the Weimar Jazz Database, under the Open Database License
(ODbL) 1.0, credited in public/jazz/CREDITS.md.
"""
from __future__ import annotations

import argparse
import json
import re
import sqlite3
from bisect import bisect_right
from collections import Counter, defaultdict
from fractions import Fraction as F
from pathlib import Path

from wjazzd_chords import split_chord

ROOT = Path(__file__).resolve().parent.parent
PATTERNS = ROOT / 'scripts' / 'data' / 'jazzomat-653-patterns.json'
OUT = ROOT / 'public' / 'jazz' / 'jazzomat-licks.json'

# The grids a beat of a lick is written on, for reading: quarters, eighths, triplets, sixteenths.
GRIDS = (1, 2, 3, 4)


def frac(x: F) -> str:
    return str(x.numerator) if x.denominator == 1 else f'{x.numerator}/{x.denominator}'


class Solo:
    """A solo's notes in time order, each at its place in beats (bar lines from the beat track), and its chords."""

    def __init__(self, db: sqlite3.Connection, melid: int):
        rows = db.execute("""select onset, pitch, division, bar, beat, tatum, num from melody
                             where melid = ? order by onset""", (melid,)).fetchall()
        beats = db.execute("select bar, beat, chord from beats where melid = ? order by onset", (melid,)).fetchall()
        per_bar: dict[int, int] = defaultdict(int)
        for bar, beat, _ in beats:
            per_bar[bar] = max(per_bar[bar], beat)
        for _, _, _, bar, beat, _, num in rows:
            per_bar[bar] = max(per_bar[bar], num or beat)
        first = min(per_bar)
        self.bar_start: dict[int, int] = {}
        self.bar_len: dict[int, int] = {}
        at = 0
        for bar in range(first, max(per_bar) + 1):
            n = per_bar.get(bar) or 4
            self.bar_start[bar], self.bar_len[bar] = at, n
            at += n
        # Each beat's grid: the simplest that holds its notes apart (for reading).
        by_beat: dict[int, list[F]] = defaultdict(list)
        raw = []
        for onset, pitch, division, bar, beat, tatum, _ in rows:
            b = self.bar_start[bar] + beat - 1
            pos = F(tatum - 1, division) if division and division > 0 else F(0)
            by_beat[b].append(pos)
            raw.append((b, pos, int(round(pitch)), bar))
        grid = {b: self._grid(ps) for b, ps in by_beat.items()}
        self.pitches = [p for _, _, p, _ in raw]
        self.pos: list[F | None] = []
        self.bar_of = [bar for *_, bar in raw]
        for b, pos, _, _ in raw:
            g = grid[b]
            self.pos.append(None if g is None else b + F(round(pos * g), g))
        self.changes = sorted((self.bar_start[bar] + beat - 1, chord) for bar, beat, chord in beats if chord and bar in self.bar_start)
        self.change_at = [c[0] for c in self.changes]

    @staticmethod
    def _grid(positions: list[F]) -> int | None:
        for g in GRIDS:
            if all((p * g).denominator == 1 for p in positions):
                return g
        best = min(GRIDS, key=lambda g: (len({round(p * g) for p in positions}) < len(set(positions)),
                                          sum(abs(F(round(p * g), g) - p) for p in positions)))
        return None if len({round(p * best) for p in positions}) < len(set(positions)) else best

    def chord_at(self, beat_index: float) -> str | None:
        k = bisect_right(self.change_at, beat_index) - 1
        return self.changes[k][1] if k >= 0 else None


def classify(iv: list[int]) -> tuple[str, str]:
    """What kind of line a pattern is — chromatic, scale, arpeggio, mixed — and its shape."""
    a = [abs(i) for i in iv]
    kind = ('chromatic' if all(x == 1 for x in a) else 'scale' if all(x in (1, 2) for x in a)
            else 'arpeggio' if all(x in (3, 4, 5, 7) for x in a) else 'mixed')
    signs = [1 if i > 0 else -1 for i in iv if i]
    turns = sum(1 for x, y in zip(signs, signs[1:]) if x != y)
    if turns == 0:
        shape = 'ascending' if signs[0] > 0 else 'descending'
    elif turns == 1:
        shape = 'arch' if signs[0] > 0 else 'valley'
    else:
        shape = 'wave'
    return kind, shape


def year_of(date: str | None) -> int | None:
    m = re.search(r'(19|20)\d\d', date or '')
    return int(m.group(0)) if m else None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--db', default=str(ROOT / 'jazztube' / 'wjazzd.db'))
    args = ap.parse_args()
    source = json.loads(PATTERNS.read_text())
    db = sqlite3.connect(args.db)
    info = {m: (perf, style, year_of(date)) for m, perf, style, date in db.execute("""
        select s.melid, s.performer, s.style, coalesce(t.recordingdate, r.releasedate)
        from solo_info s left join track_info t using(trackid) left join record_info r on r.recordid = s.recordid""")}
    solos = {m: Solo(db, m) for m in info}
    intervals = {m: [b - a for a, b in zip(s.pitches, s.pitches[1:])] for m, s in solos.items()}
    # Index every run of six intervals, so each pattern's instances are found at once.
    index: dict[tuple, list[tuple[int, int]]] = defaultdict(list)
    for m, iv in intervals.items():
        for k in range(len(iv) - 5):
            index[tuple(iv[k:k + 6])].append((m, k))

    licks = []
    for rank, pat in enumerate(source['patterns'], start=1):
        iv = pat['intervals']
        n = len(iv)
        found = [(m, k) for m, k in index.get(tuple(iv[:6]), []) if intervals[m][k:k + n] == iv]
        rhythms, harmonies, players, styles, solo_ids = Counter(), Counter(), Counter(), Counter(), set()
        # The harmony of the instances played in each rhythm, so the usual rhythm gets its own chords.
        harmony_by_rhythm: dict[tuple, Counter] = defaultdict(Counter)
        key = None
        starts: dict[tuple, Counter] = defaultdict(Counter)
        first = None
        for m, k in found:
            s = solos[m]
            perf, style, year = info[m]
            players[perf] += 1
            styles[style] += 1
            solo_ids.add(m)
            if year and (first is None or year < first[1]):
                first = (perf, year)
            pos = s.pos[k:k + n + 1]
            key = None
            if all(p is not None for p in pos) and all(b > a for a, b in zip(pos, pos[1:])):
                rel = tuple(frac(p - pos[0]) for p in pos)
                if max(p - pos[0] for p in pos) <= 16:
                    key = (frac(pos[0] - int(pos[0])), rel)
                    rhythms[key] += 1
                    bar = s.bar_of[k]
                    if s.bar_len.get(bar) == 4:
                        starts[key][frac(pos[0] - s.bar_start[bar])] += 1
            # The chord under the first note, and the changes up to the last note.
            if pos[0] is not None and pos[-1] is not None:
                c0 = s.chord_at(float(pos[0]))
                parsed = split_chord(c0) if c0 else None
                if parsed:
                    root, quality = parsed
                    # Each change: whole beats from the first note's beat, the note it arrives at, root, quality.
                    beat0 = int(pos[0])
                    chords = [(0, 0, 0, quality)]
                    for at, sym in s.changes:
                        if pos[0] < at <= pos[-1]:
                            p = split_chord(sym)
                            if p and ((p[0] - root) % 12 != chords[-1][2] or p[1] != chords[-1][3]):
                                note = next((j for j, q in enumerate(pos) if q is not None and q >= at), len(pos) - 1)
                                chords.append((at - beat0, note, (p[0] - root) % 12, p[1]))
                    harmonies[((s.pitches[k] - root) % 12, tuple(chords))] += 1
                    if key is not None:
                        harmony_by_rhythm[key][((s.pitches[k] - root) % 12, tuple(chords))] += 1
        entry = {
            'rank': rank, 'intervals': iv, 'instances': pat['instances'], 'solos': len(solo_ids),
            'players': [[p, c] for p, c in players.most_common(3)],
            'styles': [s for s, _ in styles.most_common(2)],
            'first': {'player': first[0], 'year': first[1]} if first else None,
        }
        entry['type'], entry['contour'] = classify(iv)
        total = sum(rhythms.values())
        modal = rhythms.most_common(1)[0][0] if total else None
        if total:
            (in_beat, onsets), count = rhythms.most_common(1)[0]
            bar_start = starts[(in_beat, onsets)].most_common(1)
            entry['rhythm'] = {'start': bar_start[0][0] if bar_start else in_beat, 'onsets': list(onsets),
                               'share': round(count / total, 2)}
        else:
            entry['rhythm'] = None
        # Its chords: those of the instances played in its usual rhythm, when there are a couple; else of all.
        pool = harmony_by_rhythm.get(modal) if modal else None
        if not pool or sum(pool.values()) < 2:
            pool = harmonies
        total = sum(pool.values())
        if total:
            (start, chords), count = pool.most_common(1)[0]
            entry['harmony'] = {'start': start, 'chords': [list(c) for c in chords], 'share': round(count / total, 2)}
        else:
            entry['harmony'] = None
        licks.append(entry)

    doc = {
        'source': source['source'],
        'paper': source['paper'],
        'data': 'The Weimar Jazz Database (WJazzD), The Jazzomat Research Project, 2012–2017 — https://jazzomat.hfm-weimar.de/',
        'license': source['license'],
        'about': ('rhythm: onsets in beats from the first note, start = its place in a 4/4 bar, share = how often it is played '
                  'exactly so; harmony: start = the first note above the root of the chord under it, chords = [whole beats from '
                  'the first note\'s beat, the note it arrives at, root above the first chord\'s root, quality], share = how often.'),
        'licks': licks,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open('w') as f:
        f.write('{\n' + ',\n'.join(f'  {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)}' for k, v in doc.items() if k != 'licks'))
        f.write(',\n  "licks": [\n' + ',\n'.join('    ' + json.dumps(l, ensure_ascii=False) for l in licks) + '\n  ]\n}\n')
    with_rhythm = sum(1 for l in licks if l['rhythm'])
    with_harmony = sum(1 for l in licks if l['harmony'])
    print(f'{len(licks)} licks → {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB): '
          f'{with_rhythm} with a rhythm, {with_harmony} with a chord context')


if __name__ == '__main__':
    main()
