
import React, { Fragment, Suspense, useState, useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { Canvas, createPortal, useFrame } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import type { EffectConfig, VFXModuleConfig } from './types';
import { UNLIT_MODULES, renderVFXModule } from './modules';
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
        <EffectScene modules={displayConfig.modules} runId={displayConfig.timestamp} active={visible} />
      </Canvas>
    </div>
  );
};

/**
 * Everything inside the canvas: the effects, the bloom that makes light
 * effects glow, and a second layer, drawn once the bloom is done, for solid
 * effects that must not glow.
 *
 * Exported so it can be rendered off-screen, without the page, to check what
 * the bloom does and does not touch.
 */
export const EffectScene: React.FC<{ modules: VFXModuleConfig[]; runId: number; active: boolean }> = ({
  modules,
  runId,
  active,
}) => (
  <>
    <ambientLight intensity={1.0} />
    <pointLight position={[0, 2, 2]} intensity={1.0} color="#ffffff" />

    <Suspense fallback={null}>
      <DynamicEffectRenderer modules={modules} runId={runId} active={active} unlit={false} />

      <EffectComposer>
        <Bloom
          intensity={1.0}
          luminanceThreshold={0.5}
          mipmapBlur
        />
      </EffectComposer>

      <UnlitLayer>
        <DynamicEffectRenderer modules={modules} runId={runId} active={active} unlit />
      </UnlitLayer>
    </Suspense>
  </>
);

/**
 * Solid effects, drawn straight onto the frame after the bloom has finished
 * rather than through it.
 *
 * Bloom spreads light from anything bright, so white feathers sent through
 * it lit up the whole screen. Its output also brightens colours on the way
 * out, which washed out anything meant to be dark. Rendered here instead,
 * they keep exactly the colours they were drawn in.
 */
const UnlitLayer: React.FC<{ children: ReactNode }> = ({ children }) => {
  const scene = useMemo(() => new THREE.Scene(), []);
  // Priority 2: after the composer, which renders the lit scene at priority 1.
  useFrame(({ gl, camera }) => {
    gl.autoClear = false;
    gl.clearDepth();
    gl.render(scene, camera);
  }, 2);
  return <>{createPortal(children, scene)}</>;
};

/**
 * `runId` is part of every key so a new effect always gets fresh module
 * instances. The canvas outlives a single effect by its fade-out, and without
 * this React would reuse an instance whenever the next effect happened to put
 * the same module type at the same index — leaving its GSAP timeline and
 * animation clock mid-flight instead of restarting them.
 *
 * Renders either the lit modules or the unlit ones, keeping each module's
 * place in the full list for its key and seed, so moving a module between
 * layers never changes how it is laid out.
 *
 * Which component each module maps to lives in modules.tsx, so adding a module
 * does not mean editing this file.
 */
const DynamicEffectRenderer: React.FC<{ modules: VFXModuleConfig[], runId: number, active: boolean, unlit: boolean }> = ({ modules, runId, active, unlit }) => {
  return (
    <group>
      {modules.map((mod, index) =>
        UNLIT_MODULES.has(mod.type) === unlit ? (
          <Fragment key={`${runId}-${index}`}>
            {renderVFXModule(mod, { active, seed: runId + index })}
          </Fragment>
        ) : null,
      )}
    </group>
  );
};

export default EffectCanvas;
