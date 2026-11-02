import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGuestPrivacyPreferences, type PrivacyPreferenceShape } from './privacyPreferences';

const defaults: PrivacyPreferenceShape = {
  autoLocationEnabled: true,
  rememberLocationAcrossSessions: true,
  saveFavoriteCities: true,
  allowVoiceAnalytics: false,
  temperatureUnit: 'C'
};

test('returns defaults when no guest preferences have been saved', () => {
  assert.deepEqual(parseGuestPrivacyPreferences(null, defaults), defaults);
});

test('loads valid guest preferences and preserves unspecified defaults', () => {
  assert.deepEqual(parseGuestPrivacyPreferences(JSON.stringify({
    autoLocationEnabled: false,
    temperatureUnit: 'F'
  }), defaults), {
    ...defaults,
    autoLocationEnabled: false,
    temperatureUnit: 'F'
  });
});

test('ignores invalid fields and malformed JSON safely', () => {
  assert.deepEqual(parseGuestPrivacyPreferences(JSON.stringify({
    autoLocationEnabled: 'false',
    rememberLocationAcrossSessions: false,
    temperatureUnit: 'K'
  }), defaults), {
    ...defaults,
    rememberLocationAcrossSessions: false
  });
  assert.deepEqual(parseGuestPrivacyPreferences('{broken', defaults), defaults);
  assert.deepEqual(parseGuestPrivacyPreferences(JSON.stringify(null), defaults), defaults);
});
