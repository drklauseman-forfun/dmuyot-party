
import React, { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sparkles, Float, Text, MeshDistortMaterial } from '@react-three/drei';
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
  const soulRef = useRef<THREE.Mesh>(null);
  
  const state = useRef({
    reveal: 0,
    pulse: 0
  });

  useEffect(() => {
    const tl = gsap.timeline({
      onComplete: () => {
        setTimeout(onComplete, 1000);
      }
    });

    // 1. Summoning Beam
    tl.to(state.current, { reveal: 1, duration: 0.5, ease: "power2.out" });
    
    // 2. Pulse
    tl.to(state.current, { pulse: 1, duration: 2, repeat: 1, yoyo: true });

    // 3. Dissolve
    tl.to(state.current, { reveal: 0, duration: 1, delay: 1, ease: "power2.in" });

    return () => {
      tl.kill();
    };
  }, [config.timestamp]);

  useFrame((threeState) => {
    const t = threeState.clock.getElapsedTime();
    if (soulRef.current) {
        soulRef.current.rotation.y = t;
        soulRef.current.scale.setScalar(state.current.reveal * (1 + Math.sin(t * 5) * 0.1));
    }
  });

  return (
    <group ref={groupRef}>
      <ambientLight intensity={0.5} />
      <pointLight position={[0, 2, 2]} intensity={2} color="#00ff88" />

      {/* Realistic Fire at the base */}
      <RealisticFire position={[0, -1, 0]} scale={5} />

      {/* The "Elf" Soul */}
      <mesh ref={soulRef} position={[0, 1, 0]}>
        <sphereGeometry args={[0.5, 32, 32]} />
        <MeshDistortMaterial
          color="#00ffcc"
          speed={3}
          distort={0.4}
          radius={1}
          emissive="#00ff88"
          emissiveIntensity={5}
        />
      </mesh>

      {/* Pointy "Ears" (Cylinders) */}
      <mesh position={[0.4, 1.4, 0]} rotation={[0, 0, -0.5]}>
        <cylinderGeometry args={[0, 0.1, 0.8]} />
        <meshStandardMaterial color="#00ffcc" emissive="#00ffcc" emissiveIntensity={2} />
      </mesh>
      <mesh position={[-0.4, 1.4, 0]} rotation={[0, 0, 0.5]}>
        <cylinderGeometry args={[0, 0.1, 0.8]} />
        <meshStandardMaterial color="#00ffcc" emissive="#00ffcc" emissiveIntensity={2} />
      </mesh>

      <Sparkles 
        count={200} 
        scale={8} 
        size={3} 
        speed={1} 
        color="#00ff88" 
      />

      <Float speed={3} rotationIntensity={1} floatIntensity={1}>
        <Text
          fontSize={0.6}
          color="#00ff88"
          anchorX="center"
          anchorY="middle"
          maxWidth={4}
          textAlign="center"
          outlineWidth={0.04}
          outlineColor="#002211"
          font="https://fonts.gstatic.com/s/pressstart2p/v15/e3t4euO8jc-yh3Ufw7zXotu8.woff"
        >
          {config.characterName.toUpperCase()}
        </Text>
        <Text
          position={[0, -0.8, 0]}
          fontSize={0.2}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
        >
          {config.type === 'elf' ? "< ANCIENT ELF >" : "< LEGENDARY SUMMON >"}
        </Text>
      </Float>
    </group>
  );
};

export default ElfSummon;
