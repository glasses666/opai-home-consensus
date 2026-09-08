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
} = {}) {
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw new Error('DEEPSEEK_API_KEY_MISSING');
  if (!/^https:\/\/[^?#]+\/?$/.test(baseUrl)) throw new Error('DEEPSEEK_BASE_URL_INVALID');
  if (typeof model !== 'string' || !model.trim()) throw new Error('DEEPSEEK_MODEL_INVALID');

  let response;
  try {
    response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: promptFor(context) }],
        response_format: { type: 'json_object' },
        thinking: { type: 'disabled' },
        temperature: 0.1,
        max_tokens: maxTokens,
        stream: false,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const failure = new Error(error?.name === 'TimeoutError' ? 'DEEPSEEK_TIMEOUT' : 'DEEPSEEK_API_UNAVAILABLE');
    failure.retryable = true;
    throw failure;
  }
  if (!response.ok) throw new Error([401, 403].includes(response.status) ? 'DEEPSEEK_AUTH_FAILED' : 'DEEPSEEK_API_FAILED');

  const envelope = await response.json().catch(() => null);
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
  Object.defineProperty(parsed, 'providerTrace', { value: { provider: 'deepseek', model } });
  return parsed;
}
