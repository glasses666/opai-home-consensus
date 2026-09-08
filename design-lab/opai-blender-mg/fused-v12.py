"""Bake unioned stroke surfaces for every frame; bevel only the union exterior."""
import bpy, bmesh, math, json
from pathlib import Path
from mathutils import Matrix, Vector
OUT=Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(OUT/'oppein-mg-smooth-v10.blend'))
scene=bpy.context.scene
sources=[o for o in scene.objects if o.type=='CURVE' and '_part' in o.name]
templates={}
for o in sources:
    o.data.bevel_depth=0
    scene.frame_set(42)
    dg=bpy.context.evaluated_depsgraph_get()
    templates[o.name]=bpy.data.meshes.new_from_object(o.evaluated_get(dg))
    o.hide_render=True;o.hide_viewport=True
cache={};frame_objects={};counts=[]
def animated_scale(ob,frame):
    action=ob.animation_data.action
    return next(fc for l in action.layers for st in l.strips for bag in st.channelbags for fc in bag.fcurves if fc.data_path=='scale' and fc.array_index==0).evaluate(frame)
for frame in range(1,97):
    scene.frame_set(frame)
    current=[]
    for li in range(6):
        parts=sorted([o for o in sources if o.name.startswith(f'{li}_')],key=lambda o:o.name)
        key=(li,tuple(float(animated_scale(o,frame)) for o in parts))
        if key in cache:
            if cache[key]:current.append(cache[key])
            continue
        active=[]
        for part in parts:
            scale=float(animated_scale(part,frame))
            if scale<.0001:continue
            mesh=templates[part.name].copy()
            ob=bpy.data.objects.new(f'Fused_{li}_{frame}_work',mesh)
            scene.collection.objects.link(ob)
            # All moving front faces share the same plane: no internal depth steps.
            matrix=part.parent.matrix_world @ Matrix.Translation(part.location) @ part.rotation_euler.to_matrix().to_4x4() @ Matrix.Diagonal((scale*1.012,scale*1.012,1,1))
            mesh.transform(matrix)
            active.append(ob)
        if not active:cache[key]=None;continue
        result=active[0]
        for other in active[1:]:
            bpy.context.view_layer.objects.active=result
            mod=result.modifiers.new('Union touching strokes','BOOLEAN');mod.operation='UNION';mod.solver='EXACT';mod.object=other
            bpy.context.view_layer.update()
            bpy.ops.object.modifier_apply(modifier=mod.name)
            bpy.data.objects.remove(other,do_unlink=True)
        bm=bmesh.new();bm.from_mesh(result.data)
        bmesh.ops.dissolve_limit(bm,angle_limit=.001,verts=list(bm.verts),edges=list(bm.edges),use_dissolve_boundaries=False)
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
        bm.to_mesh(result.data);bm.free()
        result.name=f'Fused_{li}_frame{frame:03d}'
        result.data.materials.clear();result.data.materials.append(bpy.data.materials['MG pearl grey - no texture'])
        bevel=result.modifiers.new('Exterior bevel only','BEVEL');bevel.width=.004;bevel.segments=3;bevel.limit_method='ANGLE';bevel.angle_limit=.4
        result.hide_render=True;result.hide_viewport=True
        cache[key]=result;current.append(result)
    frame_objects[frame]=current
    print('BAKED',frame,flush=True)
objects=set(o for o in cache.values() if o)
for ob in objects:
    for frame in range(1,97):
        visible=ob in frame_objects[frame]
        ob.hide_render=not visible;ob.hide_viewport=not visible
        ob.keyframe_insert('hide_render',frame=frame);ob.keyframe_insert('hide_viewport',frame=frame)
scene.frame_set(20)
scene.render.filepath=str(OUT/'v12-rebound-check.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'oppein-mg-fused-v12.blend'))
bpy.ops.render.render(write_still=True)
(OUT/'fused-v12-manifest.json').write_text(json.dumps({'method':'Per-frame exact union, common front plane, coplanar dissolve, exterior-only bevel','frames':96,'fps':24,'unique_letter_states':len(objects),'preserved':'Stroke XY elastic scale and timing, positions, colors, lights, camera','changed':'Depth stays constant during growth; no hold-only mesh switching','resolution':[1920,1080],'samples':64},indent=2))
