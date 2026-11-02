export interface PrivacyPreferenceShape {
  autoLocationEnabled: boolean;
  rememberLocationAcrossSessions: boolean;
  saveFavoriteCities: boolean;
  allowVoiceAnalytics: boolean;
  temperatureUnit: 'C' | 'F';
}

export const GUEST_PRIVACY_PREFERENCES_KEY = 'rodex_atmos_preferences';

export function parseGuestPrivacyPreferences<T extends PrivacyPreferenceShape>(
  raw: string | null | undefined,
  defaults: T
): T {
  const fallback = { ...defaults };
  if (!raw) return fallback;

  try {
    const parsed = JSON.parse(raw) as Partial<PrivacyPreferenceShape> | null;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback;

    return {
      ...fallback,
      autoLocationEnabled: typeof parsed.autoLocationEnabled === 'boolean'
        ? parsed.autoLocationEnabled : fallback.autoLocationEnabled,
      rememberLocationAcrossSessions: typeof parsed.rememberLocationAcrossSessions === 'boolean'
        ? parsed.rememberLocationAcrossSessions : fallback.rememberLocationAcrossSessions,
      saveFavoriteCities: typeof parsed.saveFavoriteCities === 'boolean'
        ? parsed.saveFavoriteCities : fallback.saveFavoriteCities,
      allowVoiceAnalytics: typeof parsed.allowVoiceAnalytics === 'boolean'
        ? parsed.allowVoiceAnalytics : fallback.allowVoiceAnalytics,
      temperatureUnit: parsed.temperatureUnit === 'F' || parsed.temperatureUnit === 'C'
        ? parsed.temperatureUnit : fallback.temperatureUnit
    };
  } catch {
    return fallback;
  }
}

export function readGuestPrivacyPreferences<T extends PrivacyPreferenceShape>(defaults: T): T {
  try {
    if (typeof window === 'undefined') return { ...defaults };
    return parseGuestPrivacyPreferences(
      window.localStorage.getItem(GUEST_PRIVACY_PREFERENCES_KEY),
      defaults
    );
  } catch {
    return { ...defaults };
  }
}

export function writeGuestPrivacyPreferences(preferences: PrivacyPreferenceShape): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(GUEST_PRIVACY_PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    throw new Error('Unable to save privacy preferences on this device. Check browser storage permissions and try again.');
  }
}
