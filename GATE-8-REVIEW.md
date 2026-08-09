# Gate 8 Review：真实 Agent 工具调用与 Designer Skill

状态：已实现、已验证，等待用户验收。

## 本 Gate 构建了什么

- 右侧工作区在“空间 / Agent”之间切换；Agent 是与实时 3D 并排的轻量 sidecar，不覆盖画布，也没有另建聊天页面。
- 自然语言先被裁剪为本轮 allowlist，再调用读取房间 / 对象、目录检索、移动、旋转、删除、对象 / 表面材质、规则检查、版本比较和确认请求工具。
- 所有写工具继续走 `dispatchSceneCommand()`；确定性规则负责最终裁决，多工具中任一步失败会回滚整轮。
- Agent 的一次成功写入会保存为一个真实 `SceneVersion`；有 warning / recommendation 时先形成预览，由住户保留后才进入版本链。
- `request_confirmation` 只显示“查看版本并由我确认”，不会代替住户确认。
- capability gate 读取 BFF health；当前实测为 Aily `missing_scope`、Base `ready`，界面明确显示“本地降级”，没有伪装 Live Aily。

## 真实住户链路

- Agent：`沙发向右移动20厘米` → 沙发 x 从 2200 mm 到 2400 mm → V2。
- 住户随后用手动工具再向右移动 100 mm；Agent：`沙发改成橡木色` → V3 同时保留手动后的 x=2500 mm，证明 Agent 看到了最新工作场景。
- Agent：`餐桌旋转90度` → V4，实际 rotationY 变为 π。
- Agent：`把开放客餐厅南墙改成浅橡木木饰面` → V5，实际表面材质变为 `mat-wall-oak-panel`。
- Agent：`删除沙发` → V6，沙发从 canonical scene 删除，选择安全回到房间。
- 只读层板咨询只检索目录并追问一个主要问题，版本数保持 6。
- 固定电视柜移动被规则原子拒绝，版本数保持 6；版本对比返回真实 1 项对象变化；确认请求没有改变 `confirmedVersionId`。

## 验证证据

- 自动化：`npm test`，105 passed / 0 failed。
- Agent 固定评测：`npm run eval:agent`，27 / 27 通过。
- 构建：`npm run build` 通过；仅保留既有大 chunk 警告。
- 后台 Chrome 全程按坐标点击、输入和发送，不抢占用户前台；控制台无未处理异常。
- 截图：
  - `.omx/audits/gate8/01-space-mode.png`
  - `.omx/audits/gate8/02-agent-open.png`
  - `.omx/audits/gate8/03-agent-move-v2.png`
  - `.omx/audits/gate8/04-space-after-agent.png`
  - `.omx/audits/gate8/05-agent-five-tasks.png`
  - `.omx/audits/gate8/06-agent-readonly-reject-confirm.png`

## 已知边界

- 当前页面 turn 使用本地确定性 provider；Aily 此刻为 `missing_scope`，不能宣称本 Gate 已重新完成 Live Aily 页面调用。此前 N1 / N2 的真实 Aily 证据仍只证明后端能力。
- Base `ready` 只显示 capability；消费者本地版本与 Base 的统一持久化属于 Gate 11，当前 Agent 版本仍使用同一个本地版本链。
- 合成目录中缺少安装几何的层板 / 架体仍保持 `sceneReady: false`，Agent 只能检索和澄清，不能假装已经安装。
