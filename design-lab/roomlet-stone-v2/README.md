# 石间 · ROOMLET 02

基于上一版 SCULPT / 01 重构的动态房间摆件。保留参数化建模、独立对象、透明 WebGL 渲染与 GLB 导出；把规则曲面外壳、写实家具密度和直线混合布局动画，改成棱角石块、六件大轮廓家具与分段换位循环。

## 先打开哪个文件

**直接查看 `preview.html`。** 这是完整离线单文件，几何、贴图、渲染器、动画和界面代码均已内嵌，不需要 npm、CDN、网络连接或 API key。使用能执行 WebGL 2 的浏览器打开；系统文件快速预览不一定执行网页脚本。默认自动循环；开启系统“减少动态效果”时默认暂停，可点击播放主动开始。

网页支持鼠标拖动旋转、滚轮缩放、双指捏合缩放、暂停／继续、时间轴拖动、播放速度、恢复默认视角、独立对象高亮、透明棋盘衬底和导出。画布聚焦后，方向键旋转，`+` / `-` 缩放，空格切换播放，`0` 恢复视角。旋转范围为完整水平环绕，上下角度有限位。

`index.html` 是可编辑的源入口；`example.html` 是 400 × 455 px 网页组件示例；`minimal-example.html` 是透明画布的最小接入示例。需要本地服务器时，在项目根目录运行：

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

然后浏览器访问 `http://127.0.0.1:8000/index.html`。独立 `preview.html` 不要求启动服务器。

## 这一版的造型

外壳由不等角、不等高、不等半径的点构造凸多面体，再用实体布尔运算挖去室内空间。**没有球体或椭球体基底。** 灰色石壳保留硬边和独立平面法线，外轮廓不对称；微弱石纹为程序化贴图。

内部保持 **一个矩形浅木地板、两面平直暖白墙**，前侧和顶部敞开。石体、左墙、后墙、地板分别建模。家具为奶油白、浅木、鼠尾草绿、陶土橘和蜂蜜黄，大倒角、粗腿、大块坐垫，优先保证小画布中的轮廓辨识。

独立家具父组共 **6 个**，都位于 `Furniture_Editable` 下：

| 对象名 | 内容 | 换位方式 |
|---|---|---|
| `Furniture_Sofa` | 奶油云朵沙发 | 始终贴地，先移出、转向，再靠左 |
| `Furniture_DiningTable` | 小圆角餐桌 | 先贴地让位，再平移与转向 |
| `Furniture_DiningChair_01` | 餐椅 01 | 垂直升起，高处换位，垂直落下 |
| `Furniture_DiningChair_02` | 餐椅 02 | 垂直升起，高处换位，垂直落下 |
| `Furniture_FloorLamp` | 蘑菇灯 | 垂直升起与落下 |
| `Furniture_Plant` | 陶盆树 | 垂直升起与落下 |

每件家具仍有自己的命名子零件，例如坐垫、扶手、椅背、桌脚、灯罩、树冠。桌面小配件随桌子一起移动，但仍保留独立子节点。场景不是一个合并网格，也没有复制第二间房。部分重复零件共享几何数据，但节点和变换独立。

当前模型为 73 个场景节点，GLB 加默认相机后 74 个；约 45,566 个实例展开三角形，其中外壳 90 个三角形。含 18 种材质、3 张程序化贴图。单位米，+Y 向上；这些尺寸服务于展示比例，不是可施工户型。

## 动画到底有没有包含在 GLB

**有。`models/roomlet-loop.glb` 内含完整 16.4 秒 A → B → A 动画。**

动画名：`Roomlet_Full_Loop`。六个家具父组各有平移和旋转轨道，共 12 条标准通道、每条 985 个采样点。内容包括原布局停留、小件升空、空中换位、大件分步贴地移动、小件落下、修改布局停留、沿安全路线回程。起点与终点位置和旋转一致。没有淡出、隐藏节点或缩放到零的“瞬移”。

网页和 GLB 使用**同一份烘焙轨道数据**，不是网页播放一种运动、导出时再用另一种直线运动凑数。关键时刻：原布局 `0 s`，修改布局 `8.2 s`，回到原布局 `16.4 s`。

| 文件 | 动画 | 默认姿态 |
|---|---|---|
| `roomlet-loop.glb` | 完整循环片段 | 原布局 |
| `roomlet-original.glb` | 无，静态 | 原布局 |
| `roomlet-modified.glb` | 无，静态 | 修改布局 |

导入其他软件后，选择 `Roomlet_Full_Loop` 并开启播放器的循环／Repeat。片段本身首尾无缝，但 GLB 不替目标软件决定是否自动播放。

**只有网页代码提供的行为：**鼠标／触摸交互、镜头回位的 0.5 秒缓动、暂停继续和变速控制、时间轴、按钮反馈、对象选中高亮、提示条、加载提示和 CSS 衬底。这些交互及 UI 动画不在 GLB 内。GLB 中带一个默认正交相机，没有用户拖拽产生的相机轨道。

**只由网页渲染器生成的效果：**灯光、柔和阴影、环境遮蔽和色调映射。材质、几何、贴图包含在 GLB 内，但网页灯光与屏幕空间效果不烘焙进去。目标软件需配置自己的照明，因此外部渲染结果不保证与网页逐像素一致。

透明 PNG 和画布有真实 alpha；GLB 中没有背景平面。GIF / MP4 样片为了通用显示使用暖白衬底，不透明。

## 文件结构

```text
preview.html                    离线单文件预览
index.html                      可编辑主页面
example.html                    小尺寸网页组件示例
minimal-example.html            透明画布最小示例
src/
  scene-data.js                 生成的几何、材质、布局和完整动画数据
  renderer.js                   从上一版演进的 WebGL 2 渲染器与着色器
  viewer.js                     共享轨道播放器、轨道相机和触摸交互
  exporters.js                  网页 GLB 打包导出器
  app.js                        UI、对象面板、进度条与导出按钮
  styles.css                    响应式网页样式
source/
  build_scene.py                石壳、墙地、全部家具、材质与贴图源代码
  meshkit.py                    可重用几何构造与节点工具
  motion.py                     原／修改布局与分段动作编排的唯一源头
  glb_export.py                 Python GLB 导出器
  bundle_preview.py             合成离线单文件
  capture_loop.py               实际模型 GIF / MP4 样片渲染
models/
  roomlet-loop.glb              完整循环动画
  roomlet-original.glb          原布局静态模型
  roomlet-modified.glb          修改布局静态模型
  stone-shell.step              灰色石壳的 CAD 实体，只有外壳
assets/
  layouts.json                  两套布局的可读导出
  scene-manifest.json            对象树、材质及模型元信息
  *.png                         全部三张程序化贴图
samples/                        透明样图、循环样片、网页与小组件截图
docs/                           对象说明、动画边界、测试结果与视觉检查
tests/                          GLB、轨迹、网页与入口回归脚本
```

## 怎样修改与重建

预览不需要安装依赖。只有修改模型并重新生成时才需要 Python 环境：

```sh
python3 -m venv .venv
source .venv/bin/activate
# Windows PowerShell 使用 .venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python source/build_scene.py
python source/bundle_preview.py
```

造型、比例、配色、贴图在 `source/build_scene.py`；布局坐标、路径、升降高度和动作时段在 `source/motion.py`。修改后运行上面的两条重建命令。`assets/layouts.json` 是导出结果，不是运行时读取源，不要只改它而跳过重建。

仅修改界面或相机交互，编辑 `src/` 和 `index.html` 后运行 `python source/bundle_preview.py` 即可，不需要安装建模依赖。`renderer.js` 管照明，`viewer.js` 管交互和轨道播放。

创建流程使用 Python 3.13 及 `requirements.txt` 中的版本。其他 Python 版本、操作系统及 CadQuery 安装组合未逐一验证。未附带 `.blend` 文件；导入 GLB 或 STEP 后可在支持它们的工具中继续编辑。

## 嵌入自己的网页

复制 `src/scene-data.js`、`src/renderer.js`、`src/viewer.js`，保留一个尺寸明确的画布容器：

```html
<div style="position:relative;width:340px;height:380px">
  <canvas id="room" style="position:absolute;inset:0;width:100%;height:100%"></canvas>
</div>
<script src="src/scene-data.js"></script>
<script src="src/renderer.js"></script>
<script src="src/viewer.js"></script>
<script>
  const room = new RoomletViewer(document.getElementById('room'), SCULPT_SCENE);
  // room.setPlaying(false);     // 暂停，不重置进度
  // room.setPlaying(true);      // 继续
  // room.seek(8.2);             // 跳到修改布局，并暂停
  // room.resetView();           // 恢复默认视角
  // room.dispose();             // 组件销毁时释放资源与监听
</script>
```

使用完整预览页面嵌入时，可加 `?embed=1` 隐藏 UI，让页面本身也透明；`?autoplay=0` 关闭初始自动播放，`?time=8.2` 定格修改布局。全页面接口见 `src/app.js` 中的 `RoomletPreview`。

## 已做的检查与边界

独立家具的完整子网格包围盒用于轨迹审查：以 240 Hz 检查一轮 16.4 秒，共 3,937 个时间点、59,055 对家具检查。未发现包围盒相交，最小家具分离量约 0.094 m；沙发、桌子的父节点高度全程保持 0.08 m。墙面和地面也做了边界检查。完整结果见 `docs/motion-validation.json`。

这属于**预先编排路径的数值检查**，不是实时物理模拟、任意编辑后的避障保证或连续时间数学证明。改动尺寸与轨迹后需要重跑测试。

浏览器验证使用 Chromium / WebGL 2 和 Playwright，覆盖 1440 × 1000、390 × 844 的主预览，以及 340 × 380 小画布。验证包括播放／暂停／继续、拖动旋转、滚轮与模拟双指缩放、镜头复位、对象选择、透明衬底、GLB 下载与响应式排版。

创建环境没有可用的 Browser 插件，且管理员限制 `file://` 导航，因此测试把本项目自有 HTML 在浏览器内存中加载，没有更改管理员策略或绕过导航限制。没有声称已在此环境完成真实双击文件导航测试。没有外部网络资源请求。物理 iPhone、Safari、Firefox 和不同 GPU 的性能未实测。

GLB 做了二进制结构、嵌入资源、节点命名、法线、索引、动画首尾以及独立导入检查。属于项目自测，不是官方 Khronos 认证。

```sh
python tests/validate_glb.py
python tests/validate_motion.py
# 可选浏览器检查，额外需要 tests/requirements-qa.txt 和可用 Chromium：
python tests/browser_qa.py
python tests/check_examples.py
```

原创代码、模型、贴图许可见 `LICENSE.txt`。没有商业模型、外链 HDRI、隐藏远程资源或随包字体文件。
