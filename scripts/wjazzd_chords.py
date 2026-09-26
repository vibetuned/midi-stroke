"""
The Weimar Jazz Database's chord symbols, as a chart writes them — shared by
scripts/build-jazz-scores.py (the solos as scores) and scripts/build-jazz-licks.py
(the Jazzomat patterns as licks).
"""
from __future__ import annotations

import re

LETTERS = 'CDEFGAB'
PC = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}


def chord_text(symbol: str, semitones: int = 0) -> str | None:
    """The database's chord symbols as a chart writes them: E-7 → Em7, Dj7 → Dmaj7, C#o7 → C#dim7,
    and the extensions, each with its alteration after it (A79# → A7#9, Db7913 → Db13, G7911# → G9#11,
    79b13b → 7b9b13, 6911# → 6/9#11). `semitones` transposes the root (and the bass), spelled a
    letter-step for the interval."""
    s = symbol.strip()
    if not s or s == 'NC':
        return 'N.C.' if s == 'NC' else None
    m = re.match(r'^([A-G])([#b]?)(.*?)(?:/([A-G][#b]?))?$', s)
    if not m:
        return s
    root = transpose_name(m.group(1) + m.group(2), semitones)
    q = m.group(3)
    bass = f"/{transpose_name(m.group(4), semitones)}" if m.group(4) else ''
    alt = 'alt' in q
    q = q.replace('alt', '')
    quality = ''
    for prefix, name in (('m7b5', 'm7b5'), ('-j', 'mMaj'), ('-', 'm'), ('j', 'maj'), ('o', 'dim'), ('+j', '+maj'), ('+', '+'), ('sus', 'sus')):
        if q.startswith(prefix):
            quality, q = name, q[len(prefix):]
            break
    tokens = re.findall(r'(13|11|9|7|6|5)([#b]?)', q)
    natural = {int(n) for n, a in tokens if not a}
    altered = [f"{a}{n}" for n, a in tokens if a]
    top = max((n for n in natural if n in (7, 9, 11, 13)), default=None)
    six = ('6' + ('/9' if 9 in natural else '')) if 6 in natural else ''
    if quality in ('maj', 'mMaj', '+maj'):
        body = f"{quality}{top or 7}"
    elif quality == 'm':
        body = 'm' + (six or (str(top) if top else ''))
    elif quality == 'dim':
        body = 'dim7' if 7 in natural else 'dim'
    elif quality == '+':
        body = '+' + (str(top) if top else '')
    elif quality == 'sus':
        body = (str(top) if top else '') + 'sus4'
    elif quality == 'm7b5':
        body = 'm7b5'
    else:
        body = six or (str(top) if top else '')
    if alt:
        body = (body or '7') + 'alt'
    return f"{root}{body}{''.join(altered)}{bass}"


def transpose_name(name: str, semitones: int) -> str:
    """A note name moved by an interval, spelled a letter-step for it (up a major sixth: five letters)."""
    if not semitones:
        return name
    letters = {9: 5, 0: 0}.get(semitones % 12, round(semitones % 12 * 7 / 12))
    letter = LETTERS[(LETTERS.index(name[0]) + letters) % 7]
    target = (PC[name[0]] + (1 if name.endswith('#') else -1 if name.endswith('b') else 0) + semitones) % 12
    diff = (target - PC[letter] + 6) % 12 - 6
    return letter + ('#' * diff if diff > 0 else 'b' * -diff)


def split_chord(symbol: str) -> tuple[int, str] | None:
    """A chord symbol as its root's pitch class and its quality as a chart writes it
    (E-7 → (4, "m7"), Dj7 → (2, "maj7"), A79# → (9, "7#9")); None for N.C. or an unreadable one.
    A slash bass is left off: the licks name the chord, not the voicing."""
    text = chord_text(symbol.split('/')[0]) if symbol else None
    m = re.match(r'^([A-G])([#b]?)(.*)$', text or '')
    if not m or text == 'N.C.':
        return None
    return (PC[m.group(1)] + (1 if m.group(2) == '#' else -1 if m.group(2) == 'b' else 0)) % 12, m.group(3)
