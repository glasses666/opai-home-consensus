# Gate 15 审阅包：Pascal Editor 嵌入式装修前端

日期：2026-08-11

分支：`codex/pascal-frontend`

回退点：tag `v1-pre-pascal-20260811`（`9d268f1`）

迁移安全点：`ad35f8f`

## 本 Gate 完成了什么

- `/project/demo` 使用 Pascal Editor 作为主要 2D / 3D 装修编辑壳；原自研 `Scene3D` 仅保留在 `/lab/scene` 供技术回退。
- 七个房间、墙地顶表面、门窗、家具和材质从同一 canonical scene 投影为 Pascal SceneGraph；毫米坐标在适配层转换为米，canonical ID 始终保留映射。
- 家具位移、旋转、删除以及家具 / 表面材质修改由 Pascal commit 翻译为现有 `SceneCommand`；仅一个可识别命令且通过既有规则时才写回。
- 不支持、批量或规则拒绝的 Pascal 操作会丢弃并重新投影 canonical scene，不建立第二套业务状态。
- Pascal 选择与外层 URL、房间、当前对象同步；页面提供 2D、3D、分屏三个可访问的视图按钮。
- 门的 Pascal 建筑符号补齐开向与几何默认值，2D 不再生成 `NaN` SVG path。
- 保留现有 Agent、版本、undo / redo、家庭共识、设计师复核、Base 留痕和交接合同；Pascal 的保存回调不接管持久化。
- MIT 资产与依赖声明已写入 `THIRD_PARTY_NOTICES.md`。

## 状态流

```text
canonical scene → OPPEIN/Pascal projection → Pascal 2D / 3D
Pascal local commit → SceneCommand → deterministic rules → canonical scene → re-project
Agent tool call ────────────────────────┘
```

## 验证证据

- `node --test tests/pascal-adapter.test.mjs tests/pascal-command-bridge.test.mjs`：6 / 6 通过。
- `npm test`：156 / 156 通过。
- `npm run test:backend`：通过。
- `npm run eval:agent`：通过。
- `npm run build`：通过；存在 Pascal beta 上游大分包警告，不影响构建产物。
- 浏览器 1440 × 900：2D、3D、分屏均能切换；点击 `object-flex-bed` 后 URL、房间与外层选择同步；无无效 SVG path，console errors 0，page errors 0。
- 截图：`.omx/audits/gate15/pascal-project-demo-final.png`。
- 本地入口 `http://127.0.0.1:5180/project/demo` 返回 200；QA 浏览器已在验证后关闭。

## 没有做什么

- 没有让 Pascal IndexedDB、undo history 或保存接口取代 canonical scene / version history。
- 没有实现 Pascal 墙体结构改造回写；当前未映射的结构编辑会安全回退。
- 没有接入真实欧派 SKU、报价、BOM、施工或生产 API。
- 没有完成最终客户级视觉 polish、移动端适配或渲染资源优化。
- 没有在外部 Tailnet 手机或 Safari 设备上重新跑本次最终构建；当前只证明本机入口和自动化浏览器。

## 已知边界与下一步

- Pascal 仍是 `1.0.0-beta.4`，生产包包含多个 500 kB 以上分包；Gate 15 只完成编辑前端替换，不宣称资源预算达标。
- Pascal 现有英文工具、密集层级和默认材质仍需统一信息层级与视觉语言。
- Gate 16 再把固定柜、层板、隔断、背景墙与可替换 AI 3D 模型槽接入相同命令 / 规则路径。
- 后续性能 Gate 按 `PLAN.md` 的单渲染器、隐藏页暂停、资源释放和真实移动设备指标验收。
