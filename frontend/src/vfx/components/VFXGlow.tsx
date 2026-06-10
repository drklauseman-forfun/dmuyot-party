
import React, { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import gsap from 'gsap';

interface VFXGlowProps {
  color?: string;
  intensity?: number;
  duration?: number;
  fadeDuration?: number;
  active?: boolean;
}

const VFXGlow: React.FC<VFXGlowProps> = ({ 
  color = "#ff2200", 
  intensity = 0.5, 
  duration = 3, 
  fadeDuration = 2,
  active = true 
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const opacityState = useRef({ value: 0 });

  useEffect(() => {
    if (active) {
      const tl = gsap.timeline();
      tl.to(opacityState.current, { value: intensity, duration: 1, ease: "power2.out" });
      tl.to({}, { duration });
      tl.to(opacityState.current, { value: 0, duration: fadeDuration, ease: "power2.inOut" });
      return () => { tl.kill(); };
    }
  }, [active, intensity, duration, fadeDuration]);

  useFrame(() => {
    if (meshRef.current) {
      (meshRef.current.material as THREE.MeshBasicMaterial).opacity = opacityState.current.value;
    }
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
