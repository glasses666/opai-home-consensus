# ROOMLET / 03 · 把不同，安放在一起

> 本地已修正衣柜布局与动画，请先看 [LOCAL-REVISION.md](LOCAL-REVISION.md)。旧 exports 样图及未重跑 QA 是原版资料；当前结果以 preview.html、src 和 models 为准。

多一点收纳，也多一点从容。

## 先打开哪个文件

**`preview.html` 是完整交互预览，`embed.html` 是透明背景、无编辑器界面的网站嵌入版。** 两者均内嵌模型、动画、三张 PNG 和全部运行时代码，无 CDN、联网字体、外部模型或 npm 运行时依赖。可以单独复制这两个文件中的任意一个；不必带上其他目录。

`index.html` 与预览内容相同，但使用旁边的 `src/` 源码文件，适合修改网页和渲染器。这里的交互页面以 `#353d32` 作观察底色；底色不在模型中，也不写入透明 PNG。`embed.html` 的页面和画布均透明。

优先用支持 WebGL 2 的桌面浏览器打开 `preview.html`。如浏览器的本地安全策略拦截，进入本目录运行：

```sh
python3 -m http.server 8203 --bind 127.0.0.1
```

然后访问 `http://127.0.0.1:8203/preview.html`。这是用户端可用的打开方式说明；本次测试环境禁止 URL 导航，**没有将直接双击 / file:// 或 localhost 导航记为已实测**。已将最终单文件 HTML 原样装入 Chromium 的离线页面完成渲染和交互测试，外部网络请求为零。

## 设计与动画

原布局里，两座衣柜散放在左侧，斗柜占据床尾，床侧与床尾都显得拥挤。变化时，斗柜先让出床尾；两座衣柜依次退让、转向，和斗柜沿左墙组成一列，柜门朝向房间内部；床向右后方略微平移，床边小台回到手边。两座衣柜、斗柜及其门板、搁板、抽屉、书本全程保留，改善来自朝向与位置，而不是删除收纳。

沿用附件的程序化建模、自有 WebGL 2 渲染器、同源轨迹导出和单文件交付流程；不用生成图代替 3D，也不依赖下载的家具模型。石壳为不规则的近球形低多边形切开体，内部有两面固定墙和一块地板。矩形可用核心保持平整，外沿网格自然接到石壳。镜头略俯视，构图稍偏左，非对称展示两面墙。

完整动画 **18 秒，A → B → A**。轨迹以五次平滑曲线设计，再统一采样为 60 Hz / 1081 个采样点；网页和 GLB 使用同一份 float32 平移与四元数数据。大件始终贴地平移或转向；小件先竖直离开默认视角上边界，才在画面之外横向移动，再竖直落回。画面外路径仍连续，没有通过隐藏节点或缩放到零来换位。

0–1.00 s：原布局；1.00–7.70 s：错峰变化；7.70–10.30 s：调整后布局；10.30–17.00 s：沿避让路径复位；17.00–18.00 s：原布局。

默认镜头附加约 **±0.8°** 的轻微左右观察视差，和 18 秒循环同周期。暂停时视差也暂停；拖动改变的是用户观察角度，视差不会累积到用户旋转值。默认遵循系统“减少动态效果”，该模式初始暂停且关闭自动视差。

## 交互与编辑

拖动旋转；滚轮或双指缩放；底部按钮暂停、重播；时间轴任意定位；A / B 按钮直达两种布局。房子图标恢复默认角度；另有俯视、速度、透明棋盘格和视差开关。聚焦画布后，空格暂停 / 播放，方向键观察，`+` / `-` 缩放，`0` 恢复视角。

右上角对象按钮打开家具列表。选中独立家具后，可编辑 X、Z 和绕 Y 轴角度，并导出调整后的静态 GLB。**这些临时编辑不改写原循环；重播恢复原轨迹。手工改位后的碰撞需要重新检查。**

| 独立父对象 | 内容 |
| --- | --- |
| `Furniture_Bed` | 双人床 |
| `Furniture_Wardrobe_A` | 衣柜 A |
| `Furniture_Wardrobe_B` | 衣柜 B |
| `Furniture_Dresser` | 床尾斗柜 |
| `Furniture_Bedside` | 床边小台与灯 |

家具下面的床垫、门板、抽屉、把手、书本等仍有独立命名子节点，可在支持 GLB 的编辑器或建模源码中进一步修改。石壳、墙、地板在 `Architecture_Fixed` 下，不参加家具动画。没有把整间房合并为一个不可编辑网格。

## 文件地图

```text
preview.html                   单文件完整预览，包含 UI 与导出
embed.html                     单文件透明网站版，无 UI 外框
index.html                     分离源码入口
src/                           WebGL 渲染器、交互、编辑器、导出器、模型数据
source/build_scene.py           参数化家具与材质定义
source/architecture.py          固定石壳、两墙、地板；生成 STEP
source/motion.py                布局与权威动画路径
source/scene-config.json        本包选择的独立场景
source/meshkit.py               可复用基础建模函数
source/glb_export.py            Python GLB 导出
source/bundle_preview.py        内联资源，生成 preview / embed
assets/                        原始 PNG、布局 JSON、节点清单
models/roomlet-together-loop.glb         18 秒动画
models/roomlet-together-original.glb     原布局静态模型
models/roomlet-together-modified.glb     调整后静态模型
models/stone-shell.step         石壳的可编辑实体交换文件
exports/                       透明 PNG、页面截图、回读对照帧
integration/example.html       同源 iframe 嵌入示例
integration/README.md           网站接入与控制接口
requirements.txt               仅源码重建需要的 Python 包
tests/                         自测脚本
docs/                          模型数据与实际验证记录
```

浏览器里的“导出循环 GLB”也实际点击并保存，结果在 `exports/browser-export-loop.glb`；它与 `models/` 中的 Python 导出使用相同几何、材质与轨迹。

## 如何重建

本次生成环境：Python 3.13.5、NumPy 2.3.5、SciPy 1.17.0、Pillow 12.3.0、CadQuery 2.8.0。网页运行不需要安装这些包。新建开发环境时安装依赖需要网络，交付的 HTML 本身运行不需要网络。

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python source/build_scene.py
python source/bundle_preview.py
```

尺寸、颜色、子部件：改 `source/build_scene.py`。布局和动作：改 `source/motion.py` 的 `LAYOUTS`、`KEYFRAMES`、`FLIGHTS`。网页界面：改 `index.html` / `src/styles.css` / `src/app.js` 后重新运行打包脚本。无需手动编辑大段 base64 场景数据。两个场景各自包含完整代码，不依赖另一个文件夹。

可选复测：

```sh
python -m pip install -r tests/requirements-qa.txt
python tests/validate.py
python tests/delivery_validation.py
# 需本机已安装 Chromium / Chrome，以及可用的 WebGL 2 环境。
# 设置 CHROMIUM 为浏览器可执行文件路径；有图形环境时设置 DISPLAY。
python tests/browser_qa.py
```

浏览器测试将导出的 GLB 真正解析回模型数据后再次渲染；它不是调用原始场景假装“导入”。测试的核心阶段和小尺寸嵌入阶段分开启动浏览器，避免软件 GPU 在一个进程中累积大量渲染资源。本次 Linux 使用 Xvfb `DISPLAY=:99` 加 Chromium；不是在用户的 Mac 上执行。

## 实际验证与边界

参见 **`docs/QA.md`** 和对应 JSON。当前模型有 95 个命名场景节点（GLB 另含 1 个默认相机节点）、5 组家具、17 种材质、3 张内嵌纹理；实例化后约 42,800 个三角形。循环 GLB 大小约 1.15 MiB。

**GLB 保留模型、材质、节点和家具动画，但不会自动带走网页自定义的暖光、软阴影、SSAO 或左右相机视差。** 其他引擎需要设置自己的灯光、背景透明、相机和循环播放方式。因此回读逐像素一致的验证限定在本项目同一渲染器里，不能推导为 Blender / Three.js 等其他渲染器也逐像素相同。

网页暂停 / GLB 播放循环属于播放器行为。GLB 内是完整的 A → B → A 动画片段；在目标软件中选择该片段并开启 Repeat / 循环即可。并未验证其他软件里的动画播放。石壳 STEP 不是整个房间的 CAD 施工文件；Q 版模型的尺寸和通道数值不用于施工或无障碍规范判断。

没有随包分发字体、浏览器、Python 依赖或原附件视频。授权说明见 `LICENSE.txt`、`THIRD_PARTY_NOTICES.md`。
