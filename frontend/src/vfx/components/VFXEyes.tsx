import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import gsap from 'gsap';
import type { EyesParams } from '../types';

/**
 * Eyes opening around the frame: white, with a coloured iris and a dark
 * pupil, each opening in turn, looking about, blinking, and closing again as
 * the effect fades.
 *
 * Painted over the frame rather than added to it — the whites and pupils have
 * to read against a dark interface, and added light cannot draw black.
 */

/** The shader declares fixed-length arrays, so the count has a ceiling. */
const MAX_EYES = 24;

/** mulberry32 — the same generator the sparkles use, for the same reason. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface EyePlacement {
  x: number;
  y: number;
  /** 0–1: when it opens, and where its blinks fall. */
  phase: number;
  scale: number;
}

/**
 * Spots around the frame, in 0–1 frame coordinates. The middle band is left
 * empty, because that is where the winner's name sits, and no two eyes are
 * allowed to overlap. A crowded request places as many as fit.
 */
function placeEyes(count: number, seed: number): EyePlacement[] {
  const random = seededRandom(seed);
  const eyes: EyePlacement[] = [];
  for (let attempt = 0; attempt < 600 && eyes.length < count; attempt++) {
    const x = 0.08 + random() * 0.84;
    const y = 0.07 + random() * 0.86;
    if (Math.abs(x - 0.5) < 0.3 && Math.abs(y - 0.5) < 0.17) continue;
    if (eyes.some((eye) => Math.hypot(eye.x - x, eye.y - y) < 0.13)) continue;
    eyes.push({ x, y, phase: random(), scale: 0.8 + random() * 0.45 });
  }
  return eyes;
}

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
  uniform float strength;
  uniform float intensity;
  uniform float aspect;
  uniform float size;
  uniform vec3 irisColor;
  uniform float wander;
  uniform float blinkRate;
  uniform float appear;
  uniform vec2 eyePos[${MAX_EYES}];
  uniform float eyePhase[${MAX_EYES}];
  uniform float eyeScale[${MAX_EYES}];
  uniform float eyeCount;

  float hash(float n) {
    return fract(sin(n * 78.233) * 43758.5453);
  }

  void main() {
    vec2 fix = vec2(aspect, 1.0) / min(aspect, 1.0);
    vec3 outRgb = vec3(0.0);
    float outAlpha = 0.0;

    for (int i = 0; i < ${MAX_EYES}; i++) {
      if (float(i) >= eyeCount) break;

      // Eye units: -1 to 1 across its width.
      vec2 e = (vUv - eyePos[i]) * fix / (size * eyeScale[i]) * 2.0;
      if (abs(e.x) > 1.4 || abs(e.y) > 1.1) continue;

      float phase = eyePhase[i];
      float id = float(i);

      // Opens in turn, closes as the effect fades, and blinks in between.
      float start = phase * appear;
      float open = smoothstep(start, start + 0.35, time) * clamp(strength * 1.6, 0.0, 1.0);
      float beat = fract(time * blinkRate + phase * 7.13);
      float blink = smoothstep(0.0, 0.035, beat) * (1.0 - smoothstep(0.035, 0.07, beat));
      open *= 1.0 - blink * step(0.001, blinkRate);

      // Lids: two arcs that meet at the corners.
      float bow = 1.0 - e.x * e.x;
      float upper = 0.5 * open * bow;
      float lower = -0.38 * open * bow;
      float across = step(abs(e.x), 1.0);
      float inside = across * smoothstep(upper + 0.02, upper - 0.02, e.y) * smoothstep(lower - 0.02, lower + 0.02, e.y);

      // Where it looks: at the middle, or about, jumping between glances.
      vec2 toMiddle = normalize((vec2(0.5) - eyePos[i]) * fix + 0.0001);
      float glance = time * 0.9 + phase * 13.0;
      float k = floor(glance);
      vec2 from = vec2(hash(k + id * 3.1), hash(k * 1.3 + id * 7.7)) - 0.5;
      vec2 to = vec2(hash(k + 1.0 + id * 3.1), hash((k + 1.0) * 1.3 + id * 7.7)) - 0.5;
      vec2 about = mix(from, to, smoothstep(0.0, 0.15, fract(glance))) * 1.4;
      vec2 look = mix(toMiddle, about, wander);
      vec2 irisAt = look * vec2(0.5, 0.18);

      // Sclera, a little darker and pinker towards the corners.
      vec3 rgb = vec3(0.93, 0.9, 0.86) * (0.72 + 0.28 * smoothstep(1.0, 0.25, abs(e.x)));
      rgb = mix(rgb, vec3(0.82, 0.55, 0.52), smoothstep(0.55, 1.0, abs(e.x)) * 0.45);

      // Iris, streaked, dark at its rim; then the pupil and a highlight.
      vec2 fromIris = e - irisAt;
      float r = length(fromIris);
      float streak = 0.75 + 0.25 * sin(atan(fromIris.y, fromIris.x) * 23.0 + hash(id) * 6.0);
      vec3 iris = irisColor * streak * mix(1.2, 0.4, smoothstep(0.24, 0.36, r));
      rgb = mix(rgb, iris, smoothstep(0.36, 0.34, r));
      rgb = mix(rgb, vec3(0.02), smoothstep(0.15, 0.13, r));
      rgb = mix(rgb, vec3(1.0), smoothstep(0.065, 0.045, length(fromIris - vec2(-0.1, 0.1))) * 0.9);

      // Dark lid edges, and a soft shadow of skin around the eye.
      float rims = across * max(smoothstep(0.07, 0.0, abs(e.y - upper)), smoothstep(0.04, 0.0, abs(e.y - lower)));
      float shadow = (1.0 - smoothstep(0.55, 1.2, length(e * vec2(0.82, 1.8)))) * 0.5;
      float visible = smoothstep(start, start + 0.2, time);

      float alpha = max(max(shadow * visible, inside), rims * visible);
      vec3 colour = mix(vec3(0.05, 0.03, 0.03), rgb, inside);
      colour = mix(colour, vec3(0.03, 0.02, 0.02), rims * (1.0 - inside * 0.4));

      if (alpha > outAlpha) {
        outAlpha = alpha;
        outRgb = colour;
      }
    }

    gl_FragColor = vec4(outRgb, outAlpha * clamp(strength * 2.0, 0.0, 1.0) * intensity);
  }
`;

interface VFXEyesProps extends EyesParams {
  active?: boolean;
  /** Varies where the eyes open between runs. See VFXSparkles. */
  seed?: number;
}

const VFXEyes: React.FC<VFXEyesProps> = ({
  count = 9,
  size = 0.12,
  irisColor = '#c98a2a',
  gaze = 'winner',
  blinkRate = 0.25,
  intensity = 1,
  fadeInDuration = 1,
  duration = 3,
  fadeDuration = 2,
  active = true,
  seed = 1,
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const strength = useRef({ value: 0 });
  const timeline = useRef<gsap.core.Timeline | null>(null);
  const started = useRef(false);
  const elapsed = useRef(0);

  const uniforms = useMemo(() => {
    const eyes = placeEyes(Math.min(Math.max(Math.round(count), 0), MAX_EYES), seed);
    const pad = <T,>(values: T[], fill: T) =>
      Array.from({ length: MAX_EYES }, (_, i) => (i < values.length ? values[i] : fill));
    return {
      time: { value: 0 },
      strength: { value: 0 },
      intensity: { value: intensity },
      aspect: { value: 1 },
      size: { value: size },
      irisColor: { value: new THREE.Color(irisColor) },
      wander: { value: gaze === 'wander' ? 1 : 0 },
      blinkRate: { value: blinkRate },
      // Openings spread over the fade in and the start of the hold, so they
      // read as one after another rather than all at once.
      appear: { value: Math.max(fadeInDuration, 0.2) + duration * 0.4 },
      eyePos: { value: pad(eyes.map((eye) => new THREE.Vector2(eye.x, eye.y)), new THREE.Vector2(-9, -9)) },
      eyePhase: { value: pad(eyes.map((eye) => eye.phase), 0) },
      eyeScale: { value: pad(eyes.map((eye) => eye.scale), 1) },
      eyeCount: { value: eyes.length },
    };
  }, [count, seed, intensity, size, irisColor, gaze, blinkRate, fadeInDuration, duration]);

  // Built paused and started on the first drawn frame. See VFXClock.
  useEffect(() => {
    if (active) {
      const tl = gsap.timeline({ paused: true });
      tl.to(strength.current, { value: 1, duration: fadeInDuration, ease: 'power1.inOut' });
      tl.to({}, { duration });
      tl.to(strength.current, { value: 0, duration: fadeDuration, ease: 'power2.inOut' });
      timeline.current = tl;
      return () => {
        tl.kill();
        timeline.current = null;
        started.current = false;
      };
    }
  }, [active, fadeInDuration, duration, fadeDuration]);

  useFrame((state, delta) => {
    if (!meshRef.current) return;
    if (timeline.current && !started.current) {
      started.current = true;
      timeline.current.play();
    }
    elapsed.current += delta;
    const material = meshRef.current.material as THREE.ShaderMaterial;
    material.uniforms.time.value = elapsed.current;
    material.uniforms.strength.value = strength.current.value;
    const { width, height } = state.size;
    material.uniforms.aspect.value = height > 0 ? width / height : 1;
  });

  return (
    <mesh ref={meshRef} position={[0, 0, 0]} renderOrder={1}>
      {/* Clip-space quad: the vertex shader writes gl_Position straight from position. */}
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

export default VFXEyes;
