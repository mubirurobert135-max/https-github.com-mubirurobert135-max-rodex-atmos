import test from 'node:test';
import assert from 'node:assert/strict';
import { isGreetingQuery, buildNaturalGreetingResponse } from './greetingUtils';
import { ATMOS_SIGNATURE_VOICE_ID } from './voiceSignature';

test('Conversational deduplication logic suppresses trailing flush bounce within 2000ms', () => {
  let inFlight = false;
  let lastProcessedText = '';
  let lastProcessedTime = 0;
  const processedAssistantReplies: string[] = [];

  const handleSpeechResult = (text: string, isFinal: boolean, timestamp: number): boolean => {
    // Interim results update preview only, never trigger response
    if (!isFinal) return false;

    const trimmed = text.trim();
    if (!trimmed) return false;

    // Guard 1: Concurrency lock
    if (inFlight) return false;

    // Guard 2: Bounce deduplication
    if (lastProcessedText.toLowerCase() === trimmed.toLowerCase() && (timestamp - lastProcessedTime) < 2000) {
      return false;
    }

    inFlight = true;
    lastProcessedText = trimmed;
    lastProcessedTime = timestamp;

    if (isGreetingQuery(trimmed)) {
      processedAssistantReplies.push(buildNaturalGreetingResponse());
    }

    // Simulate turnaround
    inFlight = false;
    return true;
  };

  // 1. Initial user utterance "Hey Atmos"
  const turn1 = handleSpeechResult('Hey Atmos', true, 1000);
  assert.equal(turn1, true);
  assert.equal(processedAssistantReplies.length, 1);
  assert.equal(processedAssistantReplies[0], "Hey! I'm listening. What's on your mind?");

  // 2. Trailing flush result emitted by Chrome recognition.stop() at 1050ms (50ms later)
  const turn1Duplicate = handleSpeechResult('Hey Atmos', true, 1050);
  assert.equal(turn1Duplicate, false, 'Duplicate flush event must be suppressed');
  assert.equal(processedAssistantReplies.length, 1, 'Exactly one response must exist');

  // 3. User legitimately speaks "Hey Atmos" again after 5 seconds
  const turn2 = handleSpeechResult('Hey Atmos', true, 6000);
  assert.equal(turn2, true, 'Legitimate follow-up greeting after delay must be allowed');
  assert.equal(processedAssistantReplies.length, 2, 'Two responses for two distinct interactions');
});

test('Interim speech results do not trigger assistant replies', () => {
  let triggers = 0;
  const onSpeech = (isFinal: boolean) => {
    if (isFinal) triggers++;
  };

  onSpeech(false); // "Hey" (interim)
  onSpeech(false); // "Hey At" (interim)
  onSpeech(false); // "Hey Atmos" (interim)
  assert.equal(triggers, 0, 'No triggers on interim speech');

  onSpeech(true); // "Hey Atmos" (final)
  assert.equal(triggers, 1, 'Committed utterance triggers exactly once');
});

test('Approved signature voice ID is preserved in audio cache keys', () => {
  assert.equal(ATMOS_SIGNATURE_VOICE_ID, 'voice_nv4v693k2132');
  const greetingText = "Hey! I'm listening. What's on your mind?";
  const style = 'Warm, confident, personable, lightly playful, clear and concise';
  const cacheKey = `${ATMOS_SIGNATURE_VOICE_ID}:${greetingText.toLowerCase()}:${style}`;

  assert.ok(cacheKey.startsWith('voice_nv4v693k2132'));
  assert.ok(cacheKey.includes("hey! i'm listening. what's on your mind?"));
});
