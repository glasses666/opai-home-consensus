import { buildAgentPrompt } from '../src/agent/prompt.js';

const DEFAULT_BASE_URL = 'https://api.deepseek.com';
const DEFAULT_MODEL = 'deepseek-v4-flash';

function promptFor(context) {
  if (context?.prompt !== undefined) {
    if (typeof context.prompt !== 'string' || !context.prompt.trim() || context.prompt.length > 60_000) throw new Error('DEEPSEEK_PROMPT_INVALID');
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

  const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(context?.timeoutMs ?? timeoutMs)]) : AbortSignal.timeout(context?.timeoutMs ?? timeoutMs);
  const transportFailure = error => {
    const failure = new Error(signal?.aborted ? 'REQUEST_CANCELLED' : requestSignal.aborted || error?.name === 'TimeoutError' ? 'DEEPSEEK_TIMEOUT' : 'DEEPSEEK_API_UNAVAILABLE');
    failure.retryable = !signal?.aborted;
    return failure;
  };

  let response;
  try {
    response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: promptFor(context) }],
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
    failure.retryable = response.status === 429 || response.status >= 500;
    throw failure;
  }

  let envelope;
  try {
    envelope = await response.json();
  } catch (error) {
    // The deadline also covers the response body, not just receipt of headers.
    if (requestSignal.aborted || error?.name !== 'SyntaxError') throw transportFailure(error);
    throw new Error('DEEPSEEK_RESPONSE_INVALID');
  }
  if (envelope?.choices?.[0]?.finish_reason === 'length') throw new Error('DEEPSEEK_RESPONSE_TRUNCATED');
  const content = envelope?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('DEEPSEEK_RESPONSE_MISSING');
  let parsed;
  try {
    parsed = JSON.parse(content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
  } catch {
    throw new Error('DEEPSEEK_RESPONSE_INVALID');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('DEEPSEEK_RESPONSE_INVALID');
  const reasoningTokens = envelope.usage?.completion_tokens_details?.reasoning_tokens;
  const reasoningContent = envelope.choices[0].message.reasoning_content;
  const reasoningObserved = (typeof reasoningContent === 'string' && !!reasoningContent.trim()) || reasoningTokens > 0;
  Object.defineProperty(parsed, 'providerTrace', { value: { provider: 'deepseek', model: envelope.model ?? model, requestedModel: model,
    endpoint: new URL(baseUrl).origin, requestId: envelope.id ?? null, usage: envelope.usage ?? null, finishReason: envelope.choices[0].finish_reason,
    reasoning: { observed: reasoningObserved, tokens: Number.isFinite(reasoningTokens) ? reasoningTokens : null },
    parameters: { thinking, ...(thinking === 'enabled' ? { reasoningEffort } : { temperature: 0.1 }), maxTokens, responseFormat: 'json_object' } } });
  return parsed;
}

// Main design dialogue and its live evaluations share the same production adapter.
// Keep legacy one-shot/first-plan budgets separate. Never retain raw reasoning text.
export function callDesignDeepSeek(context, options = {}) {
  return callDeepSeek(context, {
    thinking: process.env.DEEPSEEK_DESIGN_THINKING ?? 'enabled',
    reasoningEffort: process.env.DEEPSEEK_DESIGN_REASONING_EFFORT ?? 'high',
    maxTokens: 8192,
    ...options,
  });
}
