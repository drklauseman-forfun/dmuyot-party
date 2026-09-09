import type {
  CharacterEffect,
  EffectPresentation,
  EffectTrigger,
  ResolvedPresentation,
} from './types';
import type { VFXModuleConfig } from '../vfx/types';
import { TEST_EFFECTS } from './testEffects';

/*
 * The הנרץ' family share one design: dark light welling up from below, pale
 * light settling from above, and a field of particles. Only the palette and
 * the particle behaviour differ, so the two builders below take those as
 * parameters rather than the entries repeating the same twenty lines seven
 * times over. An effect that wants something else simply does not use them.
 */

/** How a wraith's particles move. */
type ParticleField = 'crossing' | 'rain' | 'ambient';

const WRAITH_TIMING = { duration: 5, fadeDuration: 2 } as const;

interface WraithPalette {
  /** Deep tone rising from the bottom edge. */
  dark: string;
  /** Pale tone settling from the top edge. */
  light: string;
  particle: string;
  particleAccent: string;
  field?: ParticleField;
}

function wraithModules({
  dark,
  light,
  particle,
  particleAccent,
  field = 'crossing',
}: WraithPalette): VFXModuleConfig[] {
  const particles: Record<ParticleField, VFXModuleConfig[]> = {
    // Two crossing streams, deliberately not mirror images — different speeds
    // and counts stop them reading as one symmetrical pattern.
    crossing: [
      { type: 'sparkles', direction: 'left', color: particle, count: 260, size: 1.4, speed: 3.2, scale: [12, 8, 5], noise: 0.4, ...WRAITH_TIMING },
      { type: 'sparkles', direction: 'right', color: particleAccent, count: 200, size: 1.1, speed: 2.4, scale: [12, 8, 5], noise: 0.6, ...WRAITH_TIMING },
    ],
    // Falling. Two layers at different speeds give it depth rather than one
    // flat sheet moving together.
    rain: [
      { type: 'sparkles', direction: 'down', gravity: 4, color: particle, count: 320, size: 1.1, speed: 3, scale: [13, 10, 5], ...WRAITH_TIMING },
      { type: 'sparkles', direction: 'down', gravity: 2, color: particleAccent, count: 210, size: 0.8, speed: 2, scale: [13, 10, 5], noise: 0.3, ...WRAITH_TIMING },
    ],
    // No travel direction, so the shader drifts them in place — sparkles
    // spread over the whole frame rather than crossing it.
    ambient: [
      { type: 'sparkles', color: particle, count: 340, size: 1.5, speed: 0.7, scale: [14, 10, 6], ...WRAITH_TIMING },
      { type: 'sparkles', color: particleAccent, count: 220, size: 1.0, speed: 0.4, scale: [9, 7, 4], ...WRAITH_TIMING },
    ],
  };

  return [
    { type: 'edgeGlow', edge: 'bottom', color: dark, intensity: 0.85, spread: 0.55, ...WRAITH_TIMING },
    { type: 'edgeGlow', edge: 'top', color: light, intensity: 0.5, spread: 0.42, ...WRAITH_TIMING },
    ...particles[field],
  ];
}

function wraithPresentation(title: string, accent: string, background: string): EffectPresentation {
  return {
    title,
    accentColor: accent,
    backgroundColor: background,
    glow: `0 0 50px ${accent}, 0 0 100px ${accent}59`,
    fontFamily: "'Palatino', serif",
    letterSpacing: '1px',
    textShadow: `0 0 12px ${accent}`,
  };
}

/**
 * Every custom character effect in the game.
 *
 * To add one: append an entry here. Nothing else needs to change — the modal
 * styling, the 3D layer and the trigger matching all read from this list.
 *
 * Order matters: the first entry with a matching trigger wins.
 */
export const CHARACTER_EFFECTS: CharacterEffect[] = [
  {
    id: 'hellish',
    triggers: [{ pattern: 'דיבי', match: 'prefix' }],
    presentation: {
      title: '🔱 SATAN THE ALL POWERFUL 🔱',
      accentColor: '#ff0000',
      backgroundColor: 'rgba(20, 0, 0, 0.95)',
      glow: '0 0 50px #ff0000, 0 0 100px #ff4500',
      fontFamily: "'Georgia', serif",
      textShadow: '0 0 10px #ff4500',
      shake: true,
      glitch: true,
    },
    modules: [
      // Short, hard red flash — it washes the whole screen, so it reads as a
      // punch rather than a filter. The embers below outlive it.
      { type: 'glow', color: '#ff0000', intensity: 0.6, fadeInDuration: 0.3, duration: 0.6, fadeDuration: 1.2 },
      { type: 'sparkles', color: '#ff4400', count: 300, size: 1.5, speed: 4, direction: 'up', duration: 4, fadeDuration: 2 },
    ],
  },
  {
    id: 'wraith-purple',
    triggers: [{ pattern: "אשת הנרץ' הסגולה", match: 'prefix' }],
    presentation: wraithPresentation(
      "אשת הנרץ' הסגולה",
      '#c77dff',
      'rgba(18, 4, 32, 0.95)',
    ),
    modules: wraithModules({
      dark: '#3d0a6b',
      light: '#c77dff',
      particle: '#a322ff',
      particleAccent: '#e0aaff',
    }),
  },
  {
    id: 'wraith-white',
    triggers: [{ pattern: "איש הנרץ' הלבן- לוטוס", match: 'prefix' }],
    presentation: wraithPresentation(
      "💮 איש הנרץ' הלבן- לוטוס 💮",
      '#e8e8f2',
      'rgba(20, 20, 25, 0.95)',
    ),
    modules: wraithModules({
      dark: '#3a3a4a',
      light: '#ffffff',
      particle: '#ffffff',
      particleAccent: '#d8d8e6',
    }),
  },
  {
    id: 'wraith-red',
    triggers: [{ pattern: "איש הנרץ' האדום", match: 'prefix' }],
    // Deeper and less orange than the document's own #ff1f1f — asked for
    // something closer to blood than to a warning light.
    presentation: wraithPresentation(
      "איש הנרץ' האדום",
      '#d92626',
      'rgba(26, 3, 4, 0.95)',
    ),
    modules: wraithModules({
      dark: '#3d0203',
      light: '#a81111',
      particle: '#c41818',
      particleAccent: '#7a0d0d',
    }),
  },
  {
    id: 'wraith-yellow',
    triggers: [{ pattern: "איש הנרץ' הצהוב", match: 'prefix' }],
    presentation: wraithPresentation(
      "👑 איש הנרץ' הצהוב 📖",
      '#ffe95c',
      'rgba(26, 22, 3, 0.95)',
    ),
    modules: wraithModules({
      dark: '#4a3a05',
      light: '#ffe95c',
      particle: '#ffe95c',
      particleAccent: '#ffd000',
      field: 'ambient',
    }),
  },
  {
    id: 'wraith-blue',
    triggers: [{ pattern: "אשת הנרץ' הכחולה- לנה", match: 'prefix' }],
    presentation: wraithPresentation(
      "אשת הנרץ' הכחולה- לנה",
      '#8fbaff',
      'rgba(5, 12, 28, 0.95)',
    ),
    modules: wraithModules({
      dark: '#08183a',
      light: '#8fbaff',
      particle: '#8fbaff',
      particleAccent: '#4a86e8',
      field: 'rain',
    }),
  },
  {
    id: 'wraith-green',
    triggers: [{ pattern: "איש הנרץ' הירוק", match: 'prefix' }],
    presentation: wraithPresentation(
      "💰 איש הנרץ' הירוק ⚔️",
      '#5cff5c',
      'rgba(3, 22, 8, 0.95)',
    ),
    modules: wraithModules({
      dark: '#043410',
      light: '#6dff6d',
      particle: '#46ff46',
      particleAccent: '#0bc10b',
    }),
  },
  {
    id: 'wraith-black',
    triggers: [{ pattern: "איש הנרץ' השחור", match: 'prefix' }],
    // The character's own colour is #080808, which cannot glow: the layer is
    // added to the frame, so black adds nothing at all. A charcoal with a
    // violet cast below and silver above keeps it dark without being invisible.
    presentation: wraithPresentation(
      "🎵 איש הנרץ' השחור 🎶",
      '#b9c0d4',
      'rgba(10, 10, 14, 0.96)',
    ),
    modules: wraithModules({
      dark: '#241f33',
      light: '#9aa0b5',
      particle: '#c9cede',
      particleAccent: '#6e7488',
    }),
  },
];

/** Game effects plus the developer sandbox. Game effects match first. */
const ALL_EFFECTS: CharacterEffect[] = [...CHARACTER_EFFECTS, ...TEST_EFFECTS];

/** The app's brand colour, used when a character has no colour of its own. */
const DEFAULT_ACCENT = '#646cff';

const DEFAULT_TITLE = '🎊 The Results are In! 🎊';

function triggerMatches(name: string, trigger: EffectTrigger): boolean {
  if (trigger.match === 'regex') {
    try {
      return new RegExp(trigger.pattern, trigger.caseSensitive ? '' : 'i').test(name);
    } catch {
      console.warn(`[registry] Invalid regex trigger: ${trigger.pattern}`);
      return false;
    }
  }

  const subject = trigger.caseSensitive ? name : name.toLowerCase();
  const pattern = trigger.caseSensitive ? trigger.pattern : trigger.pattern.toLowerCase();

  switch (trigger.match) {
    case 'exact':
      return subject === pattern;
    case 'prefix':
      return subject.startsWith(pattern);
    case 'contains':
      return subject.includes(pattern);
  }
}

/** The first effect whose triggers match this character name, if any. */
export function matchCharacterEffect(name: string): CharacterEffect | null {
  const normalized = name.trim();
  if (!normalized) return null;

  return (
    ALL_EFFECTS.find((effect) =>
      effect.triggers.some((trigger) => triggerMatches(normalized, trigger)),
    ) ?? null
  );
}

/**
 * Flatten an effect (or the absence of one) into concrete modal styling.
 *
 * With no effect the modal borrows the winning character's own colour from the
 * document, which is why `characterColor` is passed in separately.
 */
export function resolvePresentation(
  effect: CharacterEffect | null,
  characterColor?: string,
): ResolvedPresentation {
  if (!effect) {
    const accent = characterColor || DEFAULT_ACCENT;
    return {
      title: DEFAULT_TITLE,
      borderColor: accent,
      boxShadow: `0 0 30px ${accent}66`,
      backgroundColor: characterColor ? `${characterColor}1a` : '#1e1e1e',
      // Left undefined so each winner renders in its own colour.
      winnerColor: undefined,
      buttonColor: DEFAULT_ACCENT,
      buttonTextColor: '#ffffff',
      shake: false,
      glitch: false,
    };
  }

  const p = effect.presentation;
  return {
    title: p.title,
    borderColor: p.accentColor,
    boxShadow: p.glow ?? `0 0 50px ${p.accentColor}`,
    backgroundColor: p.backgroundColor,
    winnerColor: p.accentColor,
    buttonColor: p.buttonColor ?? p.accentColor,
    buttonTextColor: p.buttonTextColor ?? '#ffffff',
    fontFamily: p.fontFamily,
    letterSpacing: p.letterSpacing,
    textShadow: p.textShadow,
    shake: p.shake ?? false,
    glitch: p.glitch ?? false,
  };
}
