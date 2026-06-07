
import React, { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import gsap from 'gsap';
import type { EffectConfig } from '../types';
import RealisticFire from '../components/RealisticFire';

interface ElfSummonProps {
  config: EffectConfig;
  onComplete: () => void;
}

const ElfSummon: React.FC<ElfSummonProps> = ({ config, onComplete }) => {
  useEffect(() => {
    const tl = gsap.timeline({
      onComplete: () => {
        setTimeout(onComplete, 1000);
      }
    });

    // Simple duration control
    tl.to({}, { duration: 5 });

    return () => {
      tl.kill();
    };
  }, [config.timestamp]);

  return (
    <group>
      <ambientLight intensity={0.5} />
      <pointLight position={[0, 2, 2]} intensity={1} color="#00ff88" />

      {/* Realistic Fire at the base - subtle presence */}
      <RealisticFire position={[0, -2, 0]} scale={3} />

      <Sparkles 
        count={150} 
        scale={10} 
        size={2} 
        speed={0.5} 
        color="#00ff88" 
      />
    </group>
  );
};

export default ElfSummon;
