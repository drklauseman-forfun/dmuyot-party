
import React, { Suspense, useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import type { EffectConfig } from './types';
import HellishEffect from './effects/HellishEffect';
import ElfSummon from './effects/ElfSummon';
import SubtleTopBeams from './components/SubtleTopBeams';

interface EffectCanvasProps {
  config: EffectConfig | null;
  onComplete: () => void;
}

const EffectCanvas: React.FC<EffectCanvasProps> = ({ config, onComplete }) => {
  const [displayConfig, setDisplayConfig] = useState<EffectConfig | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (config) {
      setDisplayConfig(config);
      setVisible(true);
      console.log("🎨 [VFX] Rendering Canvas with config:", config.type);
    } else {
      // Fade out for 2 seconds before unmounting
      setVisible(false);
      const timer = setTimeout(() => {
        setDisplayConfig(null);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [config]);

  if (!displayConfig) return null;
  
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      pointerEvents: 'none',
      zIndex: 2000,
      background: 'transparent',
      opacity: visible ? 1 : 0,
      transition: 'opacity 2s ease-in-out'
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
        <ambientLight intensity={1.0} />
        
        {/* SUBTLE TOP BEAMS */}
        {displayConfig?.type === 'legendary' && (
          <SubtleTopBeams />
        )}
        
        <Suspense fallback={null}>
          <EffectSwitcher config={displayConfig} onComplete={onComplete} />
        </Suspense>

        <EffectComposer>
          <Bloom 
            intensity={1.0} 
            luminanceThreshold={0.5}
            mipmapBlur
          />
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
