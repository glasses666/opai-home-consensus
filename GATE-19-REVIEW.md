# Gate 19 审阅：Agent-first 主工作空间

## 已完成

- `/project/demo` 默认打开 Agent，而不是属性或编辑工具。
- 首条消息读取当前住宅空间数、版本与场景上下文；未选择对象时从整屋目标开始。
- 当前对象保留 `让 Agent 调整` 与`微调`两个层级。
- Pascal 保留为同一 canonical scene 的 2D / 3D 主画布；住户微调只放行移动、旋转和宽深高。
- 状态切换不重建 scene，也不改 room / view / select / version。

## 产品精神复核

- Agent-first：通过。首屏主要任务是表达需求并让 Agent 推进设计。
- 用户编辑为辅：通过。微调必须显式进入，且无全量高级入口。
- 操作方便：通过。Agent、微调、家庭三个主要侧栏互斥；同一时刻只有一个主要侧栏。
- 既有能力：通过。未删除 Pascal、2D / 3D、版本、家庭、复核或交接能力。

## 验证

- `npm test`：169 / 169 通过。
- `npm run build`：通过；仅保留现有大 chunk 警告。
- 后台 Chromium 截图：`.omx/audits/gate19/agent-first-1440x900.png`、`agent-first-1366x768.png`、`agent-first-1024x768.png`。
- 截图进程使用独立临时 profile，取证后已结束；未占用用户前台浏览器。

## 保留边界

- Gate 19 不修改 Agent 回合协议、DesignBrief、规则、版本或企业 adapter；这些进入 Gate 20。
- Pascal 浏览态仍保留其原生视图控制，避免在层级校正 Gate 中 fork 上游编辑器。
