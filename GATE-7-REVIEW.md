# Gate 7 Review：版本、真实差异、影响与确认

状态：已实现、已验证，等待用户验收。

## 本 Gate 构建了什么

- 从同一份 `SceneCommand` 历史重建 `V1 / V2 / V3...`，旧版本可回看、可恢复，不引入第二套 scene。
- 版本抽屉显示当前状态、对比基准、对象差异、规则状态、影响项和未决项。
- 对象差异来自真实场景：新增 / 删除、位置旋转、尺寸和材质变化，不再用预设文案冒充版本变化。
- 影响数据复用 `compareDesignImpact`，只展示几何和 demo catalog 能可靠推导的内容；未知收纳继续标记为 `estimate / unresolved`。
- 支持客户确认当前版；确认后继续修改会把当前版标为 `changed_after_confirm`，已确认旧版仍保留。
- 支持回到选中的旧版本；恢复旧版不会删除后续版本证据。

## 本 Gate 没做什么

- 未做真实高质量离线渲染缩略图；当前版本视觉仍由实时 3D 场景重建。
- 未生成精确价格、工期、BOM 或企业收益；这些仍等待欧派 API / 数据。
- 未做家庭多人意见、设计师复核或交接单；这些属于后续 Gate。
- 未把版本状态接入飞书 Base；当前先保证本地同源版本逻辑。

## 修掉的问题

- 修复未决影响文案里泄露英文对象名的问题。
- 修复同一版本自对比仍显示影响项的问题；同版对比现在为 0 impact / 0 unresolved。

## 验证证据

- 自动化：`npm --prefix app test`，98 passed / 0 failed。
- 构建：`npm --prefix app run build` 通过；仅保留既有大 chunk 警告。
- 后台浏览器住户流程：
  - 移动沙发生成 V2；
  - 客户确认 V2；
  - 修改材质生成 V3，并显示 `确认后修改`；
  - 选择 V2 并回到此版后，V2 仍显示已确认，V3 仍作为历史草稿存在。
- 证据文件：
  - `.omx/audits/gate7/resident-version-flow.json`
  - `.omx/audits/gate7/version-drawer-after-restore.png`

## 已知边界

- 版本 ID 目前按本地命令序列生成，适合 demo；多人共享与 Base 幂等版本 ID 需要 Gate 9/11 接入。
- “高质量效果图”当前解释为同一 3D scene 的实时视图，不是服务端离线渲染。
- `estimate / unresolved` 是刻意边界，不能升级为真实欧派报价或施工结论。
