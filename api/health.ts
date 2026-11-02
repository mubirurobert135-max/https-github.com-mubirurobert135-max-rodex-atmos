import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Temporary startup probe on the existing health function. This keeps the
 * Hobby plan's function count unchanged while tracing the Express bootstrap.
 * Restore the lightweight health probe once the root cause is identified.
 */
export default async function healthHandler(
  _req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const isVercelRuntime =
    process.env.VERCEL === '1' ||
    Boolean(process.env.VERCEL_ENV) ||
    Boolean(process.env.VERCEL_URL);

  const diagnostic: Record<string, unknown> = {
    service: 'rodex-atmos-api',
    runtime: isVercelRuntime ? 'vercel' : 'node',
    nodeVersion: process.version,
    nodeEnv: process.env.NODE_ENV || null,
    serverModuleLoaded: false,
    expressAppAvailable: false,
    serverReady: 'not-started'
  };

  try {
    const server = await import('../server.ts');
    diagnostic.serverModuleLoaded = true;
    diagnostic.expressAppAvailable = typeof server.app === 'function';
    diagnostic.serverReady = 'waiting';
    await server.serverReady;
    diagnostic.serverReady = 'resolved';

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.end(JSON.stringify({ ok: true, timestamp: new Date().toISOString(), diagnostic }));
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    diagnostic.serverReady = 'failed';
    diagnostic.failure = {
      name: failure.name,
      code: (failure as NodeJS.ErrnoException).code || null,
      message: failure.message.slice(0, 500)
    };

    console.error('[RODEX Health Startup Diagnostic]', diagnostic);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.end(JSON.stringify({ ok: false, timestamp: new Date().toISOString(), diagnostic }));
  }
}
