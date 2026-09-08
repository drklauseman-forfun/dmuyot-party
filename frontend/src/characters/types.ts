import type { VFXModuleConfig } from '../vfx/types';

/**
 * How a character's name is compared against a trigger pattern.
 *
 * Prefer 'name'. It is exact, except that it ignores a trailing "(Source)" —
 * which the extractor keeps on the end of every name, so a plain 'exact' on
 * the name as written would never match.
 *
 * The looser modes match more than they look like they do: 'prefix' will
 * happily fire "אלף" on "אלפרד".
 */
export type TriggerMatch = 'exact' | 'name' | 'prefix' | 'contains' | 'regex';

export interface EffectTrigger {
  pattern: string;
  match: TriggerMatch;
  /** Matching lowercases both sides unless this is set. */
  caseSensitive?: boolean;
}

/**
 * How the results modal dresses itself for an effect.
 *
 * Every value here is applied inline, so adding a new effect needs no CSS —
 * except `shake` and `glitch`, which switch on keyframe animations that live
 * in index.css because they can't be expressed as static style values.
 */
export interface EffectPresentation {
  title: string;
  /** Drives the border, the winner names and the button unless overridden. */
  accentColor: string;
  backgroundColor: string;
  /** Full CSS box-shadow. Defaults to `0 0 50px {accentColor}`. */
  glow?: string;
  buttonColor?: string;
  buttonTextColor?: string;
  fontFamily?: string;
  letterSpacing?: string;
  textShadow?: string;
  shake?: boolean;
  glitch?: boolean;
}

/** One character effect: what triggers it, how it looks, what it renders in 3D. */
export interface CharacterEffect {
  id: string;
  triggers: EffectTrigger[];
  presentation: EffectPresentation;
  modules: VFXModuleConfig[];
}

/**
 * An {@link EffectPresentation} with every fallback already applied — the exact
 * shape the modal renders. Produced by `resolvePresentation`.
 */
export interface ResolvedPresentation {
  title: string;
  borderColor: string;
  boxShadow: string;
  backgroundColor: string;
  /** When undefined, each winner keeps its own colour from the document. */
  winnerColor?: string;
  buttonColor: string;
  buttonTextColor: string;
  fontFamily?: string;
  letterSpacing?: string;
  textShadow?: string;
  shake: boolean;
  glitch: boolean;
}
