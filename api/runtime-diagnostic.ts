import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Temporary, credential-safe probe for Vercel serverless startup diagnosis.
 * Remove after the Express API bootstrap failure has been identified.
 */
export default async function runtimeDiagnosticHandler(
  _req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const diagnostic: Record<string, unknown> = {
    runtime: 'vercel',
    nodeVersion: process.version,
    nodeEnv: process.env.NODE_ENV || null,
    vercelEnv: process.env.VERCEL_ENV || null,
    vercelUrlPresent: Boolean(process.env.VERCEL_URL),
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
    res.end(JSON.stringify({ ok: true, diagnostic }));
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    diagnostic.serverReady = 'failed';
    diagnostic.failure = {
      name: failure.name,
      code: (failure as NodeJS.ErrnoException).code || null,
      message: failure.message.slice(0, 500)
    };

    console.error('[RODEX Runtime Diagnostic]', diagnostic);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.end(JSON.stringify({ ok: false, diagnostic }));
  }
}
