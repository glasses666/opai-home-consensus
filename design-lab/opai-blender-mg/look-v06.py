"""Warm MG lighting and slightly elevated right camera; V05 motion locked."""
import bpy, json
from pathlib import Path
from mathutils import Vector
OUT=Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(OUT/'oppein-mg-elastic-v05.blend'))
scene=bpy.context.scene
def signature():
    return [(a.name,[(fc.data_path,fc.array_index,[(tuple(k.co),k.interpolation) for k in fc.keyframe_points]) for l in a.layers for s in l.strips for bag in s.channelbags for fc in bag.fcurves]) for a in bpy.data.actions]
motion=signature()
def color(hexcode):
    rgb=[int(hexcode[i:i+2],16)/255 for i in (0,2,4)]
    return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb)+(1,)
def surface(name,hexcode,rough=.4):
    m=bpy.data.materials[name];bs=m.node_tree.nodes.get('Principled BSDF')
    m.diffuse_color=color(hexcode);bs.inputs['Base Color'].default_value=color(hexcode)
    bs.inputs['Roughness'].default_value=rough
    bs.inputs['Metallic'].default_value=0
    return m,bs
surface('MG pearl grey - no texture','E4C79D',.34)
surface('Brand orange','F28B26',.29)
m,bs=surface('Clean cool grey','F3EEE6',1)
bs.inputs['Specular IOR Level'].default_value=0
# Camera-facing constant warm backdrop plus physical diffuse for short contact shadows.
nodes=m.node_tree.nodes;links=m.node_tree.links
em=nodes.new('ShaderNodeEmission');em.inputs[0].default_value=color('F3EEE6');em.inputs[1].default_value=.9
mix=nodes.new('ShaderNodeMixShader');mix.inputs[0].default_value=.55
links.new(bs.outputs[0],mix.inputs[1]);links.new(em.outputs[0],mix.inputs[2]);links.new(mix.outputs[0],nodes.get('Material Output').inputs[0])
scene.world.node_tree.nodes['Background'].inputs[0].default_value=color('FFF5E8')
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.45
def aim(ob,target):ob.rotation_euler=(Vector(target)-ob.location).to_track_quat('-Z','Y').to_euler()
for name,loc,power,size in [('Key',(-6,-8,12),1600,7),('Fill',(7,-2,9),650,6)]:
    ob=bpy.data.objects[name];ob.location=loc;ob.data.energy=power;ob.data.size=size;ob.data.color=(1,1,1);aim(ob,(0,0,.5))
cam=scene.camera;cam.location=(3.4,-10,5.2);aim(cam,(0,0,.55));cam.data.clip_end=1000
cam.data.ortho_scale=15.5
plane=next(o for o in scene.objects if o.type=='MESH' and not o.parent)
plane.scale=(10,10,10)
scene.cycles.samples=24
scene.view_settings.view_transform='Standard'
scene.view_settings.look='None'
scene.frame_set(42)
assert signature()==motion
assert scene.frame_end==96 and scene.render.fps==24
scene.render.filepath=str(OUT/'v06-warm-still.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'oppein-mg-warm-v06.blend'))
bpy.ops.render.render(write_still=True)
(OUT/'look-v06-manifest.json').write_text(json.dumps({'motion':'exact keyframe signature unchanged from V05','frames':96,'fps':24,'camera':list(cam.location),'ortho_scale':cam.data.ortho_scale,'palette':{'backdrop':'F3EEE6','letters':'E4C79D','bracket':'F28B26'},'samples':24,'scope':'lighting, materials and camera only; no production changes'},indent=2))
