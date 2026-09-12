import { useEffect, useState } from 'react';

export default function ExperienceDocuments({ path, headers, disabled = false, onConstraints }) {
  const [expanded, setExpanded] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [kind, setKind] = useState('text');
  const [uri, setUri] = useState(() => `resident://${globalThis.crypto.randomUUID()}`);
  const [expectedRevision, setExpectedRevision] = useState(null);
  const [authorized, setAuthorized] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const ruleText = value => typeof value === 'string' ? value : '格式不正确';
  let constraintPreview = [];
  let jsonError = '';
  if (kind === 'json' && content.trim()) {
    try {
      const parsed = JSON.parse(content);
      if (parsed?.designConstraints !== undefined && !Array.isArray(parsed.designConstraints)) jsonError = 'designConstraints 必须是规则数组。';
      else constraintPreview = parsed?.designConstraints ?? [];
    } catch { jsonError = 'JSON 格式还不完整，请检查后再确认。'; }
  }
  const load = async () => {
    const response = await fetch(`${path}/documents`, { headers, signal: AbortSignal.timeout(12000) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message ?? data.error?.code ?? '资料暂时无法读取');
    setDocuments(data.documents ?? data.sources ?? []);
    if (Array.isArray(data.evidenceConstraints)) onConstraints?.(data.evidenceConstraints);
  };
  useEffect(() => { if (expanded) load().catch(error => setStatus(error.message)); }, [expanded, path]);
  const importDocument = async event => {
    event.preventDefault();
    if (busy || disabled || !authorized || !title.trim() || !content.trim() || jsonError) return;
    setBusy(true); setStatus('正在保存并建立本项目索引…');
    try {
      const response = await fetch(`${path}/documents`, { method: 'POST', headers, signal: AbortSignal.timeout(20000), body: JSON.stringify({ source: { title: title.trim(), uri, kind, authorized: true, authorization: 'user_provided', trust: 'user_confirmed' }, content, ...(expectedRevision === null ? {} : { expectedRevision }) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? data.error?.code ?? '资料导入未完成');
      setContent(''); setTitle(''); setAuthorized(false); setKind('text');
      setUri(`resident://${globalThis.crypto.randomUUID()}`);
      setExpectedRevision(null);
      await load();
      setStatus('资料已进入本项目。继续提需求时，AI 会读取适用的内容并标明来源。');
    } catch (error) { setStatus(error.message); }
    finally { setBusy(false); }
  };
  return <details className="guidance-documents" open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary>房屋资料 <small>{documents.length ? `${documents.length} 份` : '补充设计依据'}</small></summary>
    <div><p>上传你有权使用的文字资料，例如家具尺寸、户型说明和已确认的限制。房屋实时几何仍以当前场景为准。</p>
      {documents.length > 0 && <ul>{documents.map((document, index) => <li key={document.documentId ?? document.id ?? index}><strong>{document.title ?? document.source?.title ?? document.sourceId ?? '资料'}</strong><small>{document.updatedAt ?? document.source?.updatedAt} · 修订 {document.revision ?? 1}</small><button type="button" disabled={busy || disabled} onClick={() => { setUri(document.uri); setExpectedRevision(document.revision); setTitle(document.title); setKind(document.kind ?? 'text'); setContent(''); setAuthorized(false); setStatus('请粘贴这份资料的最新完整内容，保存后旧索引会失效。'); }}>更新这份资料</button></li>)}</ul>}
      <form onSubmit={importDocument}>
        <label>资料名称<input aria-label="资料名称" value={title} maxLength={140} onChange={event => setTitle(event.target.value)} /></label>
        <label className="guidance-file">读取资料文件<input type="file" accept=".txt,.md,.json,text/plain,text/markdown,application/json" onChange={async event => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 200000) { setStatus('请使用 200KB 以内的资料。'); return; } setUri(`resident://${globalThis.crypto.randomUUID()}`); setExpectedRevision(null); setTitle(file.name); setKind(/\.json$/i.test(file.name) ? 'json' : /\.md$/i.test(file.name) ? 'markdown' : 'text'); setAuthorized(false); setContent(await file.text()); }} /></label>
        <label>资料格式<select aria-label="资料格式" value={kind} onChange={event => { setKind(event.target.value); setAuthorized(false); }}><option value="text">普通文字</option><option value="markdown">Markdown</option><option value="json">JSON · 可含结构化约束</option></select></label>
        <textarea aria-label="资料内容" rows={4} maxLength={50000} placeholder="也可以直接粘贴资料原文…" value={content} onChange={event => { setContent(event.target.value); setAuthorized(false); }} />
        <p>普通文字作为参考依据；JSON 中的结构化约束会限制后续调整。实时几何仍以当前房屋为准。</p>
        {jsonError && <p role="alert">{jsonError}</p>}
        {constraintPreview.length > 0 && <section aria-label="待确认的结构化约束"><strong>请确认以下 {constraintPreview.length} 条规则</strong><ul>{constraintPreview.map((rule, index) => <li key={index}><strong>{ruleText(rule?.targetId)}</strong> · {({ no_new_objects: '不得新增家具', lock_transform: '不得移动或改变尺寸', material: '材质限制' })[ruleText(rule?.type)] ?? ruleText(rule?.type)}{Array.isArray(rule?.allowedMaterialIds) && <small>只允许：{rule.allowedMaterialIds.map(ruleText).join('、')}</small>}{Array.isArray(rule?.forbiddenMaterialIds) && <small>不能使用：{rule.forbiddenMaterialIds.map(ruleText).join('、')}</small>}</li>)}</ul></section>}
        <label className="guidance-authorized"><input type="checkbox" checked={authorized} onChange={event => setAuthorized(event.target.checked)} />{constraintPreview.length ? '我有权使用资料，并确认上述约束可限制本项目的调整' : '我有权使用这份资料，并同意用于此项目设计'}</label>
        <button type="submit" disabled={busy || disabled || !authorized || !title.trim() || !content.trim() || Boolean(jsonError)}>{busy ? '正在导入…' : '保存本项目资料'}</button>
      </form><p role="status">{status}</p>
    </div>
  </details>;
}
