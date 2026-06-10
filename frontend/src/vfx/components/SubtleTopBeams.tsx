
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
  
  void main() {
    vec2 p = vUv;
    float beams = sin(p.x * 20.0 + sin(time * 0.2) * 2.0) * 0.5 + 0.5;
    beams = pow(beams, 3.0);
    beams *= smoothstep(0.0, 0.8, p.y);
    beams *= smoothstep(0.0, 0.2, p.x) * smoothstep(1.0, 0.8, p.x);
    
    vec3 lightColor = vec3(1.0, 0.95, 0.7);
    vec3 finalColor = lightColor * beams * 1.2 * intensity;
    
    gl_FragColor = vec4(finalColor, beams * 0.4 * intensity);
  }
`;

const SubtleTopBeams: React.FC = () => {
  const uniforms = useRef({
    time: { value: 0 },
    intensity: { value: 0 }
  });

  useEffect(() => {
    const tl = gsap.timeline();
    
    // Fade in
    tl.to(uniforms.current.intensity, { value: 1, duration: 1.5, ease: "power2.out" });
    
    // Hold
    tl.to({}, { duration: 2.5 });
    
    // Fade out
    tl.to(uniforms.current.intensity, { value: 0, duration: 2, ease: "power2.inOut" });

    return () => {
      tl.kill();
    };
  }, []);

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
