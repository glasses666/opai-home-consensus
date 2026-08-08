# Gate 2 审阅包：真实 3D、资产管线与同源镜头

状态：**用户已验收，准备作为独立 Gate 2 基线提交**

日期：2026-08-08

Git 基线：`db57806`（Gate 1 已验收提交）；本 Gate 当前保持未提交

## 这一 Gate 构建了什么

- `/lab/scene` 在同一页面切换 2D 与实时 3D；没有加载静态效果图或第二份房屋状态。
- Three.js 直接读取 Gate 1 的房间 polygon、墙体、门窗 opening、对象 ID、毫米 transform、尺寸与材质引用。
- 真实墙洞、窗框 / 玻璃、木地板 / 暖灰砖 PBR、自然光、阴影、ACES Filmic 色调映射和受约束 OrbitControls。
- 九件原创 GLB：沙发、电视柜、餐桌、双人床、单人床、衣柜、书桌、橱柜和鞋柜。
- Blender 生成脚本 `app/scripts/build_demo_assets.py` 是资产来源；九个 GLB 总体积约 1.5 MB，没有下载品牌模型。
- 十六个 canonical camera preset：整屋、七个房间俯视、客餐厅入口 / 主功能面，以及沙发、餐桌、衣柜、书桌、厨房、玄关柜六个对象观察面。
- 点击整屋中的房间地面或房间墙面会先飞到该房间的三维俯视；客餐厅再提供入口、主功能面和自由视角。
- 镜头切换有明确的 `started` / `done` 状态；拖动或滚轮进入自由视角，不会把普通点击误判为自由相机。
- 大角度镜头不再分别直线插值位置与观察点；现在按最短球面圆弧飞行，朝向用四元数最短插值，并在完成时清除鼠标残留阻尼。
- “餐桌俯视 → 沙发入口”原先总旋转约 154.3°，旧 ease-out 初始角速度约 503°/s、前 100 ms 已旋转约 45°；现改为零速度起止缓动、按角度延长时长，并把客餐厅俯视 heading 对齐入口，减少无意义平面旋转。
- 墙体在整屋、俯视和对象视角都保持 canonical 2800 mm 真高，不再为了剖切效果缩到 46%；每一面墙拥有独立材质状态，摄像机进入该 surface 的 550 mm 邻近范围时只淡化该墙，离开后恢复实体，其他墙、家具和地板不受影响。
- 点击家具任一可见子网格都会选中对应 canonical object，而不是穿透到墙面；2D 与 3D 共用同一 selection ID。
- 右侧对象树按 `房间 → 家具` 组织；点击房间必定进入该房间俯视，点击家具则读取对象自己的 `preferredCameraPresetId`，不会把所有家具强制切成俯视。
- 家具推荐镜头不再复用房间中心目标点；带 `objectId` 的镜头会读取家具当前 3D 包围盒中心并平移相机，因此沙发、餐桌及后续被移动的家具都保持主体居中。
- 页面显示实时 FPS、draw calls、triangles 与 GLB 数量，便于继续控制浏览器上限。

## 如何审阅

1. 打开 `http://127.0.0.1:5173/lab/scene`，页面默认进入 3D 整屋。
2. 在整屋中点击任一房间地面或墙面，确认镜头先飞到该房间的 3D 俯视，而不是切换图片。
3. 返回整屋，进入开放客餐厅，依次切换 `俯视`、`入口`、`主功能面`、`自由`。
4. 点击电视、沙发或餐桌任一可见部位，确认右侧选中正确家具 ID。
5. 切换回 2D，确认 Gate 1 的 CAD / 家具 / 叠加三模式仍在，当前房间与对象选择保持一致。

## 验证证据

- `npm test`：23 项通过，0 项失败；新增反向大角度切换的“半径不塌缩 + 最短旋转”回归测试。
- `npm run build`：Vite 生产构建通过；当前单入口 JS 为 923.51 kB（gzip 247.81 kB），有大 chunk 提示但无构建错误。
- 1440 × 900 实际浏览器：约 120 FPS；整屋约 674 draw calls / 118,826 triangles，房间视角按可见内容下降。
- 浏览器实测通过：2D 回归、整屋到次卧 / 书房俯视、客餐厅入口、主功能面、家具子网格点选、镜头开始 / 完成状态。
- 最后一轮浏览器日志：0 warning，0 error。
- 截图证据位于 `.omx/audits/gate2/`；其中 `10-object-selection-fixed.png`、`12-room-click-flex-overhead.png`、`13-2d-regression.png`、`15-room-object-hierarchy.png`、`16-camera-shortest-arc.png`、`17-dining-to-sofa-quaternion.png` 分别证明对象点选、房间飞跃、Gate 1 回归、房间 / 家具层级、镜头落点和四元数方向；`25-inspector-right-1039.png` 证明对象树保持画布右栏，`26-sofa-subject-centered-927.png` 与 `27-dining-subject-centered-927.png` 证明对象镜头围绕真实主体落点，`31-surface-fade-150.png` 至 `36-full-height-wardrobe-end.png` 记录跨房间逐 surface 淡化，`37-surface-occlusion-full-height-home.png` 证明强制重建后整屋保持 2800 mm 墙高。

## 本 Gate 明确没有做

- 没有 `/project/demo` 正式消费者页面；仍是技术检验台。
- 没有家具拖拽、旋转、替换、材质编辑或规则求解；这些从 Gate 3 之后逐项出现。
- 没有 Agent、版本、家庭共创、飞书、报价或生产接口。
- 没有把 Shapespark 或 Blueprint3D 嵌入项目；只借鉴可复现视角状态和节点点击交互。
- 没有把当前九件原创演示模型宣称为欧派 SKU 或最终商业资产库。

## 需要用户在这一 Gate 判断的事

- 当前暖白、浅木、燕麦色的原创 3D 方向，是否已经摆脱旧方块 3D，并足以作为后续正式页面的视觉地基。
- 整屋 → 房间俯视 → 入口 / 主功能面 / 自由视角的连续关系是否正确。
- 如果模型细节或灯光仍显廉价，就停留在 Gate 2 更换资产 / 渲染方案；不进入 Gate 3 用 UI 遮盖。

## Git 状态

Gate 2 当前是基于 `db57806` 的未提交审阅 diff。用户明确验收后再创建本地 Lore commit；不建 remote，不 push。
