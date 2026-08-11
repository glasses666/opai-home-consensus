# Gate 11 Review：设计师复核与下游交接

状态：已实现、自动化与本地路由验证通过，等待用户验收。

## 本 Gate 构建了什么

- 新增独立 `/review/project-demo` 设计师复核页，不再把设计师塞进客户工作台的模式开关。
- 新增独立 `/handoff/:versionId` 共识交接页，输出脱敏、机器可读 JSON。
- 新增 `buildDesignerReview` / `buildHandoffPacket` 领域模块，复用已有版本、规则、影响和家庭共识数据。
- 客户工作台顶部增加“设计师复核”和“交接 JSON”入口。
- BFF 增加 `GET /api/projects/:id/export` 的导出边界；导出只读，不发送飞书消息，不创建真实订单。
- 交接包明确保留：
  - 对象、材质、版本来源；
  - 规则与影响；
  - 家庭意见与确认；
  - 真实 SKU、报价、BOM、工期、生产接口的 pending 占位。

## 本 Gate 没有构建什么

- 没有真实欧派报价、真实 SKU、BOM、生产或施工接口。
- 没有公网部署、比赛提交或团队分享。
- 没有飞书消息发送；Base 仍只通过既有能力门与事件队列处理。
- 设计师页的批准 / 退回是本地复核状态，不是企业审批流。

## 验证证据

- `cd app && npm test`：121/121 通过。
- `cd app && npm run build`：通过；仅保留既有 Vite 大 chunk 警告。
- 本地路由 smoke：
  - `/project/demo` → 200
  - `/review/project-demo` → 200
  - `/handoff/version-demo-initial` → 200
- 新增测试：
  - `app/tests/handoff.test.mjs`
  - 设计师复核汇总规则、差异、家庭证据；
  - 交接包要求每个对象来源明确，并保留企业 API pending。

## 跑偏复查

- 仍遵守“消费者主界面只有一个工作空间”；复核和交接是独立只读后续页。
- 没有恢复客户 / 设计师模式开关。
- 没有把 demo / estimate 字段包装成真实欧派数据。
- 没有让飞书或后台流程倒逼 3D 消费者体验。

## 已知边界

- 设计师批准 / 退回暂未写入 Base 的独立审批表；V1 只保留可展示的复核结论。
- 导出的 machine JSON 是 adapter-ready，不是欧派真实接口 schema。
- 真实欧派数据返回后，需要把 `downstreamPlaceholders` 替换成企业字段映射。
