#!/usr/bin/env python3
"""Single-file offline preview + transparent embed, no CDN or build dependencies."""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
html=(ROOT/'index.html').read_text()
html=html.replace('<link rel="stylesheet" href="src/styles.css">','<style>\n'+(ROOT/'src/styles.css').read_text()+'\n</style>')
for name in ['scene-data','renderer','viewer','exporters','app']:
 js=(ROOT/f'src/{name}.js').read_text().replace('</script','<\\/script')
 html=html.replace(f'<script src="src/{name}.js"></script>','<script>\n'+js+'\n</script>')
(ROOT/'preview.html').write_text(html)
embed='''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ROOMLET · transparent embed</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}canvas{width:100%;height:100%;display:block;touch-action:none;outline:none}#error{position:fixed;bottom:8px;left:12px;color:#ddd;font:12px sans-serif}</style></head><body><canvas id="room" tabindex="0" aria-label="动态房间。拖动旋转，双指缩放，空格暂停，0 恢复视角"></canvas><p id="error"></p>'''
for name in ['scene-data','renderer','viewer']:
 embed+='<script>'+ (ROOT/f'src/{name}.js').read_text().replace('</script','<\\/script')+'</script>'
embed+='''<script>
try {
 const q=new URLSearchParams(location.search);window.roomlet=new RoomletViewer(document.getElementById('room'),SCULPT_SCENE,{autoplay:q.get('autoplay')!=='0',pixelRatio:1,parallax:q.get('parallax')!=='0'});
 roomlet.onReady=()=>{window.ROOMLET_READY=true;if(q.has('time'))roomlet.seek(Number(q.get('time')));};
 roomlet.onError=e=>{document.getElementById('error').textContent=e.message;};
 let visible=true;const io=new IntersectionObserver(es=>{visible=es[0].isIntersecting;roomlet.hidden=!visible||document.hidden;roomlet.lastNow=null;});io.observe(document.getElementById('room'));
 document.addEventListener('visibilitychange',()=>{roomlet.hidden=!visible||document.hidden;roomlet.lastNow=null;});
 window.addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==parent)return;const m=e.data;if(!m||m.type!=='roomlet')return;if(m.action==='pause')roomlet.setPlaying(false);if(m.action==='play')roomlet.setPlaying(true);if(m.action==='seek'&&Number.isFinite(m.time))roomlet.seek(m.time);if(m.action==='reset')roomlet.resetView();});
 window.RoomletPreview={play:()=>roomlet.setPlaying(true),pause:()=>roomlet.setPlaying(false),seek:t=>roomlet.seek(t),resetView:()=>roomlet.resetView()};
}catch(e){document.getElementById('error').textContent=e.message;}
</script></body></html>'''
(ROOT/'embed.html').write_text(embed)
print('Built single-file preview / transparent embed:',ROOT.name,round(len(html)/1024/1024,2),'MB')
