# Gate 21 审阅：住户微调权限

## 已完成

- 同一 Pascal 开源编辑器承担浏览和微调，不切回旧 Scene3D，不建第二个画布。
- 住户微调只显示移动、旋转和宽深高；材质、复制、删除、墙体与结构工具不再暴露。
- 固定构件没有伪移动能力；界面明确说明该对象没有住户微调操作。
- 浏览态只允许点选；微调态只放行 `object.setTransform` 与 `object.setDimensions`，其他本地提交立即回滚。
- 两种状态不改变 room、view、select，也不创建第二个渲染器或第二份 scene。

## 产品精神复核

- Agent-first：通过。Agent 仍是默认工作区，微调不承担方案设计。
- 用户编辑为辅：通过。住户没有全量高级编辑入口。
- 操作方便：通过。移动、旋转和尺寸同时在 Pascal 画布和宿主右栏表达。
- 单一地基：通过。所有手动操作继续写入现有 `SceneCommand`、规则、undo / redo 与版本链。

## 验证

- 最终验证数据见本轮提交与 `design-qa.md`。
- 后台 Chromium：Agent 浏览态与微调态均只有 1 个 Pascal canvas；微调可见操作只剩拖动 / 微移、旋转与宽深高。

## 保留边界

- 不 fork Pascal、不重写 transform controls、不新增轻量编辑器，不向住户恢复全量权限。
- 家庭意见与版本确认的会话式编排进入 Gate 22。
