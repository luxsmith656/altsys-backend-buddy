import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  addDoc: vi.fn(),
  collection: vi.fn(() => ({ path: 'notifications' })),
  getFirebaseDb: vi.fn(() => ({ name: 'test-db' })),
  isFirebaseConfigured: vi.fn(() => true),
}));

vi.mock('firebase/firestore', () => ({
  addDoc: mocks.addDoc,
  collection: mocks.collection,
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  serverTimestamp: vi.fn(() => 'server-timestamp'),
  where: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  updateDoc: vi.fn(),
  Timestamp: class Timestamp {},
}));

vi.mock('@/lib/firebase', () => ({
  getFirebaseDb: mocks.getFirebaseDb,
  isFirebaseConfigured: mocks.isFirebaseConfigured,
}));

import { createUserNotification } from '@/lib/firebase-firestore';
import { notifyUser } from '@/lib/firestoreNotifications';

describe('optional notification delivery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.addDoc.mockResolvedValue({ id: 'notification-1' });
  });

  it('does not reject a booking when the Firebase notification write fails', async () => {
    mocks.addDoc.mockRejectedValueOnce(new Error('Firestore unavailable'));

    await expect(createUserNotification('hiker-1', {
      title: 'Booking submitted',
      body: 'Pending approval',
      category: 'booking',
    })).resolves.toBeNull();
  });

  it('keeps shared notification callers non-blocking when Firebase is unavailable', async () => {
    mocks.addDoc.mockRejectedValueOnce(new Error('permission denied'));

    await expect(notifyUser('admin-1', {
      title: 'New booking',
      body: 'Review the booking',
      category: 'booking',
    })).resolves.toBeNull();
  });

  it('still returns the notification id when delivery succeeds', async () => {
    await expect(notifyUser('hiker-1', {
      title: 'Booking submitted',
      body: 'Pending approval',
    })).resolves.toBe('notification-1');
  });
});
