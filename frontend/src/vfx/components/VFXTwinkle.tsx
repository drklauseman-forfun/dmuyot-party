import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import gsap from 'gsap';
import type { TwinkleParams } from '../types';

interface VFXTwinkleProps extends TwinkleParams {
  active?: boolean;
  /** Varies the layout between runs; see VFXSparkles for why it is a seed. */
  seed?: number;
}

/** mulberry32 — the same scatter used by the particles. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/*
 * Sparkles, as against the particles next door.
 *
 * The particles are soft round points that drift: a cloud. A sparkle is a
 * star-shaped glint that flares and dies back, and what makes it read as one
 * is that it spends most of its life dim. A field of stars all held at full
 * brightness looks like confetti; the wink is the whole effect.
 *
 * Each point flares on its own clock, and grows as it flares — the size
 * change does as much of the work as the brightness. The star itself is drawn
 * in the fragment shader from the point's own coordinates rather than from a
 * texture, so there is no image to load and no colour space to get wrong.
 */

const vertexShader = `
  uniform float time;
  uniform float size;
  uniform float speed;
  uniform float maxPixelSize;
  attribute float phase;
  attribute float rate;
  attribute float sizeRandomness;
  varying float vGlint;
  varying float vSpin;

  void main() {
    vec3 pos = position;
    // A slow wander, so the field is not a frozen grid of stars.
    pos.x += sin(time * 0.35 + phase * 6.283) * 0.6;
    pos.y += cos(time * 0.27 + phase * 9.100) * 0.6;

    // The wink. A high power on a sine spends most of the cycle near nothing
    // and only briefly near one, which is what a sparkle does.
    float pulse = max(sin(time * speed * rate + phase * 6.283), 0.0);
    float glint = pow(pulse, 6.0);
    // A floor, so the field never empties completely between flares.
    vGlint = 0.12 + glint;
    // Each star sits at its own angle and turns slowly.
    vSpin = phase * 6.283 + time * 0.4;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    // Growing as it flares reads as twinkling more than brightness alone does.
    float grow = 0.55 + 0.9 * glint;
    gl_PointSize = min(size * sizeRandomness * grow * (300.0 / -mvPosition.z), maxPixelSize);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = `
  uniform vec3 color;
  uniform float opacity;
  uniform float points;
  varying float vGlint;
  varying float vSpin;

  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float r = length(p) * 2.0;
    if (r > 1.0) discard;

    float c = cos(vSpin);
    float s = sin(vSpin);
    vec2 q = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
    float ang = atan(q.y, q.x);

    // Half the number of points, rounded: the wave has to close on itself
    // where the angle wraps, or a seam runs through every star. The sun's
    // rays had exactly this problem at a fractional count.
    float k = max(floor(points * 0.5 + 0.5), 1.0);
    float lobes = pow(abs(cos(ang * k)), 14.0);

    // A hot core, and spikes that run out from it and fade with distance.
    float core = exp(-r * r * 18.0);
    float spike = lobes * pow(1.0 - r, 2.5);

    // Additive, so the brightness rides in alpha alone.
    float v = (core + spike * 1.1) * vGlint * opacity;
    gl_FragColor = vec4(color, clamp(v, 0.0, 1.0));
  }
`;

const VFXTwinkle: React.FC<VFXTwinkleProps> = ({
  color = '#ffffff',
  count = 120,
  scale = 12,
  size = 3,
  speed = 3,
  points = 4,
  // Capped by default, unlike the particles: a star that flares close to the
  // camera is already growing on its own, and uncapped it swallows the frame.
  maxPixelSize = 48,
  fadeInDuration = 1,
  duration = 3,
  fadeDuration = 2,
  active = true,
  seed = 1,
}) => {
  const pointsRef = useRef<THREE.Points>(null);
  const opacityState = useRef({ value: 0 });

  const halfExtent = useMemo(() => {
    const s = Array.isArray(scale) ? scale : [scale, scale, scale];
    const safe = s.map((n) => Math.max(Math.abs(n), 0.001));
    return new THREE.Vector3(safe[0], safe[1], safe[2]);
  }, [scale]);

  const [positions, phases, rates, sizeRandomness] = useMemo(() => {
    const random = seededRandom(seed);
    const pos = new Float32Array(count * 3);
    const ph = new Float32Array(count);
    const rt = new Float32Array(count);
    const sz = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (random() - 0.5) * halfExtent.x * 2;
      pos[i * 3 + 1] = (random() - 0.5) * halfExtent.y * 2;
      pos[i * 3 + 2] = (random() - 0.5) * halfExtent.z * 2;
      ph[i] = random();
      // A spread of rates, so they never fall into step with each other.
      rt[i] = 0.5 + random() * 1.5;
      sz[i] = 0.6 + random() * 0.7;
    }
    return [pos, ph, rt, sz];
  }, [count, halfExtent, seed]);

  const uniforms = useMemo(
    () => ({
      time: { value: 0 },
      color: { value: new THREE.Color(color) },
      opacity: { value: 0 },
      size: { value: size },
      speed: { value: speed },
      points: { value: points },
      maxPixelSize: { value: maxPixelSize },
    }),
    [color, size, speed, points, maxPixelSize],
  );

  // Built paused and started on the first drawn frame: mounting stalls while
  // the shaders compile, and a timeline started before that spends its fade-in
  // inside the stall. See VFXSparkles.
  const timeline = useRef<gsap.core.Timeline | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (active) {
      const tl = gsap.timeline({ paused: true });
      tl.to(opacityState.current, { value: 1, duration: fadeInDuration, ease: 'power2.out' });
      tl.to({}, { duration });
      tl.to(opacityState.current, { value: 0, duration: fadeDuration, ease: 'power2.inOut' });
      timeline.current = tl;
      return () => {
        tl.kill();
        timeline.current = null;
        started.current = false;
      };
    }
  }, [active, fadeInDuration, duration, fadeDuration]);

  /** Local, not the canvas clock: the canvas outlives any one effect. */
  const elapsed = useRef(0);

  useFrame((_state, delta) => {
    if (!pointsRef.current) return;
    if (timeline.current && !started.current) {
      started.current = true;
      timeline.current.play();
    }
    elapsed.current += delta;
    const material = pointsRef.current.material as THREE.ShaderMaterial;
    material.uniforms.time.value = elapsed.current;
    material.uniforms.opacity.value = opacityState.current.value;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-phase" args={[phases, 1]} />
        <bufferAttribute attach="attributes-rate" args={[rates, 1]} />
        <bufferAttribute attach="attributes-sizeRandomness" args={[sizeRandomness, 1]} />
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

export default VFXTwinkle;
