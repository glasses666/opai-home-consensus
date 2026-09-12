# 给主讲稿撰写 Agent 的提示词

```text
你正在接手 OPAI「我的生活空间」Demo 的答辩稿工作。请直接在当前仓库内工作，不要先进行宽泛搜索。

仓库地址：https://github.com/glasses666/opai-home-consensus
指定工作分支：codex/demo-handoff-20260912
交接入口：https://github.com/glasses666/opai-home-consensus/blob/codex/demo-handoff-20260912/docs/defense-handoff-20260912/00-START-HERE.md

如果本地还没有仓库，请克隆上述仓库并切换到指定工作分支；不要从 main 或其他历史分支撰写。若只能通过 GitHub 网页访问，也必须以指定分支中的文件为准。

先按顺序完整阅读：
1. docs/defense-handoff-20260912/00-START-HERE.md
2. docs/defense-handoff-20260912/CURRENT-FACTS.md
3. docs/defense-handoff-20260912/DEMO-FLOW.md
4. docs/defense-handoff-20260912/MATERIALS-MAP.md
5. docs/defense-handoff-20260912/AGENT-EXPLORATION.md
6. PLAN.md 顶部的 Demo 范围锁

如果已经提供最终 Demo 视频，请把视频作为画面和流程的第一事实来源，先逐段建立时间码、用户动作、系统响应和可见变化；再用 CURRENT-FACTS.md 核对能力边界。2026-08-16 与 2026-09-07 的文件只能用于理解历史、取证和叙事参考，不能直接沿用其中的测试数、运行状态或未来设想。

产品的核心不是 AI 生图，而是：用户用日常语言表达生活需求，设计 Agent 在同一个可编辑 3D 住宅中提出受规则约束、可撤销、可保存的修改；个人方案保存后，家人的原始意见、AI 整理和用户暂选保持分层，由用户决定哪些意见带回设计。

严格遵守真实性：不要声称当前已接通欧派 SKU、报价、BOM、施工或生产；不要把 local fallback、DeepSeek、Aily、飞书混为一体；不要把固定录制场景说成开放域能力。Demo 里的加家具只能按 CURRENT-FACTS.md 所写，描述为带“编排演示”标签的固定、可复现场景。不要为稿件建议新增功能，Demo 视频完成前只能排练或修复现有流程。

请输出五个文件：
- 01-七分钟主讲稿.md
- 02-镜头与操作提示.md
- 03-答辩题库.md
- 04-事实核对表.md
- 05-待补证据.md

主讲稿应口语自然，让第一次听说项目的人能在前 30 秒明白“谁遇到什么问题、系统怎么帮助、为什么不是普通 AI 效果图”。每一个关键主张都要绑定视频画面或当前材料证据。技术细节放在答辩题库，不要塞进主讲台词。

只有在以下情况才联网搜索：核对最新比赛时长/格式/答辩规则、寻找欧派企业命题原始文本、或补一个确实缺少的一手行业来源。搜索时优先官方原始来源，并在事实核对表记录链接和访问日期。

先完成材料与视频审计，再写稿。若视频与文字材料冲突，以实际视频画面为准，并把冲突列入待补证据，不要自行脑补。
```
