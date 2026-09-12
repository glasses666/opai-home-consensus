import { buildAgentPrompt } from '../src/agent/prompt.js';

const DEFAULT_BASE_URL = 'https://api.deepseek.com';
const DEFAULT_MODEL = 'deepseek-v4-flash';

function promptFor(context) {
  if (context?.prompt !== undefined) {
    if (typeof context.prompt !== 'string' || !context.prompt.trim() || context.prompt.length > 160_000) throw new Error('DEEPSEEK_PROMPT_INVALID');
    return context.prompt;
  }
  const { input, mode, scene, selectedObjectId, tools, catalog, designBrief, styleEvidence, expectedToolCalls } = context ?? {};
  return buildAgentPrompt({ input, mode, scene, selectedObjectId, tools, catalog, designBrief, styleEvidence, expectedToolCalls });
}

export async function callDeepSeek(context, {
  apiKey = process.env.DEEPSEEK_API_KEY,
  baseUrl = process.env.DEEPSEEK_BASE_URL ?? DEFAULT_BASE_URL,
  model = process.env.DEEPSEEK_MODEL ?? DEFAULT_MODEL,
  fetchImpl = fetch,
  timeoutMs = 35_000,
  maxTokens = 800,
  thinking = 'disabled',
  reasoningEffort = 'high',
  signal = context?.signal,
} = {}) {
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw new Error('DEEPSEEK_API_KEY_MISSING');
  if (!/^https:\/\/[^?#]+\/?$/.test(baseUrl)) throw new Error('DEEPSEEK_BASE_URL_INVALID');
  if (typeof model !== 'string' || !model.trim()) throw new Error('DEEPSEEK_MODEL_INVALID');
  if (!['enabled', 'disabled'].includes(thinking)) throw new Error('DEEPSEEK_THINKING_INVALID');
  if (!['low', 'high', 'max'].includes(reasoningEffort)) throw new Error('DEEPSEEK_REASONING_EFFORT_INVALID');
  if (!Number.isInteger(maxTokens) || maxTokens <= 0) throw new Error('DEEPSEEK_TOKEN_BUDGET_INVALID');

  const prompt=promptFor(context);
  if(context?.systemPrompt!==undefined && (typeof context.systemPrompt!=='string'||!context.systemPrompt.trim()
    ||context.systemPrompt.length>24000))throw Error('DEEPSEEK_SYSTEM_PROMPT_INVALID');
  const messages=[...(context?.systemPrompt?[{role:'system',content:context.systemPrompt}]:[]),{role:'user',content:prompt}];
  const baseTrace={provider:'deepseek',requestedModel:model,model:null,endpoint:new URL(baseUrl).origin,
    requestId:null,usage:null,purpose:context?.purpose??'legacy',
    parameters:{thinking,...(thinking==='enabled'?{reasoningEffort}:{temperature:0.1}),maxTokens,responseFormat:'json_object'}};
  const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(context?.timeoutMs ?? timeoutMs)]) : AbortSignal.timeout(context?.timeoutMs ?? timeoutMs);
  const transportFailure = error => {
    const failure = new Error(signal?.aborted ? 'REQUEST_CANCELLED' : requestSignal.aborted || error?.name === 'TimeoutError' ? 'DEEPSEEK_TIMEOUT' : 'DEEPSEEK_API_UNAVAILABLE');
    failure.retryable = !signal?.aborted;
    failure.providerTrace=baseTrace;
    return failure;
  };

  let response;
  try {
    response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        response_format: { type: 'json_object' },
        thinking: { type: thinking },
        ...(thinking === 'enabled' ? { reasoning_effort: reasoningEffort } : { temperature: 0.1 }),
        max_tokens: maxTokens,
        stream: false,
      }),
      signal: requestSignal,
    });
  } catch (error) {
    throw transportFailure(error);
  }
  if (!response.ok) {
    const failure = new Error([401, 403].includes(response.status) ? 'DEEPSEEK_AUTH_FAILED' : response.status === 429 ? 'DEEPSEEK_RATE_LIMIT' : response.status >= 500 ? 'DEEPSEEK_SERVER_ERROR' : 'DEEPSEEK_API_FAILED');
    failure.status = response.status;
    failure.providerTrace={...baseTrace,httpStatus:response.status};
    failure.retryable = response.status === 429 || response.status >= 500;
    throw failure;
  }

  let envelope;
  try {
    envelope = await response.json();
  } catch (error) {
    // The deadline also covers the response body, not just receipt of headers.
    if (requestSignal.aborted || error?.name !== 'SyntaxError') throw transportFailure(error);
    const failure=new Error('DEEPSEEK_RESPONSE_INVALID');failure.providerTrace={...baseTrace,httpStatus:response.status};throw failure;
  }
  const reasoningTokens=envelope?.usage?.completion_tokens_details?.reasoning_tokens;
  const reasoningContent=envelope?.choices?.[0]?.message?.reasoning_content;
  const providerTrace={...baseTrace,model:envelope?.model??null,requestId:envelope?.id??null,
    usage:envelope?.usage??null,finishReason:envelope?.choices?.[0]?.finish_reason??null,
    reasoning:{observed:(typeof reasoningContent==='string'&&!!reasoningContent.trim())||reasoningTokens>0,
      tokens:Number.isFinite(reasoningTokens)?reasoningTokens:null}};
  const failure=code=>{const error=Error(code);error.providerTrace=providerTrace;return error;};
  if(envelope?.choices?.[0]?.finish_reason==='length')throw failure('DEEPSEEK_RESPONSE_TRUNCATED');
  const content=envelope?.choices?.[0]?.message?.content;
  if(typeof content!=='string'||!content.trim())throw failure('DEEPSEEK_RESPONSE_MISSING');
  let parsed;
  try{parsed=JSON.parse(content.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));}
  catch{throw failure('DEEPSEEK_RESPONSE_INVALID');}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw failure('DEEPSEEK_RESPONSE_INVALID');
  Object.defineProperty(parsed,'providerTrace',{value:providerTrace});
  return parsed;
}

// Main design dialogue and its live evaluations share the same production adapter.
// Keep legacy one-shot/first-plan budgets separate. Never retain raw reasoning text.
export function callDesignDeepSeek(context, options = {}) {
  if((options.model??process.env.DEEPSEEK_MODEL??DEFAULT_MODEL)!==DEFAULT_MODEL) {
    return Promise.reject(Error('DEEPSEEK_DESIGN_MODEL_REQUIRED'));
  }
  const purposeTokenBudget = context?.maxTokens ?? (context?.purpose === 'review_requirements'
    ? 4096
    : context?.purpose === 'review_proposal'
      ? 4096
      : 4096);
  const purposeReasoningEffort = context?.reasoningEffort ?? (context?.purpose === 'review_requirements'
    ? process.env.DEEPSEEK_REQUIREMENT_REVIEW_REASONING_EFFORT ?? 'low'
    : process.env.DEEPSEEK_DESIGN_REASONING_EFFORT ?? 'high');
  const purposeThinking = context?.thinking ?? process.env.DEEPSEEK_DESIGN_THINKING ?? 'enabled';
  return callDeepSeek(context, {
    thinking: purposeThinking,
    reasoningEffort: purposeReasoningEffort,
    maxTokens: purposeTokenBudget,
    ...options,
    model: DEFAULT_MODEL,
  }).then(result=>{
    // The recorded reproduction reports the short alias `deepseek-flash`.
    // Never substitute requestedModel when upstream model provenance is missing.
    if(!['deepseek-v4-flash','deepseek-flash'].includes(result.providerTrace.model)){
      const error=Error('DEEPSEEK_DESIGN_MODEL_UNVERIFIED');error.providerTrace=result.providerTrace;throw error;
    }
    return result;
  });
}
