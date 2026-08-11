# Gate 17 审阅：性能、资源生命周期与移动设备降级

日期：2026-08-11  
分支：`codex/pascal-frontend`  
基线：`67f587b`

## 已构建

- `/project/demo` 继续懒加载 Pascal；内部 `/lab/scene` 的自研 Three.js 校验器也改为独立懒加载，不再进入主壳首包。
- 新增纯 `resolveRenderProfile` 合同：桌面 `full`、小屏 / 粗指针 / 低内存 `light`、隐藏页 `paused`。
- 移动轻量模式默认 Pascal 2D，仍保留用户手动进入 3D 的按钮；不冒充完整桌面编辑体验。
- 页面隐藏时 Pascal Editor 直接卸载，恢复后从 canonical scene、选择和版本状态重新加载；内部 Three.js RAF 同样在隐藏时取消、恢复时重新排队。
- 所有 resize、pointer media query、visibility listener 都有对称清理；未新增依赖或第二套渲染调度器。

## 构建边界

- 生产构建已形成独立 `PascalStage` 与 `Scene3D` chunk；复核 / 交接页面不会因静态 import 提前加载内部 Three.js 校验器。
- 上游 Pascal 仍会产生 BVH 参数弃用、Three 多实例及 WebGPU 灯光兼容 warning；本 Gate 未 fork 上游依赖。浏览器无 error 级控制台日志。
- 隐藏状态的卸载逻辑由纯合同测试与组件代码覆盖；当前 in-app 浏览器不支持强制切换 `document.visibilityState`，未伪造一次浏览器级隐藏证据。

## 验证

- `npm test`：166 / 166 通过。
- `npm run test:backend`：77 / 77 通过。
- `npm run eval:agent`：28 / 28 通过。
- `npm run build`：通过；`Scene3D` 82.20 kB、`PascalStage` 243.35 kB，均为独立入口 chunk。
- 浏览器 1440×900：`full`，无横向溢出。
- 浏览器 1024×768：`full`，无横向溢出。
- 浏览器 390×844：`light`、显示“轻量模式 · 默认 2D”，无横向溢出。
- 当前截图：`.omx/audits/gate17/viewport-1440x900.png`、`viewport-1024x768.png`、`viewport-390x844.png`。

## 仍需真机验证

- iOS / Android 的首帧、稳态 CPU / GPU、内存峰值、持续温升和电池影响。
- Pascal 上游 warning 的消除应等待依赖升级或正式 fork 决策，不能在 V1 内靠屏蔽日志冒充解决。
