
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
    vec2 p = vUv;
    
    // Create subtle vertical beams emanating from the top
    // p.x is horizontal, p.y is vertical (0 at bottom, 1 at top)
    float beams = sin(p.x * 20.0 + sin(time * 0.2) * 2.0) * 0.5 + 0.5;
    
    // Sharpen beams slightly
    beams = pow(beams, 3.0);
    
    // Fade out as they go down (strong at top, invisible at bottom)
    beams *= smoothstep(0.0, 0.8, p.y);
    
    // Soften the edges of the screen
    beams *= smoothstep(0.0, 0.2, p.x) * smoothstep(1.0, 0.8, p.x);
    
    vec3 lightColor = vec3(1.0, 0.95, 0.7); // Soft golden white
    vec3 finalColor = lightColor * beams * 1.2;
    
    gl_FragColor = vec4(finalColor, beams * 0.4);
  }
`;

const SubtleTopBeams: React.FC = () => {
  const uniforms = useRef({
    time: { value: 0 }
  });

  useFrame((state) => {
    uniforms.current.time.value = state.clock.getElapsedTime();
  });

  return (
    <mesh>
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

export default SubtleTopBeams;
