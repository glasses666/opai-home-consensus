import { fileURLToPath } from "node:url";

const round = (value, digits = 2) => Number(value.toFixed(digits));
const percent = (value) => round(value * 100, 1);
const changePercent = (value, baseline) => percent(value / baseline - 1);

export function calculateComparison() {
  const scenario = {
    roomDepthM: 3.1,
    sofaDepthClosedM: 1.1,
    sofaDepthReclinedM: 1.6,
    wallWidthM: 3.6,
    cabinetHeightM: 2.4,
    tvOpeningWidthM: 1.8,
    tvOpeningHeightM: 1.1,
  };

  const wallArea = scenario.wallWidthM * scenario.cabinetHeightM;
  const tvOpeningArea = scenario.tvOpeningWidthM * scenario.tvOpeningHeightM;
  const fullWallFacadeArea = wallArea - tvOpeningArea;

  const makeClearance = (depthM) => ({
    closedM: round(scenario.roomDepthM - scenario.sofaDepthClosedM - depthM),
    reclinedM: round(scenario.roomDepthM - scenario.sofaDepthReclinedM - depthM),
  });

  const fullWall = {
    key: "full-wall",
    label: "V1 满墙柜",
    livingFacadeAreaM2: round(fullWallFacadeArea),
    livingFacadeCoveragePct: percent(fullWallFacadeArea / wallArea),
    livingGrossStorageM3: round(fullWallFacadeArea * 0.35, 3),
    wholeHomeGrossStorageM3: round(fullWallFacadeArea * 0.35, 3),
    quantityProxyFacadeM2: round(fullWallFacadeArea),
    centerClearance: makeClearance(0.35),
    sideClearance: makeClearance(0.35),
  };

  const shallowFacadeArea = fullWallFacadeArea * 0.8;
  const shallowFullWall = {
    key: "shallow-full-wall",
    label: "V2 浅柜＋20%留白",
    livingFacadeAreaM2: round(shallowFacadeArea),
    livingFacadeCoveragePct: percent(shallowFacadeArea / wallArea),
    livingGrossStorageM3: round(shallowFacadeArea * 0.3, 3),
    wholeHomeGrossStorageM3: round(shallowFacadeArea * 0.3, 3),
    quantityProxyFacadeM2: round(shallowFacadeArea),
    centerClearance: makeClearance(0.3),
    sideClearance: makeClearance(0.3),
  };

  const towerWidthM = 0.6;
  const towerCount = 2;
  const centerBaseWidthM = scenario.wallWidthM - towerWidthM * towerCount;
  const baseHeightM = 0.45;
  const centerBaseDepthM = 0.3;
  const towerDepthM = 0.35;
  const centerBaseFacadeArea = centerBaseWidthM * baseHeightM;
  const towerFacadeArea = towerCount * towerWidthM * scenario.cabinetHeightM;
  const balancedFacadeArea = centerBaseFacadeArea + towerFacadeArea;
  const balancedLivingStorage =
    centerBaseFacadeArea * centerBaseDepthM + towerFacadeArea * towerDepthM;

  const balanced = {
    key: "balanced",
    label: "V3 低柜＋双侧高柜",
    livingFacadeAreaM2: round(balancedFacadeArea),
    livingFacadeCoveragePct: percent(balancedFacadeArea / wallArea),
    livingGrossStorageM3: round(balancedLivingStorage, 3),
    wholeHomeGrossStorageM3: round(balancedLivingStorage, 3),
    quantityProxyFacadeM2: round(balancedFacadeArea),
    centerClearance: makeClearance(centerBaseDepthM),
    sideClearance: makeClearance(towerDepthM),
  };

  const entryCabinet = {
    widthM: 1.2,
    heightM: 2.4,
    depthM: 0.35,
  };
  const entryFacadeArea = entryCabinet.widthM * entryCabinet.heightM;
  const entryStorage = entryFacadeArea * entryCabinet.depthM;
  const balancedWithEntry = {
    ...balanced,
    key: "balanced-with-entry",
    label: "V3＋玄关补偿柜",
    wholeHomeGrossStorageM3: round(balancedLivingStorage + entryStorage, 3),
    quantityProxyFacadeM2: round(balancedFacadeArea + entryFacadeArea),
  };

  const variants = [fullWall, shallowFullWall, balanced, balancedWithEntry];
  const comparisons = variants.slice(1).map((variant) => ({
    key: variant.key,
    livingStorageChangePct: changePercent(
      variant.livingGrossStorageM3,
      fullWall.livingGrossStorageM3,
    ),
    wholeHomeStorageChangePct: changePercent(
      variant.wholeHomeGrossStorageM3,
      fullWall.wholeHomeGrossStorageM3,
    ),
    facadeCoverageChangePoints: round(
      variant.livingFacadeCoveragePct - fullWall.livingFacadeCoveragePct,
      1,
    ),
    centerClearanceClosedChangeMm: round(
      (variant.centerClearance.closedM - fullWall.centerClearance.closedM) * 1000,
      0,
    ),
    centerClearanceReclinedChangeMm: round(
      (variant.centerClearance.reclinedM - fullWall.centerClearance.reclinedM) * 1000,
      0,
    ),
    quantityProxyChangePct: changePercent(
      variant.quantityProxyFacadeM2,
      fullWall.quantityProxyFacadeM2,
    ),
  }));

  return { scenario, variants, comparisons };
}

function renderMarkdown(result) {
  const { scenario, variants, comparisons } = result;
  const comparisonByKey = new Map(comparisons.map((item) => [item.key, item]));

  const rows = variants.map((variant) => {
    const comparison = comparisonByKey.get(variant.key);
    const wholeHomeChange = comparison
      ? `${comparison.wholeHomeStorageChangePct > 0 ? "+" : ""}${comparison.wholeHomeStorageChangePct}%`
      : "基准";
    return `| ${variant.label} | ${variant.livingFacadeCoveragePct}% | ${variant.centerClearance.closedM}m / ${variant.centerClearance.reclinedM}m | ${variant.livingGrossStorageM3}m³ | ${variant.wholeHomeGrossStorageM3}m³（${wholeHomeChange}） | ${variant.quantityProxyFacadeM2}m² |`;
  });

  return `# 电视墙方案对比计算

## 结论先行

这组计算证明的不是“哪套方案最好”，而是三个不能被效果图掩盖的事实：

1. 把柜深从 350mm 减到 300mm，只增加 50mm 中央净距，无法单独解决小客厅的压迫感。
2. 大幅降低电视墙的立面占用，必然损失客厅本地储物；V3 的客厅几何储物容积较 V1 下降约 42.9%。
3. 将储物重新分配到玄关后，全屋几何储物容积可恢复到与 V1 近似（本模型为 +0.4%），但柜体工程量代理值不一定下降，因此不能同时承诺“更开阔、同等收纳、价格更低”。

AI 的价值不是隐藏这些冲突，而是把冲突算出来，让客户选择。

## 输入边界

来自公开用户案例的输入：客厅进深 ${scenario.roomDepthM}m、满墙柜深 0.35m、沙发常态深 ${scenario.sofaDepthClosedM}m、展开后 ${scenario.sofaDepthReclinedM}m。

为了演示计算方法而设定的参数：电视墙宽 ${scenario.wallWidthM}m、柜体高 ${scenario.cabinetHeightM}m、电视留空 ${scenario.tvOpeningWidthM}m × ${scenario.tvOpeningHeightM}m、玄关补偿柜 1.2m × 2.4m × 0.35m。它们不是欧派真实项目数据，进入企业试点后必须由量尺、产品库和报价系统替换。

公开案例：[3.1 米开间做整墙电视柜的入住反馈](https://www.xiaohongshu.com/explore/69b24546000000000800ef5d)

## 对比结果

| 方案 | 客厅墙面占用代理 | 中央净距：沙发常态 / 展开 | 客厅几何储物容积 | 全屋几何储物容积 | 柜体立面工程量代理 |
| --- | ---: | ---: | ---: | ---: | ---: |
${rows.join("\n")}

### 指标解释

- **墙面占用代理**：柜体正立面面积 ÷ 电视墙总面积，用来比较视觉体量，不是行业标准或心理舒适度结论。
- **中央净距**：房间进深 − 沙发深度 − 电视区域柜深；未扣除茶几、人体活动和施工误差。
- **几何储物容积**：柜体正立面面积 × 柜深；未扣板材、五金、设备位和不可用空间，不能当成真实可用容积。
- **工程量代理**：各空间柜体正立面面积之和；真实报价还受板材、五金、工艺、模块和地区影响，不能直接换算成价格。

## 设计差异该如何展示给客户

### V1 满墙柜

- 优点：客厅本地储物最大，物品集中。
- 代价：墙面体量最大；沙发展开时中央净距只剩 1.15m，且尚未计入茶几和活动空间。

### V2 浅柜＋留白

- 中央净距仅增加 50mm。
- 客厅几何储物容积下降约 31.4%。
- 说明“柜体变浅”不是充分解法，仍需处理墙面体量与储物结构。

### V3 低柜＋双侧高柜

- 客厅墙面占用代理由 77.1% 降至 45.8%。
- 中央区域净距增加 50mm，但侧柜区域仍与 V1 相同。
- 客厅本地几何储物容积下降约 42.9%，客户必须明确接受或选择跨空间补偿。

### V3＋玄关补偿柜

- 客厅保持 V3 的开阔效果。
- 本模型的全屋几何储物容积较 V1 约增加 0.4%。
- 柜体立面工程量代理较 V1 约增加 2.7%，所以更开阔不等于更便宜。
- 玄关储物和客厅储物的取放便利性不同，不能只比较总容积。

## 能证明与不能证明的内容

### 当前计算可以证明

- 每次设计变更可以自动形成空间、储物和工程量差异卡。
- “保留全部收纳同时让客厅明显开阔”通常需要跨空间重分配，而不是只改电视墙。
- 客户确认页应展示取舍，不能只展示新效果图。

### 当前计算不能证明

- 该方案已经减少了多少沟通时间或返工率。
- 客户一定更喜欢哪一版。
- 欧派真实价格、工期、BOM 或生产可行性。

这些业务效果必须通过对照试点验证：同一批真实需求分别使用“静态效果图＋聊天确认”和“交互对比＋影响卡＋版本冻结”，记录确认轮次、设计师解释时长、确认后重大变更率和版本错用次数。
`;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  process.stdout.write(renderMarkdown(calculateComparison()));
}
