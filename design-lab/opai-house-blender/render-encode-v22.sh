#!/bin/zsh
set -eu
cd /Users/dracoglasser/Documents/欧派家居
/Applications/Blender.app/Contents/MacOS/Blender -b --python design-lab/opai-house-blender/render-v22.py
cd design-lab/opai-house-blender/motion-v22
test -f complete.json
ffmpeg -nostdin -n -framerate 120 -i frames/frame-%04d.png -frames:v 2304 -c:v libx264 -threads 14 -crf 18 -preset medium -pix_fmt yuv420p -movflags +faststart opai-house-v22-1080p120.mp4
ffprobe -v error -show_entries stream=width,height,nb_frames,r_frame_rate -show_entries format=duration -of json opai-house-v22-1080p120.mp4
