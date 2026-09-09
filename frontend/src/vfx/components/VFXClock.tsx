import React, { useRef, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import gsap from 'gsap';
import type { ClockHand, ClockParams } from '../types';

/**
 * A clock face drawn in light: a rim, marks around it, and hands that jump
 * from one mark to the next.
 *
 * The hands step rather than sweep, which is the whole point — a smoothly
 * rotating line reads as a radar, and only the discrete jump reads as ticking.
 *
 * Additive, so it is light laid over the interface rather than something
 * painted on top of it: the winner's name stays readable through the hands.
 */

/** The shader declares fixed-length arrays, so the count has a ceiling. */
const MAX_HANDS = 4;

const DEFAULT_HAND_WIDTH = 0.03;

/** Module scope, so the default prop is the same array on every render. */
const DEFAULT_HANDS: ClockHand[] = [{ rate: 2, length: 0.74 }];

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
  uniform vec2 center;
  uniform vec3 color;
  uniform float marks;
  uniform float handRate[${MAX_HANDS}];
  uniform float handLength[${MAX_HANDS}];
  uniform float handWidth[${MAX_HANDS}];
  uniform float handCount;

  const float PI = 3.14159265359;

  /** Distance from p to the segment ab, and how far along it the foot fell. */
  vec2 segmentInfo(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return vec2(length(pa - ba * h), h);
  }

  void main() {
    // Measured against the shorter side, so the face is the same size relative
    // to a phone as to a desktop. See VFXBlackHole for what happens otherwise.
    vec2 p = (vUv - center) * vec2(aspect, 1.0) / min(aspect, 1.0);
    float r = length(p);

    // atan(x, y) rather than (y, x): 0 at twelve o'clock, growing clockwise,
    // which is the direction a clock actually runs.
    float a = atan(p.x, p.y);
    float slice = 2.0 * PI / marks;

    float glow = 0.0;

    // The rim.
    glow += smoothstep(radius * 0.035, 0.0, abs(r - radius)) * 0.9;

    // Marks, just inside the rim. The nearest whole slice is the mark.
    float toMark = abs(mod(a + slice * 0.5, slice) - slice * 0.5);
    float band = smoothstep(radius * 0.86, radius * 0.93, r)
               * (1.0 - smoothstep(radius * 0.95, radius * 0.99, r));
    glow += smoothstep(slice * 0.07, 0.0, toMark) * band * 0.85;

    // The hands, each tapering from the hub to a point at the tip.
    for (int i = 0; i < ${MAX_HANDS}; i++) {
      if (float(i) >= handCount) break;

      float rate = handRate[i];
      // Counted from the magnitude and signed afterwards: taking floor() of a
      // negative rate directly would step off twelve immediately instead of
      // holding there for the first beat like the forward direction does.
      float steps = floor(time * abs(rate));
      float ang = steps * slice * (rate < 0.0 ? -1.0 : 1.0);
      vec2 tip = vec2(sin(ang), cos(ang)) * radius * handLength[i];

      vec2 info = segmentInfo(p, vec2(0.0), tip);
      // Width falls away along the length, so it reads as a hand rather than a
      // bar. Floored just above zero: the tip still has to be drawable.
      float w = max(radius * handWidth[i] * (1.0 - 0.92 * info.y), radius * 0.0025);
      glow += smoothstep(w, 0.0, info.x);
    }

    // Hub, and a soft wash so the face sits in light rather than being a
    // wireframe floating on the interface.
    glow += smoothstep(radius * 0.06, 0.0, r);
    glow += smoothstep(radius * 1.6, 0.0, r) * 0.13;

    float g = clamp(glow, 0.0, 1.0);
    // Additive blending multiplies colour by alpha on its way into the frame,
    // so intensity belongs in one of them, not both. In both it ramps as the
    // square: nearly all of the brightness arrives in the first third of the
    // fade and the rest crawls, which reads as appearing rather than fading.
    gl_FragColor = vec4(color * g * 1.5, g * intensity);
  }
`;

interface VFXClockProps extends ClockParams {
  active?: boolean;
}

const VFXClock: React.FC<VFXClockProps> = ({
  color = '#7dffb0',
  radius = 0.28,
  center = [0.5, 0.5],
  marks = 12,
  hands = DEFAULT_HANDS,
  intensity = 1,
  fadeInDuration = 1,
  duration = 3,
  fadeDuration = 2,
  active = true,
}) => {
  // Depended on as numbers rather than as the array, which a caller writing
  // `center: [0.5, 0.4]` inline rebuilds on every render.
  const [centerX, centerY] = center;

  const meshRef = useRef<THREE.Mesh>(null);
  const strength = useRef({ value: 0 });
  const timeline = useRef<gsap.core.Timeline | null>(null);
  const started = useRef(false);

  const uniforms = useMemo(
    () => ({
      time: { value: 0 },
      intensity: { value: 0 },
      aspect: { value: 1 },
      radius: { value: radius },
      center: { value: new THREE.Vector2(centerX, centerY) },
      color: { value: new THREE.Color(color) },
      marks: { value: marks },
      // Filled per frame rather than here, so an inline `hands` array does not
      // rebuild the whole uniform block on every render.
      handRate: { value: new Array<number>(MAX_HANDS).fill(0) },
      handLength: { value: new Array<number>(MAX_HANDS).fill(0) },
      handWidth: { value: new Array<number>(MAX_HANDS).fill(0) },
      handCount: { value: 0 },
    }),
    [color, radius, centerX, centerY, marks],
  );

  // Built paused and started from the first frame the canvas actually draws.
  // Mounting stalls for as long as it takes to create the WebGL context and
  // compile the shaders, which happens on every effect — the canvas is torn
  // down between them. A timeline started on mount spends its fade-in during
  // that stall, so the first frame anyone sees is already at full brightness:
  // the effect appears instead of fading, while the fade-out, running seconds
  // later on a warm canvas, works perfectly.
  useEffect(() => {
    if (active) {
      const tl = gsap.timeline({ paused: true });
      // Gentle at both ends. 'power2.out' front-loads — it is the right curve
      // for something arriving with a snap, and the wrong one for a fade.
      tl.to(strength.current, { value: intensity, duration: fadeInDuration, ease: 'power1.inOut' });
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

  // Starts at zero, unlike the black hole: the hands should begin at twelve
  // and be seen to tick from there.
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

    const { width, height } = state.size;
    material.uniforms.aspect.value = height > 0 ? width / height : 1;

    for (let i = 0; i < MAX_HANDS; i++) {
      const hand = hands[i];
      material.uniforms.handRate.value[i] = hand ? hand.rate : 0;
      material.uniforms.handLength.value[i] = hand ? hand.length : 0;
      material.uniforms.handWidth.value[i] = hand ? hand.width ?? DEFAULT_HAND_WIDTH : 0;
    }
    material.uniforms.handCount.value = Math.min(hands.length, MAX_HANDS);
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

export default VFXClock;
