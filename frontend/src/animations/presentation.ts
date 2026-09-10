import type { EffectPresentation } from '../characters/types';
import { sanitizeValue } from '../vfx/params';
import type {
  BooleanSpec,
  ColorSpec,
  NumberSpec,
  ParamSpec,
  SelectSpec,
  TextSpec,
} from '../vfx/params';

/**
 * How a custom animation styles the results modal.
 *
 * These are the fields the builder shows, not the shape the modal reads. They
 * are structured — a colour and a size rather than a CSS box-shadow string —
 * for two reasons. Nobody can type arbitrary CSS into an animation that other
 * people's phones will render. And a saved animation can be opened again for
 * editing without trying to parse CSS back into its parts.
 *
 * `toEffectPresentation` turns them into what `resolvePresentation` already
 * understands, so the modal itself does not change at all.
 */

/**
 * Fonts are stored as a short name and turned into a CSS stack only when the
 * animation plays, so a saved animation never carries a font string of its own.
 */
export type FontChoice = 'default' | 'palatino' | 'georgia' | 'typewriter' | 'impact';

const FONT_STACKS: Record<Exclude<FontChoice, 'default'>, string> = {
  palatino: "'Palatino', 'Palatino Linotype', serif",
  georgia: "'Georgia', serif",
  typewriter: "'Courier New', monospace",
  impact: "Impact, 'Arial Black', sans-serif",
};

export interface PresentationInput {
  title: string;
  accentColor: string;
  backgroundColor: string;
  glowColor: string;
  glowSize: number;
  buttonColor: string;
  buttonTextColor: string;
  fontFamily: FontChoice;
  letterSpacing: number;
  textGlowColor: string;
  textGlowSize: number;
  shake: boolean;
  glitch: boolean;
}

/** The font field is tested before plain strings, which it would also satisfy. */
type PresentationSpecFor<V> = [V] extends [number]
  ? NumberSpec
  : [V] extends [boolean]
    ? BooleanSpec
    : [V] extends [FontChoice]
      ? SelectSpec<FontChoice>
      : [V] extends [string]
        ? ColorSpec | TextSpec
        : never;

/** The app's brand colour — the same one resolvePresentation falls back to. */
const BRAND = '#646cff';

export const PRESENTATION_SCHEMA: {
  [K in keyof PresentationInput]-?: PresentationSpecFor<PresentationInput[K]>;
} = {
  title: {
    kind: 'text',
    label: 'Title',
    guide: 'The heading at the top of the results.',
    default: '🎊 The Results are In! 🎊',
    maxLength: 60,
  },
  accentColor: {
    kind: 'color',
    label: 'Accent colour',
    guide: "Colours the border and the winner's name.",
    default: BRAND,
  },
  backgroundColor: {
    kind: 'color',
    label: 'Background',
    guide: 'Behind the results. It can be partly see-through.',
    default: '#1e1e1ef2',
    alpha: true,
  },
  glowColor: {
    kind: 'color',
    label: 'Glow colour',
    guide: 'The colour of the light around the results.',
    default: BRAND,
  },
  glowSize: {
    kind: 'number',
    label: 'Glow size',
    guide: 'How far that light spreads, in pixels. 0 for none.',
    default: 50,
    min: 0,
    max: 150,
    step: 1,
    integer: true,
    unit: 'px',
  },
  buttonColor: {
    kind: 'color',
    label: 'Button colour',
    guide: 'The colour of the button that closes the results.',
    default: BRAND,
  },
  buttonTextColor: {
    kind: 'color',
    label: 'Button text',
    guide: 'The colour of the words on that button. Pick something that stands out against the button.',
    default: '#ffffff',
  },
  fontFamily: {
    kind: 'select',
    label: 'Font',
    guide:
      "The lettering of the title and the winner's name. Most phones don't have these exact fonts and use the closest style they do have — a serif, a typewriter face, or a plain one.",
    default: 'default',
    options: [
      { value: 'default', label: 'App default' },
      { value: 'palatino', label: 'Palatino' },
      { value: 'georgia', label: 'Georgia' },
      { value: 'typewriter', label: 'Typewriter' },
      { value: 'impact', label: 'Impact' },
    ],
  },
  letterSpacing: {
    kind: 'number',
    label: 'Letter spacing',
    guide: 'Extra space between letters, in pixels. A little makes a title feel grander.',
    default: 0,
    min: 0,
    max: 10,
    step: 0.5,
    unit: 'px',
  },
  textGlowColor: {
    kind: 'color',
    label: 'Text glow colour',
    guide: 'The colour of the glow around the title and name.',
    default: BRAND,
  },
  textGlowSize: {
    kind: 'number',
    label: 'Text glow size',
    guide: 'How far that glow spreads, in pixels. 0 for none.',
    default: 0,
    min: 0,
    max: 40,
    step: 1,
    integer: true,
    unit: 'px',
  },
  shake: {
    kind: 'boolean',
    label: 'Shake',
    guide: 'Shakes the results for about a second when they appear.',
    default: false,
  },
  glitch: {
    kind: 'boolean',
    label: 'Glitch',
    guide: 'Makes the title flicker, and flashes red and blue behind the results as they appear.',
    default: false,
  },
};

/** Anything in, a complete and valid set of modal styles out. Never throws. */
export function sanitizePresentation(input: unknown): PresentationInput {
  const source =
    typeof input === 'object' && input !== null && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const specs = PRESENTATION_SCHEMA as Record<string, ParamSpec>;
  const out: Record<string, unknown> = {};
  for (const [key, spec] of Object.entries(specs)) {
    out[key] = sanitizeValue(spec, source[key]);
  }
  return out as unknown as PresentationInput;
}

export function defaultPresentation(): PresentationInput {
  return sanitizePresentation({});
}

/**
 * The styles as the modal reads them.
 *
 * Sanitises first, even though callers should already have: this is the one
 * place values become CSS, so it is the one place that has to be sure of them.
 */
export function toEffectPresentation(input: PresentationInput): EffectPresentation {
  const p = sanitizePresentation(input);
  return {
    title: p.title,
    accentColor: p.accentColor,
    backgroundColor: p.backgroundColor,
    // 'none' rather than leaving it out: resolvePresentation fills a missing
    // glow with a default one, which is not what a size of 0 asked for.
    glow: p.glowSize > 0 ? `0 0 ${p.glowSize}px ${p.glowColor}` : 'none',
    buttonColor: p.buttonColor,
    buttonTextColor: p.buttonTextColor,
    fontFamily: p.fontFamily === 'default' ? undefined : FONT_STACKS[p.fontFamily],
    letterSpacing: p.letterSpacing > 0 ? `${p.letterSpacing}px` : undefined,
    textShadow: p.textGlowSize > 0 ? `0 0 ${p.textGlowSize}px ${p.textGlowColor}` : undefined,
    shake: p.shake,
    glitch: p.glitch,
  };
}
