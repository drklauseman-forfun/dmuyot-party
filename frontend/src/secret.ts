/**
 * Secret characters: ones whose result is held back until somebody presses
 * Reveal, so the room finds out together rather than reading it off a screen.
 *
 * The mark is the word below appearing anywhere in the name, in any mix of
 * capitals. Anywhere, because the document writes it as part of a name rather
 * than as a flag of its own — so this looks through the whole name, unlike the
 * animation triggers, which match from the start.
 *
 * It is spelled out here, once, so it is greppable — the same reason the
 * storage keys are. Changing it changes which characters are held back for
 * everyone, and a name that stops matching simply stops being a secret.
 */
export const SECRET_WORD = 'murim';

/**
 * Is this a character to hold back? Matching is on the stored name, which
 * always carries its `(Source)`, so the word counts there too.
 */
export function isSecretName(name: string): boolean {
  // toLowerCase, not toLocaleLowerCase: the fold must not change with the
  // device's language.
  return name.toLowerCase().includes(SECRET_WORD);
}
