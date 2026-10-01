import { useCallback, useState } from 'react';
import { matchCharacterEffect } from '../characters/registry';
import type { CharacterEffect } from '../characters/types';
import { STORAGE_KEYS, readString, writeString } from '../storage';
import { toEffectPresentation } from './presentation';
import type { AnimationLibrary, CustomAnimation } from './types';
import {
  MAX_ANIMATIONS_PER_USER,
  dedupeByCharacter,
  newAnimationId,
  normalizeUsername,
  sameCharacter,
  sanitizeAnimation,
} from './rules';

// The rules live in rules.ts, where the server can use them too. Re-exported
// so everything that has always imported them from here still can.
export {
  MAX_ANIMATIONS_PER_USER,
  MAX_EFFECTS_PER_ANIMATION,
  newAnimationId,
  normalizeUsername,
  sameCharacter,
  sanitizeAnimation,
} from './rules';

/**
 * Where custom animations live in this browser, and the rules for matching
 * one to a winner.
 *
 * This browser's copy is what plays and what the builder edits; sync.ts keeps
 * it in step with the server, which holds each name's animations for every
 * phone. Here, only `loadLibrary` and `saveLibrary` know where the copy is
 * kept.
 */

/** An import larger than this is refused before it is parsed. */
const MAX_IMPORT_CHARS = 500_000;
/** The key that marks a pasted code as ours rather than any JSON at all. */
const EXPORT_MARKER = 'dmuyotAnimations';

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
