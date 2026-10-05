import { afterEach, expect, it, vi } from 'vitest';
import { coalescedRefresh } from '@/lib/coalescedRefresh';

afterEach(() => vi.useRealTimers());
it('collapses 500 GPS events and never overlaps network refreshes', async () => {
  vi.useFakeTimers();
  let release!: () => void;
  const refresh = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
  const worker = coalescedRefresh(refresh);
  for (let i = 0; i < 500; i++) worker.schedule();
  await vi.advanceTimersByTimeAsync(750);
  expect(refresh).toHaveBeenCalledTimes(1);
  for (let i = 0; i < 500; i++) worker.schedule();
  await vi.advanceTimersByTimeAsync(3000);
  expect(refresh).toHaveBeenCalledTimes(1);
  release();
  await vi.advanceTimersByTimeAsync(750);
  expect(refresh).toHaveBeenCalledTimes(2);
  worker.dispose(); release();
  worker.schedule();
  await vi.runAllTimersAsync();
  expect(refresh).toHaveBeenCalledTimes(2);
});
it('surfaces failures and cancels scheduled work on unmount', async () => {
  vi.useFakeTimers();
  const error = new Error('offline');
  const onError = vi.fn();
  const refresh = vi.fn().mockRejectedValue(error);
  const worker = coalescedRefresh(refresh, 750, onError);
  worker.schedule(); await vi.advanceTimersByTimeAsync(750);
  expect(onError).toHaveBeenCalledWith(error);
  worker.schedule(); worker.dispose(); await vi.runAllTimersAsync();
  expect(refresh).toHaveBeenCalledTimes(1);
});
