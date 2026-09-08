"""Build a small allowlisted, reproducible handoff archive; no repo/env/history."""
from pathlib import Path
import zipfile, hashlib, io

root=Path(__file__).resolve().parents[1]
project=root.parents[1]
out=project/'deliverables/roomlet-approved-source-2026-09-06.zip'
out.parent.mkdir(exist_ok=True)
files={}
for folder in ('src','assets','models','source','tests'):
    for p in (root/folder).iterdir():
        if p.is_file() and p.suffix in ('.js','.css','.json','.png','.glb','.step','.py','.txt'):
            if p.name=='package_handoff.py': continue
            files[str(p.relative_to(root))]=p.read_bytes()
for name in ('index.html','preview.html','example.html','minimal-example.html','requirements.txt','LICENSE.txt','THIRD_PARTY_NOTICES.md'):
    files[name]=(root/name).read_bytes()
files['README.md']=(root/'HANDOFF-README.md').read_bytes()
for name in ('motion-validation.json','glb-validation.json'):
    files['docs/'+name]=(root/'docs'/name).read_bytes()
for name in ('roomlet-living-srgb.mp4','roomlet-living-local.jpg'):
    files['exports/'+name]=(project/'app/public/assets/rooms'/name).read_bytes()
for name in ('RoomletStoryMedia.jsx','roomlet-story.css'):
    files['integration/'+name]=(project/'app/src'/name).read_bytes()
# Minimal original asset baseline required by the preservation pass, not the
# whole old delivery (which contains superseded QA and previews).
original=Path('/Users/dracoglasser/Downloads/roomlet-stone-v2-delivery.zip')
baseline=io.BytesIO()
with zipfile.ZipFile(original) as src, zipfile.ZipFile(baseline,'w',zipfile.ZIP_DEFLATED) as dst:
    for name in ('src/scene-data.js','assets/stone-grain.png','assets/oak-soft.png','assets/fabric-soft.png'):
        dst.writestr('roomlet-stone-v2/'+name,src.read('roomlet-stone-v2/'+name))
files['reference/asset-baseline.zip']=baseline.getvalue()
files['SHA256SUMS.txt']=''.join(f'{hashlib.sha256(data).hexdigest()}  {name}\n' for name,data in sorted(files.items())).encode()
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
    for name,data in sorted(files.items()):
        z.writestr('roomlet-approved/'+name,data)
with zipfile.ZipFile(out) as z:
    assert z.testzip() is None
    assert len(z.namelist())==len(files)
print(out, out.stat().st_size, 'bytes;',len(files),'files; ZIP CRC OK')
