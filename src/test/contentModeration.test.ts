import { describe, expect, it } from 'vitest';
import { containsProfanity } from '@/lib/contentModeration';

describe('content moderation', () => {
  it('blocks profanity in user-authored text', () => {
    expect(containsProfanity('Please explain the trail safely.')).toBe(false);
    expect(containsProfanity('That is f.u.c.k')).toBe(true);
    expect(containsProfanity('Putang ina')).toBe(true);
  });

  it('does not reject normal words that only contain unrelated letters', () => {
    expect(containsProfanity('The guide is helpful and the route is clear.')).toBe(false);
  });
});
