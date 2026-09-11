import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import gsap from 'gsap';
import type { SlashesParams } from '../types';

/**
 * Cuts tearing across the frame one after another, left behind as scars.
 *
 * Each slash is revealed along its length with a bright head, then settles.
 * Claws and blade cuts add light; tears paint a dark cut with a glowing edge,
 * which only painting over the frame can do.
 */

/** The shader declares fixed-length arrays, so these have ceilings. */
const MAX_SLASHES = 8;
const MAX_LINES = 5;

const STYLE_IDS = { claws: 0, tears: 1, blade: 2 } as const;

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

/**
 * Where each slash runs, in 0–1 frame coordinates, and when it starts. Each
 * one is centred away from the middle and runs across the line to it rather
 * than along it, so it passes beside the winner's name instead of through it.
 */
function placeSlashes(interval: number, seed: number) {
  const random = seededRandom(seed);
  return Array.from({ length: MAX_SLASHES }, (_, i) => {
    let cx = 0.15 + random() * 0.7;
    let cy = 0.15 + random() * 0.7;
    const dx = cx - 0.5;
    const dy = cy - 0.5;
    const distance = Math.max(Math.hypot(dx, dy), 0.001);
    if (distance < 0.24) {
      cx = 0.5 + (dx / distance) * 0.24;
      cy = 0.5 + (dy / distance) * 0.24;
    }
    const angle = Math.atan2(dy, dx) + Math.PI / 2 + (random() - 0.5) * 0.8;
    const half = 0.2 + random() * 0.14;
    const reach = [Math.cos(angle) * half, Math.sin(angle) * half];
    const forwards = random() < 0.5;
    const a = new THREE.Vector2(cx - reach[0], cy - reach[1]);
    const b = new THREE.Vector2(cx + reach[0], cy + reach[1]);
    return {
      from: forwards ? a : b,
      to: forwards ? b : a,
      start: i * interval + random() * interval * 0.3,
    };
  });
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
  uniform vec3 color;
  uniform float styleId;
  uniform float count;
  uniform float lines;
  uniform float width;
  uniform float swipe;
  uniform vec2 slashFrom[${MAX_SLASHES}];
  uniform vec2 slashTo[${MAX_SLASHES}];
  uniform float slashStart[${MAX_SLASHES}];

  const float PI = 3.14159265359;

  vec2 segment(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
    return vec2(length(pa - ba * h), h);
  }

  float hash(float n) {
    return fract(sin(n * 12.9898) * 43758.5453);
  }

  float noise(float x) {
    float i = floor(x);
    float f = fract(x);
    return mix(hash(i), hash(i + 1.0), f * f * (3.0 - 2.0 * f));
  }

  void main() {
    // Measured against the shorter side, as VFXBlackHole explains.
    vec2 fix = vec2(aspect, 1.0) / min(aspect, 1.0);
    vec2 p = (vUv - 0.5) * fix;
    bool blade = styleId > 1.5;

    float core = 0.0;
    float glow = 0.0;
    float head = 0.0;

    for (int i = 0; i < ${MAX_SLASHES}; i++) {
      if (float(i) >= count) break;
      float age = time - slashStart[i];
      if (age <= 0.0) continue;

      float reveal = clamp(age / max(swipe, 0.01), 0.0, 1.0);
      // Brightest as it tears, settling to a lasting scar.
      float settle = 1.0 - 0.4 * smoothstep(swipe, swipe + 1.5, age);
      vec2 a = (slashFrom[i] - 0.5) * fix;
      vec2 b = (slashTo[i] - 0.5) * fix;
      float span = length(b - a);
      vec2 dir = (b - a) / max(span, 1e-4);
      vec2 across = vec2(-dir.y, dir.x);

      for (int j = 0; j < ${MAX_LINES}; j++) {
        if (float(j) >= lines) break;
        float fromMiddle = float(j) - (lines - 1.0) * 0.5;
        // Outer marks sit a little shorter, as a claw's outer talons do.
        float trim = abs(fromMiddle) * 0.08 * span;
        vec2 start = a + across * fromMiddle * width * 3.2 + dir * trim;
        vec2 end = b + across * fromMiddle * width * 3.2 - dir * trim;
        vec2 torn = mix(start, end, reveal);
        vec2 s = segment(p, start, torn);
        float along = s.y * reveal;

        // Not "half": that is a reserved word in GLSL, and the shader would not compile.
        float halfWidth = width * pow(sin(PI * clamp(along, 0.0, 1.0)), 0.7) * (blade ? 0.6 : 1.0);
        if (!blade) halfWidth *= 0.7 + 0.6 * noise(along * 38.0 + float(i * 5 + j) * 11.0);

        core = max(core, smoothstep(halfWidth, halfWidth * 0.35, s.x));
        glow = max(glow, exp(-max(s.x - halfWidth, 0.0) / (width * (blade ? 1.6 : 2.6))) * settle);
        if (reveal < 1.0) {
          head = max(head, smoothstep(width * 6.0, 0.0, length(p - torn)) * (1.0 - reveal * 0.5));
        }
      }
    }

    float fade = strength * intensity;
    if (styleId > 0.5 && styleId < 1.5) {
      // Tears: a dark cut, with the colour glowing along its edges.
      vec3 rgb = mix(color * 1.25, vec3(0.0), core);
      rgb = mix(rgb, vec3(1.0, 0.92, 0.85), head * 0.6);
      float alpha = max(max(core, glow * 0.8), head);
      gl_FragColor = vec4(rgb, alpha * fade);
    } else {
      // Claws and blades add light: a white-hot centre in a coloured glow.
      float light = clamp(core + glow * 0.55 + head * 1.2, 0.0, 1.0);
      vec3 rgb = color * 1.4 + vec3(core * 0.45 + head * 0.8);
      gl_FragColor = vec4(rgb, light * fade);
    }
  }
`;

interface VFXSlashesProps extends SlashesParams {
  active?: boolean;
  /** Varies where the slashes fall between runs. See VFXSparkles. */
  seed?: number;
}

const VFXSlashes: React.FC<VFXSlashesProps> = ({
  style = 'claws',
  color = '#ff2a2a',
  count = 3,
  lines = 3,
  width = 0.012,
  interval = 0.35,
  swipe = 0.16,
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
    const slashes = placeSlashes(interval, seed);
    return {
      time: { value: 0 },
      strength: { value: 0 },
      intensity: { value: intensity },
      aspect: { value: 1 },
      color: { value: new THREE.Color(color) },
      styleId: { value: STYLE_IDS[style] },
      count: { value: Math.min(Math.max(Math.round(count), 0), MAX_SLASHES) },
      // A blade makes one cut. Marks per slash is a claw setting: a blade that
      // honoured it drew three parallel strokes, which read as claws.
      lines: { value: style === 'blade' ? 1 : Math.min(Math.max(Math.round(lines), 1), MAX_LINES) },
      width: { value: width },
      swipe: { value: swipe },
      slashFrom: { value: slashes.map((slash) => slash.from) },
      slashTo: { value: slashes.map((slash) => slash.to) },
      slashStart: { value: slashes.map((slash) => slash.start) },
    };
  }, [interval, seed, intensity, color, style, count, lines, width, swipe]);

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
    const { width: w, height: h } = state.size;
    material.uniforms.aspect.value = h > 0 ? w / h : 1;
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
        blending={style === 'tears' ? THREE.NormalBlending : THREE.AdditiveBlending}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
};

export default VFXSlashes;
