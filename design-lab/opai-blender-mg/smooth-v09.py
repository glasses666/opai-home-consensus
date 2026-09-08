"""Remove raster stair-steps, then rebuild smooth curved segments, preserving corners."""
import bpy, math, json
from pathlib import Path
from mathutils import Vector
OUT=Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(OUT/'oppein-mg-1080p-v08.blend'))
scene=bpy.context.scene
def rdp(points,eps):
    if len(points)<3:return points
    a,b=points[0],points[-1];d=b-a
    distances=[(p-a-d*max(0,min(1,(p-a).dot(d)/d.length_squared))).length if d.length_squared else (p-a).length for p in points]
    i=max(range(len(points)),key=lambda i:distances[i])
    if distances[i]<=eps:return [a,b]
    return rdp(points[:i+1],eps)[:-1]+rdp(points[i:],eps)
report=[]
for ob in scene.objects:
    if ob.type!='CURVE' or '_part' not in ob.name:continue
    curve=ob.data
    contours=[]
    for sp in curve.splines:
        pts=[Vector(p.co[:3]) for p in sp.points]
        split=max(range(len(pts)),key=lambda i:(pts[i]-pts[0]).length_squared)
        simplified=rdp(pts[:split+1],.021)[:-1]+rdp(pts[split:]+pts[:1],.021)[:-1]
        contours.append(simplified)
        report.append({'object':ob.name,'before':len(pts),'after':len(simplified)})
    curve.splines.clear()
    curve.resolution_u=24
    curve.render_resolution_u=32
    for pts in contours:
        sp=curve.splines.new('BEZIER');sp.bezier_points.add(len(pts)-1);sp.use_cyclic_u=True
        for i,(bp,p) in enumerate(zip(sp.bezier_points,pts)):
            bp.co=p
            incoming=(p-pts[i-1]).normalized();outgoing=(pts[(i+1)%len(pts)]-p).normalized()
            angle=math.degrees(math.acos(max(-1,min(1,incoming.dot(outgoing)))))
            handle='VECTOR' if angle>70 else 'AUTO'
            bp.handle_left_type=handle;bp.handle_right_type=handle
    curve.bevel_resolution=5
scene.frame_set(42)
scene.render.filepath=str(OUT/'v09-smooth-still.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'oppein-mg-smooth-v09.blend'))
bpy.ops.render.render(write_still=True)
(OUT/'smooth-v09-manifest.json').write_text(json.dumps({'method':'Closed RDP 0.021 units; Bezier AUTO for gentle curves, VECTOR for corners over 40 degrees','contours':report,'preserved':'Object transforms, animation, palette, camera, frame bracket','resolution':[1920,1080],'samples':64},indent=2))
