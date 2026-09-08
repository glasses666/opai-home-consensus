"""Slow the preserved V04 elastic cycle to 75% speed, retain 24fps."""
import bpy
from pathlib import Path
OUT=Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(OUT/'oppein-mg-elastic-v04.blend'))
for action in bpy.data.actions:
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for fc in bag.fcurves:
                    for key in fc.keyframe_points:
                        key.co.x=1+(key.co.x-1)*4/3
                    fc.update()
bpy.context.scene.frame_end=96
bpy.context.scene.frame_set(42)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'oppein-mg-elastic-v05.blend'))
print('V05 96 frames at 24fps = 4 seconds; amplitude unchanged')
