import { comparable } from './comparable';

/**
 * Secret characters: ones whose result is held back until somebody presses
 * Reveal, so the room finds out together rather than reading it off a screen.
 *
 * The mark is any of the words below appearing anywhere in the name. Anywhere,
 * because the document writes it as part of a name rather than as a flag of
 * its own — so this looks through the whole name, unlike the animation
 * triggers, which match from the start.
 *
 * They are spelled out here, once, so they are greppable — the same reason the
 * storage keys are. Adding or changing one changes which characters are held
 * back for everyone, and a name that stops matching simply stops being a
 * secret. Nothing else in the app needs to know what the words are.
 *
 * Whether any of this applies at all is the Hide Surprise Winners setting,
 * which the callers read rather than this file: see `App.tsx` and
 * `ResultsModal`.
 */
export const SECRET_WORDS = ['murim', 'אולברה'] as const;

/**
 * Is this a character to hold back? Matching is on the stored name, which
 * always carries its `(Source)`, so a word counts there too.
 */
export function isSecretName(name: string): boolean {
  // Both sides go through `comparable()`, as a trigger does, so the direction
  // marks a Hebrew document carries cannot hide a word that is plainly
  // written. Folded with toLowerCase, not toLocaleLowerCase: the fold must
  // not change with the device's language. Hebrew has no case, so that part
  // only matters for a word written in Latin letters.
  const subject = comparable(name.toLowerCase());
  return SECRET_WORDS.some((word) => subject.includes(comparable(word)));
}
