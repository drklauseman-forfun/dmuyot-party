
import React from 'react';
import VFXGlow from '../components/VFXGlow';
import VFXSparkles from '../components/VFXSparkles';
import type { EffectConfig } from '../types';

interface HellishEffectProps {
  config: EffectConfig;
  onComplete: () => void;
}

const HellishEffect: React.FC<HellishEffectProps> = ({ config: _config, onComplete: _onComplete }) => {
  return (
    <group>
      {/* Red Background Pulse */}
      <VFXGlow color="#ff0000" intensity={0.6} />

      {/* Red Rising Embers */}
      <VFXSparkles color="#ff4400" count={250} size={4} speed={2} />
    </group>
  );
};

export default HellishEffect;
