const boundedList = (value, name) => {
  if (!Array.isArray(value) || value.length > 12 || value.some((item) => typeof item !== 'string' || !item.trim() || item.length > 160)) {
    throw new Error(`CONSENSUS_${name}_INVALID`);
  }
  return value.slice(0, 4).map((item) => item.trim());
};

export function buildConsensusSecretaryPrompt(review) {
  const input = {
    version: { id: review.currentVersionId, label: review.currentVersionLabel },
    household: review.household,
    changes: [...review.objectDiffs, ...(review.surfaceDiffs ?? [])],
    ruleIssues: review.ruleIssues,
    unresolved: review.unresolved,
  };
  return [
    '你是飞书共识秘书，只总结已有事实，不提出或执行设计修改。',
    '返回严格 JSON，不要 Markdown：',
    '{"assistantReply":"80字内摘要","toolCalls":[],"agreed":["最多4项"],"conflicts":["最多4项"],"questions":["最多4项"]}',
    '不得补造家庭意见、产品、报价、工期、施工结论或已确认状态。',
    JSON.stringify(input),
  ].join('\n');
}

export async function generateConsensusSummary(review, provider) {
  if (typeof provider !== 'function') throw new Error('CONSENSUS_PROVIDER_UNAVAILABLE');
  const result = await provider({ prompt: buildConsensusSecretaryPrompt(review) });
  if (!Array.isArray(result?.toolCalls) || result.toolCalls.length) throw new Error('CONSENSUS_TOOL_CALL_INVALID');
  if (typeof result.assistantReply !== 'string' || !result.assistantReply.trim() || result.assistantReply.length > 160) {
    throw new Error('CONSENSUS_SUMMARY_INVALID');
  }
  return {
    status: 'ready',
    provider: 'aily',
    summary: result.assistantReply.trim(),
    agreed: boundedList(result.agreed, 'AGREED'),
    conflicts: boundedList(result.conflicts, 'CONFLICTS'),
    questions: boundedList(result.questions, 'QUESTIONS'),
  };
}
