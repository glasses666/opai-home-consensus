/* UI only. The original Python geometry / shared animation data is authoritative. */
(() => {
'use strict';
const $=s=>document.querySelector(s),data=window.SCULPT_SCENE,story=data.meta.story;
const params=new URLSearchParams(location.search),embedded=params.get('embed')==='1';
if(embedded)document.body.classList.add('embed');
document.documentElement.style.setProperty('--accent',story.accent);
let viewer,toastTimer,selectedName='',edited=false;
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),2900);}
try{viewer=new RoomletViewer($('#room'),data,{autoplay:params.get('autoplay')!=='0',pixelRatio:embedded?1:Math.min(devicePixelRatio||1,1.5),parallax:params.get('parallax')!=='0'});}
catch(error){$('#loading').textContent=error.message;return;}
window.roomlet=viewer;
viewer.onError=error=>{$('#loading').hidden=false;$('#loading').textContent='加载失败：'+error.message;};
viewer.onReady=()=>{
 $('#loading').hidden=true;window.ROOMLET_READY=true;
 if(params.has('time'))viewer.seek(Number(params.get('time')));
 viewer.onPlaying(viewer.playing);viewer.onTime(viewer.time,viewer.phase());
 $('#parallax-toggle').classList.toggle('active',viewer.parallax&&!viewer.reducedMotion);
 $('#parallax-toggle').setAttribute('aria-pressed',String(viewer.parallax&&!viewer.reducedMotion));
 if(viewer.reducedMotion)toast('已遵循“减少动态效果”；点击播放即可观看。');
};
let lastLayout='original';
viewer.onTime=(t,phase)=>{
 $('#phase-label').textContent=phase.label;$('#timeline').value=t;$('#timeline').style.setProperty('--progress',phase.progress*100+'%');
 $('#time-label').textContent=t.toFixed(1).padStart(4,'0')+' / '+viewer.duration.toFixed(1)+' s';
 for(const [id,k] of [['#layout-a','original'],['#layout-b','modified']]){$(id).classList.toggle('active',phase.layout===k);$(id).setAttribute('aria-pressed',String(phase.layout===k));}
 const layout=phase.layout==='transition'?lastLayout:phase.layout;lastLayout=layout;
 $('#state-title').textContent=layout==='original'?story.originalTitle:story.modifiedTitle;
 $('#state-copy').textContent=layout==='original'?story.originalText:story.modifiedText;
};
viewer.onPlaying=on=>{
 $('#play-toggle').classList.toggle('is-paused',!on);$('#play-toggle').setAttribute('aria-pressed',String(on));$('#play-toggle').setAttribute('aria-label',on?'暂停动画':'播放动画');$('#play-label').textContent=on?'慢慢变换':'停下来看看';
};
function clearEdit(){edited=false;viewer.selectObject('');selectedName='';$('#object-editor').hidden=true;document.querySelectorAll('.object-row').forEach(b=>b.classList.remove('selected'));}
function seek(t){clearEdit();viewer.seek(t);}
$('#play-toggle').onclick=()=>{if(edited){clearEdit();viewer.applyTime(viewer.time);}viewer.toggle();};
$('#layout-a').onclick=()=>seek(0);$('#layout-b').onclick=()=>seek(data.motion.landmarks.modified);
$('#timeline').oninput=e=>seek(Number(e.target.value));
$('#replay').onclick=()=>{clearEdit();viewer.applyTime(0);viewer.setPlaying(true);};
$('#zoom-in').onclick=()=>viewer.setZoom(viewer.renderer.orbit.zoom*1.16);
$('#zoom-out').onclick=()=>viewer.setZoom(viewer.renderer.orbit.zoom/1.16);
$('#reset-view').onclick=()=>{viewer.resetView();toast('回到默认视角');};
$('#top-view').onclick=()=>{viewer.cameraTween=null;viewer.renderer.orbit.pitch=1.34;viewer.renderer.orbit.yaw=.12;viewer.renderer.orbit.zoom=1.16;viewer.renderer.updateCamera();toast('从上方看布局；房子图标恢复默认视角');};
const speeds=[.75,1,1.25,1.5];let speedIndex=1;
$('#speed-toggle').onclick=()=>{speedIndex=(speedIndex+1)%speeds.length;viewer.setSpeed(speeds[speedIndex]);$('#speed-toggle').textContent=speeds[speedIndex]+'×';};
$('#parallax-toggle').onclick=()=>{viewer.setParallax(!viewer.parallax);$('#parallax-toggle').classList.toggle('active',viewer.parallax);$('#parallax-toggle').setAttribute('aria-pressed',String(viewer.parallax));};
$('#background-toggle').onclick=()=>{$('#stage').classList.toggle('checker');$('#background-toggle').classList.toggle('active');};
function panel(open){$('#objects-panel').hidden=!open;$('#objects-toggle').setAttribute('aria-expanded',String(open));}
$('#objects-toggle').onclick=()=>panel($('#objects-panel').hidden);$('#objects-close').onclick=()=>panel(false);
for(const [i,n] of data.nodes.filter(n=>n.kind==='furniture').entries()){
 const b=document.createElement('button');b.className='object-row';b.dataset.object=n.name;
 const num=document.createElement('span');num.textContent=String(i+1).padStart(2,'0');const labels=document.createElement('span'),title=document.createElement('strong'),id=document.createElement('code');title.textContent=n.label;id.textContent=n.name;labels.append(title,id);b.append(num,labels);
 b.onclick=()=>{viewer.setPlaying(false);selectedName=n.name;viewer.selectObject(n.name);document.querySelectorAll('.object-row').forEach(r=>r.classList.toggle('selected',r===b));const live=viewer.renderer.nodes.find(o=>o.name===n.name);$('#edit-x').value=live.position[0].toFixed(3);$('#edit-z').value=live.position[2].toFixed(3);$('#edit-yaw').value=(Math.atan2(live.rotation[1],live.rotation[3])*360/Math.PI).toFixed(1);$('#object-editor').hidden=false;};
 $('#object-list').append(b);
}
$('#apply-edit').onclick=()=>{const n=viewer.renderer.nodes.find(n=>n.name===selectedName);if(!n)return;const x=Number($('#edit-x').value),z=Number($('#edit-z').value),yaw=Number($('#edit-yaw').value)*Math.PI/180;if(![x,z,yaw].every(Number.isFinite))return toast('请输入有效数值');viewer.setPlaying(false);n.position=[x,data.meta.ground,z];n.rotation=[0,Math.sin(yaw/2),0,Math.cos(yaw/2)];edited=true;viewer.renderer.dirty=true;toast('已调整；重播将恢复原动画。');};
$('#export-pose').onclick=()=>{
 const clone={...data,layouts:{...data.layouts,original:{}}};for(const n of viewer.renderer.nodes.filter(n=>n.kind==='furniture'))clone.layouts.original[n.name]={position:[...n.position],rotationY:Math.atan2(n.rotation[1],n.rotation[3])*2};
 SculptExport.download(SculptExport.buildGLB(clone,'original',false),data.meta.slug+'-edited-layout.glb');
};
$('#export-toggle').onclick=()=>{const open=$('#export-menu').hidden;$('#export-menu').hidden=!open;$('#export-toggle').setAttribute('aria-expanded',String(open));};
document.addEventListener('pointerdown',e=>{if(!e.target.closest('.export-wrap')){$('#export-menu').hidden=true;$('#export-toggle').setAttribute('aria-expanded','false');}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){panel(false);$('#export-menu').hidden=true;}});
document.querySelectorAll('[data-export]').forEach(b=>b.onclick=async()=>{
 $('#export-menu').hidden=true;
 try{const kind=b.dataset.export;if(kind==='png'){toast('正在导出透明画面…');SculptExport.download(await viewer.exportPNG(1200,1200),data.meta.slug+'-transparent.png');}
 else{SculptExport.download(SculptExport.buildGLB(data,kind==='loop'?'original':kind,kind==='loop'),data.meta.slug+'-'+kind+'.glb');toast('GLB 已导出，独立家具完整保留。');}}
 catch(error){toast('导出失败：'+error.message);console.error(error);}
});
window.RoomletPreview={play:()=>viewer.setPlaying(true),pause:()=>viewer.setPlaying(false),seek,resetView:()=>viewer.resetView(),setParallax:on=>viewer.setParallax(on),exportPNG:(w,h)=>viewer.exportPNG(w,h),exportGLB:(animated=true,state='original')=>SculptExport.buildGLB(data,state,animated),getState:()=>({time:viewer.time,duration:viewer.duration,playing:viewer.playing,phase:viewer.phase(),orbit:{...viewer.renderer.orbit}})};
// Same-origin postMessage integration: never evaluates code or accepts URLs.
window.addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==parent)return;const m=e.data;if(!m||m.type!=='roomlet')return;if(m.action==='pause')viewer.setPlaying(false);else if(m.action==='play')viewer.setPlaying(true);else if(m.action==='seek'&&Number.isFinite(m.time))seek(m.time);else if(m.action==='reset')viewer.resetView();});
})();
