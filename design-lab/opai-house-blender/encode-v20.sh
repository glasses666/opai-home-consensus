#!/bin/zsh
set -eu
cd /Users/dracoglasser/Documents/欧派家居/design-lab/opai-house-blender/motion-v20/render-1080
# Bounded wait for the renderer's verified completion marker.
for attempt in {1..720}; do
  if [[ -f complete.json ]]; then
    ffmpeg -nostdin -n -framerate 20 -i frames/frame-%04d.png -frames:v 384 -c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p -movflags +faststart opai-house-v20-1080p.mp4
    ffprobe -v error -show_entries stream=width,height,nb_frames,r_frame_rate -show_entries format=duration -of json opai-house-v20-1080p.mp4
    exit 0
  fi
  sleep 10
done
exit 1
