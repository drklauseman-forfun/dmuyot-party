import { useCallback, useState } from 'react';
import { matchCharacterEffect } from '../characters/registry';
import type { CharacterEffect } from '../characters/types';
import { STORAGE_KEYS, readString, writeString } from '../storage';
import { sanitizeModule } from '../vfx/schema';
import type { VFXModuleConfig } from '../vfx/types';
import { sanitizePresentation, toEffectPresentation } from './presentation';
import { sanitizeSharedTiming, withTiming } from './timing';
import type { AnimationLibrary, CustomAnimation } from './types';

/**
 * Where custom animations live, and the rules for matching one to a winner.
 *
 * For now "where" is this browser. Everything that decides what an animation
 * is — sanitising, one per character per name, custom before built-in — is
 * kept apart from the reading and writing, so moving storage to a server
 * later changes `loadLibrary` and `saveLibrary` and nothing else here.
 */

/** Past this the builder stops offering to add effects. Also enforced on load. */
export const MAX_EFFECTS_PER_ANIMATION = 8;
/** Per name. Stops a runaway import filling the browser's storage. */
export const MAX_ANIMATIONS_PER_USER = 100;
const MAX_USERNAME_LENGTH = 40;
const MAX_CHARACTER_LENGTH = 200;
/** An import larger than this is refused before it is parsed. */
const MAX_IMPORT_CHARS = 500_000;
/** The key that marks a pasted code as ours rather than any JSON at all. */
const EXPORT_MARKER = 'dmuyotAnimations';
const ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

/**
 * Case and spacing do not matter — "Jack", "jack " and "JACK" are one name —
 * and Unicode that looks identical is made identical, so two keyboards that
 * encode the same word differently still agree on it.
 */
export function normalizeUsername(raw: string): string {
  const collapsed = raw.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
  return Array.from(collapsed).slice(0, MAX_USERNAME_LENGTH).join('');
}

/**
 * Exact, apart from surrounding whitespace and Unicode normalisation. The
 * character is picked from the loaded list rather than typed, so there is no
 * need for the prefix matching the built-in animations use — and no risk of
 * one name catching another that begins the same way.
 */
export function sameCharacter(a: string, b: string): boolean {
  return a.normalize('NFC').trim() === b.normalize('NFC').trim();
}

export function newAnimationId(): string {
  // randomUUID only exists in a secure context. A phone opening the dev server
  // over a LAN address is not one.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * An animation safe to keep and to play, or null if nothing usable is left.
 * One with no character, or no effects that survive sanitising, is dropped
 * rather than kept as an empty shell.
 */
export function sanitizeAnimation(input: unknown): CustomAnimation | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;

  const character =
    typeof raw.character === 'string'
      ? Array.from(raw.character.normalize('NFC').trim()).slice(0, MAX_CHARACTER_LENGTH).join('')
      : '';
  if (!character) return null;

  const modules = Array.isArray(raw.modules)
    ? raw.modules
        .map((module) => sanitizeModule(module))
        .filter((module): module is VFXModuleConfig => module !== null)
        .slice(0, MAX_EFFECTS_PER_ANIMATION)
    : [];
  if (modules.length === 0) return null;

  const updatedAt =
    typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) && raw.updatedAt >= 0
      ? raw.updatedAt
      : 0;

  // Shared timing is written into every effect here rather than applied when
  // the animation plays, so nothing downstream needs to know it exists.
  const timing = sanitizeSharedTiming(raw.timing);

  return {
    id: typeof raw.id === 'string' && ID_PATTERN.test(raw.id) ? raw.id : newAnimationId(),
    character,
    modules: withTiming(modules, timing),
    presentation: sanitizePresentation(raw.presentation),
    timing,
    updatedAt,
  };
}

/**
 * A fresh library with no prototype. Usernames are typed by people, and a
 * name like "__proto__" or "constructor" assigned onto an ordinary object
 * reaches into Object.prototype instead of making an entry.
 */
function emptyLibrary(): AnimationLibrary {
  return Object.create(null) as AnimationLibrary;
}

function copyLibrary(library: AnimationLibrary): AnimationLibrary {
  const copy = emptyLibrary();
  for (const [name, animations] of Object.entries(library)) copy[name] = animations;
  return copy;
}

/** One per character: where two claim the same character, the newer one wins. */
function dedupeByCharacter(animations: CustomAnimation[]): CustomAnimation[] {
  const newestFirst = [...animations].sort((a, b) => b.updatedAt - a.updatedAt);
  const kept: CustomAnimation[] = [];
  for (const animation of newestFirst) {
    if (!kept.some((k) => sameCharacter(k.character, animation.character))) kept.push(animation);
  }
  return kept;
}

/**
 * A whole library, repaired entry by entry rather than accepted or rejected
 * as one. A single bad animation costs that animation, not everyone's — which
 * is why this does not go through usePersistedJSON, whose validation discards
 * the whole stored value on any failure.
 */
export function sanitizeLibrary(input: unknown): AnimationLibrary {
  const library = emptyLibrary();
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return library;

  for (const [rawName, rawList] of Object.entries(input)) {
    const name = normalizeUsername(rawName);
    if (!name || !Array.isArray(rawList)) continue;
    const incoming = rawList
      .map((item) => sanitizeAnimation(item))
      .filter((animation): animation is CustomAnimation => animation !== null);
    // Two stored keys can normalise to one name ("Jack" and "jack").
    const existing = Object.hasOwn(library, name) ? library[name] : [];
    library[name] = dedupeByCharacter([...existing, ...incoming]).slice(0, MAX_ANIMATIONS_PER_USER);
  }
  return library;
}

export function getUserAnimations(library: AnimationLibrary, username: string): CustomAnimation[] {
  const name = normalizeUsername(username);
  return name && Object.hasOwn(library, name) ? library[name] : [];
}

export function findCustomAnimation(
  library: AnimationLibrary,
  username: string,
  character: string,
): CustomAnimation | null {
  return (
    getUserAnimations(library, username).find((a) => sameCharacter(a.character, character)) ?? null
  );
}

/**
 * The library with this animation saved under this name. It replaces the
 * name's existing animation with the same id and any for the same character,
 * so there is only ever one per character — which is exactly what the replace
 * dialog has already asked about.
 */
export function withAnimation(
  library: AnimationLibrary,
  username: string,
  animation: CustomAnimation,
): AnimationLibrary {
  const name = normalizeUsername(username);
  const safe = sanitizeAnimation(animation);
  if (!name || !safe) return library;

  const others = getUserAnimations(library, name).filter(
    (a) => a.id !== safe.id && !sameCharacter(a.character, safe.character),
  );
  const next = copyLibrary(library);
  next[name] = [safe, ...others].slice(0, MAX_ANIMATIONS_PER_USER);
  return next;
}

export function withoutAnimation(
  library: AnimationLibrary,
  username: string,
  id: string,
): AnimationLibrary {
  const name = normalizeUsername(username);
  if (!name) return library;
  const next = copyLibrary(library);
  const remaining = getUserAnimations(library, name).filter((a) => a.id !== id);
  if (remaining.length > 0) next[name] = remaining;
  else delete next[name];
  return next;
}

/** In the shape the modal and the effect canvas already understand. */
export function toCharacterEffect(animation: CustomAnimation): CharacterEffect {
  return {
    id: `custom-${animation.id}`,
    triggers: [{ pattern: animation.character, match: 'exact', caseSensitive: true }],
    presentation: toEffectPresentation(animation.presentation),
    modules: animation.modules,
  };
}

/**
 * The animation for a winner, as this name sees it: their own first, then the
 * built-in one. A custom animation only overrides a built-in one for the name
 * it was saved under; everyone else still gets the built-in.
 */
export function resolveWinnerAnimation(
  library: AnimationLibrary,
  username: string,
  character: string,
): CharacterEffect | null {
  const custom = findCustomAnimation(library, username, character);
  return custom ? toCharacterEffect(custom) : matchCharacterEffect(character);
}

/** A code holding one name's animations, to keep somewhere safe or to take to another phone. */
export function exportAnimations(library: AnimationLibrary, username: string): string {
  return JSON.stringify({ [EXPORT_MARKER]: 1, animations: getUserAnimations(library, username) });
}

export interface ImportResult {
  library: AnimationLibrary;
  added: number;
  replaced: number;
  skipped: number;
  error?: string;
}

/**
 * Bring a code's animations in under the current name. Replacement is by
 * character, so importing the same code twice still leaves one of each.
 */
export function importAnimations(
  library: AnimationLibrary,
  username: string,
  code: string,
): ImportResult {
  const fail = (error: string): ImportResult => ({ library, added: 0, replaced: 0, skipped: 0, error });
  if (!normalizeUsername(username)) return fail('Enter your name before importing.');
  if (code.length > MAX_IMPORT_CHARS) return fail('That is too large to be an animation code.');

  let parsed: unknown;
  try {
    parsed = JSON.parse(code);
  } catch {
    return fail("That doesn't look like an animation code.");
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !Object.hasOwn(parsed, EXPORT_MARKER) ||
    !Array.isArray((parsed as { animations?: unknown }).animations)
  ) {
    return fail("That doesn't look like an animation code.");
  }

  let next = library;
  let added = 0;
  let replaced = 0;
  let skipped = 0;
  for (const item of (parsed as { animations: unknown[] }).animations) {
    const animation = sanitizeAnimation(item);
    if (!animation) {
      skipped++;
      continue;
    }
    const existed = findCustomAnimation(next, username, animation.character) !== null;
    next = withAnimation(next, username, { ...animation, id: newAnimationId(), updatedAt: Date.now() });
    if (existed) replaced++;
    else added++;
  }
  return { library: next, added, replaced, skipped };
}

/** Unreadable data is set aside with a warning rather than taking the app down. */
export function loadLibrary(): AnimationLibrary {
  const raw = readString(STORAGE_KEYS.animations);
  if (raw === null) return emptyLibrary();
  try {
    return sanitizeLibrary(JSON.parse(raw));
  } catch {
    console.warn('[animations] Discarding an unreadable animation library');
    return emptyLibrary();
  }
}

export function saveLibrary(library: AnimationLibrary): void {
  writeString(STORAGE_KEYS.animations, JSON.stringify(library));
}

/** The library as React state, written back to storage on every change. */
export function useAnimationLibrary(): [AnimationLibrary, (next: AnimationLibrary) => void] {
  const [library, setLibrary] = useState<AnimationLibrary>(loadLibrary);
  const update = useCallback((next: AnimationLibrary) => {
    setLibrary(next);
    saveLibrary(next);
  }, []);
  return [library, update];
}
