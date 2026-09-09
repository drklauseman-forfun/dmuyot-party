/**
 * The shape of a VFX module, as authored in a character's effect.
 *
 * Each module type declares its own parameters, and the components render them
 * from the same declarations — so what a registry entry may say and what the
 * component accepts cannot drift apart.
 */

/**
 * Timing every module shares. A module's life is three phases, and its total
 * on-screen time is the sum of all three, not `duration` alone.
 */
export interface VFXTiming {
  /** Seconds to ramp from invisible to full. Default 1. */
  fadeInDuration?: number;
  /** Seconds to hold at full — NOT the module's total lifetime. Default 3. */
  duration?: number;
  /** Seconds to fade back out. Default 2. */
  fadeDuration?: number;
}

/** A flat wash of colour across the whole frame. */
export interface GlowParams extends VFXTiming {
  color?: string;
  /** Peak opacity, 0–1. */
  intensity?: number;
}

/** A cloud of points, optionally travelling in one direction. */
export interface SparklesParams extends VFXTiming {
  color?: string;
  count?: number;
  /** Half-extent of the spawn volume; one number, or per axis. */
  scale?: number | [number, number, number];
  size?: number;
  speed?: number;
  direction?: 'up' | 'down' | 'left' | 'right' | 'random';
  gravity?: number;
  /** Sideways turbulence. */
  noise?: number;
  /**
   * 'add' brightens whatever is behind it, which is what makes particles read
   * as light — but it cannot draw anything darker than the frame, so black
   * added to the scene is simply invisible. 'normal' paints over instead, so a
   * dark particle shows as a silhouette against a lit background.
   */
  blend?: 'add' | 'normal';
  /**
   * Ceiling on a particle's on-screen size, in pixels.
   *
   * Size scales with nearness to the camera, without bound — a particle that
   * drifts close becomes vast. Added to the frame that reads as a soft bloom
   * and is left alone by default, but a dark particle blending normally
   * becomes a disc that swallows the picture.
   */
  maxPixelSize?: number;
}

/** A shader flame on a plane. */
export interface FireParams extends VFXTiming {
  color?: string;
  scale?: number | [number, number, number];
  position?: [number, number, number];
}

/** Light bleeding in from one edge, fading with distance from it. */
export interface EdgeGlowParams extends VFXTiming {
  color?: string;
  /** Peak brightness at the edge, 0–1. */
  intensity?: number;
  edge?: 'top' | 'bottom' | 'left' | 'right';
  /** How far across the frame it reaches, 0–1. */
  spread?: number;
}

/** Soft vertical shafts of light across the top of the frame. */
export interface BeamsParams extends VFXTiming {
  color?: string;
}

/**
 * One module in an effect.
 *
 * A discriminated union rather than one interface with every field optional:
 * this way `{ type: 'glow', gravity: 5 }` is a compile error instead of a line
 * that silently does nothing, and an editor offers exactly the parameters the
 * chosen module understands.
 */
export type VFXModuleConfig =
  | ({ type: 'glow' } & GlowParams)
  | ({ type: 'sparkles' } & SparklesParams)
  | ({ type: 'fire' } & FireParams)
  | ({ type: 'beams' } & BeamsParams)
  | ({ type: 'edgeGlow' } & EdgeGlowParams);

export type VFXModuleType = VFXModuleConfig['type'];

/** What the 3D layer needs to play one effect. Built from a registry entry. */
export interface EffectConfig {
  /** Registry id of the effect that produced this, for logging. */
  effectId: string;
  modules: VFXModuleConfig[];
  /** Bumped on every trigger so a repeat winner still restarts the canvas. */
  timestamp: number;
}
