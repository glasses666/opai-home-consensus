import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const SECRET_PATTERN = /(api[-_]?key|authorization|password|secret|token)/i;

export class LarkCliError extends Error {
  constructor(code, { retryable = false, missingScopes = [] } = {}) {
    super(code);
    this.name = 'LarkCliError';
    this.code = code;
    this.retryable = retryable;
    this.missingScopes = missingScopes;
  }
}

const safeCode = (error) => {
  const value = String(error?.error?.subtype ?? error?.error?.type ?? 'API_FAILED');
  return SECRET_PATTERN.test(value) ? 'API_FAILED' : value.toUpperCase();
};

export async function runLarkCli(args, {
  runner = execFileAsync,
  timeoutMs = 12_000,
} = {}) {
  let stdout;
  try {
    const result = await runner('lark-cli', args, {
      encoding: 'utf8',
      maxBuffer: 2 * 1024 * 1024,
      timeout: timeoutMs,
    });
    stdout = typeof result === 'string' ? result : result.stdout;
  } catch (error) {
    const timedOut = error?.killed || error?.code === 'ETIMEDOUT';
    throw new LarkCliError(timedOut ? 'CLI_TIMEOUT' : 'CLI_UNAVAILABLE', { retryable: true });
  }

  let envelope;
  try {
    envelope = JSON.parse(stdout);
  } catch {
    throw new LarkCliError('CLI_RESPONSE_INVALID');
  }

  if (envelope?.ok === false) {
    const subtype = String(envelope.error?.subtype ?? '');
    const type = String(envelope.error?.type ?? '');
    const retryable = /network|timeout|rate|server|unavailable|unknown/i.test(`${type}:${subtype}`);
    throw new LarkCliError(safeCode(envelope), {
      retryable,
      missingScopes: envelope.error?.missing_scopes ?? [],
    });
  }
  return envelope;
}
