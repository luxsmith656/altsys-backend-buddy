import { describe, expect, it } from 'vitest';
import { getKaliExpression, getKaliQuickReplies } from '@/lib/kaliPersonality';

describe('Kali context presentation', () => {
  it('prioritizes danger even when a reply also contains congratulations', () => {
    expect(getKaliExpression('Well done, but a storm warning means you should reschedule.')).toBe('alert');
  });
  it('uses reassurance for unavailable information and explanation for guide requirements', () => {
    expect(getKaliExpression('Sorry, live weather is unavailable.')).toBe('reassuring');
    expect(getKaliExpression('You need two guides because your group has six people.')).toBe('explaining');
    expect(getKaliExpression('Congratulations, you completed your hike!')).toBe('celebrating');
  });
  it('offers guide work and emergency monitoring instead of booking prompts to staff', () => {
    expect(getKaliQuickReplies('guide')).toContain('How do I accept an assignment?');
    expect(getKaliQuickReplies('mdrrmo')).toContain('Explain last-known locations');
    expect(getKaliQuickReplies('hiker')).toContain('Help me plan my hike');
  });
});
