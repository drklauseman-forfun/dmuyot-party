
import React, { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import gsap from 'gsap';
import type { GlowParams } from '../types';

interface VFXGlowProps extends GlowParams {
  active?: boolean;
}

const VFXGlow: React.FC<VFXGlowProps> = ({ 
  color = "#ff2200", 
  intensity = 0.5, 
  fadeInDuration = 1,
  duration = 3, 
  fadeDuration = 2,
  active = true 
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const opacityState = useRef({ value: 0 });
  const timeline = useRef<gsap.core.Timeline | null>(null);
  const started = useRef(false);

  // Built paused and started on the first drawn frame. Mounting stalls while
  // the WebGL context is created and the shaders compile, and a timeline
  // started before that spends its fade-in during the stall. See VFXClock.
  useEffect(() => {
    if (active) {
      const tl = gsap.timeline({ paused: true });
      tl.to(opacityState.current, { value: intensity, duration: fadeInDuration, ease: "power2.out" });
      tl.to({}, { duration });
      tl.to(opacityState.current, { value: 0, duration: fadeDuration, ease: "power2.inOut" });
      timeline.current = tl;
      return () => {
        tl.kill();
        timeline.current = null;
        started.current = false;
      };
    }
  }, [active, intensity, fadeInDuration, duration, fadeDuration]);

  useFrame(() => {
    if (!meshRef.current) return;
    if (timeline.current && !started.current) {
      started.current = true;
      timeline.current.play();
    }
    (meshRef.current.material as THREE.MeshBasicMaterial).opacity = opacityState.current.value;
  });

  return (
    <mesh ref={meshRef} position={[0, 0, -5]}>
      <planeGeometry args={[30, 30]} />
      <meshBasicMaterial 
        color={color} 
        transparent 
        opacity={0} 
        blending={THREE.AdditiveBlending} 
        depthWrite={false}
      />
    </mesh>
  );
};

export default VFXGlow;
