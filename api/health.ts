import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Temporary, sanitized server-startup probe on the existing health route.
 * Does not add a Vercel function or expose environment values/secrets.
 */
export default async function healthHandler(
  _req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const diagnostic: Record<string, unknown> = {
    service: 'rodex-atmos-api',
    runtime: process.env.VERCEL === '1' || Boolean(process.env.VERCEL_ENV) ? 'vercel' : 'node',
    nodeVersion: process.version,
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
    res.end(JSON.stringify({ ok: true, diagnostic, timestamp: new Date().toISOString() }));
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    diagnostic.serverReady = 'failed';
    diagnostic.failure = {
      name: failure.name,
      code: (failure as NodeJS.ErrnoException).code || null,
      message: failure.message.slice(0, 500),
      stack: failure.stack?.split('\n').slice(0, 12).map(line => line.slice(0, 260)) || []
    };
    console.error('[RODEX Health Startup Diagnostic]', diagnostic);

    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.end(JSON.stringify({ ok: false, diagnostic, timestamp: new Date().toISOString() }));
  }
}
