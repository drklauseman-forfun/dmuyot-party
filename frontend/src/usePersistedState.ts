import { useCallback, useState } from 'react';
import { readJSON, readNumber, readString, writeJSON, writeString } from './storage';

/**
 * useState, but the value is read from localStorage on first render and
 * written back on every change.
 *
 * The point is that setting the value and persisting it stop being two things
 * a caller has to remember to do together. Every read goes through the guards
 * in storage.ts, so a corrupt or unreadable value falls back to the initial
 * one instead of throwing.
 *
 * The setters take a value, not an updater function — no caller needs one, and
 * accepting both would make the persisted write ambiguous.
 */

export function usePersistedString(
  key: string,
  initial: string,
): [string, (value: string) => void] {
  const [value, setValue] = useState(() => readString(key) ?? initial);

  const set = useCallback(
    (next: string) => {
      setValue(next);
      writeString(key, next);
    },
    [key],
  );

  return [value, set];
}

export function usePersistedNumber(
  key: string,
  initial: number,
): [number, (value: number) => void] {
  const [value, setValue] = useState(() => readNumber(key, initial));

  const set = useCallback(
    (next: number) => {
      setValue(next);
      writeString(key, next.toString());
    },
    [key],
  );

  return [value, set];
}

export function usePersistedBoolean(
  key: string,
  initial: boolean,
): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState(() => {
    const raw = readString(key);
    return raw === null ? initial : raw === 'true';
  });

  const set = useCallback(
    (next: boolean) => {
      setValue(next);
      writeString(key, next.toString());
    },
    [key],
  );

  return [value, set];
}

/**
 * `isValid` must be defined at module scope — it is a hook dependency, so an
 * inline arrow would rebuild the setter on every render.
 */
export function usePersistedJSON<T>(
  key: string,
  initial: T,
  isValid: (value: unknown) => value is T,
): [T, (value: T) => void] {
  const [value, setValue] = useState(() => readJSON(key, initial, isValid));

  const set = useCallback(
    (next: T) => {
      setValue(next);
      writeJSON(key, next);
    },
    [key],
  );

  return [value, set];
}
