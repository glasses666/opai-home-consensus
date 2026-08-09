# Gate 10A Review：主卧完整闭环

状态：已实现、已验证，等待用户验收；住户代理发现一条整屋→主卧→衣柜路径的 P0 / P1，Gate 10A 还不能当作“全员确认”。

## 本 Gate 构建了什么

- `/project/demo` 的主卧现在是和开放客餐厅同源的真实 3D 空间，不是单独的预览页，也不是第二套 scene。
- 主卧任务明确收敛为“睡眠与收纳互不让步”；房间摘要直接展示床侧净距、柜前净距和门扇开启三条约束。
- 床和衣柜都保留在 canonical scene 里：床允许移动；衣柜支持尺寸编辑和材质切换，且不会把“收纳”伪装成别的对象。
- 主卧房间卡增加了“床 / 衣柜”快捷入口，住户不必只靠 3D 视角猜测可编辑对象。
- 版本影响抽屉现在能直接展示可计算的净距变化和柜体收纳估算，字段保持 `demo` / `estimate` 边界。
- 房间级规则检查现在可按主卧过滤，不再把玄关鞋柜的门扇问题泄漏进主卧。
- Agent 快捷提示改成了主卧语境，避免继续给主卧塞客餐厅沙发的默认文案。
- 3D 提示文案明确“点家具可选择编辑”，和房间快捷入口一起承担对象发现。
- 旧缓存键已升级到 `v2`，避免主卧基线更新后加载到旧的演示状态。

## 真实住户路径

- 浅眠 / 夜间频繁起床的住户路径：
  - 从整屋进入主卧俯视；
  - 选中床，向左移动 100 mm；
  - 看到床侧净距 warning；
  - 回到主卧整体查看后继续检查规则；
  - 进行一次刷新验证，版本和对象状态保持一致。
- 收纳优先住户路径：
  - 从整屋进入主卧；
  - 选中衣柜；
  - 将衣柜宽度调到 2200 mm，并改成暖白材质；
  - 查看版本影响与收纳估算；
  - 保存并客户确认 V2；
  - 刷新后仍能回到同一确认版本。
- 另一个更严格的真实住户代理在“整屋 3D → 主卧 → 衣柜”路径上没有稳定完成衣柜编辑，给出 P0 / P1 反馈；这部分已保留在独立住户测试报告里，不混写成通过结论。
- 两条路径都使用了真实鼠标 / 键盘事件，不是直接改 DOM。

## 验证证据

- `cd app && npm test`：115/115 通过。
- `cd app && npm run build`：通过；仅保留既有大 chunk 警告。
- `cd app && npm run eval:agent`：27/27 通过。
- `git diff --check`：通过。
- 真实浏览器流：
  - `.omx/audits/gate10a/run-flow.mjs`
  - `.omx/audits/gate10a/flow-result.json`
  - `.omx/audits/gate10a/01-home.png`
  - `.omx/audits/gate10a/02-bedroom-overhead.png`
  - `.omx/audits/gate10a/05-bedside-warning.png`
  - `.omx/audits/gate10a/07-v3-storage-impact.png`
  - `.omx/audits/gate10a/09-reload-persisted.png`
  - `.omx/audits/gate10a/10-after-orbit-zoom.png`
- 录屏与抽帧：
  - `.omx/audits/gate10a/orbit-zoom.mp4`
  - `.omx/audits/gate10a/orbit-zoom-contact-sheet.png`
  - `.omx/audits/gate10a/orbit-zoom-30-frame-sheet.png`
- 收纳优先住户代理：
  - `.omx/audits/gate10a/persona-storage/00-home-whole-3d.png`
  - `.omx/audits/gate10a/persona-storage/02-wardrobe-selected.png`
  - `.omx/audits/gate10a/persona-storage/06-version-impact-saved-v2.png`
  - `.omx/audits/gate10a/persona-storage/07-confirmed-v2.png`
  - `.omx/audits/gate10a/persona-storage/08-after-refresh.png`
  - `audit-events.json` 显示其完成了 13 个状态点、9 张截图和 2090 帧录制。
- 代码审查代理结论：`SUBMIT`，无 P0/P1。
- 真实住户代理结论：另一路整屋→主卧→衣柜路径仍有 P0 / P1，当前不算完全验收。

## 已知边界

- 真实欧派 SKU、报价、BOM、施工和企业 API 仍未接通；所有价格 / 工期 / 收纳量估算都必须继续保留 `demo` / `estimate` 标识。
- Gate 10B 还没开始；`app/src/agent/harness.js` 里“床”仍是全局 noun 映射，进入儿童房 / 书房前需要改成更房间感知的解析。
- 住户代理的负反馈已经转成截图和事件流证据；它没有额外生成独立 markdown 报告，当前审阅包以截图、事件流和回放视频为准。
