
import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

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

  // Simple noise function
  float noise(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
    vec2 uv = vUv;
    float n = noise(uv + time * 0.5);
    
    // Create fire shape
    float fire = 1.0 - smoothstep(0.0, 0.7, length(uv - vec2(0.5, 0.2)));
    fire *= noise(uv * 10.0 - time * 2.0);
    
    vec3 fireColor = mix(vec3(1.0, 0.1, 0.0), vec3(1.0, 0.8, 0.0), fire);
    float alpha = smoothstep(0.1, 0.5, fire * (1.0 - uv.y));
    
    gl_FragColor = vec4(fireColor, alpha);
  }
`;

const RealisticFire: React.FC<{ position?: [number, number, number]; scale?: number }> = ({ position = [0, 0, 0], scale = 1 }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  
  const uniforms = useMemo(() => ({
    time: { value: 0 },
    color: { value: new THREE.Color("#ff4400") }
  }), []);

  useFrame((state) => {
    if (meshRef.current) {
      (meshRef.current.material as THREE.ShaderMaterial).uniforms.time.value = state.clock.getElapsedTime();
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
      />
    </mesh>
  );
};

export default RealisticFire;
