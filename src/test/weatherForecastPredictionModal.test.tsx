import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import WeatherForecastPredictionModal from '@/components/weather/WeatherForecastPredictionModal';

describe('WeatherForecastPredictionModal', () => {
  it('renders weather prediction details without any raw API code', () => {
    const handleOpenChange = vi.fn();
    render(
      <WeatherForecastPredictionModal
        open={true}
        onOpenChange={handleOpenChange}
        selectedDate="2026-09-23"
        condition="Severe Thunderstorm with Rain Gusts"
        category="thunderstorm"
        minTempC={23}
        maxTempC={31}
        rainProbability={85}
        precipitationMm={14.2}
        headline="Lightning Hazard on Exposed Ridge & Summit"
        trailImpact="Volcanic red clay turns into slippery slick mud."
        safetyAdvice="Ascend early before midday convective storms form."
        badgeLabel="⚡ Thunderstorm Warning"
        locationCitation="Mt. Kalisungan, Laguna (14.1475°N, 121.3454°E · 760m)"
        forecastDays={[
          {
            date: '2026-09-23',
            condition: 'Severe Thunderstorm with Rain Gusts',
            category: 'thunderstorm',
            minTempC: 23,
            maxTempC: 31,
            rainProbability: 85,
            precipitationMm: 14.2,
          },
          {
            date: '2026-09-24',
            condition: 'Rain Showers',
            category: 'rain',
            minTempC: 24,
            maxTempC: 30,
            rainProbability: 55,
            precipitationMm: 4.5,
          },
        ]}
      />,
    );

    // Weather prediction headers
    expect(screen.getByText(/Mt\. Kalisungan Weather Prediction/i)).toBeInTheDocument();
    expect(screen.getByText(/Mountain Weather Forecast/i)).toBeInTheDocument();

    // Weather metrics
    expect(screen.getByText('Severe Thunderstorm with Rain Gusts')).toBeInTheDocument();
    expect(screen.getByText('23° – 31°C')).toBeInTheDocument();
    expect(screen.getByText('85%')).toBeInTheDocument();
    expect(screen.getByText('14.2 mm')).toBeInTheDocument();

    // Trail impact & safety advice
    expect(screen.getByText(/Volcanic red clay turns into slippery slick mud\./i)).toBeInTheDocument();
    expect(screen.getByText(/Ascend early before midday convective storms form\./i)).toBeInTheDocument();

    // Multi-day strip allows switching days
    expect(screen.getByText(/16-Day Weather Prediction Outlook/i)).toBeInTheDocument();

    // External real forecast links (no developer API code)
    const mountainForecastLink = screen.getByRole('link', { name: /mountain-forecast\.com/i });
    expect(mountainForecastLink).toHaveAttribute('href', 'https://www.mountain-forecast.com/locations/Mount-Kalisungan');
  });

  it('switches the active day prediction when a date in the multi-day strip is clicked', () => {
    const handleOpenChange = vi.fn();
    render(
      <WeatherForecastPredictionModal
        open={true}
        onOpenChange={handleOpenChange}
        selectedDate="2026-09-23"
        condition="Severe Thunderstorm with Rain Gusts"
        category="thunderstorm"
        minTempC={23}
        maxTempC={31}
        rainProbability={85}
        forecastDays={[
          {
            date: '2026-09-23',
            condition: 'Severe Thunderstorm',
            category: 'thunderstorm',
            minTempC: 23,
            maxTempC: 31,
            rainProbability: 85,
          },
          {
            date: '2026-09-24',
            condition: 'Clear Sky & Sunshine',
            category: 'clear',
            minTempC: 22,
            maxTempC: 29,
            rainProbability: 10,
          },
        ]}
      />,
    );

    // Click the second day button
    const dayButtons = screen.getAllByRole('button');
    const day2Button = dayButtons.find((btn) => btn.textContent?.includes('10% rain'));
    expect(day2Button).toBeDefined();
    if (day2Button) {
      fireEvent.click(day2Button);
      expect(screen.getByText('Clear Sky & Sunshine')).toBeInTheDocument();
      expect(screen.getByText('22° – 29°C')).toBeInTheDocument();
      expect(screen.getByText('10%')).toBeInTheDocument();
    }
  });
});
