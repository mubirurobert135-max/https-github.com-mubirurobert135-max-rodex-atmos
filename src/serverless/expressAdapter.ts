import type { IncomingMessage, ServerResponse } from 'node:http';
import { app, serverReady } from '../../server';

/**
 * Dispatch one explicit Vercel API function through the existing Express app.
 * The file-system route is defined by each api/weather/*.ts and api/ai/*.ts file;
 * this adapter deliberately does not depend on unsupported catch-all routing.
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
      res.end(JSON.stringify({
        error: 'API_STARTUP_FAILED',
        message: 'RODEX Atmos services could not start. Please retry shortly.'
      }));
    }
  }
}
