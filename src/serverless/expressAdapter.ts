import type { IncomingMessage, ServerResponse } from 'node:http';
import { app, serverReady } from '../../server.ts';

/**
 * All Express routes are statically bundled into the Vercel function.
 * Dynamic source imports can be omitted from a serverless function's traced
 * output and then fail only when the first request reaches the function.
 */
export async function handleExpressRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  try {
    await serverReady;
    app(req as any, res as any);
  } catch (error) {
    console.error('[Vercel API startup error]', error);
    if (!res.headersSent) {
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      res.end(JSON.stringify({
        error: 'API_STARTUP_FAILED',
        message: 'RODEX Atmos services could not start. Please retry shortly.'
      }));
    }
  }
}
