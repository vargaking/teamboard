"""Procedural background music for the promo: a ~100 BPM lo-fi / synthwave groove, royalty-free by construction.

  python3 audio/make_music.py [seconds]      # default 132 s -> public/audio/music.wav (48 kHz stereo, 16-bit)

Pads (detuned saws through a low-pass), a plucky arpeggio, sub bass, soft drums with a sidechain pump on the
pads/bass, swung hats, a gentle "tape" low-pass + wow and a whisper of hiss. Normalised to about -16 LUFS
(ITU-R BS.1770 K-weighting, ungated) with peaks <= -1 dBFS. Needs numpy + scipy.
"""

from __future__ import annotations

import os
import sys
import wave

import numpy as np
from scipy import signal

SR = 48000
BPM = 100
BEAT = 60 / BPM
BAR = 4 * BEAT
RNG = np.random.default_rng(7)

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "public", "audio", "music.wav")

# I-V-vi-IV feel in F major with sevenths: Fmaj7 | C/E add9 | Dm7 | Bbmaj7
CHORDS = [
    [53, 57, 60, 64],  # Fmaj7  F A C E
    [52, 55, 60, 62],  # C/E add9  E G C D
    [50, 53, 57, 60],  # Dm7  D F A C
    [46, 50, 53, 57],  # Bbmaj7  Bb D F A
]
BASS = [41, 36, 38, 34]  # F2 C2 D2 Bb1


def hz(note: float) -> float:
    return 440.0 * 2 ** ((note - 69) / 12)


def adsr(n: int, a: float, d: float, s: float, r: float) -> np.ndarray:
    a_n, d_n, r_n = int(a * SR), int(d * SR), int(r * SR)
    sus_n = max(0, n - a_n - d_n - r_n)
    env = np.concatenate([
        np.linspace(0, 1, max(a_n, 1), endpoint=False),
        np.linspace(1, s, max(d_n, 1), endpoint=False),
        np.full(sus_n, s),
        np.linspace(s, 0, max(r_n, 1)),
    ])
    return env[:n] if len(env) >= n else np.pad(env, (0, n - len(env)))


def saw(f: float, n: int, phase: float = 0.0) -> np.ndarray:
    t = np.arange(n) / SR
    # band-limited-ish saw: sum of a few harmonics (pads stay warm, no aliasing)
    out = np.zeros(n)
    for k in range(1, 14):
        if f * k > 9000:
            break
        out += np.sin(2 * np.pi * f * k * t + phase * k) / k
    return out * 0.6


def lowpass(x: np.ndarray, cutoff: float, order: int = 2) -> np.ndarray:
    b, a = signal.butter(order, cutoff / (SR / 2), "low")
    return signal.lfilter(b, a, x, axis=0)


def highpass(x: np.ndarray, cutoff: float, order: int = 2) -> np.ndarray:
    b, a = signal.butter(order, cutoff / (SR / 2), "high")
    return signal.lfilter(b, a, x, axis=0)


def bandpass(x: np.ndarray, lo: float, hi: float) -> np.ndarray:
    b, a = signal.butter(2, [lo / (SR / 2), hi / (SR / 2)], "band")
    return signal.lfilter(b, a, x)


def place(buf: np.ndarray, snd: np.ndarray, t: float, gain: float = 1.0, pan: float = 0.0):
    i = int(t * SR)
    if i >= len(buf):
        return
    snd = snd[: len(buf) - i]
    left, right = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    buf[i : i + len(snd), 0] += snd * gain * left * 1.414
    buf[i : i + len(snd), 1] += snd * gain * right * 1.414


def kick() -> np.ndarray:
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    f = 48 + 90 * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t * 7.5)
    click = bandpass(RNG.standard_normal(n), 1500, 5000) * np.exp(-t * 180) * 0.15
    return (body + click) * 0.9


def snare() -> np.ndarray:
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    noise = bandpass(RNG.standard_normal(n), 900, 7000) * np.exp(-t * 16)
    tone = np.sin(2 * np.pi * 185 * t) * np.exp(-t * 22) * 0.5
    clap = np.zeros(n)
    for k, d in enumerate([0.0, 0.011, 0.022]):
        i = int(d * SR)
        clap[i:] += bandpass(RNG.standard_normal(n - i), 1000, 4000) * np.exp(-np.arange(n - i) / SR * (60 if k < 2 else 18))
    return (noise * 0.5 + tone + clap * 0.35) * 0.55


def hat(open_: bool = False) -> np.ndarray:
    n = int((0.25 if open_ else 0.06) * SR)
    t = np.arange(n) / SR
    return highpass(RNG.standard_normal(n), 7000, 2) * np.exp(-t * (14 if open_ else 70)) * 0.25


def pluck(f: float, dur: float) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = (saw(f, n) * 0.6 + np.sin(2 * np.pi * f * t) * 0.5) * np.exp(-t * 9)
    # filter envelope: bright attack that closes quickly
    bright = lowpass(x, 3800)
    dark = lowpass(x, 900)
    mix = np.exp(-t * 18)
    return bright * mix + dark * (1 - mix)


def k_weight(x: np.ndarray) -> np.ndarray:
    # ITU-R BS.1770 pre-filter (high shelf) + RLB high-pass, coefficients for 48 kHz
    b1, a1 = [1.53512485958697, -2.69169618940638, 1.19839281085285], [1.0, -1.69065929318241, 0.73248077421585]
    b2, a2 = [1.0, -2.0, 1.0], [1.0, -1.99004745483398, 0.99007225036621]
    return signal.lfilter(b2, a2, signal.lfilter(b1, a1, x, axis=0), axis=0)


def loudness(x: np.ndarray) -> float:
    y = k_weight(x)
    # 400 ms blocks with absolute gate at -70 LUFS and relative gate at -10 LU
    blk, hop = int(0.4 * SR), int(0.1 * SR)
    powers = np.array([np.mean(y[i : i + blk] ** 2, axis=0).sum() for i in range(0, len(y) - blk, hop)])
    lk = -0.691 + 10 * np.log10(powers + 1e-12)
    gated = powers[lk > -70]
    rel = -0.691 + 10 * np.log10(gated.mean()) - 10
    gated = powers[(lk > -70) & (lk > rel)]
    return -0.691 + 10 * np.log10(gated.mean())


def build(seconds: float) -> np.ndarray:
    n = int(seconds * SR)
    pads = np.zeros((n, 2))
    bass = np.zeros((n, 2))
    drums = np.zeros((n, 2))
    arp = np.zeros((n, 2))
    bars = int(np.ceil(seconds / BAR))
    final_bar = int((seconds - 4.0) // BAR)  # last full bar: let a chord ring out

    for bar in range(bars):
        t0 = bar * BAR
        ci = bar % 4
        chord, root = CHORDS[ci], BASS[ci]
        intro = bar < 2
        breakdown = (bars // 2 + 2) <= bar < (bars // 2 + 4)
        ending = bar >= final_bar

        # pads: a whole bar, slow attack, two detuned layers spread in stereo
        pad_len = BAR + 0.6 if not ending else seconds - t0
        m = int(pad_len * SR)
        env = adsr(m, 0.35, 0.4, 0.8, 0.6 if not ending else min(3.5, pad_len * 0.8))
        for note in chord:
            for det, pan in ((-0.07, -0.55), (0.07, 0.55)):
                tone = saw(hz(note + det), m, phase=RNG.uniform(0, 6.28))
                place(pads, lowpass(tone, 1700 if not breakdown else 1100) * env, t0, 0.075, pan)
        if ending:
            place(bass, np.sin(2 * np.pi * hz(root) * np.arange(m) / SR) * env, t0, 0.32)
            break

        # bass: syncopated eighths on the root, octave pop on the "and" of 4
        if not intro and not breakdown:
            pattern = [(0, 0.7, 0), (1.5, 0.45, 0), (2.0, 0.5, 0), (3.0, 0.35, 0), (3.5, 0.35, 12)]
            for beat, dur, oct_ in pattern:
                m = int(dur * BEAT * SR)
                tt = np.arange(m) / SR
                f = hz(root + oct_)
                tone = np.sin(2 * np.pi * f * tt) + 0.25 * np.sin(4 * np.pi * f * tt) + 0.1 * saw(f, m)
                place(bass, lowpass(tone * adsr(m, 0.005, 0.08, 0.7, 0.05), 700), t0 + beat * BEAT, 0.36)

        # drums
        if not intro:
            kicks = [0, 2] if breakdown else [0, 1.75, 2, 2.5] if bar % 2 else [0, 2, 2.5]
            if breakdown:
                kicks = [0]
            for b in kicks:
                place(drums, kick(), t0 + b * BEAT, 0.62)
            if not breakdown:
                for b in (1, 3):
                    place(drums, snare(), t0 + b * BEAT, 0.33, 0.05)
            for k in range(8):
                swing = 0.06 * BEAT if k % 2 else 0.0
                vel = 0.9 if k % 2 == 0 else 0.55
                vel *= RNG.uniform(0.85, 1.05)
                if breakdown and k % 2:
                    continue
                place(drums, hat(open_=(k == 7 and bar % 4 == 3)), t0 + k * BEAT / 2 + swing, 0.22 * vel, 0.3)

        # arpeggio: 16ths over chord tones an octave up, only in the "B" sections
        if not intro and (bar // 8) % 2 == 1 and not breakdown:
            seq = [0, 1, 2, 3, 2, 1, 2, 3]
            for k in range(16):
                note = chord[seq[k % 8]] + 12
                place(arp, pluck(hz(note), BEAT / 2), t0 + k * BEAT / 4 + (0.03 if k % 2 else 0), 0.06, -0.3 + 0.6 * ((k % 4) / 3))

    # sidechain pump on pads + bass, keyed to every beat (the four-on-the-floor pulse is felt, not heard)
    t = np.arange(n) / SR
    phase = (t % BEAT) / BEAT
    duck = 1 - 0.38 * np.exp(-phase * 7)
    duck[t < 2 * BAR] = 1.0
    music = (pads + bass * 1.0) * duck[:, None] + drums + arp

    # simple room: two short feedback-free taps
    for delay, g in ((0.031, 0.18), (0.047, 0.14)):
        d = int(delay * SR)
        music[d:, 0] += music[:-d, 1] * g
        music[d:, 1] += music[:-d, 0] * g

    # "tape": gentle wow via a modulated fractional delay, low-pass, hiss
    wow = 0.0009 * SR * (1 + np.sin(2 * np.pi * 0.35 * t)) + 0.0002 * SR * np.sin(2 * np.pi * 5.1 * t)
    idx = np.clip(np.arange(n) - wow, 0, n - 1)
    lo = np.floor(idx).astype(int)
    frac = idx - lo
    hi = np.minimum(lo + 1, n - 1)
    music = music[lo] * (1 - frac)[:, None] + music[hi] * frac[:, None]
    music = lowpass(music, 9500)
    music = highpass(music, 30)
    music += lowpass(RNG.standard_normal((n, 2)), 6000) * 0.0025

    # soft saturation
    music = np.tanh(music * 1.2) / 1.2

    # fades
    fade_in = int(1.5 * SR)
    music[:fade_in] *= np.linspace(0, 1, fade_in)[:, None]
    fade_out = int(3.0 * SR)
    music[-fade_out:] *= np.linspace(1, 0, fade_out)[:, None] ** 1.5
    return music


def main():
    seconds = float(sys.argv[1]) if len(sys.argv) > 1 else 132.0
    music = build(seconds)
    lufs = loudness(music)
    music *= 10 ** ((-16.0 - lufs) / 20)
    peak = np.abs(music).max()
    ceiling = 10 ** (-1.0 / 20)
    if peak > ceiling:  # a soft limiter: compress only the few peaks above the ceiling
        knee = ceiling * 0.8
        over = np.abs(music) > knee
        music[over] = np.sign(music[over]) * (knee + (ceiling - knee) * np.tanh((np.abs(music[over]) - knee) / (ceiling - knee)))
    print(f"loudness {loudness(music):.1f} LUFS, peak {20 * np.log10(np.abs(music).max()):.2f} dBFS")
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    pcm = (np.clip(music, -1, 1) * 32767).astype("<i2")
    with wave.open(OUT, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print(f"wrote {OUT} ({seconds:.0f}s)")


if __name__ == "__main__":
    main()
