# Gate 21 审阅：住户微调与高级编辑分层

## 已完成

- 快速微调只显示当前对象 capabilities 允许的移动、旋转与材质操作。
- 尺寸、复制、删除和完整 Pascal inspector 只在用户明确进入高级编辑后出现。
- 固定构件没有伪移动能力；界面明确说明该对象没有住户微调操作。
- 进入高级编辑时记录同一 canonical scene 起点；退出后 Agent 汇总家具、饰面和规则变化，场景仍停留在工作副本。
- 进入 / 退出不改变 room、view、select，也不创建第二个渲染器或第二份 scene。

## 产品精神复核

- Agent-first：通过。高级编辑退出后回到 Agent，由 Agent 解释差异与下一步。
- 用户编辑为辅：通过。快速层只提供低风险修正，完整编辑必须显式进入。
- 操作方便：通过。常用微调无需打开 Pascal inspector；高级能力仍可一次进入。
- 单一地基：通过。所有手动操作继续写入现有 `SceneCommand`、规则、undo / redo 与版本链。

## 验证

- `npm test`：175 / 175 通过。
- 后台 Chromium：快速层无尺寸 / 删除，保留 100 mm 微调；高级层恢复尺寸 / 删除。
- 连续进入 / 退出高级编辑 10 次后 URL 原样保留、画布仍为 1 个、控制台无错误。
- 实际移动后退出，Agent 正确报告 1 项家具变化和规则提醒。
- 截图：`.omx/audits/gate21/quick-adjust-1440x900.png`、`advanced-edit-1440x900.png`、`advanced-return-agent-1440x900.png`。

## 保留边界

- 不 fork Pascal、不重写 transform controls、不新增轻量编辑器。
- 家庭意见与版本确认的会话式编排进入 Gate 22。
