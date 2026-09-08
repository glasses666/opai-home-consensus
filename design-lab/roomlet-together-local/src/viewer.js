/* ROOMLET 02. Shared sampled animation + orbit controls. No runtime dependencies.
 * Animation payload is IDENTICAL to the tracks written into roomlet-loop.glb.
 * One furniture instance per name; static architecture is never animated.
 */
(() => {
  'use strict';
  const decode = (s) => {
    const raw=atob(s), bytes=new Uint8Array(raw.length);
    for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
    return new Float32Array(bytes.buffer);
  };
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const ease=u=>u*u*u*(u*(u*6-15)+10);
  function slerp(a,b,u){
    let dot=a.reduce((v,x,i)=>v+x*b[i],0),q=b;
    if(dot<0){dot=-dot;q=b.map(x=>-x);}
    if(dot>.9995){const r=a.map((x,i)=>x+(q[i]-x)*u),d=Math.hypot(...r);return r.map(x=>x/d);}
    const theta=Math.acos(clamp(dot,-1,1)),k0=Math.sin((1-u)*theta)/Math.sin(theta),k1=Math.sin(u*theta)/Math.sin(theta);
    return a.map((x,i)=>x*k0+q[i]*k1);
  }
  class RoomletViewer {
    constructor(canvas,data,options={}){
      this.canvas=canvas;this.data=data;this.options=options;
      this.renderer=new SculptRenderer(canvas,data,options);
      this.parallax=options.parallax!==false;this.duration=data.motion.duration;this.times=decode(data.motion.times);this.time=0;this.speed=1;
      this.reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.playing=options.autoplay!==false&&!this.reducedMotion;this.ready=false;this.lastNow=null;
      this.hidden=document.hidden;this.pointerMap=new Map();this.disposers=[];
      this.tracks=data.motion.tracks.map(t=>({name:t.name,node:this.renderer.nodes.find(n=>n.name===t.name),p:decode(t.positions),q:decode(t.rotations)}));
      this.renderer.onReady=()=>{
        this.ready=true;this.applyTime(0);this.bindOrbit();
        this.resizeObserver=new ResizeObserver(()=>{this.renderer.resize();this.renderer.dirty=true;});this.resizeObserver.observe(canvas);
        this.listen(document,'visibilitychange',()=>{this.hidden=document.hidden;this.lastNow=null;});
        this.frame=requestAnimationFrame(t=>this.tick(t));this.onReady?.();
      };
      this.renderer.onError=e=>this.onError?.(e);
    }
    listen(target,type,handler,options){target.addEventListener(type,handler,options);this.disposers.push(()=>target.removeEventListener(type,handler,options));}
    applyTime(seconds){
      this.time=clamp(seconds,0,this.duration);
      const t=this.time,hi=this.times.length-1;
      let i=Math.min(hi-1,Math.max(0,Math.floor(t*this.data.motion.fps)));
      while(i>0&&this.times[i]>t)i--;
      while(i<hi-1&&this.times[i+1]<t)i++;
      const u=clamp((t-this.times[i])/(this.times[i+1]-this.times[i]),0,1);
      let changed=false;
      for(const track of this.tracks){
        const p=Array.from(track.p.slice(i*3,i*3+3)),b=track.p.slice((i+1)*3,(i+1)*3+3);
        const pos=p.map((v,j)=>v+(b[j]-v)*u);
        const q=slerp(Array.from(track.q.slice(i*4,i*4+4)),Array.from(track.q.slice((i+1)*4,(i+1)*4+4)),u);
        if(pos.some((v,j)=>Math.abs(v-track.node.position[j])>1e-7)||q.some((v,j)=>Math.abs(v-track.node.rotation[j])>1e-7))changed=true;
        track.node.position=pos;track.node.rotation=q;
      }
      if(changed)this.renderer.dirty=true;
      this.updateParallax();this.onTime?.(this.time,this.phase());
    }
    tick(now){
      if(this.disposed)return;
      const dt=this.lastNow===null?0:Math.min(.10,(now-this.lastNow)/1000);this.lastNow=now;
      if(!this.hidden){
        if(this.playing)this.applyTime((this.time+dt*this.speed)%this.duration);
        if(this.cameraTween){
          const a=this.cameraTween,u=clamp((now-a.start)/500,0,1),e=ease(u),o=this.renderer.orbit;
          o.yaw=a.from.yaw+a.deltaYaw*e;o.pitch=a.from.pitch+(a.to.pitch-a.from.pitch)*e;o.zoom=a.from.zoom+(a.to.zoom-a.from.zoom)*e;
          this.renderer.updateCamera();if(u===1)this.cameraTween=null;
        }
        if(this.renderer.dirty&&this.renderer.gpuReady())this.renderer.render();
      }
      this.frame=requestAnimationFrame(t=>this.tick(t));
    }
    updateParallax(){
      const drift=this.parallax&&!this.reducedMotion?Math.sin(this.time/this.duration*Math.PI*2)*Math.PI/225:0;
      if(Math.abs((this.renderer.cameraDrift||0)-drift)>1e-8){this.renderer.cameraDrift=drift;this.renderer.updateCamera();}
    }
    setParallax(on){this.parallax=Boolean(on);this.updateParallax();this.renderer.dirty=true;}
    phase(){
      const reverse=this.time>this.duration/2,t=reverse?this.duration-this.time:this.time,m=this.data.motion;
      let label=m.phases[0].label;
      for(const phase of m.phases)if(t>=phase.time)label=phase.label;
      const layout=t<m.holdAEnd?'original':t>=m.holdBStart?'modified':'transition';
      if(reverse&&layout==='transition')label='慢慢复位 · '+label;
      return {label,reverse,layout,progress:this.time/this.duration};
    }
    setPlaying(value){this.playing=Boolean(value);this.lastNow=null;this.onPlaying?.(this.playing);return this.playing;}
    toggle(){return this.setPlaying(!this.playing);}
    seek(seconds){this.setPlaying(false);this.applyTime(clamp(Number(seconds)||0,0,this.duration));if(this.ready)this.renderer.render();}
    setSpeed(value){this.speed=clamp(Number(value)||1,.25,2);}
    setZoom(value){this.cameraTween=null;this.renderer.orbit.zoom=clamp(value,.65,2.6);this.renderer.updateCamera();}
    resetView(animate=true){
      const from={...this.renderer.orbit},to={...this.renderer.defaultOrbit};
      if(!animate||this.reducedMotion){this.renderer.orbit=to;this.renderer.updateCamera();return;}
      const d=((to.yaw-from.yaw+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI;
      this.cameraTween={from,to,deltaYaw:d,start:performance.now()};
    }
    bindOrbit(){
      const c=this.canvas;c.style.touchAction='none';
      this.listen(c,'pointerdown',e=>{
        if(e.button!==0&&e.pointerType==='mouse')return;
        this.cameraTween=null;c.setPointerCapture(e.pointerId);this.pointerMap.set(e.pointerId,{x:e.clientX,y:e.clientY});this.dragOrigin={x:e.clientX,y:e.clientY};this.dragDistance=0;
        c.classList.add('is-dragging');this.onInteract?.();
      });
      this.listen(c,'pointermove',e=>{
        const old=this.pointerMap.get(e.pointerId);if(!old)return;
        const previous=[...this.pointerMap.values()];this.pointerMap.set(e.pointerId,{x:e.clientX,y:e.clientY});
        this.dragDistance+=Math.hypot(e.clientX-old.x,e.clientY-old.y);
        if(this.pointerMap.size===1){
          const o=this.renderer.orbit;o.yaw-=(e.clientX-old.x)*.006;o.pitch=clamp(o.pitch+(e.clientY-old.y)*.005,.12,1.44);this.renderer.updateCamera();
        }else{
          const next=[...this.pointerMap.values()],a=Math.hypot(previous[0].x-previous[1].x,previous[0].y-previous[1].y),b=Math.hypot(next[0].x-next[1].x,next[0].y-next[1].y);
          if(a>4)this.setZoom(this.renderer.orbit.zoom*b/a);
        }
      });
      const up=e=>{this.pointerMap.delete(e.pointerId);if(this.pointerMap.size===0)c.classList.remove('is-dragging');};
      this.listen(c,'pointerup',up);this.listen(c,'pointercancel',up);this.listen(c,'lostpointercapture',up);
      this.listen(c,'wheel',e=>{e.preventDefault();this.setZoom(this.renderer.orbit.zoom*Math.exp(-e.deltaY*.001));this.onInteract?.();},{passive:false});
      this.listen(c,'keydown',e=>{
        let used=true;const o=this.renderer.orbit;
        if(e.code==='Space')this.toggle();else if(e.key==='0')this.resetView();
        else if(e.key==='+'||e.key==='=')this.setZoom(o.zoom*1.10);else if(e.key==='-')this.setZoom(o.zoom/1.10);
        else if(e.key==='ArrowLeft')o.yaw+=.10;else if(e.key==='ArrowRight')o.yaw-=.10;
        else if(e.key==='ArrowUp')o.pitch=clamp(o.pitch+.10,.12,1.44);else if(e.key==='ArrowDown')o.pitch=clamp(o.pitch-.10,.12,1.44);else used=false;
        if(used){e.preventDefault();this.renderer.updateCamera();}
      });
    }
    selectObject(name){const i=this.renderer.nodes.findIndex(n=>n.name===name);this.renderer.selected=i;this.renderer.dirty=true;return i;}
    async exportPNG(width=1600,height=1600){
      const wasPlaying=this.playing;this.setPlaying(false);
      try{return await this.renderer.png(width,height);}finally{this.renderer.resize();this.setPlaying(wasPlaying);}
    }
    dispose(){this.disposed=true;cancelAnimationFrame(this.frame);this.resizeObserver?.disconnect();this.disposers.forEach(fn=>fn());this.renderer.dispose();}
  }
  window.RoomletViewer=RoomletViewer;
})();
