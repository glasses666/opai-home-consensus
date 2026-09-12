import React, { useEffect, useId, useRef, useState } from 'react';
import { eligibility, opinionPresentation, parseParticipants, safeLink, summaryAttribution, summaryItemPresentation, summarySources } from './domain.js';
export function Icon({ name, size = 18 }) {
  const paths = { arrow: 'M4 12h15m-6-6 6 6-6 6', back: 'M20 12H5m6-6-6 6 6 6', close: 'm6 6 12 12M6 18 18 6', check: 'm5 12 4 4 10-10', book: 'M4 4h7v16H4V4Zm9 0h7v16h-7V4Z', link: 'm9 15 6-6m-8 8-1 1a4 4 0 0 1-6-6l4-4m13-1 1-1a4 4 0 0 1 6 6l-4 4', people: 'M4 20v-2a5 5 0 0 1 10 0v2m2-10a4 4 0 0 1 4 4v5M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z', source: 'M5 3h10l4 4v14H5V3Zm10 0v5h4M8 12h8m-8 4h6', refresh: 'M20 8a8 8 0 1 0 0 8M20 3v5h-5', chevron: 'm8 4 8 8-8 8', lock: 'M6 10h12v11H6V10Zm3 0V6a3 3 0 0 1 6 0v4', dot: 'M4 12h.01M12 12h.01M20 12h.01', clock: 'M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z' };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] ?? paths.source}/></svg>;
}
export function Button({ children, tone = 'secondary', icon, className = '', ...props }) { return <button type="button" className={`fd-btn fd-btn--${tone} ${className}`} {...props}>{icon && <Icon name={icon}/>}<span>{children}</span></button>; }
export function Dialog({ title, children, onClose, wide = false }) {
  const ref = useRef(null), id = useId();
  useEffect(() => { const dialog = ref.current; const previous = document.activeElement; dialog.showModal(); return () => { dialog.close(); if (previous?.isConnected) previous.focus(); }; }, []);
  return <dialog ref={ref} className={`fd-dialog fd ${wide ? 'fd-dialog--wide' : ''}`} aria-labelledby={id} onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose(); }} onKeyDown={event => { if (event.key !== 'Tab' || event.target.closest('dialog') !== ref.current) return; const nodes = [...ref.current.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary, [tabindex]:not([tabindex="-1"])')].filter(n => n.getClientRects().length); const first = nodes[0], last = nodes.at(-1); if (!first) { event.preventDefault(); return; } if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }} onClick={e => { if (e.target === ref.current) onClose(); }}><header><h2 id={id}>{title}</h2><Button icon="close" aria-label="关闭弹窗" onClick={onClose} tone="quiet"/></header>{children}</dialog>;
}
export function RawOpinion({ opinion, index, highlighted = false, compact = false }) {
  const p = opinionPresentation(opinion.source);
  return <article className={`fd-raw ${highlighted ? 'is-highlighted' : ''} ${compact ? 'is-compact' : ''}`} data-opinion-id={opinion.id}>
    <div className="fd-raw__by"><span className="fd-ref">{String((index ?? 0) + 1).padStart(2,'0')}</span><div><strong>{opinion.source?.kind?.startsWith('feishu') ? `「${p.invitedLabel}」意见栏` : '我填写的意见'}</strong><small>{opinion.source?.kind?.startsWith('feishu') ? p.label : '当前用户 · 原始记录'}</small></div></div>
    <blockquote>{opinion.text}</blockquote>
    {!compact && <details className="fd-provenance"><summary>记录与身份说明</summary><p>原意见 ID：<code>{opinion.id}</code></p><p>来源：{opinion.source?.kind ?? '未提供'} · {opinion.source?.sourceId ?? '未提供'}</p><p>记录时间：{opinion.createdAt ?? opinion.receivedAt ?? '未提供'}</p>{opinion.source?.kind?.startsWith('feishu') && <p>邀请称呼只是意见栏标签，不是已经核实的填写者身份。</p>}{p.lastEditor && <p>平台记录最近编辑者：{p.lastEditor}。这是整行最近编辑者，不是意见字段作者认证。</p>}</details>}
  </article>;
}
export function SourceEvidence({ item, discussion, compact = false }) {
  const sources = summarySources(item, discussion.opinions);
  return <div className="fd-evidence"><div className="fd-evidence__claim"><span className="fd-caption">待核对的整理条目</span><h3>{item.text}</h3><p>基于此讨论保存版本 · 来源不代表同意或授权</p></div><h3 className="fd-section-label">引用的成员原始意见</h3>{sources.length ? sources.map(({ id, opinion }) => {
    const record = discussion.opinionSlots?.find(s => s.recordId && s.recordId === opinion?.source?.recordId);
    const url = record?.entry?.isDirect && safeLink(record.entry.openUrl);
    return <div key={id}>{opinion ? <><RawOpinion opinion={opinion} index={discussion.opinions.findIndex(o => o.id === id)} compact={compact}/>{url && <a className="fd-external" href={url} target="_blank" rel="noreferrer">打开对应飞书记录 ↗</a>}</> : <div className="fd-alert"><strong>此来源不在当前讨论</strong><p><code>{id}</code></p><p>不能使用其他版本、其他讨论的意见替代它。此条不能带回。</p></div>}</div>;
  }) : <p className="fd-alert">没有可回查来源，不能带回。</p>}</div>;
}
export function SourceButton({ item, discussion, onInspect }) {
  const [open, setOpen] = useState(false);
  return <><button type="button" className="fd-source-button" onClick={event => onInspect ? onInspect(item, event.currentTarget) : setOpen(true)} aria-label={`回查原意见：${item.text}`}><Icon name="source" size={15}/>回查原意见 <span>{summarySources(item, discussion.opinions).length}</span></button>{open && <Dialog title="从整理，回到原话" onClose={() => setOpen(false)} wide><SourceEvidence item={item} discussion={discussion}/></Dialog>}</>;
}
export function SummaryItem({ item, c, onInspect, selectable = true, number }) {
  const presentation = summaryItemPresentation(item, c.discussion.summary);
  const reason = eligibility(item, c.discussion, c.versionId, c.needsRefresh);
  const chosen = c.selected.includes(item.id);
  return <article className={`fd-summary-item ${chosen ? 'is-selected' : ''} ${reason ? 'is-unavailable' : ''}`} data-item-id={item.id}>
    <div className="fd-summary-item__top"><span className="fd-kind">{number && `${number} / `}{presentation.label}</span>{chosen && <span className="fd-choice-tag">你的暂选</span>}</div>
    {selectable ? <label className="fd-checkline"><input type="checkbox" aria-label={`选择带回：${item.text}`} checked={chosen} disabled={c.locked || !!reason} onChange={() => c.select(item.id)}/><span>{item.text}</span></label> : <h3>{item.text}</h3>}
    <div className="fd-summary-item__bottom"><SourceButton item={item} discussion={c.discussion} onInspect={onInspect}/><small>{presentation.attribution === '原意见直接引用' ? '来自单条原意见' : presentation.attribution}</small></div>
    {reason && <p className="fd-inline-warning"><Icon name="lock" size={13}/>{reason}</p>}
  </article>;
}
export function TruthNotes() { return <details className="fd-truth"><summary>意见栏、填写者与访问权限</summary><p>邀请称呼不等于已核验身份；表格最近编辑者不等于意见作者。建立意见栏不会自动给其他账号授权。</p><p>飞书表可能包含其他讨论。请由表格所有者先核对本次记录的访问范围，不要直接共享整张表。</p></details>; }
export function VersionLock({ c }) { return <div className="fd-version-lock"><span><Icon name="lock" size={14}/><strong>{c.versionLabel}</strong> 已保存版本</span><span>意见只属于这一版</span></div>; }
export function RoleLegend() { return <div className="fd-role-legend"><span><i/>家人留下原话</span><span><i/>飞书 AI 整理</span><span><i/>你决定带回什么</span></div>; }
export function Status({ c }) {
  return <>{c.disabled && <div className="fd-alert"><strong>先处理当前设计，再开始讨论</strong><p>请先保留或撤销预览，并保存当前调整。此处可以阅读，暂不能提交。</p></div>}{c.error && <div className="fd-alert" role="alert"><strong>{c.error.text}</strong><Button onClick={c.retry} disabled={!!c.busy || (c.error.action !== 'load' && c.disabled)} icon="refresh">重试{({load:'读取',create:'建立讨论',refresh:'同步',opinion:'记录',summarize:'整理',adopt:'带回'})[c.error.action] ?? ''}</Button></div>}{c.needsRefresh && <p className="fd-alert">原意见已变化，旧暂选已清除。请重新整理后再选择带回。</p>}{c.notice && <p className="fd-status" role="status">{c.notice}</p>}{!c.busy && ['pending','running','processing'].includes(c.discussion?.summary?.status) && <div className="fd-pending" role="status"><p>已返回处理中状态，尚无完成结果。原意见仍可阅读。</p><Button onClick={c.load} disabled={!!c.busy} icon="refresh">刷新整理状态</Button></div>}{c.busy && <div className="fd-loading" role="status"><span aria-hidden="true"/>{({load:'正在读取此版本的讨论',create:'正在建立此版本的讨论',refresh:'正在同步意见；尚未确认新结果',opinion:'正在记录你的原意见',summarize:'飞书 AI 正在整理；原意见仍可阅读',adopt:'正在确认你的选择是否带回'})[c.busy]}…</div>}</>;
}
export function GettingStarted({ c, compact = false }) {
  const id = useId();
  return <section className={`fd-start ${compact ? 'is-compact' : ''}`}><div className="fd-start__number" aria-hidden="true">01</div><h3>把这一版，<br/>留给家人看看。</h3><p className="fd-lede">先有你的方案，再听听家人的想法。<br/>最后带回什么，仍然由你决定。</p><ol className="fd-simple-steps"><li><b>邀请</b><span>为家人留意见栏</span></li><li><b>整理</b><span>AI 梳理并附上原话</span></li><li><b>选择</b><span>你带回，助理做预览</span></li></ol><form onSubmit={e => { e.preventDefault(); c.create(); }}><label htmlFor={id}>给谁留意见栏？<small>多个称呼用顿号分开，最多 12 个</small></label><input id={id} value={c.participants} maxLength={200} onChange={e => c.setParticipants(e.target.value)} placeholder="例如：伴侣、父母" disabled={c.locked}/><Button tone="primary" icon="arrow" type="submit" disabled={c.locked || !parseParticipants(c.participants).length || new Set(c.participants.split(/[,，、]/).map(s=>s.trim()).filter(Boolean)).size>12}>为 {c.versionLabel} 发起讨论</Button></form><p className="fd-small">发起后，需求简报与此保存版本会一并用于飞书讨论。不自动发送群消息，也不自动授予权限。</p><TruthNotes/></section>;
}
export function InviteAccess({ c }) {
  const d = c.discussion;
  const link = [d?.formUrl,d?.recordUrl,d?.baseUrl,d?.feishuSync?.recordUrl,d?.sync?.recordUrl,d?.feishuDelivery?.recordUrl].map(safeLink).find(Boolean);
  return <section className="fd-access"><div className="fd-between"><h3>让家人留下原话</h3><span className="fd-small">非实时同步</span></div>{link ? <a className="fd-external" href={link} rel="noreferrer" target="_blank">打开飞书表格 ↗</a> : <p>飞书入口暂未返回。讨论已保留，可同步状态后继续。</p>}{d?.opinionSlots?.length > 0 && <details><summary>意见栏与访问方式（{d.opinionSlots.length}）</summary><ul className="fd-slots">{d.opinionSlots.map(slot => <li key={slot.id}><strong>{slot.participantLabel} · 邀请标签</strong>{slot.entry?.isDirect && safeLink(slot.entry.openUrl) ? <a href={safeLink(slot.entry.openUrl)} rel="noreferrer" target="_blank">打开对应意见记录 ↗</a> : <span>在有权访问的表格中搜索 Event ID：<code>{slot.entry?.lookup?.value ?? slot.eventId ?? '尚未返回'}</code></span>}<small>{slot.entry?.accessStatus === 'verified' ? '访问状态已核验' : '其他账号访问权限尚未核验'}</small></li>)}</ul></details>}<TruthNotes/><Button icon="refresh" disabled={c.locked} onClick={c.refresh}>同步飞书意见</Button></section>;
}
export function OpinionForm({ c }) { const id=useId(); return <form className="fd-opinion-form" onSubmit={c.addOpinion}><label htmlFor={id}>也记下你自己的想法</label><textarea id={id} value={c.draft} maxLength={2000} rows={3} onChange={e=>c.setDraft(e.target.value)} placeholder="希望保留什么？哪里仍需调整？" disabled={c.locked}/><Button type="submit" disabled={c.locked || !c.draft.trim()}>记录我的意见</Button><small>独立原始记录，不会直接改变方案。</small></form>; }
export function RawList({ c, compact = false, highlightedIds = [] }) { const opinions = c.discussion?.opinions ?? []; return <section><div className="fd-between fd-section-heading"><h3>成员原始意见</h3><span>{opinions.length} 条记录</span></div>{opinions.length ? opinions.map((o,i)=><RawOpinion key={o.id} opinion={o} index={i} highlighted={highlightedIds.includes(o.id)} compact={compact}/>) : <div className="fd-empty"><Icon name="book" size={30}/><h3>这里留给每一种想法</h3><p>尚未收到意见。不代表所有人都满意，也不用等齐所有人才能继续。</p></div>}</section>; }
export function OrganizePrompt({ c }) { return <section className="fd-organize"><div><h3>先整理，再做取舍</h3><p>飞书 AI 只梳理意见与差异，不替家人决定，也不修改 3D。</p></div><Button tone="primary" onClick={c.summarize} disabled={c.locked || !c.discussion?.opinions?.length}>请飞书 AI 整理</Button></section>; }
export function SummaryHeading({ c }) { const a = summaryAttribution(c.discussion?.summary); return <div className="fd-summary-heading"><span className="fd-byline">{a.by}</span><h3>{a.title}</h3><p>以下是意见内容的整理，不代表成员共同确认。回查原话，再由你暂选。</p></div>; }
export function SummaryList({ c, onInspect, filter }) { return <section><SummaryHeading c={c}/>{c.discussion.summary?.items?.filter(i=>!filter||filter(i)).map(i=><SummaryItem key={i.id} item={i} c={c} onInspect={onInspect}/>)}</section>; }
export function SelectionReview({ c }) { const items=c.discussion?.summary?.items?.filter(i=>c.selected.includes(i.id)) ?? []; return <section className="fd-review"><span className="fd-byline">当前用户的选择</span><h3>你准备带回的 {items.length} 条</h3><p>只是本次设计输入，不是家庭表决结果。</p>{items.length ? items.map(i=><SummaryItem item={i} c={c} key={i.id}/>) : <div className="fd-empty"><p>先在整理内容里暂选需要的条目。没有任何意见会被默认带回。</p></div>}</section>; }
export function HandoffBar({ c, onReturn }) {
  const [confirm,setConfirm]=useState(false);
  useEffect(()=>setConfirm(false),[c.versionId,c.disabled,c.discussion?.summary,c.selected.length===0]);
  if(c.delivered) return <div className="fd-handoff fd-handoff--sent"><div><strong>选择已带回 · 尚未保存</strong><small>预览是否完成，以设计助理实际返回为准。</small></div>{onReturn && <Button onClick={onReturn} icon="arrow">回设计助理</Button>}</div>;
  return <><footer className="fd-handoff"><Button tone="primary" icon="arrow" disabled={c.locked || !c.selected.length} onClick={()=>setConfirm(true)}>带回设计助理{c.selected.length ? `（${c.selected.length}）` : ''}</Button></footer>{confirm && <Dialog title="确认这次带回的意见" onClose={()=>setConfirm(false)}><VersionLock c={c}/><p className="fd-lede">只带回你选中的 {c.selected.length} 条。<br/>其他意见留在讨论中，不会一起进入调整。</p><ol className="fd-confirm-items">{c.discussion.summary.items.filter(i=>c.selected.includes(i.id)).map(i=><li key={i.id}>{i.text}<SourceButton item={i} discussion={c.discussion}/></li>)}</ol><div className="fd-next"><strong>接下来，由设计助理生成可撤销预览</strong><p>你再决定保留或撤销；保存新版本需要另一步确认。</p></div><div className="fd-dialog-actions"><Button onClick={()=>setConfirm(false)}>继续核对</Button><Button tone="primary" disabled={c.locked} onClick={()=>{setConfirm(false);c.adopt();}}>确认带回，不保存</Button></div></Dialog>}</>;
}
export function StaleNotice({ c }) { return c.history?.length ? <details className="fd-history"><summary>旧版本意见仍保留 · 不会套用到 {c.versionLabel}</summary>{c.history.map(h=><section key={h.discussion.id}><h3>{h.versionLabel} · 仅供回看</h3><p>这组意见属于 {h.versionLabel}，不能带回当前 {c.versionLabel}。</p>{h.discussion.opinions?.map((o,i)=><RawOpinion key={o.id} opinion={o} index={i} compact/>)}</section>)}</details> : null; }

export function Tabs({ labels, value, onChange, children }) {
  const id=useId();
  return <><div className="fd-tabs" role="tablist" aria-label="家庭意见内容">{labels.map((label,i)=><button key={label} type="button" role="tab" id={`${id}-tab-${i}`} aria-controls={`${id}-panel`} aria-selected={i===value} tabIndex={i===value?0:-1} onClick={()=>onChange(i)} onKeyDown={e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const n=e.key==='Home'?0:e.key==='End'?labels.length-1:(value+(e.key==='ArrowRight'?1:-1)+labels.length)%labels.length;onChange(n);document.getElementById(`${id}-tab-${n}`)?.focus();}}}>{label}</button>)}</div><div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${value}`}>{children}</div></>;
}
export function Collection({c}) { return <div className="fd-collection"><InviteAccess c={c}/><RawList c={c}/><OpinionForm c={c}/><OrganizePrompt c={c}/></div>; }
export function NoSummary({c}) { if(['pending','running','processing'].includes(c.discussion?.summary?.status))return <><SummaryHeading c={c}/><p>可以先读原意见，稍后刷新整理状态。当前没有可带回的结果。</p></>; return <><div className="fd-empty"><Icon name="book" size={32}/><h3>整理内容还没到这里</h3><p>原话始终保留。收到意见后，可以请飞书 AI 整理，也可以先继续自己的设计。</p></div><OrganizePrompt c={c}/></>; }
