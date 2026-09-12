import { useEffect, useState } from 'react';

const labels = { synced: '已同步到飞书', pending: '正在同步到飞书', failed: '飞书同步暂未完成', not_submitted: '确认方案后，交给飞书协作' };

export default function FeishuDelivery({ versionId, enabled = false }) {
  const [delivery, setDelivery] = useState({ status: 'not_submitted' });
  const [retrying, setRetrying] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    setDelivery({ status: 'not_submitted' });
    if (!enabled || !versionId) return;
    let alive = true;
    let timer;
    let attempts = 0;
    const load = async () => {
      try {
        const response = await fetch(`/api/projects/project-demo/feishu-delivery?versionId=${encodeURIComponent(versionId)}`, { signal: AbortSignal.timeout(12000) });
        if (!response.ok) throw new Error('unavailable');
        const data = await response.json();
        if (!alive) return;
        const value = data.feishuDelivery ?? data;
        setDelivery(value);
        if (value.status === 'pending') {
          if (++attempts < 45) timer = setTimeout(load, 2000);
          else setDelivery({ status: 'failed' });
        }
      } catch {
        if (alive) setDelivery({ status: 'failed' });
      }
    };
    load();
    return () => { alive = false; clearTimeout(timer); };
  }, [enabled, versionId, revision]);
  const retry = async () => {
    setRetrying(true);
    try {
      const response = await fetch('/api/projects/project-demo/feishu-delivery', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ versionId }), signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) throw new Error('unavailable');
      setRevision(value => value + 1);
    } catch { setDelivery({ status: 'failed' }); }
    finally { setRetrying(false); }
  };
  const safeUrl = (() => {
    try {
      const url = new URL(delivery.recordUrl);
      return url.protocol === 'https:' && /(^|\.)(feishu\.cn|larkoffice\.com)$/.test(url.hostname) && !url.username && !url.password ? url.href : null;
    } catch { return null; }
  })();
  return <section className="panel handoff-section feishu-delivery" aria-label="飞书协作交接">
    <div className="handoff-section__title"><span>飞书 · 多维表格</span><strong role="status">{labels[delivery.status] ?? labels.failed}</strong></div>
    <p>{delivery.status === 'synced'
      ? '这份方案的交接记录已写入并回读核验。设计师可在飞书中查看留痕，回到这里完成专业复核。'
      : delivery.status === 'not_submitted'
        ? '在工作台确认并提交方案后，自动保存交接记录；飞书共识秘书另行整理家庭意见。'
        : '网页交接快照仍然保留。飞书同步不会替你确认方案，也不会阻止设计师查看与复核。'}</p>
    <div className="handoff-actions">
      {delivery.status === 'synced' && safeUrl && <a className="utility-button" href={safeUrl} target="_blank" rel="noopener noreferrer">在飞书查看交接记录</a>}
      {enabled && ['failed', 'pending'].includes(delivery.status) && <button className="utility-button" type="button" onClick={retry} disabled={retrying}>{retrying ? '正在重试…' : '重试飞书同步'}</button>}
      {delivery.status === 'synced' && <small>飞书访问权限沿用原多维表格设置</small>}
    </div>
  </section>;
}
