# Gate 6 Review：设计规范与受约束编辑

状态：已实现、已验证，等待用户验收。

## 本 Gate 构建了什么

- 同一套 `DesignRule` 在手动编辑、2D / 3D 场景和未来 Agent 命令入口复用；没有让 LLM 直接裁决几何。
- 首批确定性规则覆盖房间边界、家具碰撞、保护净距、门扇开启、电视观看距离、高柜防倾倒和固定设备贴墙关系。
- hard block 在命令入口原子拒绝，失败尝试不会写入 scene；页面明确显示“刚才已阻止 / 未写入”。
- warning / recommendation 在空间修改后进入“保留此预览 / 撤销预览”，确认前禁止继续叠加修改。
- 移动或旋转家具时，3D 同场景显示当前房间的净距覆盖层；覆盖层不参与点选，也不进入玻璃或墙体虚化逻辑。
- 规则面板使用住户可理解的中文，给出调整建议，并明确标注 `source: demo` 与适用边界。

## 本 Gate 没做什么

- 未宣称这些合成规则等同欧派、建筑、消防或施工审图规则；真实落地仍需企业规则 API 和专业复核。
- 未实现连续拖动过程中的实时热力图和自动合法吸附；当前在提交命令时统一校验。
- 电视观看距离等关系型建议没有伪造几何区域，只在规则面板呈现可靠数值与建议。
- 未做持久版本、影响对比和客户确认状态；这些属于 Gate 7。

## 修掉的问题

- 修复“初始场景已经存在 warning 时，移动家具不进入待确认”的缺口；空间编辑现在会复核受影响对象的现存提醒。
- 修复待确认期间仍能继续叠加移动或复制的问题。
- 修复 hard block 后规则卡仍显示旧场景状态、用户看不到刚才失败原因的问题。
- 修复规则信息缺少公开适用边界的问题。

## 验证证据

- 自动化：`npm --prefix app test`，95 passed / 0 failed。
- 构建：`npm --prefix app run build` 通过；仅保留现有大 chunk 警告。
- 黑盒住户流程：第一次床位调整进入待确认，第二次调整被锁住，撤销后恢复且按钮消失。
- 黑盒租户流程：连续移动沙发触发硬边界，规则卡显示“未写入”，当前 scene 仍通过边界规则。
- 3D 运行时保持同一 canvas、GLB `9/9` 和 `ready`。
- 截图：
  - `.omx/audits/gate6/homeowner-recheck/02-first-move-pending.png`
  - `.omx/audits/gate6/homeowner-recheck/03-second-move-blocked.png`
  - `.omx/audits/gate6/homeowner-recheck/05-undo-preview-success.png`
  - `.omx/audits/gate6/final/01-hard-block-visible.png`
  - `.omx/audits/gate6/clearance-overlays-sofa-move.png`

## 已知边界

- 所有首批规则都属于合成演示数据；真实欧派规则到达后应替换来源和适用范围，不能直接把 demo 结论升级为企业结论。
- 当前覆盖层来自 canonical `clearanceZones`，适合解释净距，不是施工图审查结果。
- 规则确认目前只控制当前编辑会话；Gate 7 才负责持久版本、确认后再改和可回退状态。
