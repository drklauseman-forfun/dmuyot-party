
import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import type { EffectConfig } from './types';
import HellishEffect from './effects/HellishEffect';
import ElfSummon from './effects/ElfSummon';
import ShaderRays from './components/ShaderRays';

interface EffectCanvasProps {
  config: EffectConfig | null;
  onComplete: () => void;
}

const EffectCanvas: React.FC<EffectCanvasProps> = ({ config, onComplete }) => {
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      pointerEvents: 'none',
      zIndex: 900, // COMPLETELY BEHIND THE UI
      background: 'transparent',
      visibility: config ? 'visible' : 'hidden',
      opacity: config ? 1 : 0,
      transition: 'opacity 0.5s ease'
    }}>
      <Canvas
        camera={{ position: [0, 0, 5], fov: 45 }}
        gl={{ 
            alpha: true, 
            antialias: false, // Better mobile performance
            powerPreference: "high-performance"
        }}
        style={{ pointerEvents: 'none' }}
      >
        <Suspense fallback={null}>
          <ambientLight intensity={0.8} />
          
          {/* Guaranteed Visible Rays using Shader */}
          {config?.type === 'legendary' && (
            <ShaderRays position={[0, 4, -5]} color="#ffd700" />
          )}
          
          {config && <EffectSwitcher config={config} onComplete={onComplete} />}
          
          <EffectComposer>
            <Bloom 
              intensity={1.0} 
              luminanceThreshold={0.5}
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
