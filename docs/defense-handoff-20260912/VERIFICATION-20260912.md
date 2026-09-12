# 2026-09-12 交接验证记录

## Git 基线

- 源工作分支：`codex/gptpro-harness-rebuild-20260910`
- 源工作区起始 HEAD：`328a6d56fb0e64fb58aeddca0ee3b5b032c30ae0`
- 远端：`https://github.com/glasses666/opai-home-consensus.git`
- 交接策略：从 `origin/main` 创建独立 `codex/demo-handoff-20260912` 快照分支，纳入当前源码与选定材料，不合并到 `main`。
- 大文件策略：普通 Git 仅保存可审阅文件；超过 GitHub 单文件限制的完整包进入 `handoff-2026-09-12` Release。

## 自动验证

### 全量测试

命令：

```bash
cd app
npm test
```

结果：509 项，505 通过，4 失败，0 跳过，退出码 1。相同结果已在准备提交的独立交接工作树中再次跑出；完整输出保存在本机 `/tmp/opai-handoff-test-20260912.log`，没有将带本机路径的临时日志作为产品证据提交。

失败摘要见 [CURRENT-FACTS.md](./CURRENT-FACTS.md)。

### 构建

命令：

```bash
cd app
npm run build
```

结果：独立交接工作树中通过，`app/dist` 约 113 MiB；Vite 报告大 chunk 警告。构建通过只证明当前源码可以生成静态产物，不证明真实 provider、公网页面或最终录像通过。

## 页面与服务观察

- 本地 5180 工作台可以打开实时 3D。
- 家庭意见侧栏可以打开，原始意见、AI 整理、我的暂选和自填意见位于独立侧栏区域。
- 当前 5180 健康状态：`provider=local`；Aily/Base 为用户授权失败；demo catalog 18 项；待写 Base 事件为 0。
- 本次交接没有发起新的真实 DeepSeek、Aily 或 Base 写入。

## 尚未关闭

- 四项自动测试失败；
- 一次从全新项目开始的完整桌面录像彩排；
- 最终 Demo 视频；
- 当前会话的真实 DeepSeek/Aily/Base 端到端证明；
- 公网冷加载与最终提交环境验收；
- `main` 合并与 Demo 冻结标签。

因此本次交付应称为“可接手的 Demo 排练快照”，不能称为“全部验收完成”。
