
import React, { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import gsap from 'gsap';

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
  uniform float intensity;
  uniform vec3 color;
  
  void main() {
    vec2 p = vUv;
    float beams = sin(p.x * 20.0 + sin(time * 0.2) * 2.0) * 0.5 + 0.5;
    beams = pow(beams, 3.0);
    beams *= smoothstep(0.0, 0.8, p.y);
    beams *= smoothstep(0.0, 0.2, p.x) * smoothstep(1.0, 0.8, p.x);
    
    vec3 finalColor = color * beams * 1.2 * intensity;
    
    gl_FragColor = vec4(finalColor, beams * 0.4 * intensity);
  }
`;

interface SubtleTopBeamsProps {
  color?: string;
  duration?: number;
  fadeDuration?: number;
  active?: boolean;
}

const SubtleTopBeams: React.FC<SubtleTopBeamsProps> = ({
  color = "#fff2b2", // soft golden white
  duration = 3,
  fadeDuration = 2,
  active = true
}) => {
  const uniforms = useRef({
    time: { value: 0 },
    intensity: { value: 0 },
    color: { value: new THREE.Color(color) }
  });

  useEffect(() => {
    if (active) {
      const tl = gsap.timeline();
      tl.to(uniforms.current.intensity, { value: 1, duration: 1, ease: "power2.out" });
      tl.to({}, { duration });
      tl.to(uniforms.current.intensity, { value: 0, duration: fadeDuration, ease: "power2.inOut" });
      return () => { tl.kill(); };
    }
  }, [active, duration, fadeDuration]);

  useFrame((state) => {
    uniforms.current.time.value = state.clock.getElapsedTime();
  });

  return (
    <mesh position={[0, 0, 0]}>
      <planeGeometry args={[20, 20]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms.current}
        transparent
        blending={THREE.AdditiveBlending}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
};

export default SubtleTopBeams;
