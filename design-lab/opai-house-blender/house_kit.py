"""Shared procedural scene/material helpers for the video-based V02 builder.

No imported meshes/textures. Metres, complete roof envelope; not the product editor scene.
"""
import bpy
import math
import random
import json
import sys
from pathlib import Path
from mathutils import Vector

OUT = Path(__file__).resolve().parent
random.seed(42)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
root = bpy.data.objects.new('RESIDENCE · complete architectural assembly', None)
scene.collection.objects.link(root)

def mat(name, color, rough=.5, metal=0, noise=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    nt = m.node_tree
    p = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    p.name = 'Principled BSDF'
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    if noise:
        n = nt.nodes.new('ShaderNodeTexNoise')
        n.inputs['Scale'].default_value = 38
        n.inputs['Detail'].default_value = 2
        bump = nt.nodes.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value = noise
        bump.inputs['Distance'].default_value = .025
        nt.links.new(n.outputs['Fac'], bump.inputs['Height'])
        nt.links.new(bump.outputs['Normal'], p.inputs['Normal'])
    return m

stone = mat('Ivory limestone · honed', (.72,.685,.61), .66, noise=.16)
plaster = mat('Warm mineral plaster', (.85,.825,.765), .7, noise=.12)
roofmat = mat('Roof membrane · warm grey', (.49,.49,.445), .85)
tile = mat('Travertine terrace', (.65,.615,.53), .62, noise=.18)
dark = mat('Bronze anodised aluminium', (.09,.078,.057), .29,.7)
wood = mat('Oiled oak', (.34,.205,.093), .4, noise=.13)
fabric = mat('Natural linen', (.72,.69,.595), .92, noise=.3)
clay = mat('Terracotta accent', (.37,.14,.08), .82)
soil = mat('Soil', (.075,.063,.035), .95)
green = [mat('Olive leaves '+str(i), c,.78) for i,c in enumerate([
    (.17,.215,.088),(.23,.28,.12),(.29,.315,.17),(.12,.175,.065)])]
groundmat = mat('Warm seamless background', (.72,.674,.583), .85)
water = mat('Courtyard reflection water', (.11,.25,.245), .12,.12)
water.node_tree.nodes.get('Principled BSDF').inputs['Transmission Weight'].default_value = .38
glass = mat('Low iron glazing · 12mm', (.89,.94,.94), .055)
gp = glass.node_tree.nodes.get('Principled BSDF')
gp.inputs['Transmission Weight'].default_value = 1
gp.inputs['IOR'].default_value = 1.45
glow = mat('Warm concealed strip', (1,.70,.38), .4)
glow.node_tree.nodes.get('Principled BSDF').inputs['Emission Color'].default_value = (1,.64,.28,1)
glow.node_tree.nodes.get('Principled BSDF').inputs['Emission Strength'].default_value = 2.5

# Real stretched grain, not painted board stripes.
nt=wood.node_tree
tex=nt.nodes.new('ShaderNodeTexNoise');tex.inputs['Scale'].default_value=3
coord=nt.nodes.new('ShaderNodeTexCoord');mapping=nt.nodes.new('ShaderNodeVectorMath')
mapping.operation='MULTIPLY';mapping.inputs[1].default_value=(9,9,.32)
nt.links.new(coord.outputs['Generated'],mapping.inputs[0]);nt.links.new(mapping.outputs[0],tex.inputs[0])
ramp=nt.nodes.new('ShaderNodeValToRGB')
ramp.color_ramp.elements[0].color=(.20,.11,.043,1)
ramp.color_ramp.elements[1].color=(.43,.29,.14,1)
nt.links.new(tex.outputs['Fac'],ramp.inputs[0]);nt.links.new(ramp.outputs[0],nt.nodes.get('Principled BSDF').inputs['Base Color'])

def box(name, loc, size, material, bevel=.025):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o=bpy.context.object;o.name=name;o.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(material);o.parent=root
    if bevel:
        mod=o.modifiers.new('Soft manufactured edges','BEVEL');mod.width=bevel;mod.segments=3
        mod=o.modifiers.new('Architectural normals','WEIGHTED_NORMAL')
    return o

def cyl(name, a, b, r, material, vertices=16):
    a,b=Vector(a),Vector(b);d=b-a
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=d.length,location=(a+b)/2)
    o=bpy.context.object;o.name=name;o.rotation_euler=d.to_track_quat('Z','Y').to_euler()
    o.data.materials.append(material);o.parent=root
    for p in o.data.polygons:p.use_smooth=True
    return o

def glazing(name,x,y,z,w,h,side=False):
    # Closed transparent facade with real perimeter frames and separate panes.
    count=max(1,round(w/1.45));step=w/count
    for i in range(count):
        t=-w/2+(i+.5)*step
        box(name+' glass '+str(i),(x if side else x+t,y+t if side else y,z+h/2),
            (.012,step-.055,h-.06) if side else (step-.055,.012,h-.06),glass,.003)
    for i in range(count+1):
        t=-w/2+i*step
        box(name+' mullion '+str(i),(x if side else x+t,y+t if side else y,z+h/2),
            (.075,.055,h) if side else (.055,.075,h),dark,.007)
    for dz in [0,h]:
        box(name+' edge',(x,y,z+dz),(.075,w,.055) if side else (w,.075,.055),dark,.006)

def roof(name,x,y,z,w,d):
    box(name+' structural slab',(x,y,z),(w,d,.24),plaster)
    box(name+' continuous roof',(x,y,z+.14),(w-.28,d-.28,.06),roofmat,.008)
    for yy in [y-d/2+.08,y+d/2-.08]:
        box(name+' parapet',(x,yy,z+.26),(w,.16,.36),stone,.012)
    for xx in [x-w/2+.08,x+w/2-.08]:
        box(name+' parapet',(xx,y,z+.26),(.16,d,.36),stone,.012)

def lounge(x,y,z,turn=0):
    # Softened three-seat sofa; deliberately separate upholstery cushions.
    pieces=[]
    def piece(n,l,s,m,b=.06):pieces.append(box(n,(x+l[0],y+l[1],z+l[2]),s,m,b))
    piece('sofa oak shadow base',(0,0,.22),(2.7,.9,.20),wood)
    piece('sofa back',(0,.35,.70),(2.82,.24,.79),fabric)
    for dx in [-1.34,1.34]:piece('sofa arm',(dx,0,.51),(.18,1.05,.51),fabric)
    for dx in [-.85,0,.85]:piece('linen seat',(dx,-.04,.44),(.82,.75,.22),fabric)
    piece('terracotta cushion',(.72,.20,.83),(.48,.18,.40),clay)
    if turn:
        for o in pieces:
            d=o.location-Vector((x,y,z));c,s=math.cos(turn),math.sin(turn)
            o.location=(x+c*d.x-s*d.y,y+s*d.x+c*d.y,z+d.z);o.rotation_euler.z=turn

def table(x,y,z,r=.7):
    cyl('round oak tabletop',(x,y,z+.42),(x,y,z+.50),r,wood,64)
    cyl('round table pedestal',(x,y,z+.05),(x,y,z+.43),r*.3,stone,32)
    cyl('ceramic vase',(x+.15,y,z+.5),(x+.15,y,z+.72),.08,clay,24)

def area(name,loc,power,size,color,target):
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;data.color=color
    o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);o.location=loc
    o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
    return o
