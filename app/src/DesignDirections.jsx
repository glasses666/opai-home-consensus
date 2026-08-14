import { ArrowRight, Cube, HouseLine } from '@phosphor-icons/react';
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

export function ExperienceNav({ directions = false, projects = false }) {
  return <header className="experience-nav">
    <a className="experience-brand" href="/" aria-label="回到首页"><span><HouseLine size={20} weight="regular" aria-hidden="true" /></span><strong>欧派共创空间</strong></a>
    <nav aria-label="主要导航"><a href="/" aria-current={!directions && !projects ? 'page' : undefined}>产品介绍</a>{directions && <a href="/directions" aria-current="page">设计方向</a>}{projects && <a href="/projects" aria-current="page">我的设计</a>}</nav>
    <a className="experience-nav__project" href="/projects">开始设计 <ArrowRight size={15} aria-hidden="true" /></a>
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
  return <main className="experience-shell" data-page="home">
    <ExperienceNav />
    <section className="experience-hero">
      <div className="experience-hero__scene" aria-label="AI 全屋方案生成动画">
        <video autoPlay loop muted playsInline poster="/assets/hero/villa-hero-placeholder.png">
          <source src="/assets/hero/villa-hero-loop.mp4" type="video/mp4" />
        </video>
      </div>
      <div className="experience-hero__copy">
        <p className="experience-kicker"><span><b>B</b>UILD</span><span><b>Y</b>OUR</span><span><b>D</b>REAM</span><span><b>H</b>OME</span></p>
        <h1><span>和飞书 Aily 一起</span><span>创造梦想之家。</span></h1>
        <p>Agent 读取户型与生活需求，生成符合空间规则的全屋方案。你只在关键取舍上确认，必要时再做微调。</p>
        <div className="experience-actions"><a className="experience-primary" href="/projects">开始设计</a><a className="experience-secondary" href="/projects?project=demo">查看示例项目 <ArrowRight size={16} aria-hidden="true" /></a></div>
      </div>
    </section>
    <section className="experience-how" id="how-it-works" aria-labelledby="how-title">
      <header><div><p className="experience-kicker">如何工作</p><h2 id="how-title">从生活需求，到可确认的全屋方案</h2></div><p>Aily 理解户型与需求，在规则内生成方案；你负责比较、取舍和确认。</p></header>
      <ol>
        <li><span>01</span><div><strong>说出需求</strong><p>提供户型，说清家庭成员、习惯与偏好。</p></div></li>
        <li><span>02</span><div><strong>理解空间</strong><p>Aily 解析户型，识别空间条件与生活约束。</p></div></li>
        <li><span>03</span><div><strong>生成方案</strong><p>在设计规则内生成可比较的全屋方案。</p></div></li>
        <li><span>04</span><div><strong>确认取舍</strong><p>比较差异，在关键节点作出确认。</p></div></li>
      </ol>
      <div className="experience-how__action"><a className="experience-primary" href="/projects?project=demo">体验示例项目 <ArrowRight size={17} aria-hidden="true" /></a></div>
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
