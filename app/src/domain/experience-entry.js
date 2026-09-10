const NETWORK_FAILURES = new Set(['AbortError', 'TimeoutError']);

export function experienceEntryFailureMessage(error, { requestedProject = false } = {}) {
  const code = String(error?.message ?? error ?? '').trim();
  if (NETWORK_FAILURES.has(error?.name) || /timed out|timeout|failed to fetch|networkerror/i.test(code)) {
    return '项目服务暂时没有响应，请稍后重试。';
  }
  if (code === 'NOT_FOUND') {
    return requestedProject
      ? '这个项目不在当前体验服务中。请从项目入口重新打开，或新建独立体验。'
      : '项目服务尚未接入当前页面，请重试。';
  }
  if (code === 'PROJECT_NOT_FOUND') {
    return '没有找到这个项目。它可能来自另一套本地体验，请从项目入口重新打开。';
  }
  if (/ACCESS_DENIED|HTTP_401|HTTP_403/.test(code)) {
    return '这个项目的访问凭据已失效，请从项目入口重新打开。';
  }
  return code || '项目暂时无法打开，请重试。';
}
