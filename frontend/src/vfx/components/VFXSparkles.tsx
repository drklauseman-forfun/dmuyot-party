
import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import gsap from 'gsap';
import type { SparklesParams } from '../types';

interface VFXSparklesProps extends SparklesParams {
  active?: boolean;
  /**
   * Varies the particle layout between runs. Rendering has to be pure, so the
   * spread can't come from Math.random — the same seed always lays the
   * particles out the same way, and the canvas passes the effect's run id so
   * consecutive bursts still differ from each other.
   */
  seed?: number;
}

/** mulberry32 — small, fast, and good enough for scattering points. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const vertexShader = `
  uniform float time;
  uniform float speed;
  uniform vec3 directionVec;
  uniform float gravity;
  uniform float noise;
  uniform float size;
  uniform vec3 bounds;
  attribute float sizeRandomness;
  attribute vec3 customOffset;
  varying float vOpacity;

  void main() {
    vec3 pos = position;
    float t = time * speed;
    
    // Directional Movement
    if (length(directionVec) > 0.0) {
      pos += directionVec * t;
      // Apply Gravity (relative to start)
      pos.y -= 0.5 * gravity * t * t * 0.1;
      
      // Noise/Turbulence
      if (noise > 0.0) {
        pos.x += sin(t * 2.0 + customOffset.x) * noise;
        pos.z += cos(t * 2.0 + customOffset.z) * noise;
      }

      // Recycle particles through the same volume they were spawned in, so
      // density stays even. Wrapping through a fixed box instead would spread
      // them across a region the spawn never filled, leaving visible gaps.
      pos = mod(pos + bounds, bounds * 2.0) - bounds;
    } else {
      // Ambient Floating
      pos.x += sin(time * 0.5 + customOffset.x) * 2.0;
      pos.y += cos(time * 0.3 + customOffset.y) * 2.0;
      pos.z += sin(time * 0.4 + customOffset.z) * 2.0;
    }

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    // Scale particle size based on variable and depth
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
  fadeInDuration = 1,
  duration = 3,
  fadeDuration = 2,
  active = true,
  seed = 1
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

  // Half-extent of the spawn volume per axis. Particles spawn within
  // [-halfExtent, +halfExtent] and the shader recycles them through the same
  // range, so this is the single source of truth for both.
  const halfExtent = useMemo(() => {
    const s = Array.isArray(scale) ? scale : [scale, scale, scale];
    // Guard against zero — the shader's modulo is undefined on a zero extent.
    const safe = s.map((n) => Math.max(Math.abs(n), 0.001));
    return new THREE.Vector3(safe[0], safe[1], safe[2]);
  }, [scale]);

  const [positions, sizeRandomness, customOffset] = useMemo(() => {
    const random = seededRandom(seed);
    const pos = new Float32Array(count * 3);
    const rand = new Float32Array(count);
    const offset = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (random() - 0.5) * halfExtent.x * 2;
      pos[i * 3 + 1] = (random() - 0.5) * halfExtent.y * 2;
      pos[i * 3 + 2] = (random() - 0.5) * halfExtent.z * 2;
      rand[i] = random() * 0.5 + 0.5;
      offset[i * 3] = random() * 100;
      offset[i * 3 + 1] = random() * 100;
      offset[i * 3 + 2] = random() * 100;
    }
    return [pos, rand, offset];
  }, [count, halfExtent, seed]);

  const uniforms = useMemo(() => ({
    time: { value: 0 },
    color: { value: new THREE.Color(color) },
    opacity: { value: 0 },
    speed: { value: speed },
    directionVec: { value: directionVec },
    gravity: { value: gravity },
    noise: { value: noise },
    size: { value: size },
    bounds: { value: halfExtent }
  }), [color, speed, directionVec, gravity, noise, size, halfExtent]);

  useEffect(() => {
    if (active) {
      const tl = gsap.timeline();
      tl.to(opacityState.current, { value: 1, duration: fadeInDuration, ease: "power2.out" });
      tl.to({}, { duration });
      tl.to(opacityState.current, { value: 0, duration: fadeDuration, ease: "power2.inOut" });
      return () => { tl.kill(); };
    }
  }, [active, fadeInDuration, duration, fadeDuration]);

  // Elapsed time is tracked locally rather than read from the canvas clock.
  // The canvas outlives any single effect, so a shared clock would start a
  // fresh burst at whatever time the canvas happened to be at — with its
  // particles already displaced far outside the spawn volume.
  const elapsed = useRef(0);

  useFrame((_state, delta) => {
    if (!pointsRef.current) return;
    elapsed.current += delta;
    const material = pointsRef.current.material as THREE.ShaderMaterial;
    material.uniforms.time.value = elapsed.current;
    material.uniforms.opacity.value = opacityState.current.value;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
        <bufferAttribute
          attach="attributes-sizeRandomness"
          args={[sizeRandomness, 1]}
        />
        <bufferAttribute
          attach="attributes-customOffset"
          args={[customOffset, 3]}
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
