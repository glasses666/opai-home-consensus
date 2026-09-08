# 依赖与资源说明

浏览器运行时沿用并修改上一版原创 WebGL 2 渲染器，无 CDN、npm 运行时依赖、外部 HDRI 或第三方模型。3 张 PNG 均由建模源码程序化生成。网页字体使用操作系统字体栈，不随包分发字体。

可选重建工具：NumPy、SciPy、Pillow、CadQuery / OpenCascade。可选验证工具：Playwright、Chromium、trimesh。可选样片编码：FFmpeg。这些工具不是网页运行所需资源，软件包及二进制不随交付包再分发。

本项目的 glTF 数据结构按 glTF 2.0 构造；项目自测报告不代表 Khronos 官方认证。
