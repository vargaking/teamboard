#!/bin/sh
# Post-process the Remotion render: loudness-normalise the mix to -16 LUFS / -1.5 dBTP (video stream copied),
# cut a 10 s preview and extract key frames.   Usage: sh scripts/finalize.sh
set -eu
cd "$(dirname "$0")/.."
FFMPEG=$(command -v ffmpeg || echo node_modules/@remotion/compositor-linux-x64-gnu/ffmpeg)
RAW=out/teamboard-promo.raw.mp4
OUT=out/teamboard-promo.mp4
[ -f "$RAW" ] || mv "$OUT" "$RAW"

# pass 1: measure
STATS=$($FFMPEG -hide_banner -nostats -i "$RAW" -af loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
val() { echo "$STATS" | grep "\"$1\"" | sed 's/.*: "\(.*\)".*/\1/'; }
# pass 2: apply (linear when possible)
$FFMPEG -hide_banner -loglevel error -y -i "$RAW" -c:v copy \
  -af "loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=$(val input_i):measured_TP=$(val input_tp):measured_LRA=$(val input_lra):measured_thresh=$(val input_thresh):offset=$(val target_offset):linear=true" \
  -c:a aac -b:a 192k -ar 48000 -movflags +faststart "$OUT"
rm -f "$RAW"

# 10 s preview: the "Boards & cards" scene (zoom, close-up with callouts, drag & drop)
$FFMPEG -hide_banner -loglevel error -y -ss 14 -i "$OUT" -t 10 -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a aac -b:a 160k -movflags +faststart out/teamboard-preview-10s.mp4

# key frames
mkdir -p out/frames
for t in 3 9 19 26 35 43 52 58 70 85 92 100 110 122 131; do
  $FFMPEG -hide_banner -loglevel error -y -ss "$t" -i "$OUT" -frames:v 1 "out/frames/t$(printf %03d "$t")s.png"
done
echo done
