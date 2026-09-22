import { describe, it, expect } from 'vitest';
import {
  interpretKalisunganWeather,
  MT_KALISUNGAN_COORDS,
} from '@/lib/kalisunganWeather';

describe('Mt. Kalisungan Weather Service', () => {
  it('correctly targets Mt. Kalisungan in Laguna, Philippines', () => {
    expect(MT_KALISUNGAN_COORDS.lat).toBeCloseTo(14.1475, 4);
    expect(MT_KALISUNGAN_COORDS.lng).toBeCloseTo(121.3454, 4);
    expect(MT_KALISUNGAN_COORDS.province).toBe('Laguna');
    expect(MT_KALISUNGAN_COORDS.country).toBe('Philippines');
    expect(MT_KALISUNGAN_COORDS.elevationMeters).toBe(760);
    expect(MT_KALISUNGAN_COORDS.summitPeakMeters).toBe(629);
  });

  it('identifies thunderstorms and warns of lightning on the exposed summit and ridge', () => {
    const result = interpretKalisunganWeather(95, 80, 29, 15);
    expect(result.category).toBe('thunderstorm');
    expect(result.advisory.level).toBe('danger');
    expect(result.advisory.badgeLabel).toContain('Thunderstorm');
    expect(result.advisory.trailImpact).toContain('629m');
    expect(result.advisory.trailImpact.toLowerCase()).toContain('lightning');
    expect(result.advisory.safetyAdvice.toLowerCase()).toContain('descend');
  });

  it('identifies mountain fog and warns of obscured visibility', () => {
    const result = interpretKalisunganWeather(45, 10, 24, 0);
    expect(result.category).toBe('fog');
    expect(result.advisory.level).toBe('caution');
    expect(result.advisory.badgeLabel).toContain('Fog');
    expect(result.advisory.trailImpact.toLowerCase()).toContain('visibility');
    expect(result.advisory.safetyAdvice.toLowerCase()).toContain('guide');
  });

  it('identifies heavy rain and warns of slick volcanic clay on Lamot trails', () => {
    const result = interpretKalisunganWeather(65, 90, 26, 18);
    expect(result.category).toBe('rain');
    expect(result.condition).toContain('Heavy');
    expect(result.advisory.level).toBe('danger');
    expect(result.advisory.trailImpact.toLowerCase()).toContain('clay');
  });

  it('safely maps any anomalous snow codes to realistic tropical downpours in Laguna', () => {
    // WMO 71 is snow; in tropical Laguna this must never say "Snow"
    const result = interpretKalisunganWeather(71, 75, 27, 8);
    expect(result.category).toBe('rain');
    expect(result.condition.toLowerCase()).not.toContain('snow');
    expect(result.condition.toLowerCase()).toContain('rain');
  });

  it('flags high heat warning for clear days >= 32°C on unshaded cogon grass ridge', () => {
    const result = interpretKalisunganWeather(0, 5, 34, 0);
    expect(result.category).toBe('clear');
    expect(result.advisory.level).toBe('caution');
    expect(result.advisory.badgeLabel).toContain('High Heat');
    expect(result.advisory.safetyAdvice).toContain('05:00 AM');
    expect(result.advisory.safetyAdvice).toContain('2.5L');
  });

  it('marks mild cloudy mountain days as safe with standard hydration', () => {
    const result = interpretKalisunganWeather(2, 10, 27, 0);
    expect(result.category).toBe('cloudy');
    expect(result.advisory.level).toBe('safe');
    expect(result.advisory.badgeLabel).toContain('Mild');
  });
});
