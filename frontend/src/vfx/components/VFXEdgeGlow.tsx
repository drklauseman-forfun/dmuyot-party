import React, { useRef, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import gsap from 'gsap';
import type { EdgeGlowParams } from '../types';

/**
 * Light bleeding in from one edge of the frame.
 *
 * The plain `glow` module is a flat wash across everything, which cannot say
 * "at the bottom". This fades out with distance from a chosen edge, so several
 * can be stacked — a dark one rising and a pale one falling, say — without
 * either flattening the whole picture.
 */

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const fragmentShader = `
  varying vec2 vUv;
  uniform vec3 color;
  uniform float intensity;
  /** A point on the glowing edge, and the axis to measure away from it. */
  uniform vec2 origin;
  uniform vec2 axis;
  uniform float spread;

  void main() {
    float depth = abs(dot(vUv - origin, axis));
    // Curved rather than linear: a straight ramp reads as a grey band with a
    // visible top, where this keeps the brightness against the edge and lets
    // the far end disappear.
    float falloff = 1.0 - smoothstep(0.0, max(spread, 0.001), depth);
    float strength = pow(falloff, 1.7) * intensity;
    gl_FragColor = vec4(color * strength, strength);
  }
`;

interface VFXEdgeGlowProps extends EdgeGlowParams {
  active?: boolean;
}

/** Where each edge sits in UV space, and which way to measure inward. */
const EDGES = {
  bottom: { origin: [0, 0], axis: [0, 1] },
  top: { origin: [0, 1], axis: [0, 1] },
  left: { origin: [0, 0], axis: [1, 0] },
  right: { origin: [1, 0], axis: [1, 0] },
} as const;

const VFXEdgeGlow: React.FC<VFXEdgeGlowProps> = ({
  color = '#ffffff',
  intensity = 0.6,
  edge = 'bottom',
  spread = 0.45,
  fadeInDuration = 1,
  duration = 3,
  fadeDuration = 2,
  active = true,
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const strength = useRef({ value: 0 });

  const uniforms = useMemo(() => {
    const { origin, axis } = EDGES[edge];
    return {
      color: { value: new THREE.Color(color) },
      intensity: { value: 0 },
      origin: { value: new THREE.Vector2(origin[0], origin[1]) },
      axis: { value: new THREE.Vector2(axis[0], axis[1]) },
      spread: { value: spread },
    };
  }, [color, edge, spread]);

  useEffect(() => {
    if (active) {
      const tl = gsap.timeline();
      tl.to(strength.current, { value: intensity, duration: fadeInDuration, ease: 'power2.out' });
      tl.to({}, { duration });
      tl.to(strength.current, { value: 0, duration: fadeDuration, ease: 'power2.inOut' });
      return () => { tl.kill(); };
    }
  }, [active, intensity, fadeInDuration, duration, fadeDuration]);

  useFrame(() => {
    if (!meshRef.current) return;
    const material = meshRef.current.material as THREE.ShaderMaterial;
    material.uniforms.intensity.value = strength.current.value;
  });

  return (
    // renderOrder -1: this is a backdrop. Drawn after the particles it would
    // add light back over them, which additive particles do not care about but
    // makes a normally-blended dark particle disappear again.
    <mesh ref={meshRef} position={[0, 0, 0]} renderOrder={-1}>
      {/*
        The vertex shader writes gl_Position straight from `position`, so these
        vertices are already in clip space and must span [-1, 1] to fill the
        screen. Same arrangement as SubtleTopBeams.
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

export default VFXEdgeGlow;
