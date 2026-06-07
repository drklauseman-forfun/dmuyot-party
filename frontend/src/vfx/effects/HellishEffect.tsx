
import React, { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import gsap from 'gsap';
import type { EffectConfig } from '../types';

interface HellishEffectProps {
  config: EffectConfig;
  onComplete: () => void;
}

const HellishEffect: React.FC<HellishEffectProps> = ({ config, onComplete }) => {
  const flashRef = useRef<THREE.Mesh>(null);
  const intensity = useRef({ value: 0 });

  useEffect(() => {
    intensity.current.value = 0;

    const tl = gsap.timeline({
      onComplete: () => {
        setTimeout(onComplete, 500);
      }
    });

    // Initial Flash
    tl.to(intensity.current, { value: 0.6, duration: 0.2, ease: "power2.out" });
    tl.to(intensity.current, { value: 0.2, duration: 2, ease: "sine.inOut" });
    tl.to(intensity.current, { value: 0, duration: 1, delay: 2, ease: "power2.in" });

    return () => {
      tl.kill();
    };
  }, [config.timestamp]);

  useFrame(() => {
    if (flashRef.current) {
      (flashRef.current.material as THREE.MeshBasicMaterial).opacity = intensity.current.value;
    }
  });

  return (
    <group>
      {/* Background Glow */}
      <mesh ref={flashRef} position={[0, 0, -5]}>
        <planeGeometry args={[30, 30]} />
        <meshBasicMaterial color="#ff2200" transparent opacity={0} blending={THREE.AdditiveBlending} />
      </mesh>

      <Sparkles 
        count={200} 
        scale={12} 
        size={4} 
        speed={1} 
        color="#ff4400" 
      />
    </group>
  );
};

export default HellishEffect;
