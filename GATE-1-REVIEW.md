# Gate 1 审阅包：Canonical Scene 与 2D 户型地基

状态：**已验收**

日期：2026-08-08

接受基线：`892759e`；用户已授权为本 Gate 创建本地 Lore commit

## 这一 Gate 构建了什么

- 一份 JSON-safe canonical scene：`x` 向东、`y` 向上、`z` 向南，几何尺寸统一使用整数毫米。
- 一套 11,000 × 8,000 mm 的七空间合成住宅：主卧、卫生间、次卧 / 书房、过厅、开放客餐厅、厨房和玄关。
- 28 个表面（7 个地面 + 21 段墙）、14 个 opening（入户门、室内门、共享门洞和外窗）与 9 件代表家具。
- 将房间、表面、门窗、家具、材质、规则和相机预设统一纳入全局 ID 校验。
- 唯一变更入口 `dispatchSceneCommand`；当前只接受家具 transform、家具材质和表面材质三类命令。
- 加载后的 scene 和 store 深度冻结，防止 UI 或未来 Agent 绕过命令直接改状态。
- `/lab/scene` 技术页：只读 CAD / 家具媒体双图层、房间 / 家具点选、语义列表、实体数据、校验状态和确定性 JSON。
- CAD 图层包含 180 mm 外墙、120 mm 内墙、窗线、门扇开启弧、横纵分段尺寸链、房间面积、家具真实足迹和对象尺寸。
- 家具媒体层使用九张原创透明 PNG；每张图的锚点、宽深与旋转直接来自对应 `SceneObject`。
- 画布右侧轻量图标工具条切换 `CAD`、`家具俯视`、`叠加` 三个最终模式；选中态、悬停标签与键盘焦点均可辨识。
- 五组主通道、厨房操作、床侧和柜前净距进入 canonical scene 并通过规则引用校验。
- 家具与叠加模式按 canonical floor material 显示浅橡木或暖灰砖纹理；纯 CAD 模式保持干净图纸。

## 家具媒体资产

- `app/public/assets/furniture/shoe-cabinet-top.png`
- `app/public/assets/furniture/sofa-top.png`
- `app/public/assets/furniture/dining-table-top.png`
- `app/public/assets/furniture/double-bed-top.png`
- `app/public/assets/furniture/single-bed-top.png`
- `app/public/assets/furniture/wardrobe-v2-top.png`
- `app/public/assets/furniture/desk-top.png`
- `app/public/assets/furniture/kitchen-counter-v2-top.png`
- `app/public/assets/furniture/tv-console-top.png`
- `app/public/assets/materials/floor-oak-light.webp`
- `app/public/assets/materials/floor-tile-warm.webp`

九张家具素材均由内置 ImageGen 生成严格正交俯视图，再用 chroma-key helper 去除绿色背景并保留透明通道。两张地板素材同样由内置 ImageGen 生成可平铺、正交、低对比的材质纹理，并压缩为 WebP。视觉统一约束为欧美当代北欧目录质感、暖白 / 浅木 / 燕麦色、无文字、无品牌、无透视侧面。柜体类首轮因露出正立面被退回，最终使用修正后的正交顶视版本。

## 如何审阅

1. 打开 `http://127.0.0.1:5173/lab/scene`。
2. 页面默认显示叠加模式；用画布右侧三个图标依次切换 CAD、家具俯视与叠加。
3. 分别点击七个房间和九件家具，确认右侧 ID、房间归属、尺寸和 transform 与图上选中项一致。
4. 核对外 / 内墙厚度、入户门与室内门开启弧、外窗、横纵分段尺寸链、房间面积和家具建筑关系；再确认家具图与 CAD 足迹同位。
5. 确认下方为 `VALID SCENE`，round trip 为 `byte-identical`。

## 自动化证据

- `npm test`：18 项通过，0 项失败。
- `npm run build`：Vite 生产构建通过。
- HTTP：`GET /lab/scene` 返回当前 Vite 应用，`/src/App.jsx` 可成功转换。
- 覆盖：确定性序列化、重复 ID、悬空引用、室内 / 外门门扇、opening 越界、schema 版本、墙体 / 地面几何、净距区域、深冻结、命令回退、固定家具拒绝移动、双图层结构、媒体元数据，以及命令后 CAD / media 同步更新。

Codex 内嵌浏览器已核对 CAD、家具和叠加三个模式：CAD 模式不显示地板纹理，后两者均显示七个房间的 canonical floor material；浏览器控制台无 warning / error。用户在实际页面中完成最终视觉验收。

## 本 Gate 明确没有做

- 没有真实 3D、镜头、房间飞入或家具拖拽；这些从 Gate 2 / Gate 3 开始。
- 没有 Agent、飞书、家庭成员、版本、报价或设计师页。
- 没有商业化产品页 polish；这里只把 CAD 与家具俯视表达做成可审阅的地基检验台。
- 没有提前引入 Three.js、状态框架、schema 库或 UI 框架。

## 已知边界与 Gate 2 前置

- 户型是为验证数据关系创建的合成样例，还不是真实量房导入。
- 目前校验家具足迹与净距区域完整位于所属房间内；家具间碰撞、门扇动态碰撞和完整人体工学求解仍在后续 Gate 逐项加入。
- Shapespark Viewer API 与 Blueprint3D Modern 仅作为 Gate 2 / Gate 3 的镜头和编辑交互参考，本 Gate 未接入二者。
- 当前的 polygon 包含检查针对本 Gate 的直角合成户型；开始导入凹多边形真实户型前，必须增加边交叉检查。
- Gate 2 开始前要单独确认 3D 引擎、glTF / GLB 资产来源、PBR 材质和视觉上限；不从旧 V1 复用方块 3D。

## Git 状态

用户已于 2026-08-08 验收本 Gate 并授权本地 commit。提交后进入 Gate 2；不建 remote，不 push。
