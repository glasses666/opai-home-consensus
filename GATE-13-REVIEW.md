# Gate 13 Review：空间层级、安装锚点、碰撞代理与可替换 3D 资产合同

状态：已实现；拖拽持续命中与复合资产回归问题已修复，等待用户验收。

## 本 Gate 构建了什么

- 在 canonical scene 的 `SceneObject` 上补齐了稳定层级合同：`hierarchy.parentId` 始终指向真实房间，`hierarchy.layer` 区分 `furniture`、`fixed_installation`、`equipment` 与 `service`。
- 给每个对象补齐了 `placement`：固定安装件必须挂到同房间的 `hostSurfaceId`，安装位置用毫米偏移表达，不再只靠视觉摆位。
- 给每个对象补齐了独立的 `collision` 代理：规则、净距和房间边界检查不再直接依赖可替换渲染模型的可见外形。
- 给每个对象补齐了可追溯的 `model3D` 槽位：`slotId`、`revision`、轴向、毫米单位、渲染边界与 provenance 都在同一合同里，未来 AI / 企业 GLB 只替换槽，不重建对象身份。
- 给每个对象补齐了 `review` 标记：是否需要专业复核、当前状态和原因都显式存在，方便后续墙面 / 固定系统 / 水电继续挂接。
- 新增 `object.setModelAsset` 命令，让可替换对象可以更换模型而不改变对象 ID、房间归属、安装位置、碰撞代理或版本历史。
- 3D 视图在模型源或 revision 变化时会真正卸载并重载对象，避免缓存沿用旧模型。
- 2D 投影、规则引擎、版本对比和交接导出继续读取同一份 canonical scene，层级、宿主和碰撞信息都随同一对象一起传播。
- Inspector 现在直接按层级展示房间对象，并在选中对象时显示层级、宿主、碰撞、模型槽和复核字段，用户不用只靠 JSON 才看得到这套地基。

## 本 Gate 没有构建什么

- 没有接入真实 AI 生成服务，没有在线生成新 GLB。
- 没有把 mesh 级物理、墙体拆改、水电布点、固定系统施工计算提前塞进本 Gate。
- 没有改成第二套 asset scene；所有变化仍挂在同一 canonical scene 上。
- 没有做最终视觉 polish，信息层级只补到能支撑后续功能 Gate 的程度。

## 验证证据

- `cd app && node --test tests/gate13-scene-contract.test.mjs tests/handoff.test.mjs`：10 / 10 通过。
- `cd app && npm test`：140 / 140 通过。
- `cd app && npm run test:backend`：76 / 76 通过。
- `cd app && npm run eval:agent`：28 / 28 通过，0 failed。
- `cd app && npm run build`：通过；只保留既有的单 chunk 大于 500 kB 警告。
- `git diff --check`：通过。
- 后台 SwiftShader WebGL 以 1440 × 900 打开真实 `/project/demo`，3D、对象选中与新增合同信息正常显示；证据为 `.omx/audits/gate13/project-demo-selected-webgl.png`。
- 独立代码审查提出的三个问题已关闭：未人工审核资产强制进入专业复核、模型路径拒绝目录穿越、热替换使用实例独立 geometry 并释放旧资源。

## 跑偏复查

- 没有新增六空间缩略图栏、静态热点或提案卡。
- 没有把固定安装件伪装成可自由移动家具。
- 没有让碰撞规则直接吃渲染模型 bounds；规则继续使用独立碰撞代理。
- 没有让模型替换改变对象 ID、roomId、placement 或命令回放结果。
- 没有接受远程 URL、查询串或 `/assets/models/../` 形式的模型路径。

## 已知边界

- 目前仍是本地 demo 资产与 demo / estimate 数据，未宣称接通欧派真实 SKU、报价、BOM 或生产接口。
- 当前碰撞是可解释、可复算的 box proxy，不是 mesh 级物理；异形模型到来后由专业 / 企业数据校准 proxy，而不是让浏览器网格直接决定施工合法性。
- 后续 Gate 14 起会继续在这套 `surface` / `placement` / `collision` / `model3D` 合同上接墙面、饰面和固定系统，不要回头把层级逻辑散进 UI 里。

## 验收前回归修复（2026-08-11）

- 沙发 GLB 原先还包含地毯和茶几，餐桌 GLB 原先还包含四把餐椅；但 canonical scene 只有沙发和餐桌的对象、尺寸与碰撞代理。这会让可见模型穿过规则边界，并把选中框和拖拽枢轴拉到附属道具中心。
- 两个 GLB 已重建为单一 canonical 家具资产；地毯、茶几和餐椅不再暗中绑定。它们后续若回到场景，必须各自拥有 SceneObject、2D 资产、3D 模型和碰撞合同。
- 每秒的 3D 统计刷新原先会重新设置同一 selection，连带 `detach/attach` TransformControls；现已把选中 effect 改为只响应语义 ID 变化，并让控件挂接对同一目标幂等。
- 新增回归检查：沙发不得再包含 `rug/coffee`、餐桌不得再包含 `chair`；同一拖拽目标在无关重渲染后不得重新挂接。
- 后台浏览器证据：沙发选中框仅覆盖沙发本体；鼠标在移动手柄上静置 3.3 秒后，手柄高亮区域像素完全一致，随后仍能直接接收交互，无需移出再移回。
- 验证：`npm test` 142 / 142，`npm run eval:agent` 28 / 28，`npm run build` 通过（仅保留既有大 chunk 警告）。
