
import React, { Suspense, useState, useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import type { EffectConfig, VFXModuleConfig } from './types';
import VFXGlow from './components/VFXGlow';
import VFXSparkles from './components/VFXSparkles';
import VFXFire from './components/VFXFire';
import SubtleTopBeams from './components/SubtleTopBeams';
import { devLog } from '../log';

interface EffectCanvasProps {
  config: EffectConfig | null;
  onComplete: () => void;
}

/** How long the canvas fades out before unmounting. Drives the CSS transition too. */
const FADE_OUT_MS = 2000;

const EffectCanvas: React.FC<EffectCanvasProps> = ({ config, onComplete }) => {
  const [displayConfig, setDisplayConfig] = useState<EffectConfig | null>(null);
  const [visible, setVisible] = useState(false);

  // Held in a ref so the lifecycle effect below can depend on `config` alone.
  // Parents commonly pass an inline arrow, which changes identity on every
  // render — depending on it directly would restart the cleanup timer each
  // time the parent re-rendered, letting effects outlive their duration.
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  });

  useEffect(() => {
    if (config) {
      // These two setStates are the point of the effect, not an accident of
      // it. `visible` has to flip in a commit *after* the canvas mounts, or
      // the CSS opacity transition has nothing to animate from and the
      // fade-in is lost.
      /* eslint-disable react-hooks/set-state-in-effect */
      setDisplayConfig(config);
      setVisible(true);
      /* eslint-enable react-hooks/set-state-in-effect */
      devLog("🎨 [VFX] Rendering Canvas for effect:", config.effectId);

      // Auto-cleanup once the longest-lived module has finished. A module's
      // lifetime is all three phases — ramping in, holding, then fading out —
      // so leaving the ramp out of this cut the tail off the longest fade.
      const maxLife = config.modules.reduce((max, mod) => {
        const life =
          (mod.fadeInDuration ?? 1) + (mod.duration ?? 3) + (mod.fadeDuration ?? 2);
        return Math.max(max, life);
      }, 0) || 6;

      const cleanupTimer = setTimeout(() => {
        devLog("🧹 [VFX] Effect auto-cleanup triggered");
        onCompleteRef.current();
      }, maxLife * 1000);

      return () => clearTimeout(cleanupTimer);
    } else {
      setVisible(false);
      const timer = setTimeout(() => {
        setDisplayConfig(null);
      }, FADE_OUT_MS);
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
      transition: `opacity ${FADE_OUT_MS}ms ease-in-out`
    }}>
      <Canvas
        camera={{ position: [0, 0, 5], fov: 45 }}
        gl={{ 
            alpha: true, 
            antialias: false,
            powerPreference: "high-performance"
        }}
        onCreated={() => devLog("🎮 [VFX] WebGL Context Created")}
        style={{ pointerEvents: 'none' }}
      >
        <ambientLight intensity={1.0} />
        <pointLight position={[0, 2, 2]} intensity={1.0} color="#ffffff" />
        
        <Suspense fallback={null}>
          <DynamicEffectRenderer
            modules={displayConfig.modules}
            runId={displayConfig.timestamp}
            active={visible}
          />
          
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

/**
 * `runId` is part of every key so a new effect always gets fresh module
 * instances. The canvas outlives a single effect by its fade-out, and without
 * this React would reuse an instance whenever the next effect happened to put
 * the same module type at the same index — leaving its GSAP timeline and
 * animation clock mid-flight instead of restarting them.
 */
const DynamicEffectRenderer: React.FC<{ modules: VFXModuleConfig[], runId: number, active: boolean }> = ({ modules, runId, active }) => {
  return (
    <group>
      {modules.map((mod, index) => {
        const key = `${runId}-${index}`;
        switch (mod.type) {
          case 'glow':
            return (
              <VFXGlow
                key={key}
                color={mod.color} 
                intensity={mod.intensity} 
                fadeInDuration={mod.fadeInDuration}
                duration={mod.duration}
                fadeDuration={mod.fadeDuration}
                active={active} 
              />
            );
          case 'sparkles':
            return (
              <VFXSparkles 
                key={key}
                color={mod.color} 
                count={mod.count} 
                size={mod.size} 
                speed={mod.speed} 
                scale={mod.scale} 
                direction={mod.direction}
                gravity={mod.gravity}
                noise={mod.noise}
                seed={runId + index}
                fadeInDuration={mod.fadeInDuration}
                duration={mod.duration}
                fadeDuration={mod.fadeDuration}
                active={active} 
              />
            );
          case 'fire':
            return (
              <VFXFire 
                key={key}
                color={mod.color} 
                scale={mod.scale} 
                position={mod.position} 
                fadeInDuration={mod.fadeInDuration}
                duration={mod.duration}
                fadeDuration={mod.fadeDuration}
                active={active} 
              />
            );
          case 'beams':
            return (
              <SubtleTopBeams 
                key={key}
                color={mod.color} 
                fadeInDuration={mod.fadeInDuration}
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
