
import React, { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Sparkles, Float, Text, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import gsap from 'gsap';
import type { EffectConfig } from '../types';

interface HellishEffectProps {
  config: EffectConfig;
  onComplete: () => void;
}

const HellishEffect: React.FC<HellishEffectProps> = ({ config, onComplete }) => {
  const groupRef = useRef<THREE.Group>(null);
  const flashRef = useRef<THREE.Mesh>(null);
  const coreRef = useRef<THREE.Group>(null);
  const { camera } = useThree();
  
  const state = useRef({
    intensity: 0,
    shake: 0,
    textScale: 0
  });

  useEffect(() => {
    // Reset state
    state.current.intensity = 0;
    state.current.shake = 0;
    state.current.textScale = 0;

    const tl = gsap.timeline({
      onComplete: () => {
        setTimeout(onComplete, 500);
      }
    });

    // Cinematic Sequence:
    // 1. Initial Blast
    tl.to(state.current, { 
      intensity: 1, 
      shake: 1, 
      duration: 0.1, 
      ease: "power4.out" 
    });
    
    // 2. Text Pop
    tl.to(state.current, { 
      textScale: 1.2, 
      duration: 0.4, 
      ease: "back.out(2)" 
    }, "-=0.05");

    // 3. Shake Settle
    tl.to(state.current, { 
      shake: 0, 
      duration: 1.5, 
      ease: "power2.out" 
    }, "+=0.2");

    // 4. Stay active for a few seconds
    tl.to(state.current, { 
      textScale: 1.0, 
      duration: 2, 
      ease: "sine.inOut" 
    });

    // 5. Fade out
    tl.to(state.current, { 
      intensity: 0, 
      textScale: 0, 
      duration: 1, 
      ease: "power2.in" 
    }, "+=1");

    return () => {
      tl.kill();
    };
  }, [config.timestamp]);

  useFrame((threeState) => {
    const { intensity, shake, textScale } = state.current;
    const t = threeState.clock.getElapsedTime();

    // Apply Shake to Camera
    if (shake > 0) {
      camera.position.x = Math.sin(t * 50) * 0.1 * shake;
      camera.position.y = Math.cos(t * 60) * 0.1 * shake;
    } else {
      camera.position.x = THREE.MathUtils.lerp(camera.position.x, 0, 0.1);
      camera.position.y = THREE.MathUtils.lerp(camera.position.y, 0, 0.1);
    }

    if (flashRef.current) {
      flashRef.current.scale.setScalar(1 + intensity * 5);
      (flashRef.current.material as THREE.MeshBasicMaterial).opacity = intensity * 0.5;
    }

    if (coreRef.current) {
        coreRef.current.scale.setScalar(textScale);
        coreRef.current.rotation.y = t * 0.5;
        coreRef.current.rotation.z = t * 0.2;
    }
  });

  return (
    <group ref={groupRef}>
      <ambientLight intensity={0.2} />
      <pointLight position={[0, 2, 4]} intensity={state.current.intensity * 5} color="#ff4400" />
      
      {/* Background Glow */}
      <mesh ref={flashRef} position={[0, 0, -5]}>
        <planeGeometry args={[30, 30]} />
        <meshBasicMaterial color="#ff2200" transparent opacity={0} blending={THREE.AdditiveBlending} />
      </mesh>

      {/* Layered Particles */}
      <Sparkles 
        count={300} 
        scale={12} 
        size={5} 
        speed={1.5} 
        color="#ff4400" 
        noise={1} 
      />
      <Sparkles 
        count={150} 
        scale={8} 
        size={2} 
        speed={3} 
        color="#ffd700" 
        noise={2} 
      />

      {/* The Core Reveal */}
      <group ref={coreRef}>
        <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
            <Text
            fontSize={0.6}
            color="#ff0000"
            anchorX="center"
            anchorY="middle"
            maxWidth={4}
            textAlign="center"
            outlineWidth={0.04}
            outlineColor="#220000"
            font="https://fonts.gstatic.com/s/pressstart2p/v15/e3t4euO8jc-yh3Ufw7zXotu8.woff" // Pixel font for "High End" feel
            >
            {config.characterName.toUpperCase()}
            </Text>
            
            <Text
            position={[0, -0.8, 0]}
            fontSize={0.25}
            color="#ffcc00"
            anchorX="center"
            anchorY="middle"
            font="https://fonts.gstatic.com/s/pressstart2p/v15/e3t4euO8jc-yh3Ufw7zXotu8.woff"
            >
            {"< HELLISH RARE >"}
            </Text>
        </Float>

        {/* Dynamic Light Core */}
        <mesh>
            <sphereGeometry args={[0.1, 16, 16]} />
            <meshBasicMaterial color="#ffffff" />
            <pointLight intensity={10} distance={5} color="#ff0000" />
        </mesh>
      </group>

      <ContactShadows 
        opacity={0.4} 
        scale={10} 
        blur={2} 
        far={10} 
        resolution={256} 
        color="#000000" 
      />
    </group>
  );
};

export default HellishEffect;
