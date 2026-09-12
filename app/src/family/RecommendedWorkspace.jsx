import React, { useEffect, useRef, useState } from 'react';
import { Button, Collection, GettingStarted, HandoffBar, NoSummary, RoleLegend, SelectionReview, SourceEvidence, StaleNotice, Status, SummaryHeading, SummaryItem, Tabs, VersionLock } from './ui.jsx';
export function SideNote({c, recommended, onReturn}) {
  const [tab,setTab]=useState(c.discussion?.summary?1:0);
  const [inspected,setInspected]=useState(null);
  const inspectTrigger=useRef(null);
  useEffect(()=>{if(c.discussion?.summary) setTab(1);},[c.discussion?.summary]);
  useEffect(()=>{setTab(c.discussion?.summary?1:0);setInspected(null);},[c.versionId]);
  return <><RoleLegend/>{!c.discussion ? <GettingStarted c={c} compact/> : <><Tabs labels={[`原始意见 ${c.discussion.opinions?.length??0}`,'AI 整理',`我的暂选 ${c.selected.length}`]} value={tab} onChange={i=>{setTab(i);setInspected(null);}}>
    {tab===0 ? <Collection c={c}/> : tab===1 ? c.discussion.summary ? <><SummaryHeading c={c}/>{c.discussion.summary.items?.map(item=><React.Fragment key={item.id}><SummaryItem item={item} c={c} onInspect={recommended ? (i,trigger)=>{inspectTrigger.current=trigger;setInspected(inspected?.id===i.id?null:i);} : undefined}/>{recommended&&inspected?.id===item.id&&<section className="fd-inline-evidence" aria-label="原话对照"><div className="fd-between"><h3>核对这一条</h3><Button tone="quiet" icon="close" aria-label="收起原话对照" onClick={()=>{setInspected(null);inspectTrigger.current?.focus();}}/></div><SourceEvidence item={item} discussion={c.discussion}/></section>}</React.Fragment>)}<Button className="fd-resummarize" onClick={c.summarize} disabled={c.locked}>重新整理</Button></> : <NoSummary c={c}/> : <SelectionReview c={c}/>}
  </Tabs><HandoffBar c={c} onReturn={onReturn}/></>}</>;
}
export function DiscussionFrame({c,mode='recommended',title='家庭意见',onReturn,children}) {
  return <article className={`fd fd-workspace fd-mode-${mode}`} aria-label="飞书家庭讨论" data-testid="family-workspace" onKeyDown={event=>event.stopPropagation()}>
    <header className="fd-header"><div><span className="fd-byline">我的生活空间 / 家庭意见</span><h2>{title}</h2></div>{onReturn && <Button tone="quiet" icon="back" onClick={onReturn} aria-label="返回个人设计">回设计</Button>}</header>
    <VersionLock c={c}/><Status c={c}/>{mode!=='archive'&&<StaleNotice c={c}/>}
    {c.busy==='load'&&!c.discussion?<div className="fd-load-placeholder"><div/><div/><p>只读取当前保存版本，不沿用其他版本的意见。</p></div>:c.error?.action==='load'&&!c.discussion?<div className="fd-empty"><h3>还没读到讨论状态</h3><p>先重试读取，不在结果未知时另建讨论。</p></div>:children}
  </article>;
}
export default function RecommendedWorkspace({c,onReturn}) {
  return <DiscussionFrame c={c} onReturn={onReturn}><SideNote c={c} recommended onReturn={onReturn}/></DiscussionFrame>;
}
