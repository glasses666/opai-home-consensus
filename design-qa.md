# Design QA

final result: passed

> 通过范围是“可操作、可回放、可交接的本地 V1 Demo”，不等同于客户级写实渲染或欧派生产系统已接通。

## 审核范围

- `/project/demo`：消费者工作台、2D / 3D 同源浏览、对象编辑、Agent、家庭共识、版本面板。
- `/review/project-demo`：设计师复核页。
- `/handoff/version-demo-initial`：共识交接页。
- `/lab/scene`：保留为 Gate 1 / 2 技术验证页，不作为主交付入口。

## 设计判断

- 信息架构保持当前产品合同：3D 是主浏览和编辑面，2D 是同步只读总览，不回到旧的静态图片热点原型。
- 视觉风格维持浅木、暖白、克制层级和北欧家居目录感；没有使用 IKEA logo、蓝黄品牌配色、商品图或独立效果图冒充实时 3D。
- 对照参考图，3D 仍占据工作台最大视觉面积；Pascal 自带侧栏默认收起，宿主只保留一个可逆入口，减少“双编辑器”拼接感。
- Agent 是默认任务入口；快速微调与 Pascal 高级编辑必须显式进入，退出后由 Agent 汇总差异。
- Pascal 载入期间显示同源 2D 户型、家具和当前选择，不再留下无法解释的空白画布。
- 家庭冲突卡直接保留成员原话，方向使用 A / B 主标签；真实多人同步边界在标题处可见。
- 暖白、浅木和克制酒红延续参考概念图的目录感，但没有使用 IKEA logo、蓝黄品牌配色、商品图片或复制页面结构。
- 1440、1366、1024 桌面视口均保留可用主画面与侧栏；密集业务微文案提高到至少 11px，390×844 默认只加载轻量态，不启动完整 3D。
- 版本、来源、Agent 降级和企业 `pending` 状态始终可见；页面不会把本地 planner、演示目录或估算字段伪装成真实欧派能力。
- Pascal 采用有效的 site / building scene graph 与 `rendered` 阴影材质；这是实时同源模型，不用独立效果图冒充 3D 结果。
- 复核与交接被放在独立页面，不恢复旧的客户 / 设计师模式切换。
- 产品状态清楚暴露 demo / estimate / pending，不冒充真实欧派报价、SKU、BOM、生产或施工接口。

## 验证证据

- `cd app && npm test`：175/175 通过。
- `cd app && npm run test:backend`：81/81 通过。
- `cd app && npm run build`：通过；保留 Vite 大 chunk 警告。
- `cd app && npm run eval:agent`：28/28 通过，`passed: true`。
- 用户可见浏览器复核覆盖桌面三档、移动轻量态、交接页和相机运动；证据如下：
  - 参考图：`/Users/dracoglasser/.codex/generated_images/019fe061-23e5-7491-a93b-fdfea4046d88/exec-b617e994-c333-4c2d-8f1b-bee31eda4aa4.png`
  - 当前桌面：`.omx/audits/gate18/final-1440x900.png`、`.omx/audits/gate18/final-1366x768.png`、`.omx/audits/gate18/final-1024x768.png`
  - 移动轻量态：`.omx/audits/gate18/final-mobile-390x844.png`
  - 交接页：`.omx/audits/gate18/final-handoff.png`
  - 旋转 / 缩放录屏与抽帧：`.omx/audits/gate18/camera-orbit-zoom.mp4`、`.omx/audits/gate18/camera-contact-sheet.png`
  - 五类住户黑盒截图：`.omx/audits/gate23/resident-1-first-timer.png` 至 `resident-5-remote-member.png`
  - 修复复验：`.omx/audits/gate23/resident-1-after-fix.png`、`resident-2-after-fix.png`
  - Gate 23 相机录屏与抽帧：`.omx/audits/gate23/camera-orbit-zoom.webm`、`camera-contact-sheet.png`

## 已知视觉 / 体验边界

- 当前 3D 是原创、实时、可编辑的风格化渲染，仍未达到客户级写实材质、细节建模和高品质离线效果图的视觉上限；本 QA 不把它声称为写实交付。
- 当前实时验证状态为 Aily `api_unavailable`、Base `ready`；Agent 最多等待 10 秒后自动降级本地 planner，页面不会冒充 Live Aily。
- Vite 报告单 chunk 超过 500 kB；V1 本地 Demo 可接受，正式部署前建议做 Three.js / 页面路由 code splitting。
- `/lab/scene` 仍保留为技术验证入口；若比赛交付需要更干净的 URL，可在部署时隐藏。
- 典型旋转 / 缩放连续且无异常；极端自由环绕仍可能到达建筑外侧，Pascal beta 的上游 BVH deprecation warning 也仍会出现在控制台 warning 层级。两者均不冒充已解决。
