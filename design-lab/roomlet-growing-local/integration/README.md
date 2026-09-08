# 网站接入

复制 `embed.html` 到网站静态资源目录即可；它本身内嵌运行所需的全部模型、图片和代码，不依赖旁边目录。保持透明，外部页面可用 `#353d32` 背景。不要把带编辑器界面的 `preview.html` 当成正式网站小摆件。

```html
<iframe
  src="/roomlets/growing/embed.html"
  title="陪孩子慢慢长大"
  loading="lazy"
  style="width:320px;aspect-ratio:1;border:0;background:transparent;display:block"
></iframe>
```

默认自动循环与轻微观察视差。参数可用 `?autoplay=0`、`?parallax=0`、`?time=9`；`time` 会暂停在对应秒数。画布支持拖动、双指、滚轮和键盘。离开视口 / 切换到后台时停止推进，回到可见状态继续，不追补隐藏期间的时间。

父页面与子页面同源时，可发控制消息：

```js
const frame = document.querySelector('iframe');
frame.contentWindow.postMessage({ type: 'roomlet', action: 'pause' }, location.origin);
frame.contentWindow.postMessage({ type: 'roomlet', action: 'play' }, location.origin);
frame.contentWindow.postMessage({ type: 'roomlet', action: 'seek', time: 9 }, location.origin);
frame.contentWindow.postMessage({ type: 'roomlet', action: 'reset' }, location.origin);
```

子页面只接受同源父页面发来的这些动作，不执行代码、不接受外部 URL。跨域宿主需要自行设计严格的 origin 白名单，不要直接移除校验。

同源脚本也可以使用 `iframe.contentWindow.RoomletPreview` 的 `play()`、`pause()`、`seek(seconds)`、`resetView()`。完整预览额外提供 `setParallax()`、`exportPNG()`、`exportGLB()`、`getState()`。

`example.html` 提供最小按钮示例；在静态服务器下和本目录结构一起使用。正式接入时保留外层 1:1 宽高比，避免模型在极扁容器中缩得过小。首次接入先用 280–360px 检查视觉密度。

目前并未在用户生产站点、真实 Safari 或三个房间同时运行的硬件负载下验证。自有渲染器使用 WebGL 2；没有 WebGL 2 时给出错误信息，不会自动转成静态图。

如改用 GLB 配合其他引擎，需要自己添加柔和暖主光、填充光、阴影 / AO、透明背景，选择文件中的家具动画并设置循环。网页相机视差属于查看器，不包含在家具 GLB 动画里。
