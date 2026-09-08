/* ROOMLET 02: dependency-free WebGL 2 renderer, evolved from SCULPT / 01.
 * MIT licensed original code. Geometry/materials are ordinary glTF-compatible data.
 * Features: orbital orthographic camera, physically based direct illumination,
 * 32-tap soft shadow mapping, depth/normal SSAO + bilateral filtering,
 * 4× MSAA, transparent compositing, exact named-object picking, on-demand rendering.
 */
(() => {
'use strict';
const M = {
 identity:()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]),
 mul(a,b){let o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];return o;},
 trs(p,q,s){const [x,y,z,w]=q,xx=x*x,yy=y*y,zz=z*z,xy=x*y,xz=x*z,yz=y*z,wx=w*x,wy=w*y,wz=w*z;return new Float32Array([(1-2*(yy+zz))*s[0],2*(xy+wz)*s[0],2*(xz-wy)*s[0],0,2*(xy-wz)*s[1],(1-2*(xx+zz))*s[1],2*(yz+wx)*s[1],0,2*(xz+wy)*s[2],2*(yz-wx)*s[2],(1-2*(xx+yy))*s[2],0,...p,1]);},
 cross:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
 norm(a){const n=Math.hypot(...a)||1;return a.map(v=>v/n);},
 dot:(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],
 look(eye,target){const z=M.norm(eye.map((v,i)=>v-target[i])),x=M.norm(M.cross([0,1,0],z)),y=M.cross(z,x);return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-M.dot(x,eye),-M.dot(y,eye),-M.dot(z,eye),1]);},
 ortho(l,r,b,t,n,f){return new Float32Array([2/(r-l),0,0,0,0,2/(t-b),0,0,0,0,-2/(f-n),0,-(r+l)/(r-l),-(t+b)/(t-b),-(f+n)/(f-n),1]);},
 inv(a){let r=Array.from({length:4},(_,i)=>[a[i],a[4+i],a[8+i],a[12+i],...Array.from({length:4},(_,j)=>i===j?1:0)]);for(let i=0;i<4;i++){let k=i;for(let j=i+1;j<4;j++)if(Math.abs(r[j][i])>Math.abs(r[k][i]))k=j;[r[i],r[k]]=[r[k],r[i]];let v=r[i][i];if(Math.abs(v)<1e-14)return M.identity();r[i]=r[i].map(x=>x/v);for(let j=0;j<4;j++)if(j!==i){v=r[j][i];r[j]=r[j].map((x,c)=>x-v*r[i][c]);}}return new Float32Array(Array.from({length:16},(_,i)=>r[i%4][4+Math.floor(i/4)]));},
 normal(a){let x=[a[0],a[1],a[2]],y=[a[4],a[5],a[6]],z=[a[8],a[9],a[10]],a0=M.cross(y,z),a1=M.cross(z,x),a2=M.cross(x,y),d=M.dot(x,a0)||1;return new Float32Array([...a0,...a1,...a2].map(v=>v/d));},
};
const decode=(s,Type)=>{let b=atob(s),a=new Uint8Array(b.length);for(let i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return new Type(a.buffer);};
const VS=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec2 aUV;
uniform mat4 uModel, uVP, uLightVP;
uniform mat3 uNormal;
out vec3 vPosition,vNormal;out vec2 vUV;out vec4 vShadow;
void main(){vec4 p=uModel*vec4(aPosition,1.);vPosition=p.xyz;vNormal=uNormal*aNormal;vUV=aUV;vShadow=uLightVP*p;gl_Position=uVP*p;}`;
const FS=`#version 300 es
precision highp float;
in vec3 vPosition,vNormal;in vec2 vUV;in vec4 vShadow;
layout(location=0) out vec4 outColor;
layout(location=1) out vec4 outNormal;
uniform sampler2D uTexture,uShadow;
uniform vec3 uColor,uEye,uLightDir;
uniform float uRough,uMetal,uSelected,uExposure;
uniform int uHasTexture,uMode;
uniform vec3 uId;
const float PI=3.141592653589793;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
vec3 toLinear(vec3 c){return mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(vec3(.04045),c));}
float visibility(vec3 N){vec3 s=vShadow.xyz/vShadow.w*.5+.5;if(s.x<0.||s.x>1.||s.y<0.||s.y>1.||s.z>1.)return 1.;float bias=max(.00022,.0010*(1.-max(0.,dot(N,uLightDir))));float vis=0.;float angle=hash(gl_FragCoord.xy)*6.2831853;for(int i=0;i<32;i++){float a=float(i)*2.39996323+angle;float r=sqrt((float(i)+.5)/32.)*.0065;float d=texture(uShadow,s.xy+vec2(cos(a),sin(a))*r).r;vis+=step(s.z-bias,d);}return vis/32.;}
vec3 brdf(vec3 N,vec3 V,vec3 L,vec3 albedo,vec3 radiance,float rough,float metallic){vec3 H=normalize(L+V);float NL=max(dot(N,L),0.),NV=max(dot(N,V),.001),NH=max(dot(N,H),0.),VH=max(dot(V,H),0.);float a=rough*rough,a2=a*a;float den=NH*NH*(a2-1.)+1.;float D=a2/(PI*den*den+.00001);float k=(rough+1.)*(rough+1.)/8.;float G=(NL/(NL*(1.-k)+k))*(NV/(NV*(1.-k)+k));vec3 F0=mix(vec3(.04),albedo,metallic);vec3 F=F0+(1.-F0)*pow(1.-VH,5.);vec3 spec=D*G*F/(4.*NL*NV+.0001);vec3 kd=(1.-F)*(1.-metallic);return (kd*albedo/PI+spec)*radiance*NL;}
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
void main(){if(uMode==1){outColor=vec4(uId,1.);outNormal=vec4(0);return;}
vec3 N=normalize(vNormal);if(!gl_FrontFacing)N=-N;
vec3 V=normalize(uEye-vPosition);vec3 albedo=toLinear(uColor);if(uHasTexture==1)albedo*=toLinear(texture(uTexture,vUV).rgb);
float vis=visibility(N);vec3 sky=mix(vec3(.16,.19,.135),vec3(.55,.60,.55),N.y*.5+.5);
vec3 light=albedo*sky*.60*(1.-uMetal*.75);
light+=brdf(N,V,uLightDir,albedo,vec3(2.65,2.40,2.04)*vis,uRough,uMetal);
light+=brdf(N,V,normalize(vec3(5.,4.,-2.)),albedo,vec3(.26,.33,.27),uRough,uMetal);
light+=albedo*.025;
light=mix(light,light*vec3(1.15,1.035,.88),uSelected*.40);
vec3 color=pow(aces(light*uExposure),vec3(1./2.2));
outColor=vec4(color,1.);outNormal=vec4(N*.5+.5,1.);}`;
const SHADOW_VS=`#version 300 es
precision highp float;layout(location=0) in vec3 aPosition;uniform mat4 uModel,uVP;void main(){gl_Position=uVP*uModel*vec4(aPosition,1.);}`;
const SHADOW_FS=`#version 300 es
precision highp float;void main(){}`;
const QUAD_VS=`#version 300 es
precision highp float;out vec2 vUV;void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);vUV=p;gl_Position=vec4(p*2.-1.,0.,1.);}`;
const AO_FS=`#version 300 es
precision highp float;in vec2 vUV;out vec4 outColor;
uniform sampler2D uDepth,uNormal;uniform mat4 uInvVP;uniform vec2 uResolution;uniform float uWorldHeight;
vec3 world(vec2 uv,float d){vec4 p=uInvVP*vec4(uv*2.-1.,d*2.-1.,1.);return p.xyz/p.w;}
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){float d=texture(uDepth,vUV).r;if(d>.99999){outColor=vec4(1);return;}vec3 p=world(vUV,d),N=normalize(texture(uNormal,vUV).rgb*2.-1.);float occ=0.;float ang=hash(floor(vUV*uResolution))*6.283;float radius=.43/uWorldHeight;float aspect=uResolution.x/uResolution.y;
for(int i=0;i<24;i++){float a=float(i)*2.399963+ang;float r=sqrt((float(i)+.5)/24.);vec2 uv=vUV+vec2(cos(a)/aspect,sin(a))*radius*r;float nd=texture(uDepth,uv).r;vec3 delta=world(uv,nd)-p;float len=length(delta);float cosine=dot(N,delta/max(len,.0001));float range=smoothstep(.56,.035,len);occ+=max(cosine-.07,0.)*range*step(nd,.99999);}
float ao=clamp(1.-occ/24.*3.1,.32,1.);outColor=vec4(ao,ao,ao,1.);}`;
const BLUR_FS=`#version 300 es
precision highp float;in vec2 vUV;out vec4 outColor;uniform sampler2D uImage,uDepth,uNormal;uniform vec2 uDirection;
void main(){float d=texture(uDepth,vUV).r;vec3 n=texture(uNormal,vUV).rgb;float s=0.,w=0.;for(int i=-4;i<=4;i++){vec2 uv=vUV+uDirection*float(i);float dd=texture(uDepth,uv).r;vec3 nn=texture(uNormal,uv).rgb;float k=exp(-float(i*i)*.16)*exp(-abs(dd-d)*1100.)*pow(max(dot(normalize(n*2.-1.),normalize(nn*2.-1.)),0.),8.);s+=texture(uImage,uv).r*k;w+=k;}outColor=vec4(vec3(s/max(w,.0001)),1.);}`;
const COMPOSITE_FS=`#version 300 es
precision highp float;in vec2 vUV;out vec4 outColor;uniform sampler2D uColor,uAO;
void main(){vec4 c=texture(uColor,vUV);if(c.a<.005){outColor=vec4(0);return;}float ao=texture(uAO,vUV).r;c.rgb/=max(c.a,.001);c.rgb*=mix(.55,1.,ao);outColor=c;}`;

class SculptRenderer {
 constructor(canvas,data,options={}){
  this.canvas=canvas;this.data=data;this.options=options;this.exposure=options.exposure??.94;this.orbit={yaw:Math.atan2(data.meta.fixedCamera.position[0]-data.meta.fixedCamera.target[0],data.meta.fixedCamera.position[2]-data.meta.fixedCamera.target[2]),pitch:Math.atan2(data.meta.fixedCamera.position[1]-data.meta.fixedCamera.target[1],Math.hypot(data.meta.fixedCamera.position[0]-data.meta.fixedCamera.target[0],data.meta.fixedCamera.position[2]-data.meta.fixedCamera.target[2])),zoom:1};this.defaultOrbit={...this.orbit};this.pixelRatio=options.pixelRatio??Math.min(devicePixelRatio||1,1.5);this.selected=-1;this.dirty=true;this.ready=false;
  const gl=canvas.getContext('webgl2',{alpha:true,antialias:false,premultipliedAlpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
  if(!gl)throw new Error('此浏览器未启用 WebGL 2。请使用支持硬件加速的 Safari、Chrome 或 Edge。');this.gl=gl;
  this.nodes=data.nodes.map(n=>({...n,position:[...n.position],rotation:[...n.rotation],scale:[...n.scale]}));
  this.nodes.forEach((n,i)=>{for(const c of n.children)this.nodes[c].parent=i;});
  this.drawables=[];this.nodes.forEach((n,i)=>{if(n.geometry!==undefined)this.drawables.push(i);});
  this.materials=data.materials;this.world=[];this.programs={main:this.program(VS,FS),shadow:this.program(SHADOW_VS,SHADOW_FS),ao:this.program(QUAD_VS,AO_FS),blur:this.program(QUAD_VS,BLUR_FS),composite:this.program(QUAD_VS,COMPOSITE_FS)};
  this.quad=gl.createVertexArray();this.geometries=data.geometries.map(g=>this.geometry(g));this.textures=[];
  this.white=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.white);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([255,255,255,255]));
  this.lightPosition=[-3.8,9,7.0];this.lightDir=M.norm(this.lightPosition);this.lightVP=M.mul(M.ortho(-7.3,7.3,-7.3,7.3,.1,30),M.look(this.lightPosition,[0,0,0]));this.initShadow();
  this.loadTextures().then(()=>{this.ready=true;this.resize();this.render();this.onReady?.();}).catch(e=>this.onError?.(e));
 }
 program(vs,fs){let gl=this.gl;function compile(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;}const p=gl.createProgram();let v=compile(gl.VERTEX_SHADER,vs),f=compile(gl.FRAGMENT_SHADER,fs);gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);gl.deleteShader(v);gl.deleteShader(f);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));const locations={};const count=gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);for(let i=0;i<count;i++){let u=gl.getActiveUniform(p,i);locations[u.name]=gl.getUniformLocation(p,u.name);}return {p,u:locations};}
 geometry(g){let gl=this.gl,vao=gl.createVertexArray();gl.bindVertexArray(vao);for(const [loc,name,Type,size]of [[0,'positions',Float32Array,3],[1,'normals',Float32Array,3],[2,'uvs',Float32Array,2]]){let a=decode(g[name],Type),b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,a,gl.STATIC_DRAW);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,0,0);}const ids=decode(g.indices,Uint32Array),b=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,b);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,ids,gl.STATIC_DRAW);return {vao,count:ids.length};}
 async loadTextures(){const gl=this.gl;this.textures=await Promise.all(this.data.textures.map(t=>new Promise((resolve,reject)=>{let im=new Image();im.onload=()=>{let tx=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tx);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,im);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.generateMipmap(gl.TEXTURE_2D);const ext=gl.getExtension('EXT_texture_filter_anisotropic');if(ext)gl.texParameterf(gl.TEXTURE_2D,ext.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(8,gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));resolve(tx);};im.onerror=()=>reject(new Error('无法加载材质 '+t.name));im.src=t.data;})));}
 depthTexture(w,h){let gl=this.gl,t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,w,h,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);for(const [a,b]of [[gl.TEXTURE_MIN_FILTER,gl.NEAREST],[gl.TEXTURE_MAG_FILTER,gl.NEAREST],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,a,b);return t;}
 colorTexture(w,h){let gl=this.gl,t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);for(const [a,b]of [[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,a,b);return t;}
 initShadow(){let gl=this.gl;this.shadowTex=this.depthTexture(2048,2048);this.shadowFB=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,this.shadowFB);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,this.shadowTex,0);gl.drawBuffers([gl.NONE]);gl.readBuffer(gl.NONE);this.checkFB();}
 checkFB(){const s=this.gl.checkFramebufferStatus(this.gl.FRAMEBUFFER);if(s!==this.gl.FRAMEBUFFER_COMPLETE)throw new Error('Framebuffer incomplete: '+s.toString(16));}
 resize(w,h,ratio){if(!this.ready)return;const rect=this.canvas.getBoundingClientRect();w=Math.round(w||rect.width||800);h=Math.round(h||rect.height||700);const p=ratio??this.pixelRatio;const W=Math.max(2,Math.round(w*p)),H=Math.max(2,Math.round(h*p));if(this.W===W&&this.H===H)return;this.W=W;this.H=H;this.canvas.width=W;this.canvas.height=H;this.disposeTargets();this.initTargets();this.updateCamera();this.dirty=true;}
 updateCamera(){
  const c=this.data.meta.fixedCamera,o=this.orbit,aspect=this.W/this.H,d=18;
  this.worldHeight=Math.max(c.height,(c.minWidth||7.8)/aspect)/o.zoom;
  this.eye=[c.target[0]+Math.sin(o.yaw+(this.cameraDrift||0))*Math.cos(o.pitch)*d,c.target[1]+Math.sin(o.pitch)*d,c.target[2]+Math.cos(o.yaw+(this.cameraDrift||0))*Math.cos(o.pitch)*d];
  this.vp=M.mul(M.ortho(-this.worldHeight*aspect/2,this.worldHeight*aspect/2,-this.worldHeight/2,this.worldHeight/2,c.near,c.far),M.look(this.eye,c.target));
  this.invVP=M.inv(this.vp);this.dirty=true;
 }
 disposeTargets(){let gl=this.gl;if(this.targetObjects)for(const [kind,obj]of this.targetObjects)gl[kind](obj);this.targetObjects=[];}
 track(kind,obj){this.targetObjects.push([kind,obj]);return obj;}
 initTargets(){const gl=this.gl,W=this.W,H=this.H,T=(w,h)=>this.track('deleteTexture',this.colorTexture(w,h)),F=()=>this.track('deleteFramebuffer',gl.createFramebuffer());
  this.color=T(W,H);this.normal=T(W,H);this.depth=this.track('deleteTexture',this.depthTexture(W,H));this.sceneFB=F();gl.bindFramebuffer(gl.FRAMEBUFFER,this.sceneFB);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,this.color,0);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT1,gl.TEXTURE_2D,this.normal,0);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,this.depth,0);gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);this.checkFB();
  this.msaa=F();gl.bindFramebuffer(gl.FRAMEBUFFER,this.msaa);let samples=Math.min(4,gl.getParameter(gl.MAX_SAMPLES));for(let i=0;i<3;i++){let rb=this.track('deleteRenderbuffer',gl.createRenderbuffer());gl.bindRenderbuffer(gl.RENDERBUFFER,rb);gl.renderbufferStorageMultisample(gl.RENDERBUFFER,samples,i===2?gl.DEPTH_COMPONENT24:gl.RGBA8,W,H);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,i===2?gl.DEPTH_ATTACHMENT:gl.COLOR_ATTACHMENT0+i,gl.RENDERBUFFER,rb);}gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);this.checkFB();
  this.aw=Math.max(1,Math.floor(W/2));this.ah=Math.max(1,Math.floor(H/2));this.aoTex=[];this.aoFB=[];for(let i=0;i<2;i++){let tex=T(this.aw,this.ah),fb=F();gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);gl.drawBuffers([gl.COLOR_ATTACHMENT0]);this.checkFB();this.aoTex.push(tex);this.aoFB.push(fb);}
  this.pickTex=T(W,H);this.pickFB=F();gl.bindFramebuffer(gl.FRAMEBUFFER,this.pickFB);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,this.pickTex,0);let pd=this.track('deleteRenderbuffer',gl.createRenderbuffer());gl.bindRenderbuffer(gl.RENDERBUFFER,pd);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT24,W,H);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,pd);gl.drawBuffers([gl.COLOR_ATTACHMENT0]);this.checkFB();gl.bindFramebuffer(gl.FRAMEBUFFER,null);
 }
 updateWorld(){const walk=(i,parent)=>{const n=this.nodes[i];this.world[i]=M.mul(parent,M.trs(n.position,n.rotation,n.scale));for(const c of n.children)walk(c,this.world[i]);};walk(this.data.root,M.identity());}
 bindTexture(unit,texture,loc){const gl=this.gl;gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);if(loc!==undefined&&loc!==null)gl.uniform1i(loc,unit);}
 selectedRoot(i){let n=i;while(n!==undefined){if(n===this.selected)return true;n=this.nodes[n].parent;}return false;}
 draw(program,pick=false,shadow=false){const gl=this.gl,{u}=program;gl.useProgram(program.p);gl.uniformMatrix4fv(u.uVP,false,shadow?this.lightVP:this.vp);if(!shadow){gl.uniformMatrix4fv(u.uLightVP,false,this.lightVP);gl.uniform3fv(u.uEye,this.eye||this.data.meta.fixedCamera.position);gl.uniform3fv(u.uLightDir,this.lightDir);gl.uniform1f(u.uExposure,this.exposure);gl.uniform1i(u.uMode,pick?1:0);this.bindTexture(1,this.shadowTex,u.uShadow);}
  for(const i of this.drawables){const n=this.nodes[i],g=this.geometries[n.geometry],mat=this.materials[n.material];gl.bindVertexArray(g.vao);gl.uniformMatrix4fv(u.uModel,false,this.world[i]);if(!shadow){gl.uniformMatrix3fv(u.uNormal,false,M.normal(this.world[i]));gl.uniform3fv(u.uColor,mat.color);gl.uniform1f(u.uRough,mat.roughness);gl.uniform1f(u.uMetal,mat.metalness);gl.uniform1f(u.uSelected,this.selectedRoot(i)?1:0);gl.uniform1i(u.uHasTexture,mat.texture>=0?1:0);this.bindTexture(0,mat.texture>=0?this.textures[mat.texture]:this.white,u.uTexture);if(pick){let id=i+1;gl.uniform3f(u.uId,(id&255)/255,((id>>8)&255)/255,((id>>16)&255)/255);}}gl.drawElements(gl.TRIANGLES,g.count,gl.UNSIGNED_INT,0);}
 }
 fullPass(p,fb,w,h,setup){const gl=this.gl;gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.viewport(0,0,w,h);gl.useProgram(p.p);gl.bindVertexArray(this.quad);setup(p.u);gl.drawArrays(gl.TRIANGLES,0,3);}
 render(){if(!this.ready)return;const gl=this.gl;this.updateWorld();gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.depthMask(true);
  gl.bindFramebuffer(gl.FRAMEBUFFER,this.shadowFB);gl.viewport(0,0,2048,2048);gl.clearDepth(1);gl.clear(gl.DEPTH_BUFFER_BIT);this.draw(this.programs.shadow,false,true);
  gl.bindFramebuffer(gl.FRAMEBUFFER,this.msaa);gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);gl.viewport(0,0,this.W,this.H);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);this.draw(this.programs.main);
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER,this.msaa);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,this.sceneFB);
  for(let i=0;i<2;i++){gl.readBuffer(gl.COLOR_ATTACHMENT0+i);gl.drawBuffers(i===0?[gl.COLOR_ATTACHMENT0]:[gl.NONE,gl.COLOR_ATTACHMENT1]);gl.blitFramebuffer(0,0,this.W,this.H,0,0,this.W,this.H,gl.COLOR_BUFFER_BIT,gl.NEAREST);}
  gl.blitFramebuffer(0,0,this.W,this.H,0,0,this.W,this.H,gl.DEPTH_BUFFER_BIT,gl.NEAREST);gl.disable(gl.DEPTH_TEST);
  this.fullPass(this.programs.ao,this.aoFB[0],this.aw,this.ah,u=>{this.bindTexture(0,this.depth,u.uDepth);this.bindTexture(1,this.normal,u.uNormal);gl.uniformMatrix4fv(u.uInvVP,false,this.invVP);gl.uniform2f(u.uResolution,this.aw,this.ah);gl.uniform1f(u.uWorldHeight,this.worldHeight);});
  for(let i=0;i<2;i++)this.fullPass(this.programs.blur,this.aoFB[1-i],this.aw,this.ah,u=>{this.bindTexture(0,this.aoTex[i],u.uImage);this.bindTexture(1,this.depth,u.uDepth);this.bindTexture(2,this.normal,u.uNormal);gl.uniform2f(u.uDirection,i===0?1/this.aw:0,i===1?1/this.ah:0);});
  this.fullPass(this.programs.composite,null,this.W,this.H,u=>{this.bindTexture(0,this.color,u.uColor);this.bindTexture(1,this.aoTex[0],u.uAO);});gl.bindVertexArray(null);if(this.frameSync)gl.deleteSync(this.frameSync);this.frameSync=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);gl.flush();this.dirty=false;this.frameCount=(this.frameCount||0)+1;
 }
 gpuReady(){if(!this.frameSync)return true;const gl=this.gl,status=gl.clientWaitSync(this.frameSync,0,0);if(status===gl.TIMEOUT_EXPIRED)return false;gl.deleteSync(this.frameSync);this.frameSync=null;return true;}
 setLayout(key,animate=false){
  // Legacy static-layout compatibility only. The shared animation controller owns
  // collision-aware, reversible transitions; it never uses the v1 straight morph.
  const layout=this.data.layouts[key];if(!layout)throw new Error('Unknown layout: '+key);
  for(const [name,t] of Object.entries(layout)){const n=this.nodes.find(n=>n.name===name);n.position=[...t.position];n.rotation=[0,Math.sin(t.rotationY/2),0,Math.cos(t.rotationY/2)];}
  this.layout=key;this.render();
 }
 pick(clientX,clientY){if(!this.ready||this.animating)return -1;const gl=this.gl,r=this.canvas.getBoundingClientRect(),x=Math.floor((clientX-r.left)/r.width*this.W),y=Math.floor((r.bottom-clientY)/r.height*this.H);this.updateWorld();gl.bindFramebuffer(gl.FRAMEBUFFER,this.pickFB);gl.viewport(0,0,this.W,this.H);gl.enable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);this.draw(this.programs.main,true);const p=new Uint8Array(4);gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);let i=p[0]+(p[1]<<8)+(p[2]<<16)-1;if(i>=0){let j=i;while(this.nodes[j].parent!==undefined){if(this.nodes[j].kind==='furniture'||['shell','wall','floor','decor'].includes(this.nodes[j].kind)){i=j;break;}j=this.nodes[j].parent;}}this.selected=i;this.render();return i;}
 async png(width=2200,height=1900){let old=[this.W,this.H],selected=this.selected;this.selected=-1;this.resize(width,height,1);this.render();const blob=await new Promise(r=>this.canvas.toBlob(r,'image/png'));this.selected=selected;this.resize(old[0],old[1],1);this.render();return blob;}
 dispose(){cancelAnimationFrame(this.animFrame);this.disposeTargets();this.gl.getExtension('WEBGL_lose_context')?.loseContext();}
}
window.SculptRenderer=SculptRenderer;window.SculptMath=M;
})();
