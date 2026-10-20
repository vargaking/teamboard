# TeamBoard promo video

A ~2 minute promo + how-to video for TeamBoard, built with [Remotion](https://www.remotion.dev/) from real UI
captures, procedural music and an offline neural voice-over.

Output: `out/teamboard-promo.mp4` (1920x1080, 30 fps, H.264 + AAC), plus `out/teamboard-preview-10s.mp4` and key
frames in `out/frames/`.

## Re-render

Everything runs offline once the npm/pip packages are installed. Order matters: the captures and the voice-over
produce the timing data the composition reads.

```bash
cd promo
npm install                                   # Remotion (uses the pre-installed Chromium, see remotion.config.ts)

# 1. Screen captures -> public/clips/*.mp4 + public/clips/clips.json   (~7 min)
python3 capture/capture.py                    # needs ../backend/.venv, ../frontend/node_modules, python playwright

# 2. Voice-over -> public/audio/voice/*.wav + src/data/voice.json     (~1 min)
python3 -m venv .work/ttsvenv && .work/ttsvenv/bin/pip install kokoro-onnx soundfile
.work/ttsvenv/bin/python audio/make_voice.py

# 3. Music -> public/audio/music.wav (needs numpy + scipy)
npx tsx scripts/timeline.ts                   # prints scene timings and the total length
python3 audio/make_music.py 114.5             # seconds: the video length (+ a little), so the final chord lands

# 4. Render (~45 min on 2 CPUs), then loudness-normalise to -16 LUFS, cut the 10 s preview, extract key frames
npx remotion render src/index.ts TeamBoardPromo out/teamboard-promo.mp4
sh scripts/finalize.sh
npx remotion studio                           # interactive preview / tweaking
node scripts/stills.mjs .work/stills 600 1100 # render single frames to PNG for quick checks
```

`out/teamboard-preview-10s.mp4` is 0:14-0:24 of the final cut (the "Boards & cards" scene); `out/frames/` holds
key frames at the timestamps in their names.

If Chromium lives elsewhere, set `REMOTION_BROWSER=/path/to/headless_shell`. `REMOTION_CONCURRENCY` sets the
number of render tabs (default 2).

## Where things come from

| Piece | Source |
| --- | --- |
| UI footage | `capture/capture.py` starts a private TeamBoard (SQLite DB in `.work/`, port 47613, frontend built into `.work/dist`), seeds 12 users + demo data (`capture/seed_demo.py`, REST API only) and drives it with Playwright. Each clip is captured "stop-motion": one CDP screenshot (2560x1440, 1440x810 CSS viewport) per video frame, with CSS animations slowed by the same factor, so drags and transitions are smooth and sharp. A fake cursor is injected because headless screenshots have none. |
| Live updates | Two browser contexts (Miki and Dániel) on the same board; Miki drags, Dániel's page updates through the real WebSocket. |
| Claude connector | `capture/claude_create_card.py` creates a personal token and calls the real MCP endpoint (`list_boards`, `get_board`, `create_card`) - the card "Created by Claude" appears through live updates. The "Connect to Claude" dialog shows the production MCP URL (`/api/mcp-info` is stubbed with the Render URL in the capture). The chat panel in the video is a stylised illustration, not a claude.ai screenshot. |
| Trello import | A small generated Trello JSON export (`make_trello_export` in `capture.py`) uploaded through the real import dialog. |
| Timing | `public/clips/clips.json`: frame counts, event markers (e.g. the frame a card is dropped) and element bounding boxes used for zooms, highlights and callouts. |
| Voice-over | Kokoro-82M (Apache-2.0), voice `af_heart`, via `kokoro-onnx`. The model and voice vectors come from the npm package `expo-kokoro@1.1.9` (Hugging Face is not reachable from the sandbox); the model's sha256 is checked against the onnx-community release. Script: `audio/script.json` (`text` = caption, `say` = pronunciation hints for the TTS). |
| Music | `audio/make_music.py`: procedural ~100 BPM lo-fi/synthwave (chords, bass, drums, sidechain pump, tape low-pass), normalised to -16 LUFS, peaks <= -1 dBFS. Royalty-free by construction. In the mix it sits at -10 dB and ducks to -18 dB under the voice. |
| Font | Inter (installed system-wide; falls back to Noto/DejaVu). |

## Editing

- Scene order, lengths and when each voice line starts: `src/timeline.ts`.
- Scenes: `src/scenes/Features.tsx` (footage scenes) and `src/scenes/Graphics.tsx` (motion graphics).
- Captions are the `text` of each voice line; change `audio/script.json` and re-run `make_voice.py`.
- After changing what a capture does, re-run the whole `capture.py`: clips share one database and later clips
  rely on earlier ones (e.g. the card dragged in "drag" is in Review afterwards).

Generated media (`public/clips/*.mp4`, `public/audio/music.wav`, `out/`, `.work/`) is git-ignored; the small voice
WAVs and the timing JSON are kept so the composition opens without re-running TTS.
