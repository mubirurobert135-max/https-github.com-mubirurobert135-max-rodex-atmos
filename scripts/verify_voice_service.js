import assert from 'node:assert/strict';

const baseUrl = process.env.ATMOS_BASE_URL || 'http://127.0.0.1:3000';
const requestTimeoutMs = 35000;

async function getJson(path, init) {
  const response = await fetch(new URL(path, baseUrl), {
    ...init,
    signal: init?.signal || AbortSignal.timeout(requestTimeoutMs)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(path + ' returned HTTP ' + response.status + ': ' + (data.message || data.error || 'request failed'));
  }
  return data;
}

const [status, signature] = await Promise.all([
  getJson('/api/ai/live-status'),
  getJson('/api/ai/voice-signature')
]);

assert.equal(signature.gender, 'female', 'Atmos should be configured with a feminine voice profile');
assert.equal(signature.liveVoice, 'Laomedeia', 'Live mode should use the upbeat feminine voice');
assert.equal(signature.ttsModel, 'gemini-3.8-flash-lite-tts', 'TTS should use the current fast voice model');
assert.ok(typeof signature.id === 'string' && signature.id.startsWith('voice_'), 'A configured Atmos voice ID should be present');
assert.ok(String(signature.description || '').toLowerCase().includes('upbeat'), 'Voice metadata should describe the energetic persona');
console.log('PASS voice profile: custom Atmos voice + Laomedeia Live fallback + Flash-Lite TTS.');

if (!status.supported || !status.hasServerKey) {
  console.log('SKIP live-token and generated-audio smoke tests: no GEMINI_API_KEY/API_KEY is configured for this CI run.');
  process.exit(0);
}

const tokenData = await getJson('/api/ai/live-token', { method: 'POST' });
assert.ok(typeof tokenData.token === 'string' && tokenData.token.length > 10, 'Live API should return an ephemeral session token');
assert.equal(tokenData.model, 'gemini-3.8-live');
console.log('PASS live voice token: Gemini returned an ephemeral token without exposing the server key.');

const speech = await getJson('/api/ai/synthesize-speech', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    text: "Hey, I'm Atmos. Your day, your forecast, your vibe. Tell me what you need, and let's make today a little easier.",
    style: 'Bright, warm, feminine, upbeat and expressive; brisk conversational pace, crisp articulation, lively inflection and a playful spark; never flat or sleepy.'
  }),
  signal: AbortSignal.timeout(requestTimeoutMs)
});

assert.ok(typeof speech.audio === 'string' && speech.audio.length > 0, 'Configured TTS must return audio data');
assert.ok(typeof speech.voiceName === 'string' && speech.voiceName.length > 0, 'TTS must report the voice actually used');
const audioBuffer = Buffer.from(speech.audio, 'base64');
assert.ok(audioBuffer.length > 1000, 'Synthesized audio should contain usable audio bytes');
if (String(speech.mimeType || '').includes('wav')) {
  assert.equal(audioBuffer.toString('ascii', 0, 4), 'RIFF', 'WAV output must contain a RIFF header');
  assert.equal(audioBuffer.toString('ascii', 8, 12), 'WAVE', 'WAV output must contain a WAVE header');
}
console.log('PASS generated voice audio: ' + speech.voiceName + ', ' + speech.mimeType + ', ' + audioBuffer.length + ' bytes, TTS ' + (speech.latencyMs ?? 'unknown') + 'ms.');
