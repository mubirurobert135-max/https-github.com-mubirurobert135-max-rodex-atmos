import test from 'node:test';
import assert from 'node:assert/strict';
import { createFixedWindowRateLimiter } from './rateLimiter';

test('limits individual clients, returns Retry-After and resets after a window', () => {
  let now = 0;
  const take = createFixedWindowRateLimiter(2, 5000, () => now);
  assert.deepEqual(take('A'), { allowed: true, retryAfterSeconds: 0 });
  assert.deepEqual(take('A'), { allowed: true, retryAfterSeconds: 0 });
  assert.deepEqual(take('A'), { allowed: false, retryAfterSeconds: 5 });
  now = 1000;
  assert.deepEqual(take('A'), { allowed: false, retryAfterSeconds: 4 });
  assert.deepEqual(take('B'), { allowed: true, retryAfterSeconds: 0 });
  now = 5000;
  assert.deepEqual(take('A'), { allowed: true, retryAfterSeconds: 0 });
});

test('rejects invalid rate limits', () => {
  assert.throws(() => createFixedWindowRateLimiter(0, 1000), RangeError);
  assert.throws(() => createFixedWindowRateLimiter(2, 0), RangeError);
});
