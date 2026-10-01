import { sanitizeModule } from '../vfx/schema';
import type { VFXModuleConfig } from '../vfx/types';
import { sanitizePresentation } from './presentation';
import { sanitizeSharedTiming, withTiming } from './timing';
import type { CustomAnimation } from './types';

/**
 * What a custom animation is allowed to be, and how one is matched to its
 * character — the rules alone, with nothing about where animations are kept.
 *
 * Kept apart from store.ts so the server can enforce exactly the same rules:
 * this file and everything it imports run in Node as well as in the browser.
 * Nothing here may touch the page, local storage, or the built-in animation
 * registry, which reads build-time settings only Vite provides.
 */

/** Past this the builder stops offering to add effects. Also enforced on load. */
export const MAX_EFFECTS_PER_ANIMATION = 8;
/** Per name. Stops a runaway import filling the browser's storage. */
export const MAX_ANIMATIONS_PER_USER = 100;
export const MAX_USERNAME_LENGTH = 40;
export const MAX_CHARACTER_LENGTH = 200;
export const ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

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

/** One per character: where two claim the same character, the newer one wins. */
export function dedupeByCharacter(animations: CustomAnimation[]): CustomAnimation[] {
  const newestFirst = [...animations].sort((a, b) => b.updatedAt - a.updatedAt);
  const kept: CustomAnimation[] = [];
  for (const animation of newestFirst) {
    if (!kept.some((k) => sameCharacter(k.character, animation.character))) kept.push(animation);
  }
  return kept;
}
