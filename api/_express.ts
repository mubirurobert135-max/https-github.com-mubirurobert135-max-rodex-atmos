/**
 * Shared Express entrypoint for the explicit Vercel API routes.
 * Files beginning with an underscore are deployment support modules, not routes.
 */
import { app } from '../server.ts';

// Route registration is synchronous in production; the server never opens a port here.
export default app;
