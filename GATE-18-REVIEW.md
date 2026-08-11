# Gate 18 审阅：最终信息层级、视觉收口与 V1 交付

日期：2026-08-11  
分支：`codex/pascal-frontend`  
基线：`8936b39`

## 已构建

- `/project/demo` 的主工作台完成最终信息层级收口：顶部品牌、版本、当前房间、3D 主画面、右侧侧栏与交接入口按同一视觉节奏组织，不再像临时拼接的编辑器。
- Pascal 编辑区在窄视口下进入轻量浏览态，保留 2D 总览与上下文说明，并通过“进入完整 3D”显式恢复完整编辑器，避免移动端 / 低宽度首帧过重。
- 3D 观察时的墙面遮挡改为“软淡化”而不是直接消失；按钮文案从工程语气收口为“自动关墙”，更贴合用户语义。
- 右侧视角切换与房间摘要保持统一术语：当前房间、当前选择、当前视角、同一 scene 的上下文都集中在主工作台里，不再重复暴露宿主和编辑器两套术语。
- 交付文档已同步更新：`README.md`、`DEMO-SCRIPT.md`、`design-qa.md` 与本审阅包。

## 验证

- `cd app && npm test`：165 / 165 通过。
- `cd app && npm run test:backend`：77 / 77 通过。
- `cd app && npm run eval:agent`：28 / 28 通过，`passed: true`。
- `cd app && npm run build`：通过；仍保留 Three / Pascal / PDF 的 chunk warning，但不影响本地 V1 交付。
- 视觉对照使用了用户可见的真实浏览器截图与参考概念图：
  - 参考图：`/Users/dracoglasser/.codex/generated_images/019fe061-23e5-7491-a93b-fdfea4046d88/exec-b617e994-c333-4c2d-8f1b-bee31eda4aa4.png`
  - 当前浏览器状态：`/var/folders/dl/kf8l_tpn6s53_sqqkdhx28_00000gn/T/codex-clipboard-20e24546-6283-4485-bfba-199f24d2dfd2.png`
  - 当前墙面遮挡状态：`/var/folders/dl/kf8l_tpn6s53_sqqkdhx28_00000gn/T/codex-clipboard-dd3902d5-8769-42d5-bf5c-8395a47e8cea.png`
  - 过渡 / 淡化问题对照：`/var/folders/dl/kf8l_tpn6s53_sqqkdhx28_00000gn/T/codex-clipboard-2d18b799-f2ff-4397-bcf2-1d1ada4921ea.png`

## 已知边界

- 仍不是客户级写实效果图；这是同源、可编辑、可交接的 V1 实时渲染。
- Vite 依旧提示大 chunk；这是当前技术边界，留给后续拆包优化。
- 真实欧派 SKU / 报价 / BOM / 生产 API 仍保持 pending，不在本 Gate 冒充已接通。
