
import React, { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { EffectComposer, Bloom, GodRays } from '@react-three/postprocessing';
import * as THREE from 'three';
import type { EffectConfig } from './types';
import HellishEffect from './effects/HellishEffect';
import ElfSummon from './effects/ElfSummon';

interface EffectCanvasProps {
  config: EffectConfig | null;
  onComplete: () => void;
}

const EffectCanvas: React.FC<EffectCanvasProps> = ({ config, onComplete }) => {
  const [sun, setSun] = useState<THREE.Mesh | null>(null);

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      pointerEvents: 'none',
      zIndex: 1010, // Above overlay (1000), below modal (1100)
      background: 'transparent',
      display: config ? 'block' : 'none'
    }}>
      <Canvas
        camera={{ position: [0, 0, 5], fov: 45 }}
        gl={{ 
            alpha: true, 
            antialias: true,
            toneMapping: THREE.NoToneMapping
        }}
        style={{ pointerEvents: 'none' }}
      >
        <ambientLight intensity={0.5} />
        
        {/* Production Sun for GodRays */}
        <mesh 
            ref={setSun} 
            position={[0, 4, -3]} 
        >
            <sphereGeometry args={[1, 32, 32]} />
            <meshBasicMaterial 
                color={[10, 8, 4]} 
                toneMapped={false}
                transparent
                opacity={0.5} // Slightly transparent so it's not a hard circle
            />
        </mesh>
        
        {config && <EffectSwitcher config={config} onComplete={onComplete} />}
        
        <EffectComposer multisampling={0}>
          <Bloom 
            intensity={2.0} 
            luminanceThreshold={0.2}
            mipmapBlur
          />
          {sun && config?.type === 'legendary' ? (
            <GodRays
              sun={sun}
              samples={60}
              density={0.96}
              decay={0.9}
              weight={1.0}
              exposure={0.8}
              blur
            />
          ) : <></>}
        </EffectComposer>
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
