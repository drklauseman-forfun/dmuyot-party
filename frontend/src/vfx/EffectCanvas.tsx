
import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import type { EffectConfig } from './types';
import HellishEffect from './effects/HellishEffect';
import ElfSummon from './effects/ElfSummon';
import SunBeamBackground from './components/SunBeamBackground';

interface EffectCanvasProps {
  config: EffectConfig | null;
  onComplete: () => void;
}

const EffectCanvas: React.FC<EffectCanvasProps> = ({ config, onComplete }) => {
  console.log("🎨 [VFX] Rendering Canvas with config:", config?.type);
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      pointerEvents: 'none',
      zIndex: 2000, // TOP OF EVERYTHING
      background: 'transparent',
      visibility: config ? 'visible' : 'hidden',
      opacity: config ? 1 : 0,
      transition: 'opacity 0.5s ease'
    }}>
      <Canvas
        camera={{ position: [0, 0, 5], fov: 45 }}
        gl={{ 
            alpha: true, 
            antialias: false,
            powerPreference: "high-performance"
        }}
        onCreated={() => console.log("🎮 [VFX] WebGL Context Created")}
        style={{ pointerEvents: 'none' }}
      >
        <Suspense fallback={null}>
          <ambientLight intensity={1.0} />
          
          {/* Guaranteed Full-Screen Sunburst */}
          {config?.type === 'legendary' && (
            <SunBeamBackground />
          )}
          
          {config && <EffectSwitcher config={config} onComplete={onComplete} />}
          
          <EffectComposer>
            <Bloom 
              intensity={1.5} 
              luminanceThreshold={0.2}
              mipmapBlur
            />
          </EffectComposer>
        </Suspense>
      </Canvas>
    </div>
  );
};

const EffectSwitcher: React.FC<{ config: EffectConfig; onComplete: () => void }> = ({ config, onComplete }) => {
  switch (config.type) {
    case 'hellish':
      return <HellishEffect config={config} onComplete={onComplete} />;
    case 'elf':
    case 'legendary':
      return <ElfSummon config={config} onComplete={onComplete} />;
    default:
      return null;
  }
};

export default EffectCanvas;
