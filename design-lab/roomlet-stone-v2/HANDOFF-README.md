# ROOMLET · 已确认客餐厅基线

这是给新 GPT Pro 线程继续制作「儿童房」「主卧」的参考源码包，不是整个网站工程。保留当前客餐厅作为参照，为两个新场景分别建模、交付。

## 先看什么

1. `exports/roomlet-living-srgb.mp4`：网站上已确认的最终观感。深绿背景、偏左镜头、柔和暖光、轻微左右视差、加快后的家具循环。
2. `preview.html`：独立离线交互预览，可拖动旋转、缩放、暂停和查看对象。几何与家具动作是修改后的版本，但它保留原交互预览灯光、固定默认镜头及 16.4 秒原始节奏，不与最终视频逐像素一致。
3. `source/build_scene.py`、`source/motion.py`：参数化建模和动作源码；`src/scene-data.js` 是目前已确认的完整生成数据。
4. `source/capture_home.py`：最终网站观感的唯一导出配方，包含光照修正、左偏 0.18 弧度、左右各 2° 的余弦微幅运镜、60fps、13.133 秒循环和 sRGB 色彩标记。

## 已确认的设计

- 饱满、近球形但不规则的灰色低多边形石壳，内部两面墙，矩形可用地面。
- 外露木地板边缘以不规则平滑过渡贴入石壳。
- 家具少而清晰，略带 Q 版比例；大件贴地换位，小件向上离开默认镜头视野后再落下。
- 暖主光、灰绿环境补光适配网页 #353d32，避免白棚式泛白。
- 视差非常轻微，不做明显摇晃；物体动作首尾闭合。

## 文件与边界

`models/roomlet-loop.glb` 包含 16.4 秒家具循环；另两份 GLB 是原/修改布局静态模型。GLB 不包含最终视频的后期光照配方、加速播放或微幅运镜。`stone-shell.step` 仅为石壳 CAD 实体。没有 `.blend` 文件。

`integration/` 是网站 React 接入示例及 CSS，依赖宿主网站的故事区布局，不是独立网站。

`docs/motion-validation.json`、`docs/glb-validation.json` 为本次重新运行的项目自检，不是外部认证，也不是所有浏览器或完整碰撞证明。旧样片、旧 QA 报告和旧校验和已排除。

## 运行与修改

预览直接用支持 WebGL2 的浏览器打开 `preview.html`；若文件协议受限，根目录执行 `python3 -m http.server 8203 --bind 127.0.0.1` 后打开 localhost:8203。

重建几何需要 Python 与 `requirements.txt` 中的依赖：

```sh
python -m pip install -r requirements.txt
python source/build_scene.py
python source/bundle_preview.py
python tests/validate_motion.py
python tests/validate_glb.py
```

只想原样复现客餐厅的已确认资产时，可在 build_scene 后、bundle_preview 前执行：

```sh
python source/preserve_original_assets.py reference/asset-baseline.zip
```

此恢复脚本保留原家具/贴图，只接纳生成的石壳、地板与动作；**制作新儿童房或主卧时不要运行它**，否则会把新家具覆盖回客餐厅。

最终网站视频导出另需 FFmpeg（含 libx264）、Pillow、Playwright 与 Chromium：

```sh
python -m pip install pillow playwright
python -m playwright install chromium
python source/capture_home.py --output-dir exports
```

可用 `--browser /path/to/chrome` 指定已安装浏览器。当前导出器专为客餐厅 A→B→A 的 16.4 秒对称动作编写，前半段逐帧渲染、后半段反放，并非任意场景通用导出器；新场景应按自身动作检查适配。最终使用 `roomlet-living-srgb.mp4`，不要使用未完成容器色彩标记的中间 MP4。

## 新线程目标

沿用这套工作流，分别制作「陪孩子慢慢长大」儿童房和「把不同，安放在一起」主卧。继承必要几何与交付约束，家具设计、构图、配色和合理布局变化自由发挥。两套场景独立命名，提供离线交互预览、源码、素材与带完整循环的 GLB；明确哪些测试实际完成。
