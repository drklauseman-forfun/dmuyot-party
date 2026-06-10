
import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import gsap from 'gsap';

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

interface VFXFireProps {
  color?: string;
  position?: [number, number, number];
  scale?: number | [number, number, number];
  duration?: number;
  fadeDuration?: number;
  active?: boolean;
}

const VFXFire: React.FC<VFXFireProps> = ({ 
  color = "#ff4400", 
  position = [0, -2, 0], 
  scale = 1,
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

  useEffect(() => {
    if (active) {
      const tl = gsap.timeline();
      tl.to(intensityState.current, { value: 1, duration: 1, ease: "power2.out" });
      tl.to({}, { duration });
      tl.to(intensityState.current, { value: 0, duration: fadeDuration, ease: "power2.inOut" });
      return () => { tl.kill(); };
    }
  }, [active, duration, fadeDuration]);

  useFrame((state) => {
    if (meshRef.current) {
      const material = meshRef.current.material as THREE.ShaderMaterial;
      material.uniforms.time.value = state.clock.getElapsedTime();
      material.uniforms.intensity.value = intensityState.current.value;
    }
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
