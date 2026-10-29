import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ATMOS_SIGNATURE_VOICE_ID,
  ATMOS_SIGNATURE_VOICE_NAME,
  ATMOS_SIGNATURE_GENDER,
  ATMOS_SIGNATURE_TTS_MODEL,
  ATMOS_SIGNATURE_LIVE_VOICE,
  ATMOS_SIGNATURE_STYLE,
  ATMOS_SIGNATURE_AUDITION_URL,
  ATMOS_SIGNATURE_METADATA
} from './voiceSignature';

test('RODEX Atmos Signature voice metadata and configuration constants', () => {
  assert.equal(ATMOS_SIGNATURE_VOICE_ID, 'voice_nv4v693k2132');
  assert.equal(ATMOS_SIGNATURE_VOICE_NAME, 'RODEX Atmos Signature');
  assert.equal(ATMOS_SIGNATURE_GENDER, 'female');
  assert.equal(ATMOS_SIGNATURE_TTS_MODEL, 'gemini-3.8-flash-lite-tts');
  assert.equal(ATMOS_SIGNATURE_LIVE_VOICE, 'Laomedeia');
  assert.equal(ATMOS_SIGNATURE_AUDITION_URL, '/atmos-signature-audition.wav');
});

test('RODEX Atmos Signature metadata structure matches API contract', () => {
  assert.equal(ATMOS_SIGNATURE_METADATA.id, 'voice_nv4v693k2132');
  assert.equal(ATMOS_SIGNATURE_METADATA.displayName, 'RODEX Atmos Signature');
  assert.equal(ATMOS_SIGNATURE_METADATA.gender, 'female');
  assert.equal(ATMOS_SIGNATURE_METADATA.hasAuditionSample, true);
  assert.equal(ATMOS_SIGNATURE_METADATA.auditionUrl, '/atmos-signature-audition.wav');
});

test('Speech style instruction conforms to natural delivery specifications', () => {
  assert.equal(ATMOS_SIGNATURE_STYLE.includes('warm'), true);
  assert.equal(ATMOS_SIGNATURE_STYLE.includes('brisk conversational pace'), true);
  assert.equal(ATMOS_SIGNATURE_STYLE.includes('expressive'), true);
});
