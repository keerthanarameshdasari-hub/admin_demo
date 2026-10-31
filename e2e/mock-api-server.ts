/**
 * A stand-in for backend_demo on a real port, for the Playwright run. It
 * serves the same MSW handlers the unit tests use (src/mocks), so the E2E
 * suite exercises the production build against an API with the backend's
 * rules, without a database. Node runs this file directly (type stripping).
 *
 *   node e2e/mock-api-server.ts [port]      default 9090; MOCK_API_ORIGINS sets CORS origins
 *
 * POST /__mock/reset restores the seed data between tests.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { getResponse } from 'msw';
import { createDb } from '../src/mocks/db.ts';
import { createHandlers } from '../src/mocks/handlers.ts';

const port = Number(process.argv[2] ?? process.env.MOCK_API_PORT ?? 9090);
const base = `http://127.0.0.1:${port}`;
// Same CORS policy as backend_demo with CORS_ALLOWED_ORIGINS set: exact origins, bearer tokens, no cookies.
const origins = new Set(
  (
    process.env.MOCK_API_ORIGINS ??
    'http://127.0.0.1:4173,http://localhost:4173,http://127.0.0.1:5173,http://localhost:5173'
  ).split(','),
);

const db = createDb();
const handlers = createHandlers(base, db);

function cors(req: IncomingMessage, res: ServerResponse): void {
  const origin = req.headers.origin;
  if (origin && origins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type,Idempotency-Key');
    res.setHeader('Access-Control-Max-Age', '600');
  }
}

async function body(req: IncomingMessage): Promise<Uint8Array<ArrayBuffer> | undefined> {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return new Uint8Array(Buffer.concat(chunks));
}

const server = createServer(async (req, res) => {
  cors(req, res);
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }
    const url = new URL(req.url ?? '/', base);
    if (req.method === 'POST' && url.pathname === '/__mock/reset') {
      db.reset();
      res.writeHead(204).end();
      return;
    }
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"status":"ok"}');
      return;
    }

    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') headers.set(name, value);
    }
    const request = new Request(url, { method: req.method, headers, body: await body(req) });
    const response = await getResponse(handlers, request);
    if (!response) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({ statusCode: 404, code: 'NOT_FOUND', message: `No mock for ${req.method} ${url.pathname}` }),
      );
      return;
    }
    response.headers.forEach((value, name) => res.setHeader(name, value));
    res.writeHead(response.status);
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error(error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end('{"statusCode":500,"code":"INTERNAL","message":"Mock server error"}');
  }
});

server.listen(port, '127.0.0.1', () => console.log(`Mock API (MSW handlers) on ${base}`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close(() => process.exit(0)));
