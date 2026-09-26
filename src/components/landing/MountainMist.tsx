import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import mist from '@/assets/mountain-mist.webp';
import lowMist from '@/assets/mountain-mist-low.webp';
import './mountain-mist.css';

export default function MountainMist() {
  const scene = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!scene.current) return;
    let intersecting = false;
    const update = () => setVisible(intersecting && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => {
      intersecting = entry.isIntersecting && entry.intersectionRatio > 0.15;
      update();
    }, { threshold: [0, 0.15] });
    observer.observe(scene.current);
    document.addEventListener('visibilitychange', update);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', update);
    };
  }, []);

  return (
    <div ref={scene} className="mountain-mist" data-moving={!reducedMotion && visible} aria-hidden="true">
      <div className="mountain-mist-layer mountain-mist-far">
        <div className="mountain-mist-track">
          {[0, 1, 2, 3, 4].map((tile) => <img key={tile} src={mist} alt="" width={1440} height={720} />)}
        </div>
      </div>
      <div className="mountain-mist-layer mountain-mist-near">
        <div className="mountain-mist-track">
          {[0, 1, 2, 3, 4].map((tile) => <img key={tile} src={lowMist} alt="" width={2172} height={724} />)}
        </div>
      </div>
    </div>
  );
}
