import { lazy, Suspense, useState } from 'react';
import { createReferenceHome, referenceHomeSource } from './domain/reference-home.js';
import { createSceneStore, dispatchSceneCommand, undoSceneCommand } from './domain/scene.js';
import './reference-home.css';
const PascalStage=lazy(()=>import('./PascalStage.jsx'));

export default function ReferenceHomePage(){
  const [store,setStore]=useState(()=>createSceneStore(createReferenceHome()));
  const [room,setRoom]=useState(null),[selection,setSelection]=useState(null),[view,setView]=useState({id:'camera-home-overview',sequence:0});
  const [mode,setMode]=useState('3d'),[feedback,setFeedback]=useState('此版本独立预览，不写入原项目。');
  const [editing,setEditing]=useState(false);
  const scene=store.currentScene;
  const focus=id=>{setRoom(id||null);setSelection(id?{kind:'room',id}:null);setView(v=>({id:id?scene.rooms.find(r=>r.id===id).cameraPresetIds[0]:'camera-home-overview',sequence:v.sequence+1}));};
  const select=value=>{setSelection(value);if(value?.kind==='room')focus(value.id);};
  const edit=command=>{try{const next=dispatchSceneCommand(store,command);setStore(next);setFeedback('已调整，可撤销；未写入原项目。');return true;}catch(e){setFeedback(e.message);return false;}};
  const selected=scene.objects.find(o=>o.id===selection?.id);
  return <main className="reference-home">
    <header><div><p>住宅参考 · 独立方案</p><h1>三室里的日常</h1></div><a href="/project/demo?style=agent-canvas">查看原方案</a></header>
    <div className="reference-home__layout"><section className="reference-home__workspace">
      <nav aria-label="参考户型视图"><select aria-label="前往房间" value={room??''} onChange={e=>focus(e.target.value)}><option value="">整屋总览</option>{scene.rooms.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select><button onClick={()=>focus(null)}>整屋</button><button aria-pressed={mode==='3d'} onClick={()=>setMode('3d')}>3D</button><button aria-pressed={mode==='2d'} onClick={()=>setMode('2d')}>2D 户型</button></nav>
      <div className="reference-home__canvas">{mode==='3d'?<Suspense fallback={<p>正在加载住宅…</p>}><PascalStage scene={scene} selection={selection} onSelect={select} onEditCommand={edit} activeRoomId={room} viewRequest={view} interactionMode={editing?'quick':'browse'}/></Suspense>:<svg viewBox="-400 -400 7400 11300" role="img" aria-label="同源二维户型，北向朝上">
        {scene.rooms.map(r=><g key={r.id}><polygon points={r.polygon.map(p=>`${p.x},${p.z}`).join(' ')} fill={r.kind==='bathroom'?'#d6ddd7':r.kind==='balcony'?'#c5d1ba':'#e7d6ba'} stroke="#f8f4ec" strokeWidth="35"/><text x={r.polygon.reduce((s,p)=>s+p.x,0)/r.polygon.length} y={r.polygon.reduce((s,p)=>s+p.z,0)/r.polygon.length} textAnchor="middle" fontSize="210" fill="#343b32">{r.name}</text></g>)}
        {scene.objects.map(o=><rect key={o.id} x={-o.dimensions.width/2} y={-o.dimensions.depth/2} width={o.dimensions.width} height={o.dimensions.depth} rx="40" fill="#ac9a7d" fillOpacity=".7" stroke="#716956" strokeWidth="20" transform={`translate(${o.transform.x} ${o.transform.z}) rotate(${-o.transform.rotationY*180/Math.PI})`}><title>{o.name}</title></rect>)}
        {scene.surfaces.filter(s=>s.kind==='wall').map(s=><line key={s.id} x1={s.edge.start.x} y1={s.edge.start.z} x2={s.edge.end.x} y2={s.edge.end.z} stroke="#64665c" strokeWidth={s.thickness}/>)}
        {scene.openings.map(o=>{const s=scene.surfaces.find(s=>s.id===o.hostSurfaceId),h=s.edge.start.z===s.edge.end.z;return <line key={o.id} x1={s.edge.start.x+(h?o.offset:0)} y1={s.edge.start.z+(h?0:o.offset)} x2={s.edge.start.x+(h?o.offset+o.width:0)} y2={s.edge.start.z+(h?0:o.offset+o.width)} stroke={o.kind==='window'?'#aac6ca':'#fbf7ed'} strokeWidth={s.thickness+15}/>;})}
      </svg>}</div>
    </section><aside><p>真实户型参考</p><h2>三室 · 两厅 · 两卫</h2><p>独立厨房，卧室过道，连接客厅的南向阳台。先让空间关系成立，再讨论装修风格。</p><p className="reference-home__note">来源标注建面约 89㎡，不是室内净面积。{referenceHomeSource.note}</p><a href={referenceHomeSource.url+'#page=8'} target="_blank" rel="noreferrer">查看原始户型图 · 第 8 页</a><hr/><div className="reference-home__actions"><button onClick={()=>setEditing(v=>!v)}>{editing?'结束微调':'微调家具'}</button></div><h3>{selected?.name??'选择一件家具'}</h3><p>进入微调后，点击家具即可调整 10 厘米，仍由原有空间规则检查。</p><div className="reference-home__actions"><button disabled={!selected?.capabilities.movable} onClick={()=>edit({type:'object.setTransform',objectId:selected.id,transform:{x:selected.transform.x-100}})}>向西 10cm</button><button disabled={!selected?.capabilities.movable} onClick={()=>edit({type:'object.setTransform',objectId:selected.id,transform:{x:selected.transform.x+100}})}>向东 10cm</button><button disabled={!store.cursor} onClick={()=>{setStore(undoSceneCommand(store));setFeedback('已撤销。');}}>撤销</button></div><p role="status">{feedback}</p><p className="reference-home__note">本轮确认户型和家具位置。卫浴设备、厨房电器尚未细化；刷新仅重置本预览，不影响原项目。</p></aside></div>
  </main>;
}
