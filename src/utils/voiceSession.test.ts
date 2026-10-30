import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveVoicePrerequisites } from './voiceSession';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test('stops a microphone stream that arrives after token creation fails', async () => {
  const microphone = deferred<{ stopped: number }>();
  const token = Promise.reject(new Error('token unavailable'));
  const disposed: number[] = [];

  const result = resolveVoicePrerequisites(
    microphone.promise,
    token,
    (stream) => { stream.stopped += 1; disposed.push(stream.stopped); }
  );

  await assert.rejects(result, /token unavailable/);
  const lateStream = { stopped: 0 };
  microphone.resolve(lateStream);
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(lateStream.stopped, 1);
  assert.deepEqual(disposed, [1]);
});

test('disposes an acquired microphone stream when its paired token fails', async () => {
  const stream = { stopped: 0 };
  let tokenReject!: (reason?: unknown) => void;
  const token = new Promise<string>((_resolve, reject) => { tokenReject = reject; });
  const result = resolveVoicePrerequisites(
    Promise.resolve(stream),
    token,
    (value) => { value.stopped += 1; }
  );

  await Promise.resolve();
  tokenReject(new Error('token rejected'));
  await assert.rejects(result, /token rejected/);
  assert.equal(stream.stopped, 1);
});

test('keeps both resources when microphone and token succeed', async () => {
  const stream = { stopped: 0 };
  const [microphone, token] = await resolveVoicePrerequisites(
    Promise.resolve(stream),
    Promise.resolve('ephemeral-token'),
    (value) => { value.stopped += 1; }
  );

  assert.equal(microphone, stream);
  assert.equal(token, 'ephemeral-token');
  assert.equal(stream.stopped, 0);
});
