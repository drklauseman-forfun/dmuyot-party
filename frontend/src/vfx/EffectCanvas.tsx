
import React, { useState, useRef } from 'react';
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
    <mesh ref={meshRef} position={[0, 0, 0]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color="red" />
    </mesh>
  );
};

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
      zIndex: 9999, // TOP OF EVERYTHING
      background: 'transparent',
      border: '5px solid blue' // Blue border to see the container
    }}>
      <Canvas
        camera={{ position: [0, 0, 10], fov: 50 }}
        gl={{ alpha: true, antialias: true }}
      >
        <ambientLight intensity={1} />
        
        {/* BIG RED CUBE IN THE MIDDLE */}
        <DebugCube />
        
        {/* The Sun */}
        <mesh 
            ref={setSun} 
            position={[0, 5, -5]} 
        >
            <sphereGeometry args={[1, 32, 32]} />
            <meshBasicMaterial color="white" />
        </mesh>
        
        {config && <EffectSwitcher config={config} onComplete={onComplete} />}
        
        <EffectComposer multisampling={0}>
          <Bloom intensity={1.5} />
          {sun && config?.type === 'legendary' ? (
            <GodRays
              sun={sun}
              samples={30}
              density={0.96}
              decay={0.9}
              weight={0.8}
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
