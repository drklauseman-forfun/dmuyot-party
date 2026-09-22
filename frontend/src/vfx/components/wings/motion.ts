import { useFadeClock } from '../fadeClock';
import type { FadeClock } from '../fadeClock';

/**
 * How the wings move, shared by both styles: how open they are at each
 * moment, and the wingbeat. Also how big one wing unit is on screen.
 */

export type WingMotion = 'burst' | 'gentle';

/** Seconds a bursting wing stays curled up, and is seen to, before it opens. */
export const BURST_DELAY = 0.25;

/**
 * How much of the frame's height a wing unit may be measured against.
 *
 * Wings were sized by the frame's shorter side. A spread wing reaches about
 * 1.1 units above its shoulders, and on a wide screen that made them too tall
 * for the space above the results: raised to clear the text, their tips ran
 * off the top. Measured against 0.62 of the height instead, they fit there at
 * the default size and centre. A portrait phone is narrower than that, so it
 * is still sized by its width, exactly as before.
 */
const HEIGHT_SHARE = 0.62;

/** The length of one wing unit in the frame, for an authored `size`. */
export function wingUnit(size: number, viewport: { width: number; height: number }): number {
  return size * Math.min(viewport.width, viewport.height * HEIGHT_SHARE);
}

/** The fade every frame-driven effect shares; see fadeClock.ts. */
export type WingClock = FadeClock;
export const useWingClock = useFadeClock;

/** What a wing style needs to draw itself. */
export interface WingRigProps {
  color: string;
  size: number;
  flap: number;
  center: [number, number];
  intensity: number;
  motion: WingMotion;
  clock: WingClock;
  /** Seconds after the first frame at which the fade out begins. */
  holdEnds: number;
}

/**
 * How open the wings are: 0 curled up, 1 spread.
 *
 * A burst holds them curled for a moment, then lets them go like a spring:
 * fully spread after about half a second, a little past it at one, settled by
 * two. The overshoot is what makes it read as a burst rather than a slide.
 * The first version was spread in under a fifth of a second, and read as a
 * jump. Burst wings fold away again as the effect fades; gentle wings are
 * open from the start and stay open while they fade.
 */
export function openAmount(motion: WingMotion, elapsed: number, strength: number, fadingOut: boolean): number {
  if (motion === 'gentle') return 1;
  const t = Math.max(0, elapsed - BURST_DELAY);
  const open = 1 - Math.exp(-2.4 * t) * Math.cos(2.85 * t);
  return fadingOut ? open * strength : open;
}

/** The wingbeat, in radians at the shoulder. Gentle wings barely stir. */
export function wingbeat(motion: WingMotion, elapsed: number, flap: number, open: number): number {
  const amplitude = motion === 'gentle' ? 0.06 : 0.11;
  return Math.sin(elapsed * flap * Math.PI * 2) * amplitude * Math.min(Math.max(open, 0), 1);
}
