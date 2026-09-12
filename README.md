# OPAI「我的生活空间」

OPAI 让用户用日常语言表达居住需求，由设计 Agent 在同一套可编辑 3D 住宅中生成受规则约束、可撤销、可保存的方案；个人方案保存后，家人再围绕同一版本留下意见。

## 当前状态

项目处于 `SCOPE LOCKED / REHEARSING`：Demo 视频完成前只排练演示流程，修复阻断、明显画面错误、误导文案和现有能力的不稳定复现；不新增发行版功能。

当前事实请只读：

- [答辩接手入口](./docs/defense-handoff-20260912/00-START-HERE.md)
- [2026-09-12 当前事实总表](./docs/defense-handoff-20260912/CURRENT-FACTS.md)
- [Demo 录像流程](./docs/defense-handoff-20260912/DEMO-FLOW.md)
- [唯一实施计划](./PLAN.md)
- [产品合同](./GATE-0-PRODUCT-CONTRACT.md)

2026-09-12 当前验证结果：

- `npm test`：509 项，505 通过，4 失败，0 跳过；
- `npm run build`：通过，存在大 chunk 警告；
- 本地工作台与实时 3D 可打开，家庭意见侧栏已集成；
- 当前健康检查显示 `provider=local`，Aily/Base 授权失败；本次交接没有新的真实 DeepSeek、Aily 或 Base 写入。

旧 README、旧讲稿或带日期的研究包中的测试数和运行状态都不再代表当前版本。

## 本地运行

普通本地后端使用 `8791`：

```bash
cd app
npm install
npm run server
npm run dev -- --port 5173
```

隔离 Demo 候选使用 `8794` 与 `5180`：

```bash
cd app
npm run experience -- --existing-opai-provider
```

另一个终端：

```bash
cd app
npm run dev:experience
```

入口为 `http://127.0.0.1:5180/`。若真实 provider 不可用，页面必须如实显示降级状态，不能把 local planner 冒充成 DeepSeek 或 Aily。

验证：

```bash
cd app
npm test
npm run build
```

## 产品边界

- canonical scene 是户型、房间、表面、门窗、家具、材质、规则、版本和镜头的唯一事实源。
- 实时 3D 是主要浏览与编辑界面；2D 是同源只读俯视总览。
- 手动和 Agent 修改共用 `SceneCommand` 与确定性规则。
- 家庭意见是个人方案保存后的后段：原始意见、AI 整理和用户暂选不混为一层。
- 当前通用 Agent 未开放任意家具新增/删除、参考图复刻布局或门窗移动。
- 录制模式有一个标为“编排演示”的固定加椅子场景；它不能被表述成开放域家具生成能力。
- 没有当前端到端证据证明已接通欧派 SKU、报价、BOM、工期、施工或生产系统。

## 交接与历史材料

- [当前材料地图](./docs/defense-handoff-20260912/MATERIALS-MAP.md)
- [给撰稿 Agent 的提示词](./docs/defense-handoff-20260912/AGENT-PROMPT.md)
- [2026-08-16 方案研究档案](./submission/research-2026-08-16/README.md)
- [2026-09-07 路演材料](./submission/roadshow-2026-09-07/README.md)
- [2026-09-07 老师材料包](./submission/teacher-package-2026-09-07-v2/README.md)
- [家庭意见 UI 六方向研究](./docs/gptpro-ui-design-handoff-20260912/00-START-HERE.md)

完整大文件包放在 [GitHub Release `handoff-2026-09-12`](https://github.com/glasses666/opai-home-consensus/releases/tag/handoff-2026-09-12)，普通 Git 只保存去重后的可审阅内容。

## 分支纪律

- 当前交接分支用于把本地 Demo 状态和资料交给下一位接手者，不代表已合并 `main`、发布生产或冻结最终 Demo。
- Demo 视频完成前，发行版的通用对象增删、样板布局和门窗编辑不得反向污染录制快照。
- 任何真实 provider、企业数据或公网可用性声明，都需要新的端到端证据。
