import test from 'node:test';
import assert from 'node:assert/strict';
import { VoiceTurnTimer, formatDiagnosticTiming } from './voicePerformance';

test('VoiceTurnTimer records stage intervals correctly', () => {
  const timer = new VoiceTurnTimer('turn-1');
  timer.markSpeechFinalized(1000);
  timer.markRequestDispatched(1050);
  timer.markTextReceived(1250);
  timer.markAudioPlaybackStarted(1500);

  const metrics = timer.getMetrics();
  assert.equal(metrics.turnId, 'turn-1');
  assert.equal(metrics.recognitionToDispatchMs, 50);
  assert.equal(metrics.dispatchToTextMs, 200);
  assert.equal(metrics.textToAudioMs, 250);
  assert.equal(metrics.totalToAudioMs, 500);
});

test('formatDiagnosticTiming generates concise diagnostic string without logging private data', () => {
  const timer = new VoiceTurnTimer('test-turn');
  timer.markSpeechFinalized(100);
  timer.markRequestDispatched(120);
  timer.markTextReceived(320);
  timer.markAudioPlaybackStarted(750);

  const formatted = formatDiagnosticTiming(timer.getMetrics());
  assert.ok(formatted.includes('Speech->Text:'));
  assert.ok(formatted.includes('Total to Ear: 650ms'));
  // Ensure no sensitive content leaks
  assert.ok(!formatted.includes('api_key'));
  assert.ok(!formatted.includes('token'));
});
