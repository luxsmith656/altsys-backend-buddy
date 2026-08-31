import { Capacitor } from '@capacitor/core';
import { Geolocation, type PositionOptions } from '@capacitor/geolocation';

export type PlatformWatchId = number | string;

const isNativeIOS = () => Capacitor.getPlatform() === 'ios';

async function ensureIOSPermission() {
  const current = await Geolocation.checkPermissions();
  const status = current.location === 'prompt' || current.location === 'prompt-with-rationale'
    ? (await Geolocation.requestPermissions()).location
    : current.location;
  if (status !== 'granted') throw new Error('Location permission is required for hike tracking.');
}

function toBrowserPosition(position: {
  timestamp: number;
  coords: {
    latitude: number;
    longitude: number;
    accuracy: number;
    altitude: number | null;
    altitudeAccuracy: number | null | undefined;
    speed: number | null;
    heading: number | null;
  };
}): GeolocationPosition {
  return {
    timestamp: position.timestamp,
    coords: {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      altitude: position.coords.altitude,
      altitudeAccuracy: position.coords.altitudeAccuracy ?? null,
      speed: position.coords.speed,
      heading: position.coords.heading,
      toJSON: () => position.coords,
    },
    toJSON: () => position,
  } as GeolocationPosition;
}

function toBrowserError(error: unknown): GeolocationPositionError {
  const message = error instanceof Error ? error.message : String(error ?? 'Unable to read device location.');
  return { code: 2, message, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError;
}

export function canUsePlatformGeolocation() {
  return isNativeIOS() || Boolean(typeof navigator !== 'undefined' && navigator.geolocation);
}

export async function getCurrentPlatformPosition(
  success: PositionCallback,
  error: PositionErrorCallback,
  options: PositionOptions,
) {
  if (!isNativeIOS()) {
    if (!navigator.geolocation) throw new Error('Geolocation not supported on this device.');
    navigator.geolocation.getCurrentPosition(success, error, options);
    return;
  }
  try {
    await ensureIOSPermission();
    success(toBrowserPosition(await Geolocation.getCurrentPosition(options)));
  } catch (reason) {
    error(toBrowserError(reason));
  }
}

export async function watchPlatformPosition(
  success: PositionCallback,
  error: PositionErrorCallback,
  options: PositionOptions,
): Promise<PlatformWatchId> {
  if (!isNativeIOS()) {
    if (!navigator.geolocation) throw new Error('Geolocation not supported on this device.');
    return navigator.geolocation.watchPosition(success, error, options);
  }
  await ensureIOSPermission();
  return Geolocation.watchPosition(options, (position, reason) => {
    if (position) success(toBrowserPosition(position));
    else if (reason) error(toBrowserError(reason));
  });
}

export async function clearPlatformWatch(watchId: PlatformWatchId) {
  if (isNativeIOS()) {
    await Geolocation.clearWatch({ id: String(watchId) });
    return;
  }
  navigator.geolocation?.clearWatch(Number(watchId));
}
