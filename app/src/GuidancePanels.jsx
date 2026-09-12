const sections = [
  ['confirmed', '已确认的需要'], ['hardConstraints', '始终保留'],
  ['preferences', '偏好'], ['hypotheses', '待你确认的理解'],
  ['rejected', '已经纠正'], ['unresolved', '待明确'],
];
const textOf = item => typeof item === 'string' ? item : item?.text ?? '';
const safeLink = value => { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; } };

export function RequirementSummary({ requirements, onCorrect, disabled }) {
  if (!requirements) return null;
  const populated = sections.filter(([key]) => requirements[key]?.length);
  if (!populated.length) return null;
  return <details className="guidance-summary" open>
    <summary>我们正在解决什么 <small>可随时纠正</small></summary>
    <div>{populated.map(([key, label]) => <section key={key} data-kind={key}><h3>{label}</h3><ul>{requirements[key].map((item, index) => <li key={item.id ?? `${key}-${index}`}><span>{textOf(item)}</span><button type="button" disabled={disabled} aria-label={`纠正：${textOf(item)}`} onClick={() => onCorrect(`我想纠正“${textOf(item)}”：`)}>纠正</button></li>)}</ul></section>)}</div>
  </details>;
}

export function TurnProvenance({ trace }) {
  if (!trace) return null;
  const sources = trace.sources ?? trace.retrievalSources ?? trace.retrieval?.sources ?? [];
  const duration = trace.durationMs ?? trace.elapsedMs ?? trace.timings?.totalMs;
  const thinking = trace.providerTrace?.parameters?.thinking;
  const reasoning = trace.providerTrace?.reasoning;
  return <details className="guidance-provenance"><summary>本轮依据与执行记录</summary>
    <dl><div><dt>实际来源</dt><dd>{trace.source === 'provider' ? `${trace.provider ?? 'AI'} · ${trace.model ?? trace.modelId ?? '模型未返回'}` : trace.source === 'demo-script' ? '预设演示' : trace.source === 'local' ? '本地规则' : trace.source ?? '未标明'}</dd></div>
      {(trace.requestId ?? trace.id ?? trace.traceId) && <div><dt>请求</dt><dd>{trace.requestId ?? trace.id ?? trace.traceId}</dd></div>}
      {Number.isFinite(duration) && <div><dt>用时</dt><dd>{(duration / 1000).toFixed(1)} 秒</dd></div>}
      {thinking && <div><dt>深度思考</dt><dd>{reasoning?.observed
        ? `接口已返回推理${Number.isFinite(reasoning.tokens) ? ` · ${reasoning.tokens} tokens` : ''}`
        : thinking === 'enabled' ? '已请求开启 · 接口未返回推理证据' : '未开启'}
        {thinking === 'enabled' && trace.providerTrace.parameters.reasoningEffort && ` · ${trace.providerTrace.parameters.reasoningEffort}`}</dd></div>}
      {trace.terminationReason && <div><dt>结果</dt><dd>{trace.terminationReason}</dd></div>}
      {trace.fallbackReason && <div><dt>降级原因</dt><dd>{trace.fallbackReason}</dd></div>}
    </dl>
    {sources.length > 0 && <ul aria-label="本轮资料来源">{sources.map((source, index) => <li key={source.id ?? index}>{safeLink(source.url) ? <a href={safeLink(source.url)} target="_blank" rel="noreferrer">{source.title ?? source.name ?? source.sourceId ?? `资料 ${index + 1}`}</a> : <span>{source.title ?? source.name ?? source.sourceId ?? `资料 ${index + 1}`}</span>}<small>{[source.location, source.scope, source.updatedAt].filter(Boolean).join(' · ')}</small></li>)}</ul>}
    <ol>{(trace.steps ?? []).map((step, index) => <li key={index}><span>{step.tool ?? step.name}</span><small>{step.ok ? '完成' : `未执行：${step.error?.message ?? step.error ?? '校验未通过'}`}</small></li>)}</ol>
  </details>;
}
