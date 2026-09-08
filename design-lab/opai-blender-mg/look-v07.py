"""White letters, warmer backdrop, bounded bracket scale; V06 otherwise preserved."""
import bpy, json
from pathlib import Path
OUT = Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(OUT/'oppein-mg-warm-v06.blend'))
scene = bpy.context.scene
def curves(action):
    return [fc for layer in action.layers for strip in layer.strips
            for bag in strip.channelbags for fc in bag.fcurves]
brackets = [bpy.data.objects[f'Orange bracket {i}'] for i in range(3)]
actions = {o.animation_data.action for o in brackets}
def other_motion():
    return [(a.name, [(fc.data_path, fc.array_index, [(tuple(k.co), k.interpolation)
             for k in fc.keyframe_points]) for fc in curves(a)])
            for a in bpy.data.actions if a not in actions]
before = other_motion()
changed = 0
for action in actions:
    for fc in curves(action):
        if fc.data_path != 'scale':
            continue
        for key in fc.keyframe_points:
            assert key.interpolation == 'LINEAR'
            if key.co.y > 1:
                key.co.y = 1
                changed += 1
        fc.update()
        assert all(0 <= k.co.y <= 1 for k in fc.keyframe_points)
assert before == other_motion()
def color(value):
    rgb = [int(value[i:i+2], 16)/255 for i in (0,2,4)]
    return tuple(v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in rgb)+(1,)
for name, value in [('MG pearl grey - no texture','FFFFFF'), ('Clean cool grey','F2E3CF')]:
    mat = bpy.data.materials[name]
    mat.diffuse_color = color(value)
    mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value = color(value)
    for node in mat.node_tree.nodes:
        if node.type == 'EMISSION':
            node.inputs[0].default_value = color(value)
scene.world.node_tree.nodes['Background'].inputs[0].default_value = color('FFFFFF')
assert scene.frame_end == 96 and scene.render.fps == 24
scene.frame_set(42)
scene.render.filepath = str(OUT/'v07-white-still.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'oppein-mg-white-v07.blend'))
bpy.ops.render.render(write_still=True)
(OUT/'look-v07-manifest.json').write_text(json.dumps({
    'palette': {'letters':'FFFFFF','backdrop':'F2E3CF','bracket':'F28B26'},
    'motion':'All non-bracket animation unchanged; bracket scale linear and bounded 0..1',
    'clamped_keys':changed, 'frames':96, 'fps':24,
    'camera':list(scene.camera.location), 'scope':'Local prototype only; V06 preserved'
}, indent=2))
