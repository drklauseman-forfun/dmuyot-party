
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
            toneMapping: THREE.NoToneMapping 
        }}
        style={{ pointerEvents: 'none' }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
        }}
      >
        <Suspense fallback={null}>
          {/* VISIBLE SUN: Critical for GodRays to have a bright source in the frustum */}
          <mesh 
            ref={setSun} 
            position={[0, 4, -2]} 
          >
            <sphereGeometry args={[0.5, 32, 32]} />
            <meshBasicMaterial 
                color={[50, 40, 20]} // Extremely bright HDR value
                toneMapped={false}
                transparent
                opacity={1}
            />
          </mesh>
          
          <EffectSwitcher config={config} onComplete={onComplete} />
          
          <EffectComposer multisampling={0}>
            <Bloom 
              intensity={2.5} 
              luminanceThreshold={0.1} // Catch everything bright
              mipmapBlur
            />
            {sun && config.type === 'legendary' ? (
              <GodRays
                sun={sun}
                samples={60}
                density={0.96}
                decay={0.9}
                weight={0.8}
                exposure={0.8}
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
