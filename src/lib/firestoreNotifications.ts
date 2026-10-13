import {
  createAppNotification,
  deleteAppNotification,
  markAppNotificationRead,
  subscribeAppNotifications,
  type AppNotification,
  type AppNotificationCategory,
} from './appNotifications';

// Compatibility names for existing callers. Delivery now uses Supabase so it
// works without a Firestore database or Firestore security rules.
export type FsNotificationCategory = AppNotificationCategory;
export type FsNotification = AppNotification;

export function subscribeUserNotifications(
  userId: string,
  cb: (items: FsNotification[]) => void,
  onError?: (error: Error) => void,
): () => void {
  return subscribeAppNotifications(userId, cb, onError);
}

export async function notifyUser(
  userId: string,
  payload: {
    title: string;
    body: string;
    category?: FsNotificationCategory;
    link?: string | null;
    bookingId?: string | null;
  },
): Promise<string | null> {
  return createAppNotification(userId, payload);
}

export async function markFsNotificationRead(id: string): Promise<void> {
  await markAppNotificationRead(id);
}

export async function deleteFsNotification(id: string): Promise<void> {
  await deleteAppNotification(id);
}
