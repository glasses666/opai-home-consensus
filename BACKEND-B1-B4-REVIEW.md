# 后端 B1–B4 审阅包

日期：2026-08-09
范围：仅后端、领域逻辑、导入适配器与测试；没有修改 `/project/demo`，也不代表 Gate 3 已验收。

## B1：可恢复项目状态

- Node 标准库 JSON store 持久化项目、`SceneVersion`、命令记录和 Base 待同步事件。
- 每次保存使用同目录临时文件后原子替换；损坏或逻辑不一致的文件会保留为 `.corrupt-*`，服务从可验证初始状态恢复。
- `eventId` 保证重复请求不重复执行；相同 ID、不同载荷返回冲突。
- `expectedVersionId` 和服务端捕获的 base version 阻止并发旧场景覆盖新版本。
- CLI 服务默认写入 `app/.data/project-demo.json`；测试仍可注入内存 store，避免互相污染。

主要入口：

- `GET /api/projects/:id`
- `POST /api/agent/turn` 的 `eventId`、`versionId` / `expectedVersionId`
- [project-store.mjs](./app/server/project-store.mjs)

## B2：固定 Agent 评测

- 24 个固定案例覆盖工具选择 10、越权写入 5、硬约束 5、回复依据 2、provider 降级 2。
- 报告 schema 固定为 v1，逐案例保留脱敏 trace、工具调用、步骤、回滚与延迟。
- `npm run eval:agent` 默认离线、可重复，不依赖飞书可用性。
- `npm run eval:agent:live` 是独立补充证据，不混入离线基线。

本次离线结果：24/24，通过；平均 0.722 ms，P95 2.485 ms。

本次真实 Aily 冒烟：3/3 完成；墙板与层板由 provider 正常返回，沙发移动因 `PROVIDER_SHAPE_INVALID` 安全降级到本地 planner 后完成。

主要入口：[agent-cases.mjs](./app/evals/agent-cases.mjs)、[eval_agent_prompt.mjs](./app/scripts/eval_agent_prompt.mjs)。

## B3：确定性规则与影响

- 统一规则状态：`blocked | warning | passed`。
- 覆盖房间边界、对象碰撞、保护净距与门扇开启区；门扇结果遵循对应规则的严重级别。
- 输出变更前后规则、净距保护区占用变化、柜类外包围盒收纳估算与 `unresolved`。

当前估算边界：

- `beforeAvailableMm` / `afterAvailableMm` 表示保护区是否被占用，不是连续几何最短距离。
- 收纳量是柜体外包围盒体积，`source: estimate`，不是可用内部净容积。
- 合成住宅现有门扇数据存在固定柜体相交，因此 demo 的 opening clearance 暂为 warning；企业级规则可配置为 hard block，自动化测试已覆盖。

主要入口：[design-rules.js](./app/src/domain/design-rules.js)、[design-impact.js](./app/src/domain/design-impact.js)。

## B4：企业目录导入边界

- 支持 JSON / CSV，要求显式 `units: mm`。
- 校验稳定目录 / 模块 ID、正整数毫米尺寸、来源、价格与工期 provenance、组合 / 禁配引用和 scene-ready 操作。
- CSV 拒绝未闭合引号、重复或空 header、脏字段；任何错误都整体拒绝，不部分导入。
- 导入成功后适配为现有 catalog plugin 的 `describe / summary / search / get` 合同，Agent 工具无需随企业 provider 改写。

当前只允许已存在且可安全执行的 `surface.setMaterial` scene-ready 操作。真实模块安装几何、报价、BOM 与施工约束尚未提供时不会伪装可执行。

主要入口：[import-catalog.js](./app/src/catalog/import-catalog.js)。

## 验证证据

- `npm run test:backend`：62/62 通过。
- `npm test`：88/88 通过。
- `npm run build`：通过；只有既有的单 bundle 大小提醒。
- 双进程重启冒烟：写入新版本、停止服务、重新启动后 `currentVersionId` 恢复一致。
- `git diff --check`：通过。

## 明确没有完成

- 没有数据库、跨进程锁、用户 / 租户权限和多实例一致性；当前 JSON store 适合本地单进程 V1。
- 没有真实欧派 SKU、组合规则、报价、BOM、工期或生产接口。
- 没有目录上传 API；当前是可由 BFF 或脚本调用的导入适配器。
- 没有把 B3 影响结果接入页面；页面接线仍应按后续已验收 Gate 推进。
- 没有修改或验收 Gate 3。
