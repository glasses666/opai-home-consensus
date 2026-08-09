# Gate 10A Review：主卧完整闭环

状态：已实现、已验证，等待用户验收；首轮住户代理暴露的主卧 / 衣柜可发现性问题已修复并通过后台真实指针复测，但不冒充真人验收。

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
- 首轮独立住户代理在“整屋 3D → 主卧 → 衣柜”路径上多次使用了错误坐标，未稳定完成衣柜编辑；这不是可复现的场景故障，但暴露了真实的入口 / 家具可发现性问题。
- 修复后，主任务使用房间标签、主卧卡片中的“衣柜”直达入口和真实鼠标 / 键盘事件完成了衣柜编辑、影响查看、确认、刷新回放；独立代理的补测运行器超时，未把主任务证据冒充成第二个住户结论。
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
- 首轮独立住户尝试：
  - `.omx/audits/gate10a/persona-storage/00-home-whole-3d.png`
  - `.omx/audits/gate10a/persona-storage/01-main-bedroom-entered.png`
  - `.omx/audits/gate10a/persona-storage/failed-current-state.png`
  - `audit-events.json` 保留 2090 帧录制及逐次输入；其中所谓 `wardrobe-selected` 的实际选择是沙发，后续带成功语义的文件名不能作为成功证据。
- 代码审查代理结论：`SUBMIT`，无 P0/P1。
- 修复后真实浏览器结果：`V3`、衣柜宽度 `2200`、收纳影响可见、主卧规则无跨房间泄漏、控制台无异常；未再复现阻塞级问题。
- 独立补测代理未在时限内完成，已终止；因此状态仍是“等待用户验收”，不是“全员确认”。

## 已知边界

- 真实欧派 SKU、报价、BOM、施工和企业 API 仍未接通；所有价格 / 工期 / 收纳量估算都必须继续保留 `demo` / `estimate` 标识。
- Gate 10B 还没开始；`app/src/agent/harness.js` 里“床”仍是全局 noun 映射，进入儿童房 / 书房前需要改成更房间感知的解析。
- 首轮住户代理的误点与困惑已保留为截图和事件流，作为可发现性改进的来源；不能把坐标误点本身当成仍存在的产品 P0。
- 次级信息文字和低视口下较长的衣柜属性区仍是 P2；截图与指针回放也不能替代完整的键盘 / 读屏辅助技术审计。
