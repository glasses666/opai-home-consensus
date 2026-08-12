# Gate 28 审阅：风格检索与 CLI Harness

## 结果

- CLI 新增 `home research <需求>`，直接检索 Gate 27 的 80 张案例卡，不启动网页、3D 或外部向量库。
- Harness 只在风格、材料、空间方向意图下附加最多 3 张案例证据；每张保留 case ID、适用性、风险、unknown 和原页 URL。
- Aily Prompt 升级为 `oppein-harness-v2.2`：案例只能作 `reference_only` 方向证据，不能代替规范、报价、施工结论或现有目录材料。
- “先给方向 / 不要改”继续移除全部写工具；“把沙发改成北欧风”不会把风格词误当材质。只有点名现有材质时才开放对象材质工具。

## 评测

- `npm run eval:style`：12 / 12 通过；10 道风格题 Top-3 全命中且每题至少命中 2 个条件维度，2 道结构安全 / 精确报价边界全部 fail-closed。
- 相关回归：55 / 55 通过；全仓：198 / 198 通过；生产构建通过。
- 同输入检索结果稳定；“日式北欧”不会因包含“北欧”而误判，明确比较两种风格时仍保留两个方向。
- 真实 Aily 历史上只在临时房屋树完成过 1 次 provider 回合，返回 0 条命令并携带 Japandi 案例。2026-08-12 复测现有 3 条 live smoke 为 provider 0 / 3；另一次原始探测返回 `Completed` 但没有 text content。当前只能宣称安全降级有效，不能宣称 Aily 稳定可用或完成当前验收。

## 边界

- 当前是确定性词项 / 标签检索，适合 80 张种子案例；没有引入 embedding、向量数据库或训练流程。
- 评测集是独立人工问题，但规模小，只证明当前八个核心风格和两个安全边界，不证明泛化到全部住宅风格。
- 第三方页面和图片不进入产品资产；案例摘要不能证明欧派 SKU、价格、BOM、工期、施工或结构安全。
- CLI 提案仍需显式 `apply`；本 Gate 没有接网页，也没有修改 3D editor。
- 独立复查最初标记的 P2 是评测只检查风格名；现已把 facet 与 evidence boundary 纳入非零退出门槛，无遗留 P0 / P1 / P2。
- Live eval 现在强制 `source=provider` 才通过；local fallback 即使行为正确也必须计为失败。Trace 保留脱敏的 `AILY_RESPONSE_INVALID` / `AILY_TIMEOUT` 等错误码供诊断。
