import type { CharacterEffect } from './types';
import type { VFXModuleConfig } from '../vfx/types';

/**
 * Developer sandbox effects.
 *
 * These exist so a VFX module can be eyeballed in isolation: type the trigger
 * name straight into the character list, spin, and watch.
 *
 * Local development only — registry.ts leaves them out of a production build.
 * They match `exact` but ignore case, so on the live site a hand-typed list
 * with someone called "Fireworks" would win one. The animation builder's
 * Animate button now covers most of what they were for.
 */

/**
 * Neutral modal styling so the 3D layer is what you're actually judging.
 * Marked side-effect free so a production build can drop the whole list.
 */
/*#__NO_SIDE_EFFECTS__*/
function sandbox(id: string, color: string, modules: VFXModuleConfig[]): CharacterEffect {
  return {
    id,
    triggers: [{ pattern: id, match: 'exact' }],
    presentation: {
      title: `🧪 ${id}`,
      accentColor: color,
      backgroundColor: 'rgba(20, 20, 20, 0.95)',
      glow: `0 0 40px ${color}`,
      buttonTextColor: '#000000',
    },
    modules,
  };
}

export const TEST_EFFECTS: CharacterEffect[] = [
  // --- GLOW ---
  sandbox('glowred', '#ff0000', [
    { type: 'glow', color: '#ff0000', intensity: 0.8, duration: 3, fadeDuration: 2 },
  ]),
  sandbox('glowgreen', '#00ff00', [
    { type: 'glow', color: '#00ff00', intensity: 0.8, duration: 3, fadeDuration: 2 },
  ]),
  sandbox('glowpurple', '#ff00ff', [
    { type: 'glow', color: '#ff00ff', intensity: 0.8, duration: 3, fadeDuration: 2 },
  ]),

  // --- SPARKLES (direction, gravity, noise) ---
  sandbox('sparklesup', '#00ccff', [
    { type: 'sparkles', color: '#00ccff', count: 500, size: 1.2, speed: 5, direction: 'up', scale: [10, 10, 5], noise: 0.5, duration: 4, fadeDuration: 2 },
  ]),
  sandbox('sparklesdown', '#ffff00', [
    { type: 'sparkles', color: '#ffff00', count: 500, size: 1.2, speed: 2, direction: 'down', gravity: 5.0, scale: [10, 10, 5], duration: 4, fadeDuration: 2 },
  ]),
  sandbox('sparklesrain', '#ffffff', [
    { type: 'sparkles', color: '#ffffff', count: 1000, size: 0.8, speed: 10, direction: 'down', gravity: 2.0, scale: [20, 20, 5], duration: 4, fadeDuration: 1 },
  ]),
  sandbox('sparklesfire', '#ff4400', [
    { type: 'sparkles', color: '#ff4400', count: 800, size: 1.8, speed: 3, direction: 'up', noise: 2.0, gravity: -1.0, scale: [5, 10, 5], duration: 4, fadeDuration: 2 },
  ]),

  // --- FIRE ---
  sandbox('firered', '#ff4400', [
    { type: 'fire', color: '#ff4400', scale: 4, position: [0, -2, 0], duration: 5, fadeDuration: 2 },
  ]),
  sandbox('fireblue', '#00ffff', [
    { type: 'fire', color: '#00ffff', scale: 3, position: [0, -2, 0], duration: 5, fadeDuration: 2 },
  ]),
  sandbox('firegreen', '#00ff88', [
    { type: 'fire', color: '#00ff88', scale: 5, position: [0, -2, 0], duration: 5, fadeDuration: 2 },
  ]),

  // --- BEAMS ---
  sandbox('beamsgold', '#ffd700', [
    { type: 'beams', color: '#ffd700', duration: 5, fadeDuration: 2 },
  ]),
  sandbox('beamswhite', '#ffffff', [
    { type: 'beams', color: '#ffffff', duration: 5, fadeDuration: 2 },
  ]),
  sandbox('beamsblue', '#00ccff', [
    { type: 'beams', color: '#00ccff', duration: 5, fadeDuration: 2 },
  ]),

  // --- FIREWORKS ---
  sandbox('fireworks', '#ffd76b', [
    { type: 'fireworks', fadeInDuration: 0.5, duration: 4, fadeDuration: 1.5 },
  ]),
  // One slow shell, for watching a single burst rise and open.
  sandbox('fireworksone', '#ff5f6d', [
    { type: 'fireworks', bursts: 1, sparksPerBurst: 160, interval: 1, riseTime: 1, life: 2.6, fadeInDuration: 0.4, duration: 5, fadeDuration: 1.5 },
  ]),

  // --- CLOCK ---
  sandbox('clockgreen', '#5dff9b', [
    { type: 'clock', color: '#7dffb0', radius: 0.28, marks: 12, hands: [{ rate: -2, length: 0.78, width: 0.028 }, { rate: 0.75, length: 0.5, width: 0.05 }, { rate: 5, length: 0.9, width: 0.016 }], fadeInDuration: 0.7, duration: 3, fadeDuration: 1.2 },
  ]),
  // Fast, finely divided, and running the other way — the pair covers both
  // directions.
  sandbox('clockfast', '#ffd76b', [
    { type: 'clock', color: '#ffd76b', radius: 0.34, marks: 24, hands: [{ rate: 6, length: 0.86 }], fadeInDuration: 0.4, duration: 4.5, fadeDuration: 1.2 },
  ]),

  // --- BLACK HOLE ---
  sandbox('blackhole', '#b9c0d4', [
    { type: 'blackHole', color: '#454b55', radius: 0.17, spin: 1, strands: 2.4, fadeInDuration: 0.3, duration: 4, fadeDuration: 1 },
  ]),
  // Off-centre and spinning the other way, which is also how to keep the core
  // clear of the winner's name.
  sandbox('blackholeblue', '#7fd4ff', [
    { type: 'blackHole', color: '#7fd4ff', radius: 0.22, spin: -1.6, center: [0.5, 0.26], strands: 4, fadeInDuration: 0.3, duration: 4, fadeDuration: 1 },
  ]),
];
