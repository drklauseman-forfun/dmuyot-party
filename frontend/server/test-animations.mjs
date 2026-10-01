// Exercises the built function (api/animations.js) against an in-memory
// store: `node server/test-animations.mjs` after `npm run build`. Exits
// non-zero on the first failure. Runs in Node only; Redis is not involved.
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import handler, { handle, memoryStore, redisCredentials } from '../api/animations.js';

const q = (s = '') => new URLSearchParams(s);
const anim = (over = {}) => ({
  id: 'id-1',
  character: 'Frodo (LOTR)',
  modules: [{ type: 'glow', color: '#ff0000', intensity: 0.5 }],
  presentation: {},
  timing: null,
  updatedAt: 1000,
  ...over,
});
let passed = 0;
const check = async (label, fn) => {
  await fn();
  passed += 1;
  console.log('ok -', label);
};

await check('no storage connected answers 503', async () => {
  const r = await handle('GET', q('user=jack'), undefined, null);
  assert.equal(r.status, 503);
  assert.equal(r.body.error, 'no-storage');
});

const store = memoryStore();

await check('an unknown name reads as empty and unclaimed', async () => {
  const r = await handle('GET', q('user=jack'), undefined, store);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.animations, []);
  assert.equal(r.body.claimed, false);
});

await check('an unclaimed name can be written without a PIN (the automatic upload)', async () => {
  const r = await handle('POST', q(), { user: 'jack', op: 'apply', upserts: [anim()] }, store);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.claimed, false);
  assert.equal(r.body.animations.length, 1);
});

await check('names are matched as the builder matches them', async () => {
  const r = await handle('GET', q('user=%20JACK%20'), undefined, store);
  assert.equal(r.body.animations.length, 1);
});

await check('the first save with a PIN claims the name', async () => {
  const r = await handle('POST', q(), { user: 'jack', pin: '1234', op: 'apply', upserts: [anim({ updatedAt: 2000 })] }, store);
  assert.equal(r.status, 200);
  assert.equal(r.body.claimed, true);
  const g = await handle('GET', q('user=jack'), undefined, store);
  assert.equal(g.body.claimed, true);
});

await check('a claimed name refuses a change without its PIN', async () => {
  const none = await handle('POST', q(), { user: 'jack', op: 'apply', deletes: ['id-1'] }, store);
  assert.equal(none.status, 403);
  const wrong = await handle('POST', q(), { user: 'jack', pin: '9999', op: 'apply', deletes: ['id-1'] }, store);
  assert.equal(wrong.status, 403);
  assert.equal((await handle('GET', q('user=jack'), undefined, store)).body.animations.length, 1);
});

await check('check confirms the right PIN and refuses a wrong one', async () => {
  assert.equal((await handle('POST', q(), { user: 'jack', pin: '1234', op: 'check' }, store)).status, 200);
  assert.equal((await handle('POST', q(), { user: 'jack', pin: '0000', op: 'check' }, store)).status, 403);
});

await check('one animation per character: a newer one replaces, an older one is ignored', async () => {
  const newer = await handle('POST', q(), { user: 'jack', pin: '1234', op: 'apply', upserts: [anim({ id: 'id-2', updatedAt: 5000 })] }, store);
  assert.deepEqual(newer.body.animations.map((a) => a.id), ['id-2']);
  const older = await handle('POST', q(), { user: 'jack', pin: '1234', op: 'apply', upserts: [anim({ id: 'id-3', updatedAt: 10 })] }, store);
  assert.deepEqual(older.body.animations.map((a) => a.id), ['id-2']);
});

await check('everything is sanitised: bounds clamped, unknown keys and effects dropped', async () => {
  const r = await handle('POST', q(), {
    user: 'jack',
    pin: '1234',
    op: 'apply',
    upserts: [
      anim({
        id: 'id-4',
        character: 'Sam (LOTR)',
        updatedAt: 6000,
        modules: [{ type: 'sparkles', count: 1e9, evil: 'x' }, { type: 'not-an-effect' }],
      }),
      anim({ id: 'id-5', character: 'Empty', modules: [{ type: 'nope' }] }),
    ],
  }, store);
  const sam = r.body.animations.find((a) => a.character === 'Sam (LOTR)');
  assert.ok(sam, 'Sam saved');
  assert.equal(sam.modules.length, 1);
  assert.ok(sam.modules[0].count <= 5000, `count clamped, got ${sam.modules[0].count}`);
  assert.equal('evil' in sam.modules[0], false);
  assert.equal(r.body.animations.some((a) => a.character === 'Empty'), false);
});

await check('delete removes an animation', async () => {
  const r = await handle('POST', q(), { user: 'jack', pin: '1234', op: 'apply', deletes: ['id-4'] }, store);
  assert.equal(r.body.animations.some((a) => a.id === 'id-4'), false);
});

await check('ten wrong PINs lock the name for an hour', async () => {
  await handle('POST', q(), { user: 'dana', pin: '4321', op: 'apply', upserts: [anim()] }, store);
  for (let i = 0; i < 10; i++) {
    assert.equal((await handle('POST', q(), { user: 'dana', pin: '0000', op: 'check' }, store)).status, 403);
  }
  const locked = await handle('POST', q(), { user: 'dana', pin: '4321', op: 'check' }, store);
  assert.equal(locked.status, 429);
});

await check('a name cannot hold more than 100', async () => {
  const many = Array.from({ length: 101 }, (_, i) => anim({ id: `m-${i}`, character: `C${i}`, updatedAt: i + 1 }));
  const r = await handle('POST', q(), { user: 'lots', op: 'apply', upserts: many }, store);
  assert.equal(r.status, 413);
});

await check('the database is found under any name Vercel may give it', async () => {
  const at = { url: 'https://example.upstash.io', token: 't' };
  assert.deepEqual(redisCredentials({ UPSTASH_REDIS_REST_URL: at.url, UPSTASH_REDIS_REST_TOKEN: 't' }), at);
  assert.deepEqual(redisCredentials({ KV_REST_API_URL: at.url, KV_REST_API_TOKEN: 't', KV_REST_API_READ_ONLY_TOKEN: 'r' }), at);
  assert.deepEqual(redisCredentials({ STORAGE_KV_REST_API_URL: at.url, STORAGE_KV_REST_API_TOKEN: 't' }), at);
  assert.deepEqual(redisCredentials({ STORAGE_REST_API_URL: at.url, STORAGE_REST_API_TOKEN: 't' }), at);
  assert.equal(redisCredentials({ KV_REST_API_URL: at.url, KV_REST_API_READ_ONLY_TOKEN: 'r' }), null);
  assert.equal(redisCredentials({ KV_REST_API_URL: 'http://plain', KV_REST_API_TOKEN: 't' }), null);
  assert.equal(redisCredentials({ REDIS_URL: 'rediss://x', KV_URL: 'rediss://x' }), null);
});

await check('the Vercel adapter reads a streamed body and answers JSON', async () => {
  const req = Readable.from([JSON.stringify({ user: 'jack', op: 'check', pin: '1234' })]);
  Object.assign(req, { method: 'POST', url: '/api/animations' });
  const out = { headers: {}, body: '' };
  const res = {
    statusCode: 0,
    setHeader: (k, v) => (out.headers[k] = v),
    end: (b) => (out.body = b),
  };
  // No Redis variables here, so this reaches the "not connected" answer.
  await handler(req, res);
  assert.equal(res.statusCode, 503);
  assert.equal(JSON.parse(out.body).error, 'no-storage');
  assert.equal(out.headers['Cache-Control'], 'no-store');
});

console.log(`\n${passed} checks passed`);
