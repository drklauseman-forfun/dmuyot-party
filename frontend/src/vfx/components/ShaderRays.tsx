
import React, { useRef } from 'react';
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

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float angle = atan(p.y, p.x);
    float dist = length(p);
    
    // Create rays using sine waves based on angle
    float rays = sin(angle * 10.0 + time * 2.0) * 0.5 + 0.5;
    
    // Fade rays near the center and edges
    rays *= smoothstep(0.0, 0.2, dist);
    rays *= smoothstep(1.0, 0.5, dist);
    
    // Boost brightness
    vec3 finalColor = color * rays * 2.0;
    float alpha = rays * (1.0 - dist);
    
    gl_FragColor = vec4(finalColor, alpha * 0.6);
  }
`;

const ShaderRays: React.FC<{ position?: [number, number, number]; color?: string }> = ({ position = [0, 0, 0], color = "#ffd700" }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const uniforms = useRef({
    time: { value: 0 },
    color: { value: new THREE.Color(color) }
  });

  useFrame((state) => {
    if (meshRef.current) {
      uniforms.current.time.value = state.clock.getElapsedTime();
    }
  });

  return (
    <mesh ref={meshRef} position={position}>
      <planeGeometry args={[20, 20]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms.current}
        transparent
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
};

export default ShaderRays;
