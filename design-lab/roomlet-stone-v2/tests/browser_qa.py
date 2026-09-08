#!/usr/bin/env python3
"""Offline browser interaction/regression checks and requested sample captures.
Browser plugin absent in the creation environment; Playwright is the fallback.
CHROMIUM can override the executable. Linux can use DISPLAY=:99 with Xvfb.
"""
from pathlib import Path
import base64,json,os,shutil,time,tempfile
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
EXPORT_PATH=Path(tempfile.gettempdir())/'roomlet-browser-export.glb'
REPORT={'method':'Playwright + Chromium, owned HTML loaded in memory, offline context; file URL navigation blocked by environment administrator' ,'browserPlugin':'not available','errors':[],'checks':{}}
def launch(p):
 return p.chromium.launch(executable_path=os.environ.get('CHROMIUM') or shutil.which('chromium'),headless=not bool(os.environ.get('DISPLAY')),args=['--no-sandbox','--ignore-gpu-blocklist','--disable-dev-shm-usage'],timeout=20000)
def load_owned(page,name):
 html=(ROOT/name).read_text()
 html=html.replace('<link rel="stylesheet" href="src/styles.css">','<style>'+ (ROOT/'src/styles.css').read_text()+'</style>')
 for script in ['scene-data','renderer','viewer','exporters','app']:
  html=html.replace(f'<script src="src/{script}.js"></script>','<script>'+ (ROOT/f'src/{script}.js').read_text()+'</script>')
 page.set_content(html,wait_until='load',timeout=30000)
def saveblob(page,expression,path):
 data=page.evaluate('(async()=>{const b='+expression+';return await new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result.split(",")[1]);f.readAsDataURL(b);});})()')
 Path(path).write_bytes(base64.b64decode(data))
with sync_playwright() as p:
 b=launch(p);ctx=b.new_context(viewport={'width':1440,'height':1000},device_scale_factor=1,offline=True,has_touch=True)
 page=ctx.new_page();page.set_default_timeout(10000);requests=[]
 page.on('pageerror',lambda e:REPORT['errors'].append(str(e)))
 page.on('console',lambda m:REPORT['errors'].append(m.text) if m.type=='error' else None)
 page.on('request',lambda r:requests.append(r.url) if r.url.startswith(('http://','https://')) else None)
 load_owned(page,'preview.html')
 page.wait_for_function('window.ROOMLET_READY===true',timeout=30000)
 REPORT['checks']['pageIdentity']={'title':page.title(),'entry':'preview.html (in-memory HTML, about:blank)' }
 REPORT['checks']['meaningfulContent']=page.locator('h1').inner_text()=='一块石头，两种日常。'
 REPORT['checks']['autoplay']=page.evaluate('roomlet.playing')
 page.locator('#play-toggle').click();t0=page.evaluate('roomlet.time');page.wait_for_timeout(550);t1=page.evaluate('roomlet.time')
 REPORT['checks']['pauseFreezesTime']=t0==t1
 page.locator('#play-toggle').click();page.wait_for_timeout(700)
 REPORT['checks']['resumeAdvancesTime']=page.evaluate('roomlet.time')>t1
 page.evaluate('roomlet.seek(0)')
 fixed_before=page.evaluate('roomlet.renderer.nodes.filter(n=>n.kind!=="furniture").map(n=>[n.name,n.position,n.rotation,n.scale])')
 for name,t in [('original',0),('flight',3.9),('modified',8.2)]:
  page.evaluate('(t)=>roomlet.seek(t)',t)
  if not (ROOT/f'samples/{name}-transparent.png').exists():saveblob(page,'await roomlet.exportPNG(1600,1600)',ROOT/f'samples/{name}-transparent.png')
  print('Captured',name,flush=True)
 fixed_after=page.evaluate('roomlet.renderer.nodes.filter(n=>n.kind!=="furniture").map(n=>[n.name,n.position,n.rotation,n.scale])')
 REPORT['checks']['architectureUnchanged']=fixed_before==fixed_after
 page.evaluate('roomlet.seek(0)');page.wait_for_timeout(250)
 page.screenshot(path=str(ROOT/'samples/preview-desktop.png'),timeout=30000)
 print('QA before-drag',flush=True)
 before=page.evaluate('({...roomlet.renderer.orbit})')
 rect=page.locator('#room').bounding_box();x=rect['x']+rect['width']*.48;y=rect['y']+rect['height']*.55
 page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+170,y+48,steps=12);page.mouse.up();page.wait_for_timeout(400)
 print('QA after-drag',flush=True)
 after=page.evaluate('({...roomlet.renderer.orbit})')
 REPORT['checks']['dragRotates']=abs(before['yaw']-after['yaw'])>.4
 print('QA wheel',flush=True)
 page.mouse.wheel(0,-260);page.wait_for_timeout(300)
 REPORT['checks']['wheelZooms']=page.evaluate('roomlet.renderer.orbit.zoom')>after['zoom']
 print('QA reset',flush=True)
 page.locator('#reset-view').click();page.wait_for_timeout(850)
 REPORT['checks']['resetView']=page.evaluate('Object.keys(roomlet.renderer.defaultOrbit).every(k=>Math.abs(roomlet.renderer.orbit[k]-roomlet.renderer.defaultOrbit[k])<1e-5)')
 print('QA speed',flush=True)
 page.locator('#speed-toggle').click();REPORT['checks']['speedControl']=page.evaluate('roomlet.speed')==1.25
 print('QA objects',flush=True)
 page.locator('#objects-toggle').click();page.locator('[data-object="Furniture_Sofa"]').click();REPORT['checks']['namedObjectSelection']=page.evaluate('roomlet.renderer.nodes[roomlet.renderer.selected].name')=='Furniture_Sofa';page.locator('[data-object="Furniture_Sofa"]').click();page.locator('#objects-close').click()
 print('QA background',flush=True)
 page.locator('#background-toggle').click();REPORT['checks']['checkerToggle']=page.locator('#stage').evaluate('(e)=>e.classList.contains("checker")');page.locator('#background-toggle').click()
 print('QA export',flush=True)
 page.locator('#export-toggle').click()
 with page.expect_download(timeout=15000) as download:
  page.locator('[data-export="loop"]').click()
 dl=download.value;dl.save_as(str(EXPORT_PATH))
 REPORT['checks']['animatedExportDownload']=dl.suggested_filename=='roomlet-loop.glb' and EXPORT_PATH.stat().st_size>1000000
 REPORT['checks']['desktopWebGLError']=page.evaluate('roomlet.renderer.gl.getError()')
 print('QA mobile',flush=True)
 page.set_viewport_size({'width':390,'height':844});page.evaluate('roomlet.seek(8.2)');page.wait_for_timeout(3000)
 page.screenshot(path=str(ROOT/'samples/preview-mobile.png'),timeout=30000)
 REPORT['checks']['mobileOverflow']=page.evaluate('document.documentElement.scrollWidth>innerWidth')
 REPORT['checks']['mobileControlVisible']=page.locator('#play-toggle').is_visible() and page.locator('#reset-view').is_visible()
 print('QA pinch',flush=True)
 pinch_before=page.evaluate('roomlet.renderer.orbit.zoom');cdp=ctx.new_cdp_session(page)
 cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':130,'y':380,'id':1},{'x':240,'y':380,'id':2}]})
 cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':95,'y':380,'id':1},{'x':275,'y':380,'id':2}]})
 cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});page.wait_for_timeout(200)
 REPORT['checks']['pinchZooms']=page.evaluate('roomlet.renderer.orbit.zoom')>pinch_before+.2
 print('QA reset',flush=True)
 page.locator('#reset-view').click();page.wait_for_timeout(650)
 REPORT['checks']['mobileWebGLError']=page.evaluate('roomlet.renderer.gl.getError()')
 print('Main interactions verified',flush=True)
 page.evaluate('roomlet.setPlaying(false)');cdp.detach()
 (ROOT/'docs/browser-qa.json').write_text(json.dumps(REPORT,ensure_ascii=False,indent=2))
 REPORT['checks']['externalNetworkRequests']=requests
 REPORT['checks']['viewports']=['1440 × 1000','390 × 844']
 page.evaluate('roomlet.dispose()');b.close()
REPORT['untested']=['physical iPhone/iPad','Safari/WebKit','Firefox','hardware GPU performance across devices']
(ROOT/'docs/browser-qa.json').write_text(json.dumps(REPORT,ensure_ascii=False,indent=2))
print(json.dumps(REPORT,ensure_ascii=False,indent=2))
assert not REPORT['errors'] and not REPORT['checks']['mobileOverflow'] and not REPORT['checks']['externalNetworkRequests']
for key in ['autoplay','pauseFreezesTime','resumeAdvancesTime','architectureUnchanged','dragRotates','wheelZooms','resetView','speedControl','namedObjectSelection','checkerToggle','animatedExportDownload','mobileControlVisible','pinchZooms']:assert REPORT['checks'][key],key
