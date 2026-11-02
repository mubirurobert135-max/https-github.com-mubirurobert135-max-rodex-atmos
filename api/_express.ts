/**
 * Shared serverless entrypoint for all explicit Vercel API routes.
 * Files beginning with an underscore are deployment support modules, not routes.
 *
 * Wait for the Express application to finish registering its routes before
 * dispatching the request. The adapter also converts startup failures into
 * a controlled JSON response rather than a platform-level invocation crash.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleExpressRequest } from '../src/serverless/expressAdapter.ts';

export default async function rodexAtmosApiHandler(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  await handleExpressRequest(req, res);
}
