# Gate 25：无渲染房屋 CLI 与 Agent Harness 审阅

状态：**已实现并验证，等待用户验收后提交。**

基线：`codex/pascal-frontend` / `a638630`

## 本 Gate 得到什么

- `app/scripts/home-cli.mjs`：只加载 Node、canonical scene、现有 Harness 与可选 Aily provider；不加载 React、Three.js、Pascal 或浏览器。
- `app/src/cli/house-tree.js`：把同一 scene 拆成 JSON 文件树并重新装配，使用不可变版本目录、SHA-256、原子 current manifest、pending proposal 和显式 apply。
- `app/tests/house-cli.test.mjs`：锁定 scene round-trip、全部坐标域、手动编辑能力、提案不写 current、原子 apply、旧版本保留与真实 CLI 进程。

## 命令

```bash
cd app
npm run home -- init
npm run home -- tree
npm run home -- tree --room room-living-dining
npm run home -- show object-sofa
npm run home -- validate
npm run home -- edit object-sofa move --dx 100
npm run home -- edit object-sofa rotate --deg 15 --apply
npm run home -- agent '把沙发向右移动20厘米'
npm run home -- apply latest
npm run home -- diff v0001 v0002
npm run home -- agent '把沙发向右移动20厘米' --aily
```

默认文件树位于被 Git 忽略的 `app/.data/house-cli/`；可用 `--root` 或 `OPPEIN_HOME_TREE` 指定其他目录。

## 数据边界

- 全局 `X/Y/Z` 毫米坐标是唯一存储真相。
- 房间相对坐标与墙面 `U/V` 定义域由 CLI 从 room polygon / wall edge 计算，不另存第二套坐标。
- `home.json` 只保存 scene 元数据与叶节点顺序索引；房间、全部墙地顶、门窗、对象、材质、规则、镜头和保护区分别保存为 JSON 叶节点。
- Agent 回合保存 `proposal`、tool calls、trace 与 DesignBrief。只有 `apply` 才重放现有 `SceneCommand` 并更新 current version；过期、无命令、已应用或规则失败的提案拒绝写入。

## 验证证据

- `node --test tests/house-cli.test.mjs tests/agent-harness.test.mjs`：15 / 15。
- `npm test`：183 / 183。
- `npm run test:backend`：81 / 81。
- `npm run eval:agent`：28 / 28。
- `npm run build`：通过；只保留既有大 chunk 警告，CLI 不引用这些 chunk。
- 真实 Aily CLI 回合（2026-08-12）：输入“把沙发向右移动20厘米”，provider 返回 `move_object { objectId: object-sofa, dx: 200 }`，Harness 生成合法 `object.setTransform`；提案为 pending，随后 `validate` 仍显示 `v0001 / versions: 1 / 原 scene SHA-256`，没有隐式写入，也没有触发 Base。
- 手工应用后只出现 `object-sofa` 的 transform diff，旧 `v0001` 可继续读取；装配出口 canonicalize 修复了 JSON 键序造成的假 Diff。

## 尚未做

- 没有迁移共享墙为独立建筑实体；当前文件树无损表达现有 V1 的 room-facing wall surfaces，结构拓扑升级需单独 Gate。
- 没有实现新增家具 / 风格包 / 结构装修工具；当前 CLI 暴露的是现有 Harness 能力，下一步应专门增强 Aily 的结构化提案合同与评测。
- 没有接 ImageGen 实景预览；毛坯底图和 preview manifest 在 CLI 验收后再做。
- 没有真实欧派 SKU、报价、BOM 或施工数据。
