# Gate 14 Review：墙面、地面与顶面饰面

状态：已实现并完成自动化与后台住户黑盒复测，等待用户验收。

## 本 Gate 构建了什么

- 在 canonical scene 中为七个房间补齐可校验、可编辑的顶面 surface；墙、地、顶都继续使用同一个 `surface.setMaterial` 命令。
- Material 现在显式声明名称、来源和 `appliesTo`；命令与场景校验会拒绝墙材写到地面、顶材写到家具等非法组合。
- `/project/demo` 的空间侧栏按当前房间列出墙、地、顶；选中后只显示兼容饰面，并保留选中态、撤销、重做与未保存状态。
- 3D 直接读取同一 surface：顶面在室内视角显示，在整屋和俯视视角沿既有平滑曲线淡出，淡出后不拦截家具点选。
- 2D 投影继续读取同一 scene，并携带地面、顶面与墙面 materialId，不另建装修坐标或图片状态。
- 本地 Agent 可修改已选墙、地、顶；目标不明确时先澄清。合成目录增加两个可替换的 demo 顶面饰面，仍由既有 catalog provider 与 SceneCommand 应用。
- 版本对比、设计师复核和交接 JSON 增加 surface diff、确认表面及 material provenance。

## 本 Gate 没有构建什么

- 没有做墙体拆改、吊顶造型、灯槽、灯具、电气或施工计算。
- 没有新增固定柜、层板、隔断或背景墙对象；这些仍属于 Gate 15。
- 没有接入或宣称真实欧派 SKU、报价、BOM、工期或生产数据。
- 没有另建第二套 2D / 3D finish scene，也没有用独立效果图替代实时 3D。

## 验证证据

- `cd app && npm test`：150 / 150 通过。
- `cd app && npm run test:backend`：77 / 77 通过。
- `cd app && npm run eval:agent`：28 / 28 通过，0 failed。
- `cd app && npm run build`：通过；只保留既有的单 chunk 大于 500 kB 警告。
- `git diff --check`：通过。
- 独立后台住户按真实路径完成“进入客餐厅 → 墙面改暖灰 → 地面改瓷砖 → 顶面改暖灰 → 再点沙发 → 保存 V2”；版本抽屉准确显示 3 项表面差异，没有 P0 / P1，也没有业务 JavaScript exception。
- 后台证据位于临时目录 `/var/folders/dl/kf8l_tpn6s53_sqqkdhx28_00000gn/T/oppein-g14-targeted-9Gb62T/`；该目录是运行证据，不纳入源码提交。

## 跑偏复查

- 没有恢复六空间缩略图、静态热点、提案卡、客户 / 设计师模式开关或方块 3D。
- 2D 仍是同步只读总览，3D 仍是主浏览和编辑面。
- 手动与 Agent 修改仍只经过 SceneCommand；材质、表面、版本和导出没有分叉状态。
- 顶面仅表示饰面，不冒充结构吊顶；未接企业数据的项目继续标记 `demo / estimate / pending`。

## 已知边界

- 当前饰面是颜色与基础纹理级工程演示，尚不是客户级 PBR 材质或欧派真实商品资产。
- 浏览器开发环境仍会报告 favicon 404、Three.js 阴影 API 弃用和 SwiftShader `ReadPixels` 性能提示；没有业务异常，正式视觉收口时统一处理。
- 客餐厅两段东墙已区分为“厨房侧 / 玄关侧”，避免表面列表同名；更多真实建筑语义仍需量房数据与企业字段。
