import { Capacitor, registerPlugin } from '@capacitor/core';

export type NativeTrailMode = 'hike' | 'route';

export interface NativeTrailPoint {
  sessionId: string;
  mode: NativeTrailMode;
  lat: number;
  lng: number;
  alt?: number;
  accuracy?: number;
  speed?: number;
  heading?: number | null;
  ts: number;
  provider?: string;
}

interface BackgroundTrailRecorderPlugin {
  start(options: { sessionId: string; mode: NativeTrailMode }): Promise<{ active: boolean; sessionId: string; mode: NativeTrailMode }>;
  stop(): Promise<{ active: boolean }>;
  status(): Promise<{ active: boolean; sessionId?: string | null; mode?: NativeTrailMode | null }>;
  getPoints(options: { sessionId: string }): Promise<{ points: NativeTrailPoint[] }>;
  clear(options: { sessionId: string }): Promise<{ cleared: boolean }>;
}

const BackgroundTrailRecorder = registerPlugin<BackgroundTrailRecorderPlugin>('BackgroundTrailRecorder');

export function canUseNativeBackgroundRecorder() {
  return Capacitor.getPlatform() === 'android';
}

export async function startNativeTrailRecording(sessionId: string, mode: NativeTrailMode) {
  if (!canUseNativeBackgroundRecorder()) return false;
  await BackgroundTrailRecorder.start({ sessionId, mode });
  return true;
}

export async function stopNativeTrailRecording() {
  if (!canUseNativeBackgroundRecorder()) return false;
  await BackgroundTrailRecorder.stop();
  return true;
}

export async function getNativeTrailPoints(sessionId: string) {
  if (!canUseNativeBackgroundRecorder()) return [] as NativeTrailPoint[];
  const result = await BackgroundTrailRecorder.getPoints({ sessionId });
  return Array.isArray(result.points) ? result.points : [];
}

export async function clearNativeTrailPoints(sessionId: string) {
  if (!canUseNativeBackgroundRecorder()) return false;
  await BackgroundTrailRecorder.clear({ sessionId });
  return true;
}

