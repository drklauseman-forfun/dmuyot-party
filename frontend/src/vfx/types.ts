
export type VFXModuleType = 'glow' | 'sparkles' | 'fire' | 'beams';

export interface VFXModuleConfig {
  type: VFXModuleType;
  color?: string;
  intensity?: number;
  count?: number;
  scale?: number | [number, number, number];
  size?: number;
  speed?: number;
  /** Seconds to ramp from invisible to full. Default 1. */
  fadeInDuration?: number;
  /** Seconds to hold at full — NOT the module's total lifetime. Default 3. */
  duration?: number;
  /** Seconds to fade back out. Default 2. */
  fadeDuration?: number;
  direction?: 'up' | 'down' | 'left' | 'right' | 'random';
  gravity?: number;
  noise?: number;
  position?: [number, number, number];
}

/** What the 3D layer needs to play one effect. Built from a registry entry. */
export interface EffectConfig {
  /** Registry id of the effect that produced this, for logging. */
  effectId: string;
  modules: VFXModuleConfig[];
  /** Bumped on every trigger so a repeat winner still restarts the canvas. */
  timestamp: number;
}
