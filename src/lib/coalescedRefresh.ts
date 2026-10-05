/** Batch realtime bursts and allow only one refresh in flight, with a trailing refresh. */
export function coalescedRefresh(refresh: () => Promise<unknown>, delay = 750, onError: (error: unknown) => void = console.error) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let pending = false;
  let disposed = false;
  const schedule = () => {
    if (disposed) return;
    pending = true;
    if (timer || running) return;
    timer = setTimeout(async () => {
      timer = undefined;
      pending = false;
      running = true;
      try { await refresh(); } catch (error) { if (!disposed) onError(error); }
      finally {
        running = false;
        if (pending && !disposed) schedule();
      }
    }, delay);
  };
  return { schedule, dispose: () => { disposed = true; pending = false; clearTimeout(timer); } };
}
