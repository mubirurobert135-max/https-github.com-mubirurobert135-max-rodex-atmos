import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ATMOS_BROWSER_SPEECH_PITCH,
  ATMOS_BROWSER_SPEECH_RATE,
  choosePreferredAtmosVoice
} from './voicePlayback';

test('selects a named feminine English voice ahead of generic and masculine voices', () => {
  const voices = [
    { name: 'Microsoft David - English (United States)', lang: 'en-US' },
    { name: 'Google UK English Female', lang: 'en-GB' },
    { name: 'Microsoft Mark - English (United States)', lang: 'en-US' },
    { name: 'Microsoft Zira - English (United States)', lang: 'en-US' }
  ];
  assert.equal(choosePreferredAtmosVoice(voices)?.name, 'Microsoft Zira - English (United States)');
});

test('prefers natural online feminine voices over flat generic fallbacks', () => {
  const voices = [
    { name: 'English (United States)', lang: 'en-US', localService: true },
    { name: 'Microsoft Jenny Online (Natural) - English (United States)', lang: 'en-US', localService: false }
  ];
  assert.equal(choosePreferredAtmosVoice(voices)?.name, 'Microsoft Jenny Online (Natural) - English (United States)');
});

test('returns null for an empty browser voice list without crashing', () => {
  assert.equal(choosePreferredAtmosVoice([]), null);
});

test('uses energetic but still understandable browser fallback pacing', () => {
  assert.ok(ATMOS_BROWSER_SPEECH_RATE > 1);
  assert.ok(ATMOS_BROWSER_SPEECH_RATE <= 1.18);
  assert.ok(ATMOS_BROWSER_SPEECH_PITCH >= 1.05);
  assert.ok(ATMOS_BROWSER_SPEECH_PITCH <= 1.15);
});
