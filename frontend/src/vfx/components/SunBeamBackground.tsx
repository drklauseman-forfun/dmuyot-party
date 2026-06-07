
import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const fragmentShader = `
  varying vec2 vUv;
  uniform float time;
  
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float angle = atan(p.y, p.x + 0.5); // Offset to top-left-ish
    float dist = length(p);
    
    // Create thick, rotating beams
    float beams = sin(angle * 8.0 + time) * 0.5 + 0.5;
    beams *= (1.0 - dist * 0.5); // Fade out towards edges
    
    vec3 goldColor = vec3(1.0, 0.8, 0.2);
    vec3 finalColor = goldColor * beams * 1.5;
    
    gl_FragColor = vec4(finalColor, beams * 0.7);
  }
`;

const SunBeamBackground: React.FC = () => {
  const uniforms = useRef({
    time: { value: 0 }
  });

  useFrame((state) => {
    uniforms.current.time.value = state.clock.getElapsedTime() * 0.5;
  });

  return (
    <mesh position={[0, 0, -10]}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms.current}
        transparent
        blending={THREE.AdditiveBlending}
        depthTest={false}
      />
    </mesh>
  );
};

export default SunBeamBackground;
