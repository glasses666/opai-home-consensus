# OPAI GPT Pro 接管包（2026-09-10）

这个目录不是诊断报告，而是给 GPT Pro 直接接管代码、反复试错、提交可运行修复的入口。

## GitHub 入口

- 仓库：`https://github.com/glasses666/opai-home-consensus`
- 接管分支：`codex/gptpro-harness-github-20260910`
- 不要以远端 `main` 作为实现基线。该分支把本地 20 个产品提交的当前产品树安全移植到公开基线，并包含 2026-09-10 的主卧、墙面和自然语言入口改动；历史中的 196 MB 原始视频没有进入分支。
- 在该分支上创建工作分支并提交 Pull Request。不要强推或改写 `main`。

## 先读什么

1. 根目录 `AGENTS.md`、`GATE-0-PRODUCT-CONTRACT.md` 和 `PLAN.md`。
2. 本目录 `PROBLEM-LEDGER.md`、`REPRO-TRACE.json` 和 `GPTPRO-PROMPT.md`。
3. Agent 主链：
   - `app/src/agent/dialogue.js`
   - `app/src/agent/harness.js`
   - `app/src/agent/prompt.js`
   - `app/server/deepseek.mjs`
   - `app/server/experience-routes.mjs`
   - `app/server/experience-store.mjs`
4. 场景与规则：
   - `app/src/domain/reference-home.js`
   - `app/src/domain/scene.js`
   - `app/src/domain/design-rules.js`
   - `app/src/domain/design-version.js`
5. 产品调用方：
   - `app/src/App.jsx`
   - `app/src/workbench-session.js`
6. 现有对抗评测与回归：
   - `app/scripts/eval_dialogue_adversarial.mjs`
   - `app/scripts/eval_dialogue_adversarial_holdout.mjs`
   - `app/scripts/eval_dialogue_reasoning.mjs`
   - `app/tests/agent-harness.test.mjs`
   - `app/tests/dialogue-adversarial-regression.test.mjs`
   - `app/tests/product-acceptance-dialogue.test.mjs`

## 启动与验证

在 `app/` 下：

```bash
npm install
npm test
npm run build
npm run dev:experience
```

`npm run dev:experience` 固定前端 `127.0.0.1:5180`，API 为 `127.0.0.1:8794`。真实 DeepSeek 凭据只存在本机 `app/.env.local`，不会进入 Git 或压缩包。没有凭据时先完成 mock/确定性测试，但不得把 mock 当作真实模型验收。

## 交付定义

GPT Pro 的成果应是代码和可复验行为：提交/PR、测试、真实 DeepSeek trace、浏览器端前后场景证据、已知限制。只输出架构建议、提示词草案或问题列表不算完成。

## 网页沙箱降级路径

ChatGPT 的 GitHub 连接可能只有读取权限，网页执行环境也可能无法安全获得 DeepSeek 密钥或访问 `api.deepseek.com`。这不应阻塞代码修复：

1. GPT Pro 先做不超过十分钟的能力预检，分别确认仓库读取、文件写入/导出、GitHub 写入、外网出口与密钥环境；不能把“能浏览 GitHub”当作“能推送 PR”。
2. GitHub 只读时，在上传的 ZIP 中完成修改，交付完整 changed-files ZIP 与 `git diff --binary` 补丁；由本地 Codex 应用并提交。
3. DeepSeek 不可调用时，不索取或回显密钥，不把 mock 当 live；继续完成实现、确定性测试、对抗用例和观测脚本，并列出一条本机 live 验证命令。
4. 本地 Codex 使用现有 `app/.env.local` 跑真实 DeepSeek 和浏览器验收，将首次失败与完整脱敏 trace 回传 GPT Pro。重复这条短闭环，直到验收合同通过。
