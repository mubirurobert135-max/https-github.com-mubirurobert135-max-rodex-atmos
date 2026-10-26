import test from 'node:test';
import assert from 'node:assert/strict';
import { VoiceTurnTimer, formatDiagnosticTiming } from './voicePerformance';

test('VoiceTurnTimer records complete T0 to T7 stage intervals correctly', () => {
  const timer = new VoiceTurnTimer('turn-1');
  timer.markSpeechFinalized(1000); // T0
  timer.markRequestDispatched(1030); // T1
  timer.markTextReceived(1180, { totalMs: 120, aiMs: 1, ttsMs: 0 }); // T3 & T2
  timer.markTextRendered(1190); // T4
  timer.markSynthesisRequested(1195); // T5
  timer.markAudioAvailable(1210); // T6
  timer.markAudioPlaybackStarted(1220); // T7

  const metrics = timer.getMetrics();
  assert.equal(metrics.turnId, 'turn-1');
  assert.equal(metrics.recognitionToDispatchMs, 30); // T1 - T0
  assert.equal(metrics.clientToServerMs, 150); // T3 - T1
  assert.equal(metrics.serverProcessingMs, 120); // T2
  assert.equal(metrics.timeToVisibleTextMs, 190); // T4 - T0
  assert.equal(metrics.synthesisDurationMs, 15); // T6 - T5
  assert.equal(metrics.audioDeliveryToPlayMs, 10); // T7 - T6
  assert.equal(metrics.totalEndToEndMs, 220); // T7 - T0
});

test('formatDiagnosticTiming generates concise diagnostic string with milestones and no leaks', () => {
  const timer = new VoiceTurnTimer('test-turn');
  timer.markSpeechFinalized(100);
  timer.markRequestDispatched(120);
  timer.markTextReceived(320, { totalMs: 150 });
  timer.markTextRendered(330);
  timer.markAudioAvailable(400);
  timer.markAudioPlaybackStarted(420);

  const formatted = formatDiagnosticTiming(timer.getMetrics());
  assert.ok(formatted.includes('[RODEX Voice Timing - test-turn]'));
  assert.ok(formatted.includes('STT Finalize: 20ms'));
  assert.ok(formatted.includes('Speech->Text: 200ms'));
  assert.ok(formatted.includes('Text Visible: 230ms'));
  assert.ok(formatted.includes('Total to Ear: 320ms'));

  // Ensure no sensitive credentials or keys leak
  assert.ok(!formatted.includes('api_key'));
  assert.ok(!formatted.includes('token'));
  assert.ok(!formatted.includes('password'));
});
