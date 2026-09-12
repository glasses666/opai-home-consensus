# 交接材料地图

## 当前入口

| 路径 | 用途 | 时效 |
| --- | --- | --- |
| `docs/defense-handoff-20260912/` | 当前事实、Demo 流程、撰稿 Agent 提示词 | 当前权威入口 |
| `PLAN.md` | Demo 范围锁、发行版分线、项目实施边界 | 当前实施权威 |
| `DEMO-SCRIPT.md` | 历史镜头与表达参考 | 非当前事实表 |

## 2026-08-16 最终方案研究档案

路径：`submission/research-2026-08-16/`

包含正式报名稿、研究底稿、可选附件结构、电视墙几何复算、匿名化定向样本、方法边界、四页补充材料 PDF/HTML/预览和宣讲会来源摘要。

用途：理解问题定义、研究方法和早期方案逻辑。
边界：这是带日期的历史档案；其中赛程状态、实现状态、测试数和后续待办均不得覆盖 `CURRENT-FACTS.md`。原始社交截图、第三方身份信息、官方完整录屏与原始逐字稿不随公开包分发。

## 2026-09-07 路演与老师材料

- `submission/roadshow-2026-09-07/`：优化稿、七分钟讲稿、材料找回对照、公开案例研究、技术答辩附件和验证记录。
- `submission/teacher-package-2026-09-07-v2/`：老师交付包中适合普通 Git 审阅的文档和证据；视频由 GitHub Release 保存。

用途：复用叙事结构、证据来源和答辩问题。
边界：不能照抄其中旧界面、旧能力状态、旧测试数或旧公网结论。

## 2026-09-11 至 09-12 GPT Pro 交付

- `docs/gptpro-ui-design-handoff-20260912/`：家庭意见 UI 的六方向研究与实现代码。
- `docs/gptpro-ui-design-handoff-20260912.zip`：同一 UI 研究包的便携副本。
- GitHub Release：Harness 修复完整包、变更文件包、家庭 UI 六方向原交付包。

用途：后续审计设计与 Harness 决策，不要求主讲 Agent通读。
边界：交付报告中的环境、测试数和 provider 状态是当时记录；当前状态仍以 `CURRENT-FACTS.md` 为准。

## 大文件交付

普通 GitHub Git 对单文件有 100 MB 限制，因此完整老师材料 ZIP 和历史视频不进入源码树，而放在 Release：

<https://github.com/glasses666/opai-home-consensus/releases/tag/handoff-2026-09-12>

Release 中的 `SHA256SUMS.txt` 用于逐文件核对。源码仓库保留去重后的可审阅材料，Release 保留原封完整包。

## 推荐取材顺序

1. 从当前 Demo 录像摘取可见事实和镜头顺序。
2. 从 `CURRENT-FACTS.md` 校对能力与边界。
3. 从 9 月 7 日路演材料复用叙事结构和答辩题型。
4. 从 8 月 16 日研究档案补问题证据和早期方案逻辑。
5. 只有缺少最新赛事规则或官方数据时才外部搜索，并优先原始来源。
