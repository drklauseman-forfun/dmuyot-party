import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import gsap from 'gsap';
import type { WingsParams } from '../types';

/**
 * A pair of wings: layered feathers drawn in light, or dark leathery
 * membranes stretched between bones, with a glowing edge.
 *
 * One wing is drawn and mirrored. They unfold as the effect fades in, beat
 * slowly while it holds, and fold away as it fades out. The fold is driven by
 * the same value as the fade, so the two can never fall out of step.
 *
 * Feathers add light. The leathery style paints over the frame instead,
 * because a dark membrane added to the frame would be invisible — the same
 * choice VFXBlackHole makes for its core.
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
  uniform float size;
  uniform float flap;
  uniform vec2 center;
  uniform vec3 color;
  uniform float leathery;

  const float PI = 3.14159265359;

  vec2 rotate(vec2 p, float a) {
    float c = cos(a);
    float s = sin(a);
    return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  }

  /** Distance from p to the segment ab, and how far along it the foot fell. */
  vec2 segment(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return vec2(length(pa - ba * h), h);
  }

  float cross2(vec2 a, vec2 b) {
    return a.x * b.y - a.y * b.x;
  }

  float hash(float n) {
    return fract(sin(n * 91.3458) * 47453.5453);
  }

  /** A point along the arm: shoulder to wrist, then on out to the tip. */
  vec2 armPoint(float t) {
    vec2 wrist = vec2(0.46, 0.12);
    vec2 tip = vec2(1.0, 0.04);
    return t < 0.45 ? mix(vec2(0.0), wrist, t / 0.45) : mix(wrist, tip, (t - 0.45) / 0.55);
  }

  /** Light from layered feathers. The arm runs along +x in these units. */
  float feathers(vec2 w) {
    float light = 0.0;

    // Flight feathers, hanging straight down at the shoulder and sweeping
    // round to trail out behind the tip.
    for (int i = 0; i < 16; i++) {
      float t = (float(i) + 0.5) / 16.0;
      vec2 root = armPoint(t);
      float angle = mix(-1.5, -0.2, pow(t, 1.2));
      float len = mix(0.32, 0.68, smoothstep(0.0, 0.75, t)) * (1.0 - 0.3 * smoothstep(0.85, 1.0, t));
      vec2 s = segment(w, root, root + vec2(cos(angle), sin(angle)) * len);
      float width = mix(0.05, 0.014, s.y) * (0.85 + 0.3 * hash(float(i)));
      float vane = smoothstep(width, width * 0.3, s.x);
      float edge = smoothstep(width * 1.25, width, s.x) - vane;
      float shaft = smoothstep(0.007, 0.0, s.x);
      light += vane * 0.42 + edge * 0.5 + shaft * 0.35;
    }

    // A shorter row over their roots, so the base of the wing reads as layered.
    for (int j = 0; j < 10; j++) {
      float t = (float(j) + 0.5) / 10.0 * 0.85;
      vec2 root = armPoint(t) - vec2(0.0, 0.02);
      float angle = mix(-1.4, -0.45, t);
      vec2 s = segment(w, root, root + vec2(cos(angle), sin(angle)) * (0.16 + 0.12 * t));
      float width = mix(0.045, 0.02, s.y);
      light += smoothstep(width, width * 0.3, s.x) * 0.3;
    }

    float arm = min(segment(w, vec2(0.0), vec2(0.46, 0.12)).x, segment(w, vec2(0.46, 0.12), vec2(1.0, 0.04)).x);
    light += smoothstep(0.035, 0.0, arm) * 0.9;
    light += exp(-arm / 0.22) * 0.12;
    return light;
  }

  /**
   * One panel of membrane: triangle abc, with its free edge bc sagging in
   * towards a by depth. Returns how far inside the fixed edges the point is,
   * and how far inside the sagging edge.
   */
  vec2 panel(vec2 p, vec2 a, vec2 b, vec2 c, float depth) {
    float turn = sign(cross2(b - a, c - a));
    float side0 = cross2(b - a, p - a) * turn / length(b - a);
    float side2 = cross2(a - c, p - c) * turn / length(a - c);
    vec2 bc = c - b;
    float along = clamp(dot(p - b, bc) / dot(bc, bc), 0.0, 1.0);
    float sag = depth * length(bc) * 4.0 * along * (1.0 - along);
    return vec2(min(side0, side2), cross2(bc, p - b) * turn / length(bc) - sag);
  }

  /** A dark membrane wing: colour, and how much it covers. */
  vec4 leather(vec2 w) {
    vec2 wrist = vec2(0.5, 0.24);
    vec2 body = vec2(0.02, -0.42);
    vec2 tips[4];
    tips[0] = vec2(1.02, 0.34);
    tips[1] = vec2(1.0, -0.1);
    tips[2] = vec2(0.8, -0.46);
    tips[3] = vec2(0.46, -0.62);

    float inside = 0.0;
    float rim = 0.0;
    for (int k = 0; k < 4; k++) {
      vec2 m = panel(w, wrist, tips[k], k < 3 ? tips[k + 1] : body, 0.16);
      inside = max(inside, step(0.0, m.x) * smoothstep(-0.004, 0.004, m.y));
      rim = max(rim, step(-0.01, m.x) * smoothstep(0.028, 0.0, abs(m.y)));
    }
    vec2 inner = panel(w, wrist, body, vec2(0.0), 0.0);
    inside = max(inside, step(0.0, inner.x) * step(0.0, inner.y));

    float bone = segment(w, vec2(0.0), wrist).x - 0.022;
    for (int k = 0; k < 4; k++) {
      vec2 s = segment(w, wrist, tips[k]);
      bone = min(bone, s.x - mix(0.014, 0.004, s.y));
    }
    float boneCore = smoothstep(0.004, -0.004, bone);
    float boneGlow = smoothstep(0.03, 0.0, max(bone, 0.0));

    // Skin dark enough to read as a silhouette, with a little light coming
    // through it along the bones.
    vec3 rgb = mix(vec3(0.015, 0.012, 0.018), color * 0.18, 0.5);
    rgb += color * 0.12 * smoothstep(0.08, 0.0, max(bone, 0.0));
    float alpha = inside * 0.92;
    rgb = mix(rgb, vec3(0.05, 0.04, 0.05), boneCore);
    alpha = max(alpha, boneCore);
    rgb = mix(rgb, color * 1.4, rim * 0.9);
    alpha = max(alpha, rim);
    rgb += color * boneGlow * 0.35 * (1.0 - inside * 0.5);
    alpha = max(alpha, boneGlow * 0.6);
    return vec4(rgb, alpha);
  }

  void main() {
    // Measured against the shorter side, as VFXBlackHole explains.
    vec2 p = (vUv - center) * vec2(aspect, 1.0) / min(aspect, 1.0);
    // One wing, mirrored, with a gap between the shoulders.
    vec2 q = vec2(abs(p.x), p.y) / max(size, 0.01) - vec2(0.12, 0.0);
    if (length(q) > 1.8) {
      gl_FragColor = vec4(0.0);
      return;
    }

    // Folded, a wing hangs straight down. It opens with the fade in, then beats.
    // Open, it sweeps well up: nearer level, on a tall phone, it read as a
    // band across the screen rather than as wings.
    float open = smoothstep(0.0, 1.0, strength);
    float lift = mix(-1.2, 0.62, open) + sin(time * flap * 2.0 * PI) * 0.18 * open;
    vec2 w = rotate(q, -lift);

    if (leathery > 0.5) {
      vec4 wing = leather(w);
      gl_FragColor = vec4(wing.rgb, wing.a * strength * intensity);
    } else {
      // Additive, so strength goes into alpha alone. See VFXClock.
      float glow = 1.0 - exp(-feathers(w) * 1.3);
      gl_FragColor = vec4(color * 1.5, glow * strength * intensity);
    }
  }
`;

interface VFXWingsProps extends WingsParams {
  active?: boolean;
}

const VFXWings: React.FC<VFXWingsProps> = ({
  style = 'feathered',
  color = '#ffe7a8',
  size = 0.5,
  flap = 0.5,
  center = [0.5, 0.55],
  intensity = 1,
  fadeInDuration = 1,
  duration = 3,
  fadeDuration = 2,
  active = true,
}) => {
  // Depended on as numbers rather than as the array, which a caller writing
  // it inline rebuilds on every render.
  const [centerX, centerY] = center;

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
      size: { value: size },
      flap: { value: flap },
      center: { value: new THREE.Vector2(centerX, centerY) },
      color: { value: new THREE.Color(color) },
      leathery: { value: style === 'leathery' ? 1 : 0 },
    }),
    [intensity, size, flap, centerX, centerY, color, style],
  );

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
    // renderOrder 1, like the black hole: after the edge glows, which are backdrops.
    <mesh ref={meshRef} position={[0, 0, 0]} renderOrder={1}>
      {/* Clip-space quad: the vertex shader writes gl_Position straight from position. */}
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        blending={style === 'leathery' ? THREE.NormalBlending : THREE.AdditiveBlending}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
};

export default VFXWings;
