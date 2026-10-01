import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import gsap from 'gsap';
import type { GlitchParams } from '../types';

/**
 * A picture breaking up: torn slices sliding sideways, colour separating into
 * red and cyan ghosts, or blocks of static.
 *
 * It arrives in bursts rather than running continuously — a glitch that never
 * stops reads as a texture, and only the sudden break reads as a fault. Each
 * burst picks its own slices, so no two look alike.
 *
 * Drawn in light, added to the frame: the canvas has no way to displace what
 * is underneath it, so the tear is made of bright bands laid over it instead.
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
  uniform float strength;
  uniform float intensity;
  uniform float aspect;
  uniform vec3 color;
  uniform float rate;
  uniform float coverage;
  uniform float style;

  float hash(float n) {
    return fract(sin(n * 78.233) * 43758.5453);
  }

  float hash2(vec2 p) {
    return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453);
  }

  /**
   * What one row of the broken picture holds: blocks along its width, in
   * random widths. Everything below is this pattern, read at an offset.
   */
  float row_content(float x, float row, float seed) {
    float cells = mix(5.0, 16.0, hash2(vec2(row, seed * 1.7)));
    float cell = floor(x * cells);
    return step(0.42, hash2(vec2(cell, row * 3.7 + seed)));
  }

  void main() {
    // Bursts: each one is a whole number of beats, and holds for the first
    // third of the beat. Between them the screen is left alone.
    float beat = time * max(rate, 0.001);
    float id = floor(beat);
    float within = fract(beat);
    float burst = (1.0 - smoothstep(0.0, 0.34, within)) * step(hash(id * 1.7), 0.86);
    if (burst <= 0.001) discard;

    vec3 rgb = vec3(0.0);
    float alpha = 0.0;

    if (style < 0.5) {
      // Torn slices: rows of the picture slid sideways, with a bright line
      // along the tear itself.
      float rows = mix(9.0, 20.0, hash(id + 3.3));
      float row = floor(vUv.y * rows);
      float torn = step(1.0 - coverage, hash2(vec2(row, id)));
      float shift = (hash2(vec2(row, id + 7.0)) - 0.5) * 0.4;
      float content = row_content(vUv.x + shift, row, id);
      float within_row = fract(vUv.y * rows);
      float tear_line = smoothstep(0.1, 0.0, within_row) + smoothstep(0.9, 1.0, within_row);
      alpha = torn * clamp(content * 0.7 + tear_line * 0.55, 0.0, 1.0);
      rgb = mix(color, vec3(1.0), tear_line * 0.8);
    } else if (style < 1.5) {
      // Colour separating: the same row read three times, a little to each
      // side. Where only one channel lands there is a red or cyan fringe, and
      // where all three overlap it goes white, which is what a split looks like.
      float rows = mix(5.0, 12.0, hash(id + 5.1));
      float row = floor(vUv.y * rows);
      float lit = step(1.0 - coverage, hash2(vec2(row, id + 2.0)));
      float off = 0.012 + hash2(vec2(row, id)) * 0.035;
      float red = row_content(vUv.x + off, row, id + 1.0);
      float mid = row_content(vUv.x, row, id + 1.0);
      float blue = row_content(vUv.x - off, row, id + 1.0);
      rgb = vec3(red, mid * 0.85, blue);
      rgb = mix(rgb, color * max(red, blue), 0.2);
      alpha = lit * max(max(red, mid), blue) * 0.8;
    } else {
      // Blocks of static, in a grid that is coarser on a phone than a desktop
      // only because the frame is.
      vec2 cells = vec2(floor(18.0 * aspect), 22.0);
      vec2 cell = floor(vUv * cells);
      float lit = step(1.0 - coverage * 0.6, hash2(cell + id * 13.0));
      float grain = hash2(cell * 3.0 + floor(time * 40.0));
      rgb = mix(color, vec3(1.0), step(0.78, grain) * 0.7 + grain * 0.25);
      alpha = lit * (0.45 + 0.55 * grain);
    }

    // Scanlines across the whole burst, so the three styles share a texture.
    float scan = 0.85 + 0.15 * sin(vUv.y * 420.0);
    float a = clamp(alpha * burst * strength * intensity, 0.0, 1.0) * scan;
    if (a <= 0.004) discard;
    gl_FragColor = vec4(rgb * a, a);
  }
`;

const STYLES: Record<NonNullable<GlitchParams['style']>, number> = {
  tear: 0,
  split: 1,
  blocks: 2,
};

interface VFXGlitchProps extends GlitchParams {
  active?: boolean;
}

const VFXGlitch: React.FC<VFXGlitchProps> = ({
  style = 'tear',
  color = '#8ad7ff',
  rate = 3,
  coverage = 0.35,
  intensity = 1,
  fadeInDuration = 1,
  duration = 3,
  fadeDuration = 2,
  active = true,
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const strength = useRef({ value: 0 });
  const timeline = useRef<gsap.core.Timeline | null>(null);
  const started = useRef(false);
  const elapsed = useRef(0);

  const uniforms = useMemo(
    () => ({
      time: { value: 0 },
      strength: { value: 0 },
      intensity: { value: intensity },
      aspect: { value: 1 },
      color: { value: new THREE.Color(color) },
      rate: { value: rate },
      coverage: { value: coverage },
      style: { value: STYLES[style] ?? 0 },
    }),
    [color, rate, coverage, intensity, style],
  );

  // Built paused, played from the first drawn frame. See VFXClock.
  useEffect(() => {
    if (!active) return;
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
    <mesh ref={meshRef} position={[0, 0, 0]}>
      {/* Clip-space quad: the vertex shader writes gl_Position from position. */}
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

export default VFXGlitch;
