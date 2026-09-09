import React, { useRef, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import gsap from 'gsap';
import type { BlackHoleParams } from '../types';

/**
 * A black hole: dark core, accretion ring, and a starfield bent around it.
 *
 * The stars are generated in the shader rather than sampled from the scene.
 * The effect canvas sits above the interface and cannot read the page behind
 * it, so there is nothing of the app to distort — what bends is the field this
 * shader draws for itself, which is what sells the lensing.
 *
 * Blends normally rather than additively, because the core has to be *black*
 * and adding black to a frame changes nothing. Normal blending lets one
 * material do both: alpha 1 with black for the core, and a bright colour at
 * partial alpha for the ring and stars.
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
  uniform float time;
  uniform float intensity;
  uniform float aspect;
  uniform float radius;
  uniform float spin;
  uniform vec2 center;
  uniform float density;
  uniform vec3 diskColor;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  /** Sparse points on a jittered grid — a starfield without a texture. */
  float stars(vec2 p) {
    vec2 cell = floor(p);
    vec2 f = fract(p);
    float total = 0.0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 g = vec2(float(x), float(y));
        vec2 offset = vec2(hash(cell + g), hash(cell + g + 41.0));
        // Fewer cells hold a star as density falls. At 1 this is roughly one
        // cell in seven, which is what the effect was first tuned against.
        float present = step(1.0 - 0.14 * density, hash(cell + g + 13.0));
        float d = length(g + offset - f);
        total += present * smoothstep(0.13, 0.0, d);
      }
    }
    return total;
  }

  void main() {
    // Distances are in units of the frame's SHORTER side, so the radius means
    // the same thing on a phone as on a desktop. Measured against the height
    // alone, the same value that gave a modest hole in a landscape window came
    // out wider than half the screen on a portrait one, swallowing the modal.
    vec2 p = (vUv - center) * vec2(aspect, 1.0) / min(aspect, 1.0);
    float r = max(length(p), 0.0005);
    float angle = atan(p.y, p.x);

    // Deflection grows sharply as the horizon is approached, so the field
    // stretches into a ring rather than shifting uniformly.
    float bend = (radius * radius) / r;
    // Everything also winds around, faster nearer in.
    float swirl = spin * time * (radius / r) * 0.6;
    float a2 = angle + swirl;
    vec2 lensed = vec2(cos(a2), sin(a2)) * (r + bend * 1.4);

    float field = clamp(stars(lensed * 9.0 + vec2(time * 0.02, 0.0)), 0.0, 1.0);
    // Light piles up just outside the horizon.
    field *= 0.35 + 1.65 * smoothstep(radius * 4.0, radius * 1.1, r);

    // The accretion ring, brightest a little outside the horizon and brighter
    // still on one side, which reads as rotation.
    float ringDistance = (r - radius * 1.28) / (radius * 0.42);
    float ring = exp(-ringDistance * ringDistance);
    ring *= 0.62 + 0.38 * sin(a2 * 2.0 + time * spin);

    // Inside the horizon nothing escapes, including the ring and the stars.
    float horizon = 1.0 - smoothstep(radius * 0.94, radius * 1.03, r);
    // A soft shadow beyond it, so the hole sits in something rather than
    // floating on the interface.
    float shadow = (1.0 - smoothstep(radius, radius * 5.0, r)) * 0.55;

    vec3 colour = diskColor * ring * 2.2 + vec3(1.0) * field * 0.9;
    float alpha = max(max(ring, field * 0.85), shadow);

    colour = mix(colour, vec3(0.0), horizon);
    alpha = max(alpha, horizon);

    gl_FragColor = vec4(colour, clamp(alpha, 0.0, 1.0) * intensity);
  }
`;

interface VFXBlackHoleProps extends BlackHoleParams {
  active?: boolean;
}

const VFXBlackHole: React.FC<VFXBlackHoleProps> = ({
  color = '#454b55',
  radius = 0.16,
  spin = 1,
  intensity = 1,
  strands = 1,
  center = [0.5, 0.5],
  fadeInDuration = 1,
  duration = 3,
  fadeDuration = 2,
  active = true,
}) => {
  // Pulled apart so the memo below depends on the numbers rather than on the
  // array, which a caller writing `center: [0.5, 0.3]` inline rebuilds every
  // render.
  const [centerX, centerY] = center;

  const meshRef = useRef<THREE.Mesh>(null);
  const strength = useRef({ value: 0 });

  const uniforms = useMemo(
    () => ({
      time: { value: 0 },
      intensity: { value: 0 },
      aspect: { value: 1 },
      radius: { value: radius },
      spin: { value: spin },
      diskColor: { value: new THREE.Color(color) },
      center: { value: new THREE.Vector2(centerX, centerY) },
      density: { value: strands },
    }),
    [color, radius, spin, centerX, centerY, strands],
  );

  useEffect(() => {
    if (active) {
      const tl = gsap.timeline();
      tl.to(strength.current, { value: intensity, duration: fadeInDuration, ease: 'power2.out' });
      tl.to({}, { duration });
      tl.to(strength.current, { value: 0, duration: fadeDuration, ease: 'power2.inOut' });
      return () => { tl.kill(); };
    }
  }, [active, intensity, fadeInDuration, duration, fadeDuration]);

  // Local elapsed time so each run starts at t=0 — the canvas clock keeps
  // running between effects. Same pattern as the other modules.
  const elapsed = useRef(0);

  useFrame((state, delta) => {
    if (!meshRef.current) return;
    elapsed.current += delta;
    const material = meshRef.current.material as THREE.ShaderMaterial;
    material.uniforms.time.value = elapsed.current;
    material.uniforms.intensity.value = strength.current.value;
    // Read every frame rather than from a resize effect: the canvas is what
    // owns this size, and without it the hole is an ellipse on any non-square
    // viewport.
    const { width, height } = state.size;
    material.uniforms.aspect.value = height > 0 ? width / height : 1;
  });

  return (
    // renderOrder 1: this reaches the frame after the edge glows, which are
    // backdrops, so the hole is not lit back up from behind.
    <mesh ref={meshRef} position={[0, 0, 0]} renderOrder={1}>
      {/*
        Clip-space quad: the vertex shader writes gl_Position straight from
        `position`, so these vertices must span [-1, 1] to fill the screen.
      */}
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        blending={THREE.NormalBlending}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
};

export default VFXBlackHole;
