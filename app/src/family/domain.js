/** Pure contracts. No transport, scene access, storage, or implicit approvals. */
export const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
export function createEventId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  // crypto.getRandomValues remains available for offline, opaque-origin previews.
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export function createDiscussionActionState(newId = createEventId) {
  let scope = null, epoch = 0, alive = false, active = null;
  const receipts = new Map();
  return {
    activate(nextScope) { if (scope !== nextScope) receipts.clear(); active?.controller.abort(); active = null; scope = nextScope; epoch += 1; alive = true; },
    invalidate() { alive = false; epoch += 1; active?.controller.abort(); active = null; },
    begin(expectedScope, name, payload) {
      if (!alive || active || scope !== expectedScope) return null;
      const fingerprint = JSON.stringify(canonical(payload));
      let receipt = receipts.get(name);
      if (!receipt || receipt.fingerprint !== fingerprint) { receipt = { fingerprint, eventId: newId() }; receipts.set(name, receipt); }
      active = { scope, epoch, name, eventId: receipt.eventId, controller: new AbortController() };
      return active;
    },
    isCurrent(action) { return !!action && alive && active === action && action.scope === scope && action.epoch === epoch; },
    finish(action) { if (!this.isCurrent(action)) return false; active = null; return true; },
  };
}
export function safeLink(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && /(^|\.)(feishu\.cn|larksuite\.com|larkoffice\.com)$/.test(u.hostname) ? u.href : null; } catch { return null; }
}
export const summarySources = (item = {}, opinions = []) => [...new Set(Array.isArray(item.sourceOpinionIds) ? item.sourceOpinionIds : [])].map(id => ({ id, opinion: opinions.find(o => o.id === id) ?? null }));
export function opinionPresentation(source = {}) {
  return { label: source.kind?.startsWith('feishu') ? '填写者未核验' : source.memberLabel ?? '我', invitedLabel: source.invitedLabel ?? source.memberLabel ?? '未指定', lastEditor: source.identityStatus === 'verified_record_editor' ? source.recordLastEditor?.name ?? source.recordLastEditor?.id ?? null : null };
}
export function summaryItemPresentation(item = {}, summary = {}) {
  const label = { intents: '已表达意向', agreed: '多条意见共同主题', conflicts: '意见记录差异', questions: '待明确' }[item.group] ?? '意见';
  const basis = item.comparisonBasis ?? summary.comparisonBasis;
  const comparison = ['record_comparison', 'aily_record_comparison'].includes(basis) || ['record_comparison', 'aily_record_comparison'].includes(item.origin);
  return { label, attribution: item.origin === 'source_opinion' ? '原意见直接引用' : comparison ? '按意见记录比较' : '', boundary: ['agreed', 'conflicts'].includes(item.group) ? '这是意见内容的整理，不代表成员共同确认；由你选择是否带回调整。' : '' };
}
export function summaryAttribution(summary) {
  if (summary?.provider === 'aily' && ['failed','error'].includes(summary.status)) return { title: '飞书 AI 整理未完成', by: '原意见仍保留，可重新请求整理', ready: false, isAI: false };
  if (summary?.provider === 'aily' && ['pending','running','processing'].includes(summary.status)) return { title: '飞书 AI 正在整理', by: '已返回处理中状态 · 尚无完成结果', ready: false, isAI: false };
  if (summary?.summaryOrigin === 'system_safety_label') return { title: '原意见摘录', by: '系统安全说明 · 不是飞书 AI 原文', ready: summary.status === 'ready', isAI: false };
  if (summary?.provider === 'aily' && summary.status === 'ready') return { title: '飞书 AI 整理', by: 'Aily · 按意见记录整理', ready: true, isAI: true };
  return { title: '整理状态待核实', by: '未同时取得 Aily 来源与完成状态，不显示为 AI 成功。', ready: false, isAI: false };
}
export function eligibility(item, discussion, versionId, needsRefresh = false) {
  if (!discussion || discussion.baseVersionId !== versionId) return '属于其他版本，仅供回看';
  if ((discussion.summary?.baseVersionId && discussion.summary.baseVersionId !== versionId) || (discussion.summary?.discussionId && discussion.summary.discussionId !== discussion.id)) return '整理属于其他版本或讨论';
  if (needsRefresh) return '原意见已变化，请重新整理';
  if (discussion.summary?.status !== 'ready') return '整理尚未完成';
  if (!item || !item.id || !item.text?.trim()) return '条目不完整';
  if (discussion.summary.items?.filter(i => i.id === item.id).length !== 1) return '条目标识不唯一，不能带回';
  const sources = summarySources(item, discussion.opinions);
  if (!sources.length || sources.some(s => !s.opinion)) return '来源缺失，不能带回';
  if (sources.some(s => (s.opinion.versionId && s.opinion.versionId !== versionId) || (s.opinion.discussionId && s.opinion.discussionId !== discussion.id))) return '引用意见属于其他版本或讨论';
  if (sources.some(s => discussion.opinions.filter(o => o.id === s.id).length !== 1)) return '来源标识不唯一，不能带回';
  if (discussion.summary.summaryOrigin === 'system_safety_label' && item.origin !== 'source_opinion') return '系统说明只能保留原意见直接引用';
  if (discussion.summary.provider !== 'aily' && item.origin !== 'source_opinion') return '未核实整理来源，不能带回';
  return '';
}
export function validSelection(ids, discussion, versionId, needsRefresh = false) {
  return [...new Set(ids)].filter(id => discussion?.summary?.items?.some(item => item.id === id && !eligibility(item, discussion, versionId, needsRefresh)));
}
export function parseParticipants(text) { return [...new Set(String(text).split(/[,，、]/).map(s => s.trim()).filter(Boolean))].slice(0,12).map(label => ({ label })); }
export function assertVersion(discussion, versionId) { if (!discussion || discussion.baseVersionId !== versionId) throw new Error('VERSION_MISMATCH'); return discussion; }
export function adoptionRequest(data, discussionId, versionId) {
  const a = data.adoption ?? data;
  if ((a.baseVersionId && a.baseVersionId !== versionId) || (a.versionId && a.versionId !== versionId) || (a.discussionId && a.discussionId !== discussionId)) throw new Error('VERSION_MISMATCH');
  if (typeof a.adjustmentRequest !== 'string' || !a.adjustmentRequest.trim()) throw new Error('ADOPTION_REQUEST_MISSING');
  return { request: a.adjustmentRequest, discussionId, baseVersionId: versionId };
}
export function displayError(error, action) {
  const code = String(error?.code ?? error?.message ?? 'UNKNOWN');
  if (code.includes('VERSION_MISMATCH')) return '返回的讨论版本不匹配。已阻止带回，请重新读取当前版本。';
  if (code.includes('AUTH')) return '飞书授权可能已失效。已有意见仍在；完成现有产品的授权流程后重试同步。';
  if (code.includes('ADOPTION_REQUEST_MISSING')) return '未取得有效的调整请求，尚未交给设计助理。可以重试。';
  if (error?.name === 'TimeoutError' || code.includes('TIMEOUT')) return '请求超时，结果尚未确认。保留当前内容；重试会复用同一次操作凭据。';
  return ({ load: '暂时无法读取讨论，请重试。', create: '暂时未能确认讨论是否建立。重试不会另起同一份讨论。', refresh: '暂时无法同步飞书；当前方案和已有意见仍然保留。', opinion: '意见尚未确认记录，输入内容已保留。', summarize: '这次整理未完成，原意见仍然保留。', adopt: '带回尚未确认。你的选择已保留，可以重试。' })[action] ?? '操作暂未完成，已有内容仍然保留。';
}
