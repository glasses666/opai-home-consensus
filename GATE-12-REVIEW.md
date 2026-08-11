# Gate 12 Review：V1 收口、质量验证与交付材料

状态：已实现并通过自动化验证，等待用户最终视觉与流程验收。

## 本 Gate 构建了什么

- 将页面 title / meta 从 Gate 1 Lab 改为 V1 产品入口。
- 补齐后端交接闭环：
  - `POST /api/projects/:id/snapshot` 保存前端 version history 与家庭共识快照；
  - `POST /api/versions/:id/confirm` 写入客户确认事件；
  - `POST /api/versions/:id/review` 写入设计师批准 / 退回；
  - `GET /api/projects/:id/export` 回读同一交接快照。
- 持久化 store 增加客户确认、设计师复核、交接快照和幂等事件保护。
- 交接导出中的版本状态会随生命周期推进到 `customer_confirmed`、`designer_verified` 或 `designer_returned`。
- 设计师复核页和交接页优先读取服务器 export；不可用时明确展示本地 fallback。
- 新增 5 分钟演示脚本和设计 QA 记录。

## 本 Gate 没有构建什么

- 没有公网部署、比赛正式提交、群发消息或真实订单。
- 没有真实欧派 SKU、报价、BOM、工期、施工和生产 API。
- 没有把 `/lab/scene` 从代码中删除；它仍作为技术验证页保留。
- 没有完成逐像素视觉回归；当前环境的浏览器插件不可用。

## 验证证据

- `cd app && npm test`：129/129 通过。
- `cd app && npm run test:backend`：74/74 通过。
- `cd app && npm run build`：通过；仅有 Vite 大 chunk 警告。
- `cd app && npm run eval:agent`：28/28 通过，`passed: true`。
- 路由 smoke：
  - `/project/demo` → 200
  - `/review/project-demo` → 200
  - `/handoff/version-demo-initial` → 200
  - `/lab/scene` → 200

## 跑偏复查

- 没有回到旧六空间缩略图、静态热点图、客户 / 设计师模式开关或方块 3D。
- 2D 仍是同一 canonical scene 的只读总览；3D 仍是主浏览 / 编辑面。
- Agent 仍只能通过受约束工具写 scene；LLM 不直接修改设计状态。
- 所有商业字段继续标注 `demo / estimate / pending`，不宣称真实欧派数据已接通。

## 已知边界

- 真实飞书 Base 写入仍取决于当前授权、Base 表结构和运行环境；本 Gate 只保证 BFF 事件队列与降级边界。
- 真实 Aily 调用未作为本次 Gate 的必过项；离线 Agent harness 已通过。
- 代码体积尚未做 route-level code splitting。
- 明早建议用户按 [DEMO-SCRIPT.md](./DEMO-SCRIPT.md) 走一遍真实浏览器验收，并重点看 3D 操作手感。
