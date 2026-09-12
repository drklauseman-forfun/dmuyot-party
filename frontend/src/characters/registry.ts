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
  /** 'normal' for particles meant to read as dark rather than as light. */
  particleBlend?: 'add' | 'normal';
  darkIntensity?: number;
  lightIntensity?: number;
  /**
   * Scales how many particles there are. Dark particles paint over the frame
   * rather than adding to it, so at the usual density they cover the glow they
   * are supposed to be seen against and the whole picture goes black.
   */
  particleDensity?: number;
  /** Scales particle size, for the same reason as particleDensity. */
  particleSize?: number;
  /** Caps how large a particle can grow as it nears the camera. */
  particleMaxPixels?: number;
  /** 'normal' for glows meant to darken the frame rather than light it. */
  glowBlend?: 'add' | 'normal';
}

function wraithModules({
  dark,
  light,
  particle,
  particleAccent,
  field = 'crossing',
  particleBlend = 'add',
  darkIntensity = 0.85,
  lightIntensity = 0.5,
  particleDensity = 1,
  particleSize = 1,
  particleMaxPixels,
  glowBlend = 'add',
}: WraithPalette): VFXModuleConfig[] {
  const blend = particleBlend;
  const n = (count: number) => Math.round(count * particleDensity);
  const z = (size: number) => +(size * particleSize).toFixed(2);
  const cap = particleMaxPixels === undefined ? {} : { maxPixelSize: particleMaxPixels };
  const particles: Record<ParticleField, VFXModuleConfig[]> = {
    // Two crossing streams, deliberately not mirror images — different speeds
    // and counts stop them reading as one symmetrical pattern.
    crossing: [
      { type: 'sparkles', direction: 'left', color: particle, count: n(260), size: z(1.4), speed: 3.2, scale: [12, 8, 5], noise: 0.4, blend, ...cap, ...WRAITH_TIMING },
      { type: 'sparkles', direction: 'right', color: particleAccent, count: n(200), size: z(1.1), speed: 2.4, scale: [12, 8, 5], noise: 0.6, blend, ...cap, ...WRAITH_TIMING },
    ],
    // Falling. Two layers at different speeds give it depth rather than one
    // flat sheet moving together.
    rain: [
      { type: 'sparkles', direction: 'down', gravity: 4, color: particle, count: n(320), size: z(1.1), speed: 3, scale: [13, 10, 5], blend, ...cap, ...WRAITH_TIMING },
      { type: 'sparkles', direction: 'down', gravity: 2, color: particleAccent, count: n(210), size: z(0.8), speed: 2, scale: [13, 10, 5], noise: 0.3, blend, ...cap, ...WRAITH_TIMING },
    ],
    // No travel direction, so the shader drifts them in place — sparkles
    // spread over the whole frame rather than crossing it.
    ambient: [
      { type: 'sparkles', color: particle, count: n(340), size: z(1.5), speed: 0.7, scale: [14, 10, 6], blend, ...cap, ...WRAITH_TIMING },
      { type: 'sparkles', color: particleAccent, count: n(220), size: z(1.0), speed: 0.4, scale: [9, 7, 4], blend, ...cap, ...WRAITH_TIMING },
    ],
  };

  return [
    { type: 'edgeGlow', edge: 'bottom', color: dark, intensity: darkIntensity, spread: 0.55, blend: glowBlend, ...WRAITH_TIMING },
    { type: 'edgeGlow', edge: 'top', color: light, intensity: lightIntensity, spread: 0.42, blend: glowBlend, ...WRAITH_TIMING },
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
 * Every built-in animation in the game. People's own, made in the animation
 * builder, live in animations/store.ts and win over these for the name they
 * were saved under.
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
      dark: '#4f4f63',
      light: '#ffffff',
      particle: '#ffffff',
      particleAccent: '#f2f2fa',
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
    // Silver on the modal itself — the text has to stay readable while the
    // frame around it goes dark.
    presentation: wraithPresentation(
      "🎵 איש הנרץ' השחור 🎶",
      '#b9c0d4',
      'rgba(10, 10, 14, 0.96)',
    ),
    modules: wraithModules({
      // The only wraith whose light goes the other way: black added to a frame
      // changes nothing, so these paint over it instead and the edges go dark
      // rather than bright. Both edges close in; the particles are black on
      // top of that, visible where they cross the lit interface beneath.
      dark: '#000000',
      light: '#000000',
      particle: '#000000',
      particleAccent: '#050508',
      glowBlend: 'normal',
      particleBlend: 'normal',
      // Strong enough to read as darkness closing in, short of swallowing the
      // modal — the winner's name still has to be legible through it.
      darkIntensity: 0.78,
      lightIntensity: 0.55,
      particleDensity: 1.05,
      particleSize: 1.65,
      particleMaxPixels: 60,
    }),
  },
  {
    id: 'blackhole-sam',
    // The source is part of the pattern here. Every other trigger is a long
    // enough name to stand alone; "סאם" is three characters and would fire on
    // anything else beginning with them.
    triggers: [{ pattern: 'סאם (מגהברס 1)', match: 'prefix' }],
    presentation: {
      title: '🕳️ סאם 🕳️',
      // Silver, like the black wraith's: the frame goes dark around the modal,
      // so the text has to carry itself.
      accentColor: '#b9c0d4',
      backgroundColor: 'rgba(8, 8, 10, 0.96)',
      glow: '0 0 50px #6e7480, 0 0 100px #6e748059',
      fontFamily: "'Palatino', serif",
      letterSpacing: '1px',
      textShadow: '0 0 12px #b9c0d4',
    },
    // One module is the whole effect: the black hole darkens the frame around
    // itself, so it needs no edge glow underneath it.
    modules: [
      { type: 'blackHole', color: '#454b55', radius: 0.17, spin: 1, strands: 2.4, windUp: 18, fadeInDuration: 0.3, duration: 4.5, fadeDuration: 1 },
    ],
  },
  {
    id: 'clock-salin',
    // The source is in the pattern for the same reason as סאם's: the name on
    // its own is short enough to catch anything else beginning with it.
    triggers: [{ pattern: 'סאלין (הכל)', match: 'prefix' }],
    presentation: {
      title: '🕰️ סאלין 🕰️',
      accentColor: '#5dff9b',
      backgroundColor: 'rgba(4, 20, 11, 0.95)',
      glow: '0 0 50px #5dff9b, 0 0 100px #5dff9b59',
      fontFamily: "'Palatino', serif",
      letterSpacing: '1px',
      textShadow: '0 0 12px #5dff9b',
    },
    modules: [
      { type: 'edgeGlow', edge: 'bottom', color: '#5dff9b', intensity: 0.75, spread: 0.55, fadeInDuration: 0.7, duration: 3, fadeDuration: 1.2 },
      // Three hands at odds with each other: the long one running backwards,
      // the other two forwards at different rates, so no two ever line up.
      {
        type: 'clock',
        color: '#7dffb0',
        radius: 0.28,
        marks: 12,
        hands: [
          { rate: -2, length: 0.78, width: 0.028 },
          { rate: 0.75, length: 0.5, width: 0.05 },
          { rate: 5, length: 0.9, width: 0.016 },
        ],
        fadeInDuration: 0.7,
        duration: 3,
        fadeDuration: 1.2,
      },
    ],
  },
  {
    id: 'fireworks-man',
    // A long, distinctive name, so the name alone is unambiguous — unlike סאם
    // and סאלין, which needed their source in the pattern too.
    triggers: [{ pattern: 'איש הזיקוקים', match: 'prefix' }],
    presentation: {
      title: '🎆 איש הזיקוקים 🎆',
      accentColor: '#ffd76b',
      // Night sky, so the bursts have something to go off against.
      backgroundColor: 'rgba(10, 8, 20, 0.95)',
      glow: '0 0 50px #ffd76b, 0 0 100px #ff5f6d59',
      fontFamily: "'Palatino', serif",
      letterSpacing: '1px',
      textShadow: '0 0 12px #ffd76b',
    },
    modules: [
      // Fourteen shells packed into the same three and a half seconds, so seven
      // are alight at once rather than four. Measured at 32% of the frame lit
      // and 1.5% blown out — full, without swallowing the winner's name.
      { type: 'fireworks', bursts: 14, interval: 0.28, fadeInDuration: 0.6, duration: 4, fadeDuration: 1.5 },
    ],
  },
  {
    id: 'angel-evelyn',
    // Two words and long enough to stand alone, like איש הזיקוקים.
    triggers: [{ pattern: 'אבלין אלדורה', match: 'prefix' }],
    presentation: {
      title: '👁️ אבלין אלדורה 👁️',
      // Ivory and old gold on a warm dark ground: an angel, but not a bright one.
      accentColor: '#f1e4c3',
      backgroundColor: 'rgba(18, 13, 9, 0.95)',
      glow: '0 0 50px #f1e4c3, 0 0 100px #b08a5559',
      fontFamily: "'Palatino', serif",
      letterSpacing: '1px',
      textShadow: '0 0 12px #f1e4c3',
    },
    modules: [
      // Angel wings, curled up for a moment and then bursting open above the results.
      {
        type: 'wings',
        style: 'feathered',
        motion: 'burst',
        color: '#ffffff',
        size: 0.34,
        flap: 0.5,
        center: [0.5, 0.62],
        intensity: 1,
        fadeInDuration: 0.6,
        duration: 4,
        fadeDuration: 1.5,
      },
      // Dark brown eyes opening one after another around the screen, each
      // glancing about on its own.
      {
        type: 'eyes',
        count: 10,
        size: 0.12,
        irisColor: '#4a2a14',
        gaze: 'wander',
        blinkRate: 0.25,
        intensity: 1,
        fadeInDuration: 0.6,
        duration: 4,
        fadeDuration: 1.5,
      },
    ],
  },
];

/**
 * Game effects, plus the developer sandbox when running locally. The sandbox
 * stays off the live site: its triggers are single words matched without
 * regard to case, so a hand-typed list with someone called "Fireworks" would
 * otherwise win a test animation. Game effects match first.
 */
const ALL_EFFECTS: CharacterEffect[] = import.meta.env.DEV
  ? [...CHARACTER_EFFECTS, ...TEST_EFFECTS]
  : CHARACTER_EFFECTS;

/** The app's brand colour, used when a character has no colour of its own. */
const DEFAULT_ACCENT = '#646cff';

const DEFAULT_TITLE = '🎊 The Results are In! 🎊';

/**
 * A name reduced to what a trigger should compare against.
 *
 * Names arrive from documents carrying things that are invisible or incidental:
 * direction marks Google Docs puts around Hebrew, vowel points, runs of spaces,
 * a Hebrew geresh or curly apostrophe where the trigger has a plain one, and
 * whatever the parser left in front of the name — the backend on Render, still
 * on old code, turns "12 - Name" into "- Name". None of that should stop a
 * trigger from recognising the character, and none of it can make an unrelated
 * name match.
 */
function comparable(text: string): string {
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

function triggerMatches(name: string, trigger: EffectTrigger): boolean {
  if (trigger.match === 'regex') {
    try {
      return new RegExp(trigger.pattern, trigger.caseSensitive ? '' : 'i').test(name);
    } catch {
      console.warn(`[registry] Invalid regex trigger: ${trigger.pattern}`);
      return false;
    }
  }

  const subject = comparable(trigger.caseSensitive ? name : name.toLowerCase());
  const pattern = comparable(trigger.caseSensitive ? trigger.pattern : trigger.pattern.toLowerCase());

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
