import { ArrowDown, ArrowRight, Check, Cube, HouseLine } from '@phosphor-icons/react';
import { DEFAULT_EXPERIENCE_STYLE, EXPERIENCE_STYLES, normalizeExperienceStyle } from './domain/experience-style.js';

function savedStyle() {
  if (typeof window === 'undefined') return DEFAULT_EXPERIENCE_STYLE;
  const queryStyle = normalizeExperienceStyle(new URLSearchParams(window.location.search).get('style'));
  return queryStyle ?? normalizeExperienceStyle(window.localStorage.getItem('oppein.experience-style')) ?? DEFAULT_EXPERIENCE_STYLE;
}

function DirectionPreview({ style, index }) {
  return <div className="direction-preview" data-preview-style={style.id} aria-hidden="true">
    <div className="direction-preview__index">{String(index + 1).padStart(2, '0')}</div>
    <div className="direction-preview__room"><i /><i /><i /><i /></div>
    <div className="direction-preview__agent"><span /><span /><span /></div>
  </div>;
}

function ExperienceNav({ directions = false }) {
  return <header className="experience-nav">
    <a className="experience-brand" href="/" aria-label="回到首页"><span>元</span><strong>AI 家居设计</strong></a>
    <nav aria-label="主要导航"><a href="/" aria-current={!directions ? 'page' : undefined}>产品介绍</a><a href="#how-it-works">如何工作</a><a href="/directions" aria-current={directions ? 'page' : undefined}>设计方向</a></nav>
    <a className="experience-nav__project" href="#how-it-works">开始设计 <ArrowRight size={15} aria-hidden="true" /></a>
  </header>;
}

function DirectionGrid({ currentStyle }) {
  return <div className="direction-grid">
    {EXPERIENCE_STYLES.map((style, index) => <article className="direction-card" data-style-id={style.id} key={style.id}>
      <DirectionPreview style={style} index={index} />
      <div className="direction-card__body">
        <div><span>{style.label}</span><small>{style.motion}</small></div>
        <h3>{style.headline}</h3>
        <p>{style.summary}</p>
        <footer><span><Cube size={14} aria-hidden="true" /> {style.reference}</span><a href={`/project/demo?style=${style.id}`}>{currentStyle === style.id ? '继续当前方向' : '打开可操作样机'} <ArrowRight size={14} aria-hidden="true" /></a></footer>
      </div>
    </article>)}
  </div>;
}

export function ExperienceLandingPage() {
  const currentStyle = savedStyle();
  return <main className="experience-shell" data-page="home">
    <ExperienceNav />
    <section className="experience-hero">
      <div className="experience-hero__copy">
        <h1>先让 AI 理解你的家，<br />再一起确认每个空间。</h1>
        <p>带入户型与生活需求，Agent 先生成受空间规则约束的全屋方案。你只需要在关键取舍上做决定，必要时再自己微调。</p>
        <div className="experience-actions"><a className="experience-primary" href="#how-it-works">开始设计 <ArrowDown size={17} aria-hidden="true" /></a><a className="experience-secondary" href={`/project/demo?style=${currentStyle}`}>查看示例项目 <ArrowRight size={16} aria-hidden="true" /></a></div>
        <small><Check size={13} aria-hidden="true" /> Agent 设计为主，住户调整为辅。</small>
      </div>
      <div className="experience-hero__scene" aria-label="当前项目概览">
        <div className="experience-hero__plan"><i /><i /><i /><i /><i /></div>
        <div className="experience-hero__agent"><span>AI 设计助手</span><strong>客餐厅保持开阔</strong><p>主通道约 1120 mm，收纳量不变。这一处取舍等待你确认。</p><em>每个建议都可预览、可回退</em></div>
      </div>
    </section>
    <section className="experience-how" id="how-it-works" aria-labelledby="how-title">
      <header><h2 id="how-title">从一张户型图，到全家都认可的方案。</h2><p>不需要学会专业设计软件。Agent 负责设计与检查，你负责表达生活、选择取舍。</p></header>
      <ol>
        <li><span>01</span><div><strong>带入你的家</strong><p>上传户型图，确认房间、门窗与关键尺寸。</p></div></li>
        <li><span>02</span><div><strong>Agent 生成首版方案</strong><p>结合成员、预算和偏好，先完成布局并检查动线与规则。</p></div></li>
        <li><span>03</span><div><strong>逐间查看与确认</strong><p>3D 镜头直接定位问题，说清改动、代价和未决项。</p></div></li>
      </ol>
      <div className="experience-how__action"><a className="experience-primary" href="/project/demo">先体验示例项目 <ArrowRight size={17} aria-hidden="true" /></a><span>新建项目将在下一阶段开放</span></div>
    </section>
  </main>;
}

export function ExperienceDirectionsPage() {
  const currentStyle = savedStyle();
  return <main className="experience-shell" data-page="directions">
    <ExperienceNav directions />
    <section className="direction-section" aria-labelledby="direction-title">
      <div className="direction-section__heading"><div><p className="experience-kicker">Gate 24 · presentation only</p><h2 id="direction-title">选择接下来要打磨的体验方向</h2></div><p>空间电影、智能画布与建筑索引包含辅助定位的动态反馈；减少动态偏好下会自动静止。</p></div>
      <DirectionGrid currentStyle={currentStyle} />
    </section>
    <section className="direction-boundary"><HouseLine size={22} aria-hidden="true" /><div><strong>先选气质，不重做产品</strong><p>每个样机都从 Agent 开始；住户微调只保留移动、旋转和尺寸。</p></div><a href={`/project/demo?style=${currentStyle}`}>返回 Agent 设计</a></section>
  </main>;
}
