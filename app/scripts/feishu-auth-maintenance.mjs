import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

// Do not forward CLI stdout/stderr: authentication diagnostics may contain credentials.
export function authSummary(auth) {
  const user = auth?.identities?.user;
  const valid = auth?.verified === true && user?.verified === true && user.status === 'ready' && user.tokenStatus === 'valid';
  const offline = String(user?.scope ?? '').split(/\s+/).includes('offline_access');
  const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
  return { status: valid && offline ? 'ready' : valid ? 'offline_access_missing' : 'reauthorization_required', expiresAt: date(user?.expiresAt), refreshExpiresAt: date(user?.refreshExpiresAt) };
}

export async function maintainAuth(run = promisify(execFile)) {
  try {
    const { stdout } = await run('lark-cli', ['auth', 'status', '--json', '--verify'], {
      timeout: 45000, maxBuffer: 1024 * 1024,
      env: { ...process.env, LARKSUITE_CLI_NO_UPDATE_NOTIFIER: '1', LARKSUITE_CLI_NO_SKILLS_NOTIFIER: '1' },
    });
    return authSummary(JSON.parse(stdout));
  } catch {
    return { status: 'verification_failed' };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await maintainAuth();
  console.log(JSON.stringify({ service: 'opai-feishu-auth', ...result }));
  process.exitCode = result.status === 'ready' ? 0 : 1;
}
