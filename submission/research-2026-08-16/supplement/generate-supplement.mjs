import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));

const sources = {
  xhsPolarized: {
    title: "小红书：吐槽一下满墙电视柜，真的别乱装呀！",
    url: "https://www.xiaohongshu.com/explore/689495ad0000000023029bbf",
  },
  xhsPositive: {
    title: "小红书：我把电视背景墙做成满墙的收纳柜",
    url: "https://www.xiaohongshu.com/explore/69298699000000001f00633a",
  },
  xhsRevisions: {
    title: "小红书：效果图已经修改了第11次了！！",
    url: "https://www.xiaohongshu.com/explore/69b3ae810000000023027f17",
  },
  xhsBusy: {
    title: "小红书：我感觉我比设计师还忙！",
    url: "https://www.xiaohongshu.com/explore/68d3634e000000000e020197",
  },
  xhsTerminate: {
    title: "小红书：修改三次，最后决定终止合作！！！",
    url: "https://www.xiaohongshu.com/explore/68a2a240000000001d0113d5",
  },
  biliProportion: {
    title: "B站：真心后悔做了满墙电视柜，坑坑坑……",
    url: "https://www.bilibili.com/video/BV1QB42167C5",
  },
  biliDevices: {
    title: "B站：满墙电视柜如何隐藏电线并容纳设备",
    url: "https://www.bilibili.com/video/BV1XUVJztEXx",
  },
};

const records = [
  { platform: "小红书", source: "公开评论", excerpt: "好收纳，客厅不显乱。", labels: ["收纳与取放", "风格与美观"], stance: "支持", url: sources.xhsPolarized.url },
  { platform: "小红书", source: "公开评论", excerpt: "开间小且考虑省钱，所以放弃满墙柜。", labels: ["空间与尺度", "成本与施工"], stance: "反对", url: sources.xhsPolarized.url },
  { platform: "小红书", source: "公开评论", excerpt: "现在很想改墙柜，但不知道还能不能改。", labels: ["沟通与版本", "成本与施工"], stance: "反对", url: sources.xhsPolarized.url },
  { platform: "小红书", source: "公开评论", excerpt: "觉得自家的满墙柜很压抑。", labels: ["空间与尺度", "风格与美观"], stance: "反对", url: sources.xhsPolarized.url },
  { platform: "小红书", source: "公开评论", excerpt: "装好后反而感觉空间更大。", labels: ["空间与尺度", "风格与美观"], stance: "支持", url: sources.xhsPolarized.url },
  { platform: "小红书", source: "公开评论", excerpt: "3.7 米开间做完有些挤，但确实能装很多东西。", labels: ["空间与尺度", "收纳与取放"], stance: "条件式", url: sources.xhsPolarized.url },
  { platform: "小红书", source: "公开评论", excerpt: "小户型也做了满墙柜，关键看实际需求。", labels: ["空间与尺度", "收纳与取放"], stance: "条件式", url: sources.xhsPolarized.url },
  { platform: "小红书", source: "公开评论", excerpt: "整体感觉还好，不认为满墙柜必然压抑。", labels: ["风格与美观"], stance: "中性", url: sources.xhsPolarized.url },
  { platform: "小红书", source: "公开笔记摘要", excerpt: "负面案例集中在体量、清洁、深柜取物和后期改造成本。", labels: ["空间与尺度", "收纳与取放", "成本与施工"], stance: "反对", url: sources.xhsPolarized.url },
  { platform: "小红书", source: "公开笔记摘要", excerpt: "正面案例强调 3.9 米开间、采光和比例足够时，满墙柜实用且显整齐。", labels: ["空间与尺度", "收纳与取放", "风格与美观"], stance: "条件式", url: sources.xhsPositive.url },
  { platform: "小红书", source: "公开笔记摘要", excerpt: "效果图改到第 11 版，客户自行制作 PPT 才能说明修改要求。", labels: ["沟通与版本"], stance: "问题", url: sources.xhsRevisions.url },
  { platform: "小红书", source: "公开笔记摘要", excerpt: "量房出图后仍有多处不满意，只能逐房间整理反馈。", labels: ["沟通与版本", "空间与尺度"], stance: "问题", url: sources.xhsBusy.url },
  { platform: "小红书", source: "公开笔记摘要", excerpt: "多次修改仍未命中风格，换设计师深入沟通后首稿更接近预期。", labels: ["沟通与版本", "风格与美观"], stance: "问题", url: sources.xhsTerminate.url },
  { platform: "B站", source: "公开评论", excerpt: "第一眼就觉得电视位置太低。", labels: ["视觉比例"], stance: "反对", url: sources.biliProportion.url },
  { platform: "B站", source: "公开评论", excerpt: "电视太低导致上柜过长，上下比例不协调。", labels: ["视觉比例"], stance: "反对", url: sources.biliProportion.url },
  { platform: "B站", source: "公开评论", excerpt: "满墙柜让注意力离开电视，观看效果下降。", labels: ["视觉比例", "设备与未来适配"], stance: "反对", url: sources.biliProportion.url },
  { platform: "B站", source: "公开评论", excerpt: "电视中心离地高度应结合观看习惯，不能只看效果图。", labels: ["视觉比例", "空间与尺度"], stance: "条件式", url: sources.biliProportion.url },
  { platform: "B站", source: "公开评论", excerpt: "下柜太小，摆件等距排列反而显得杂乱。", labels: ["收纳与取放", "风格与美观"], stance: "反对", url: sources.biliProportion.url },
  { platform: "B站", source: "公开评论", excerpt: "反弹器、铣槽和门板工艺会影响成本与耐用性。", labels: ["成本与施工"], stance: "条件式", url: sources.biliProportion.url },
  { platform: "B站", source: "公开评论", excerpt: "跨度太长存在下坠风险，结构不能只追求无把手外观。", labels: ["成本与施工", "风格与美观"], stance: "条件式", url: sources.biliProportion.url },
  { platform: "B站", source: "公开评论", excerpt: "天花不平会放大封板缝隙，找平又会增加费用。", labels: ["成本与施工", "视觉比例"], stance: "条件式", url: sources.biliProportion.url },
  { platform: "B站", source: "公开评论", excerpt: "门板损坏会很显眼，且不一定经常从电视墙取物。", labels: ["收纳与取放", "成本与施工"], stance: "反对", url: sources.biliProportion.url },
  { platform: "B站", source: "公开评论", excerpt: "有人更愿意用简单电视柜，减少复杂柜体。", labels: ["收纳与取放", "风格与美观"], stance: "反对", url: sources.biliProportion.url },
  { platform: "B站", source: "公开评论", excerpt: "有人会直接选择投影，而不是围绕电视做满墙柜。", labels: ["设备与未来适配", "风格与美观"], stance: "替代方案", url: sources.biliProportion.url },
  { platform: "B站", source: "公开评论", excerpt: "关心油漆与柜门是否同色。", labels: ["风格与美观", "成本与施工"], stance: "条件式", url: sources.biliProportion.url },
  { platform: "B站", source: "公开评论", excerpt: "纠结满墙柜还是 L 型柜，需要先看取舍。", labels: ["收纳与取放", "风格与美观"], stance: "未决", url: sources.biliDevices.url },
  { platform: "B站", source: "公开评论", excerpt: "担心未来更换电视或游戏机后原有孔位无法适配。", labels: ["设备与未来适配", "沟通与版本"], stance: "条件式", url: sources.biliDevices.url },
  { platform: "B站", source: "公开评论", excerpt: "多台主机需要隐藏线缆，但又要保留取放和散热。", labels: ["设备与未来适配", "收纳与取放"], stance: "需求", url: sources.biliDevices.url },
  { platform: "B站", source: "公开评论", excerpt: "插座如何固定在背板上，属于施工前必须确认的问题。", labels: ["设备与未来适配", "成本与施工"], stance: "需求", url: sources.biliDevices.url },
  { platform: "B站", source: "公开评论", excerpt: "电视尺寸、支架和墙体固定方式彼此约束。", labels: ["设备与未来适配", "成本与施工"], stance: "需求", url: sources.biliDevices.url },
  { platform: "B站", source: "公开评论", excerpt: "音响系统可能被柜体布局限制。", labels: ["设备与未来适配", "视觉比例"], stance: "需求", url: sources.biliDevices.url },
  { platform: "B站", source: "公开评论", excerpt: "电脑机箱没有预留位置。", labels: ["设备与未来适配", "收纳与取放"], stance: "问题", url: sources.biliDevices.url },
  { platform: "B站", source: "公开评论", excerpt: "南方回南天会放大电器散热和安全风险。", labels: ["设备与未来适配", "成本与施工"], stance: "条件式", url: sources.biliDevices.url },
  { platform: "B站", source: "公开评论", excerpt: "希望看到更多图纸，单看成片难以判断构造。", labels: ["沟通与版本", "成本与施工"], stance: "需求", url: sources.biliDevices.url },
  { platform: "B站", source: "公开评论", excerpt: "右侧线缆和设备仍显杂乱，隐藏方案并未完全解决问题。", labels: ["设备与未来适配", "风格与美观"], stance: "问题", url: sources.biliDevices.url },
  { platform: "B站", source: "公开评论", excerpt: "首先会问定制费用是否过高。", labels: ["成本与施工"], stance: "需求", url: sources.biliDevices.url },
];

const calculations = [
  { name: "V1 满墙柜", facade: 77.1, clearance: "1.65 / 1.15m", localStorage: 2.331, totalStorage: 2.331, engineering: 6.66 },
  { name: "V2 浅柜＋留白", facade: 61.7, clearance: "1.70 / 1.20m", localStorage: 1.598, totalStorage: 1.598, engineering: 5.33 },
  { name: "V3 低柜＋双侧高柜", facade: 45.8, clearance: "1.70 / 1.20m", localStorage: 1.332, totalStorage: 1.332, engineering: 3.96 },
  { name: "V3＋玄关补偿柜", facade: 45.8, clearance: "1.70 / 1.20m", localStorage: 1.332, totalStorage: 2.34, engineering: 6.84 },
];

const labelOrder = [
  "成本与施工",
  "设备与未来适配",
  "风格与美观",
  "收纳与取放",
  "空间与尺度",
  "视觉比例",
  "沟通与版本",
];

const counts = Object.fromEntries(labelOrder.map((label) => [label, 0]));
for (const record of records) {
  for (const label of record.labels) counts[label] += 1;
}

const esc = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const csvCell = (value) => `"${String(value).replaceAll('"', '""')}"`;
const csv = [
  ["编号", "平台", "来源类型", "匿名化表达", "多标签编码", "立场", "公开来源"],
  ...records.map((record, index) => [
    index + 1,
    record.platform,
    record.source,
    record.excerpt,
    record.labels.join("｜"),
    record.stance,
    record.url,
  ]),
].map((row) => row.map(csvCell).join(",")).join("\n");

const chartRows = labelOrder.map((label) => {
  const value = counts[label];
  const width = (value / Math.max(...Object.values(counts))) * 100;
  return `<div class="chart-row"><span class="chart-label">${esc(label)}</span><div class="bar-track"><span style="width:${width}%"></span></div><strong>${value}</strong></div>`;
}).join("");

const comparisonRows = calculations.map((row) => `
  <tr>
    <th>${esc(row.name)}</th>
    <td>${row.facade.toFixed(1)}%</td>
    <td>${esc(row.clearance)}</td>
    <td>${row.localStorage.toFixed(3)}m³</td>
    <td>${row.totalStorage.toFixed(3)}m³</td>
    <td>${row.engineering.toFixed(2)}m²</td>
  </tr>`).join("");

const facadeBars = calculations.slice(0, 3).map((row, index) => `
  <div class="metric-row">
    <span>${esc(row.name)}</span>
    <div class="metric-track"><i class="metric-c${index + 1}" style="width:${row.facade}%"></i></div>
    <strong>${row.facade.toFixed(1)}%</strong>
  </div>`).join("");

const sourceList = Object.values(sources).map((source, index) => `
  <li><span>${index + 1}</span><a href="${esc(source.url)}">${esc(source.title)}</a></li>`).join("");

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>欧派 AI 家装共识层｜补充材料</title>
  <style>
    :root { --ink:#171918; --muted:#5e6662; --paper:#f7f6f1; --green:#1f6a50; --lime:#b8d95b; --red:#c1493d; --blue:#2c66a0; --yellow:#f0c552; --line:#d8d8cf; }
    * { box-sizing:border-box; }
    html, body { margin:0; padding:0; background:#d8d8d2; color:var(--ink); font-family:"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif; letter-spacing:0; }
    body { counter-reset:page; }
    .sheet { counter-increment:page; position:relative; width:297mm; height:210mm; margin:12px auto; overflow:hidden; background:var(--paper); padding:12mm 14mm 11mm; page-break-after:always; }
    .sheet:last-child { page-break-after:auto; }
    .kicker { display:flex; align-items:center; gap:9px; margin:0 0 7px; color:var(--green); font-size:12px; font-weight:700; }
    .kicker::before { content:""; width:26px; height:4px; background:var(--lime); border-left:9px solid var(--green); }
    h1,h2,h3,p { margin-top:0; }
    h1 { max-width:760px; margin-bottom:9px; font-size:35px; line-height:1.14; }
    h2 { margin-bottom:8px; font-size:26px; line-height:1.2; }
    h3 { margin-bottom:5px; font-size:15px; }
    p { font-size:13px; line-height:1.58; }
    .lede { max-width:890px; color:#303633; font-size:15px; line-height:1.55; }
    .highlight { color:var(--red); }
    .footer { position:absolute; left:14mm; right:14mm; bottom:5mm; display:flex; justify-content:space-between; border-top:1px solid var(--line); padding-top:4px; color:#6d716e; font-size:9px; }
    .footer .page::after { content:counter(page); }
    .evidence-grid { display:grid; grid-template-columns:1fr 1fr; gap:13px; margin-top:11px; }
    figure { margin:0; border:1px solid var(--line); background:#fff; }
    .image-wrap { height:250px; overflow:hidden; background:#ecece7; }
    figure img { width:100%; height:100%; object-fit:cover; object-position:center; display:block; }
    .negative img { object-position:16% center; }
    .positive img { object-position:16% center; }
    figcaption { min-height:84px; padding:10px 12px; }
    figcaption strong { display:block; margin-bottom:4px; font-size:16px; }
    figcaption p { margin:0; color:var(--muted); font-size:11px; line-height:1.48; }
    .signal { display:grid; grid-template-columns:1.08fr .92fr; gap:17px; margin-top:11px; }
    .chart { padding:12px 13px; border:1px solid var(--line); background:#fff; }
    .chart-row { display:grid; grid-template-columns:125px 1fr 24px; align-items:center; gap:8px; margin:10px 0; }
    .chart-label { font-size:12px; font-weight:600; }
    .bar-track { height:16px; background:#ecece6; }
    .bar-track span { display:block; height:100%; background:linear-gradient(90deg,var(--green),var(--lime)); }
    .chart-row strong { font-size:12px; text-align:right; }
    .quote-stack { display:grid; gap:8px; }
    blockquote { margin:0; border-left:5px solid var(--yellow); background:#fff; padding:9px 11px; font-size:12px; line-height:1.45; }
    blockquote small { display:block; margin-top:4px; color:var(--muted); font-size:9px; }
    .method { margin-top:9px; padding:8px 10px; border:1px dashed #b7bbb7; color:#424744; font-size:10px; line-height:1.5; }
    .finding-strip { display:grid; grid-template-columns:repeat(3,1fr); margin-top:12px; border:1px solid var(--line); background:#fff; }
    .finding-strip div { min-height:76px; padding:10px 12px; border-right:1px solid var(--line); }
    .finding-strip div:last-child { border-right:0; }
    .finding-strip b { display:block; color:var(--red); font-size:21px; }
    .finding-strip span { font-size:10px; line-height:1.4; }
    .field-map { display:grid; grid-template-columns:repeat(4,1fr); margin-top:9px; border:1px solid var(--line); background:#fff; }
    .field-map div { min-height:74px; padding:9px 11px; border-right:1px solid var(--line); }
    .field-map div:last-child { border-right:0; }
    .field-map code { display:block; margin-bottom:5px; color:var(--blue); font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:9px; }
    .field-map b { display:block; margin-bottom:3px; font-size:11px; }
    .field-map span { color:var(--muted); font-size:9px; line-height:1.4; }
    .calc-grid { display:grid; grid-template-columns:.85fr 1.15fr; gap:15px; margin-top:10px; }
    .metric-card { border:1px solid var(--line); background:#fff; padding:11px 12px; }
    .metric-row { display:grid; grid-template-columns:120px 1fr 43px; align-items:center; gap:7px; margin:13px 0; font-size:11px; }
    .metric-track { height:19px; background:#ecece6; }
    .metric-track i { display:block; height:100%; }
    .metric-c1 { background:var(--red); }.metric-c2 { background:var(--yellow); }.metric-c3 { background:var(--green); }
    .tradeoff { display:grid; grid-template-columns:repeat(3,1fr); margin-top:10px; border:1px solid var(--line); }
    .tradeoff div { padding:9px; text-align:center; background:#fff; border-right:1px solid var(--line); }
    .tradeoff div:last-child { border-right:0; }
    .tradeoff b { display:block; font-size:18px; }
    .tradeoff span { font-size:9px; color:var(--muted); }
    table { width:100%; border-collapse:collapse; background:#fff; font-size:9px; }
    th,td { border:1px solid var(--line); padding:6px 7px; text-align:left; }
    thead th { background:#e7eee8; color:#274e3f; }
    tbody th { width:145px; }
    .warning { margin-top:8px; border-left:5px solid var(--red); background:#fff; padding:8px 10px; font-size:10px; line-height:1.5; }
    .scenario-row { display:grid; grid-template-columns:1.1fr 1fr 1fr; margin-top:10px; border:1px solid var(--line); background:#fff; }
    .scenario-row div { min-height:83px; padding:9px 11px; border-right:1px solid var(--line); }
    .scenario-row div:last-child { border-right:0; }
    .scenario-row b { display:block; margin-bottom:4px; font-size:11px; }
    .scenario-row p { margin:0; color:var(--muted); font-size:9px; line-height:1.45; }
    .scenario-row .customer { background:#eef2ea; }
    .revision-grid { display:grid; grid-template-columns:1fr 1fr; gap:11px; margin-top:8px; }
    .revision-grid .image-wrap { height:183px; }
    .revision-grid .rev1 img { object-position:70% center; }
    .revision-grid .rev2 img { object-position:73% center; }
    .revision-grid figcaption { min-height:53px; padding:7px 9px; }
    .revision-grid figcaption strong { font-size:13px; }
    .flow { display:grid; grid-template-columns:repeat(6,1fr); gap:0; margin-top:11px; border:1px solid var(--line); background:#fff; }
    .step { position:relative; min-height:83px; padding:9px 10px; border-right:1px solid var(--line); }
    .step:last-child { border-right:0; }
    .step b { display:grid; place-items:center; width:22px; height:22px; margin-bottom:5px; background:var(--ink); color:white; font-size:10px; }
    .step strong { display:block; margin-bottom:3px; font-size:10px; }
    .step span { color:var(--muted); font-size:8.5px; line-height:1.35; }
    .flow-note { margin-top:7px; padding:7px 9px; background:#eaf1ec; color:#254c3c; font-size:9px; }
    .bottom-grid { display:grid; grid-template-columns:1.05fr .95fr; gap:12px; margin-top:9px; }
    .kpi, .sources { border:1px solid var(--line); background:#fff; padding:8px 10px; }
    .kpi ul { display:grid; grid-template-columns:1fr 1fr; gap:4px 13px; margin:5px 0 0; padding-left:15px; font-size:9px; line-height:1.45; }
    .sources ol { display:grid; grid-template-columns:1fr 1fr; gap:3px 9px; margin:5px 0 0; padding:0; list-style:none; }
    .sources li { display:flex; gap:5px; min-width:0; font-size:7.5px; }
    .sources li span { color:var(--green); font-weight:700; }
    .sources a { overflow:hidden; color:#3d4641; text-decoration:none; text-overflow:ellipsis; white-space:nowrap; }
    .page.fixed::after { content:""; }
    @media print { body { background:#fff; } .sheet { margin:0; } }
    @page { size:A4 landscape; margin:0; }
  </style>
</head>
<body>
  <section class="sheet">
    <div class="kicker">企业命题补充材料 · 欧派家居</div>
    <h1>同一个满墙电视柜，为什么有人说“真香”，有人说“压抑”？</h1>
    <p class="lede">公开讨论显示，客户并不是缺少审美，而是<span class="highlight">评价高度依赖开间、采光、比例、收纳需求与后续设备</span>。一张效果图无法说明这些条件，更无法告诉客户每次改动会失去什么。</p>
    <div class="evidence-grid">
      <figure class="negative">
        <div class="image-wrap"><img src="assets/xhs-negative-full-wall.png" alt="小红书满墙电视柜负面案例截图"></div>
        <figcaption><strong>同一品类的负面体验</strong><p>公开笔记集中提到体量压迫、深柜难取物、清洁与后期改造成本。截图保留平台公开页面和互动数据，作者身份不进入分析表。</p></figcaption>
      </figure>
      <figure class="positive">
        <div class="image-wrap"><img src="assets/xhs-positive-full-wall.png" alt="小红书满墙电视柜正面案例截图"></div>
        <figcaption><strong>同一品类的正面体验</strong><p>另一案例把 3.9 米开间、采光与比例作为满意条件，强调收纳实用、视觉整齐。结论不是“满墙柜好或坏”，而是适配条件要被显式确认。</p></figcaption>
      </figure>
    </div>
    <div class="finding-strip">
      <div><b>不是二选一</b><span>用户会同时要开阔、收纳、好看和可控成本。</span></div>
      <div><b>先讲条件</b><span>开间、采光、观看高度和生活设备会改变判断。</span></div>
      <div><b>再做确认</b><span>AI 应解释取舍并冻结版本，而不是只重画一张图。</span></div>
    </div>
    <div class="footer"><span>欧派 AI 家装共识层｜公开页面取证：2026-07-16</span><span class="page">第 </span></div>
  </section>

  <section class="sheet">
    <div class="kicker">定向公开样本 · 意向编码</div>
    <h2>客户说“哪里不对”时，真正谈的是七类决策</h2>
    <p class="lede">对 ${records.length} 条公开表达做匿名化、多标签编码。最高频信号不是单一风格词，而是施工成本、设备适配、收纳、尺度与比例等相互关联的约束。</p>
    <div class="signal">
      <div class="chart">
        <h3>需求信号出现次数（多标签，合计可超过样本数）</h3>
        ${chartRows}
      </div>
      <div class="quote-stack">
        <blockquote>“3.7 米开间做完确实有点挤，但是能装很多东西。”<small>空间与尺度 ＋ 收纳与取放</small></blockquote>
        <blockquote>“这个要是换电视、换游戏机怎么办？”<small>设备与未来适配 ＋ 版本变更</small></blockquote>
        <blockquote>“效果图已经修改到第 11 次，我为设计师做了一个 PPT。”<small>沟通与版本</small></blockquote>
        <div class="method"><b>方法边界：</b>2026-07-16 使用 Agent Reach 检索小红书与 B 站公开页面，正反关键词并行，剔除广告与无关表达，保留可核验链接；该样本用于识别需求类型，不用于估计全体消费者比例。</div>
      </div>
    </div>
    <div class="finding-strip">
      <div><b>条件式偏好</b><span>客户不是固定喜欢某个方案，而是在具体房型下权衡。</span></div>
      <div><b>对象级抱怨</b><span>“压抑”会落到柜深、电视高度、上柜比例、线缆等对象。</span></div>
      <div><b>未来变更</b><span>电视、主机、音响、潮湿环境等要在确认前进入约束。</span></div>
    </div>
    <div class="field-map">
      <div><code>hardConstraints[]</code><b>不能违背</b><span>开间、通行、预算上限、潮湿环境、结构安全。</span></div>
      <div><code>softPreferences[]</code><b>仍可探索</b><span>欧式、暖光、留白、整齐感和展示偏好。</span></div>
      <div><code>futureDevices[]</code><b>提前预留</b><span>电视尺寸、主机、音响、插座、线缆与散热。</span></div>
      <div><code>confirmedObjects[]</code><b>默认不再改</b><span>已确认柜体、材质、比例及其版本号。</span></div>
    </div>
    <div class="footer"><span>样本明细另附 CSV；表达已匿名化，不保留用户名</span><span class="page">第 </span></div>
  </section>

  <section class="sheet">
    <div class="kicker">可复算方案比较 · 3.1 米客厅模拟</div>
    <h2>“更开阔、收纳不减、价格更低”不能被同时承诺</h2>
    <p class="lede">用公开案例参数和明确标注的模拟边界比较三种电视墙方案。计算不是欧派真实报价，而是演示共识层如何在客户保存改动前给出影响卡。</p>
    <div class="calc-grid">
      <div>
        <div class="metric-card">
          <h3>电视墙立面占用代理</h3>
          ${facadeBars}
        </div>
        <div class="tradeoff">
          <div><b>+50mm</b><span>柜深 350→300mm 的中央净距收益</span></div>
          <div><b>-42.9%</b><span>V3 客厅本地几何储物变化</span></div>
          <div><b>+2.7%</b><span>跨空间补偿后的工程量代理变化</span></div>
        </div>
        <div class="warning"><b>对客户怎么说：</b>V3 更开阔，但客厅本地收纳减少；若把储物补到玄关，全屋容积可恢复到基准附近，但工程量不一定更低，且取放路径发生变化。</div>
      </div>
      <div>
        <table>
          <thead><tr><th>方案</th><th>立面占用</th><th>净距 常态/展开</th><th>客厅储物</th><th>全屋储物</th><th>工程量代理</th></tr></thead>
          <tbody>${comparisonRows}</tbody>
        </table>
        <div class="metric-card" style="margin-top:9px">
          <h3>影响卡必须同时展示</h3>
          <p style="margin:0;font-size:11px">① 视觉体量与通行距离　② 本空间收纳与跨空间补偿　③ 预算区间、工期和施工复核　④ 已确认对象是否被改动　⑤ 当前版本与上一版的差异。</p>
        </div>
        <div class="method"><b>输入边界：</b>客厅进深 3.1m、电视墙宽 3.6m、满墙柜深 0.35m、沙发 1.1/1.6m；几何储物未扣板材、五金与设备位。脚本与公式见同目录计算附件。</div>
      </div>
    </div>
    <div class="scenario-row">
      <div class="customer"><b>客户只需要说一句</b><p>“我想让客厅更开阔，但收纳不能少。”</p></div>
      <div><b>AI 不直接重画</b><p>先生成 V2 与 V3 两个结构化变更，锁定已确认电视位，计算净距、储物和工程量差异。</p></div>
      <div><b>客户看到代价后确认</b><p>选择接受本地收纳减少，或把储物补偿到玄关；确认后才生成新版本并通知设计师复核。</p></div>
    </div>
    <div class="footer"><span>可复算脚本：calculations/tv-wall-comparison.mjs</span><span class="page">第 </span></div>
  </section>

  <section class="sheet">
    <div class="kicker">从反复改图到可执行共识</div>
    <h2>客户不是不愿表达，而是现有方式把解释工作推给了客户</h2>
    <div class="revision-grid">
      <figure class="rev1"><div class="image-wrap"><img src="assets/xhs-eleven-revisions.png" alt="效果图修改11次截图"></div><figcaption><strong>改到第 11 版</strong><p>客户自行制作 PPT 说明修改点。</p></figcaption></figure>
      <figure class="rev2"><div class="image-wrap"><img src="assets/xhs-customer-annotation-work.png" alt="客户自行标注设计图截图"></div><figcaption><strong>“比设计师还忙”</strong><p>客户逐房间标注和整理反馈。</p></figcaption></figure>
    </div>
    <div class="flow">
      <div class="step"><b>1</b><strong>看两个方向</strong><span>不用先填长问卷，先看有明确取舍的候选。</span></div>
      <div class="step"><b>2</b><strong>点对象短表达</strong><span>点击柜体、电视或墙面，说“这里太满”。</span></div>
      <div class="step"><b>3</b><strong>生成 JSON 差异</strong><span>区分硬约束、软偏好、已确认项和待复核项。</span></div>
      <div class="step"><b>4</b><strong>展示影响卡</strong><span>空间、收纳、预算区间、工期与施工风险。</span></div>
      <div class="step"><b>5</b><strong>确认并冻结版本</strong><span>视觉、功能和生产版本分别确认，可回退。</span></div>
      <div class="step"><b>6</b><strong>设计师复核下传</strong><span>再进入欧派既有 3D、报价、BOM 与生产系统。</span></div>
    </div>
    <div class="flow-note"><b>低成本原则：</b>飞书 Aily 负责澄清和结构化，多维表格保存对象、版本、变更与确认，工作流通知设计师；不重做欧派已有渲染、报价或生产系统。</div>
    <div class="bottom-grid">
      <div class="kpi"><h3>先用一个电视墙场景验证</h3><ul><li>首次方案到确认的轮次</li><li>设计师重复解释时长</li><li>确认后重大变更率</li><li>版本错用次数</li></ul></div>
      <div class="sources"><h3>本附件的公开来源</h3><ol>${sourceList}</ol></div>
    </div>
    <div class="footer"><span>结论：AI 不替客户做选择，而是让选择的条件、代价和版本都可见</span><span class="page">第 </span></div>
  </section>
  <script>
    const page = new URLSearchParams(location.search).get("page");
    if (page) document.querySelectorAll(".sheet").forEach((sheet, index) => {
      const visible = String(index + 1) === page;
      sheet.style.display = visible ? "block" : "none";
      if (visible) {
        const pageLabel = sheet.querySelector(".page");
        pageLabel.textContent = "第 " + page;
        pageLabel.classList.add("fixed");
      }
    });
  </script>
</body>
</html>`;

const methodology = `# 社交媒体意向分析：方法与边界

## 样本目的

这组数据用于识别客户在电视墙与全屋定制讨论中会主动提出哪些需求，不用于估计全体消费者的喜好比例。不同平台、搜索词与内容标题都会造成抽样偏差，因此附件没有给出“多少消费者喜欢满墙柜”的结论。

## 采集与编码

- 采集日期：2026-07-16。
- 工具：Agent Reach，使用 OpenCLI 的小红书与 B 站只读后端。
- 检索策略：同时使用“满墙电视柜”“收纳满意”“后悔”“效果图修改”“设计师沟通”等正反关键词。
- 清洗：剔除广告、纯表情、与家装决策无关的表达；用户名与用户 ID 不进入分析文件。
- 编码：每条表达可命中多个标签，因此图表计数之和可以超过样本数。
- 标签：${labelOrder.join("、")}。

## 可支持的判断

1. 满墙电视柜不是简单的正负偏好，而是受开间、采光、比例、收纳量和设备条件影响的条件式选择。
2. “看起来不对”通常能进一步拆成对象级问题，例如柜深、电视高度、上柜比例、插座、主机位和后期更换设备。
3. 修改轮次高并不等于客户没有想法；现有沟通方式可能要求客户自己整理 PPT、标注设计图和反复解释。
4. 因此，AI 更适合承担结构化澄清、差异计算和版本确认，而不是只做一次性生图。

## 不能支持的判断

- 不能据此声称某类方案在全国消费者中更受欢迎。
- 不能把平台互动量直接解释为购买意愿。
- 不能证明方案已降低返工率或沟通时长；这些需要企业真实试点。

样本明细见 \`社交媒体定向样本.csv\`，公开来源见 \`evidence-data.json\` 和 PDF 第 4 页。
`;

writeFileSync(path.join(root, "evidence-data.json"), JSON.stringify({ collectedAt: "2026-07-16", method: "directional-public-sample", records, counts, calculations, sources }, null, 2));
writeFileSync(path.join(root, "社交媒体定向样本.csv"), `\uFEFF${csv}\n`);
writeFileSync(path.join(root, "社交媒体意向分析-方法与边界.md"), methodology);
writeFileSync(path.join(root, "补充材料-欧派AI家装共识层.html"), html);

console.log(JSON.stringify({ records: records.length, counts, outputs: ["evidence-data.json", "社交媒体定向样本.csv", "社交媒体意向分析-方法与边界.md", "补充材料-欧派AI家装共识层.html"] }, null, 2));
