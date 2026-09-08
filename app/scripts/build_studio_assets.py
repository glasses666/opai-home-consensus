"""Rebuild local furniture with restrained textile/oak detail. Originals untouched.
Blender --background --python scripts/build_studio_assets.py
"""
from pathlib import Path
import math
import bpy
import numpy as np

HERE = Path(__file__).resolve().parent
source = (HERE / 'build_demo_assets.py').read_text()
# Reuse the original constructors, never execute their exporting entrypoint.
kit = {'__file__': str(HERE / 'build_demo_assets.py')}
exec(compile(source.split('requested_assets =')[0], str(HERE / 'build_demo_assets.py'), 'exec'), kit)
kit['OUTPUT'] = HERE.parent / 'public/assets/models/studio'
kit['TOP_VIEW_ASSETS'] = set()

def texture_material(mat, color, kind):
    size = 256
    y, x = np.mgrid[0:size, 0:size]
    rng = np.random.default_rng(12)
    if kind == 'oak':
        grain = np.sin(x*.34 + np.sin(y*.045)*1.8) * .035 + np.sin(x*1.7)*.012
        noise = grain + rng.normal(0,.008,(size,size))
    else:
        noise = ((x%4<2).astype(float)+(y%4<2).astype(float)-1)*.025 + rng.normal(0,.006,(size,size))
    # Small-scale albedo detail stays subtle; textures are packed into each GLB.
    pixels = np.ones((size,size,4),dtype=np.float32)
    pixels[:,:,:3] = np.clip(np.array(color)[None,None,:] * (1+noise[:,:,None]),0,1)
    im = bpy.data.images.new(mat.name+' surface',width=size,height=size)
    im.pixels.foreach_set(pixels.ravel())
    im.pack()
    shader = next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    shader.inputs['Base Color'].default_value = (1,1,1,1)
    shader.inputs['Roughness'].default_value = .68 if kind=='oak' else .94
    tex = mat.node_tree.nodes.new('ShaderNodeTexImage'); tex.image=im
    mat.node_tree.links.new(tex.outputs['Color'],shader.inputs['Base Color'])

texture_material(kit['IVORY'],(.77,.75,.69),'fabric')
texture_material(kit['OAT'],(.58,.56,.50),'fabric')
texture_material(kit['TAUPE'],(.29,.32,.28),'fabric')
texture_material(kit['OAK'],(.55,.45,.33),'oak')
texture_material(kit['BURGUNDY'],(.28,.34,.29),'fabric')
texture_material(kit['DUSTY_ROSE'],(.38,.43,.36),'fabric')

original_sofa = kit['sofa']
def sofa():
    original_sofa()
    for x,mat,angle in [(-.73,kit['DUSTY_ROSE'],-12),(.72,kit['OAT'],10)]:
        kit['box']('ACCENT loose linen cushion',(.34,.17,.31),(x,.07,.65),mat,.07,rotation=(math.radians(-12),0,math.radians(angle)),role='accent',smooth=True)

original_bed = kit['bed']
def bed(width,depth,height,single=False):
    original_bed(width,depth,height,single)
    kit['box']('ACCENT soft duvet',(width*.89,depth*.59,.105),(0,-depth*.16,.575),kit['WHITE'],.07,role='accent',smooth=True)
    kit['box']('ACCENT folded sage blanket',(width*.91,.40,.065),(0,-depth*.30,.65),kit['DUSTY_ROSE'],.035,role='accent',smooth=True)

original_coffee = kit['coffee_table']
def coffee():
    original_coffee()
    kit['box']('ACCENT bound book',(.25,.19,.03),(-.24,-.05,.45),kit['IVORY'],.006,role='accent')
    kit['box']('ACCENT book cover',(.25,.19,.008),(-.24,-.05,.47),kit['TAUPE'],.004,role='accent')

builders = dict(kit['ASSETS'])
builders.update({'sofa':sofa,'double-bed':lambda:bed(1.8,2,1.05),'single-bed':lambda:bed(1.2,2,.9,True),'coffee-table':coffee})
for name,builder in builders.items():
    kit['normalize_and_export'](name,builder)
print('Studio assets complete: originals preserved',flush=True)
