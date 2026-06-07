
import React, { Suspense, useMemo } from 'react';
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
  const sunMesh = useMemo(() => {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 16, 16),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0 })
    );
    mesh.position.set(0, 2, -2);
    return mesh;
  }, []);

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
          <primitive object={sunMesh} />
          
          <EffectSwitcher config={config} onComplete={onComplete} />
          
          <EffectComposer>
            <Bloom 
              intensity={2.0} 
              luminanceThreshold={0.1} 
              luminanceSmoothing={0.9} 
            />
            {config.type === 'legendary' ? (
              <GodRays
                sun={sunMesh}
                samples={60}
                density={0.96}
                decay={0.9}
                weight={0.4}
                exposure={0.6}
                clampMax={1}
                width={480}
                height={480}
                kernelSize={1}
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
