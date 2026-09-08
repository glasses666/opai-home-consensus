/* Preview UI only. Geometry, furniture animation and camera controls are separate. */
(() => {
  'use strict';
  const $=s=>document.querySelector(s);
  const params=new URLSearchParams(location.search);
  if(params.get('embed')==='1')document.body.classList.add('embed');
  let toastTimer;
  function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),2600);}
  let viewer;
  try{viewer=new RoomletViewer($('#room'),SCULPT_SCENE,{autoplay:params.get('autoplay')!=='0'});}
  catch(error){$('#loading').innerHTML='';$('#loading').textContent=error.message;return;}
  window.roomlet=viewer;
  viewer.onError=error=>{$('#loading').textContent='加载失败：'+error.message;};
  viewer.onReady=()=>{
    $('#loading').hidden=true;window.ROOMLET_READY=true;
    if(params.has('time'))viewer.seek(Number(params.get('time')));
    viewer.onPlaying(viewer.playing);
    if(viewer.reducedMotion)toast('已遵循“减少动态效果”，点击播放即可开始。');
  };
  viewer.onTime=(t,phase)=>{
    $('#phase-label').textContent=phase.label;
    $('#timeline').value=String(t);$('#timeline').style.setProperty('--progress',(phase.progress*100)+'%');
    $('#time-label').textContent=t.toFixed(1).padStart(4,'0')+' / 16.4 s';
  };
  viewer.onPlaying=playing=>{
    $('#play-toggle').classList.toggle('is-paused',!playing);$('#play-toggle').setAttribute('aria-pressed',String(playing));$('#play-toggle').setAttribute('aria-label',playing?'暂停动画':'播放动画');
    $('#play-label').textContent=playing?'循环换位':'已暂停';$('#stage').classList.toggle('paused',!playing);
  };
  $('#play-toggle').onclick=()=>viewer.toggle();
  $('#timeline').oninput=e=>viewer.seek(Number(e.target.value));
  $('#zoom-in').onclick=()=>viewer.setZoom(viewer.renderer.orbit.zoom*1.18);
  $('#zoom-out').onclick=()=>viewer.setZoom(viewer.renderer.orbit.zoom/1.18);
  $('#reset-view').onclick=()=>{viewer.resetView();toast('回到默认视角');};
  let speedIndex=1;const speeds=[.75,1,1.25,1.5];
  $('#speed-toggle').onclick=()=>{speedIndex=(speedIndex+1)%speeds.length;const s=speeds[speedIndex];viewer.setSpeed(s);$('#speed-toggle').textContent=s+'×';$('#speed-toggle').setAttribute('aria-label','播放速度 '+s+' 倍');};
  $('#background-toggle').onclick=()=>$('#stage').classList.toggle('checker');
  function togglePanel(open){$('#objects-panel').hidden=!open;$('#objects-toggle').setAttribute('aria-expanded',String(open));}
  $('#objects-toggle').onclick=()=>togglePanel($('#objects-panel').hidden);
  $('#objects-close').onclick=()=>togglePanel(false);
  const listed=SCULPT_SCENE.nodes.filter(n=>n.kind==='furniture'),fixed=SCULPT_SCENE.nodes.filter(n=>['shell','wall','floor'].includes(n.kind));
  function objectButton(n,i){
    const b=document.createElement('button');b.className='object-row';b.dataset.object=n.name;b.setAttribute('aria-pressed','false');
    const num=document.createElement('span');num.textContent=String(i+1).padStart(2,'0');const labels=document.createElement('span'),title=document.createElement('strong'),id=document.createElement('code');title.textContent=n.label||n.name;id.textContent=n.name;labels.append(title,id);b.append(num,labels);
    b.onclick=()=>{const selected=b.classList.contains('selected');document.querySelectorAll('.object-row').forEach(r=>{r.classList.remove('selected');r.setAttribute('aria-pressed','false');});viewer.selectObject(selected?'':n.name);if(!selected){b.classList.add('selected');b.setAttribute('aria-pressed','true');}};
    return b;
  }
  listed.forEach((n,i)=>$('#object-list').append(objectButton(n,i)));
  const subtitle=document.createElement('div');subtitle.className='objects-subtitle';subtitle.textContent='固定建筑 · 不参与动画';$('#object-list').append(subtitle);fixed.forEach((n,i)=>$('#object-list').append(objectButton(n,i)));
  $('#export-toggle').onclick=()=>{const open=$('#export-menu').hidden;$('#export-menu').hidden=!open;$('#export-toggle').setAttribute('aria-expanded',String(open));};
  document.addEventListener('pointerdown',e=>{if(!e.target.closest('.export-wrap')){$('#export-menu').hidden=true;$('#export-toggle').setAttribute('aria-expanded','false');}});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){togglePanel(false);$('#export-menu').hidden=true;}});
  document.querySelectorAll('[data-export]').forEach(button=>button.onclick=async()=>{
    $('#export-menu').hidden=true;$('#export-toggle').setAttribute('aria-expanded','false');
    try{
      const kind=button.dataset.export;
      if(kind==='png'){toast('正在导出透明画面…');SculptExport.download(await viewer.exportPNG(),'roomlet-current-transparent.png');}
      else{const blob=SculptExport.buildGLB(SCULPT_SCENE,kind==='loop'?'original':kind,kind==='loop');SculptExport.download(blob,'roomlet-'+kind+'.glb');toast(kind==='loop'?'已导出含完整循环动画的 GLB':'已导出独立对象 GLB');}
    }catch(error){toast('导出失败：'+error.message);console.error(error);}
  });
  window.RoomletPreview={
    play:()=>viewer.setPlaying(true),pause:()=>viewer.setPlaying(false),seek:t=>viewer.seek(t),resetView:()=>viewer.resetView(),
    exportPNG:(w,h)=>viewer.exportPNG(w,h),exportGLB:(animated=true,state='original')=>SculptExport.buildGLB(SCULPT_SCENE,state,animated),
    getState:()=>({time:viewer.time,duration:viewer.duration,playing:viewer.playing,phase:viewer.phase(),orbit:{...viewer.renderer.orbit}})
  };
})();
