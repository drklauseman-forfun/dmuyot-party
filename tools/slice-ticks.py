"""Turn a recording of repeated clicks into the tick files a sound pack wants.

Most usable source material — a combination lock being turned, a clock running,
a ratchet being spun — is one recording containing many clicks rather than the
several separate short files the engine needs. This finds the individual hits,
takes the most distinct ones, trims and levels them, and writes them out ready
to drop into `frontend/public/sounds/<pack>/`.

Standard library only, so there is nothing to install.

    python tools/slice-ticks.py source.wav --out frontend/public/sounds/wheel
    python tools/slice-ticks.py vault.wav --out .../wheel --land --name land

Options worth knowing:
    --count N        how many tick files to write (default 4)
    --peak 0.5       normalise each output to this peak, 0-1
    --max-ms 120     longest tick to keep
    --land           write one trimmed, levelled file instead of slicing
    --start / --end  crop the source first, in seconds
"""

import argparse
import math
import struct
import sys
import wave
from pathlib import Path


def read_mono(path):
    """Read a wav as a list of floats in [-1, 1], mixing channels down.

    Handles 16- and 24-bit, which is what sound libraries actually publish.
    Reading 24-bit as 16-bit does not fail loudly — it silently produces
    nonsense — so the width is checked rather than assumed.
    """
    with wave.open(str(path), "rb") as w:
        width, channels = w.getsampwidth(), w.getnchannels()
        rate, frames = w.getframerate(), w.getnframes()
        raw = w.readframes(frames)

    if width == 2:
        samples = struct.unpack("<%dh" % (len(raw) // 2), raw)
        scale = 32768.0
    elif width == 3:
        # No struct format for 24-bit; assemble little-endian and sign-extend.
        samples = []
        for i in range(0, len(raw) - 2, 3):
            value = raw[i] | (raw[i + 1] << 8) | (raw[i + 2] << 16)
            if value & 0x800000:
                value -= 0x1000000
            samples.append(value)
        scale = 8388608.0
    else:
        sys.exit(f"{path}: need 16- or 24-bit wav, got {width * 8}-bit")

    if channels == 1:
        return [s / scale for s in samples], rate

    mixed = []
    for i in range(0, len(samples) - channels + 1, channels):
        frame = samples[i : i + channels]
        mixed.append(sum(frame) / (len(frame) * scale))
    return mixed, rate


def write_mono(path, data, rate, peak):
    """Write floats out as 16-bit mono, normalised and edge-faded."""
    loudest = max((abs(s) for s in data), default=0.0)
    scale = (peak / loudest) if loudest > 0 else 0.0

    # Short fades top and tail. Cutting a waveform mid-cycle is itself a click,
    # and these files are played hundreds of times.
    fade = min(int(rate * 0.002), len(data) // 4)
    shaped = []
    for i, s in enumerate(data):
        gain = 1.0
        if fade > 0:
            if i < fade:
                gain = i / fade
            elif i >= len(data) - fade:
                gain = (len(data) - 1 - i) / fade
        shaped.append(max(-1.0, min(1.0, s * scale * gain)))

    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(b"".join(struct.pack("<h", int(s * 32767)) for s in shaped))


def find_onsets(data, rate, min_gap_ms=60):
    """Sample indexes where a transient starts.

    Energy in short windows, then the points where it jumps well above the
    running background. Deliberately simple: these recordings are clicks
    separated by near-silence, which is the easy case.
    """
    win = max(int(rate * 0.002), 1)
    energy = []
    for start in range(0, len(data) - win, win):
        chunk = data[start : start + win]
        energy.append(sum(s * s for s in chunk) / win)

    if not energy:
        return []

    ordered = sorted(energy)
    floor = ordered[len(ordered) // 2]
    ceiling = ordered[int(len(ordered) * 0.995)]
    if ceiling <= floor:
        return []
    threshold = floor + (ceiling - floor) * 0.18

    min_gap = int((min_gap_ms / 1000.0) * rate / win)
    onsets, last = [], -min_gap
    for i, e in enumerate(energy):
        if e > threshold and i - last >= min_gap:
            # Step back to where the rise actually began, so the attack is intact.
            back = i
            while back > 0 and energy[back - 1] > floor + (ceiling - floor) * 0.03:
                back -= 1
                if i - back > min_gap:
                    break
            onsets.append(back * win)
            last = i
    return onsets


def slice_click(data, rate, start, max_ms):
    """One click from its onset to where it has decayed away."""
    max_len = int(rate * max_ms / 1000.0)
    end = min(start + max_len, len(data))
    segment = data[start:end]
    if not segment:
        return segment

    peak = max(abs(s) for s in segment)
    if peak <= 0:
        return segment

    # Trim the silent tail so a long window does not pad every file.
    quiet = int(rate * 0.004)
    run = 0
    for i, s in enumerate(segment):
        if abs(s) < peak * 0.02:
            run += 1
            if run >= quiet:
                return segment[: i - run + 1]
        else:
            run = 0
    return segment


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("source", type=Path)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--count", type=int, default=4)
    ap.add_argument("--peak", type=float, default=0.5)
    ap.add_argument("--max-ms", type=float, default=120.0)
    ap.add_argument("--name", default="tick")
    ap.add_argument("--land", action="store_true", help="write one trimmed file, do not slice")
    ap.add_argument("--start", type=float, default=0.0, help="ignore audio before this second")
    ap.add_argument("--end", type=float, default=None, help="ignore audio after this second")
    args = ap.parse_args()

    if not args.source.exists():
        sys.exit(f"no such file: {args.source}")
    args.out.mkdir(parents=True, exist_ok=True)

    data, rate = read_mono(args.source)
    print(f"read {args.source.name}: {len(data) / rate:.2f}s at {rate} Hz")

    if args.start or args.end is not None:
        lo = int(args.start * rate)
        hi = int(args.end * rate) if args.end is not None else len(data)
        data = data[lo:hi]
        print(f"cropped to {args.start:.2f}-{(args.end if args.end is not None else len(data) / rate + args.start):.2f}s")

    if args.land:
        # Trim leading silence only; the tail is the point of a landing.
        peak = max((abs(s) for s in data), default=0.0)
        start = next((i for i, s in enumerate(data) if abs(s) > peak * 0.02), 0)
        target = args.out / f"{args.name}.wav"
        write_mono(target, data[start:], rate, args.peak)
        print(f"wrote {target.name}: {(len(data) - start) / rate:.2f}s")
        return

    onsets = find_onsets(data, rate)
    print(f"found {len(onsets)} transients")
    if not onsets:
        sys.exit("no clicks detected — try a recording with clearer separation")

    clips = [(slice_click(data, rate, o, args.max_ms), o) for o in onsets]
    clips = [(c, o) for c, o in clips if len(c) > rate * 0.004]

    # Prefer the loudest, and spread the picks across the recording so the
    # chosen clicks differ from each other rather than being consecutive.
    clips.sort(key=lambda co: max(abs(s) for s in co[0]), reverse=True)
    chosen = clips[: max(args.count * 3, args.count)]
    chosen.sort(key=lambda co: co[1])
    step = max(len(chosen) // args.count, 1)
    picked = [chosen[i * step] for i in range(min(args.count, len(chosen)))]

    for i, (clip, onset) in enumerate(picked, start=1):
        target = args.out / f"{args.name}-{i}.wav"
        write_mono(target, clip, rate, args.peak)
        print(f"wrote {target.name}: {len(clip) / rate * 1000:.0f}ms from {onset / rate:.2f}s")

    if len(picked) < args.count:
        print(f"note: only {len(picked)} distinct clicks available, wanted {args.count}")


if __name__ == "__main__":
    main()
