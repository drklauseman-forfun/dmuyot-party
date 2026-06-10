
import React, { Suspense, useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import type { EffectConfig, VFXModuleConfig } from './types';
import VFXGlow from './components/VFXGlow';
import VFXSparkles from './components/VFXSparkles';
import VFXFire from './components/VFXFire';
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
      console.log("🎨 [VFX] Rendering Canvas with theme:", config.theme);

      // Calculate max duration for auto-cleanup
      // Default to 5s (3s duration + 2s fade) if not specified
      const maxLife = config.modules.reduce((max, mod) => {
        const life = (mod.duration ?? 3) + (mod.fadeDuration ?? 2);
        return Math.max(max, life);
      }, 0) || 5;

      const cleanupTimer = setTimeout(() => {
        console.log("🧹 [VFX] Effect auto-cleanup triggered");
        onComplete();
      }, maxLife * 1000);

      return () => clearTimeout(cleanupTimer);
    } else {
      setVisible(false);
      const timer = setTimeout(() => {
        setDisplayConfig(null);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [config, onComplete]);

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
        <pointLight position={[0, 2, 2]} intensity={1.0} color="#ffffff" />
        
        <Suspense fallback={null}>
          <DynamicEffectRenderer modules={displayConfig.modules} active={visible} />
          
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

const DynamicEffectRenderer: React.FC<{ modules: VFXModuleConfig[], active: boolean }> = ({ modules, active }) => {
  return (
    <group>
      {modules.map((mod, index) => {
        switch (mod.type) {
          case 'glow':
            return (
              <VFXGlow 
                key={index} 
                color={mod.color} 
                intensity={mod.intensity} 
                duration={mod.duration}
                fadeDuration={mod.fadeDuration}
                active={active} 
              />
            );
          case 'sparkles':
            return (
              <VFXSparkles 
                key={index} 
                color={mod.color} 
                count={mod.count} 
                size={mod.size} 
                speed={mod.speed} 
                scale={mod.scale} 
                duration={mod.duration}
                fadeDuration={mod.fadeDuration}
                active={active} 
              />
            );
          case 'fire':
            return (
              <VFXFire 
                key={index} 
                color={mod.color} 
                scale={mod.scale} 
                position={mod.position} 
                duration={mod.duration}
                fadeDuration={mod.fadeDuration}
                active={active} 
              />
            );
          case 'beams':
            return (
              <SubtleTopBeams 
                key={index} 
                color={mod.color} 
                duration={mod.duration}
                fadeDuration={mod.fadeDuration}
                active={active} 
              />
            );
          default:
            return null;
        }
      })}
    </group>
  );
};

export default EffectCanvas;
