
import React, { Suspense, useState, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { EffectComposer, Bloom, GodRays } from '@react-three/postprocessing';
import * as THREE from 'three';
import type { EffectConfig } from './types';
import HellishEffect from './effects/HellishEffect';
import ElfSummon from './effects/ElfSummon';

interface EffectCanvasProps {
  config: EffectConfig | null;
  onComplete: () => void;
}

const DebugCube = () => {
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.x = state.clock.getElapsedTime();
      meshRef.current.rotation.y = state.clock.getElapsedTime();
    }
  });
  return (
    <mesh ref={meshRef} position={[-2, 0, 0]}>
      <boxGeometry args={[0.5, 0.5, 0.5]} />
      <meshBasicMaterial color="red" />
    </mesh>
  );
};

const EffectCanvas: React.FC<EffectCanvasProps> = ({ config, onComplete }) => {
  const [sun, setSun] = useState<THREE.Mesh | null>(null);

  // We keep the Canvas alive to avoid context loss, but only show it when config exists
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      pointerEvents: 'none',
      zIndex: 1050, // Higher than dark overlay (1000)
      background: 'transparent',
      display: config ? 'block' : 'none'
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
      >
        <Suspense fallback={null}>
          <DebugCube />
          
          <mesh 
            ref={setSun} 
            position={[0, 4, -2]} 
          >
            <sphereGeometry args={[0.8, 32, 32]} />
            <meshBasicMaterial 
                color={[100, 80, 40]} // Ultra bright HDR
                toneMapped={false}
            />
          </mesh>
          
          {config && <EffectSwitcher config={config} onComplete={onComplete} />}
          
          <EffectComposer multisampling={0}>
            <Bloom 
              intensity={2.0} 
              luminanceThreshold={0.1}
              mipmapBlur
            />
            {sun && config?.type === 'legendary' ? (
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
