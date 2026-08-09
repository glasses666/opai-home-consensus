# 夜间后端包 N2 审阅：合成组件目录与 Prompt 安全边界

日期：2026-08-09
状态：已实现、已验证，并随本后端基线封存
页面影响：无；Gate 3 未开始

## 这次构建了什么

1. **可替换的合成组件目录**
   - 15 项、10 类：墙面、地面、层板 / 架体、隔断、柜体、家具、门、台面、吊顶、五金。
   - 所有目录项为 `source: demo`；价格和工期为 `source: estimate`。
   - BFF 提供 `GET /api/catalog/components` 与 `GET /api/catalog/components/:id`。

2. **真实写入与只读建议分界**
   - 墙面 / 地面饰面使用既有 `surface.setMaterial` 写入同一 canonical scene。
   - 层板、架体、隔断、柜体、门、台面、吊顶和五金目前缺少安装几何及企业规则，统一为 `sceneReady: false`；Agent 只能检索、解释或追问。

3. **Aily Prompt v2.1**
   - 模型只接收当前表达相关的 scene、catalog 和 tools，不再阅读完整户型 JSON。
   - 木饰面测试请求从约 5.3 KB 压缩到约 2.7 KB，并在真实 Aily 中成功返回正确目录项和表面 ID。
   - Prompt 明确区分建筑组件与家具，禁止虚构 SKU、价格、工期、尺寸、安装方法和施工规则。

4. **Harness 安全边界**
   - 模型仍不能直接写 scene；全部修改经 Tool Registry、本地参数校验和 SceneCommand。
   - Provider 只能调用本轮 Prompt 明确暴露的工具；越权调用会被拒绝并安全降级。
   - “先看看 / 给方向 / 不要直接改 / 别改”等只读意图会统一移除所有写工具，本地与 Aily 路径都不能修改场景。
   - 无依据数字、常见虚构施工做法、超长或多问题回复会被拒绝。
   - Aily 超时、格式或 provider 波动时使用本地 planner；失败不会留下部分写入。
   - 可选数组的 `null` 会在边界规范化为空数组，兼容真实 Aily 输出。

## 真实 Aily 结果

- 木饰面：真实 provider 选择 `demo-wall-panel-light-oak` 和 `surface-wall-living-south`，写入成功。
- 层板方向：真实 provider 能识别 `sceneReady=false` 并澄清；一次后续请求出现 provider 波动时，本地安全降级仍只检索和追问。
- 沙发移动：真实 provider 将 20 cm 规范化为 `dx: 200`，本地规则执行成功。

这证明了真实 Aily 可用，但不证明其延迟和输出每次都稳定；商业演示仍必须保留本地降级。

## 验证

```text
npm test                 59 passed, 0 failed
npm run build            passed
npm run eval:agent:live  三条行为通过；记录 providerAccepted 与 fallbackReason
```

Vite 仍提示现有主包约 925 kB；本包没有新增前端依赖或页面代码，代码分包留到进入正式产品页面时处理。

## 明确没有做

- 没有接入欧派真实 SKU、报价、BOM、工期、施工或生产 API。
- 没有为层板、隔断、门或柜体生成新 3D 安装几何。
- 没有修改 Gate 2 技术页面，也没有开始 Gate 3。
- 没有发送 Coach 或群聊消息。

## Coach 请求状态

完整复核既有产品对话和开题材料后，原先只询问组件字段的短稿已扩展为一份可直接转交企业内部的接入请求包：

- 一段适合飞书发送的短消息；
- 一套脱敏端到端样例清单；
- 量房、产品、资产、规则、报价 / BOM、设计系统和案例资料字段；
- 测试权限矩阵、无 API 时的文件替代方案和统一回执表。

完整请求记录见 [COACH-ENTERPRISE-DATA-REQUEST-DRAFT.md](./COACH-ENTERPRISE-DATA-REQUEST-DRAFT.md)。用户已于 2026-08-09 12:45 私聊罗梓威发送三段核心请求；飞书回读已确认。详细字段清单没有作为附件或后续消息送达，Codex 不会自行补发或改发群聊。

## 下一步

1. 等待 Coach 回复；若对方需要字段级清单，再由用户确认是否补发第 3—7 节，不自动追问。
2. 等待 Coach / 企业数据时，用 provider adapter 替换合成目录，不改 Agent 工具合同。
3. Gate 3 仍按原顺序单独开始，不把本包的后端能力提前做成产品 UI。
