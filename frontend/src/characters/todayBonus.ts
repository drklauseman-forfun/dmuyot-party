import type { VFXModuleConfig } from '../vfx/types';

/**
 * TEMPORARY — asked for on 2026-11-13, to be reverted.
 *
 * Every chosen character gets these on top of whatever animation is theirs:
 * a yellow flash, a few yellow particles, and sparkles. Not a character
 * effect and not in the registry, because it belongs to no character — it is
 * appended to whatever `playEffect` was going to render, so a character with
 * an animation gets both and a character with none gets just this.
 *
 * To revert: delete this file, and in `App.tsx` remove the import, the
 * `extraModules` parameter of `playEffect` and the two lines in
 * `announceWinners` that build `bonus`. Nothing else refers to it.
 *
 * Deliberately not written into the registry or the saved animations: nobody's
 * stored animation changes, so taking it out again leaves no trace and cannot
 * strand an animation that was built while it was on.
 */

/** A yellow somewhere between gold and a highlighter, so it reads on a dark page. */
const YELLOW = '#ffd21e';

export const TODAY_BONUS_MODULES: VFXModuleConfig[] = [
  // The flash. Nearly all of its life is the fade out, so it hits hard and
  // falls away rather than sitting as a yellow film over the results.
  {
    type: 'glow',
    color: YELLOW,
    intensity: 0.45,
    fadeInDuration: 0.08,
    duration: 0.1,
    fadeDuration: 0.55,
  },
  // "A bit of yellow particles": few, large and slow, drifting upward, so they
  // read as embers lifting off rather than a cloud.
  {
    type: 'sparkles',
    color: YELLOW,
    count: 90,
    scale: 11,
    size: 2.4,
    speed: 1.1,
    direction: 'up',
    noise: 0.5,
    blend: 'add',
    // Uncapped, a particle drifting close to the camera becomes a vast disc.
    // These are large to begin with, so they need the ceiling more than the
    // default particles do.
    maxPixelSize: 60,
    fadeInDuration: 0.25,
    duration: 2.2,
    fadeDuration: 1.6,
  },
  // The sparkles proper: star-shaped glints that flare and die back, which is
  // a different module from the particles above and not a paler version of
  // them. Yellow like everything else here.
  {
    type: 'twinkle',
    color: YELLOW,
    count: 150,
    scale: 14,
    size: 3.4,
    speed: 3.4,
    points: 4,
    maxPixelSize: 44,
    fadeInDuration: 0.2,
    duration: 2.4,
    fadeDuration: 1.4,
  },
];
