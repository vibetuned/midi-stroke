# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy", "scipy", "soundfile", "librosa"]
# ///
"""
Build the rhythm games' sounds (public/games/sounds/) from the sample
libraries in ../sounds — a few short, small mono MP3s out of instruments that
weigh hundreds of megabytes.

  uv run scripts/build-game-sounds.py [path/to/sounds]      (or: npm run build:game-sounds)

Each game's voice comes from one library:

  Slingshot    Nasa Space Pad (Tim Steemson): the sonar ping, pitched, and
               the take-off rumble under it as texture.
  Conductor    The Spellsinger: the sustained voice, six notes G#3–D5.
  Rhythm echo  Space Voices: the whistle for the star, the hums for Earth.
  Groove       Perseverance and InSight on Mars (NASA/JPL-Caltech): a drum
               kit cut from the laser zapping rocks, the rover's wheels, a
               meteoroid strike and the MOXIE machine's hum.

A rhythm game needs a voice that speaks at once, so a sustained note is not
cut from its start — the singer's slow swell — but from the steadiest loud
stretch after the library's own loop point, faded in over a few
milliseconds. Its pitch is measured there and corrected to the note it is
mapped to, and a singer's phrasing is levelled, so a held note stays present.
Every choice (which file, where, how long) is in the tables below; who made
each source is in public/games/sounds/CREDITS.md.
"""
import os, subprocess, sys, tempfile
import numpy as np, soundfile as sf, librosa
from scipy.signal import butter, sosfilt

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, '..', 'sounds'))
OUT = os.path.join(ROOT, 'public', 'games', 'sounds')
SR = 44100

NASA = 'Nasa Space Pad/Nasa Space Pad Samples/'
SPELL = 'The Spellsinger/The Spellsinger (DS)/Samples/'
VOICES = 'Space Voices (DS)/Samples/'
MARS = 'Perseverance/'

# ------------------------------------------------------------------ helpers

def load(rel, offset=0.0, duration=None):
    y, _ = librosa.load(os.path.join(SRC, rel), sr=SR, mono=True, offset=offset, duration=duration)
    return y.astype(np.float64)

def steadiest(y, length, after=0.0):
    """Start (s) of the loudest window of `length` s that never dips far, from `after` on."""
    hop = 441
    rms = librosa.feature.rms(y=y.astype(np.float32), frame_length=1764, hop_length=hop)[0]
    db = 20 * np.log10(np.maximum(rms / rms.max(), 1e-6))
    n, first = int(length * SR / hop), int(after * SR / hop)
    best, at = -1e9, first
    for i in range(first, max(first + 1, len(db) - n), 4):
        w = db[i:i + n]
        score = 2 * w.min() + w.mean()
        if score > best: best, at = score, i
    return at * hop / SR

def measured_pitch(y):
    f0, v, p = librosa.pyin(y.astype(np.float32), fmin=60, fmax=1200, sr=SR, frame_length=2048)
    g = f0[v & (p > 0.5)]
    return float(np.median(librosa.hz_to_midi(g))) if len(g) > 5 else None

def retune(y, semitones):
    """Shift pitch by resampling (a few cents: the length barely changes)."""
    if abs(semitones) < 0.01: return y
    factor = 2 ** (semitones / 12)
    return librosa.resample(y, orig_sr=SR * factor, target_sr=SR)

def level(y, strength=0.6, window=0.15):
    """Even out swells: gain towards a steady level, following a smoothed envelope."""
    n = int(window * SR)
    env = np.sqrt(np.convolve(y ** 2, np.hanning(n) / np.hanning(n).sum(), 'same')) + 1e-6
    target = np.median(env)
    gain = np.clip((target / env) ** strength, 0.4, 4.0)
    return y * np.convolve(gain, np.ones(n // 4) / (n // 4), 'same')

def fades(y, fade_in=0.012, fade_out=0.35):
    y = y.copy()
    a, b = int(fade_in * SR), min(len(y), int(fade_out * SR))
    if a: y[:a] *= np.linspace(0, 1, a) ** 2
    if b: y[-b:] *= np.linspace(1, 0, b) ** 2
    return y

def normalize(y, rms_db=-18.0, peak_db=-1.0):
    rms = np.sqrt(np.mean(y ** 2)) + 1e-12
    y = y * (10 ** (rms_db / 20) / rms)
    peak = np.abs(y).max()
    ceiling = 10 ** (peak_db / 20)
    return y * (ceiling / peak) if peak > ceiling else y

def peak_normalize(y, peak_db=-1.0):
    return y * (10 ** (peak_db / 20) / (np.abs(y).max() + 1e-12))

def band(y, lo=None, hi=None, order=4):
    if lo and hi: sos = butter(order, [lo, hi], 'bandpass', fs=SR, output='sos')
    elif lo: sos = butter(order, lo, 'highpass', fs=SR, output='sos')
    else: sos = butter(order, hi, 'lowpass', fs=SR, output='sos')
    return sosfilt(sos, y)

def decay(y, tau):
    return y * np.exp(-np.arange(len(y)) / (tau * SR))

def at_onset(y, threshold=0.3):
    """Trim to just before the hit: the first sample above `threshold` of the peak.
    (Low thresholds catch a small event before the real one, and the hit then
    sounds late on the grid.)"""
    i = int(np.argmax(np.abs(y) > threshold * np.abs(y).max()))
    return y[max(0, i - int(0.001 * SR)):]

written = []
def write(name, y, quality=5):
    path = os.path.join(OUT, name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
        sf.write(tmp.name, np.clip(y, -1, 1).astype(np.float32), SR, subtype='PCM_16')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp.name, '-ac', '1', '-codec:a', 'libmp3lame', '-q:a', str(quality), path], check=True)
    os.unlink(tmp.name)
    written.append((name, len(y) / SR, os.path.getsize(path)))

def sustained(rel, root, length, after=0.0, start=None, lvl=0.0, fade_out=0.35):
    """A note held: its steadiest stretch, tuned to `root`, levelled, faded; returns the audio."""
    y = load(rel)
    t0 = start if start is not None else steadiest(y, length, after)
    seg = y[int(t0 * SR): int((t0 + length) * SR)]
    m = measured_pitch(seg)
    fix = (root - m) if m is not None and abs(root - m) < 1 else 0.0
    seg = retune(seg, fix)
    if lvl: seg = level(seg, lvl)
    print(f'   {rel.split("/")[-1]:34} from {t0:5.2f}s  measured {m:.2f} → root {root} ({fix * 100:+.0f} cents)' if m is not None
          else f'   {rel.split("/")[-1]:34} from {t0:5.2f}s  unpitched, root {root} as mapped')
    return normalize(fades(seg, fade_out=fade_out))

# ------------------------------------------------------------------ the voices

print('Slingshot — Nasa Space Pad')
write('slingshot/sonar-59.mp3', sustained(NASA + 'Cold sun sonar B.wav', 59, 3.6, start=0.30, fade_out=0.8))
write('slingshot/takeoff-61.mp3', sustained(NASA + 'Takeoff guitar C#-[1].wav', 61, 4.5, start=0.90))

print('Conductor — The Spellsinger (sustains, after their loop points)')
# (file, root it is mapped to, the library's loop start in seconds)
for f, root, loop in [('Sustain_Note01.wav', 56, 547928 / 96000), ('Sustain_Note03.wav', 61, 521624 / 96000),
                      ('Sustain_Note04.wav', 64, 442479 / 96000), ('Sustain_Note05.wav', 67, 446595 / 96000),
                      ('Sustain_Note07.wav', 71, 665064 / 96000), ('Sustain_Note08.wav', 74, 167913 / 96000)]:
    # Six seconds: a whole note over four slow beats, and held on past it, still has voice.
    write(f'conductor/voice-{root}.mp3', sustained(SPELL + f, root, 6.0, after=loop, lvl=0.6))

print('Rhythm echo — Space Voices')
write('echo/star-56.mp3', sustained(VOICES + 'Hum and Whistle High G#.wav', 56, 5.0, after=120130 / 48000, lvl=0.4))
write('echo/earth-48.mp3', sustained(VOICES + 'Hum and Whistle Low C.wav', 48, 5.0, after=421740 / 48000, lvl=0.4))
write('echo/earth-55.mp3', sustained(VOICES + 'Hum and Whistle Low G.wav', 55, 5.0, after=265410 / 48000, lvl=0.4))

# ------------------------------------------------------------------ the Mars kit

print('Groove — a kit from Perseverance and InSight')
ROVER = MARS + '45856_FILTERED_HIGHLIGHTS_-_Sol16RoverDriveHighlights.wav'
METEOR = MARS + '47586_Insight-Captures-Sound-of-Meteroid-Striking-Mars.wav'
LASER = MARS + '45830_SCAM_MIC_SOL012_RUN001.wav'
MOXIE = MARS + '48520_E1-PIA26041-The_Sound_of_MOXIE_at_Work_on_Mars.wav'

laser = at_onset(load(LASER, 1.985, 0.12), 0.05)               # SuperCam's laser zapping a rock: a clean, bright click
def pad_to(y, n): return np.pad(y, (0, max(0, n - len(y))))[:n]
def mix(*parts):
    n = max(len(p) for p in parts)
    return sum(pad_to(p, n) for p in parts)

# Kick: a rover wheel's thud (it rises in 13 ms), a few semitones down for weight, with the
# meteoroid's knock on top so it speaks on small speakers.
thud = load(ROVER, 5.844, 0.5)
thud = librosa.resample(thud, orig_sr=SR, target_sr=SR * 2 ** (4 / 12))[: int(0.42 * SR)]
knock = at_onset(load(METEOR, 1.805, 0.1), 0.2)
write('groove/kick.mp3', peak_normalize(fades(mix(decay(band(thud, hi=1200), 0.16), 0.25 * band(knock, 300, 4000)), 0.001, 0.12)), quality=3)

# Snare: a rover clank for the body, the laser for the snap, a spray of laser clicks for the wires.
clank = load(ROVER, 20.358, 0.4)                          # rises in 5 ms
spray = np.zeros(int(0.18 * SR))
rng = np.random.default_rng(7)
for k in range(14):
    at = int(rng.uniform(0.0, 0.11) * SR)
    c = laser[: int(0.02 * SR)] * np.exp(-at / (0.045 * SR))
    spray[at: at + len(c)] += c[: len(spray) - at]
body = decay(band(clank, 120, 5000), 0.12)
body = body / (np.abs(body).max() + 1e-12)
wires = band(spray, 2000)
wires = wires / (np.abs(wires).max() + 1e-12)
write('groove/snare.mp3', peak_normalize(fades(mix(body, 0.6 * laser[: int(0.05 * SR)] / np.abs(laser).max(), 0.7 * wires), 0.001, 0.08)), quality=3)

# Rim: the laser an octave down (half speed), short and woody.
rim = librosa.resample(laser, orig_sr=SR, target_sr=SR * 2)[: int(0.06 * SR)]
write('groove/rim.mp3', peak_normalize(fades(band(rim, 800, 9000), 0.0005, 0.03)), quality=3)

# Hi-hats: the laser as it is, closed; a decaying burst of it, open.
write('groove/hat-closed.mp3', peak_normalize(fades(band(laser[: int(0.07 * SR)], 3000), 0.0005, 0.04)), quality=3)
burst = np.zeros(int(0.36 * SR))
for k in range(18):
    at = 0 if k == 0 else int(k * 0.018 * SR + rng.uniform(-0.003, 0.003) * SR)
    c = laser[: int(0.03 * SR)] * np.exp(-k / 5.5)
    burst[at: at + len(c)] += c[: len(burst) - at]
write('groove/hat-open.mp3', peak_normalize(fades(band(burst, 3500), 0.0005, 0.12)), quality=3)

# Cowbell: MOXIE's hum (≈ 515 Hz), struck by the laser and let ring briefly.
hum = load(MOXIE, 13.6, 0.3)
bell = decay(band(hum, 380, 2200), 0.07) * np.linspace(0, 1, len(hum)) ** 0.02
write('groove/cowbell.mp3', peak_normalize(fades(mix(bell, 0.35 * band(laser[: int(0.03 * SR)], 1500)), 0.0005, 0.06)), quality=3)

# Toms: the meteoroid striking Mars — its long, ringing strike, played from its peak (the strike
# itself swells for a tenth of a second, too slow for a drum) — pitched down to three drums.
strike = load(METEOR, 3.967, 0.6)
for name, semis in [('tom-high', -4), ('tom-mid', -8), ('tom-low', -13)]:
    t = librosa.resample(strike, orig_sr=SR, target_sr=SR * 2 ** (-semis / 12))[: int(0.6 * SR)]
    write(f'groove/{name}.mp3', peak_normalize(fades(decay(band(t, 50, 6000), 0.3), 0.0005, 0.12)), quality=3)

print('\nWritten:')
total = 0
for name, secs, size in written:
    total += size
    print(f'   {name:28} {secs:5.2f}s  {size / 1024:6.1f} KB')
print(f'   {"total":28}        {total / 1024:6.1f} KB')
