# Gate 7 Review：版本、真实差异、影响与确认

状态：已实现、已验证，等待用户验收。

## 本 Gate 构建了什么

- 只有住户明确保存时才从同一份 `SceneCommand` 历史生成 `V1 / V2 / V3...`；一次连续编辑不会被拆成大量伪版本。
- 每个版本都可从初始 scene 与命令游标重建并校验快照，旧版本可回看、可恢复，不引入第二套 scene。
- 版本抽屉显示当前状态、对比基准、对象差异、规则状态、影响项和未决项。
- 对象差异来自真实场景：新增 / 删除、位置旋转、尺寸和材质变化，不再用预设文案冒充版本变化。
- 影响数据复用 `compareDesignImpact`，只展示几何和 demo catalog 能可靠推导的内容；未知收纳继续标记为 `estimate / unresolved`。
- 支持客户确认当前版；确认后的未保存编辑立即显示 `changed_after_confirm`，保存后形成新的确认后修改版本，已确认旧版仍保留。
- 支持从选中的旧版本继续；恢复动作会追加一个 `revert` 来源的新版本，不删除后续版本证据。
- 版本链使用校验后的 `localStorage` 作为断网演示缓存；刷新后仍恢复到同一版本、场景与确认状态。

## 本 Gate 没做什么

- 未做真实高质量离线渲染缩略图；当前版本视觉仍由实时 3D 场景重建。
- 未生成精确价格、工期、BOM 或企业收益；这些仍等待欧派 API / 数据。
- 未做家庭多人意见、设计师复核或交接单；这些属于后续 Gate。
- 未把版本状态接入飞书 Base；当前先保证本地同源版本逻辑。

## 修掉的问题

- 修复未决影响文案里泄露英文对象名的问题。
- 修复同一版本自对比仍显示影响项的问题；同版对比现在为 0 impact / 0 unresolved。

## 验证证据

- 自动化：`npm --prefix app test`，101 passed / 0 failed。
- 构建：`npm --prefix app run build` 通过；仅保留既有大 chunk 警告。
- 后台浏览器住户流程：
  - 移动沙发后明确保存为 V2；
  - 客户确认 V2；
  - 修改材质时立即显示 `确认后修改`，明确保存为 V3；
  - 选择 V2 并从此版继续后追加 V4；V2、V3 均仍可回看；
  - 刷新页面后仍加载 V4，父链、V2 确认状态与恢复后的沙发材质一致；
  - 浏览器控制台无未处理异常。
- 证据文件：
  - `.omx/audits/gate7/resident-version-flow.json`
  - `.omx/audits/gate7/version-drawer-after-restore.png`
  - `.omx/audits/gate7/final/01-version-drawer-initial.png`
  - `.omx/audits/gate7/final/02-version-restored-v4.png`

## 已知边界

- 版本 ID 目前按本地命令序列的稳定摘要生成，适合单设备 demo；多人共享与 Base 幂等版本 ID 需要 Gate 9/11 接入。
- “高质量效果图”当前解释为同一 3D scene 的实时视图，不是服务端离线渲染。
- `estimate / unresolved` 是刻意边界，不能升级为真实欧派报价或施工结论。
