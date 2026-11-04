/**
 * A name reduced to what a trigger or a secret word should compare against.
 *
 * Names arrive from documents carrying things that are invisible or incidental:
 * direction marks Google Docs puts around Hebrew, vowel points, runs of spaces,
 * a Hebrew geresh or curly apostrophe where the trigger has a plain one, and
 * whatever the parser left in front of the name — the backend on Render, still
 * on old code, turns "12 - Name" into "- Name". None of that should stop a
 * trigger from recognising the character, and none of it can make an unrelated
 * name match.
 *
 * Shared by the animation triggers (`characters/registry.ts`) and the secret
 * words (`secret.ts`). They are separate features, but a name that looks like
 * a match should match in both, and two copies of these ranges would drift.
 */
export function comparable(text: string): string {
  return (
    text
      .normalize('NFC')
      // Direction marks and zero-width characters.
      .replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '')
      // Hebrew vowel points and cantillation, which change no letter.
      .replace(/[\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7]/g, '')
      // The apostrophe in הנרץ' is U+0027; a geresh or curly one reads the same.
      .replace(/[\u05f3\u2018\u2019]/g, "'")
      // Anything before the first letter or digit: a dash, a bullet, an emoji.
      .replace(/^[^\p{L}\p{N}]+/u, '')
      .replace(/\s+/g, ' ')
      .trim()
  );
}
