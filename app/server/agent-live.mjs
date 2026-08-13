import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const HOST = '127.0.0.1';
const CASES = Object.freeze({
  'golden-clarify-needs': '需求不完整 → Aily 追问一个关键问题',
  'golden-propose-style': '风格与家庭需求 → Aily 给两个方向，不改场景',
  'golden-execute-sofa': '沙发右移 20 cm → Aily 选工具，本地写入',
  'golden-execute-wall': '南墙木饰面 → Aily 选目录项，本地写入',
  'golden-block-boundary': '沙发越界移动 → 本地规则原子拒绝',
  'golden-clarify-shelf': '未就绪层板 → Aily 只澄清，不假装安装',
  'resident-five-turns': '真实住户连续五轮 → 同一需求简报与场景状态',
});

const page = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Aily Harness 直播台</title><style>
:root{color-scheme:dark;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#11130f;color:#e8e9df}
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 80% 0,#293127 0,transparent 38%),#11130f}
header{height:64px;padding:0 24px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #343830;background:#151711e8}
h1{font:600 16px/1.2 system-ui;margin:0}.status{display:flex;gap:9px;align-items:center;font:12px system-ui;color:#aeb4a5}.dot{width:8px;height:8px;border-radius:50%;background:#7f8b79}.dot.running{background:#d8a657;box-shadow:0 0 14px #d8a657}.dot.done{background:#80a978}.dot.failed{background:#d06e62}
main{display:grid;grid-template-columns:minmax(0,1fr) 300px;height:calc(100vh - 64px)}
.terminal{padding:24px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;line-height:1.65}.terminal:focus{outline:none}
aside{border-left:1px solid #343830;padding:22px;background:#171913cc;overflow:auto}h2{font:600 12px system-ui;letter-spacing:.08em;text-transform:uppercase;color:#92998a;margin:0 0 14px}
.case{padding:12px 0;border-top:1px solid #2d312a}.case code{display:block;color:#d5d8ca;font-size:11px;margin-bottom:5px}.case span{font:12px/1.5 system-ui;color:#9ca493}
.safe{margin-top:22px;padding:14px;border:1px solid #394037;border-radius:10px;font:12px/1.6 system-ui;color:#aeb4a5;background:#1d211a}
@media(max-width:800px){main{grid-template-columns:1fr}aside{display:none}}
</style></head><body><header><h1>Aily Harness · 实时观察台</h1><div class="status"><i class="dot" id="dot"></i><span id="status">等待任务</span></div></header>
<main><pre class="terminal" id="terminal" tabindex="0">连接直播流…\n</pre><aside><h2>只允许登记任务</h2><div id="cases"></div><div class="safe">观察台不能输入或执行任意 Shell。Aily 只收到脱敏 Demo 上下文；canonical scene 仍由本地 Harness 与规则引擎控制。</div></aside></main>
<script>
const terminal=document.querySelector('#terminal'),statusNode=document.querySelector('#status'),dot=document.querySelector('#dot');
const renderState=s=>{statusNode.textContent=s.status==='running'?'运行中':s.status==='passed'?'已通过':s.status==='failed'?'失败':'等待任务';dot.className='dot '+(s.status==='running'?'running':s.status==='passed'?'done':s.status==='failed'?'failed':'');};
fetch('/api/status').then(r=>r.json()).then(s=>{renderState(s);document.querySelector('#cases').innerHTML=s.cases.map(c=>'<div class="case"><code>'+c.id+'</code><span>'+c.label+'</span></div>').join('')});
const events=new EventSource('/events');events.onmessage=e=>{const x=JSON.parse(e.data);if(x.type==='reset')terminal.textContent=x.text;if(x.type==='line'){terminal.textContent+=x.text;terminal.scrollTop=terminal.scrollHeight}if(x.type==='state')renderState(x)};
events.onerror=()=>{statusNode.textContent='直播流断开';dot.className='dot failed'};
</script></body></html>`;

function sendJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  let value = '';
  for await (const chunk of request) {
    value += chunk;
    if (value.length > 4096) throw new Error('REQUEST_TOO_LARGE');
  }
  return JSON.parse(value || '{}');
}

export function createAgentLiveServer({ token = randomBytes(24).toString('hex'), runner = spawn } = {}) {
  const clients = new Set();
  let child = null;
  let history = 'Aily Harness 直播台已就绪。\n等待 Codex 发起已登记任务。\n';
  let state = { status: 'idle', caseId: null, startedAt: null, elapsedMs: 0, exitCode: null };
  const emit = (event) => {
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const response of clients) response.write(payload);
  };
  const write = (text) => {
    history = `${history}${text}`.slice(-160_000);
    emit({ type: 'line', text });
  };
  const update = (next) => {
    state = { ...state, ...next };
    emit({ type: 'state', ...state });
  };
  const run = (caseId) => {
    if (!CASES[caseId]) throw new Error('CASE_NOT_ALLOWED');
    if (child) throw new Error('TASK_ALREADY_RUNNING');
    const started = Date.now();
    history = '';
    update({ status: 'running', caseId, startedAt: new Date(started).toISOString(), elapsedMs: 0, exitCode: null });
    const args = caseId === 'resident-five-turns'
      ? ['--env-file-if-exists=.env.local', 'scripts/live_resident_session.mjs']
      : ['--env-file-if-exists=.env.local', 'scripts/eval_agent_prompt.mjs', '--live', '--suite=golden', `--case=${caseId}`];
    write(`[control] ${CASES[caseId]}\n[exec] node ${args.slice(1).join(' ')}\n\n`);
    child = runner(process.execPath, args, {
      cwd: appRoot,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });
    child.stdout.on('data', (chunk) => write(String(chunk)));
    child.stderr.on('data', (chunk) => write(`[stderr] ${String(chunk)}`));
    child.on('error', (error) => write(`[runner] ${error.message}\n`));
    child.on('close', (code) => {
      const elapsedMs = Date.now() - started;
      write(`\n[exit] code=${code} elapsed=${(elapsedMs / 1000).toFixed(1)}s\n`);
      child = null;
      update({ status: code === 0 ? 'passed' : 'failed', elapsedMs, exitCode: code });
    });
  };

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', `http://${HOST}`);
      if (request.method === 'GET' && url.pathname === '/') {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'", 'cache-control': 'no-store' });
        response.end(page);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/status') {
        sendJson(response, 200, { ...state, cases: Object.entries(CASES).map(([id, label]) => ({ id, label })) });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/events') {
        response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', connection: 'keep-alive' });
        clients.add(response);
        response.write(`data: ${JSON.stringify({ type: 'reset', text: history })}\n\n`);
        response.write(`data: ${JSON.stringify({ type: 'state', ...state })}\n\n`);
        request.on('close', () => clients.delete(response));
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/run') {
        if (request.headers['x-agent-live-token'] !== token) {
          sendJson(response, 403, { error: 'CONTROL_TOKEN_INVALID' });
          return;
        }
        const body = await readJson(request);
        run(body.caseId);
        sendJson(response, 202, { accepted: true, caseId: body.caseId });
        return;
      }
      sendJson(response, 404, { error: 'NOT_FOUND' });
    } catch (error) {
      const status = error.message === 'TASK_ALREADY_RUNNING' ? 409 : 400;
      sendJson(response, status, { error: error.message });
    }
  });

  return { server, token, run, getState: () => ({ ...state }) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.AGENT_LIVE_PORT ?? 5190);
  const live = createAgentLiveServer({ token: process.env.AGENT_LIVE_TOKEN || undefined });
  live.server.listen(port, HOST, () => {
    console.log(JSON.stringify({ url: `http://${HOST}:${port}`, token: live.token }));
  });
}
