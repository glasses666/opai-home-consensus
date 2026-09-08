#!/bin/zsh
set -eu
cd /Users/dracoglasser/Documents/欧派家居
/Applications/Blender.app/Contents/MacOS/Blender -b --python design-lab/opai-house-blender/render-v23.py
cd design-lab/opai-house-blender/motion-v23
test -f complete.json
ffmpeg -nostdin -n -framerate 60 -i frames/frame-%04d.png -frames:v 1152 -c:v libx264 -threads 14 -crf 18 -preset medium -pix_fmt yuv420p -movflags +faststart opai-house-v23-1080p60.mp4
ffprobe -v error -show_entries stream=width,height,nb_frames,r_frame_rate -show_entries format=duration -of json opai-house-v23-1080p60.mp4
