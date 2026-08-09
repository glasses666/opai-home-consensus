# Gate 4 审阅：开放客餐厅真实 3D 垂直切片

日期：2026-08-10  
页面：`/project/demo`

## 已完成

- 开放客餐厅的沙发、电视柜组合与餐桌组合均为 canonical `SceneObject`；2D、3D、名称、尺寸、来源和选择状态读取同一对象。
- 对象面板显示 demo 外部 ID、毫米尺寸、移动能力和运行实测，不把合成资产冒充欧派真实 SKU。
- GLB 加载显示真实完成数；单件资源失败时保留等尺寸、可选择的线框占位，不让整屋白屏。
- 同一路径复用已存在的 GLB Promise cache；没有引入第二套资产状态或新依赖。

## 实测

| 指标 | 结果 | 方法 |
| --- | ---: | --- |
| GLB | 9 / 9 | 浏览器 Performance Resource Timing |
| GLB 传输 | 1,568,168 bytes | 全新 headless Chrome profile |
| 最后一件 GLB 完成 | 398 ms | 本机 `127.0.0.1`，仅用于回归基线 |
| DOM interactive | 117 ms | 同上 |
| 稳定 FPS | 120 | 1440×900 WebGL 运行读数 |
| Draw calls | 340 | 沙发对象镜头 |
| Triangles | 68,046 | 沙发对象镜头 |

以上性能数字是本机本地服务实测，不代表公网、低端设备或生产 CDN。

## 证据

- [沙发对象与运行实测](./.omx/audits/gate4/01-living-sofa-details-1440.png)
- [餐桌对象命中](./.omx/audits/gate4/02-dining-selected.png)
- [电视柜对象命中](./.omx/audits/gate4/03-console-selected.png)

## 边界

- 餐桌 GLB 当前按一组餐桌椅作为一个可选择组合，不把组合内部每把椅子伪装成独立可编辑对象。
- 本 Gate 仍为只读浏览；移动、旋转、撤销和属性工具从 Gate 5 开放。
