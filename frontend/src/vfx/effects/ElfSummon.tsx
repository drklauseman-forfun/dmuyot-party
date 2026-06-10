
import React from 'react';
import VFXFire from '../components/VFXFire';
import VFXSparkles from '../components/VFXSparkles';
import type { EffectConfig } from '../types';

interface ElfSummonProps {
  config: EffectConfig;
  onComplete: () => void;
}

const ElfSummon: React.FC<ElfSummonProps> = ({ config: _config, onComplete: _onComplete }) => {
  return (
    <group>
      <ambientLight intensity={0.5} />
      <pointLight position={[0, 2, 2]} intensity={1} color="#00ff88" />

      {/* Emerald Fire at the base */}
      <VFXFire color="#00ff88" position={[0, -2, 0]} scale={3} />

      {/* Emerald Magic Dust */}
      <VFXSparkles color="#00ff88" count={150} size={2} speed={0.5} scale={10} />
    </group>
  );
};

export default ElfSummon;
