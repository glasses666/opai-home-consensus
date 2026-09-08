#!/usr/bin/env python3
"""Check delivered source/bundles plus both real export routes and static import.
Requires Node.js on PATH for JS syntax; Python QA requirements for GLB checks.
"""
from pathlib import Path
import json,re,base64,subprocess,tempfile,struct,copy,sys
import numpy as np
from scipy.spatial.transform import Rotation
import trimesh
from glb_roundtrip import read_glb
ROOT=Path(__file__).resolve().parents[1]
report={'checks':{},'notes':['Syntax and structured-data checks do not replace browser rendering.','Camera output formats differ (matrix versus TRS); compared as matrices with 1e-6 tolerance.']};checks=report['checks']
source=json.loads((ROOT/'src/scene-data.js').read_text().split('window.SCULPT_SCENE=',1)[1].strip().rstrip(';'))
slug=source['meta']['slug']
for name in ['preview.html','embed.html']:
 html=(ROOT/name).read_text()
 assert not re.search(r'<script\b[^>]*\bsrc\s*=',html,re.I)
 assert not re.search(r'<(?:link|img)\b[^>]*(?:href|src)\s*=\s*["\']https?://',html,re.I)
 keys=['scene-data','renderer','viewer','exporters','app'] if name=='preview.html' else ['scene-data','renderer','viewer']
 for key in keys:assert (ROOT/f'src/{key}.js').read_text().replace('</script','<\\/script') in html,(name,key)
 checks[name+'InlineSourcesMatch']=True
for t in source['textures']:
 assert base64.b64decode(t['data'].split(',',1)[1])==(ROOT/t['uri']).read_bytes()
checks['embeddedTexturesEqualPNGAssets']=True
scripts=[(p.name,p.read_text()) for p in (ROOT/'src').glob('*.js')]
for name in ['preview.html','embed.html','integration/example.html']:
 for i,s in enumerate(re.findall(r'<script[^>]*>(.*?)</script>',(ROOT/name).read_text(),re.S)):
  scripts.append((name+f':script{i}',s))
for name,script in scripts:
 with tempfile.NamedTemporaryFile(mode='w',suffix='.js') as f:
  f.write(script);f.flush();r=subprocess.run(['node','--check',f.name],capture_output=True,text=True)
  assert r.returncode==0,(name,r.stderr)
checks['allJavaScriptSyntaxValid']=True;report['syntaxCheckedScripts']=len(scripts)
python_glb=ROOT/'models'/f'{slug}-loop.glb';browser_glb=ROOT/'exports/browser-export-loop.glb'
a=read_glb(python_glb,source);b=read_glb(browser_glb,source)
for k in ['materials','textures','geometries','motion','layouts','root']:assert a[k]==b[k],k
assert a['nodes'][:-1]==b['nodes'][:-1]
checks['browserDownloadedGLBGeometryMaterialsAndAnimationMatchPythonExport']=True

def parse(p):
 raw=p.read_bytes();n=struct.unpack_from('<I',raw,12)[0];return json.loads(raw[20:20+n])
def matrix(n):
 if 'matrix' in n:return np.array(n['matrix'],float).reshape(4,4).T
 m=np.eye(4);m[:3,:3]=Rotation.from_quat(n.get('rotation',[0,0,0,1])).as_matrix()@np.diag(n.get('scale',[1,1,1]));m[:3,3]=n.get('translation',[0,0,0]);return m
pa,pb=parse(python_glb),parse(browser_glb)
ca=next(n for n in pa['nodes'] if 'camera' in n);cb=next(n for n in pb['nodes'] if 'camera' in n)
error=float(np.abs(matrix(ca)-matrix(cb)).max());assert error<1e-6
checks['exportedCameraTransformsEquivalent']=True;report['cameraMaximumElementDifference']=error
counts={}
for path in sorted((ROOT/'models').glob('*.glb')):
 g=parse(path);model=trimesh.load(path,force='scene');world={}
 def walk(i,parent):
  n=g['nodes'][i];world[n['name']]=parent@matrix(n)
  for j in n.get('children',[]):walk(j,world[n['name']])
 for i in g['scenes'][g.get('scene',0)]['nodes']:walk(i,np.eye(4))
 count=0
 for n in g['nodes']:
  if n.get('extras',{}).get('kind')=='furniture':
   m=model.graph.get(n['name'])[0];assert np.allclose(m,world[n['name']],atol=1e-6),n['name'];count+=1
 assert count==5;counts[path.name]=count
checks['independentTrimeshFurnitureWorldTransformsMatch']=True;report['staticTransformChecks']=counts
for required in ['README.md','docs/QA.md','source/build_scene.py','source/motion.py','integration/example.html','models/stone-shell.step']:
 assert (ROOT/required).is_file(),required
checks['documentedCorePathsPresent']=True
report['passed']=all(checks.values())
(ROOT/'docs/delivery-validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report,ensure_ascii=False,indent=2))
