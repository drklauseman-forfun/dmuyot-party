
import React, { useEffect, useRef } from 'react';
import { Sparkles } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import gsap from 'gsap';
import type { EffectConfig } from '../types';
import RealisticFire from '../components/RealisticFire';

interface ElfSummonProps {
  config: EffectConfig;
  onComplete: () => void;
}

const ElfSummon: React.FC<ElfSummonProps> = ({ config, onComplete }) => {
  const groupRef = useRef<THREE.Group>(null);
  const intensity = useRef({ value: 1 });

  useEffect(() => {
    intensity.current.value = 1;
    if (groupRef.current) groupRef.current.scale.setScalar(1);

    const tl = gsap.timeline({
      onComplete: () => {
        onComplete();
      }
    });

    // 1. Reveal (already visible by default, but let's make it pop)
    tl.from(intensity.current, { value: 0, duration: 1, ease: "power2.out" });
    
    // 2. Stay active
    tl.to({}, { duration: 3 });

    // 3. Fade out
    tl.to(intensity.current, { 
      value: 0, 
      duration: 2, 
      ease: "power2.inOut" 
    });

    return () => {
      tl.kill();
    };
  }, [config.timestamp]);

  useFrame(() => {
    if (groupRef.current) {
      // Map global intensity to visual elements
      groupRef.current.scale.setScalar(0.8 + intensity.current.value * 0.2);
      // We can also potentially find children and adjust materials if they support opacity
    }
  });

  return (
    <group ref={groupRef}>
      <ambientLight intensity={0.5 * intensity.current.value} />
      <pointLight position={[0, 2, 2]} intensity={1 * intensity.current.value} color="#00ff88" />

      {/* Realistic Fire at the base */}
      <RealisticFire position={[0, -2, 0]} scale={3 * intensity.current.value} />

      <Sparkles 
        count={150} 
        scale={10 * intensity.current.value} 
        size={2} 
        speed={0.5} 
        color="#00ff88" 
        opacity={intensity.current.value}
      />
    </group>
  );
};

export default ElfSummon;
