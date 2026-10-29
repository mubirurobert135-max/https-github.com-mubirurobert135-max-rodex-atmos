import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Dispatch one explicit Vercel API function through the shared Express application.
 * Import the server inside the request handler so a startup/import exception can be
 * caught and returned as JSON instead of crashing the whole Vercel function before
 * it can emit a useful response.
 */
export async function handleExpressRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  try {
    const { app, serverReady } = await import('../../server');
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
