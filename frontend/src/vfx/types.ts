
export type VFXTheme = 'hellish' | 'elf' | 'legendary' | 'none';
export type VFXModuleType = 'glow' | 'sparkles' | 'fire' | 'beams';

export interface VFXModuleConfig {
  type: VFXModuleType;
  color?: string;
  intensity?: number;
  count?: number;
  scale?: number | [number, number, number];
  size?: number;
  speed?: number;
  duration?: number;
  fadeDuration?: number;
  direction?: 'up' | 'down' | 'left' | 'right' | 'random';
  gravity?: number;
  noise?: number;
  position?: [number, number, number];
}

export interface EffectConfig {
  characterName: string;
  theme: VFXTheme;
  glitch?: boolean;
  modules: VFXModuleConfig[];
  timestamp: number;
}
