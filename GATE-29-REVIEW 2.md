# Gate 29 验收：三模式 Agent 合同与比赛黄金路径

## 结论

Gate 29 已完成。Aily 负责在既定模式内理解、解释并选择工具；Harness 预先固定 `clarify / propose / execute`，只向该模式暴露合法工具；canonical scene 的实际写入、碰撞与房间边界仍由本地 `SceneCommand` 和规则引擎决定。

## 已实现

- Prompt 升级为 `oppein-harness-v2.3`，要求显式模式、短回复、最多两条依据、最多一个未决项和结构化工具调用。
- `clarify` 与 `propose` 回合在调用 Aily 前物理移除全部写工具；`execute` 只接受当前意图 allowlist 内的写工具。
- Aily 模式声明与 Harness 不同时保留 `PROVIDER_MODE_CORRECTED` 诊断，不允许它改变本地模式。
- Aily 已给出唯一问题但漏掉工具时，只补齐只读 `request_clarification`，记录 `PROVIDER_CLARIFICATION_REPAIRED`；不补造写操作。
- 澄清问题统一为一个问句；结构化选项对象安全缩减为住户可读 label。
- 固定评测扩充为 30 例；真实 Aily 黄金路径覆盖需求澄清、双方向、家具移动、墙面应用、越界阻止和未就绪层板澄清。

## 验证证据

- `npm test`：214 / 214 通过。
- `npm run build`：通过；仅保留 Vite 对 Pascal 依赖的浏览器兼容提示，没有新增构建错误。
- `npm run eval:agent`：30 / 30 通过；五组分别覆盖 grounded reply、hard constraints、provider fallback、tool selection、unauthorized mutation。
- `npm run eval:agent:live:golden`：6 / 6 真实 provider 通过，全部 `source=provider`、无 fallback：
  - 未指定房间：进入 `clarify`，只追问优先空间；
  - 潮湿小户型浅木多收纳：进入 `propose`，不产生 SceneCommand；
  - 沙发右移 20 cm：进入 `execute`，真实落为 `move_object(dx=200)`；
  - 客餐厅南墙浅橡木木饰面：真实应用 `demo-wall-panel-light-oak`；
  - 沙发左移 10000 mm：本地规则以 `OBJECT_FOOTPRINT_OUTSIDE_ROOM` 原子回滚；
  - 未就绪悬浮层板：停在 `clarify`，场景不写入。
- 实际 Aily 延迟约 22–44 秒/轮；这是当前接口性能证据，不宣称生产 SLA。

## 边界

- 没有真实欧派 SKU、报价、BOM、施工与生产数据；当前目录仍是 `demo / estimate`。
- Aily 不直接写 scene、确认版本或接生产系统；只读纠偏是唯一自动修复。
- 本 Gate 未修改网页、3D 编辑器、Base 表结构或风格语料。
