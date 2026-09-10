/**
 * Reads of persisted state, guarded.
 *
 * These values are user data — saved character lists, weights and settings —
 * so the keys must never change without a migration. What can change is a
 * stored value going bad: a half-finished write, a quota error mid-save, or
 * someone editing devtools. Parsing that unguarded throws during mount, and
 * with it the whole app, on every load until site data is cleared by hand.
 */

/** Spelled out rather than built from a prefix, so each key is greppable. */
export const STORAGE_KEYS = {
  input: 'dmuyot_party_input',
  duration: 'dmuyot_party_duration',
  sound: 'dmuyot_party_sound',
  soundPack: 'dmuyot_party_sound_pack',
  effects: 'dmuyot_party_effects',
  helpLanguage: 'dmuyot_party_help_language',
  username: 'dmuyot_party_username',
  /** Custom animations, every username's, as one object. See animations/store.ts. */
  animations: 'dmuyot_party_animations',
  ranges: 'dmuyot_party_ranges',
  weights: 'dmuyot_party_weights',
  history: 'dmuyot_party_history',
} as const;

/** Matches every key above — used when clearing saved data after a crash. */
export const STORAGE_PREFIX = 'dmuyot_party_';

/** Raw string read. Returns null if storage itself is unavailable. */
export function readString(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    // Private browsing and locked-down browsers throw on access.
    return null;
  }
}

export function writeString(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Out of quota, or storage disabled. Losing a save is survivable;
    // taking the app down over it is not.
  }
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* see writeString */
  }
}

/**
 * JSON read that falls back rather than throwing. `isValid` is what stops a
 * structurally-valid but wrong-shaped value (an array where a map belongs)
 * from reaching the app and failing somewhere less obvious.
 */
export function readJSON<T>(
  key: string,
  fallback: T,
  isValid: (value: unknown) => value is T,
): T {
  const raw = readString(key);
  if (raw === null) return fallback;

  try {
    const parsed: unknown = JSON.parse(raw);
    return isValid(parsed) ? parsed : fallback;
  } catch {
    console.warn(`[storage] Discarding unreadable value for ${key}`);
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown): void {
  writeString(key, JSON.stringify(value));
}

/** A number that survived parsing, or the fallback. */
export function readNumber(key: string, fallback: number): number {
  const raw = readString(key);
  if (raw === null) return fallback;
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}
