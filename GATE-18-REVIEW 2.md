# Gate 18 审阅：最终信息层级、视觉收口与 V1 交付

日期：2026-08-11  
分支：`codex/pascal-frontend`  
基线：`8e10581`

## 已构建

- `/project/demo` 的主工作台完成最终信息层级收口：顶部品牌、版本、当前房间、3D 主画面、右侧侧栏与交接入口按同一视觉节奏组织，不再像临时拼接的编辑器。
- Pascal 使用有效的 site / building scene graph 和 `rendered` 阴影材质；内嵌工具栏默认收起，宿主只保留一个“打开装修工具”入口，展开 / 收起后会重新计算 WebGPU 画布尺寸。
- 修复 Pascal 固定定位覆盖层越界造成的宿主侧栏点击拦截；编辑区现在被限定在自己的绘制与命中区域，Agent、家庭和版本面板可稳定切换。
- Pascal 编辑区在窄视口下进入轻量浏览态，保留 2D 总览与上下文说明，并通过“进入完整 3D”显式恢复完整编辑器，避免移动端 / 低宽度首帧过重。
- 3D 观察时的墙面遮挡改为“软淡化”而不是直接消失；按钮文案从工程语气收口为“自动关墙”，更贴合用户语义。
- 右侧视角切换与房间摘要保持统一术语：当前房间、当前选择、当前视角、同一 scene 的上下文都集中在主工作台里，不再重复暴露宿主和编辑器两套术语。
- 持久化项目只在“同 scene ID、且仍是未编辑的初始演示记录”时允许升级 canonical schema；已形成版本历史或不同 scene ID 时继续拒绝覆盖，避免交接链路因开发期模型演进卡死或误吞用户数据。
- 交付文档已同步更新：`README.md`、`DEMO-SCRIPT.md`、`design-qa.md` 与本审阅包。

## 验证

- `cd app && npm test`：166 / 166 通过。
- `cd app && npm run test:backend`：78 / 78 通过。
- `cd app && npm run eval:agent`：28 / 28 通过，`passed: true`。
- `cd app && npm run build`：通过；仍保留 Three / Pascal / PDF 的 chunk warning，但不影响本地 V1 交付。
- 视觉对照使用了用户可见的真实浏览器截图与参考概念图：
  - 参考图：`/Users/dracoglasser/.codex/generated_images/019fe061-23e5-7491-a93b-fdfea4046d88/exec-b617e994-c333-4c2d-8f1b-bee31eda4aa4.png`
  - 1440×900：`.omx/audits/gate18/final-1440x900.png`
  - 1366×768：`.omx/audits/gate18/final-1366x768.png`
  - 1024×768：`.omx/audits/gate18/final-1024x768.png`
  - 移动轻量态 390×844：`.omx/audits/gate18/final-mobile-390x844.png`
  - 设计师复核后的交接页：`.omx/audits/gate18/final-handoff.png`
  - 旋转 / 缩放录屏与抽帧：`.omx/audits/gate18/camera-orbit-zoom.mp4`、`.omx/audits/gate18/camera-contact-sheet.png`
- 浏览器完整链路实测：2D 选房 → 3D → Agent 移动沙发 → V2 → 客户确认 → 提交设计师复核 → 批准 → 交接页；无未处理业务错误。

## 已知边界

- 仍不是客户级写实效果图；这是同源、可编辑、可交接的 V1 实时渲染。
- Vite 依旧提示 Pascal / Three / PDF 大 chunk，Pascal beta 运行时还有上游 BVH deprecation warning；均已隔离为警告，不影响本地 V1 主链路。
- 典型幅度旋转与缩放录屏抽帧连续、无异常；极端自由环绕仍可能到达建筑外侧，且 Pascal 尚未复刻旧 canonical 查看器的墙体视线自动裁切。
- 真实欧派 SKU / 报价 / BOM / 生产 API 仍保持 pending，不在本 Gate 冒充已接通。
