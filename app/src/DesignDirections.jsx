import { ArrowRight, Cube, HouseLine, Sparkle } from '@phosphor-icons/react';
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

function ExperienceNav({ directions = false, currentStyle }) {
  return <header className="experience-nav">
    <a className="experience-brand" href="/" aria-label="回到项目入口"><span>元</span><strong>家庭共创设计器</strong></a>
    <nav aria-label="主要导航"><a href="/">项目入口</a><a href="/directions" aria-current={directions ? 'page' : undefined}>设计方向</a></nav>
    <a className="experience-nav__project" href={`/project/demo?style=${currentStyle}`}>继续设计 <ArrowRight size={15} aria-hidden="true" /></a>
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
  const current = EXPERIENCE_STYLES.find((style) => style.id === currentStyle);
  return <main className="experience-shell" data-page="home">
    <ExperienceNav currentStyle={currentStyle} />
    <section className="experience-hero">
      <div className="experience-hero__copy">
        <p className="experience-kicker"><Sparkle size={15} aria-hidden="true" /> Agent-first home design</p>
        <h1>先把生活说清楚，<br />再让空间成形。</h1>
        <p>Agent 先理解家庭、生成受规则约束的方案；住户只在必要时微调，最后把一个共同确认的版本交给设计师。</p>
        <div className="experience-actions"><a className="experience-primary" href={`/project/demo?style=${currentStyle}`}>与 Agent 继续设计 <ArrowRight size={17} aria-hidden="true" /></a><a className="experience-secondary" href="/directions">查看四个设计方向</a></div>
        <small>住户只做位置、方向和尺寸微调；其余设计变化由 Agent 提案。</small>
      </div>
      <div className="experience-hero__scene" aria-label="当前项目概览">
        <div className="experience-hero__plan"><i /><i /><i /><i /><i /></div>
        <div className="experience-hero__agent"><span>Agent 正在设计</span><strong>主卧减少拥挤感，收纳不变</strong><p>已找到一个合法方向，等待你查看预览。</p><em>当前风格 · {current?.label}</em></div>
      </div>
    </section>
    <section className="direction-section" aria-labelledby="direction-title">
      <div className="direction-section__heading"><div><p className="experience-kicker">Gate 24 · shared product, four atmospheres</p><h2 id="direction-title">同一套产品，四种体验气质</h2></div><p>四个方向共享同一住宅、Agent、版本和家庭状态；切换只改变视觉表达，不会复制业务或改写 scene。</p></div>
      <DirectionGrid currentStyle={currentStyle} />
    </section>
  </main>;
}

export function ExperienceDirectionsPage() {
  const currentStyle = savedStyle();
  return <main className="experience-shell" data-page="directions">
    <ExperienceNav directions currentStyle={currentStyle} />
    <section className="direction-section" aria-labelledby="direction-title">
      <div className="direction-section__heading"><div><p className="experience-kicker">Gate 24 · presentation only</p><h2 id="direction-title">选择接下来要打磨的体验方向</h2></div><p>空间电影、智能画布与建筑索引包含辅助定位的动态反馈；减少动态偏好下会自动静止。</p></div>
      <DirectionGrid currentStyle={currentStyle} />
    </section>
    <section className="direction-boundary"><HouseLine size={22} aria-hidden="true" /><div><strong>先选气质，不重做产品</strong><p>每个样机都从 Agent 开始；住户微调只保留移动、旋转和尺寸。</p></div><a href={`/project/demo?style=${currentStyle}`}>返回 Agent 设计</a></section>
  </main>;
}
