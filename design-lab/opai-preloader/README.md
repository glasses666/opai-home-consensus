# 欧派冷灰背景方块翻转 · 开场动效小样 07

## 当前V07：冷灰背景对照

验证：HyperFrames检查通过，lint/runtime/motion零错误警告、16布局采样0问题；目视3.7秒快照确认冷灰底与白砖边界，Studio3017返回HTTP200。本轮未另渲染视频。

仅背景改为 #CBD3DB，保留白色商标砖、16px厚度和全部运动参数。V06源及视频保留；当前通过Studio本地审阅，不发Telegram、不部署。

## 当前V06：厚度16px

验证：HyperFrames lint/runtime/motion均0错误，16个布局采样0问题；成片H.264、1600×900、60fps、1008帧、16.8秒。解码检查三轮落平商标及翻转侧面，循环边界为纯白无残留。视频：`renders/opai-preloader-v06.mp4`。视觉接触表：`renders/v06-contact-sheet.png`。

用户反馈V05的6px厚度不可见，确认加至16px（正面宽24px的2/3），并增强左右侧/顶底明暗。主体框、16×3网格、商标、白底、右轴波浪与5.6秒周期不改。V05另存v05.html.source与原视频。仅本地审阅，不发TG、不部署。

## 当前 V05：24×24×6 六面薄砖

验证：整合检查通过，Lint/Runtime/Motion零错误警告、布局16样本0问题（无DOM文本，Contrast0/0不代表商标审计）。本地H.264视频 `renders/opai-preloader-v05.mp4`，1600×900、60fps、1008帧、16.8秒、576234bytes。目视侧面厚度与九帧序列；解码首尾/5.6与11.2秒接缝两侧均0个低于240的非白像素，三轮定格均约1.19万非白像素。Studio3017 HTTP200。未发Telegram。

按用户授权给每格增加6px厚度，不发Telegram。384×120布局框、16×3正面网格、官网原图、白底和V04右轴波浪时序不变。每块由商标正面、白色背面与四个明暗不同的侧面构成CSS3D长方体，使用preserve-3d与逐面背面剔除；不是仅加阴影伪装厚度，也不是物理刚体模拟。影子仍为手工受光提示。

整砖只在其翻转与正面停留区间显示，完成背转后用时间线边界set隐藏，以保证空白接缝；没有用透明度渐变替代翻转。V04保存为v04.html.source与原MP4。V05仅本地视频/Studio审阅，不接生产，不push、不部署。

## V04 历史

## 当前 V04：右侧轴与伪3D受光

Hermes本人Telegram交付成功，message_id 19566。

验证：HyperFrames整合检查通过（Lint/Runtime/Motion零错误警告，布局16样本0问题；无DOM文本，Contrast0/0不表示商标对比度审计）。H.264 1600×900、60fps、1008帧、16.8秒、498380bytes。目视右轴诊断图与成片九帧放大序列，确认三行翻片及阴影前进、完整定格无灰底。解码像素检查：首尾及5.6/11.2秒接缝两侧均0个低于240的非白像素；2.6/8.2/13.8秒三轮定格约1.19万个非白像素。仅视觉样例，未部署/推送/接入生产。

V03源保留为 `v03.html.source`，其视频不覆盖。沿用384×120布局框、16×3个24px方格、官网商标和白底。每块改为 `transform-origin:100% 50%` 与 `rotationY:180→0→-180`；固定右侧轴，左向右列间90ms推进，三行仅12ms错峰。入场720ms/退场680ms，相邻列明显重叠成波；无需引入新编辑器、Three.js或Blender。

每格拥有随角度阶段收放的暖灰地面投影与表面受光层，动画中间最强，完整商标定格、空白与循环接缝全部归零。阴影是手工伪3D提示，不是真实光线追踪或物理碰撞。5.6秒一轮，显式3轮16.8秒，后续fromTo关闭immediateRender以保持可寻帧。原图清晰度按用户要求暂不处理。

渲染命令：`NODE_USE_ENV_PROXY=1 npx --yes hyperframes@0.8.29 render --output renders/opai-preloader-v04.mp4 --fps 60 --quality standard --workers 4`。版本只读检查仍为0.8.29；不改生产依赖或线上页面。

## V03 历史

## 当前 V03：官方商标、缩小、双向过程均翻牌

Hermes CLI发送本人Telegram成功，message_id 19564（V03审阅片）。

验证：HyperFrames0.8.29整合检查通过，Lint/Runtime/Motion零错误警告，布局16样本0问题；无DOM正文，对比度0/0不是商标对比度证明。H.264成片1600×900、60fps、864帧、14.4秒、327512bytes。目视完整商标与九帧入场/退场/第二轮接续；像素检查首帧、4.8/9.6秒接缝两侧与末帧均无低于240的非白像素，2.4/7.2/12秒均有约1.19万非白像素，确认三轮都有实体Logo，不是只动第一轮。源码未提交、未部署、未push。

V02源保留为 `v02.html.source`。布局框从480×150等比缩为384×120（宽高各减20%），官方横向商标等比容纳其中，不拉伸成旧字形高度。纯白背景；没有额外线框、装饰或辅助文字。48个24px方格绕横轴从背面翻到正面，再同向翻回背面，波从左向右传播；不使用透明度淡入淡出。

官方原图：[欧派商城页眉商标](https://www.oppein.cn/images/logo_n.jpg)，来源页面 [欧派官方商城](https://www.oppein.cn/)。仅用CSS截取304×34源图左侧214×34商标区域，排除右侧商城说明；未仿写、改色或变形。橙色括形是原商标组成部分，不是新增线框。下载的集团站/浮动导航白字版本不适合白底，保留但未使用。当前源图为小尺寸栅格，正式接入应向品牌方索取授权矢量稿。

4.8秒一轮，审阅片明确排入3轮（14.4秒），首尾同为白底。不要直接使用根时间线repeat：本地check采样曾显示后两轮空白；显式安排每轮fromTo并为后续轮设置immediateRender:false后，第二轮重新出现。整段只验证循环视觉，未接资源加载，不强制用户等待14.4秒。

动态图断言须用唯一ID，不能把多匹配的.tile用于staysInFrame；使用四角tile ID。完整商标停留是设计意图，因此keepsMoving允许2.2秒静态窗口（包含缓动尾端），不为满足检查增加装饰性漂移。

复现：`NODE_USE_ENV_PROXY=1 npx --yes hyperframes@0.8.29 render --output renders/opai-preloader-v03.mp4 --fps 60 --quality standard --workers 4`。CLI只读版本检查确认0.8.29已是当前版本，未升级生产依赖。Catalog词项检索的wordmark-tiles是彩色噪声重组、split-flap-board是机场字符板，都不匹配无底板的商标拼块，因此保留小型自定义GSAP实现。

## V02 历史

## 当前 V02：极简尺寸试样

按用户反馈仅保留中央 OPAI，纯暖白背景，移除全部装饰、辅助文字、进度条及揭幕。480×150 布局框占1600×900画面的5%（不是字形墨迹面积）。保留切片构筑，位移缩半，5秒结束。当前源为 index.html；V01 源保存在 v01.html.source，避免被检查器识别成第二个根入口。

视频：`renders/opai-preloader-v02.mp4`；1600×900、30fps、150帧、5秒。实际目视定格帧；整合检查通过：Lint/Runtime/Motion 0错误警告，布局9样本0问题，对比度40/40。Hermes发送本人Telegram成功，message_id 19555。仅独立试样，未接生产主页。

## V01 历史记录

2026-09-05，用户授权先制作一版查看。**候选，未验收、未接主页、未部署。**

- Studio: <http://localhost:3017/#project/opai-preloader>
- 视频：`renders/opai-preloader-v01.mp4`，H.264、1600×900、30 fps、270帧、9秒、657221 bytes。
- 视觉规范：[DESIGN.md](./DESIGN.md)；动画源：[index.html](./index.html)。实施范围仍由仓库 `PLAN.md` 管理。
- 当前是字体切片构筑，不是真正三维 CG；片尾仅为文字衔接示意，不是完成的新主页。

## 验证

`npm run check`：Lint / Runtime / Motion 均0错误警告，Layout9样本0问题，Contrast48/48。渲染成功，ffprobe确认媒体参数；实际目视2.1s构筑中、4.4s品牌定格、7.8s标题衔接三帧。Studio background status及HTTP200确认服务运行；Codex右侧打开仅返回queued。

有意遮罩叠加仅在字形切片标注allow-overlap，退出幕标注allow-overflow。装饰轮廓使用空节点CSS字形，不当成正文；正文对比度检查未关闭。旧bundled animation-map脚本缺少producer未跑通，当前CLI的整合Motion检查通过。

## 复现

```sh
NODE_USE_ENV_PROXY=1 npx --yes hyperframes@0.8.29 preview --background --port 3017
npx --yes hyperframes@0.8.29 preview --status
NODE_USE_ENV_PROXY=1 npm run check
NODE_USE_ENV_PROXY=1 npx --yes hyperframes@0.8.29 render --output renders/opai-preloader-v01.mp4 --fps 30 --quality standard --workers 4
```

工具记录：npx缓存HyperFrames0.8.29；scaffold自带流程安装用户级HyperFrames skills，渲染下载headless Chrome，未改生产app依赖。可通过`HYPERFRAMES_BROWSER_PATH`指定已有Chrome。系统字体需显式`@font-face src:local(...)`，不复制字体文件；框架会加入`data-hf-id`，编辑前重新读取。非交互init还需`--example blank`且目录为空。

下一步：用户审阅构筑感、字形与节奏。正式接入另行实现资源就绪、超时、减少动态、重复访问策略及授权Web字体。本片时间线与线段只是视觉样例，不是真实资源进度。
