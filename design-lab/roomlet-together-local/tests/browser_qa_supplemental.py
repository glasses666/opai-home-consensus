#!/usr/bin/env python3
"""Fresh-browser tests for standalone embed and reduced motion; merges prior core QA.
The heavy render roundtrip runs in a separate process to release WebGL contexts.
"""
from pathlib import Path
import os,json,base64
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'exports';REPORT=json.loads((ROOT/'docs/browser-qa.json').read_text());checks=REPORT['checks'];requests=[];errors=[]
def attach(page):
 page.set_default_timeout(15000)
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
 page.on('request',lambda r:requests.append(r.url) if r.url.startswith(('http:','https:')) else None)
def load(page,name):
 page.set_content((ROOT/name).read_text(),wait_until='load',timeout=60000)
 page.wait_for_function('window.ROOMLET_READY===true',timeout=60000)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),headless=not bool(os.environ.get('DISPLAY')),args=['--no-sandbox','--ignore-gpu-blocklist','--disable-dev-shm-usage'])
 context=browser.new_context(viewport={'width':320,'height':320},device_scale_factor=1,offline=True)
 page=context.new_page();attach(page);load(page,'embed.html');page.evaluate('roomlet.seek(9)');page.wait_for_timeout(300)
 blob=page.evaluate('roomlet.canvas.toDataURL("image/png").split(",")[1]');(OUT/'embed-320.png').write_bytes(base64.b64decode(blob))
 checks['smallEmbed320']=page.evaluate('roomlet.canvas.width===320&&roomlet.canvas.height===320&&getComputedStyle(document.body).backgroundColor==="rgba(0, 0, 0, 0)"')
 page.locator('#room').focus();page.keyboard.press('Space');checks['keyboardPlayback']=page.evaluate('roomlet.playing');page.keyboard.press('Space');yaw=page.evaluate('roomlet.renderer.orbit.yaw');page.keyboard.press('ArrowLeft');changed=page.evaluate('roomlet.renderer.orbit.yaw')!=yaw;page.keyboard.press('0');page.wait_for_function('Math.abs(roomlet.renderer.orbit.yaw-roomlet.renderer.defaultOrbit.yaw)<1e-5');checks['embedKeyboardControls']=changed
 checks['webGLErrorEmbed']=page.evaluate('roomlet.renderer.gl.getError()')==0
 page.evaluate('roomlet.dispose()');page.close();context.close();print('Embed passed',flush=True)
 context=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=1,offline=True,reduced_motion='reduce');page=context.new_page();attach(page);load(page,'preview.html')
 checks['reducedMotionRespected']=page.evaluate('roomlet.reducedMotion&&!roomlet.playing&&(roomlet.renderer.cameraDrift||0)===0')
 page.evaluate('roomlet.dispose()');page.close();context.close();browser.close();print('Reduced motion passed',flush=True)
REPORT['externalRequests']=REPORT.get('externalRequests',[])+requests
checks['zeroExternalNetworkRequests']=not REPORT['externalRequests']
REPORT['errors']+=errors;REPORT['testedViewports']=['1360x900','390x844','320x320'];REPORT['lastCompletedStage']='Core controls / GLB roundtrip plus fresh-process embed and reduced motion';REPORT['passed']=all(checks.values()) and not REPORT['errors']
(ROOT/'docs/browser-qa.json').write_text(json.dumps(REPORT,indent=2,ensure_ascii=False));print(json.dumps(REPORT,indent=2,ensure_ascii=False),flush=True)
assert REPORT['passed'],{k:v for k,v in checks.items() if not v}
