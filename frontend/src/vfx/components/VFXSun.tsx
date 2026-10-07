import React, { useRef, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import gsap from 'gsap';
import type { SunParams } from '../types';

/**
 * A sun: a mottled disc with rays reaching out of it.
 *
 * Everything is drawn by the shader rather than from a picture, because the
 * surface has to churn and the rays have to shimmer. Three things make it
 * read as a sun rather than a yellow circle:
 *
 * - **Limb darkening.** A line of sight near the edge leaves the photosphere
 *   at a shallow angle, through cooler gas, so the rim is dimmer and redder
 *   than the middle. A disc of one flat colour reads as a sticker.
 * - **Granulation**, foreshortened towards the rim the way any pattern on a
 *   sphere is. Flat noise across the disc reads as a textured coin.
 * - **Rays of uneven length and spacing.** Evenly spaced spokes of equal
 *   length read as a cartoon star, so a noise field moves the crests about
 *   and gives each one its own reach.
 *
 * Blends additively and is not in `UNLIT_MODULES`, so it is drawn through the
 * bloom — which is what spreads the light past the rays and is most of why it
 * looks hot.
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
  uniform float rays;
  uniform float rayLength;
  uniform float spin;
  uniform float surface;
  uniform vec2 center;
  uniform vec3 discColor;
  uniform vec3 rayColor;

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
      p *= 2.03;
      amplitude *= 0.5;
    }
    return total;
  }

  void main() {
    // Distances in units of the frame's SHORTER side, as the black hole does,
    // so a radius means the same thing on a phone as on a desktop and the sun
    // stays round rather than becoming an ellipse.
    vec2 p = (vUv - center) * vec2(aspect, 1.0) / min(aspect, 1.0);
    float r = length(p);
    float angle = atan(p.y, p.x);
    float safeRadius = max(radius, 0.0001);

    // --- the disc ---------------------------------------------------------
    // How square-on this pixel is to the sphere: 1 at the middle, 0 at the
    // rim. Limb darkening follows from it.
    float across = clamp(r / safeRadius, 0.0, 1.0);
    float squareOn = sqrt(max(0.0, 1.0 - across * across));
    float limb = 0.34 + 0.66 * squareOn;

    float disc = smoothstep(safeRadius, safeRadius * 0.97, r);

    // Granulation. Dividing by squareOn compresses the cells towards the
    // rim, which is what a pattern wrapped onto a sphere does; the 0.45 keeps
    // that from running away to infinity at the very edge.
    //
    // Skipped outside the disc, where it is multiplied by zero anyway. This
    // is a full-screen shader and the disc is a small part of it, so these
    // two noise fields would otherwise be the bulk of the work on every
    // pixel of a phone's screen for nothing.
    float mottle = 1.0;
    if (disc > 0.001) {
      vec2 onSphere = p / safeRadius / (squareOn + 0.45);
      float cells = fbm(onSphere * 3.4 + vec2(0.0, time * 0.05))
                  + 0.5 * fbm(onSphere * 9.0 - vec2(time * 0.08, 0.0));
      mottle = 1.0 + surface * (cells - 0.78) * 0.9;
    }
    vec3 hot = mix(discColor, vec3(1.0), 0.4);
    vec3 body = mix(discColor * 0.55, hot, limb) * mottle;

    // --- the rays ---------------------------------------------------------
    // A whole number of them, so the wave closes on itself: at a fractional
    // count the crests do not meet where the angle wraps round and a seam
    // runs out of the sun. Read from a circle rather than from the angle for
    // the same reason — cos and sin of it join up, the angle itself does not.
    float spokes = floor(max(rays, 1.0) + 0.5);
    float a = angle + time * spin * 0.08;
    float wander = fbm(vec2(cos(a), sin(a)) * 2.0 + time * 0.12);
    float crest = 0.5 + 0.5 * sin(a * spokes + wander * 5.0);
    crest = pow(crest, 3.5);
    // Each ray reaches its own distance, so they are not a fringe of equals.
    float reach = max(safeRadius * rayLength * (0.45 + 0.9 * wander), 0.0001);
    float ray = crest * exp(-max(r - safeRadius, 0.0) / reach);
    // Nothing inside the disc: a ray is light leaving it, not crossing it.
    ray *= smoothstep(safeRadius * 0.55, safeRadius, r);

    // --- the air around it ------------------------------------------------
    // A halo whatever the rays are doing, so the disc sits in light rather
    // than being cut out of the dark.
    float halo = exp(-max(r - safeRadius, 0.0) / (safeRadius * 0.55)) * 0.55;
    // The chromosphere: a thin brighter line just off the rim, uneven.
    float offRim = (r - safeRadius * 1.015) / (safeRadius * 0.055);
    float rim = exp(-offRim * offRim) * (0.5 + 0.5 * wander);

    // Kept close to 1 on purpose. The bloom in EffectCanvas lights up
    // anything past 0.5 and spreads it, so a disc drawn at 1.7 came back pure
    // white with a warm wash over the whole screen — the wings' mistake. The
    // glow is the bloom's job; this only has to be bright enough to trigger
    // it. Brightness goes to 2 for anyone who does want it blazing.
    vec3 colour = body * disc + rayColor * (ray * 0.95 + halo * 0.45 + rim * 0.7);
    float field = clamp(disc + ray * 0.9 + halo * 0.9 + rim, 0.0, 1.0);

    // Additive: the fade belongs in alpha alone. In the colour as well it
    // would ramp as its square and stop reading as one fade.
    gl_FragColor = vec4(colour, field * intensity);
  }
`;

interface VFXSunProps extends SunParams {
  active?: boolean;
}

const VFXSun: React.FC<VFXSunProps> = ({
  color = '#ffd166',
  rayColor = '#ff9d4d',
  radius = 0.17,
  rays = 14,
  rayLength = 1.6,
  spin = 1,
  surface = 1,
  intensity = 1,
  center = [0.5, 0.5],
  fadeInDuration = 1,
  duration = 3,
  fadeDuration = 2,
  active = true,
}) => {
  // Pulled apart so the memo depends on the numbers rather than on the array,
  // which a caller writing `center: [0.5, 0.8]` inline rebuilds every render.
  const [centerX, centerY] = center;

  const meshRef = useRef<THREE.Mesh>(null);
  const strength = useRef({ value: 0 });

  const uniforms = useMemo(
    () => ({
      time: { value: 0 },
      intensity: { value: 0 },
      aspect: { value: 1 },
      radius: { value: radius },
      rays: { value: rays },
      rayLength: { value: rayLength },
      spin: { value: spin },
      surface: { value: surface },
      discColor: { value: new THREE.Color(color) },
      rayColor: { value: new THREE.Color(rayColor) },
      center: { value: new THREE.Vector2(centerX, centerY) },
    }),
    [color, rayColor, radius, rays, rayLength, spin, surface, centerX, centerY],
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

  // Local elapsed time, so each run starts from the same place rather than
  // from wherever the canvas clock happens to be.
  const elapsed = useRef(0);

  useFrame((state, delta) => {
    if (!meshRef.current) return;
    if (timeline.current && !started.current) {
      started.current = true;
      timeline.current.play();
    }
    elapsed.current += delta;
    const material = meshRef.current.material as THREE.ShaderMaterial;
    material.uniforms.time.value = elapsed.current;
    material.uniforms.intensity.value = strength.current.value;
    // Read every frame rather than from a resize effect: the canvas owns this
    // size, and without it the sun is an ellipse on any non-square viewport.
    const { width, height } = state.size;
    material.uniforms.aspect.value = height > 0 ? width / height : 1;
  });

  return (
    <mesh ref={meshRef} position={[0, 0, 0]}>
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
        blending={THREE.AdditiveBlending}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
};

export default VFXSun;
