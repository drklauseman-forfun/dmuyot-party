import type { CharacterEffect } from './types';
import type { VFXModuleConfig } from '../vfx/types';

/**
 * Developer sandbox effects.
 *
 * These exist so a VFX module can be eyeballed in isolation: type the trigger
 * name straight into the character list, spin, and watch. They match `exact`
 * so they can never collide with a real character name.
 *
 * Not part of the game — drop the import in registry.ts to ship without them.
 */

/** Neutral modal styling so the 3D layer is what you're actually judging. */
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

  // --- BLACK HOLE ---
  sandbox('blackhole', '#ffb066', [
    { type: 'blackHole', color: '#ffb066', radius: 0.16, spin: 1, fadeInDuration: 1.2, duration: 4, fadeDuration: 2.5 },
  ]),
  // Off-centre and spinning the other way, which is also how to keep the core
  // clear of the winner's name.
  sandbox('blackholeblue', '#7fd4ff', [
    { type: 'blackHole', color: '#7fd4ff', radius: 0.22, spin: -1.6, center: [0.5, 0.26], fadeInDuration: 1.2, duration: 4, fadeDuration: 2.5 },
  ]),
];
