import { useCallback, useEffect, useRef, useState } from 'react';
import { STORAGE_KEYS, readString, writeString } from '../storage';
import { normalizeUsername, sanitizeAnimation } from './rules';
import type { AnimationLibrary, CustomAnimation } from './types';

/**
 * Keeps the animations for the name typed into the builder in step with the
 * server (server/animations.ts), so the same name has the same animations on
 * any phone.
 *
 * The library in this browser stays the working copy: it is what plays, and
 * what the builder edits. This fetches the name's animations when the name is
 * set, uploads any made on this phone that the server has not got, and sends
 * each change on as it is made.
 *
 * When there is no server to reach — the dev server, or before storage was
 * connected — it stands aside, and everything works on this phone alone, as
 * it always did.
 */

const ENDPOINT = '/api/animations';

/** Where this name stands with the server. */
export type SyncState =
  /** No name typed yet. */
  | 'none'
  | 'loading'
  /** No server to reach: saved on this phone only. */
  | 'offline'
  /** Shared, and nobody has set a PIN for it yet: the next save sets one. */
  | 'unclaimed'
  /** Protected by a PIN this phone does not have: it can play, not change. */
  | 'locked'
  /** Protected, and this phone has the PIN. */
  | 'unlocked';

export interface AnimationSync {
  state: SyncState;
  /** The PIN as typed, or remembered for this name on this phone. */
  pin: string;
  setPin: (pin: string) => void;
  /** Checks the typed PIN, and on success shares anything waiting. */
  unlock: () => void;
  /** What last went wrong, or a word on what happened, for the builder to show. */
  message: string | null;
  /** Animations on this phone for this name that the server has not got. */
  unshared: number;
  /** In place of setting the library directly: applies a change and shares it. */
  change: (next: AnimationLibrary) => void;
}

type Remote =
  | { kind: 'ok'; claimed: boolean; animations: CustomAnimation[] }
  | { kind: 'refused'; status: number; message: string }
  | { kind: 'offline' };

/**
 * One request. A missing function (the dev server answers with the page
 * instead), storage not connected, a server error and no network at all all
 * mean the same thing here: carry on with this phone alone.
 */
async function call(query: string, init?: RequestInit): Promise<Remote> {
  try {
    const response = await fetch(`${ENDPOINT}${query}`, {
      ...init,
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
    });
    if (response.status === 404 || response.status >= 500) return { kind: 'offline' };
    const body = (await response.json()) as Record<string, unknown>;
    if (!response.ok || body.ok !== true) {
      return { kind: 'refused', status: response.status, message: String(body.message ?? 'Refused.') };
    }
    const animations = (Array.isArray(body.animations) ? body.animations : [])
      .map((raw) => sanitizeAnimation(raw))
      .filter((animation): animation is CustomAnimation => animation !== null);
    return { kind: 'ok', claimed: body.claimed === true, animations };
  } catch {
    return { kind: 'offline' };
  }
}

const post = (payload: Record<string, unknown>) => call('', { method: 'POST', body: JSON.stringify(payload) });

/** A small object kept in local storage under one key, keyed by name. */
function readMap<T>(key: string): Record<string, T> {
  const map = Object.create(null) as Record<string, T>;
  try {
    const parsed: unknown = JSON.parse(readString(key) ?? '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) Object.assign(map, parsed);
  } catch {
    // Unreadable: start again. Nothing in it is anything but a convenience.
  }
  return map;
}

function writeEntry<T>(key: string, name: string, value: T | undefined): void {
  const map = readMap<T>(key);
  if (value === undefined) delete map[name];
  else map[name] = value;
  writeString(key, JSON.stringify(map));
}

/**
 * The ids this phone has seen on the server, per name. An animation missing
 * from the server that this phone once saw there was deleted on another
 * phone, and is dropped here too; one it never saw was made here and is
 * uploaded. Without this, a phone with an old copy would bring deleted
 * animations back to life.
 */
const readSynced = (name: string) => new Set(readMap<string[]>(STORAGE_KEYS.syncedAnimations)[name] ?? []);
const writeSynced = (name: string, animations: CustomAnimation[]) =>
  writeEntry(STORAGE_KEYS.syncedAnimations, name, animations.map((a) => a.id));

/** Four to twenty characters, as the server counts them. */
export const validPin = (pin: string) => {
  const length = Array.from(pin.trim()).length;
  return length >= 4 && length <= 20;
};

function withName(library: AnimationLibrary, name: string, animations: CustomAnimation[]): AnimationLibrary {
  const next = Object.create(null) as AnimationLibrary;
  Object.assign(next, library);
  if (animations.length > 0) next[name] = animations;
  else delete next[name];
  return next;
}

/** Everything the hook tracks, for the one name it belongs to. */
interface Info {
  forName: string;
  state: SyncState;
  pin: string;
  message: string | null;
  unshared: number;
}

/** A name's starting point: what this phone remembers for it, then the server. */
function startFor(name: string): Info {
  return {
    forName: name,
    state: name ? 'loading' : 'none',
    pin: name ? (readMap<string>(STORAGE_KEYS.pins)[name] ?? '') : '',
    message: null,
    unshared: 0,
  };
}

export function useAnimationSync(
  library: AnimationLibrary,
  setLibrary: (next: AnimationLibrary) => void,
  username: string,
): AnimationSync {
  const name = normalizeUsername(username);
  const [stored, setInfo] = useState<Info>(() => startFor(name));
  // A new name starts over, decided while rendering rather than in an effect,
  // so nothing from the last name is ever shown for this one.
  let info = stored;
  if (stored.forName !== name) {
    info = startFor(name);
    setInfo(info);
  }

  /** Changes what is shown — but only if the name is still the one it was for. */
  const update = useCallback((target: string, patch: Partial<Info>) => {
    setInfo((current) => (current.forName === target ? { ...current, ...patch } : current));
  }, []);

  // Read at the moment of use rather than captured: requests finish after
  // renders have moved on.
  const latest = useRef({ library, name, pin: info.pin, state: info.state });
  useEffect(() => {
    latest.current = { library, name, pin: info.pin, state: info.state };
  });

  /** Fetches the name, uploads what only this phone has, and settles the state. */
  const reconcile = useCallback(
    async (target: string, pinToUse: string) => {
      const remote = await call(`?user=${encodeURIComponent(target)}`);
      if (latest.current.name !== target) return;
      if (remote.kind !== 'ok') {
        update(target, { state: 'offline' });
        return;
      }
      const seen = readSynced(target);
      const onServer = new Map(remote.animations.map((a) => [a.id, a]));
      const local = latest.current.library[target] ?? [];
      // Made or changed here since this phone last saw the server.
      const extras = local.filter((a) => {
        const there = onServer.get(a.id);
        return there ? a.updatedAt > there.updatedAt : !seen.has(a.id);
      });

      let shared = remote.animations;
      let claimed = remote.claimed;
      let pinWorks = false;
      let pinRefused = false;
      let waiting = extras;
      if (extras.length > 0 && (!claimed || validPin(pinToUse))) {
        const result = await post({
          user: target,
          op: 'apply',
          pin: claimed ? pinToUse : undefined,
          upserts: extras,
        });
        if (latest.current.name !== target) return;
        if (result.kind === 'ok') {
          shared = result.animations;
          claimed = result.claimed;
          pinWorks = claimed;
          waiting = [];
        } else {
          pinRefused = result.kind === 'refused' && result.status === 403;
        }
      } else if (claimed && validPin(pinToUse)) {
        const result = await post({ user: target, op: 'check', pin: pinToUse });
        if (latest.current.name !== target) return;
        pinWorks = result.kind === 'ok';
        pinRefused = result.kind === 'refused' && result.status === 403;
      }

      writeSynced(target, shared);
      const kept = waiting.filter((a) => !shared.some((s) => s.id === a.id));
      setLibrary(withName(latest.current.library, target, [...kept, ...shared]));
      if (pinWorks) writeEntry(STORAGE_KEYS.pins, target, pinToUse.trim());
      // A remembered PIN that has stopped working — the name was reset and
      // claimed again — is forgotten rather than tried at every open: each
      // wrong try counts towards locking the name, for its owner too.
      if (pinRefused) writeEntry(STORAGE_KEYS.pins, target, undefined);
      update(target, {
        state: !claimed ? 'unclaimed' : pinWorks ? 'unlocked' : 'locked',
        unshared: kept.length,
        ...(pinRefused ? { pin: '' } : {}),
      });
    },
    [setLibrary, update],
  );

  // Once the name stops changing — it changes with every keystroke while
  // being typed — ask the server about it.
  useEffect(() => {
    if (!name) return;
    const timer = setTimeout(() => void reconcile(name, readMap<string>(STORAGE_KEYS.pins)[name] ?? ''), 600);
    return () => clearTimeout(timer);
  }, [name, reconcile]);

  const unlock = useCallback(() => {
    const target = latest.current.name;
    const typed = latest.current.pin.trim();
    if (!target) return;
    if (!validPin(typed)) {
      update(target, { message: 'A PIN is 4 to 20 characters.' });
      return;
    }
    void (async () => {
      const result = await post({ user: target, op: 'check', pin: typed });
      if (latest.current.name !== target) return;
      if (result.kind === 'offline') {
        update(target, { state: 'offline' });
        return;
      }
      if (result.kind === 'refused') {
        update(target, { message: result.message });
        return;
      }
      update(target, { message: null });
      writeEntry(STORAGE_KEYS.pins, target, typed);
      await reconcile(target, typed);
    })();
  }, [reconcile, update]);

  const change = useCallback(
    (next: AnimationLibrary) => {
      const { library: current, name: target, pin: typedPin, state: now } = latest.current;
      setLibrary(next);
      if (!target || (now !== 'unclaimed' && now !== 'unlocked')) return;

      const before = current[target] ?? [];
      const after = next[target] ?? [];
      const upserts = after.filter((a) => before.find((b) => b.id === a.id)?.updatedAt !== a.updatedAt);
      const deletes = before.filter((b) => !after.some((a) => a.id === b.id)).map((b) => b.id);
      if (upserts.length === 0 && deletes.length === 0) return;

      const pinToSend = typedPin.trim();
      void (async () => {
        const result = await post({
          user: target,
          op: 'apply',
          pin: validPin(pinToSend) ? pinToSend : undefined,
          upserts,
          deletes,
        });
        if (latest.current.name !== target) return;
        if (result.kind === 'ok') {
          writeSynced(target, result.animations);
          setLibrary(withName(latest.current.library, target, result.animations));
          if (result.claimed) writeEntry(STORAGE_KEYS.pins, target, pinToSend);
          update(target, { message: null, ...(result.claimed ? { state: 'unlocked' as const } : {}) });
        } else if (result.kind === 'refused') {
          // Not shared, and not kept: what is on this phone should match what
          // the name actually has.
          setLibrary(withName(latest.current.library, target, before));
          // Nor is a PIN that was just refused kept for the next try.
          if (result.status === 403) writeEntry(STORAGE_KEYS.pins, target, undefined);
          update(target, {
            message: `Not saved: ${result.message}`,
            ...(result.status === 403 ? { state: 'locked' as const, pin: '' } : {}),
          });
        } else {
          update(target, {
            state: 'offline',
            message: 'Saved on this phone only — the server could not be reached. It will be shared next time.',
          });
        }
      })();
    },
    [setLibrary, update],
  );

  const setPin = useCallback((value: string) => update(name, { pin: value, message: null }), [name, update]);

  return { state: info.state, pin: info.pin, setPin, unlock, message: info.message, unshared: info.unshared, change };
}
