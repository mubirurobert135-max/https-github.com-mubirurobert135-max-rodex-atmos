import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

process.env.VERCEL = '1';

type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void> | void;

// These paths correspond to explicit Vercel filesystem functions. Standard Vite
// projects do not get Next.js-style catch-all routing for api/[...path].ts.
const routeModules = [
  ['/api/health', () => import('../api/health.ts')],
  ['/api/weather/geocoding-search', () => import('../api/weather/geocoding-search.ts')],
  ['/api/weather/ip-location', () => import('../api/weather/ip-location.ts')],
  ['/api/weather/search', () => import('../api/weather/search.ts')],
  ['/api/weather/coordinates', () => import('../api/weather/coordinates.ts')],
  ['/api/ai/insights', () => import('../api/ai/insights.ts')],
  ['/api/ai/briefing', () => import('../api/ai/briefing.ts')],
  ['/api/ai/live-status', () => import('../api/ai/live-status.ts')],
  ['/api/ai/voice-signature', () => import('../api/ai/voice-signature.ts')],
  ['/api/ai/synthesize-speech', () => import('../api/ai/synthesize-speech.ts')],
  ['/api/ai/live-token', () => import('../api/ai/live-token.ts')],
  ['/api/ai/chat', () => import('../api/ai/chat.ts')]
] as const;

const handlers = new Map<string, Handler>();
for (const [route, load] of routeModules) {
  const module = await load();
  if (typeof module.default !== 'function') {
    throw new Error(`Missing default Vercel handler for ${route}`);
  }
  handlers.set(route, module.default as Handler);
}

if (handlers.size !== 12) {
  throw new Error(`Expected 12 explicit API handlers, found ${handlers.size}`);
}

const server = createServer((req, res) => {
  const pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname;
  const handler = handlers.get(pathname);
  if (!handler) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'TEST_ROUTE_NOT_FOUND', path: pathname }));
    return;
  }
  void Promise.resolve(handler(req, res)).catch((error) => {
    console.error('Adapter probe failed:', error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'TEST_HANDLER_FAILED' }));
    }
  });
});

try {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address() as AddressInfo;
  const origin = `http://127.0.0.1:${address.port}`;
  const probes: Array<{
    path: string;
    method?: 'GET' | 'POST';
    body?: string;
    status: number;
  }> = [
    { path: '/api/health', status: 200 },
    { path: '/api/weather/geocoding-search?q=x', status: 200 },
    { path: '/api/weather/search', status: 400 },
    { path: '/api/weather/coordinates?lat=91&lon=0', status: 400 },
    { path: '/api/ai/insights', method: 'POST', body: '{}', status: 400 },
    { path: '/api/ai/briefing', method: 'POST', body: '{}', status: 400 },
    { path: '/api/ai/live-status', status: 200 },
    { path: '/api/ai/voice-signature', status: 200 },
    { path: '/api/ai/synthesize-speech', method: 'POST', body: '{}', status: 400 }
  ];

  for (const probe of probes) {
    const response = await fetch(origin + probe.path, {
      method: probe.method || 'GET',
      headers: probe.body ? { 'Content-Type': 'application/json' } : undefined,
      body: probe.body
    });

    if (response.status !== probe.status) {
      const payload = await response.text();
      throw new Error(
        `${probe.method || 'GET'} ${probe.path}: expected HTTP ${probe.status}, received ${response.status}: ${payload.slice(0, 250)}`
      );
    }
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error(`${probe.path} did not return JSON (${contentType || 'missing content type'}).`);
    }
    await response.arrayBuffer();
    console.log(`PASS ${probe.method || 'GET'} ${probe.path} -> ${response.status}`);
  }

  console.log('PASS Vercel route map: all 12 explicit API function modules load.');
} finally {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}
