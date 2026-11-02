import type { IncomingMessage, ServerResponse } from 'node:http';

const SERVICE_NAME = 'rodex-atmos-api';

function getRuntime(): 'vercel' | 'node' {
  return process.env.VERCEL === '1' ||
    Boolean(process.env.VERCEL_ENV) ||
    Boolean(process.env.VERCEL_URL)
    ? 'vercel'
    : 'node';
}

export default async function healthHandler(
  _req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const runtime = getRuntime();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  try {
    const server = await import('../server.ts');
    await server.serverReady;
    res.statusCode = 200;
    res.end(JSON.stringify({
      ok: true,
      service: SERVICE_NAME,
      runtime,
      ready: true,
      timestamp: new Date().toISOString()
    }));
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    console.error('[RODEX Health Startup Diagnostic]', {
      name: failure.name,
      code: (failure as NodeJS.ErrnoException).code || null
    });
    res.statusCode = 503;
    res.end(JSON.stringify({
      ok: false,
      service: SERVICE_NAME,
      runtime,
      ready: false,
      message: 'RODEX Atmos services could not start. Please retry shortly.',
      timestamp: new Date().toISOString()
    }));
  }
}
