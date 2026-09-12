import type { CSSProperties } from 'react';
import sprite from '@/assets/kali-ai.png';
import type { KaliExpression } from '@/lib/kaliContext';
import './kali-avatar.css';

const POSITION: Record<KaliExpression, string> = {
  alert: '80% 50%',
  review: '20% 100%',
  map: '100% 0%',
  happy: '0% 0%',
  thinking: '20% 50%',
  listening: '40% 0%',
  explaining: '100% 50%',
  celebrating: '80% 0%',
  encouraging: '0% 100%',
  reassuring: '40% 100%',
};

interface KaliAvatarProps {
  expression: KaliExpression;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  activity?: 'idle' | 'listening' | 'thinking' | 'speaking';
  animated?: boolean;
}

export default function KaliAvatar({ expression, size = 'md', className = '', activity = 'idle', animated = true }: KaliAvatarProps) {
  const sizeClass = size === 'sm' ? 'h-10 w-10' : size === 'lg' ? 'h-20 w-20' : 'h-14 w-14';
  const style: CSSProperties = {
    backgroundImage: `url(${sprite})`,
    backgroundPosition: POSITION[expression],
    backgroundRepeat: 'no-repeat',
    backgroundSize: '600% 300%',
  };

  return (
    <div
      role="img"
      aria-label={`Kali ${expression} expression`}
      data-activity={activity}
      data-animated={animated}
      className={`kali-avatar shrink-0 overflow-hidden rounded-2xl border border-primary/30 bg-secondary/40 shadow-inner ${sizeClass} ${className}`}
    >
      <span key={expression} className="kali-portrait" style={style} />
    </div>
  );
}
