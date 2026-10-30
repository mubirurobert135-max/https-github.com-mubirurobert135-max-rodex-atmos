import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Keep the platform health probe independent from the full Express app.
 * Vercel can verify the function runtime even when a downstream service is
 * still warming up or an unrelated application module fails to initialise.
 */
export default function healthHandler(
  _req: IncomingMessage,
  res: ServerResponse
): void {
  const isVercelRuntime =
    process.env.VERCEL === '1' ||
    Boolean(process.env.VERCEL_ENV) ||
    Boolean(process.env.VERCEL_URL);

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.end(JSON.stringify({
    ok: true,
    service: 'rodex-atmos-api',
    runtime: isVercelRuntime ? 'vercel' : 'node',
    timestamp: new Date().toISOString()
  }));
}
