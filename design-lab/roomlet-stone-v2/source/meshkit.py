"""Editable geometry helpers retained and refactored from SCULPT / 01."""
from __future__ import annotations
import math
import numpy as np
from scipy.spatial.transform import Rotation
PI=math.pi
GEOS=[]; NODES=[]; MATS=[]; MAT={}; CACHE={}
def normals(p,f):
    p=np.asarray(p,float);f=np.asarray(f,int);n=np.zeros_like(p)
    a=np.cross(p[f[:,1]]-p[f[:,0]],p[f[:,2]]-p[f[:,0]])
    for k in range(3): np.add.at(n,f[:,k],a)
    n/=np.maximum(np.linalg.norm(n,axis=1)[:,None],1e-12)
    return n

def addgeo(name,p,f,n=None,uv=None):
    p=np.asarray(p,np.float64); f=np.asarray(f,np.uint32)
    # Remove zero-area pole/cap triangles and unreferenced vertices before export.
    area=np.linalg.norm(np.cross(p[f[:,1]]-p[f[:,0]],p[f[:,2]]-p[f[:,0]]),axis=1)
    f=f[area>1e-12]
    used,remap=np.unique(f.reshape(-1),return_inverse=True)
    f=remap.reshape(-1,3).astype(np.uint32);p=p[used]
    if n is not None:n=np.asarray(n)[used]
    if uv is not None:uv=np.asarray(uv)[used]
    n=np.asarray(normals(p,f) if n is None else n,np.float64)
    lengths=np.linalg.norm(n,axis=1)
    bad=lengths<1e-20
    n[bad]=[0,1,0]
    n/=np.linalg.norm(n,axis=1)[:,None]
    p=p.astype(np.float32);n=n.astype(np.float32)
    if uv is None:
        # Physical-scale triplanar projection, baked as ordinary glTF UVs.
        axes=np.argmax(np.abs(n),axis=1); uv=np.zeros((len(p),2),np.float32)
        for a in range(3):
            k=axes==a
            if a==0: uv[k]=p[k][:,[2,1]]*[.85,.6]
            elif a==1: uv[k]=p[k][:,[0,2]]*[.85,.6]
            else: uv[k]=p[k][:,[0,1]]*[.85,.6]
    gi=len(GEOS);GEOS.append({'name':name,'p':p,'n':n,'uv':np.asarray(uv,np.float32),'f':f})
    return gi

def roundbox(w,h,d,r=.02,s=5):
    key=('rb',w,h,d,r,s)
    if key in CACHE:return CACHE[key]
    r=min(r,min(w,h,d)*.495); half=np.array([w,h,d])/2; core=half-r
    def coords(h):return np.r_[np.linspace(-h,-h+r,s+1),np.linspace(h-r,h,s+1)]
    p=[];n=[];f=[]
    for axis in range(3):
      a,b=[v for v in range(3) if v!=axis]
      for sign in [-1,1]:
        us,vs=coords(half[a]),coords(half[b]);base=len(p)
        for v in vs:
          for u in us:
            pt=np.zeros(3);pt[axis]=sign*half[axis];pt[a]=u;pt[b]=v
            q=np.clip(pt,-core,core);nn=pt-q;nn/=np.linalg.norm(nn)
            p.append(q+nn*r);n.append(nn)
        row=len(us)
        for j in range(len(vs)-1):
          for i in range(row-1):
            x=base+j*row+i
            for tri in [[x,x+1,x+row+1],[x,x+row+1,x+row]]:
              if np.dot(np.cross(np.array(p[tri[1]])-p[tri[0]],np.array(p[tri[2]])-p[tri[0]]),n[tri[0]])<0:tri=tri[::-1]
              f.append(tri)
    g=addgeo(f'RoundedBox_{w:g}_{h:g}_{d:g}',p,f,n);CACHE[key]=g;return g

def lathe(profile,seg=48,name='Lathe'):
    key=('lathe',str(profile),seg)
    if key in CACHE:return CACHE[key]
    p=[];f=[];uv=[]
    for j,(r,y) in enumerate(profile):
      for i in range(seg+1):
        t=i/seg*2*PI;p.append([r*math.cos(t),y,r*math.sin(t)]);uv.append([i/seg,y*.7])
    for j in range(len(profile)-1):
      for i in range(seg):
        k=j*(seg+1)+i;f.extend([[k,k+seg+1,k+1],[k+1,k+seg+1,k+seg+2]])
    g=addgeo(name,p,f,uv=uv);CACHE[key]=g;return g

def cylinder(rt,rb,h,seg=40):
    e=min(.008,h/8,min(rt,rb)/4)
    return lathe([(0,-h/2),(max(rb-e,0),-h/2),(rb,-h/2+e),(rt,h/2-e),(max(rt-e,0),h/2),(0,h/2)],seg,'Turned_Cylinder')

def ellipsoid(a,b,c,nu=32,nv=20,power=1):
    key=('ell',a,b,c,nu,nv,power)
    if key in CACHE:return CACHE[key]
    p=[];f=[]
    def sp(t):return np.sign(t)*abs(t)**power
    for j in range(nv+1):
      v=-PI/2+PI*j/nv
      for i in range(nu+1):
        u=2*PI*i/nu;p.append([a*sp(math.cos(v))*sp(math.cos(u)), b*sp(math.sin(v)), c*sp(math.cos(v))*sp(math.sin(u))])
    for j in range(nv):
      for i in range(nu):
        k=j*(nu+1)+i;f.extend([[k,k+1,k+nu+1],[k+1,k+nu+2,k+nu+1]])
    # Parametric latitudes wind outwards.
    g=addgeo('Soft_Ellipsoid',p,[t[::-1] for t in f]);CACHE[key]=g;return g

def tube(points,r=.008,seg=8,name='Tube'):
    p=[];f=[];pts=np.array(points,float)
    for i,v in enumerate(pts):
      t=pts[min(i+1,len(pts)-1)]-pts[max(0,i-1)];t/=max(np.linalg.norm(t),1e-10)
      ref=np.array([0,1,0]) if abs(t[1])<.9 else np.array([1,0,0]);n=np.cross(t,ref);n/=np.linalg.norm(n);b=np.cross(t,n)
      for j in range(seg):p.append(v+r*(n*math.cos(j/seg*2*PI)+b*math.sin(j/seg*2*PI)))
    for i in range(len(pts)-1):
      for j in range(seg):
        a=i*seg+j;b=i*seg+(j+1)%seg;c=(i+1)*seg+j;d=(i+1)*seg+(j+1)%seg
        f.extend([[a,b,c],[b,d,c]])
    return addgeo(name,p,f)

def cqgeo(name,shape,tol=.035,ang=.13):
    vs,fs=shape.tessellate(tol,ang);p=np.array([[v.x,v.y,v.z] for v in vs]);return addgeo(name,p,fs)

def qrot(e):return Rotation.from_euler('xyz',e).as_quat().tolist()
def node(name,parent=None,geo=None,material=None,pos=(0,0,0),rot=(0,0,0),scale=(1,1,1),label=None,kind=None):
    n={'name':name,'position':list(pos),'rotation':qrot(rot),'scale':list(scale),'children':[]}
    if geo is not None:n.update({'geometry':geo,'material':MAT[material] if isinstance(material,str) else material})
    if label:n['label']=label
    if kind:n['kind']=kind
    i=len(NODES);NODES.append(n)
    if parent is not None:NODES[parent]['children'].append(i)
    return i

def box(name,parent,dims,pos,mat,r=.02,rot=(0,0,0),s=5):return node(name,parent,roundbox(*dims,r,s),mat,pos,rot)
def cyl(name,parent,r,h,pos,mat,rt=None,rot=(0,0,0),scale=(1,1,1)):
    return node(name,parent,cylinder(r if rt is None else rt,r,h),mat,pos,rot,scale)
def ball(name,parent,dim,pos,mat,rot=(0,0,0),power=1):return node(name,parent,ellipsoid(*dim,power=power),mat,pos,rot)
def rod(name,parent,a,b,r,mat):
    a=np.array(a,float);b=np.array(b,float);v=b-a;h=np.linalg.norm(v)
    rot=Rotation.align_vectors([v/h],[[0,1,0]])[0].as_quat().tolist()
    i=node(name,parent,cylinder(r,r,h,24),mat,(a+b)/2);NODES[i]['rotation']=rot;return i
