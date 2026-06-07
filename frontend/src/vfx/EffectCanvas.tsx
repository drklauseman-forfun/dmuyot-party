
import React, { Suspense, useState } from 'react';
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
        gl={{ 
            antialias: true, 
            alpha: true,
            powerPreference: "high-performance",
            toneMapping: THREE.NoToneMapping // Important for HDR colors
        }}
        style={{ pointerEvents: 'none' }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
        }}
      >
        <Suspense fallback={null}>
          {/* The Sun: Positioned high up for "From Above" effect */}
          <mesh 
            ref={setSun} 
            position={[0, 10, 0]}
          >
            <sphereGeometry args={[2, 32, 32]} />
            <meshBasicMaterial 
                color={[20, 15, 10]} // Even brighter HDR gold
                toneMapped={false}
            />
          </mesh>
          
          <EffectSwitcher config={config} onComplete={onComplete} />
          
          <EffectComposer multisampling={0}>
            <Bloom 
              intensity={2.0} 
              luminanceThreshold={0.5} // Lowered to ensure rays are caught
              mipmapBlur
            />
            {sun && config.type === 'legendary' ? (
              <GodRays
                sun={sun}
                samples={100}
                density={0.98}
                decay={0.97}
                weight={1.0} // Max weight for thick rays
                exposure={1.0}
                clampMax={1}
                blur
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
