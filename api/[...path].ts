import type { IncomingMessage, ServerResponse } from 'node:http';
import { app, serverReady } from '../server';

/**
 * Vercel catch-all API adapter.
 * The Vite build serves the static frontend from dist/, while all /api/* requests
 * are passed through the existing Express routes so local and deployed behavior match.
 */
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    await serverReady;
    app(req as any, res as any);
  } catch (error) {
    console.error('[Vercel API startup error]', error);
    if (!res.headersSent) {
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({
        error: 'API_STARTUP_FAILED',
        message: 'RODEX Atmos services could not start. Please retry shortly.'
      }));
    }
  }
}
