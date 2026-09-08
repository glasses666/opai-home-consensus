import { Component, lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import HomePreview from './HomePreview.jsx';
import './entry.css';

const WorkbenchApp = lazy(() => import('./WorkbenchApp.jsx'));
const isHome = ['/', '/index.html'].includes(window.location.pathname);

class EntryBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <main className="entry-loading"><h1>暂时没能打开设计空间</h1><p>已保存的设计不会因此丢失。请检查网络后重试。</p><button onClick={() => window.location.reload()}>重新加载</button><a href="/">返回首页</a></main>;
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <EntryBoundary><Suspense fallback={<main className="entry-loading" role="status"><h1>正在打开设计空间</h1><p>首次进入需要加载 3D 工具，首页仍可随时返回。</p><a href="/">返回首页</a></main>}>
      {isHome ? <HomePreview /> : <WorkbenchApp />}
    </Suspense></EntryBoundary>
  </StrictMode>,
);
