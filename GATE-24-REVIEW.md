# Gate 24 Review — 设计方向导航、动态体验样机与最终风格选择

## 结论

Gate 24 已实现为一个“同一产品内的四种体验气质”层，而不是四套平行产品。导航页负责分流风格，样机页继续沿用同一 canonical scene、Agent、版本、家庭状态和编辑合同。

## 研究输入

这次方向选择不是凭空拟形，而是基于 Agent Reach 读到的几类网页参考：

- [Vitra configurator](https://jonasauernhammer.com/work/vitra) / [Vitra Eames configurator](https://www.emersya.com/vitra-eames-configurator/)
- [BMW Configurator](https://www.bmwgroupdesignworks.com/case-studies/bmw-configurator-making-digital-configuration-a-true-brand-experience/)
- [ARCHI SITE MOBIUS](https://asmobius.co.jp/) / [Awwwards case](https://www.awwwards.com/sites/archi-site-mobius)
- [Garonzi / Tailored Interiors Makers](https://www.awwwards.com/garonzi-tailored-interiors-makers.html)

从这些参考里提取的是信息层级、动态节奏、导航方式和“让主对象先说话”的布局，不复制品牌、商品图、字体或商业页面结构。

## 落地内容

- `app/src/DesignDirections.jsx`
  - 新增轻量导航首页和四方向展示页。
  - 4 个方向分别是 `calm-catalog`、`spatial-cinema`、`agent-canvas`、`architect-index`。
  - 每个方向都通过同一个 `/project/demo?style=...` 进入同一产品。
- `app/src/domain/experience-style.js`
  - 统一风格白名单、默认值和 query 串序列化。
- `app/src/App.jsx`
  - `/`、`/directions` 和 `/project/demo` 共用同一 style 参数。
  - style 变化只改展示外壳，不复制业务状态。
- `app/src/styles.css`
  - 四套风格的局部 tokens、卡片、导航和动效。
  - `spatial-cinema`、`agent-canvas`、`architect-index` 具有明确动态反馈；`calm-catalog` 保持低动效。

## Agent-first 检查

- 首屏主 CTA 仍然是“与 Agent 继续设计”，不是风格切换，也不是高级编辑。
- 四个方向只负责“看起来像什么”，不改 canonical scene、room/view/select、Agent、版本或家庭状态。
- 高级编辑仍然保留为次级入口，不能抢住户的默认前台。
- 风格切换后，住户已经输入的项目上下文会继续保留。
- 动效只负责帮助理解和定位，不阻塞输入、不改 scene 状态、不制造滚动劫持。

## 住户操作摩擦

- `calm-catalog`：最稳，适合首次验收和阅读。
- `spatial-cinema`：镜头感最强，适合展示“点房间 → 飞到俯视 → 再继续看”的主路径。
- `agent-canvas`：最接近工作台，适合理解 Agent 为什么改。
- `architect-index`：最适合导航和对比，位置感最强。

## 性能 / 边界

- 本 Gate 没有新增动画依赖。
- `prefers-reduced-motion` 下会自动降级。
- 方向页是表现层，不承载业务数据同步。
- 目前仍是本地 Demo，不代表真实欧派产品数据、报价、BOM 或生产接口已接通。

## 验证

- `cd app && npm test` ✅
- `cd app && npm run build` ✅
- 本地 headless 浏览器抽查通过：
  - `/` 首页
  - `/directions` 方向页
  - `/project/demo?style=spatial-cinema` 体验样机

## 推荐使用场景

- 起床后让用户先在四种体验气质里选一个方向。
- 设计师在复核时用同一产品，切换不同外壳看情绪和导航差异。
- 以后如果要继续扩展，只加第 5 个气质，不要复制第二套业务链路。
