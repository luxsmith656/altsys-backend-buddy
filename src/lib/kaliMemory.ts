const MEMORY_PREFIX = 'kali-memory:v1:';
const MEMORY_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_MESSAGES = 40;
const MAX_CONTENT_LENGTH = 4000;

export interface KaliMemoryMessage {
  role: 'user' | 'assistant';
  content: string;
  at: number;
}

interface StoredKaliMemory {
  expiresAt: number;
  messages: KaliMemoryMessage[];
}

function storageKey(userId: string): string {
  return `${MEMORY_PREFIX}${userId}`;
}

function getStorage(storage?: Storage): Storage | null {
  if (storage) return storage;
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function parseStoredMemory(raw: string | null, now: number): KaliMemoryMessage[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Partial<StoredKaliMemory>;
    if (!Number.isFinite(parsed.expiresAt) || (parsed.expiresAt as number) <= now || !Array.isArray(parsed.messages)) {
      return [];
    }
    return parsed.messages
      .filter((message): message is KaliMemoryMessage => (
        Boolean(message)
        && (message.role === 'user' || message.role === 'assistant')
        && typeof message.content === 'string'
        && message.content.trim().length > 0
        && Number.isFinite(message.at)
      ))
      .map((message) => ({
        role: message.role,
        content: message.content.slice(0, MAX_CONTENT_LENGTH),
        at: message.at,
      }))
      .slice(-MAX_MESSAGES);
  } catch {
    return [];
  }
}

/** Load only the signed-in account's short-lived Kali conversation. */
export function loadKaliMemory(userId: string, now = Date.now(), storage?: Storage): KaliMemoryMessage[] {
  if (!userId.trim()) return [];
  const target = getStorage(storage);
  if (!target) return [];
  const key = storageKey(userId);
  let raw: string | null = null;
  try {
    raw = target.getItem(key);
  } catch {
    return [];
  }
  const messages = parseStoredMemory(raw, now);
  if (!messages.length && raw) {
    try { target.removeItem(key); } catch { /* restricted storage */ }
  }
  return messages;
}

/** Persist a bounded conversation for 24 hours; no guest conversation is stored. */
export function saveKaliMemory(
  userId: string,
  messages: Array<Pick<KaliMemoryMessage, 'role' | 'content'>>,
  now = Date.now(),
  storage?: Storage,
): void {
  if (!userId.trim()) return;
  const target = getStorage(storage);
  if (!target) return;
  const compact: KaliMemoryMessage[] = messages
    .filter((message) => (
      (message.role === 'user' || message.role === 'assistant')
      && typeof message.content === 'string'
      && message.content.trim().length > 0
    ))
    .slice(-MAX_MESSAGES)
    .map((message) => ({
      role: message.role,
      content: message.content.slice(0, MAX_CONTENT_LENGTH),
      at: now,
    }));
  if (!compact.length) {
    try { target.removeItem(storageKey(userId)); } catch { /* restricted storage */ }
    return;
  }
  try {
    target.setItem(storageKey(userId), JSON.stringify({
      expiresAt: now + MEMORY_TTL_MS,
      messages: compact,
    } satisfies StoredKaliMemory));
  } catch {
    // Private browsing and quota limits must never break the chat.
  }
}

export function clearKaliMemory(userId: string, storage?: Storage): void {
  if (!userId.trim()) return;
  try { getStorage(storage)?.removeItem(storageKey(userId)); } catch { /* restricted storage */ }
}

export const KALI_MEMORY_TTL_HOURS = 24;
