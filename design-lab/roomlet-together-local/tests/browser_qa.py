#!/usr/bin/env python3
"""Offline Playwright QA for the delivered bytes, plus actual-GLB visual round trip.
Browser plugin not available in the creation session; Playwright is the fallback.
Use CHROMIUM=/path/to/chrome. This host needs DISPLAY=:99 (Xvfb) for WebGL2.
The flow under test: delivered preview loads -> controls alter state -> expected
rendered result and matching GLB buffers / pixels with a transparent canvas.
"""
from pathlib import Path
import os,json,base64,io,sys,math,tempfile,subprocess
from PIL import Image,ImageChops,ImageStat
import numpy as np
from playwright.sync_api import sync_playwright
from glb_roundtrip import read_glb
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'exports';OUT.mkdir(exist_ok=True)
if '--core' not in sys.argv:
 subprocess.run([sys.executable,__file__,'--core'],check=True)
 subprocess.run([sys.executable,str(ROOT/'tests/browser_qa_supplemental.py')],check=True)
 raise SystemExit(0)
REPORT={'browserPlugin':'not available','method':'Playwright + Chromium. Shipped single-file HTML loaded with set_content in an offline browser context. The host blocks all URL navigation, including file://; this is not a verified double-click/file-protocol test.','fileProtocolTest':{'status':'not verified','reason':'Direct navigation attempted: net::ERR_BLOCKED_BY_ADMINISTRATOR.'},'errors':[],'checks':{},'untested':['Safari/WebKit','Firefox','physical Mac/iPhone/iPad','hardware GPU performance or three simultaneous viewers','production website integration','Blender or other DCC animation playback','Khronos Validator (not installed; outbound package downloads unavailable)']}
checks=REPORT['checks']
def checkpoint(label):
 REPORT['lastCompletedStage']=label
 (ROOT/'docs/browser-qa.json').write_text(json.dumps(REPORT,indent=2,ensure_ascii=False))
 print(label,flush=True)
def attach_observers(page,requests):
 page.set_default_timeout(12000)
 page.on('pageerror',lambda e:REPORT['errors'].append(str(e)))
 page.on('console',lambda m:REPORT['errors'].append(m.text) if m.type=='error' else None)
 page.on('request',lambda r:requests.append(r.url) if r.url.startswith(('http:','https:')) else None)

def save_blob(page,expr,path):
 d=page.evaluate('(async()=>{const b='+expr+';return await new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result.split(",")[1]);f.readAsDataURL(b);});})()')
 Path(path).write_bytes(base64.b64decode(d));return Image.open(path).convert('RGBA') if str(path).endswith('.png') else None

def capture(page,t,path,size=640):
 page.evaluate('(t)=>roomlet.seek(t)',t)
 return save_blob(page,f'await roomlet.exportPNG({size},{size})',path)

def load_owned(page,filename='preview.html',scene=None):
 page.evaluate('window.ROOMLET_READY=false;window.roomlet=undefined')
 html=(ROOT/filename).read_text()
 if scene is not None:
  # Use the actual delivered UI/renderer but replace ONLY scene-data with GLB-decoded data.
  html=(ROOT/'index.html').read_text().replace('<link rel="stylesheet" href="src/styles.css">','<style>'+(ROOT/'src/styles.css').read_text()+'</style>')
  for name in ['scene-data','renderer','viewer','exporters','app']:
   js=('window.SCULPT_SCENE='+json.dumps(scene,separators=(',',':'),ensure_ascii=False)+';') if name=='scene-data' else (ROOT/f'src/{name}.js').read_text()
   html=html.replace(f'<script src="src/{name}.js"></script>','<script>'+js.replace('</script','<\\/script')+'</script>')
 page.set_content(html,wait_until='load',timeout=60000);page.wait_for_function('window.ROOMLET_READY===true',timeout=60000)

with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),headless=not bool(os.environ.get('DISPLAY')),args=['--no-sandbox','--ignore-gpu-blocklist','--disable-dev-shm-usage'],timeout=20000)
 REPORT['browserVersion']=browser.version
 context=browser.new_context(viewport={'width':1360,'height':900},device_scale_factor=1,offline=True,has_touch=True)
 page=context.new_page();page.set_default_timeout(12000);requests=[]
 page.on('pageerror',lambda e:REPORT['errors'].append(str(e)))
 page.on('console',lambda m:REPORT['errors'].append(m.text) if m.type=='error' else None)
 page.on('request',lambda r:requests.append(r.url) if r.url.startswith(('http:','https:')) else None)
 load_owned(page)
 checkpoint('UI loaded')
 checks['titleAndMeaningfulContent']=page.title().startswith('ROOMLET') and bool(page.locator('h1').inner_text())
 REPORT['renderer']=page.evaluate('(()=>{const gl=roomlet.renderer.gl,ex=gl.getExtension("WEBGL_debug_renderer_info");return gl.getParameter(ex.UNMASKED_RENDERER_WEBGL);})()')
 checks['autoplay']=page.evaluate('roomlet.playing')
 page.locator('#play-toggle').click();t0=page.evaluate('roomlet.time');page.wait_for_timeout(300);checks['pauseFreezesTime']=page.evaluate('roomlet.time')==t0
 page.locator('#play-toggle').click();page.wait_for_function('(t)=>roomlet.time>t+.025',arg=t0,timeout=12000);checks['resumeAdvancesTime']=True
 page.locator('#layout-b').click();checks['layoutB']=page.evaluate('roomlet.time===9&&!roomlet.playing')
 page.locator('#layout-a').click();checks['layoutA']=page.evaluate('roomlet.time===0&&!roomlet.playing')
 before=page.evaluate('roomlet.renderer.nodes.filter(n=>n.kind!=="furniture").map(n=>[n.name,n.position,n.rotation,n.scale])')
 source_images={}
 for name,t in [('original',0),('transition',4),('modified',9),('loop-end',18)]:
  source_images[t]=capture(page,t,OUT/(name+'-transparent.png'),800 if t in [0,9] else 640)
 after=page.evaluate('roomlet.renderer.nodes.filter(n=>n.kind!=="furniture").map(n=>[n.name,n.position,n.rotation,n.scale])')
 checks['architectureAndSubpartsUnchanged']=before==after
 # Same-size deterministic frame tests, before changing any orbit setting.
 for t in [0,2.5,4.75,6.6,9,12.6,16.9,18]:
  source_images[t]=capture(page,t,OUT/f'qa-source-{t:g}.png',400)
 checks['loopPixelsIdentical']=np.array_equal(np.array(source_images[0]),np.array(source_images[18]))
 alpha=np.array(source_images[0])[:,:,3]
 checks['transparentAlpha']=bool(alpha[0,0]==0 and alpha[-1,-1]==0 and .2<float((alpha>0).mean())<.85)
 REPORT['alphaCoverage']=float((alpha>0).mean())
 page.evaluate('roomlet.seek(0)');page.wait_for_timeout(150);page.screenshot(path=str(OUT/'preview-desktop.png'),timeout=30000)
 checkpoint('Source screenshots completed')
 a=page.evaluate('({...roomlet.renderer.orbit})');r=page.locator('#room').bounding_box();x=r['x']+r['width']*.52;y=r['y']+r['height']*.55
 page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+115,y+27,steps=6);page.mouse.up();page.wait_for_timeout(200)
 b=page.evaluate('({...roomlet.renderer.orbit})');checks['dragRotates']=abs(a['yaw']-b['yaw'])>.3
 page.mouse.wheel(0,-220);page.wait_for_timeout(200);checks['wheelZooms']=page.evaluate('roomlet.renderer.orbit.zoom')>b['zoom']
 page.locator('#reset-view').click();page.wait_for_function('Object.keys(roomlet.renderer.defaultOrbit).every(k=>Math.abs(roomlet.renderer.orbit[k]-roomlet.renderer.defaultOrbit[k])<1e-5)',timeout=12000);checks['restoreDefaultView']=True
 page.locator('#zoom-in').click();zoom=page.evaluate('roomlet.renderer.orbit.zoom');page.locator('#zoom-out').click();checks['zoomButtons']=zoom>1 and abs(page.evaluate('roomlet.renderer.orbit.zoom')-1)<1e-5
 page.locator('#top-view').click();checks['topView']=page.evaluate('Math.abs(roomlet.renderer.orbit.pitch-1.34)<1e-5');page.evaluate('roomlet.resetView(false)')
 page.locator('#speed-toggle').click();checks['speedChanges']=page.evaluate('roomlet.speed===1.25');page.evaluate('roomlet.setSpeed(1)')
 page.evaluate('roomlet.seek(4.5)');drift=page.evaluate('roomlet.renderer.cameraDrift');page.locator('#parallax-toggle').click();checks['parallaxToggle']=abs(drift)>0.01 and page.evaluate('roomlet.renderer.cameraDrift')==0;page.locator('#parallax-toggle').click()
 page.locator('#background-toggle').click();checks['checkerboardToggle']=page.locator('#stage').evaluate('(e)=>e.classList.contains("checker")');page.locator('#background-toggle').click()
 page.locator('#objects-toggle').click();first=page.locator('.object-row').first;name=first.get_attribute('data-object');first.click();checks['independentObjectSelection']=page.evaluate('roomlet.renderer.nodes[roomlet.renderer.selected].name')==name
 page.locator('#edit-x').fill('0.123');page.locator('#apply-edit').click();checks['editablePosition']=abs(page.evaluate('(n)=>roomlet.renderer.nodes.find(x=>x.name===n).position[0]',name)-.123)<1e-5
 page.locator('#objects-close').click();page.locator('#replay').click();page.wait_for_function('roomlet.playing&&roomlet.time<2');checks['replayRestoresTracks']=abs(page.evaluate('(n)=>roomlet.renderer.nodes.find(x=>x.name===n).position[0]',name)-.123)>.01
 page.evaluate('roomlet.seek(0)')
 # Exercise the actual download click and check the emitted GLB, not only an in-memory exporter call.
 page.locator('#export-toggle').click()
 with page.expect_download(timeout=15000) as dl:page.locator('[data-export="loop"]').click()
 download=dl.value;download.save_as(str(OUT/'browser-export-loop.glb'))
 checks['animatedDownload']=download.suggested_filename.endswith('-loop.glb') and (OUT/'browser-export-loop.glb').stat().st_size>100000
 checks['webGLErrorDesktop']=page.evaluate('roomlet.renderer.gl.getError()')==0
 checkpoint('Desktop controls completed')
 # Mobile-sized preview + real touch-event pinch gesture.
 page.set_viewport_size({'width':390,'height':844});page.evaluate('roomlet.seek(9)');page.wait_for_timeout(700);page.screenshot(path=str(OUT/'preview-mobile.png'),timeout=30000)
 checks['mobileNoHorizontalOverflow']=page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 checks['mobileControlsVisible']=page.locator('#play-toggle').is_visible() and page.locator('#reset-view').is_visible()
 rect=page.locator('#room').bounding_box();cx=rect['x']+rect['width']/2;cy=min(rect['y']+rect['height']/2,650);z0=page.evaluate('roomlet.renderer.orbit.zoom');cdp=context.new_cdp_session(page)
 cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':cx-45,'y':cy,'id':1},{'x':cx+45,'y':cy,'id':2}]})
 cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':cx-73,'y':cy,'id':1},{'x':cx+73,'y':cy,'id':2}]})
 cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});page.wait_for_timeout(150);checks['pinchZoom']=page.evaluate('roomlet.renderer.orbit.zoom')>z0+.2;cdp.detach()
 checks['webGLErrorMobile']=page.evaluate('roomlet.renderer.gl.getError()')==0
 checkpoint('Mobile controls completed')
 # Model decoded back from the ACTUAL GLB, not from scene-data.js.
 page.evaluate('roomlet.dispose()');page.close();page=context.new_page();attach_observers(page,requests)
 source_text=(ROOT/'src/scene-data.js').read_text();source=json.loads(source_text.split('window.SCULPT_SCENE=',1)[1].strip().rstrip(';'))
 parsed=read_glb(ROOT/'models'/f"{source['meta']['slug']}-loop.glb",source)
 page.set_viewport_size({'width':1360,'height':900});load_owned(page,scene=parsed)
 comparisons=[]
 for t in [0,2.5,4.75,6.6,9,12.6,16.9,18]:
  im=capture(page,t,OUT/f'qa-glb-{t:g}.png',400);aa=np.array(im).astype(int);bb=np.array(source_images[t]).astype(int);diff=np.abs(aa-bb)
  comparisons.append({'time':t,'maximumChannelDifference':int(diff.max()),'meanChannelDifference':float(diff.mean()),'fractionDifferentPixels':float(np.any(diff>0,axis=2).mean())})
 checks['glbVisualRoundtripMatches']=all(v['maximumChannelDifference']<=1 and v['meanChannelDifference']<.01 for v in comparisons)
 REPORT['glbVisualRoundtrip']={'scope':'Project GLB read-only bridge + the same renderer / lighting. Not an external engine or pixel-parity claim for Blender/Three.js. All geometry, materials, textures and animation sampled from the exported GLB.','frames':comparisons}
 checkpoint('GLB visual roundtrip completed')
 checks['zeroExternalNetworkRequests']=not requests
 REPORT['externalRequests']=requests
 REPORT['testedViewports']=['1360x900','390x844']
 browser.close()
REPORT['passed']=all(checks.values()) and not REPORT['errors']
(ROOT/'docs/browser-qa.json').write_text(json.dumps(REPORT,indent=2,ensure_ascii=False))
print(json.dumps(REPORT,indent=2,ensure_ascii=False),flush=True)
assert REPORT['passed'],{k:v for k,v in checks.items() if not v}
