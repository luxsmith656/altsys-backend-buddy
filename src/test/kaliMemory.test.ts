import { beforeEach, describe, expect, it } from 'vitest';
import { clearKaliMemory, loadKaliMemory, saveKaliMemory } from '@/lib/kaliMemory';

describe('Kali conversation memory', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('restores only the signed-in account conversation within 24 hours', () => {
    saveKaliMemory('hiker-a', [
      { role: 'user', content: 'What should I pack?' },
      { role: 'assistant', content: 'Bring water and rain gear.' },
    ], 1_000);
    saveKaliMemory('hiker-b', [{ role: 'user', content: 'Different account' }], 1_000);

    expect(loadKaliMemory('hiker-a', 1_000 + 23 * 60 * 60 * 1000)).toEqual([
      { role: 'user', content: 'What should I pack?', at: 1_000 },
      { role: 'assistant', content: 'Bring water and rain gear.', at: 1_000 },
    ]);
    expect(loadKaliMemory('hiker-a', 1_000 + 23 * 60 * 60 * 1000)).not.toEqual(loadKaliMemory('hiker-b', 1_000));
  });

  it('expires the conversation after 24 hours and removes it', () => {
    saveKaliMemory('hiker-a', [{ role: 'user', content: 'Remember this briefly' }], 10_000);

    expect(loadKaliMemory('hiker-a', 10_000 + 24 * 60 * 60 * 1000)).toEqual([]);
    expect(window.localStorage.length).toBe(0);
  });

  it('bounds stored messages and supports explicit account cleanup', () => {
    saveKaliMemory('hiker-a', Array.from({ length: 45 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
      content: `message-${index}`,
    })), 20_000);

    const messages = loadKaliMemory('hiker-a', 20_001);
    expect(messages).toHaveLength(40);
    expect(messages[0].content).toBe('message-5');

    clearKaliMemory('hiker-a');
    expect(loadKaliMemory('hiker-a', 20_001)).toEqual([]);
  });
});
