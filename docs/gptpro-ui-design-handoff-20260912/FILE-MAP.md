# 文件地图

## 最高优先级

- `source/app/src/ExperienceDiscussion.jsx`：当前真实飞书家庭讨论 UI、状态与防重复操作合同。
- `source/app/src/App.jsx`：工作台模式切换、家庭入口、设计助理回流、旧 Demo 家庭共识界面、设计师复核与交接页。
- `source/app/src/workbench-guidance.css`：当前 `ExperienceDiscussion` 样式。
- `source/app/src/workbench-studio.css`：当前 330px 侧栏与设计助理视觉语言。
- `source/app/src/studio-details.css`、`styles.css`：旧家庭共识界面及兼容样式。
- `fixtures/family-discussion-states.json`：六套设计沙盒应覆盖的脱敏状态。

## 整站视觉上下文

- `source/app/src/HomePreview.jsx`、`AmbientHouse.jsx`、`DesignDirections.jsx`、`RoomletStoryMedia.jsx`：首页、入口和项目建立流程。
- `source/app/src/project-editorial.css`、`setup-editorial.css`、`home-preview.css`、`home-glass.css`、`roomlet-story.css`：暖白、陶土红、深橄榄、宋体标题的品牌上下文。
- `source/app/src/workbench-editorial.css`、`review-editorial.css`：工作台、设计师复核和交接页。
- `source/app/src/experience-motion.css`：现有克制动效与 reduced-motion 处理。
- `source/app/src/entry.css`、`main.jsx`、`WorkbenchApp.jsx`：加载入口和样式装载顺序。

## 相关 UI 模块

- `ExperienceDocuments.jsx`：房屋资料/来源界面，可借鉴来源渐进披露。
- `GuidancePanels.jsx`：需求摘要与单轮证据呈现。
- `FeishuDelivery.jsx`：飞书交付状态，注意不要把其后端状态冒充家庭意见同步状态。
- `experience-client.js`：HTTP 错误与请求语义。
- `experience-handoff.js`、`workbench-diff.js`、`conversation-presentation.js`、`workbench-session.js`：回流、差异、自然语言和未保留预览边界。

## 领域合同

`source/app/src/domain/` 中只保留 UI 直接需要理解的版本、家庭共识、交接、入口、设置和名称合同。它们是行为依据，不是要求 GPTPro 重做业务层。

## 测试

`source/app/tests/` 是当前行为保护，尤其关注：

- `discussion-ui-state.test.mjs`
- `family-discussion.test.mjs`
- `consensus-secretary.test.mjs`
- `experience-handoff.test.mjs`
- `household-consensus.test.mjs`
- `handoff.test.mjs`

测试内的固定身份和意见都是测试数据，不是客户事实。

## 证据

- `evidence/current/`：2026-09-08 的当前系列桌面/手机整体 UI 截图，仅帮助保持整站视觉；2026-09-12 当前源代码优先。
- `evidence/historical/`：过去版本的家庭共识、冲突、选择、复核和交接流程，说明曾经探索过什么；不得直接恢复为当前产品。
- `evidence/README.md`：证据等级和使用方式。

## 不可运行说明

这个包是“设计任务最小充分上下文”，不是完整产品副本。因为明确排除了 3D 组件、模型、后端和凭据，`source/app/` 不能独立运行完整 OPAI。GPTPro 应：

1. 在包内另建无 3D 的 proposal playground，使用 fixture；或
2. 在有权访问的完整仓库分支中运行，但只修改允许路径。

不能为了让包独立运行而伪造或重写 3D。

