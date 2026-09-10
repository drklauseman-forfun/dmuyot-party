
import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import gsap from 'gsap';
import type { FireParams } from '../types';

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  varying vec2 vUv;
  uniform float time;
  uniform vec3 color;
  uniform float intensity;

  float noise(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
    vec2 uv = vUv;
    float n = noise(uv + time * 0.5);
    float fire = 1.0 - smoothstep(0.0, 0.7, length(uv - vec2(0.5, 0.2)));
    fire *= noise(uv * 10.0 - time * 2.0);
    
    vec3 fireColor = mix(color * 0.5, color * 5.0, fire);
    float alpha = smoothstep(0.1, 0.5, fire * (1.0 - uv.y)) * intensity;
    
    gl_FragColor = vec4(fireColor, alpha);
  }
`;

interface VFXFireProps extends FireParams {
  active?: boolean;
}

const VFXFire: React.FC<VFXFireProps> = ({ 
  color = "#ff4400", 
  position = [0, -2, 0], 
  scale = 1,
  fadeInDuration = 1,
  duration = 3,
  fadeDuration = 2,
  active = true
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const intensityState = useRef({ value: 0 });
  
  const uniforms = useMemo(() => ({
    time: { value: 0 },
    color: { value: new THREE.Color(color) },
    intensity: { value: 0 }
  }), [color]);

  // Built paused and started on the first drawn frame. Mounting stalls while
  // the WebGL context is created and the shaders compile, and a timeline
  // started before that spends its fade-in during the stall. See VFXClock.
  const timeline = useRef<gsap.core.Timeline | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (active) {
      const tl = gsap.timeline({ paused: true });
      tl.to(intensityState.current, { value: 1, duration: fadeInDuration, ease: "power2.out" });
      tl.to({}, { duration });
      tl.to(intensityState.current, { value: 0, duration: fadeDuration, ease: "power2.inOut" });
      timeline.current = tl;
      return () => {
        tl.kill();
        timeline.current = null;
        started.current = false;
      };
    }
  }, [active, fadeInDuration, duration, fadeDuration]);

  // Local elapsed time so each run starts at t=0 — the canvas clock keeps
  // running between effects. See VFXSparkles for the same pattern.
  const elapsed = useRef(0);

  useFrame((_state, delta) => {
    if (!meshRef.current) return;
    if (timeline.current && !started.current) {
      started.current = true;
      timeline.current.play();
    }
    elapsed.current += delta;
    const material = meshRef.current.material as THREE.ShaderMaterial;
    material.uniforms.time.value = elapsed.current;
    material.uniforms.intensity.value = intensityState.current.value;
  });

  return (
    <mesh ref={meshRef} position={position} scale={scale}>
      <planeGeometry args={[2, 4]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
};

export default VFXFire;
