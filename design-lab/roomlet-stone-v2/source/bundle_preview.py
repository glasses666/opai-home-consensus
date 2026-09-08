#!/usr/bin/env python3
"""Bundle editable HTML/CSS/JS into a standalone offline preview (standard library)."""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
html=(ROOT/'index.html').read_text()
html=html.replace('<link rel="stylesheet" href="src/styles.css">','<style>\n'+(ROOT/'src/styles.css').read_text()+'\n</style>')
for name in ['scene-data','renderer','viewer','exporters','app']:
    text=(ROOT/f'src/{name}.js').read_text().replace('</script','<\\/script')
    html=html.replace(f'<script src="src/{name}.js"></script>','<script>\n'+text+'\n</script>')
(ROOT/'preview.html').write_text(html)
print('Built preview.html:',round(len(html.encode())/1024/1024,2),'MiB')
