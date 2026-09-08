"""Arrange this new review file only; never render or touch older open files."""
import bpy
from pathlib import Path
from mathutils import Vector
def capture_and_play():
    out=Path(bpy.data.filepath).parent
    bpy.ops.screen.screenshot(filepath=str(out/'viewport-review.png'))
    w=bpy.context.window;a=next(a for a in w.screen.areas if a.type=='VIEW_3D')
    with bpy.context.temp_override(window=w,area=a):bpy.ops.screen.animation_play()
    return None
def setup():
    w=bpy.context.window
    if not w:return .5
    screen=w.screen
    views=[a for a in screen.areas if a.type=='VIEW_3D']
    if len(views)==1:
        a=views[0]
        with bpy.context.temp_override(window=w,area=a):bpy.ops.screen.area_split(direction='VERTICAL',factor=.56)
    views=sorted([a for a in screen.areas if a.type=='VIEW_3D'],key=lambda a:a.x)
    for i,a in enumerate(views):
        space=a.spaces.active;space.shading.type='SOLID';space.shading.color_type='MATERIAL'
        space.shading.light='STUDIO';space.shading.show_shadows=True;space.shading.show_cavity=True
        space.overlay.show_overlays=i>0
        space.region_3d.view_perspective='CAMERA' if i==0 else 'PERSP'
        if i==0:space.region_3d.view_camera_zoom=-10
        else:
            space.region_3d.view_location=(0,0,6);space.region_3d.view_distance=90
            space.region_3d.view_rotation=Vector((40,-60,65)).to_track_quat('Z','Y')
            space.overlay.show_floor=False;space.overlay.show_axis_x=False;space.overlay.show_axis_y=False
    bpy.context.scene.frame_set(1)
    for o in bpy.context.selected_objects:o.select_set(False)
    cam=bpy.context.scene.camera;cam.select_set(True);bpy.context.view_layer.objects.active=cam
    bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
    bpy.app.timers.register(capture_and_play,first_interval=2.0)
    return None
bpy.app.timers.register(setup,first_interval=1.0)
