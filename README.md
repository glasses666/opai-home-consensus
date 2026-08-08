# 欧派 AI 家庭共创设计器

本仓库正在按照串行 Gate 从零重建。产品目标是让家庭在一套真实、可编辑、受规则约束的住宅模型中与 AI 共同设计并形成可交接的共识。

## 当前状态

- Gate 0 已于 2026-08-08 通过。
- 旧六空间 / 静态效果图 / 方块 3D 原型已移出工作区，不再作为实现基线。
- Gate 1 已于 2026-08-08 验收：七空间 canonical scene、不可变命令入口、CAD-first 建筑平面和三个 2D 显示模式已锁定。
- Gate 2 已获准开始；当前仍只有 `/lab/scene` 技术检验页，没有已验收的 3D、拖拽、Agent 或产品工作台。

## 项目入口

- [实施计划](./PLAN.md)
- [Gate 0 产品合同](./GATE-0-PRODUCT-CONTRACT.md)
- [Gate 1 审阅包](./GATE-1-REVIEW.md)
- [历史飞书能力证据](./FEISHU_EVIDENCE.md)

## 本地审阅

```bash
cd app
npm install
npm run dev -- --port 5173
```

打开 `http://127.0.0.1:5173/lab/scene`。验证命令为 `npm test` 和 `npm run build`。

## Git 规则

- 本地 `main` 是唯一当前分支。
- 不创建 remote、不 push、不部署，除非用户另行授权。
- 每个 Gate 单独实现、验证、审阅；用户验收后才进入下一 Gate。
- 旧 V1 的可恢复副本位于系统废纸篓，不允许直接复制回新实现。
