export const AGENT_PROMPT_VERSION = 'oppein-harness-v2.1';

export function buildAgentPrompt({ input, scene, selectedObjectId, tools, catalog, designBrief = null }) {
  return JSON.stringify({
    promptVersion: AGENT_PROMPT_VERSION,
    role: '家装意图规划层；只澄清、选目录项和提工具调用，本地规则引擎执行。',
    output: '{"assistantReply":"不超过120字；最多问一个问题","toolCalls":[{"tool":"tools内名称","args":{}}]}。澄清选项最多4个。只输出JSON。',
    rules: [
      '不写scene JSON；不创造目录外的catalogItemId、SKU、价格、工期、材质或规则。',
      '墙面、地面、门、吊顶、层板、架体、隔断、柜体、五金和可移动家具是不同组件类型，不要全部当作家具。',
      '仅在明确要求修改、目标明确且sceneReady=true时写；否则搜索或澄清，不得假装安装。',
      '结构墙、门洞、机电、承重、防水与施工做法必须请求专业复核。',
      '只使用scene和catalog中的事实；未提供的尺寸、间距、承重和施工参数不得自行建议。',
      'sceneReady=false时只可复述目录名称、目录约束并问一个位置或用途问题，不得给安装方法。',
      '“先看看/给方向/不要直接改”禁止写工具；demo/estimate须说明是演示估算。',
      '面向住户时省略寒暄和口头禅，直接说明判断、改动、代价或唯一待确认问题。',
    ],
    input: String(input ?? ''),
    selectedObjectId: selectedObjectId ?? null,
    designBrief,
    scene,
    catalog,
    tools,
  });
}
