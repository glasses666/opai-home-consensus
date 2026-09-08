"""Approved stone shell, two linings, rectangular floor with organic apron.
The dense floor grid is reduced to 48 x 40 without changing the rectangular core.
"""
import math
import numpy as np
import cadquery as cq
from scipy.spatial import ConvexHull
from meshkit import *

def build_architecture(arch, ROOT):
    # Broad spherical envelope, still made of individually shaded planar facets.
    # The room cut, rectangular linings, furniture and motion below stay untouched.
    points=[[.03,-2.40,.015]]
    for y in [-2.08,-1.48,-.72,.05,.75,1.48,2.23]:
        ring=math.sqrt(1-((y-1.10)/3.50)**2)
        for i in range(16):
            angle=2*PI*i/16
            irregular=1+.012*math.sin(3*angle+.4)+.008*math.cos(5*angle)
            points.append([.03+3.65*ring*math.cos(angle)*irregular,y,
                           .015+3.30*ring*math.sin(angle)*irregular])
    points=np.array(points);hull=ConvexHull(points)
    faces=[]
    for tri,eq in zip(hull.simplices,hull.equations):
        pts=points[tri]
        if np.dot(np.cross(pts[1]-pts[0],pts[2]-pts[0]),eq[:3])<0:pts=pts[::-1]
        wire=cq.Wire.makePolygon([cq.Vector(*map(float,p)) for p in pts],close=True)
        faces.append(cq.Face.makeFromWires(wire))
    rock=cq.Solid.makeSolid(cq.Shell.makeShell(faces))
    # Remove the complete positive-facing room quadrant above y=0. This opens both
    # front edges AND the top, so no hidden roof or third/fourth wall is generated.
    left,back=-2.205,-1.855
    cut=cq.Workplane('XY').box(20,12,20).translate((left+10,6,back+10)).val()
    rock=rock.cut(cut)
    # Tidy the two end cuts; the main back/bottom contour remains irregular and faceted.
    frontx=cq.Workplane('XY').box(20,12,20).translate((2.29+10,6,0)).val()
    frontz=cq.Workplane('XY').box(20,12,20).translate((0,6,1.97+10)).val()
    rock=rock.cut(frontx).cut(frontz).clean()
    assert rock.isValid(), 'Stone boolean failed'
    # Duplicate vertices per BREP face, preserving true planar normals and sharp facets.
    p=[];n=[];f=[]
    for face in rock.Faces():
        vs,fs=face.tessellate(.01,.1);vs=np.array([[v.x,v.y,v.z] for v in vs]);normal=np.array(face.normalAt().toTuple());offset=len(p)
        for tri in fs:
            tri=list(tri)
            if np.dot(np.cross(vs[tri[1]]-vs[tri[0]],vs[tri[2]]-vs[tri[0]]),normal)<0:tri=tri[::-1]
            f.append([offset+k for k in tri])
        p.extend(vs);n.extend([normal]*len(vs))
    shellgeo=addgeo('Irregular_Carved_Polyhedron',p,f,n)
    node('Shell_Stone_LowPoly',arch,shellgeo,'Stone_Grey',label='不规则棱角石质外壳',kind='shell')
    # Export the actual solid as optional editable CAD geometry as well.
    cq.exporters.export(rock,str(ROOT/'models'/'stone-shell.step'))

    # Three separately modeled rectangular linings. Only these are room walls/floor.
    box('Wall_Left',arch,(.080,2.045,3.76),(-2.158,1.0225,.018),'Wall_Chalk',.018,s=3)
    NODES[-1].update(label='左墙',kind='wall')
    box('Wall_Back',arch,(4.43,2.045,.080),(.015,1.0225,-1.808),'Wall_Chalk',.018,s=3)
    NODES[-1].update(label='后墙',kind='wall')
    box('Floor_Rectangular_Oak',arch,(4.36,.065,3.62),(.03,.0475,.015),'Floor_Light_Oak',.014,s=3)
    NODES[-1].update(label='矩形浅木地板',kind='floor')
    # Preserve the usable rectangular interior; soften only the two exposed edges
    # into a shallow, irregular timber-to-stone apron, not a raised square slab.
    floorgeo=NODES[-1]['geometry']
    fp=[];ff=[];fu=[]
    def smooth(v):
        v=max(0.,min(1.,v));return v*v*(3-2*v)
    nx,nz=48,40
    for j in range(nz+1):
        v=j/nz
        for i in range(nx+1):
            u=i/nx
            ex=.13+(.20+.075*math.sin(v*PI*4+.4))*(1-smooth((v-.8)/.2))
            ez=.13+(.22+.085*math.sin(u*PI*4-1))*(1-smooth((u-.8)/.2))
            x=-2.15+4.36*u+smooth((u-.88)/.12)*ex
            z=-1.795+3.62*v+smooth((v-.88)/.12)*ez
            # Keep the ENTIRE rectangular usable core flat; only the external apron slopes.
            t=max(smooth((x-2.21)/ex),smooth((z-1.825)/ez))
            y=.080*(1-t)-.003*t
            fp.append([x-.03,y-.0475,z-.015]);fu.append([x*.85,z*.6])
    for j in range(nz):
        for i in range(nx):
            a=j*(nx+1)+i;b=a+1;c=a+nx+1;d=c+1
            ff.extend([[a,c,b],[b,c,d]])
    addgeo('Floor_Rectangular_Core_Organic_Edge',fp,ff,uv=fu)
    GEOS[floorgeo]=GEOS.pop()
    # Fine base reveals. Wood grain stays in the texture, avoiding subpixel seams.
    box('Wall_Left_Reveal',arch,(.013,.025,3.68),(-2.113,.103,.017),'Shadow_Reveal',.003,s=2)
    box('Wall_Back_Reveal',arch,(4.31,.025,.013),(.04,.103,-1.762),'Shadow_Reveal',.003,s=2)

    return {"solidValid": rock.isValid(), "planarFaces":len(rock.Faces()), "shellTriangles":len(GEOS[shellgeo]["f"])}
