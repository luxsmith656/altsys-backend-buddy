import { HikeTracker } from './HikeTracker';
import type { OfflineSession } from '@/lib/offlineDb';

type ActiveTrackerOptions = {
  userId: string;
  bookingId?: string | null;
  trailZoneId?: string | null;
  serverSessionId: string;
  participantRole?: OfflineSession['participantRole'];
  locationId?: string | null;
};

let activeKey: string | null = null;
let activeTracker: HikeTracker | null = null;
let activeStart: Promise<HikeTracker> | null = null;

export async function ensureActiveHikeTracker(options: ActiveTrackerOptions) {
  const key = `${options.userId}:${options.serverSessionId}`;
  if (activeKey === key && activeTracker) return activeTracker;
  if (activeKey === key && activeStart) return activeStart;

  const previous = activeTracker;
  activeKey = key;
  activeTracker = null;
  activeStart = (async () => {
    if (previous) await previous.suspend();
    const tracker = await HikeTracker.createOrResume(options);
    await tracker.start();
    if (activeKey === key) activeTracker = tracker;
    return tracker;
  })();

  try {
    return await activeStart;
  } finally {
    if (activeKey === key) activeStart = null;
  }
}

/** Finish the locally-running tracker after staff have checked the group out. */
export async function completeActiveHikeTracker() {
  const tracker = activeTracker;
  activeTracker = null;
  activeStart = null;
  activeKey = null;
  if (tracker) await tracker.stop();
}
