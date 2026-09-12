const keyFor = (userId: string) => `mtk_seen_notifications_${userId}`;
const removedKeyFor = (userId: string) => `mtk_removed_notifications_${userId}`;

function withLegacyFirestoreAliases(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  // Older releases saved bare Firestore IDs; keep them valid after fs: namespacing.
  return [...new Set(value.filter((id): id is string => typeof id === 'string')
    .flatMap((id) => id.includes(':') ? [id] : [id, `fs:${id}`]))];
}

export function loadSeenNotificationIds(userId: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(keyFor(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string[];
    return withLegacyFirestoreAliases(parsed);
  } catch {
    return [];
  }
}

export function saveSeenNotificationIds(userId: string, ids: string[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(keyFor(userId), JSON.stringify(ids));
}

export function markNotificationSeen(userId: string, id: string): void {
  const prev = loadSeenNotificationIds(userId);
  if (prev.includes(id)) return;
  saveSeenNotificationIds(userId, [...prev, id]);
}

export function loadRemovedNotificationIds(userId: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(removedKeyFor(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string[];
    return withLegacyFirestoreAliases(parsed);
  } catch {
    return [];
  }
}

export function saveRemovedNotificationIds(userId: string, ids: string[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(removedKeyFor(userId), JSON.stringify(ids));
}

export function markNotificationRemoved(userId: string, id: string): void {
  const prev = loadRemovedNotificationIds(userId);
  if (prev.includes(id)) return;
  saveRemovedNotificationIds(userId, [...prev, id]);
}
