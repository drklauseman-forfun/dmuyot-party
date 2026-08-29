
import React, { useRef, useEffect, useMemo } from 'react';
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
  const meshRef = useRef<THREE.Mesh>(null);
  const intensityState = useRef({ value: 0 });

  // Initial uniform values only. Per-frame updates go through the material off
  // meshRef below, matching VFXFire and VFXSparkles — mutating a hook's result
  // directly is what the react-hooks immutability rule objects to.
  const uniforms = useMemo(() => ({
    time: { value: 0 },
    intensity: { value: 0 },
    color: { value: new THREE.Color(color) }
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

  // Local elapsed time so each run starts at t=0 — the canvas clock keeps
  // running between effects. See VFXSparkles for the same pattern.
  const elapsed = useRef(0);

  useFrame((_state, delta) => {
    if (!meshRef.current) return;
    elapsed.current += delta;
    const material = meshRef.current.material as THREE.ShaderMaterial;
    material.uniforms.time.value = elapsed.current;
    material.uniforms.intensity.value = intensityState.current.value;
  });

  return (
    <mesh ref={meshRef} position={[0, 0, 0]}>
      {/*
        The vertex shader writes gl_Position straight from `position`, so these
        vertices are already in clip space and must span [-1, 1] to fill the
        screen. A larger plane puts most of itself outside the frustum and
        leaves only a narrow strip of the UV range visible.
      */}
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        blending={THREE.AdditiveBlending}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
};

export default SubtleTopBeams;
