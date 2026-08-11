# 欧派 AI 家庭共创设计器

本仓库正在按照串行 Gate 从零重建。产品目标是让家庭在一套真实、可编辑、受规则约束的住宅模型中与 AI 共同设计并形成可交接的共识。

## 当前状态

- Gate 0 已于 2026-08-08 通过。
- 旧六空间 / 静态效果图 / 方块 3D 原型已移出工作区，不再作为实现基线。
- Gate 1 已于 2026-08-08 验收：七空间 canonical scene、不可变命令入口、CAD-first 建筑平面和三个 2D 显示模式已锁定。
- Gate 2 已于 2026-08-09 验收并以 `080a3b2` 提交：`/lab/scene` 已有同源实时 3D、原创 GLB、整屋 / 房间镜头和真实对象点选。
- 夜间后端包 N1、N2 已完成：命令事务、Agent Harness、真实 Aily / Base、15 项合成装修组件目录与 Prompt 安全边界已通过验证。
- Gate 3 已实现并以 `da9c94b` 保存待验收快照；提交只保存状态，不代表用户验收，也没有进入 Gate 4。
- 后端 B1–B4 已实现、验证并提交：JSON 项目 / 版本持久化、24 案例 Agent 评测、确定性规则与影响、JSON / CSV 企业目录导入适配器。
- Gate 10B 与 Gate 11 已实现：儿童房 / 书房完整闭环、设计师复核页和共识交接 JSON 已可本地审阅。

## 项目入口

- [实施计划](./PLAN.md)
- [Gate 0 产品合同](./GATE-0-PRODUCT-CONTRACT.md)
- [Gate 1 审阅包](./GATE-1-REVIEW.md)
- [Gate 2 审阅包](./GATE-2-REVIEW.md)
- [夜间后端包 N1 审阅](./BACKEND-N1-REVIEW.md)
- [夜间后端包 N2 审阅](./BACKEND-N2-REVIEW.md)
- [后端 B1–B4 审阅](./BACKEND-B1-B4-REVIEW.md)
- [历史飞书能力证据](./FEISHU_EVIDENCE.md)
- [Gate 10B 审阅包](./GATE-10B-REVIEW.md)
- [Gate 11 审阅包](./GATE-11-REVIEW.md)

## 本地审阅

```bash
cd app
npm install
npm run dev -- --port 5173
```

主要审阅页面为 `http://127.0.0.1:5173/project/demo`；设计师复核页为 `/review/project-demo`，交接页为 `/handoff/version-demo-initial`；`/lab/scene` 继续作为 Gate 1 / 2 技术验证页。验证命令为 `npm test` 和 `npm run build`。

后端能力门与 Agent Harness：

```bash
cd app
npm run server
npm run test:backend
npm run eval:agent
```

CLI 服务默认将本地演示项目写入 `app/.data/project-demo.json`；可用 `PROJECT_STORE_PATH` 指定其他单进程 JSON store。`npm run eval:agent:live` 会调用真实 Aily，仅作为独立补充证据。

团队智能体优先读取 `AILY_AGENT_ID`；只有旧 Aily 应用时可使用 `AILY_APP_ID`。本机 `app/.env.local` 已配置已发布的项目智能体且被 Git 忽略；两者都不存在时会确定性降级到本地 planner，`/api/health` 不会误报为 Live Aily。

## Git 规则

- 本地 `main` 是唯一当前分支。
- 不创建 remote、不 push、不部署，除非用户另行授权。
- 每个 Gate 单独实现、验证、审阅；用户验收后才进入下一 Gate。
- 旧 V1 的可恢复副本位于系统废纸篓，不允许直接复制回新实现。
