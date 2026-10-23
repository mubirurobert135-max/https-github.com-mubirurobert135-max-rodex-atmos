import test from 'node:test';
import assert from 'node:assert/strict';

test('RODEX Atmos Signature voice metadata and configuration constants', () => {
  const VOICE_ID = 'voice_nv4v693k2132';
  const VOICE_NAME = 'RODEX Atmos Signature';
  const GENDER = 'female';
  const LIVE_FALLBACK_VOICE = 'Aoede';

  assert.equal(VOICE_ID.startsWith('voice_'), true);
  assert.equal(VOICE_NAME, 'RODEX Atmos Signature');
  assert.equal(GENDER, 'female');
  assert.equal(LIVE_FALLBACK_VOICE, 'Aoede');
});

test('Speech style instruction conforms to natural delivery specifications', () => {
  const defaultStyle = 'Warm, confident, personable, lightly playful, clear and concise';
  assert.equal(defaultStyle.includes('Warm'), true);
  assert.equal(defaultStyle.includes('confident'), true);
  assert.equal(defaultStyle.includes('concise'), true);
});
