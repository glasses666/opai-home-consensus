import { useEffect, useState } from 'react';
import './home-preview.css';
import './home-glass.css';
import RoomletStoryMedia from './RoomletStoryMedia.jsx';
import AmbientHouse from './AmbientHouse.jsx';

const stories = [
  { name: '相聚，也留有余地', who: '01 / 客餐厅', quote: '父母偶尔来住，孩子每天都在长大。', title: '让相聚的座位，\n和奔跑的空间共存。', text: '一张餐桌、一条动线，背后是不同家人的生活。把需求放进同一个空间，看见调整，也看见彼此的理由。', position: 'center 85%' },
  { name: '陪孩子慢慢长大', who: '02 / 成长空间', quote: '今天想在地上玩，明天需要一张书桌。', title: '不只为今天设计，\n也给明天留一点空间。', text: '玩耍、阅读、独处，房间会随生活改变。先保留重要的空间，再一起讨论那些可以慢慢发生的变化。', position: 'left top' },
  { name: '把不同，安放在一起', who: '03 / 主卧', quote: '一个人想要更多收纳，一个人想要更少压迫。', title: '不是谁退让一步，\n而是一起找到另一种可能。', text: '把模糊的感受变成看得见的选择。比较调整、说出理由，保留仍有分歧的地方，不让 AI 替家人做决定。', position: 'left bottom' },
];

const DEFAULT_GLASS = { blur: 2, width: 75, height: 95, tint: 54 };

export default function HomePreview() {
  const [active, setActive] = useState(0);
  const glass = DEFAULT_GLASS;
  const [loading, setLoading] = useState(false);
  const [showLoadingText, setShowLoadingText] = useState(false);
  const finish = () => setLoading(false);
  useEffect(() => {
    document.title = 'AI 家装设计 · 欧派共创空间';
  }, []);
  useEffect(() => {
    if (!loading) return;
    setShowLoadingText(false);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { finish(); return; }
    const timer = setTimeout(finish, 12000);
    const labelTimer = setTimeout(() => setShowLoadingText(true), 3000);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { clearTimeout(timer); clearTimeout(labelTimer); document.body.style.overflow = previous; };
  }, [loading]);
  const story = stories[active];
  return <div className="home-art" data-page="home" style={{ '--glass-blur': `${glass.blur}px`, '--glass-width': `${glass.width}%`, '--glass-height': `${glass.height}%`, '--glass-tint': glass.tint / 100 }}>
    {loading && <div className="home-intro" role="status" aria-label="正在准备首页">
      <video autoPlay muted playsInline onError={finish} onEnded={finish} onTimeUpdate={e => { if (e.currentTarget.currentTime >= 8) finish(); }} src="/assets/hero/oppein-intro-v14.mp4" />
      {showLoadingText && <p className="home-intro-loading"><span>正在加载</span></p>}
      <button onClick={finish}>进入首页 </button>
    </div>}
    <div className="ha-page-reveal" data-visible={!loading} inert={loading ? true : undefined}>
      <header className="ha-nav"><a href="/" className="ha-brand"><strong>OPPEIN<span> / </span></strong><span>欧派共创空间</span></a><nav aria-label="首页导航"><a href="#story">家的可能</a><a href="#method">如何共创</a><a href="/projects">我的设计</a></nav><a className="ha-nav-cta" href="/projects/new/details/start">开始设计 </a></header>
      <main>
        <section className="ha-hero">
          <div className="ha-hero-copy"><h1>让 AI 设计<span>你的家。</span></h1><p className="ha-lead">从你的生活需要，开始推敲家的每一处。</p><div className="ha-actions"><a className="ha-button" href="/projects/new/details/start">开始我的设计</a></div></div>
          <AmbientHouse suspended={loading} />
        </section>
        <section className="ha-statement"><span className="ha-eyebrow">DESIGNED AROUND YOUR LIFE</span><h2>不只换一种风格，<br />更让空间适合你。</h2><p>动线、收纳，和未来的生活。<br />让 AI 把你的需求，转成看得见的设计。</p></section>
        <section className="ha-story" id="story"><header><p className="ha-eyebrow">ONE FAMILY. MANY POSSIBILITIES.</p><h2>家，容得下不同。</h2><div className="ha-tabs" role="tablist" aria-label="家庭故事">{stories.map((item, i) => <button key={item.name} role="tab" aria-selected={i === active} aria-controls="home-story-panel" id={`home-story-tab-${i}`} onClick={() => setActive(i)} onKeyDown={e => { if (['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) { e.preventDefault(); const next = e.key === 'Home' ? 0 : e.key === 'End' ? 2 : (i + (e.key === 'ArrowRight' ? 1 : 2)) % 3; setActive(next); document.getElementById(`home-story-tab-${next}`)?.focus(); } }}>{item.name}</button>)}</div></header><div className="ha-story-panel" id="home-story-panel" role="tabpanel" aria-labelledby={`home-story-tab-${active}`}>
          <RoomletStoryMedia key={`media-${active}`} scene={['living', 'growing', 'together'][active]} />
          <article key={active}><span className="ha-eyebrow">{story.who}</span><blockquote>“{story.quote}”</blockquote><h3>{story.title}</h3><p>{story.text}</p><a className="ha-text-link" href="/projects?project=demo">进入示例项目 </a><span className="ha-story-number">0{active + 1}<small> / 03</small></span></article></div></section>
        <section className="ha-method" id="method"><div><p className="ha-eyebrow">FROM FLOOR PLAN TO YOUR HOME</p><h2>不必先学会设计，<br />先说说你的生活。</h2></div><ol>{[['带上户型与想法','提供户型、生活习惯和风格偏好，为 AI 设计建立起点。'],['让设计变得可见','查看空间方案，用自然语言提出调整，比较变化与修改理由。'],['也邀请家人参与','需要时邀请家人表达意见，保留分歧，一起确认喜欢的方案。']].map(([title,text],i)=><li key={title}><span>0{i+1}</span><h3>{title}</h3><p>{text}</p></li>)}</ol></section>
        <section className="ha-closing"><p className="ha-eyebrow">YOUR NEXT CHAPTER</p><h2>家的下一种可能，<br />从一句话开始。</h2><a className="ha-button" href="/projects/new/details/start">一起设计我们的家 </a><p className="ha-boundary">当前为概念产品体验。空间方案需专业设计师复核，不替代施工、报价或生产审核。</p></section>
      </main><footer className="ha-footer"><a className="ha-brand" href="/">欧派共创空间</a><span>元界视创 · AI 家装共识体验</span><button onClick={() => { setLoading(true); window.scrollTo({top:0,behavior:'instant'}); }}>重看开场</button></footer>
    </div>
  </div>;
}
