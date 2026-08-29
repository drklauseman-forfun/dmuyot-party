import type {
  CharacterEffect,
  EffectTrigger,
  ResolvedPresentation,
} from './types';
import { TEST_EFFECTS } from './testEffects';

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
      { type: 'glow', color: '#ff0000', intensity: 0.6, duration: 4, fadeDuration: 2 },
      { type: 'sparkles', color: '#ff4400', count: 300, size: 1.5, speed: 4, direction: 'up', duration: 4, fadeDuration: 2 },
    ],
  },
  {
    id: 'elf',
    triggers: [{ pattern: 'אלף', match: 'prefix' }],
    presentation: {
      title: '🧝 ANCIENT SUMMON 🧝',
      accentColor: '#00ff88',
      backgroundColor: 'rgba(0, 20, 10, 0.95)',
      glow: '0 0 50px #00ff88, 0 0 80px rgba(0, 255, 136, 0.3)',
      buttonTextColor: '#000000',
      fontFamily: "'Trebuchet MS', sans-serif",
      textShadow: '0 0 10px #00ff44',
    },
    modules: [
      { type: 'fire', color: '#00ff88', scale: 3, position: [0, -2, 0], duration: 5, fadeDuration: 2 },
      { type: 'sparkles', color: '#00ff88', count: 150, size: 1, speed: 0.5, scale: 10, duration: 5, fadeDuration: 2 },
    ],
  },
  {
    id: 'legendary',
    triggers: [{ pattern: 'לגנדרי', match: 'prefix' }],
    presentation: {
      title: '✨ LEGENDARY HERO ✨',
      accentColor: '#ffd700',
      backgroundColor: 'rgba(25, 25, 0, 0.95)',
      glow: '0 0 60px #ffd700, 0 0 120px rgba(255, 215, 0, 0.4)',
      buttonTextColor: '#000000',
      fontFamily: "'Palatino', serif",
      letterSpacing: '2px',
      textShadow: '0 0 15px #ffffff',
    },
    modules: [
      { type: 'beams', color: '#fff2b2', duration: 6, fadeDuration: 2 },
      { type: 'glow', color: '#d4af37', intensity: 0.4, duration: 6, fadeDuration: 2 },
      { type: 'sparkles', color: '#ffd700', count: 200, size: 1.5, speed: 1, scale: 12, duration: 5, fadeDuration: 2 },
      { type: 'fire', color: '#ffd700', scale: 2, position: [0, -2, 0], duration: 4, fadeDuration: 2 },
    ],
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
