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
  it('carries the visible reminder into a typed chat follow-up', () => {
    const listener = vi.fn();
    window.addEventListener('open-global-ai-assistant', listener);
    render(<KaliContextPanel role="hiker" insights={[insight]} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Reply to Kali reminder' }), { target: { value: 'Will we still hike together?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reply to Kali' }));
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({
      prompt: 'Will we still hike together?',
      guidance: [{ title: insight.title, message: insight.message }],
    });
    window.removeEventListener('open-global-ai-assistant', listener);
  });
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

  it('dismisses the current reminder and removes the launcher until context changes', () => {
    render(<KaliContextPanel role="hiker" insights={[insight]} />);
    fireEvent.click(screen.getByRole('button', { name: /dismiss kali reminder/i }));

    expect(screen.queryByText('Two guides cover the front and back.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /open kali guidance/i })).not.toBeInTheDocument();
  });

  it('acknowledges only the reminder whose OK button was pressed', () => {
    const second: KaliInsight = {
      ...insight,
      id: 'booking-reminder',
      kind: 'booking-reminder',
      severity: 'info',
      title: 'Booking reminder',
      message: 'Your booking is tomorrow.',
    };
    render(<KaliContextPanel role="hiker" insights={[insight, second]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge Two-guide safety plan' }));

    expect(screen.queryByText('Two guides cover the front and back.')).not.toBeInTheDocument();
    expect(screen.getByText('Your booking is tomorrow.')).toBeVisible();
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

  it('shows every current notice in the open panel', () => {
    const second: KaliInsight = {
      ...insight,
      id: 'minor-review',
      kind: 'minor-review',
      severity: 'high',
      title: 'Minor safety check',
      message: 'Required documents must be reviewed.',
    };

    render(<KaliContextPanel role="hiker" insights={[insight, second]} />);

    expect(screen.getByText('Two guides cover the front and back.')).toBeVisible();
    expect(screen.getByText('Required documents must be reviewed.')).toBeVisible();
  });

  it('offers a direct link to the minor requirements section', () => {
    const target = document.createElement('section');
    target.id = 'minor-requirements';
    document.body.appendChild(target);
    const scrollIntoView = vi.fn();
    target.scrollIntoView = scrollIntoView;

    render(<KaliContextPanel role="hiker" insights={[{ ...insight, kind: 'minor-review', title: 'Minor safety check' }]} />);
    fireEvent.click(screen.getByRole('link', { name: /view minor requirements/i }));

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
    target.remove();
  });

  it('only shows the two highest-priority notices in the stacked panel', () => {
    const third: KaliInsight = {
      ...insight,
      id: 'booking-reminder',
      kind: 'booking-reminder',
      severity: 'info',
      title: 'Booking reminder',
      message: 'Your booking is tomorrow.',
    };

    render(<KaliContextPanel role="hiker" insights={[insight, { ...insight, id: 'minor-review', kind: 'minor-review', severity: 'high', title: 'Minor safety check', message: 'Bring documents.' }, third]} />);

    expect(screen.getByText('Two guides cover the front and back.')).toBeVisible();
    expect(screen.getByText('Bring documents.')).toBeVisible();
    expect(screen.queryByText('Your booking is tomorrow.')).not.toBeInTheDocument();
  });

  it('renders weather prediction metrics and opens the forecast modal on click', () => {
    const weatherInsightItem: KaliInsight = {
      id: 'weather',
      kind: 'weather',
      severity: 'high',
      expression: 'alert',
      title: 'Strong weather warning',
      message: 'Strong weather risk is expected for September 23 (Severe Thunderstorm).',
      meta: {
        rainProbability: 85,
        minTempC: 23,
        maxTempC: 31,
        precipitationMm: 14,
        condition: 'Severe Thunderstorm with Rain Gusts',
        category: 'thunderstorm',
        badgeLabel: '⚡ Thunderstorm Warning',
        headline: 'Lightning Hazard on Exposed Ridge & Summit',
        trailImpact: 'Summit grassland ridge is exposed. Red clay turns into slick mud.',
        safetyAdvice: 'Ascend early before midday convective storms form.',
        locationCitation: 'Mt. Kalisungan, Laguna (14.1475°N, 121.3454°E · 760m)',
        sourceUrl: 'https://www.mountain-forecast.com/locations/Mount-Kalisungan',
      },
    };

    render(<KaliContextPanel role="hiker" insights={[weatherInsightItem]} />);

    // Renders the quick metrics in the card
    expect(screen.getByText(/85% Rain/i)).toBeInTheDocument();
    expect(screen.getByText(/23°–31°C/i)).toBeInTheDocument();
    expect(screen.getByText(/14 mm/i)).toBeInTheDocument();

    // Has button to view the actual weather prediction
    const viewButton = screen.getByRole('button', { name: /view mt\. kalisungan weather prediction/i });
    expect(viewButton).toBeInTheDocument();

    // Click button to open full prediction modal
    fireEvent.click(viewButton);

    // Modal opens showing the full Mt. Kalisungan forecast prediction
    expect(screen.getByText(/Mt\. Kalisungan Weather Prediction/i)).toBeInTheDocument();
    expect(screen.getByText(/Mountain Weather Forecast/i)).toBeInTheDocument();
    expect(screen.getByText(/Lightning Hazard on Exposed Ridge & Summit/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /mountain-forecast\.com/i })).toHaveAttribute(
      'href',
      'https://www.mountain-forecast.com/locations/Mount-Kalisungan',
    );
  });
});
