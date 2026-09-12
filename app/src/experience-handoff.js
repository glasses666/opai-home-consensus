import { formatResidentMessage } from './conversation-presentation.js';

const array = value => Array.isArray(value) ? value : [];
const text = value => {
  const candidate = typeof value === 'string' || typeof value === 'number' ? value : value?.text ?? value?.label ?? value?.name;
  return typeof candidate === 'string' || typeof candidate === 'number' ? String(candidate) : '';
};
const md = value => text(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/([\\`*_[\]#|])/g, '\\$1').replace(/\r?\n/g, ' / ');
const show = value => md(value) || '未提供';
const list = (title, items, empty = '暂无记录。') => `## ${title}\n\n${array(items).length ? array(items).map(item => `- ${show(item)}`).join('\n') : empty}\n\n`;
const recordSource = source => [source?.kind, source?.sourceId ?? source?.recordId].filter(Boolean).map(md).join(' · ') || '未提供来源';

// Export only user-facing product facts. Never infer benefit, agreement, or
// construction readiness from model output or the presence of a saved version.
export function formatExperienceHandoff(data = {}) {
  const requirements = data.requirements ?? data.brief ?? {};
  let result = `# OPAI · 生活需求与空间调整简报\n\n项目：${show(data.projectId)}\n\n当前保存版本：${show(data.versionLabel ?? data.versionId)}\n\n生成时间：${show(data.generatedAt)}\n\n`;
  result += '> 这是用户概念设计与需求交接记录。保存方案不等于全体家人同意，也不等于施工确认。\n\n';
  result += list('用户原话', array(requirements.utterances).map(item => ({ text: formatResidentMessage(text(item)) })), '本记录未附用户原话。');
  result += list('已经确认的需要', requirements.confirmed);
  result += list('必须遵守的限制', requirements.hardConstraints);
  result += list('偏好与取舍', requirements.preferences);
  result += list('尚待确认', requirements.unresolved);
  result += list('AI 假设（不是用户确认）', requirements.hypotheses);
  result += list('已被用户纠正的判断', requirements.rejected);

  const facts = data.sceneFacts;
  result += '## 当前房屋事实\n\n';
  if (!facts) result += '本次导出未提供完整几何摘要；请回到同一项目查看保存版本的真实 3D 场景。\n\n';
  else {
    result += `房屋：${show(facts.houseId ?? facts.sceneId ?? facts.id)}\n\n`;
    result += array(facts.rooms).map(room => `- ${show(room.name ?? room.label ?? room.id)}${Number.isFinite(room.areaM2) ? ` · 约 ${room.areaM2} m²` : ''}`).join('\n') + '\n\n';
    result += `当前家具对象：${facts.objectCount ?? array(facts.objects).length} 件；几何单位：${show(facts.units)}。\n\n`;
  }

  const sources = array(data.documents ?? data.sources);
  result += '## 当前资料来源\n\n';
  result += sources.length ? sources.map(source => `- ${show(source.title ?? source.name)}；修订 ${show(source.revision)}；${show(source.updatedAt)}；可信状态：${show(source.trust)}；范围：${show(source.houseId ?? source.projectId ?? source.scope)}；定位：${show(source.location ?? source.uri)}`).join('\n') + '\n\n' : '本次导出未列出当前资料清单；下方逐轮来源只是当时的检索记录，不自动代表当前有效资料。\n\n';

  result += '## 保存版本与真实变化\n\n';
  const versions = array(data.versions);
  result += versions.length ? versions.map((version, index) => `- ${show(version.label ?? `V${index + 1}`)}（${show(version.id)}），${show(version.createdAt)}；基于 ${version.parentVersionId ? md(version.parentVersionId) : '初始房屋'}；累计 ${version.summary?.commandCount ?? '未记录'} 条场景命令。`).join('\n') + '\n\n' : '暂无版本记录。\n\n';
  const materials = new Map(array(facts?.materials).map(material => [material.id, material.name]));
  const materialName = id => show(materials.get(id) ?? id);
  const position = transform => transform ? `x ${show(transform.x)} / y ${show(transform.y)} / z ${show(transform.z)} mm；旋转 ${show(transform.rotationY)} rad` : '未提供';
  const dimensions = value => value ? `${show(value.width)} × ${show(value.depth)} × ${show(value.height)} mm（宽×深×高）` : '未提供';
  if (array(data.changes).length) result += '以下是当前保存版本相对其父版本的真实对象差异：\n\n';
  for (const change of array(data.changes)) {
    const before = change.before;
    const after = change.after;
    result += `### ${show(change.name ?? change.id)}（${change.kind === 'surface' ? '装修表面' : '家具'}）\n\n`;
    if (!before || !after) result += `${before ? '已移除' : '已新增'}。\n\n`;
    if (before?.materialId !== after?.materialId) result += `- 材质：${before ? materialName(before.materialId) : '无'} → ${after ? materialName(after.materialId) : '无'}。\n`;
    if (JSON.stringify(before?.transform) !== JSON.stringify(after?.transform)) result += `- 位置 / 方向：${position(before?.transform)} → ${position(after?.transform)}。\n`;
    if (JSON.stringify(before?.dimensions) !== JSON.stringify(after?.dimensions)) result += `- 尺寸：${dimensions(before?.dimensions)} → ${dimensions(after?.dimensions)}。\n`;
    result += '\n';
  }
  if (!array(data.changes).length) result += '此导出未附对象级前后差异。请使用工作台「查看真实差异」核对，不根据命令数量推断效果。\n\n';

  result += '## 逐轮依据与执行记录\n\n';
  const traces = array(data.traces);
  if (!traces.length) result += '暂无模型执行记录。\n\n';
  for (const trace of traces) {
    result += `### 请求 ${show(trace.requestId)}\n\n实际服务：${show(trace.provider)} / ${show(trace.model)}；处理类型：${show(trace.mode)}；结果：${show(trace.terminationReason)}。\n\n`;
    for (const reason of array(trace.reasons)) result += `- ${show(reason.reason ?? reason.explanation ?? reason.text ?? reason)}${array(reason.sourceIds).length ? `（依据：${reason.sourceIds.map(md).join('、')}）` : ''}\n`;
    const retrieved = array(trace.retrieval?.sources).length ? trace.retrieval.sources : array(trace.retrieval?.results).map(item => item.source).filter(Boolean);
    for (const source of retrieved) result += `- 当轮检索：${show(source.title ?? source.documentId)}；${show(source.location ?? source.uri)}；修订 ${show(source.revision ?? source.documentRevision)}。\n`;
    result += '\n';
  }

  result += '## 家庭讨论（可选，不替代个人决定）\n\n';
  if (!array(data.discussions).length) result += '尚未发起家庭讨论；个人设计流程已可独立使用。\n\n';
  for (const discussion of array(data.discussions)) {
    result += `### 讨论 ${show(discussion.id)}\n\n讨论基于：${show(discussion.baseVersionId)}；状态：${show(discussion.status)}；飞书同步：${show(discussion.feishuSync?.status)}。\n\n`;
    result += '**原始意见（不是 AI 总结）**\n\n';
    for (const opinion of array(discussion.opinions)) {
      const isFeishuRecord = opinion.source?.kind?.startsWith('feishu');
      const sourceLabel = isFeishuRecord
        ? `填写者未核验（邀请标签：${show(opinion.source?.invitedLabel ?? opinion.source?.memberLabel ?? '未指定')}）`
        : show(opinion.source?.memberLabel ?? '项目用户');
      result += `- ${sourceLabel}：${show(opinion.text)}；${show(opinion.createdAt)}；版本 ${show(opinion.versionId)}；来源 ${recordSource(opinion.source)}。\n`;
    }
    if (!array(discussion.opinions).length) result += '尚无已回读意见。\n';
    result += '\n成员标签由用户填写，不等于已经核实飞书成员身份。\n\n';
    const summary = discussion.summary;
    result += summary?.summaryOrigin === 'system_safety_label' ? '**系统安全说明（不是飞书 AI 原文）**\n\n' : '**飞书 AI 整理（不是家庭签字）**\n\n';
    if (!summary) result += '尚无整理结果；不能视为已经达成共识。\n\n';
    else {
      result += `实际服务：${show(summary.provider ?? summary.providerTrace?.provider)}；状态：${show(summary.status)}；时间：${show(summary.summarizedAt)}。\n\n${show(summary.summary)}\n\n`;
      if (summary.status !== 'ready' || !/^aily(?:_|$)/.test(summary.provider ?? summary.providerTrace?.provider ?? '')) result += '此记录未同时标明实际飞书 AI 来源与 ready 状态，不能作为飞书 AI 成功的证据。\n\n';
      for (const [key, label] of [['intents', '已表达意向'], ['agreed', '多条意见共同主题'], ['conflicts', '意见记录差异'], ['questions', '未决问题']]) result += `${label}：${array(summary[key]).map(md).join('；') || '未列出'}。\n\n`;
      for (const item of array(summary.items).filter(item => item.origin === 'source_opinion')) result += `原意见直接引用：${show(item.text)}。\n\n`;
      result += `引用原意见：${array(summary.sourceOpinionIds).map(md).join('、') || '未提供'}。\n\n`;
    }
    result += '**用户采纳与回流**\n\n';
    if (!discussion.adoption) result += '用户尚未选择采纳内容，不自动改变房屋。\n\n';
    else result += `用户于 ${show(discussion.adoption.adoptedAt)} 选择：${array(discussion.adoption.selectedItems).map(md).join('；') || array(discussion.adoption.selectedItemIds).map(md).join('、') || '未列出'}。\n\n回到同一设计入口的需求：${show(formatResidentMessage(discussion.adoption.adjustmentRequest))}\n\n`;
    result += `调整后已关联版本：${discussion.outcomeVersionId ? md(discussion.outcomeVersionId) : '尚未关联；不代表已修改或已保存'}。旧版意见不自动适用于新版。\n\n`;
  }
  result += `## 使用边界\n\n${show(data.boundary ?? '概念设计与需求交接，不包含真实商品报价、BOM、施工图或现场勘测确认。')}\n\n所有未验证的效率、价格和施工效益均不在本简报中作保证。尺寸与施工条件须由专业人员现场核实。\n`;
  return result;
}
