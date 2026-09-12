import { useEffect, useRef, useState } from 'react';

// The image is the content; motion is a progressive enhancement, never a gate.
export default function AmbientHouse({ suspended = false }) {
  const video = useRef(null);
  const frame = useRef(null);
  const [enabled, setEnabled] = useState(true);
  const [visibleFrame, setVisibleFrame] = useState(false);
  const [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(false);
  const abandon = () => { setVisibleFrame(false); setEnabled(false); };

  useEffect(() => {
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      setReduced(motion.matches);
    };
    update(); motion.addEventListener('change', update);
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.05 });
    observer.observe(frame.current);
    return () => { observer.disconnect(); motion.removeEventListener('change', update); };
  }, []);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    let cancelled = false;
    let watchdog, lastMediaTime = element.currentTime, lastProgress = performance.now();
    const update = () => {
      clearInterval(watchdog);
      if (!visible || suspended || reduced || document.hidden) { element.pause(); return; }
      lastMediaTime = element.currentTime; lastProgress = performance.now();
      element.play().catch(() => { if (!cancelled) abandon(); });
      // Monitor the entire playback, including stalls long after the first frame.
      // Comparing changes rather than increasing time also handles loop wraparound.
      watchdog = setInterval(() => {
        const current = element.currentTime;
        if (Math.abs(current - lastMediaTime) > 0.05) {
          lastMediaTime = current; lastProgress = performance.now();
          if (!element.paused && element.readyState >= 2) setVisibleFrame(true);
        } else if (performance.now() - lastProgress >= 8000) {
          clearInterval(watchdog); abandon();
        }
      }, 1000);
    };
    update(); document.addEventListener('visibilitychange', update);
    return () => { cancelled = true; clearInterval(watchdog); element.pause(); document.removeEventListener('visibilitychange', update); };
  }, [enabled, visible, suspended, reduced]);

  return <figure ref={frame} className="ha-hero-image">
    <img src="/assets/hero/house-graded-v25.jpg" alt="完整住宅设计概念" fetchPriority="high" />
    {enabled && <video ref={video} className="ha-background-video" data-playing={visibleFrame} autoPlay preload="auto" muted loop playsInline
      src="/assets/hero/house-graded-v25.mp4" aria-label="房屋搭建概念动画"
      onPlaying={() => setVisibleFrame(true)} onWaiting={() => setVisibleFrame(false)} onStalled={() => setVisibleFrame(false)} onError={abandon} />}
    <figcaption><span>概念动画 · 非实时生成</span></figcaption>
  </figure>;
}
