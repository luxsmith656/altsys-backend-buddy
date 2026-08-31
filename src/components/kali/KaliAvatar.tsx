import type { CSSProperties } from 'react';
import sprite from '@/assets/kali-ai.png';
import type { KaliExpression } from '@/lib/kaliContext';

const POSITION: Record<KaliExpression, string> = {
  alert: '80% 0%',
  review: '60% 50%',
  map: '100% 0%',
  happy: '0% 0%',
  thinking: '60% 50%',
};

interface KaliAvatarProps {
  expression: KaliExpression;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export default function KaliAvatar({ expression, size = 'md', className = '' }: KaliAvatarProps) {
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
      className={`shrink-0 overflow-hidden rounded-2xl border border-primary/30 bg-secondary/40 shadow-inner ${sizeClass} ${className}`}
      style={style}
    />
  );
}
