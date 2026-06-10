
export type VFXTheme = 'hellish' | 'elf' | 'legendary' | 'none';
export type VFXModuleType = 'glow' | 'sparkles' | 'fire' | 'beams';

export interface VFXModuleConfig {
  type: VFXModuleType;
  color?: string;
  intensity?: number;
  count?: number;
  scale?: number;
  size?: number;
  speed?: number;
  duration?: number;
  fadeDuration?: number;
  position?: [number, number, number];
}

export interface EffectConfig {
  characterName: string;
  theme: VFXTheme;
  glitch?: boolean;
  modules: VFXModuleConfig[];
  timestamp: number;
}
