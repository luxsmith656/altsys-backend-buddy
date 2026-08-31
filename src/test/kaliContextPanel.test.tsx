import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import KaliContextPanel from '@/components/kali/KaliContextPanel';
import type { KaliInsight } from '@/lib/kaliContext';

const insight: KaliInsight = {
  id: 'group-guidance',
  kind: 'group-guidance',
  severity: 'medium',
  expression: 'map',
  title: 'Two-guide safety plan',
  message: 'Two guides cover the front and back.',
  meta: { groupSize: 6, guidesRequired: 2 },
};

describe('KaliContextPanel', () => {
  it('renders nothing when Kali has no current guidance', () => {
    render(<KaliContextPanel role="hiker" insights={[]} />);

    expect(screen.queryByRole('button', { name: /kali guidance/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Kali context guidance' })).not.toBeInTheDocument();
  });

  it('opens the mobile Kali panel and shows the role-aware insight', () => {
    render(<KaliContextPanel role="hiker" insights={[insight]} />);

    expect(screen.getByText('Two guides cover the front and back.')).toBeVisible();
    expect(screen.getByRole('button', { name: /toggle kali guidance/i })).toHaveClass('bg-primary');
    expect(within(screen.getByRole('region', { name: 'Kali context guidance' })).getByLabelText('Kali map expression')).toBeInTheDocument();
  });

  it('can close an open panel without removing the launcher', () => {
    render(<KaliContextPanel role="hiker" insights={[insight]} />);
    fireEvent.click(screen.getByRole('button', { name: /close kali guidance/i }));

    expect(screen.queryByText('Two guides cover the front and back.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open kali guidance/i })).toBeInTheDocument();
  });

  it('opens the existing chat with a focused follow-up question', () => {
    const listener = vi.fn();
    window.addEventListener('open-global-ai-assistant', listener);
    render(<KaliContextPanel role="hiker" insights={[{ ...insight, kind: 'minor-review', title: 'Minor safety check' }]} />);

    fireEvent.click(screen.getByRole('button', { name: /ask kali in chat/i }));

    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0]?.[0] as CustomEvent<{ prompt: string }>).detail.prompt).toContain('documents');
    window.removeEventListener('open-global-ai-assistant', listener);
  });
});
