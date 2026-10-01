import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Redis } from '@upstash/redis';
import {
  ID_PATTERN,
  MAX_ANIMATIONS_PER_USER,
  normalizeUsername,
  sameCharacter,
  sanitizeAnimation,
} from '../src/animations/rules';
import type { CustomAnimation } from '../src/animations/types';

/**
 * Custom animations, kept on the server per name so the same name gets the
 * same animations on any phone: `GET /api/animations?user=<name>` reads them,
 * and `POST /api/animations` changes them.
 *
 * A name can be protected by a PIN. The first save that brings one claims the
 * name, and from then on every change needs it; reading never does. A name
 * nobody has claimed yet can still be written without one — that is how
 * animations already saved on a phone are uploaded the first time the app
 * opens after this arrived, before anyone has been asked for a PIN.
 *
 * Everything coming in goes through the same sanitising the builder uses
 * (src/animations/rules.ts), so nothing can be stored that the builder could
 * not have made.
 *
 * This is the source. Vercel runs the bundle built from it into
 * api/animations.js by `npm run build` — see vite.api.config.ts for why.
 */

/** The little of Redis this needs, so tests can stand in a map for it. */
export interface Store {
  hgetall(key: string): Promise<Record<string, string> | null>;
  hset(key: string, values: Record<string, string>): Promise<unknown>;
  hdel(key: string, ...fields: string[]): Promise<unknown>;
  get(key: string): Promise<string | null>;
  /** Set only if absent. True if this call set it. */
  setIfAbsent(key: string, value: string): Promise<boolean>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
}

/**
 * Where the database is, and the key to it, from the variables Vercel adds
 * when one is connected to the project. Upstash's own names come first, then
 * Vercel's `KV_REST_API_*`, then anything ending in `REST_API_URL`: the
 * connect dialog offers a custom prefix, which turns `KV_REST_API_URL` into,
 * say, `STORAGE_KV_REST_API_URL`, and that must not quietly leave sharing
 * switched off. The read-only token is never taken for the real one.
 */
export function redisCredentials(env: Record<string, string | undefined>): { url: string; token: string } | null {
  // Shortest first, so a plain name wins over a prefixed one.
  const names = Object.keys(env).sort((a, b) => a.length - b.length);
  for (const ending of ['UPSTASH_REDIS_REST_URL', 'KV_REST_API_URL', 'REST_API_URL']) {
    for (const name of names) {
      if (!name.endsWith(ending)) continue;
      const url = env[name];
      const token = env[`${name.slice(0, -'URL'.length)}TOKEN`];
      if (url?.startsWith('https://') && token) return { url, token };
    }
  }
  return null;
}

/** Upstash Redis, wherever those variables say it is. */
export function upstashStore(env: Record<string, string | undefined> = process.env): Store | null {
  const credentials = redisCredentials(env);
  if (!credentials) return null;
  // Values stay the JSON strings they were written as, rather than being
  // parsed on the way out by a guess at what they are.
  const redis = new Redis({ ...credentials, automaticDeserialization: false });
  return {
    hgetall: (key) => redis.hgetall<Record<string, string>>(key),
    hset: (key, values) => redis.hset(key, values),
    hdel: (key, ...fields) => redis.hdel(key, ...fields),
    get: (key) => redis.get<string>(key),
    setIfAbsent: async (key, value) => (await redis.set(key, value, { nx: true })) === 'OK',
    incr: (key) => redis.incr(key),
    expire: (key, seconds) => redis.expire(key, seconds),
  };
}

/** A map behind the same interface, for testing without Redis. */
export function memoryStore(): Store {
  const hashes = new Map<string, Map<string, string>>();
  const strings = new Map<string, string>();
  return {
    hgetall: async (key) => {
      const hash = hashes.get(key);
      return hash && hash.size > 0 ? Object.fromEntries(hash) : null;
    },
    hset: async (key, values) => {
      const hash = hashes.get(key) ?? new Map<string, string>();
      for (const [field, value] of Object.entries(values)) hash.set(field, value);
      hashes.set(key, hash);
    },
    hdel: async (key, ...fields) => {
      for (const field of fields) hashes.get(key)?.delete(field);
    },
    get: async (key) => strings.get(key) ?? null,
    setIfAbsent: async (key, value) => {
      if (strings.has(key)) return false;
      strings.set(key, value);
      return true;
    },
    incr: async (key) => {
      const next = Number(strings.get(key) ?? 0) + 1;
      strings.set(key, String(next));
      return next;
    },
    expire: async () => undefined,
  };
}

/** Wrong PINs allowed per name per hour, before it stops checking. */
const MAX_TRIES = 10;
const TRY_WINDOW_SECONDS = 3600;
/** A request bigger than this is refused before it is looked at. */
const MAX_BODY_CHARS = 400_000;

const keys = (name: string) => {
  const safe = encodeURIComponent(name);
  return { animations: `dmuyot:anim:${safe}`, pin: `dmuyot:pin:${safe}`, tries: `dmuyot:tries:${safe}` };
};

/** Four to twenty characters, counted as characters rather than UTF-16 units. */
function validPin(pin: unknown): pin is string {
  if (typeof pin !== 'string') return false;
  const length = Array.from(pin.trim()).length;
  return length >= 4 && length <= 20;
}

/** scrypt, salted: slow to guess even for a PIN this short. */
function hashPin(pin: string, salt: Buffer = randomBytes(16)): string {
  return `${salt.toString('hex')}$${scryptSync(pin.trim(), salt, 32).toString('hex')}`;
}

function pinMatches(pin: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split('$');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(pin.trim(), Buffer.from(saltHex, 'hex'), 32);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

interface Result {
  status: number;
  body: Record<string, unknown>;
}

const fail = (status: number, error: string, message: string): Result => ({
  status,
  body: { ok: false, error, message },
});

async function readAnimations(store: Store, name: string): Promise<Map<string, CustomAnimation>> {
  const raw = (await store.hgetall(keys(name).animations)) ?? {};
  const found = new Map<string, CustomAnimation>();
  for (const value of Object.values(raw)) {
    try {
      // Sanitised again on the way out: whatever is stored, only what the
      // builder could have made is ever handed back.
      const animation = sanitizeAnimation(typeof value === 'string' ? JSON.parse(value) : value);
      if (animation) found.set(animation.id, animation);
    } catch {
      // An unreadable entry costs that entry, not the name's whole set.
    }
  }
  return found;
}

const newestFirst = (animations: Iterable<CustomAnimation>) =>
  [...animations].sort((a, b) => b.updatedAt - a.updatedAt);

/**
 * Checks the PIN for a change. A name nobody has claimed takes the PIN given,
 * if there is one, and is claimed by it. Returns the failure, or whether the
 * name is now claimed.
 */
async function authorise(store: Store, name: string, pin: unknown): Promise<Result | { claimed: boolean }> {
  const k = keys(name);
  let stored = await store.get(k.pin);
  if (stored === null) {
    if (!validPin(pin)) return { claimed: false };
    if (await store.setIfAbsent(k.pin, hashPin(pin))) return { claimed: true };
    // Someone claimed it in the same moment: check against theirs.
    stored = await store.get(k.pin);
    if (stored === null) return { claimed: false };
  }
  if (Number((await store.get(k.tries)) ?? 0) >= MAX_TRIES) {
    return fail(429, 'too-many-tries', 'Too many wrong PINs for this name. Try again in an hour.');
  }
  if (!validPin(pin) || !pinMatches(pin, stored)) {
    if ((await store.incr(k.tries)) === 1) await store.expire(k.tries, TRY_WINDOW_SECONDS);
    return fail(403, 'wrong-pin', "That PIN doesn't match this name's.");
  }
  return { claimed: true };
}

/** The request, already parsed — independent of how Vercel delivers it. */
export async function handle(
  method: string,
  query: URLSearchParams,
  body: unknown,
  store: Store | null,
): Promise<Result> {
  if (!store) return fail(503, 'no-storage', 'Shared storage is not connected yet.');

  if (method === 'GET') {
    const name = normalizeUsername(query.get('user') ?? '');
    if (!name) return fail(400, 'no-name', 'Which name?');
    const claimed = (await store.get(keys(name).pin)) !== null;
    return { status: 200, body: { ok: true, claimed, animations: newestFirst((await readAnimations(store, name)).values()) } };
  }

  if (method !== 'POST') return fail(405, 'method', 'Only GET and POST.');
  if (typeof body !== 'object' || body === null) return fail(400, 'bad-request', 'Expected a JSON body.');
  const request = body as Record<string, unknown>;
  const name = normalizeUsername(typeof request.user === 'string' ? request.user : '');
  if (!name) return fail(400, 'no-name', 'Which name?');

  const auth = await authorise(store, name, request.pin);
  if ('status' in auth) return auth;

  if (request.op === 'check') return { status: 200, body: { ok: true, claimed: auth.claimed } };
  if (request.op !== 'apply') return fail(400, 'bad-request', 'Unknown operation.');

  const current = await readAnimations(store, name);
  const removed = new Set<string>();
  const written = new Map<string, CustomAnimation>();

  for (const id of Array.isArray(request.deletes) ? request.deletes : []) {
    if (typeof id === 'string' && ID_PATTERN.test(id) && current.delete(id)) removed.add(id);
  }
  for (const raw of Array.isArray(request.upserts) ? request.upserts : []) {
    const incoming = sanitizeAnimation(raw);
    if (!incoming) continue;
    // One per character: the newer of the two stays. A fresh save is always
    // the newer; an upload from an old phone may not be.
    const rival = [...current.values()].find(
      (other) => other.id !== incoming.id && sameCharacter(other.character, incoming.character),
    );
    if (rival) {
      if (rival.updatedAt > incoming.updatedAt) continue;
      current.delete(rival.id);
      written.delete(rival.id);
      removed.add(rival.id);
    }
    current.set(incoming.id, incoming);
    written.set(incoming.id, incoming);
    removed.delete(incoming.id);
  }

  if (current.size > MAX_ANIMATIONS_PER_USER) {
    return fail(413, 'too-many', `A name can hold at most ${MAX_ANIMATIONS_PER_USER} animations.`);
  }
  const k = keys(name);
  if (removed.size > 0) await store.hdel(k.animations, ...removed);
  if (written.size > 0) {
    await store.hset(
      k.animations,
      Object.fromEntries([...written].map(([id, animation]) => [id, JSON.stringify(animation)])),
    );
  }
  return { status: 200, body: { ok: true, claimed: auth.claimed, animations: newestFirst(current.values()) } };
}

/** The body, whether Vercel has parsed it already or left the stream unread. */
async function readBody(req: IncomingMessage & { body?: unknown }): Promise<unknown> {
  if (req.body !== undefined) {
    if (typeof req.body !== 'string') return req.body;
    if (req.body.length > MAX_BODY_CHARS) return undefined;
    try {
      return JSON.parse(req.body);
    } catch {
      return undefined;
    }
  }
  let text = '';
  for await (const chunk of req) {
    text += chunk;
    if (text.length > MAX_BODY_CHARS) return undefined;
  }
  try {
    return text ? JSON.parse(text) : undefined;
  } catch {
    return undefined;
  }
}

export default async function vercelHandler(
  req: IncomingMessage & { body?: unknown },
  res: ServerResponse,
): Promise<void> {
  let result: Result;
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const body = req.method === 'POST' ? await readBody(req) : undefined;
    result = await handle(req.method ?? 'GET', url.searchParams, body, upstashStore());
  } catch (error) {
    console.error('[animations]', error);
    result = fail(500, 'server', 'Something went wrong on the server.');
  }
  res.statusCode = result.status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(result.body));
}
