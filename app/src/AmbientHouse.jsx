import { useEffect, useRef, useState } from 'react';

// The image is the content; motion is a progressive enhancement, never a gate.
export default function AmbientHouse({ suspended = false }) {
  const video = useRef(null);
  const frame = useRef(null);
  const manualChoice = useRef(false);
  const [enabled, setEnabled] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [visibleFrame, setVisibleFrame] = useState(false);
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [motionOptIn, setMotionOptIn] = useState(false);
  const [pausedByUser, setPausedByUser] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const abandon = () => { setPlaying(false); setVisibleFrame(false); setEnabled(false); setFailed(true); };

  useEffect(() => {
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      setReduced(motion.matches);
      if (motion.matches) { setMotionOptIn(false); setPlaying(false); }
    };
    update(); motion.addEventListener('change', update);
    const connection = navigator.connection;
    const slow = connection?.saveData || ['slow-2g', '2g', '3g'].includes(connection?.effectiveType);
    const timer = !motion.matches && !slow ? setTimeout(() => { if (!manualChoice.current) setEnabled(true); }, 1200) : null;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.05 });
    observer.observe(frame.current);
    return () => { clearTimeout(timer); observer.disconnect(); motion.removeEventListener('change', update); };
  }, []);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    let cancelled = false;
    let watchdog, lastMediaTime = element.currentTime, lastProgress = performance.now();
    const update = () => {
      clearInterval(watchdog);
      if (!visible || suspended || (reduced && !motionOptIn) || pausedByUser || document.hidden) { element.pause(); return; }
      lastMediaTime = element.currentTime; lastProgress = performance.now();
      element.play().catch(() => { if (!cancelled) abandon(); });
      // Monitor the entire playback, including stalls long after the first frame.
      // Comparing changes rather than increasing time also handles loop wraparound.
      watchdog = setInterval(() => {
        const current = element.currentTime;
        if (Math.abs(current - lastMediaTime) > 0.05) {
          lastMediaTime = current; lastProgress = performance.now();
          if (!element.paused && element.readyState >= 2) { setPlaying(true); setVisibleFrame(true); }
        } else if (performance.now() - lastProgress >= 8000) {
          clearInterval(watchdog); abandon();
        }
      }, 1000);
    };
    update(); document.addEventListener('visibilitychange', update);
    return () => { cancelled = true; clearInterval(watchdog); element.pause(); document.removeEventListener('visibilitychange', update); };
  }, [enabled, visible, suspended, reduced, motionOptIn, pausedByUser, attempt]);

  const toggleMotion = () => {
    manualChoice.current = true;
    if (playing) { setPausedByUser(true); setPlaying(false); return; }
    setMotionOptIn(true); setFailed(false); setPausedByUser(false);
    // Resume a deliberately paused frame; restart failed/waiting media so the
    // same-state click cannot leave a stale play promise or decoder behind.
    if (!pausedByUser) { setVisibleFrame(false); setAttempt(value => value + 1); }
    setEnabled(true);
  };

  return <figure ref={frame} className="ha-hero-image">
    <img src="/assets/hero/house-graded-v25.jpg" alt="完整住宅设计概念" fetchPriority="high" />
    {enabled && <video key={attempt} ref={video} className="ha-background-video" data-playing={visibleFrame} preload="none" muted loop playsInline
      src="/assets/hero/house-web-v26.mp4" aria-label="房屋搭建概念动画"
      onPlaying={() => { setPlaying(true); setVisibleFrame(true); setFailed(false); }} onPause={() => setPlaying(false)}
      onWaiting={() => { setPlaying(false); setVisibleFrame(false); }} onStalled={() => { setPlaying(false); setVisibleFrame(false); }} onError={abandon} />}
    <figcaption><span>概念动画 · 非实时生成</span></figcaption>
    {!suspended && <button type="button" className="ha-motion-control" onClick={toggleMotion}>
      {playing ? '暂停背景动画' : failed ? '重试背景动画' : pausedByUser ? '继续背景动画' : '播放背景动画'}
    </button>}
  </figure>;
}
