import { useEffect, useRef, useState } from 'react';
import './roomlet-story.css';

const scenes = {
  living: { label: '客餐厅', version: 'sway-5' },
  growing: { label: '儿童房', version: 'home-1' },
  together: { label: '主卧', version: 'home-2-grounded' },
};

export default function RoomletStoryMedia({ scene = 'living' }) {
  const name = scenes[scene] ? scene : 'living';
  const { label, version } = scenes[name];
  const poster = `/assets/rooms/roomlet-${name}-local.jpg?v=${version}`;
  const host = useRef(null), canvas = useRef(null);
  const [status, setStatus] = useState('poster');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const abort = new AbortController();
    let runtime, loading = false, visible = false, dead = false, timer;
    setStatus('poster');
    const fail = () => {
      if (dead) return;
      clearTimeout(timer); abort.abort(); runtime?.dispose(); runtime = null;
      setStatus('fallback');
    };
    const update = async () => {
      runtime?.setActive(visible && !document.hidden && !preference.matches);
      if (!visible || document.hidden || preference.matches || loading || runtime || abort.signal.aborted) return;
      loading = true;
      timer = setTimeout(fail, 15000);
      try {
        const { loadRoomletScene, createRoomletRuntime } = await import('./roomlet-runtime.mjs');
        abort.signal.throwIfAborted();
        const data = await loadRoomletScene(`/assets/rooms/runtime-v1/${name}.bin`, abort.signal);
        const instance = await createRoomletRuntime(canvas.current, data, { sceneName: name, signal: abort.signal, onError: fail });
        if (dead || abort.signal.aborted) { instance.dispose(); return; }
        runtime = instance; clearTimeout(timer); setStatus('ready');
        runtime.setActive(visible && !document.hidden && !preference.matches);
      } catch { fail(); }
    };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); }, { threshold: 0.15 });
    observer.observe(host.current);
    const element = canvas.current;
    const contextLost = event => { event.preventDefault(); fail(); };
    element.addEventListener('webglcontextlost', contextLost);
    preference.addEventListener('change', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      dead = true;
      clearTimeout(timer); abort.abort(); observer.disconnect();
      element.removeEventListener('webglcontextlost', contextLost);
      runtime?.dispose();
      preference.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [name, attempt]);
  return <figure ref={host} className={`ha-roomlet-media ${status === 'ready' ? 'is-ready' : ''}`} data-scene={name} data-status={status}>
    <img src={poster} alt={`石质小房间中的${label}布局`} loading="lazy" />
    <canvas key={`${name}-${attempt}`} ref={canvas} role="img" aria-label={`${label}布局调整循环演示`} />
    {status === 'fallback' && <button className="ha-roomlet-retry" type="button" onClick={() => setAttempt(value => value + 1)}>重试动态预览</button>}
    <figcaption>布局变化演示 · 非实时生成</figcaption>
  </figure>;
}
