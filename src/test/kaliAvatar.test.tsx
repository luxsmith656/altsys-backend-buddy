import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import KaliAvatar from '@/components/kali/KaliAvatar';

describe('Kali expressions', () => {
  it('changes the portrait and activity when Kali starts thinking', () => {
    const { rerender } = render(<KaliAvatar expression="review" activity="idle" />);
    const review = screen.getByRole('img').querySelector('.kali-portrait')?.getAttribute('style');
    rerender(<KaliAvatar expression="thinking" activity="thinking" />);
    expect(screen.getByLabelText('Kali thinking expression')).toHaveAttribute('data-activity', 'thinking');
    expect(screen.getByRole('img').querySelector('.kali-portrait')?.getAttribute('style')).not.toBe(review);
  });
  it('keeps old message portraits still when animation is disabled', () => {
    render(<KaliAvatar expression="happy" animated={false} />);
    expect(screen.getByRole('img')).toHaveAttribute('data-animated', 'false');
  });
});
