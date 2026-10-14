import React, { useRef, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import gsap from 'gsap';
import type { FlamesParams } from '../types';

/**
 * Fire: a wall of it along the bottom of the screen, flames up both sides, or
 * a single fire standing where it is put — with embers rising off it.
 *
 * This replaces the first fire, which is retired (see RETIRED_EFFECTS): that
 * one was a hash of white noise in a soft blob, and read as static, not
 * flame. Three things make this one read as fire:
 *
 * - **Tongues.** Two layers of rising noise, the finer one warped by the
 *   coarser, are subtracted from a heat that falls with height — and the
 *   noise is given more weight the higher it is. So the base is a solid
 *   sheet, and the top tears into separate licking tongues that break off.
 * - **Colour from temperature.** The hottest parts are not the colour picked
 *   but near white, then a yellow, then the colour itself, then a deep ember
 *   red at the cool edges. One colour scaled up and down reads as a glow.
 * - **Light, not paint.** Added to the frame and drawn through the bloom, so
 *   the core blooms the way a real flame flares a camera.
 *
 * It is all one full-screen shader, like the sun and the black hole. Pixels
 * well clear of any fire are thrown away before the noise is worked out.
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
  uniform float style;
  uniform float height;
  uniform float width;
  uniform vec2 spot;
  uniform float embers;
  uniform vec3 colour;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float total = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 5; i++) {
      total += amplitude * noise(p);
      p = p * 2.02 + vec2(1.7, 9.2);
      amplitude *= 0.5;
    }
    return total;
  }

  // The heat at a point. q.x runs along the burning edge and q.y away from
  // it, both in flame heights; drift is how far the fire has risen.
  //
  // The noise is stretched upward, as flames are taller than they are wide,
  // and pushed to high contrast, so that at every height a point is either
  // in a tongue or in the gap between two. The first version subtracted
  // soft noise from a heat already well past full, and the whole base
  // clipped to a white slab with an orange fringe on top.
  float field(vec2 q, vec2 drift) {
    vec2 p = vec2(q.x * 3.2, q.y * 1.3);
    float warp = fbm(p * 0.8 - drift * vec2(0.3, 1.1));
    float n = fbm(p + vec2(warp * 1.4, 0.0) - drift * vec2(0.0, 1.9));
    n = smoothstep(0.25, 0.75, n);
    float base = 1.0 - q.y;
    // A hot, unbroken base, tearing into separate tongues as it rises.
    return base * (0.45 + n) - q.y * 0.25;
  }

  // Sparks drifting up through and above the fire, in two layers of cells.
  float sparks(vec2 frame, float density) {
    float total = 0.0;
    for (int layer = 0; layer < 2; layer++) {
      float l = float(layer);
      float cells = 18.0 + l * 15.0;
      vec2 g = vec2(frame.x, frame.y - time * (0.16 + 0.07 * l)) * cells;
      vec2 cell = floor(g);
      vec2 f = fract(g);
      float h = hash(cell + l * 17.0);
      if (h > density) continue;
      vec2 at = vec2(hash(cell + 3.1), hash(cell + 7.7));
      at.x += sin(time * 2.0 + h * 40.0) * 0.22;
      float size = 0.05 + 0.06 * hash(cell + 11.0);
      float flicker = 0.55 + 0.45 * sin(time * 11.0 + h * 60.0);
      total += smoothstep(size, 0.0, length(f - at)) * flicker;
    }
    return total;
  }

  void main() {
    float h = max(height, 0.02);
    // Across in frame heights, so the noise is round on any screen.
    vec2 frame = vec2(vUv.x * aspect, vUv.y);
    float heat;
    float glow;
    float drift = time;
    float reach;

    if (style < 0.5) {
      // A wall along the bottom.
      reach = vUv.y / h;
      if (reach > 2.2) discard;
      heat = field(vec2(frame.x / h, reach), vec2(0.0, drift));
      glow = exp(-reach * 2.6) * 0.16;
    } else if (style < 1.5) {
      // Up both sides: heat falls with distance in from the nearer edge,
      // and the pattern streams upward along the edge, as flames do.
      float band = max(h * 0.5 * aspect, 0.02);
      float fromEdge = min(vUv.x, 1.0 - vUv.x) * aspect;
      reach = fromEdge / band;
      if (reach > 2.2) discard;
      // The two sides burn differently, not as a mirror image.
      float along = vUv.y / band + (vUv.x > 0.5 ? 31.7 : 0.0);
      // Leaned upward as they reach in, so the tongues curl up rather than
      // jetting sideways; and patchy along the edge, which otherwise burned
      // as one solid bar from top to bottom.
      heat = field(vec2(along - reach * 0.9, reach), vec2(drift * 0.7, drift * 0.45));
      heat *= 0.62 + 0.38 * noise(vec2(along * 0.7 - drift * 0.35, 4.2));
      glow = exp(-reach * 2.6) * 0.14;
    } else {
      // One fire, its base at the spot given.
      vec2 base = vec2(spot.x * aspect, spot.y);
      vec2 q = (frame - base) / h;
      float spread = max(width * aspect * 0.5 / h, 0.05);
      if (q.y > 2.3 || q.y < -0.2 || abs(q.x) > spread * 3.0 + q.y) discard;
      // The whole column sways a little as it burns.
      q.x += (fbm(vec2(q.y * 2.0 - drift * 1.1, 3.1)) - 0.5) * 0.35 * max(q.y, 0.0);
      // Narrowing as it rises, to tongues at the top.
      float across = abs(q.x) / (spread * (1.0 - 0.62 * clamp(q.y, 0.0, 1.0)) + 0.0001);
      float shape = 1.0 - smoothstep(0.45, 1.0, across);
      heat = field(vec2(q.x, max(q.y, 0.0)), vec2(0.0, drift)) * shape;
      heat *= smoothstep(-0.12, 0.03, q.y);
      reach = q.y;
      glow = exp(-length(vec2(q.x / (spread * 1.6), q.y * 1.6))) * 0.2;
    }

    // Kept below full for most of the fire, so only its hottest spots go white.
    float t = pow(clamp(heat * 0.85, 0.0, 1.0), 1.1);
    // From the coolest to the hottest: an ember red, the colour itself, a
    // brighter shade of it pushed towards yellow, and near white at the core.
    vec3 deep = colour * 0.32;
    vec3 hot = min(colour * 1.6 + 0.25, vec3(1.0));
    vec3 core = mix(hot, vec3(1.0, 0.98, 0.92), 0.7);
    vec3 c = deep * smoothstep(0.0, 0.18, t);
    c = mix(c, colour, smoothstep(0.15, 0.45, t));
    c = mix(c, hot, smoothstep(0.4, 0.72, t));
    c = mix(c, core, smoothstep(0.78, 1.0, t));
    vec3 fire = c * smoothstep(0.0, 0.2, t) * 0.95;

    // The light the fire throws on what is just around it.
    fire += colour * glow;

    // Embers, thinning out as they rise.
    if (embers > 0.0) {
      float lift = 1.0 - smoothstep(0.3, 2.0, reach);
      fire += hot * sparks(frame, embers * 0.4) * lift * 0.9;
    }

    // Alpha has to follow what is drawn: set to the fade alone, it was 1
    // over the whole region the shader runs in, and the canvas then laid an
    // opaque black block over the page there. So it carries the fire's own
    // brightness, and the colour is divided back by it, which keeps what is
    // added to the frame equal to the fire times the fade — no squaring.
    float lit = clamp(max(max(fire.r, fire.g), fire.b), 0.0, 1.0);
    gl_FragColor = vec4(fire / max(lit, 0.0001), lit * intensity);
  }
`;

const STYLES: Record<NonNullable<FlamesParams['style']>, number> = { wall: 0, sides: 1, single: 2 };

interface VFXFlamesProps extends FlamesParams {
  active?: boolean;
}

const VFXFlames: React.FC<VFXFlamesProps> = ({
  style = 'wall',
  height = 0.32,
  width = 0.3,
  position = [0.5, 0],
  speed = 1,
  embers = 0.5,
  color = '#ff6a14',
  intensity = 1,
  fadeInDuration = 1,
  duration = 3,
  fadeDuration = 2,
  active = true,
}) => {
  // Pulled apart so the memo depends on the numbers rather than on the array,
  // which a caller writing it inline rebuilds every render.
  const [spotX, spotY] = position;
  const meshRef = useRef<THREE.Mesh>(null);
  const strength = useRef({ value: 0 });

  const uniforms = useMemo(
    () => ({
      time: { value: 0 },
      intensity: { value: 0 },
      aspect: { value: 1 },
      style: { value: STYLES[style] },
      height: { value: height },
      width: { value: width },
      spot: { value: new THREE.Vector2(spotX, spotY) },
      embers: { value: embers },
      colour: { value: new THREE.Color(color) },
    }),
    [style, height, width, spotX, spotY, embers, color],
  );

  // Built paused and started on the first drawn frame. Mounting stalls while
  // the WebGL context is created and the shaders compile, and a timeline
  // started before that spends its fade-in during the stall. See VFXClock.
  const timeline = useRef<gsap.core.Timeline | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (active) {
      const tl = gsap.timeline({ paused: true });
      tl.to(strength.current, { value: intensity, duration: fadeInDuration, ease: 'power2.out' });
      tl.to({}, { duration });
      tl.to(strength.current, { value: 0, duration: fadeDuration, ease: 'power2.inOut' });
      timeline.current = tl;
      return () => {
        tl.kill();
        timeline.current = null;
        started.current = false;
      };
    }
  }, [active, intensity, fadeInDuration, duration, fadeDuration]);

  const elapsed = useRef(0);

  useFrame((state, delta) => {
    if (!meshRef.current) return;
    if (timeline.current && !started.current) {
      started.current = true;
      timeline.current.play();
    }
    elapsed.current += delta * speed;
    const material = meshRef.current.material as THREE.ShaderMaterial;
    material.uniforms.time.value = elapsed.current;
    material.uniforms.intensity.value = strength.current.value;
    const { width: w, height: hgt } = state.size;
    material.uniforms.aspect.value = hgt > 0 ? w / hgt : 1;
  });

  return (
    <mesh ref={meshRef} position={[0, 0, 0]}>
      {/*
        Clip-space quad: the vertex shader writes gl_Position straight from
        position, so these vertices must span [-1, 1] to fill the screen.
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

export default VFXFlames;
