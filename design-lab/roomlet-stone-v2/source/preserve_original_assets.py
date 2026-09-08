"""Keep the newly built shell while restoring every other delivered scene asset.

Run after build_scene.py with the original delivery ZIP as the only argument.
Avoids dependency-version rounding and procedural texture differences.
"""
import json, sys, zipfile
from pathlib import Path
from glb_export import export_glb

root = Path(__file__).resolve().parents[1]
def parse(text):
    return json.loads(text.split('window.SCULPT_SCENE=', 1)[1].strip().rstrip(';'))

path = root / 'src/scene-data.js'
current = parse(path.read_text())
with zipfile.ZipFile(sys.argv[1]) as archive:
    original = parse(archive.read('roomlet-stone-v2/src/scene-data.js').decode())
    for texture in original['textures']:
        uri = texture['uri']
        (root / uri).write_bytes(archive.read('roomlet-stone-v2/' + uri))
original['geometries'][0] = current['geometries'][0]
floor_id=next(n['geometry'] for n in original['nodes'] if n['name']=='Floor_Rectangular_Oak')
original['geometries'][floor_id] = current['geometries'][floor_id]
original['meta']['shell'] = current['meta']['shell']
original['motion'] = current['motion']
path.write_text('/* Shell revised locally; remaining assets preserved from Pro delivery. */\nwindow.SCULPT_SCENE=' + json.dumps(original, separators=(',', ':'), ensure_ascii=False) + ';\n')
(root/'assets/scene-manifest.json').write_text(json.dumps({k: original[k] for k in ['meta','nodes','materials']}, ensure_ascii=False, indent=2))
for filename, state, animated in [('roomlet-original.glb','original',False),('roomlet-modified.glb','modified',False),('roomlet-loop.glb','original',True)]:
    (root/'models'/filename).write_bytes(export_glb(original,state,animated))
print('Preserved original furniture, textures and camera; applied local shell, floor and motion revisions.')
