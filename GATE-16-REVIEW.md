# Gate 16 审阅：固定装修组件与可替换 3D 资产槽

日期：2026-08-11  
分支：`codex/pascal-frontend`  
基线：`cfb6632`

## 已构建

- 同一 canonical scene 新增悬浮层板、格栅隔断和主卧背景墙；原固定柜统一补齐安装合同。
- 固定组件声明房间层级、墙 / 地宿主、碰撞代理、专业复核、来源和稳定 `model3D.slotId`。
- 生成 3 个本地 GLB 与对应正交俯视 PNG；Pascal 继续只做 canonical 投影，不产生第二套对象 ID。
- 合成目录将层板、隔断、背景墙、电视柜和衣柜关联到 canonical 模型槽；仍标记 `source: demo`、`sceneReady: false`，不冒充欧派真实目录或可下单资产。
- Agent 可用既有 `object.setMaterial` 修改固定组件材质；未来 AI / 企业模型只通过既有 `object.setModelAsset` 替换资产并强制复核。
- 版本影响报告可识别新增固定组件，固定组件仍禁止普通拖动。

## 已验证

- `npm test`：162 / 162 通过。
- `npm run test:backend`：77 / 77 通过。
- `npm run eval:agent`：通过，28 个离线案例、0 失败。
- `npm run build`：通过；Pascal / Three / PDF 仍有大 chunk 警告，交给 Gate 17 处理加载边界。
- Gate 16 专项覆盖：安装合同、宿主、碰撞、资产文件、Pascal ID 回映射、禁止移动、模型槽身份保持、非法安装校验、目录来源和 Agent 材质命令。

## 预留边界

- AI 生成 3D：写入本地或受控 provider 产物后调用 `object.setModelAsset`；对象 ID、宿主、碰撞、版本和共识引用不变。
- 欧派真实目录：现有 catalog provider / import adapter 可替换 demo catalog；真实 SKU、价格、BOM 和施工字段未接通。
- 碰撞与层级：继续由 canonical scene 校验，Pascal 或 Agent 均不能绕过。

## 未构建

- 未接 AI 3D 生成服务、欧派真实 SKU / 报价 / BOM / 生产接口。
- 未做 mesh 级物理、水电、拆墙和施工计算。
- 新增正交 PNG 是精确布局足迹，不是营销级商品缩略图。
