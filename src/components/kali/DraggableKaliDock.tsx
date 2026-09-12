import { useEffect, useRef, useState, type ReactNode } from 'react';

type Position = { x: number; y: number };

export default function DraggableKaliDock({ children, aboveNavigation = false }: { children: ReactNode; aboveNavigation?: boolean }) {
  const dock = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointer: number; start: Position; origin: Position } | null>(null);
  const suppressClick = useRef(false);
  const [position, setPosition] = useState<Position | null>(null);
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight });
  const constrain = (point: Position) => ({
    x: Math.max(8, Math.min(point.x, window.innerWidth - 64)),
    y: Math.max(72, Math.min(point.y, window.innerHeight - 72)),
  });
  useEffect(() => {
    const resize = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
      setPosition(current => current ? constrain(current) : null);
    };
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  const right = position !== null && position.x > viewport.width / 2;
  const down = position !== null && position.y < viewport.height / 2;
  return <div ref={dock} className="kali-movable-dock" data-right={right} data-down={down} data-above-navigation={aboveNavigation}
    style={position ? { left: position.x, top: position.y, bottom: 'auto' } : undefined}
    onPointerDown={event => {
      if (event.button !== 0 || !(event.target as HTMLElement).closest('[data-kali-drag-handle]')) return;
      const box = dock.current!.getBoundingClientRect();
      suppressClick.current = false;
      drag.current = { pointer: event.pointerId, start: { x: event.clientX, y: event.clientY }, origin: { x: box.x, y: box.y } };
      (event.target as HTMLElement).closest<HTMLElement>('[data-kali-drag-handle]')!.setPointerCapture(event.pointerId);
    }}
    onPointerMove={event => {
      const current = drag.current;
      if (!current || current.pointer !== event.pointerId) return;
      const dx = event.clientX - current.start.x;
      const dy = event.clientY - current.start.y;
      if (!suppressClick.current && Math.hypot(dx, dy) < 8) return;
      suppressClick.current = true;
      setPosition(constrain({ x: current.origin.x + dx, y: current.origin.y + dy }));
    }}
    onPointerUp={event => {
      // Keep tap targeting on the button; only a real drag consumes its following click.
      const handle = event.target as HTMLElement;
      if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
      drag.current = null;
    }}
    onPointerCancel={() => { drag.current = null; suppressClick.current = true; }}
    onClickCapture={event => {
      if (!suppressClick.current) return;
      event.preventDefault(); event.stopPropagation(); suppressClick.current = false;
    }}
    onKeyDown={event => {
      if (!(event.target as HTMLElement).matches('[data-kali-drag-handle]') || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(event.key)) return;
      event.preventDefault();
      if (event.key === 'Home') { setPosition(null); return; }
      const box = dock.current!.getBoundingClientRect();
      setPosition(constrain({ x: box.x + (event.key === 'ArrowRight' ? 24 : event.key === 'ArrowLeft' ? -24 : 0), y: box.y + (event.key === 'ArrowDown' ? 24 : event.key === 'ArrowUp' ? -24 : 0) }));
    }}>{children}</div>;
}
