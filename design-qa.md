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
- 床垫、柜体、浅木地板继续使用同一 canonical scene 内的原创 GLB / 材质；餐桌尺度、主卧入口镜头、墙面软淡化和“自动关墙”按钮文案已通过实际截图复查。
- 复核与交接被放在独立页面，不恢复旧的客户 / 设计师模式切换。
- 产品状态清楚暴露 demo / estimate / pending，不冒充真实欧派报价、SKU、BOM、生产或施工接口。

## 验证证据

- `cd app && npm test`：165/165 通过。
- `cd app && npm run test:backend`：77/77 通过。
- `cd app && npm run build`：通过；保留 Vite 大 chunk 警告。
- `cd app && npm run eval:agent`：28/28 通过，`passed: true`。
- 用户可见的浏览器截图复核覆盖 1440×900、俯视编辑与墙面遮挡状态；以下三张图作为 Gate 18 视觉证据：
  - 参考图：`/Users/dracoglasser/.codex/generated_images/019fe061-23e5-7491-a93b-fdfea4046d88/exec-b617e994-c333-4c2d-8f1b-bee31eda4aa4.png`
  - 当前编辑截图：`/var/folders/dl/kf8l_tpn6s53_sqqkdhx28_00000gn/T/codex-clipboard-20e24546-6283-4485-bfba-199f24d2dfd2.png`
  - 当前墙面遮挡截图：`/var/folders/dl/kf8l_tpn6s53_sqqkdhx28_00000gn/T/codex-clipboard-dd3902d5-8769-42d5-bf5c-8395a47e8cea.png`
  - 过渡 / 淡化问题对照：`/var/folders/dl/kf8l_tpn6s53_sqqkdhx28_00000gn/T/codex-clipboard-2d18b799-f2ff-4397-bcf2-1d1ada4921ea.png`

## 已知视觉 / 体验边界

- 当前 3D 是原创、实时、可编辑的风格化渲染，仍未达到客户级写实材质、细节建模和高品质离线效果图的视觉上限；本 QA 不把它声称为写实交付。
- 当前实时验证状态为 Aily `api_unavailable`、Base `ready`；Agent 最多等待 10 秒后自动降级本地 planner，页面不会冒充 Live Aily。
- Vite 报告单 chunk 超过 500 kB；V1 本地 Demo 可接受，正式部署前建议做 Three.js / 页面路由 code splitting。
- `/lab/scene` 仍保留为技术验证入口；若比赛交付需要更干净的 URL，可在部署时隐藏。
