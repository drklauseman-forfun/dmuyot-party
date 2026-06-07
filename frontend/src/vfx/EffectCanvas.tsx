
import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { EffectComposer, Bloom, Glitch } from '@react-three/postprocessing';
import { GlitchMode } from 'postprocessing';
import type { EffectConfig } from './types';
import HellishEffect from './effects/HellishEffect';
import ElfSummon from './effects/ElfSummon';

interface EffectCanvasProps {
  config: EffectConfig | null;
  onComplete: () => void;
}

const EffectCanvas: React.FC<EffectCanvasProps> = ({ config, onComplete }) => {
  if (!config) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      pointerEvents: 'none',
      zIndex: 1010,
      background: 'transparent'
    }}>
      <Canvas
        shadows
        camera={{ position: [0, 0, 5], fov: 45 }}
        gl={{ antialias: true, alpha: true }}
        style={{ pointerEvents: 'none' }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
        }}
      >
        <Suspense fallback={null}>
          <EffectSwitcher config={config} onComplete={onComplete} />
          
          <EffectComposer>
            <Bloom 
              intensity={1.5} 
              luminanceThreshold={0.2} 
              luminanceSmoothing={0.9} 
              height={300} 
            />
            {config.type === 'hellish' ? (
              <Glitch
                delay={[0.1, 0.5] as any}
                duration={[0.1, 0.3] as any}
                strength={[0.1, 0.3] as any}
                mode={GlitchMode.SPORADIC}
                active
                ratio={0.85}
              />
            ) : <></>}
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
