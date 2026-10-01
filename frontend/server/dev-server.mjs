// The animations API for local development: the built function
// (api/animations.js) on http://localhost:8787, with an in-memory store in
// place of Redis, so everything is forgotten when it stops. The dev server
// proxies /api here (vite.config.ts). Run `npm run build` first.
import { createServer } from 'node:http';
import { handle, memoryStore } from '../api/animations.js';

const store = memoryStore();

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname !== '/api/animations') {
    res.statusCode = 404;
    res.end();
    return;
  }
  let text = '';
  for await (const chunk of req) text += chunk;
  let body;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }
  const result = await handle(req.method ?? 'GET', url.searchParams, body, store);
  res.statusCode = result.status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(result.body));
}).listen(8787, () => console.log('Animations API, in memory, on http://localhost:8787'));
