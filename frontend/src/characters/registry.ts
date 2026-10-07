import type {
  CharacterEffect,
  EffectPresentation,
  EffectTrigger,
  ResolvedPresentation,
} from './types';
import type { VFXModuleConfig } from '../vfx/types';
import { MEME_GIFS } from '../vfx/giphy';
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
        center: [0.5, 0.76],
        intensity: 1,
        fadeInDuration: 0.6,
        duration: 4,
        fadeDuration: 1.5,
      },
      // Dark brown eyes opening one after another around the screen, each
      // glancing about on its own.
      {
        type: 'eyes',
        count: 20,
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
  {
    id: 'ethereal-emma',
    // The bracketed marker is part of the name, and it is also what keeps
    // this clear of אמה סוואן, who is already in the long list.
    triggers: [{ pattern: 'אמה [נ]', match: 'prefix' }],
    presentation: {
      title: 'אמה',
      accentColor: '#bfe8ff',
      backgroundColor: 'rgba(7, 13, 22, 0.95)',
      glow: '0 0 50px #bfe8ff44, 0 0 110px #1d4a6e55',
      fontFamily: "'Palatino', serif",
      letterSpacing: '2px',
      textShadow: '0 0 14px #bfe8ff',
    },
    modules: [
      // A whale of light crossing high up, over the name rather than through
      // it, with its tail beating as it goes.
      { type: 'creatures', style: 'whale', direction: 'left', lane: 0.83, size: 0.95, speed: 1, color: '#bfe8ff', intensity: 0.95, fadeInDuration: 0.8, duration: 5, fadeDuration: 1.6 },
      // Critters along the foot of the screen and up both sides.
      { type: 'creatures', style: 'critters', edge: 'bottom', direction: 'left', count: 14, size: 0.07, speed: 1.3, color: '#cdf2ff', intensity: 0.9, fadeInDuration: 0.5, duration: 5, fadeDuration: 1.6 },
      { type: 'creatures', style: 'critters', edge: 'left', direction: 'right', count: 8, size: 0.06, speed: 1, color: '#cdf2ff', intensity: 0.85, fadeInDuration: 0.6, duration: 5, fadeDuration: 1.6 },
      { type: 'creatures', style: 'critters', edge: 'right', direction: 'left', count: 8, size: 0.06, speed: 1.1, color: '#cdf2ff', intensity: 0.85, fadeInDuration: 0.7, duration: 5, fadeDuration: 1.6 },
      // Motes drifting in the water around them.
      { type: 'sparkles', color: '#bfe8ff', count: 140, size: 1.1, speed: 0.5, scale: [12, 9, 5], noise: 0.5, blend: 'add', maxPixelSize: 70, fadeInDuration: 0.8, duration: 5, fadeDuration: 1.6 },
    ],
  },
  {
    id: 'black-lady',
    // Four words of Hebrew; nothing else in either document begins with them.
    triggers: [{ pattern: 'הגבירה השחורה', match: 'prefix' }],
    presentation: {
      title: 'הגבירה השחורה',
      // Candlelight on the modal: everything around it goes dark.
      accentColor: '#d8bd84',
      backgroundColor: 'rgba(6, 6, 7, 0.96)',
      glow: '0 0 40px #d8bd8444, 0 0 90px #00000088',
      fontFamily: "'Palatino', serif",
      letterSpacing: '2px',
      textShadow: '0 0 14px #d8bd8499',
    },
    modules: [
      // Black silk on a brass rod, hung over the results box itself and
      // falling the whole way down it. A full-screen cloth was tried first,
      // then a shorter one, and neither read as a curtain; this one is sized
      // to the box on every screen and shines silver down each fold. Sheer,
      // so the name still shows through it.
      { type: 'curtain', style: 'falling', over: 'results', color: '#0b0b0e', coverage: 1, fall: 1.1, folds: 7, sheen: 0.85, intensity: 0.84, fadeInDuration: 0.3, duration: 5, fadeDuration: 1.6 },
      // One candle, caught a moment after the cloth lands.
      { type: 'candles', count: 1, center: [0.5, 0.09], size: 0.28, spread: 0, color: '#ffb03a', intensity: 1, fadeInDuration: 0.5, duration: 5, fadeDuration: 1.6 },
    ],
  },
  {
    id: 'arsenal-juliet',
    // The backslash is part of the name, so it is part of the pattern; in a
    // TypeScript string it has to be written twice to mean one.
    triggers: [{ pattern: "ג'ול\\ייט", match: 'prefix' }],
    presentation: {
      title: "ג'ול\\ייט",
      accentColor: '#e3e7ee',
      backgroundColor: 'rgba(12, 12, 14, 0.95)',
      glow: '0 0 50px #e3e7ee44, 0 0 100px #8a1f2a44',
      fontFamily: "'Georgia', serif",
      letterSpacing: '1px',
      textShadow: '0 0 12px #e3e7ee',
      shake: true,
    },
    modules: [
      // Six kinds of weapon, each its own call, so they keep their own rates
      // and never fall into one rhythm.
      { type: 'weapons', style: 'pistol', side: 'left', count: 2, rate: 2.2, size: 0.16, color: '#ffffff', intensity: 1, fadeInDuration: 0.4, duration: 5, fadeDuration: 1.4 },
      { type: 'weapons', style: 'rifle', side: 'right', count: 2, rate: 1.6, size: 0.17, color: '#ffffff', intensity: 1, fadeInDuration: 0.5, duration: 5, fadeDuration: 1.4 },
      { type: 'weapons', style: 'cannon', side: 'left', count: 1, rate: 0.7, size: 0.21, color: '#ffffff', intensity: 1, fadeInDuration: 0.6, duration: 5, fadeDuration: 1.4 },
      { type: 'weapons', style: 'laser', side: 'right', count: 1, rate: 3.2, size: 0.14, color: '#ffffff', intensity: 1, fadeInDuration: 0.4, duration: 5, fadeDuration: 1.4 },
      { type: 'weapons', style: 'bow', side: 'left', count: 1, rate: 0.9, size: 0.2, color: '#ffffff', intensity: 1, fadeInDuration: 0.7, duration: 5, fadeDuration: 1.4 },
      { type: 'weapons', style: 'missile', side: 'right', count: 1, rate: 1.1, size: 0.16, color: '#ffffff', intensity: 1, fadeInDuration: 0.6, duration: 5, fadeDuration: 1.4 },
      // Machines reaching up from below, and one porcelain hand coming down.
      { type: 'hands', style: 'robotic', edge: 'bottom', count: 5, size: 0.52, reach: 0.85, spread: 0.88, color: '#ffffff', intensity: 1, fadeInDuration: 0.5, duration: 5, fadeDuration: 1.4 },
      { type: 'hands', style: 'porcelain', edge: 'top', count: 1, size: 0.62, reach: 0.88, spread: 0, color: '#ffffff', intensity: 1, fadeInDuration: 0.9, duration: 5, fadeDuration: 1.4 },
    ],
  },
  {
    id: 'timekeeper-ara',
    // The bracketed marker is part of the name in the document, and it is
    // what keeps a three-letter trigger from catching anything else.
    triggers: [{ pattern: 'ארה [נ]', match: 'prefix' }],
    presentation: {
      title: 'ארה',
      accentColor: '#9fd7ff',
      backgroundColor: 'rgba(10, 12, 16, 0.95)',
      glow: '0 0 50px #9fd7ff55, 0 0 100px #2a4a6a55',
      fontFamily: "'Courier New', monospace",
      letterSpacing: '2px',
      textShadow: '0 0 12px #9fd7ff',
      glitch: true,
    },
    modules: [
      // Someone in a suit, well back and barely there, with the hand held out
      // in front of them.
      { type: 'figure', style: 'suit', center: [0.5, 0.46], size: 0.95, color: '#ffffff', intensity: 0.26, fadeInDuration: 0.8, duration: 5, fadeDuration: 1.5 },
      // Both sides lined with machines for telling the time. One effect draws
      // one machine, so a wall of them is the effect called over and over.
      { type: 'timepieces', style: 'analogue', center: [0.12, 0.84], size: 0.17, color: '#ffffff', speed: 2, intensity: 1, fadeInDuration: 0.5, duration: 5, fadeDuration: 1.5 },
      { type: 'timepieces', style: 'hourglass', center: [0.13, 0.63], size: 0.19, color: '#ffffff', speed: 1, intensity: 1, fadeInDuration: 0.6, duration: 5, fadeDuration: 1.5 },
      { type: 'timepieces', style: 'digital', center: [0.13, 0.42], size: 0.1, color: '#ffffff', speed: 3, intensity: 1, fadeInDuration: 0.7, duration: 5, fadeDuration: 1.5 },
      { type: 'timepieces', style: 'metronome', center: [0.12, 0.18], size: 0.19, color: '#ffffff', speed: 2.4, intensity: 1, fadeInDuration: 0.8, duration: 5, fadeDuration: 1.5 },
      { type: 'timepieces', style: 'metronome', center: [0.88, 0.84], size: 0.18, color: '#ffffff', speed: 1.8, intensity: 1, fadeInDuration: 0.55, duration: 5, fadeDuration: 1.5 },
      { type: 'timepieces', style: 'analogue', center: [0.88, 0.63], size: 0.15, color: '#ffffff', speed: 4, intensity: 1, fadeInDuration: 0.65, duration: 5, fadeDuration: 1.5 },
      { type: 'timepieces', style: 'hourglass', center: [0.87, 0.4], size: 0.17, color: '#ffffff', speed: 1.5, intensity: 1, fadeInDuration: 0.75, duration: 5, fadeDuration: 1.5 },
      // Top centre rather than the bottom right, where the handshake comes in.
      { type: 'timepieces', style: 'digital', center: [0.5, 0.9], size: 0.1, color: '#ffffff', speed: 6, intensity: 1, fadeInDuration: 0.85, duration: 5, fadeDuration: 1.5 },
      // A hand held out to shake on a deal, from a suit sleeve, coming in
      // from the right below the results. An open palm facing the viewer
      // was tried first and read as "stop" rather than as an offer.
      { type: 'hands', style: 'deal', edge: 'right', count: 1, position: 0.14, size: 0.64, reach: 0.95, spread: 0, tilt: 6, color: '#ffffff', intensity: 1, fadeInDuration: 0.6, duration: 5, fadeDuration: 1.5 },
      // Two glitches at different rates, so the breaking up never falls into
      // a rhythm.
      { type: 'glitch', style: 'tear', color: '#9fd7ff', rate: 2.4, coverage: 0.3, intensity: 0.9, fadeInDuration: 0.3, duration: 5, fadeDuration: 1.5 },
      { type: 'glitch', style: 'split', color: '#9fd7ff', rate: 1.3, coverage: 0.45, intensity: 0.8, fadeInDuration: 0.3, duration: 5, fadeDuration: 1.5 },
    ],
  },
  {
    id: 'duality-ayit',
    // The bracketed marker is part of the name in the document, and it is what
    // keeps this clear of anything else starting with the same three letters.
    triggers: [{ pattern: 'אייט [נ]', match: 'prefix' }],
    presentation: {
      title: 'אייט',
      // Silver on the modal: the left of the frame goes black and the right
      // goes white, so the text has to carry itself against either.
      accentColor: '#dcdce6',
      backgroundColor: 'rgba(10, 10, 12, 0.96)',
      glow: '0 0 50px #ffffff40, 0 0 100px #00000080',
      fontFamily: "'Palatino', serif",
      letterSpacing: '1px',
      textShadow: '0 0 12px #ffffff80',
    },
    modules: [
      // White light from the right, darkness from the left. Black added to a
      // frame changes nothing, so that side paints over instead — see the
      // black wraith.
      { type: 'edgeGlow', edge: 'right', color: '#ffffff', intensity: 0.5, spread: 0.42, blend: 'add', fadeInDuration: 0.6, duration: 4, fadeDuration: 1.5 },
      { type: 'edgeGlow', edge: 'left', color: '#000000', intensity: 0.8, spread: 0.45, blend: 'normal', fadeInDuration: 0.6, duration: 4, fadeDuration: 1.5 },
      // Black rising, white falling. The black ones paint over as well, and
      // are capped in size: painted over, a near particle becomes a disc that
      // swallows the picture.
      { type: 'sparkles', direction: 'up', color: '#000000', count: 310, size: 1.6, speed: 2.6, scale: [12, 9, 5], noise: 0.35, blend: 'normal', maxPixelSize: 60, fadeInDuration: 0.6, duration: 4, fadeDuration: 1.5 },
      { type: 'sparkles', direction: 'down', color: '#ffffff', count: 280, size: 1.3, speed: 2.2, scale: [12, 9, 5], noise: 0.25, blend: 'add', maxPixelSize: 90, fadeInDuration: 0.6, duration: 4, fadeDuration: 1.5 },
    ],
  },
  {
    id: 'meme-berry',
    // Two words, like איש הזיקוקים. Not in either document yet, so unchecked
    // against the real list; nothing there begins with it. First spelled
    // ברי אזומה by mistake.
    triggers: [{ pattern: 'בארי אזומה', match: 'prefix' }],
    presentation: {
      title: 'בארי אזומה',
      // Meme captions: yellow and white letters with a hard black outline.
      accentColor: '#ffe14d',
      backgroundColor: 'rgba(12, 12, 12, 0.94)',
      glow: '0 0 40px #ffe14d99',
      fontFamily: "Impact, 'Arial Black', sans-serif",
      letterSpacing: '1px',
      textShadow: '-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000',
      shake: true,
    },
    // A longer hold than most, so memes on a slow connection still get their turn.
    modules: [
      // As many at once as the effect allows, a different eight of the
      // hand-picked memes every time.
      {
        type: 'memes',
        gifs: [...MEME_GIFS],
        count: 8,
        size: 0.3,
        tilt: 12,
        intensity: 1,
        fadeInDuration: 0.4,
        duration: 5,
        fadeDuration: 1.2,
      },
      {
        type: 'words',
        words: ['גרומבה', 'scomba'],
        count: 14,
        colors: ['#ffffff', '#ffe14d', '#7df9ff'],
        outlineColor: '#000000',
        size: 0.075,
        tilt: 25,
        intensity: 1,
        fadeInDuration: 0.4,
        duration: 5,
        fadeDuration: 1.2,
      },
    ],
  },
  {
    id: 'sun-san',
    // The bracketed marker is part of the name in the document, and here it
    // also earns its place: סאם and סאלין share the first two letters, so
    // without it a shorter pattern would reach towards both.
    triggers: [{ pattern: 'סאן [נ]', match: 'prefix' }],
    presentation: {
      title: 'סאן',
      accentColor: '#ffd166',
      backgroundColor: 'rgba(16, 11, 6, 0.95)',
      glow: '0 0 50px #ffb34d66, 0 0 110px #ff9d4d33',
      fontFamily: "'Georgia', serif",
      letterSpacing: '1px',
      textShadow: '0 0 14px #ffd16699',
    },
    modules: [
      // The sun hangs at the very top. The second number is measured from the
      // BOTTOM, so 0.92 is near the top of the frame, not near the bottom.
      // Measured at both shapes rather than guessed: on a phone the disc
      // spans the top 1% to 15% of the height — a whole sun tucked under the
      // edge — and on a wide screen, where it is sized by the shorter side
      // and so larger in proportion, it covers the top 23% and runs off the
      // edge. Clear of the results box either way; only the rays' falloff
      // reaches that far.
      {
        type: 'sun',
        center: [0.5, 0.92],
        radius: 0.15,
        rays: 16,
        rayLength: 2.2,
        spin: 0.6,
        surface: 1.1,
        color: '#ffd166',
        rayColor: '#ff9d4d',
        intensity: 1,
        fadeInDuration: 0.9,
        duration: 4.5,
        fadeDuration: 1.6,
      },
      // Small white motes drifting down through it. Slow and barely stirred:
      // this is dust in sunlight, not snow. The count was measured against
      // the white particles already shipped in אייט, which come out at about
      // the same brightness over the frame. Capped well below the default
      // ceiling, since a particle drifting near the camera is otherwise
      // unbounded and one large disc would undo the whole look.
      {
        type: 'sparkles',
        direction: 'down',
        color: '#ffffff',
        count: 650,
        size: 0.9,
        speed: 0.9,
        scale: [12, 9, 5],
        noise: 0.18,
        gravity: 0,
        blend: 'add',
        maxPixelSize: 40,
        fadeInDuration: 0.9,
        duration: 4.5,
        fadeDuration: 1.6,
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
