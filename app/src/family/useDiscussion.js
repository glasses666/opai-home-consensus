import { useEffect, useRef, useState } from 'react';
import { adoptionRequest, assertVersion, canonical, createDiscussionActionState, displayError, eligibility, parseParticipants, validSelection } from './domain.js';
const defaultTransport = (url, options) => fetch(url, options);
const fingerprint = value => JSON.stringify(canonical(value));
/** Existing REST boundary only. transport is injected exclusively by the fixture lab. */
export function useDiscussion({ path, headers, versionId, versionLabel, requirements, disabled = false, onAdopt, transport = defaultTransport, timeoutMs = 90000 }) {
  const scope = `${path}\u0000${versionId}`;
  const scopeRef = useRef(scope); scopeRef.current = scope;
  const disabledRef = useRef(disabled); disabledRef.current = disabled;
  const propsRef = useRef({}); propsRef.current = { headers, onAdopt, transport };
  const actions = useRef(null); if (!actions.current) actions.current = createDiscussionActionState();
  const delivered = useRef(new Set());
  const history = useRef(new Map());
  const [state, setState] = useState({ scope, discussion: null, busy: 'load', error: null, notice: '', selected: [], needsRefresh: false, delivered: null });
  const latest = useRef(state); latest.current = state;
  const [participants, setParticipants] = useState('伴侣、父母');
  const [draft, setDraft] = useState('');
  const current = action => scopeRef.current === action?.scope && actions.current.isCurrent(action);
  const change = patch => setState(s => s.scope === scopeRef.current ? { ...s, ...patch } : s);
  function accept(d, name) {
    assertVersion(d, versionId);
    const before = latest.current.discussion;
    const changed = !!before && (fingerprint(before.opinions) !== fingerprint(d.opinions) || fingerprint(before.summary) !== fingerprint(d.summary));
    const opinionsChanged = !!before && fingerprint(before.opinions) !== fingerprint(d.opinions);
    history.current.set(scope, { discussion: d, versionLabel, path });
    change({ discussion: d, ...(changed ? { selected: [] } : {}), ...(name === 'summarize' ? { needsRefresh: false, selected: [] } : opinionsChanged && before?.summary ? { needsRefresh: true } : {}) });
  }
  async function api(action, suffix = '', body) {
    if (!current(action)) throw new Error('VIEW_CHANGED');
    if (action.signal?.aborted) throw action.signal.reason;
    const requestHeaders = new Headers(propsRef.current.headers);
    if (body && !requestHeaders.has('Content-Type')) requestHeaders.set('Content-Type', 'application/json');
    const response = await propsRef.current.transport(`${path}/discussions${suffix}`, { method: body ? 'POST' : 'GET', headers: requestHeaders, signal: action.signal, ...(body ? { body: JSON.stringify({ ...body, eventId: action.eventId }) } : {}) });
    const data = await response.json();
    if (!current(action)) throw new Error('VIEW_CHANGED');
    if (action.signal?.aborted) throw action.signal.reason;
    if (!response.ok) { const e = new Error(data.error?.code ?? data.error?.message ?? 'REQUEST_FAILED'); e.code = data.error?.code; throw e; }
    return data;
  }
  async function run(name, payload, task, readOnly = false) {
    if (!readOnly && disabledRef.current) return;
    const action = actions.current.begin(scope, name, payload);
    if (!action) return;
    // One deadline spans the entire action, including a POST followed by a GET.
    action.signal = AbortSignal.any([action.controller.signal, AbortSignal.timeout(timeoutMs)]);
    change({ busy: name, error: null, notice: '' });
    try { await task(action); }
    catch (error) { if (current(action)) change({ error: { action: name, text: displayError(error, name) } }); }
    finally { if (scopeRef.current === action.scope && actions.current.finish(action)) change({ busy: '' }); }
  }
  const load = () => run('load', { versionId }, async a => {
    const data = await api(a, `?versionId=${encodeURIComponent(versionId)}`);
    const d = data.discussions?.filter(d => d.baseVersionId === versionId).at(-1) ?? null;
    if (d) accept(d, 'load'); else change({ discussion: null, selected: [] });
  }, true);
  useEffect(() => {
    actions.current.activate(scope);
    setState({ scope, discussion: null, busy: 'load', error: null, notice: '', selected: [], needsRefresh: false, delivered: null });
    setDraft('');
    // change() is scope-checked; responses from old scopes cannot affect new views.
    load();
    return () => actions.current.invalidate();
  }, [path, versionId]);
  const create = () => {
    const labels = parseParticipants(participants);
    if (!labels.length) return;
    const payload = { versionId, brief: requirements, participants: labels };
    return run('create', payload, async a => { const data = await api(a, '', payload); accept(data.discussion ?? data, 'create'); change({ notice: '讨论已绑定此保存版本。意见栏不等于已授权邀请。' }); });
  };
  const refresh = () => {
    const d = latest.current.discussion; if (!d || d.baseVersionId !== versionId) return;
    return run('refresh', { discussionId: d.id, versionId }, async a => { await api(a, `/${encodeURIComponent(d.id)}/sync`, { versionId }); const data = await api(a, `/${encodeURIComponent(d.id)}`); accept(data.discussion ?? data, 'refresh'); change({ notice: '已读取讨论状态；不是实时在线状态。' }); });
  };
  const addOpinion = event => {
    event?.preventDefault(); const d = latest.current.discussion;
    if (!draft.trim() || !d || d.baseVersionId !== versionId) return;
    const payload = { versionId, source: { kind: 'product_form', sourceId: 'current-resident', memberLabel: '我' }, text: draft.trim() };
    return run('opinion', { discussionId: d.id, ...payload }, async a => { const data = await api(a, `/${encodeURIComponent(d.id)}/opinions`, payload); const full = data.discussion ? data : await api(a, `/${encodeURIComponent(d.id)}`); accept(full.discussion ?? full, 'opinion'); setDraft(''); change({ notice: '你的原意见已记录。重新整理后再选择，避免沿用旧摘要。' }); });
  };
  const summarize = () => {
    const d = latest.current.discussion; if (!d?.opinions?.length || d.baseVersionId !== versionId) return;
    return run('summarize', { discussionId: d.id, versionId, opinions: d.opinions }, async a => { const data = await api(a, `/${encodeURIComponent(d.id)}/summarize`, { versionId }); const full = data.discussion ? data : await api(a, `/${encodeURIComponent(d.id)}`); accept(full.discussion ?? full, 'summarize'); change({ notice: '已读取整理返回状态。请核对来源，再由你选择。' }); });
  };
  const select = id => {
    const s = latest.current;
    if (disabledRef.current || s.busy || s.delivered || s.scope !== scope) return;
    const item = s.discussion?.summary?.items?.find(i => i.id === id);
    if (eligibility(item, s.discussion, versionId, s.needsRefresh)) return;
    setState(old => ({ ...old, selected: old.selected.includes(id) ? old.selected.filter(i => i !== id) : [...old.selected, id] }));
  };
  const adopt = () => {
    const s = latest.current, d = s.discussion;
    if (s.scope !== scope || !d || s.delivered) return;
    const ids = validSelection(s.selected, d, versionId, s.needsRefresh).sort();
    if (!ids.length || ids.length !== s.selected.length) { change({ selected: ids, error: { action: 'selection', text: '部分来源已失效。请重新核对有效条目，再带回。' } }); return; }
    return run('adopt', { discussionId: d.id, versionId, selectedItemIds: ids }, async a => {
      const data = await api(a, `/${encodeURIComponent(d.id)}/adopt`, { versionId, selectedItemIds: ids });
      if (data.discussion) accept(data.discussion, 'adopt');
      if (disabledRef.current) { change({ error: { action: 'adopt', text: '当前设计状态已改变，未调用设计助理。请先处理预览，再重试。' } }); return; }
      const request = adoptionRequest(data, d.id, versionId);
      if (delivered.current.has(a.eventId)) return;
      delivered.current.add(a.eventId);
      change({ delivered: { ids, request, eventId: a.eventId }, notice: '选择已交给设计助理；是否生成预览，以助理返回为准。尚未保存。' });
      try { await propsRef.current.onAdopt?.(request); }
      catch { if (current(a)) change({ notice: '已完成带回，但设计助理未完成预览。请回设计助理重试，不会重复提交意见。' }); }
    });
  };
  const retry = () => ({ load, create, refresh, opinion: addOpinion, summarize, adopt }[state.error?.action]?.());
  const actual = state.scope === scope ? state : { ...state, scope, discussion: null, busy: 'load', selected: [], error: null, delivered: null, notice: '' };
  return { ...actual, path, versionId, versionLabel, disabled, participants, setParticipants, draft, setDraft, create, refresh, addOpinion, summarize, select, adopt, retry, load, history: [...history.current.entries()].filter(([key,v]) => key !== scope && v.path === path).map(([,v]) => v), selected: validSelection(actual.selected, actual.discussion, versionId, actual.needsRefresh), locked: disabled || !!actual.busy || !!actual.delivered };
}
