import type { BookingMeta } from '../../../src/types/index.ts';

/** Parse booking notes as JSON BookingMeta. Falls back gracefully. */
export function parseMeta(notes: string | null | undefined): BookingMeta {
  if (!notes) return {};
  try {
    const parsed = JSON.parse(notes);
    if (typeof parsed === 'object' && parsed !== null) return parsed as BookingMeta;
    return { userNotes: String(notes) };
  } catch {
    return { userNotes: notes };
  }
}

/** Serialise BookingMeta back to a JSON string for storage. */
export function encodeMeta(meta: BookingMeta): string {
  return JSON.stringify(meta);
}
