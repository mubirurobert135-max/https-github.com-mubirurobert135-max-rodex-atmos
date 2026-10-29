import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

process.env.VERCEL = '1';

const { default: handler } = await import('../api/[...path].ts');
const server = createServer((req, res) => {
  void handler(req, res);
});

try {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address() as AddressInfo;
  const healthResponse = await fetch(`http://127.0.0.1:${address.port}/api/health`);
  if (healthResponse.status !== 200) {
    throw new Error(`Expected /api/health HTTP 200, received HTTP ${healthResponse.status}.`);
  }
  const health = await healthResponse.json() as { ok?: boolean; service?: string; runtime?: string };
  if (health.ok !== true || health.service !== 'rodex-atmos-api' || health.runtime !== 'vercel') {
    throw new Error(`Unexpected /api/health payload: ${JSON.stringify(health)}`);
  }
  console.log('PASS Vercel health endpoint: API initialized and reports the expected runtime.');

  const response = await fetch(
    `http://127.0.0.1:${address.port}/api/weather/coordinates?lat=91&lon=0`
  );

  if (response.status !== 400) {
    throw new Error(`Expected an Express API response with HTTP 400, received HTTP ${response.status}.`);
  }

  const payload = await response.json() as { error?: string };
  if (!payload.error) {
    throw new Error('The Vercel API adapter did not return the expected JSON error payload.');
  }

  console.log('PASS Vercel API adapter: /api/weather/* reaches the Express routes.');
} finally {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}
