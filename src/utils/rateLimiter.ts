/**
 * Memory-bounded, per-process fixed-window request limiter.
 * Protects individual Node/serverless instances from bursts; an edge-level or
 * shared-store limiter is still recommended for distributed deployments.
 */
export function createFixedWindowRateLimiter(
  maxRequests: number,
  windowMs: number,
  clock: () => number = Date.now
): (key: string) => { allowed: boolean; retryAfterSeconds: number } {
  if (!Number.isSafeInteger(maxRequests) || maxRequests < 1 ||
      !Number.isSafeInteger(windowMs) || windowMs < 1) {
    throw new RangeError('Request limit and duration must be positive integers.');
  }

  const buckets = new Map<string, { count: number; resetAt: number }>();
  return (key: string) => {
    const now = clock();
    const id = typeof key === 'string' ? key.slice(0, 256) : 'unknown';
    const previous = buckets.get(id);
    if (!previous || now >= previous.resetAt) {
      // Evict expired entries and bound memory when many unique visitors arrive.
      if (buckets.size >= 5000) {
        for (const [storedKey, value] of buckets) {
          if (now >= value.resetAt) buckets.delete(storedKey);
        }
        while (buckets.size >= 5000) {
          const oldest = buckets.keys().next().value;
          if (oldest === undefined) break;
          buckets.delete(oldest);
        }
      }
      buckets.set(id, { count: 1, resetAt: now + windowMs });
      return { allowed: true, retryAfterSeconds: 0 };
    }

    if (previous.count >= maxRequests) {
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((previous.resetAt - now) / 1000)) };
    }
    previous.count++;
    return { allowed: true, retryAfterSeconds: 0 };
  };
}
