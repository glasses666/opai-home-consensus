import { useEffect, useRef, useState } from 'react';

const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;

// One synchronous lock and one stable receipt per unchanged user intention.
// Kept outside React scheduling so two clicks in one tick cannot both submit.
export function createDiscussionActionState(newId = () => globalThis.crypto.randomUUID()) {
  let scope = null, epoch = 0, alive = false, active = null;
  const receipts = new Map();
  return {
    activate(nextScope) {
      if (scope !== nextScope) receipts.clear();
      active?.controller.abort(); active = null; scope = nextScope; epoch += 1; alive = true;
    },
    invalidate() { alive = false; epoch += 1; active?.controller.abort(); active = null; },
    begin(expectedScope, name, payload) {
      if (!alive || active || scope !== expectedScope) return null;
      const fingerprint = JSON.stringify(canonical(payload));
      let receipt = receipts.get(name);
      if (!receipt || receipt.fingerprint !== fingerprint) {
        receipt = { fingerprint, eventId: newId() }; receipts.set(name, receipt);
      }
      active = { scope, epoch, name, eventId: receipt.eventId, controller: new AbortController() };
      return active;
    },
    isCurrent(action) { return alive && active === action && action.scope === scope && action.epoch === epoch; },
    finish(action) { if (!this.isCurrent(action)) return false; active = null; return true; },
  };
}
const safeLink = value => { try { const url = new URL(value); return url.protocol === 'https:' && /(^|\.)(feishu\.cn|larksuite\.com|larkoffice\.com)$/.test(url.hostname) ? url.href : null; } catch { return null; } };
const textOf = value => typeof value === 'string' ? value : value?.text ?? value?.summary ?? '';
export const summarySources = (item, opinions = []) => (Array.isArray(item.sourceOpinionIds) ? item.sourceOpinionIds : []).map(id => ({ id, opinion: opinions.find(opinion => opinion.id === id) ?? null }));
export function summaryItemPresentation(item = {}, summary = {}) {
  const label = { intents: '已表达意向', agreed: '多条意见共同主题', conflicts: '意见记录差异', questions: '待明确' }[item.group] ?? '意见';
  const basis = item.comparisonBasis ?? summary.comparisonBasis;
  const recordComparison = basis === 'record_comparison' || basis === 'aily_record_comparison'
    || item.origin === 'record_comparison' || item.origin === 'aily_record_comparison';
  return {
    label,
    attribution: item.origin === 'source_opinion' ? '原意见直接引用' : recordComparison ? '按意见记录比较' : '',
    // Even verified identities do not establish agreement or authorize adoption.
    boundary: item.group === 'agreed' || item.group === 'conflicts' ? '这是意见内容的整理，不代表成员共同确认；由你选择是否带回调整。' : '',
  };
}
export function opinionPresentation(source = {}) {
  return {
    label: source.kind?.startsWith('feishu') ? '填写者未核验' : source.memberLabel ?? '我',
    invitedLabel: source.invitedLabel ?? source.memberLabel ?? '未指定',
    lastEditor: source.identityStatus === 'verified_record_editor' ? source.recordLastEditor?.name ?? source.recordLastEditor?.id ?? null : null,
  };
}

export default function ExperienceDiscussion({ path, headers, versionId, versionLabel, requirements, disabled, onAdopt }) {
  const [discussion, setDiscussion] = useState(null);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [opinion, setOpinion] = useState('');
  const [selected, setSelected] = useState([]);
  const [participantLabels, setParticipantLabels] = useState('家人');
  const scope = `${path}\u0000${versionId}`;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const actionsRef = useRef(null);
  if (!actionsRef.current) actionsRef.current = createDiscussionActionState();
  const deliveredAdoptions = useRef(new Set());
  const isCurrent = action => scopeRef.current === action.scope && actionsRef.current.isCurrent(action);
  const api = async (action, suffix = '', body) => {
    if (!isCurrent(action)) throw new Error('DISCUSSION_VIEW_CHANGED');
    const response = await fetch(`${path}/discussions${suffix}`, { method: body ? 'POST' : 'GET', headers, signal: AbortSignal.any([action.controller.signal, AbortSignal.timeout(90000)]), ...(body ? { body: JSON.stringify({ ...body, eventId: action.eventId }) } : {}) });
    const data = await response.json();
    if (!isCurrent(action)) throw new Error('DISCUSSION_VIEW_CHANGED');
    if (!response.ok) throw new Error(data.error?.message ?? data.error?.code ?? data.error ?? '讨论暂未完成，请重试');
    return data;
  };
  useEffect(() => {
    const state = actionsRef.current;
    state.activate(scope);
    const action = state.begin(scope, 'load', { versionId });
    setDiscussion(null); setSelected([]); setOpinion(''); setBusy('load'); setNotice('正在读取此版本的讨论…');
    api(action, `?versionId=${encodeURIComponent(versionId)}`).then(data => { if (isCurrent(action)) { setDiscussion(data.discussions?.filter(item => item.baseVersionId === versionId).at(-1) ?? null); setNotice(''); } }).catch(error => { if (isCurrent(action)) setNotice(error.message); }).finally(() => { if (scopeRef.current === action.scope && state.finish(action)) setBusy(''); });
    return () => state.invalidate();
  }, [path, versionId]);
  const perform = async (name, payload, task) => {
    if (disabled) return;
    const action = actionsRef.current.begin(scope, name, payload);
    if (!action) return;
    setBusy(name); setNotice('');
    try { await task(action); }
    catch (error) { if (isCurrent(action)) setNotice(String(error.message)); }
    finally { if (scopeRef.current === action.scope && actionsRef.current.finish(action)) setBusy(''); }
  };
  const create = () => {
    const participants = participantLabels.split(/[,，、]/).map(label => label.trim()).filter(Boolean).slice(0, 12).map(label => ({ label }));
    if (!participants.length) return;
    const payload = { versionId, brief: requirements, participants };
    return perform('create', payload, async action => {
      const data = await api(action, '', payload);
      if (!isCurrent(action)) return;
      setDiscussion(data.discussion ?? data);
      setNotice('讨论已绑定这版方案。飞书连接完成后，可以打开资料并邀请家人填写意见。');
    });
  };
  const refresh = () => perform('refresh', { discussionId: discussion.id, versionId }, async action => {
    await api(action, `/${discussion.id}/sync`, { versionId });
    const data = await api(action, `/${discussion.id}`);
    if (isCurrent(action)) { setDiscussion(data.discussion ?? data); setNotice('已读取最新讨论状态。'); }
  });
  const addOpinion = event => {
    event.preventDefault();
    if (!opinion.trim()) return;
    const payload = { versionId, source: { kind: 'product_form', sourceId: 'current-resident', memberLabel: '我' }, text: opinion.trim() };
    return perform('opinion', { discussionId: discussion.id, ...payload }, async action => {
      const data = await api(action, `/${discussion.id}/opinions`, payload);
      const latest = data.discussion ? data : await api(action, `/${discussion.id}`);
      if (isCurrent(action)) { setDiscussion(latest.discussion ?? latest); setOpinion(''); setNotice('你的意见已记录，来源与方案版本会一并保留。'); }
    });
  };
  const summarize = () => perform('summarize', { discussionId: discussion.id, versionId, opinions: discussion.opinions }, async action => {
    const data = await api(action, `/${discussion.id}/summarize`, { versionId });
    const latest = data.discussion ? data : await api(action, `/${discussion.id}`);
    if (!isCurrent(action)) return;
    setDiscussion(latest.discussion ?? latest); setSelected([]);
    const result = data.summary ?? latest.discussion?.summary ?? latest.summary;
    setNotice(result?.summaryOrigin === 'system_safety_label' ? '已整理可回查的原意见；系统说明不代表飞书 AI 结论。' : result?.provider === 'aily' && result?.status === 'ready' ? '飞书 AI 已整理意见，由你选择哪些进入下一次调整。' : '整理还未完成，成员意见仍然保留。');
  });
  const adopt = () => perform('adopt', { discussionId: discussion.id, versionId, selectedItemIds: [...selected].sort() }, async action => {
    const data = await api(action, `/${discussion.id}/adopt`, { versionId, selectedItemIds: [...selected].sort() });
    if (!isCurrent(action)) return;
    if (data.discussion) setDiscussion(data.discussion);
    if (deliveredAdoptions.current.has(action.eventId)) { setNotice('采纳已交给设计助理，请在设计助理中预览或重试，不会重复发起调整。'); return; }
    deliveredAdoptions.current.add(action.eventId);
    await onAdopt({ request: (data.adoption ?? data).adjustmentRequest, discussionId: discussion.id, baseVersionId: versionId });
  });
  const summary = discussion?.summary;
  const link = [discussion?.formUrl, discussion?.recordUrl, discussion?.baseUrl, discussion?.feishuSync?.recordUrl, discussion?.sync?.recordUrl, discussion?.feishuDelivery?.recordUrl].map(safeLink).find(Boolean);
  return <article className="panel experience-discussion" aria-label="飞书家庭讨论">
    <header><UsersIcon /><div><h2>邀请家人一起看</h2><p>在你自己的方案之后，让不同意见有处可放。</p></div></header>
    <div className="experience-discussion__version"><strong>{versionLabel}</strong><span>意见只属于这版方案</span></div>
    {disabled && <p className="experience-discussion__notice">请先保留或撤销预览，并保存当前调整，再开始讨论。</p>}
    {!discussion ? <><p>需求简报与当前方案会一起进入飞书。每条意见分别记录，飞书 AI 整理共同主题、意见记录差异和待明确的问题；只有你选中并带回的意见才进入调整。</p><label>给谁留意见栏<input className="experience-discussion__participants" aria-label="邀请讨论的称呼" value={participantLabels} maxLength={200} onChange={event => setParticipantLabels(event.target.value)} placeholder="例如：伴侣、父母" /></label><p><small>称呼只是邀请标签，不是已核验的意见作者；平台记录最近编辑者也不等于意见字段作者。建立意见栏不会自动授予其他账号权限。</small></p><button disabled={disabled || Boolean(busy) || !participantLabels.trim()} onClick={create}>{busy === 'create' ? '正在建立讨论…' : '为当前方案发起讨论'}</button></> : <>
      <div className="experience-discussion__actions">{link && <a href={link} target="_blank" rel="noreferrer">打开飞书表格 ↗</a>}<button disabled={disabled || Boolean(busy)} onClick={refresh}>{busy === 'refresh' ? '正在同步…' : '同步飞书意见'}</button></div>
      {!link && <p className="experience-discussion__notice">讨论已保留。飞书入口暂未返回，请同步状态；若授权失效，完成登录后可继续。</p>}
      {discussion.opinionSlots?.length > 0 && <><ul className="experience-discussion__slots">{discussion.opinionSlots.map(slot => <li key={slot.id}>{slot.entry?.isDirect && safeLink(slot.entry.openUrl) ? <a href={safeLink(slot.entry.openUrl)} target="_blank" rel="noreferrer">{slot.participantLabel} · 打开对应意见记录 ↗</a> : <><span>{slot.participantLabel} · 在表格内定位意见栏</span><small>搜索 Event ID：<code>{slot.entry?.lookup?.value ?? slot.eventId}</code></small></>}<small>邀请标签：{slot.participantLabel} · {slot.entry?.accessStatus === 'verified' ? '访问状态已核验' : '其他账号访问权限尚未核验'}</small></li>)}</ul><p className="experience-discussion__notice">仅在有权访问的意见记录中填写“意见”。本表可能含其他讨论，不要直接将整张表共享给成员；请先由表格所有者核对本次讨论的访问范围。</p></>}
      <section><h3>成员原始意见</h3>{discussion.opinions?.length ? <ul className="experience-discussion__opinions">{discussion.opinions.map(item => <li key={item.id ?? item.opinionId}><strong>{opinionPresentation(item.source).label}<small>{item.source?.kind?.startsWith('feishu') ? `来自飞书 · 邀请标签：${opinionPresentation(item.source).invitedLabel}` : '当前用户填写'}</small></strong>{opinionPresentation(item.source).lastEditor && <small>平台记录最近编辑者：{opinionPresentation(item.source).lastEditor}。这是整行最近编辑者，不是意见字段作者认证。</small>}<p>{item.text}</p><small>{item.createdAt ?? item.receivedAt}</small></li>)}</ul> : <p>尚未收到意见。</p>}</section>
      <form onSubmit={addOpinion}><label>补充我自己的意见<textarea value={opinion} maxLength={2000} rows={3} aria-label="我的讨论意见" disabled={disabled || Boolean(busy)} onChange={event => setOpinion(event.target.value)} placeholder="我希望保留什么，或哪里还需要调整…" /></label><button disabled={disabled || Boolean(busy) || !opinion.trim()}>{busy === 'opinion' ? '正在记录…' : '记录我的意见'}</button></form>
      <button className="experience-discussion__summarize" disabled={disabled || Boolean(busy) || !discussion.opinions?.length} onClick={summarize}>{busy === 'summarize' ? '飞书 AI 正在整理…' : '请飞书 AI 整理意见'}</button>
      {summary?.status === 'ready' && <section className="experience-discussion__summary"><h3>{summary.summaryOrigin === 'system_safety_label' ? '意见整理 · 系统安全说明' : '飞书 AI 整理'} <small>{summary.summaryOrigin !== 'system_safety_label' && (summary.provider === 'aily' ? 'Aily' : summary.provider)}</small></h3><p>{textOf(summary.summary)}</p>{summary.summaryOrigin === 'system_safety_label' && <small>这段说明由系统生成，不是飞书 AI 原文；下列直接引用项保留原意见来源。</small>}{summary.items?.map(item => {
        const presentation = summaryItemPresentation(item, summary);
        return <div key={item.id}><label><input type="checkbox" aria-label={`选择带回：${item.text}`} disabled={disabled || Boolean(busy) || !summarySources(item, discussion.opinions).length || summarySources(item, discussion.opinions).some(source => !source.opinion)} checked={selected.includes(item.id)} onChange={event => setSelected(values => event.target.checked ? [...values, item.id] : values.filter(id => id !== item.id))} /><span><small>{presentation.label}{presentation.attribution ? ` · ${presentation.attribution}` : ''}</small>{item.text}</span></label>{presentation.boundary && <small>{presentation.boundary}</small>}<SummarySourceDetails item={item} discussion={discussion} /></div>;
      })}<button disabled={disabled || Boolean(busy) || !selected.length} onClick={adopt}>将选中意见带回设计助理</button><small>勾选只是暂选；点击带回才提交你的选择。新的方案仍需你预览、保留和保存。</small></section>}
    </>}
    <p className="experience-discussion__notice" role="status">{notice}</p>
  </article>;
}

function UsersIcon() { return <span className="experience-discussion__icon" aria-hidden="true">◎</span>; }

function SummarySourceDetails({ item, discussion }) {
  const sources = summarySources(item, discussion.opinions);
  return <details><summary>回查原意见（{sources.length}）</summary>{sources.length ? <ul>{sources.map(({ id, opinion }) => {
    const record = discussion.opinionSlots?.find(slot => slot.recordId && slot.recordId === opinion?.source?.recordId);
    const link = record?.entry?.isDirect ? safeLink(record.entry.openUrl) : null;
    return <li key={id}><small>原意见 ID：{id}</small>{opinion ? <><p>{opinion.text}</p><small>{opinion.source?.kind} · {opinion.source?.sourceId} · {opinion.createdAt ?? opinion.receivedAt}</small>{opinion.source?.kind?.startsWith('feishu') && <small>邀请标签：{opinion.source.invitedLabel ?? opinion.source.memberLabel ?? '未指定'}；填写者未核验。</small>}{opinion.source?.identityStatus === 'verified_record_editor' && opinion.source.recordLastEditor && <small>平台记录最近编辑者：{opinion.source.recordLastEditor.name ?? opinion.source.recordLastEditor.id}（仅整行编辑记录）。</small>}{link && <a href={link} target="_blank" rel="noreferrer">打开对应飞书记录 ↗</a>}</> : <p>此来源不在当前讨论，不能据此采纳。</p>}</li>;
  })}</ul> : <p>没有可回查的原意见来源，不能据此采纳。</p>}</details>;
}
