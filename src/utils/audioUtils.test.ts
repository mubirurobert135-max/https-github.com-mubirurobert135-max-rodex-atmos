import test from 'node:test';
import assert from 'node:assert/strict';
import {
  arrayBufferToBase64,
  base64ToFloat32Array,
  floatTo16BitPCM,
  resampleAudioBuffer
} from './audioUtils';

test('encodes and decodes 16-bit little-endian PCM without clipping normal samples', () => {
  const input = new Float32Array([-1, -0.5, 0, 0.5, 1]);
  const bytes = floatTo16BitPCM(input);
  const decoded = base64ToFloat32Array(arrayBufferToBase64(bytes));

  assert.equal(bytes.byteLength, input.length * 2);
  assert.equal(decoded.length, input.length);
  assert.ok(Math.abs(decoded[0] + 1) < 0.0001);
  assert.ok(Math.abs(decoded[1] + 0.5) < 0.0001);
  assert.equal(decoded[2], 0);
  assert.ok(Math.abs(decoded[3] - 0.5) < 0.0001);
  assert.equal(decoded[4], 1);
});

test('clamps out-of-range microphone samples before PCM encoding', () => {
  const decoded = base64ToFloat32Array(arrayBufferToBase64(floatTo16BitPCM(new Float32Array([-1.5, 1.5]))));
  assert.deepEqual(Array.from(decoded), [-1, 1]);
});

test('rejects truncated odd-byte PCM instead of decoding a partial sample', () => {
  assert.equal(base64ToFloat32Array(btoa('\\x00')).length, 0);
  assert.equal(base64ToFloat32Array('').length, 0);
});

test('resamples microphone audio to the requested output sample rate', () => {
  const input = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7]);
  const output = resampleAudioBuffer(input, 48000, 16000);
  assert.equal(output.length, 3);
  assert.deepEqual(Array.from(output), [0, 3, 6]);
});

test('rejects invalid sample rates safely', () => {
  const input = new Float32Array([0, 1, 2]);
  assert.equal(resampleAudioBuffer(input, 0, 16000).length, 0);
  assert.equal(resampleAudioBuffer(input, 48000, Number.NaN).length, 0);
});
