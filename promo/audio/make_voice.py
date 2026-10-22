"""Generate the voice-over with Kokoro-82M (Apache-2.0), fully offline after one npm download.

The Kokoro ONNX weights and voice style vectors are taken from the npm package `expo-kokoro@1.1.9`
(npm is reachable from restricted sandboxes where Hugging Face is not). The model file is checked against the
sha256 of onnx-community/Kokoro-82M-v1.0-ONNX `model_quantized.onnx`.

  python3 -m venv .work/ttsvenv && .work/ttsvenv/bin/pip install kokoro-onnx soundfile
  .work/ttsvenv/bin/python audio/make_voice.py                    # all lines
  .work/ttsvenv/bin/python audio/make_voice.py intro_0 boards_0   # only these lines, keep the rest

Writes public/audio/voice/<scene>_<n>.wav and src/data/voice.json (durations used by the Remotion timeline).
"""

from __future__ import annotations

import glob
import hashlib
import json
import os
import subprocess
import sys
import tarfile

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

HERE = os.path.dirname(os.path.abspath(__file__))
PROMO = os.path.dirname(HERE)
WORK = os.path.join(PROMO, ".work", "kokoro")
OUT = os.path.join(PROMO, "public", "audio", "voice")
DATA = os.path.join(PROMO, "src", "data", "voice.json")
PKG = "expo-kokoro@1.1.9"
MODEL_SHA256 = "fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478"


def fetch_model() -> tuple[str, str]:
    pkg_dir = os.path.join(WORK, "package")
    model = os.path.join(pkg_dir, "build", "kokoro-quantized.onnx")
    if not os.path.exists(model):
        os.makedirs(WORK, exist_ok=True)
        subprocess.run(["npm", "pack", PKG, "--pack-destination", WORK, "--silent"], check=True)
        tgz = glob.glob(os.path.join(WORK, "expo-kokoro-*.tgz"))[0]
        with tarfile.open(tgz) as tar:
            members = [m for m in tar.getmembers() if m.name.startswith("package/build/") and m.isfile()]
            tar.extractall(WORK, members=members, filter="data")
    digest = hashlib.sha256(open(model, "rb").read()).hexdigest()
    if digest != MODEL_SHA256:
        raise SystemExit(f"unexpected model checksum {digest}")
    voices_npz = os.path.join(WORK, "voices.npz")
    if not os.path.exists(voices_npz):
        voices = {}
        for f in glob.glob(os.path.join(pkg_dir, "build", "voices", "*.bin")):
            voices[os.path.basename(f)[:-4]] = np.fromfile(f, dtype=np.float32).reshape(-1, 1, 256)
        np.savez(voices_npz, **voices)
    return model, voices_npz


def trim(samples: np.ndarray, sr: int, pad: float = 0.06) -> np.ndarray:
    env = np.abs(samples)
    idx = np.where(env > 0.01 * env.max())[0]
    if len(idx) == 0:
        return samples
    a = max(0, idx[0] - int(pad * sr))
    b = min(len(samples), idx[-1] + int(pad * sr))
    return samples[a:b]


def level(samples: np.ndarray, target_rms_db: float = -19.0) -> np.ndarray:
    voiced = samples[np.abs(samples) > 0.02 * np.abs(samples).max()]
    rms = np.sqrt(np.mean(voiced**2)) if len(voiced) else 1e-3
    out = samples * (10 ** (target_rms_db / 20) / rms)
    peak = np.abs(out).max()
    limit = 10 ** (-1.5 / 20)
    if peak > limit:
        out *= limit / peak
    return out


def main():
    script = json.load(open(os.path.join(HERE, "script.json")))
    only = set(sys.argv[1:])
    previous = {}
    if only and os.path.exists(DATA):
        for sc in json.load(open(DATA))["scenes"]:
            for i, l in enumerate(sc["lines"]):
                previous[f"{sc['id']}_{i}"] = l
    model, voices = fetch_model()
    tts = Kokoro(model, voices)
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(os.path.dirname(DATA), exist_ok=True)
    result = {"voice": script["voice"], "scenes": []}
    for scene in script["scenes"]:
        lines = []
        for i, line in enumerate(scene["lines"]):
            key = f"{scene['id']}_{i}"
            if only and key not in only and key in previous:
                lines.append({**previous[key], "text": line["text"]})
                continue
            samples, sr = tts.create(line.get("say", line["text"]), voice=script["voice"], speed=script["speed"], lang="en-us")
            samples = level(trim(np.asarray(samples, dtype=np.float32), sr))
            name = f"{scene['id']}_{i}.wav"
            sf.write(os.path.join(OUT, name), samples, sr, subtype="PCM_16")
            lines.append({"file": f"audio/voice/{name}", "seconds": round(len(samples) / sr, 3), "text": line["text"]})
            print(f"{name}: {len(samples) / sr:.2f}s  {line['text']}")
        result["scenes"].append({"id": scene["id"], "minSeconds": scene["minSeconds"], "lines": lines})
    with open(DATA, "w") as fh:
        json.dump(result, fh, indent=2, ensure_ascii=False)
    total = sum(l["seconds"] for s in result["scenes"] for l in s["lines"])
    print(f"total speech {total:.1f}s")


if __name__ == "__main__":
    main()
