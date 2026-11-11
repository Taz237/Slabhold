#!/usr/bin/env bash
# Export check stills at 1s, 5s, 10s, 15s and 20s from the rendered MP4.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p out/stills
for t in 1 5 10 15 20; do
  ffmpeg -loglevel error -y -ss "$t" -i out/slabhold-promo.mp4 -frames:v 1 "out/stills/still-${t}s.png"
done
ls out/stills
