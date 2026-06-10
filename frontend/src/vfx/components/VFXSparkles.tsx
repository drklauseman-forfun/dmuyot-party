
import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import gsap from 'gsap';

interface VFXSparklesProps {
  color?: string;
  count?: number;
  scale?: number | [number, number, number];
  size?: number;
  speed?: number;
  direction?: 'up' | 'down' | 'left' | 'right' | 'random';
  gravity?: number;
  noise?: number;
  duration?: number;
  fadeDuration?: number;
  active?: boolean;
}

const vertexShader = `
  uniform float time;
  uniform float speed;
  uniform vec3 directionVec;
  uniform float gravity;
  uniform float noise;
  uniform float size;
  attribute float sizeRandomness;
  attribute vec3 customOffset;
  varying float vOpacity;

  float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
  }

  void main() {
    vec3 pos = position;
    float t = time * speed;
    
    // Directional Movement
    if (length(directionVec) > 0.0) {
      pos += directionVec * t;
      // Apply Gravity
      pos.y -= 0.5 * gravity * t * t * 0.1;
      
      // Noise/Turbulence
      if (noise > 0.0) {
        pos.x += sin(t * 2.0 + customOffset.x) * noise;
        pos.z += cos(t * 2.0 + customOffset.z) * noise;
      }

      // Wrap around logic (centered at 0, size 40)
      pos = mod(pos + 20.0, 40.0) - 20.0;
    } else {
      // Ambient Floating
      pos.x += sin(time * 0.5 + customOffset.x) * 2.0;
      pos.y += cos(time * 0.3 + customOffset.y) * 2.0;
      pos.z += sin(time * 0.4 + customOffset.z) * 2.0;
    }

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = size * sizeRandomness * (300.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
    vOpacity = 1.0;
  }
`;

const fragmentShader = `
  uniform vec3 color;
  uniform float opacity;
  varying float vOpacity;

  void main() {
    float dist = distance(gl_PointCoord, vec2(0.5));
    if (dist > 0.5) discard;
    float alpha = smoothstep(0.5, 0.0, dist) * opacity;
    gl_FragColor = vec4(color, alpha);
  }
`;

const VFXSparkles: React.FC<VFXSparklesProps> = ({
  color = "#ffffff",
  count = 100,
  scale = 10,
  size = 2,
  speed = 1,
  direction = 'random',
  gravity = 0,
  noise = 0,
  duration = 3,
  fadeDuration = 2,
  active = true
}) => {
  const pointsRef = useRef<THREE.Points>(null);
  const opacityState = useRef({ value: 0 });

  const directionVec = useMemo(() => {
    switch (direction) {
      case 'up': return new THREE.Vector3(0, 1, 0);
      case 'down': return new THREE.Vector3(0, -1, 0);
      case 'left': return new THREE.Vector3(-1, 0, 0);
      case 'right': return new THREE.Vector3(1, 0, 0);
      default: return new THREE.Vector3(0, 0, 0);
    }
  }, [direction]);

  const [positions, sizeRandomness, customOffset] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const rand = new Float32Array(count);
    const offset = new Float32Array(count * 3);
    const s = Array.isArray(scale) ? scale : [scale, scale, scale];
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * s[0] * 2;
      pos[i * 3 + 1] = (Math.random() - 0.5) * s[1] * 2;
      pos[i * 3 + 2] = (Math.random() - 0.5) * s[2] * 2;
      rand[i] = Math.random() * 0.5 + 0.5;
      offset[i * 3] = Math.random() * 100;
      offset[i * 3 + 1] = Math.random() * 100;
      offset[i * 3 + 2] = Math.random() * 100;
    }
    return [pos, rand, offset];
  }, [count, scale]);

  const uniforms = useMemo(() => ({
    time: { value: 0 },
    color: { value: new THREE.Color(color) },
    opacity: { value: 0 },
    speed: { value: speed },
    directionVec: { value: directionVec },
    gravity: { value: gravity },
    noise: { value: noise },
    size: { value: size }
  }), [color, speed, directionVec, gravity, noise, size]);

  useEffect(() => {
    if (active) {
      const tl = gsap.timeline();
      tl.to(opacityState.current, { value: 1, duration: 1, ease: "power2.out" });
      tl.to({}, { duration });
      tl.to(opacityState.current, { value: 0, duration: fadeDuration, ease: "power2.inOut" });
      return () => { tl.kill(); };
    }
  }, [active, duration, fadeDuration]);

  useFrame((state) => {
    if (pointsRef.current) {
      const material = pointsRef.current.material as THREE.ShaderMaterial;
      material.uniforms.time.value = state.clock.getElapsedTime();
      material.uniforms.opacity.value = opacityState.current.value;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-sizeRandomness"
          count={count}
          array={sizeRandomness}
          itemSize={1}
        />
        <bufferAttribute
          attach="attributes-customOffset"
          count={count}
          array={customOffset}
          itemSize={3}
        />
      </bufferGeometry>
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
};

export default VFXSparkles;
