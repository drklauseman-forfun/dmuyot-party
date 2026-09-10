import { sanitizeValue } from '../vfx/params';
import type { NumberSpec } from '../vfx/params';
import { TIMING_SCHEMA } from '../vfx/schema';
import type { VFXModuleConfig } from '../vfx/types';
import type { AnimationTiming } from './types';

/**
 * One timing for every effect in an animation.
 *
 * Stored on the animation, and written into each of its effects whenever the
 * animation is sanitised. Playback therefore never has to know shared timing
 * exists, and an export opened by a build from before it still plays the same.
 */

/** Fade in, hold, fade out — the same labels, guides and bounds each effect has. */
export const TIMING_FIELDS: [keyof AnimationTiming, NumberSpec][] = (
  Object.keys(TIMING_SCHEMA) as (keyof AnimationTiming)[]
).map((key): [keyof AnimationTiming, NumberSpec] => [key, TIMING_SCHEMA[key]]);

/** A complete timing, every value in range, from anything. Never throws. */
export function sanitizeTiming(input: unknown): AnimationTiming {
  const source =
    typeof input === 'object' && input !== null && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const out = {} as AnimationTiming;
  for (const [key, spec] of TIMING_FIELDS) {
    out[key] = sanitizeValue(spec, source[key]) as number;
  }
  return out;
}

/**
 * Shared timing, or null for none. Anything that is not an object counts as
 * none, which is how an animation saved before shared timing existed loads.
 */
export function sanitizeSharedTiming(input: unknown): AnimationTiming | null {
  return typeof input === 'object' && input !== null && !Array.isArray(input) ? sanitizeTiming(input) : null;
}

export function defaultTiming(): AnimationTiming {
  return sanitizeTiming({});
}

/** The timing one effect has now — where switching shared timing on starts from. */
export function timingOf(module: VFXModuleConfig): AnimationTiming {
  return sanitizeTiming(module);
}

/** Every effect given this timing. Null leaves each with its own. */
export function withTiming(modules: VFXModuleConfig[], timing: AnimationTiming | null): VFXModuleConfig[] {
  if (!timing) return modules;
  return modules.map((module) => ({ ...module, ...timing }));
}

/** From the effects appearing to their being gone, in seconds. */
export function totalSeconds(timing: AnimationTiming): number {
  return timing.fadeInDuration + timing.duration + timing.fadeDuration;
}
