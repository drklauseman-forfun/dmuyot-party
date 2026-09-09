import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import gsap from 'gsap';
import type { FireworksParams } from '../types';

/**
 * Shells that rise, burst, and rain sparks.
 *
 * Points rather than a full-screen shader, unlike the black hole and the
 * clock. Those draw one shape, so a fragment shader is cheap; fireworks are
 * hundreds of moving specks, and asking every pixel for its distance to every
 * spark is the one arrangement a phone cannot afford. As points the GPU draws
 * each spark once.
 *
 * Every spark's whole life is a function of time in the vertex shader, so
 * nothing is stepped or stored between frames and a burst is never half
 * finished when the effect restarts.
 */

/** The shader carries a fixed palette, so the colour list has a ceiling. */
const MAX_COLORS = 4;

const DEFAULT_COLORS = ['#ffd76b', '#ff5f6d', '#6bc9ff', '#8dff6b'];

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

const vertexShader = `
  uniform float time;
  uniform float size;
  uniform float gravity;
  uniform float spread;
  uniform float interval;
  uniform float riseTime;
  uniform float life;
  uniform vec2 area;
  uniform float maxPixelSize;
  uniform vec3 palette[${MAX_COLORS}];
  uniform float paletteCount;

  attribute float burstIndex;
  attribute vec3 direction;
  attribute float isLead;
  attribute float sparkSeed;

  varying float vAlpha;
  varying vec3 vColor;
  varying float vSeed;

  float hash11(float p) {
    return fract(sin(p * 127.1) * 43758.5453);
  }

  /*
   * Selected with comparisons rather than palette[int(i)]. Indexing a uniform
   * array with a computed value is not portable in GLSL ES 1.00, and this
   * shader has to run on whatever phone opens the page.
   */
  vec3 pickColor(float idx) {
    vec3 c = palette[0];
    if (idx > 0.5 && idx < 1.5) c = palette[1];
    else if (idx > 1.5 && idx < 2.5) c = palette[2];
    else if (idx > 2.5) c = palette[3];
    return c;
  }

  void main() {
    float bi = burstIndex;

    // Where and when this shell goes up. Scaled by the visible area rather
    // than fixed world units, so the bursts spread across the whole frame on a
    // wide window and still fit on a narrow one.
    float burstAt = bi * interval;
    float launchAt = burstAt - riseTime;
    float bx = (hash11(bi * 1.7 + 0.3) - 0.5) * area.x * 0.76;
    float by = (hash11(bi * 3.1 + 5.2) * 0.55 + 0.06) * area.y * 0.5;
    vec3 origin = vec3(bx, by, 0.0);
    vec3 launchFrom = vec3(bx * 0.55, -area.y * 0.62, 0.0);

    float age = time - burstAt;
    vec3 pos;
    float alpha;
    float scale;

    if (time < launchAt) {
      // Not yet fired.
      pos = launchFrom;
      alpha = 0.0;
      scale = 0.0;
    } else if (age < 0.0) {
      // Rising. Every spark of the burst shares one point, so only the lead
      // one is drawn — the rest overlapping would be a hard bright dot.
      float k = clamp((time - launchAt) / riseTime, 0.0, 1.0);
      pos = mix(launchFrom, origin, k);
      // A slight arc, so it is thrown rather than driven up a rail.
      pos.y -= 0.16 * k * (1.0 - k) * area.y;
      alpha = isLead * (0.45 + 0.55 * k);
      scale = isLead * 0.75;
    } else {
      // Burst. Straight-line flight with gravity pulling it down, slowed as it
      // goes so the shell opens fast and then hangs.
      float drag = 1.0 - exp(-age * 1.7);
      pos = origin + direction * spread * drag;
      pos.y -= 0.5 * gravity * age * age;
      float t = clamp(age / life, 0.0, 1.0);
      alpha = 1.0 - t * t;
      scale = 1.0 - 0.55 * t;
    }

    vAlpha = alpha;
    vColor = pickColor(mod(bi, paletteCount));
    vSeed = sparkSeed;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = min(size * scale * (300.0 / -mvPosition.z), maxPixelSize);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = `
  uniform float opacity;
  uniform float time;

  varying float vAlpha;
  varying vec3 vColor;
  varying float vSeed;

  void main() {
    float d = distance(gl_PointCoord, vec2(0.5));
    if (d > 0.5) discard;
    // A hot centre falling away steeply, rather than a flat disc.
    float core = pow(smoothstep(0.5, 0.0, d), 1.8);
    // Sparks are embers, not lamps: each one flickers on its own clock.
    float twinkle = 0.72 + 0.28 * sin(time * 22.0 + vSeed * 43.0);
    gl_FragColor = vec4(vColor, core * vAlpha * twinkle * opacity);
  }
`;

interface VFXFireworksProps extends FireworksParams {
  active?: boolean;
  seed?: number;
}

const VFXFireworks: React.FC<VFXFireworksProps> = ({
  colors = DEFAULT_COLORS,
  bursts = 14,
  sparksPerBurst = 55,
  spread = 1.6,
  gravity = 1.5,
  size = 1.2,
  interval = 0.28,
  riseTime = 0.55,
  life = 1.7,
  maxPixelSize = 42,
  fadeInDuration = 1,
  duration = 3,
  fadeDuration = 2,
  active = true,
  seed = 1,
}) => {
  const pointsRef = useRef<THREE.Points>(null);
  const strength = useRef({ value: 0 });
  const timeline = useRef<gsap.core.Timeline | null>(null);
  const started = useRef(false);

  const total = bursts * sparksPerBurst;

  const [positions, burstIndices, directions, leads, seeds] = useMemo(() => {
    const random = seededRandom(seed);
    const pos = new Float32Array(total * 3);
    const burst = new Float32Array(total);
    const dir = new Float32Array(total * 3);
    const lead = new Float32Array(total);
    const spark = new Float32Array(total);

    for (let b = 0; b < bursts; b++) {
      for (let s = 0; s < sparksPerBurst; s++) {
        const i = b * sparksPerBurst + s;
        // Position is written entirely by the vertex shader; the attribute
        // only has to exist for the geometry to have a draw count.
        pos[i * 3] = 0;
        pos[i * 3 + 1] = 0;
        pos[i * 3 + 2] = 0;

        burst[i] = b;
        lead[i] = s === 0 ? 1 : 0;
        spark[i] = random() * 10;

        // An even scatter over the sphere. Taking z uniformly and the angle
        // uniformly is what keeps it even — picking two angles instead bunches
        // the sparks at the poles.
        const z = random() * 2 - 1;
        const angle = random() * Math.PI * 2;
        const r = Math.sqrt(Math.max(1 - z * z, 0));
        // Varied speeds, biased slow, so the shell has a dense heart and a few
        // outliers rather than a hollow ring.
        const speed = 0.35 + Math.pow(random(), 0.6) * 0.65;
        dir[i * 3] = Math.cos(angle) * r * speed;
        dir[i * 3 + 1] = Math.sin(angle) * r * speed;
        // Flattened, because the camera looks straight on and depth mostly
        // reads as sparks that are inexplicably large.
        dir[i * 3 + 2] = z * speed * 0.45;
      }
    }
    return [pos, burst, dir, lead, spark];
  }, [bursts, sparksPerBurst, total, seed]);

  const uniforms = useMemo(() => {
    const palette = Array.from({ length: MAX_COLORS }, (_, i) =>
      new THREE.Color(colors[i % colors.length] ?? DEFAULT_COLORS[i]),
    );
    return {
      time: { value: 0 },
      opacity: { value: 0 },
      size: { value: size },
      gravity: { value: gravity },
      spread: { value: spread },
      interval: { value: interval },
      riseTime: { value: riseTime },
      life: { value: life },
      area: { value: new THREE.Vector2(8, 5) },
      maxPixelSize: { value: maxPixelSize },
      palette: { value: palette },
      paletteCount: { value: Math.min(colors.length, MAX_COLORS) },
    };
  }, [colors, size, gravity, spread, interval, riseTime, life, maxPixelSize]);

  // Built paused and started on the first drawn frame. Mounting stalls while
  // the WebGL context is created and the shaders compile, and a timeline
  // started before that spends its fade-in during the stall. See VFXClock.
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

  // Local elapsed time, so the first shell goes up when the effect starts
  // rather than wherever the canvas clock happens to be.
  const elapsed = useRef(0);

  useFrame((state, delta) => {
    if (!pointsRef.current) return;
    if (timeline.current && !started.current) {
      started.current = true;
      timeline.current.play();
    }

    elapsed.current += delta;
    const material = pointsRef.current.material as THREE.ShaderMaterial;
    material.uniforms.time.value = elapsed.current;
    material.uniforms.opacity.value = strength.current.value;
    // The visible extent in world units at the plane the bursts sit on, so
    // they spread across the frame whatever shape it is.
    material.uniforms.area.value.set(state.viewport.width, state.viewport.height);
  });

  return (
    // Never culled: every position is computed in the vertex shader, so the
    // attribute is all zeros and the bounding sphere three.js derives from it
    // describes nothing. Left on, it is a coin toss whether the whole display
    // is thrown away.
    <points ref={pointsRef} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-burstIndex" args={[burstIndices, 1]} />
        <bufferAttribute attach="attributes-direction" args={[directions, 3]} />
        <bufferAttribute attach="attributes-isLead" args={[leads, 1]} />
        <bufferAttribute attach="attributes-sparkSeed" args={[seeds, 1]} />
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

export default VFXFireworks;
