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

describe('resolveVoicePrerequisites', () => {
  test('stops a microphone stream that arrives after token creation fails', async () => {
    const microphone = deferred<{ stopped: number }>();
    const token = Promise.reject(new Error('token unavailable'));
    const disposed: number[] = [];

    const result = resolveVoicePrerequisites(
      microphone.promise,
      token,
      (stream) => { stream.stopped += 1; disposed.push(stream.stopped); }
    );

    await expect(result).rejects.toThrow('token unavailable');
    const lateStream = { stopped: 0 };
    microphone.resolve(lateStream);
    await Promise.resolve();
    await Promise.resolve();

    expect(lateStream.stopped).toBe(1);
    expect(disposed).toEqual([1]);
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
    await expect(result).rejects.toThrow('token rejected');
    expect(stream.stopped).toBe(1);
  });

  test('keeps both resources when microphone and token succeed', async () => {
    const stream = { stopped: 0 };
    const [microphone, token] = await resolveVoicePrerequisites(
      Promise.resolve(stream),
      Promise.resolve('ephemeral-token'),
      (value) => { value.stopped += 1; }
    );

    expect(microphone).toBe(stream);
    expect(token).toBe('ephemeral-token');
    expect(stream.stopped).toBe(0);
  });
});
