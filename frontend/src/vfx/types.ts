
export type EffectType = 'hellish' | 'glow' | 'explosion' | 'void';

export interface EffectConfig {
  type: EffectType;
  characterName: string;
  rarity?: 'common' | 'rare' | 'legendary';
  timestamp: number; // Used to trigger re-runs of the same effect
}
