# Gate 12 Review：V1 收口、质量验证与交付材料

状态：已实现并通过自动化、真实浏览器与住户黑盒复测，等待用户最终验收。

## 本 Gate 构建了什么

- 将页面 title / meta 从 Gate 1 Lab 改为 V1 产品入口。
- 补齐后端交接闭环：
  - `POST /api/projects/:id/snapshot` 保存前端 version history 与家庭共识快照；
  - `POST /api/versions/:id/confirm` 写入客户确认事件；
  - `POST /api/versions/:id/review` 写入设计师批准 / 退回；
  - `GET /api/projects/:id/export` 回读同一交接快照。
- 持久化 store 增加客户确认、设计师复核、交接快照和幂等事件保护。
- 交接导出中的版本状态会随生命周期推进到 `customer_confirmed`、`designer_verified` 或 `designer_returned`。
- 浏览器本地分支与服务端已有版本可安全合并：旧浏览器不会删掉服务端兄弟版本，也不再因稳定分支发布出现 `VERSION_CONFLICT`。
- 设计师复核页和交接页优先读取服务器 export；不可用时明确展示本地 fallback。
- 未提交前，顶部“设计师复核 / 交接 JSON”只引导到版本抽屉；提交后才暴露精确 versionId 路由。
- 主卧入口镜头、餐桌尺度、床垫材质分层和软阴影已完成实际截图修正。
- 新增 5 分钟演示脚本和设计 QA 记录。

## 本 Gate 没有构建什么

- 没有公网部署、比赛正式提交、群发消息或真实订单。
- 没有真实欧派 SKU、报价、BOM、工期、施工和生产 API。
- 没有把 `/lab/scene` 从代码中删除；它仍作为技术验证页保留。
- 没有将风格化实时 3D 冒充为客户级写实渲染；这仍是后续高精资产 / 渲染阶段。

## 验证证据

- `cd app && npm test`：134/134 通过。
- `cd app && npm run test:backend`：76/76 通过。
- `cd app && npm run build`：通过；仅有 Vite 大 chunk 警告。
- `cd app && npm run eval:agent`：28/28 通过，`passed: true`。
- 独立 Headless Chrome：1440×900、1366×768、1024×768 无水平溢出、无控制台异常。
- 镜头视频 / 抽帧：`.omx/audits/gate12/camera-orbit-zoom.mp4` 与 `camera-contact-sheet.png`。
- 参考图 / 实际页面同图对照：`.omx/audits/gate12/reference-vs-prototype-final.png`。
- 全新浏览器住户黑盒复测：从 Agent 到 V2、客户确认、设计师批准、交接单全程同一 versionId，无 `VERSION_CONFLICT`，无剩余 P0 / P1。

## 跑偏复查

- 没有回到旧六空间缩略图、静态热点图、客户 / 设计师模式开关或方块 3D。
- 2D 仍是同一 canonical scene 的只读总览；3D 仍是主浏览 / 编辑面。
- Agent 仍只能通过受约束工具写 scene；LLM 不直接修改设计状态。
- 所有商业字段继续标注 `demo / estimate / pending`，不宣称真实欧派数据已接通。

## 已知边界

- 本次稳定能力口径是 Base `ready`、Aily `api_unavailable`；Aily 超时最多等待 10 秒后自动降级，不冒充 Live Aily。
- 当前实时 3D 达到可操作的风格化工程 V1，但仍不宣称写实、客户级或商业线上渲染已完成。
- 代码体积尚未做 route-level code splitting。
- 用户最终验收时仍应按 [DEMO-SCRIPT.md](./DEMO-SCRIPT.md) 在自己的 Safari 中重点感受 3D 操作手感。
