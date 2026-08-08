> **历史 V1 集成证据**：保留 Base / Aily 能力事实供后续复用，但不代表新的住宅模型、页面或 Agent 已接通。当前产品依据见 [PLAN.md](./PLAN.md) 与 [Gate 0 产品合同](./GATE-0-PRODUCT-CONTRACT.md)。

# 飞书能力门与回查证据（历史 V1）

验证时间：2026-08-08（Asia/Shanghai）

## 多维表格：ready

- Base：<https://larkcommunity.feishu.cn/base/S1GObxwLNaqZI9sRaZKcNZWPnRc>
- Projects：`tblPfcY3DCAPUuHr`
- Spaces：`tblJ3BzQBNPOu1dq`
- Versions：`tbl1tKvjpMUoJrA1`
- Activity：`tbl35yjMLZMDsd1p`
- 项目记录：`PRJ-2026-008 / 静安·王女士住宅`，record `recvrH5PVHnfsY`，写入后回读一致。
- 六个空间和六个基线版本已写入；所有演示数值带 `demo` / `estimate` 来源。

## 完整黄金链回查

Activity 表已经回读到：

1. `evt-v1-golden-turn` → `agent_turn` → `local` → `synced`，record `recvrHbmOqhd7h`。
2. `evt-v1-golden-apply` → `version_applied` → `synced`，record `recvrHbnns9k78`。
3. `living-open-v2` → `customer_confirmed` → `synced`，record `recvrHbnWJDp6n`。
4. `living-open-v2` → `designer_approve` → `synced`，record `recvrHbowgu2xE`。

Versions 表回读 `living-open-v2 / designer_verified / demo`，record `recvrHbnWOWWLl`。后续浏览器验证还真实写入了主卧、儿童房和开放客餐厅 V3 / V4 的 Agent 与版本事件。

事件到新版本的关联另行复核：`evt-v1-version-link-apply` 回读为 `primary-bedroom-v2 / version_applied`，record `recvrHfUlJLVhP`，没有误指向父版本。

## Aily：missing_scope

官方接口合同已按文档实现：

1. `POST /open-apis/aily/v1/sessions`
2. `POST /open-apis/aily/v1/sessions/:session_id/messages`
3. `POST /open-apis/aily/v1/sessions/:session_id/runs`
4. `GET /open-apis/aily/v1/sessions/:session_id/runs/:run_id`
5. `GET /open-apis/aily/v1/sessions/:session_id/messages`

当前缺少：

- `aily:session:write`
- `aily:message:write`
- `aily:run:write`
- `aily:run:read`
- `aily:message:read`
- 目标 Aily app ID（`spring_xxx__c`）

因此 UI 明确显示 `Local Agent + Live Base`，没有把 Codex 的飞书连接误报成 Aily 已接通。授权完成后再做一次真实 Aily turn 验收。

## 数据与安全边界

- 浏览器不持有飞书 token；本地 BFF 通过已登录的 `lark-cli` 写入。
- Activity 写入前按 Event ID 搜索，重复事件更新同一记录。
- Aily 失败只重试一次，再降级；Base 写入失败保留本地版本和 pending 状态。
- 未发送群消息、未联系 Coach、未公开分享、未配置公网部署。
