import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { CandlesParams } from '../types';
import { useFadeClock } from './fadeClock';
import { seededRandom } from './scatter';

/**
 * Candles that catch, burn and go on burning: a wax body, a flame that grows
 * from the wick, and the light it throws around itself.
 *
 * The flame is a shape rather than a fire simulation — a teardrop whose width
 * falls away towards the tip, leaning and breathing on its own clock, with a
 * white core, an orange body and a blue foot where it meets the wick. The old
 * full-screen flame effect was retired for looking like noise; a candle is a
 * small, known shape, which is why this one can be drawn rather than
 * simulated.
 */

const flameVertex = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const flameFragment = `
  varying vec2 vUv;
  uniform float time;
  uniform float lit;
  uniform float opacity;
  uniform vec3 color;

  float hash(float n) {
    return fract(sin(n * 78.233) * 43758.5453);
  }

  /** Smooth noise over time, for the breathing and the lean. */
  float wobble(float t) {
    float i = floor(t);
    float f = fract(t);
    return mix(hash(i), hash(i + 1.0), f * f * (3.0 - 2.0 * f)) - 0.5;
  }

  void main() {
    // Grows from the wick as it catches.
    float height = lit;
    if (height <= 0.001) discard;

    float y = vUv.y / max(height, 0.001);
    if (y > 1.0) discard;

    // Leans with the air, more at the tip than at the foot.
    float lean = wobble(time * 2.3) * 0.16 * y * y;
    float x = vUv.x - 0.5 - lean;

    // The teardrop: widest a third of the way up, pinched to a point.
    float breathe = 1.0 + wobble(time * 3.1) * 0.12;
    float halfWidth = 0.3 * breathe * pow(max(1.0 - y, 0.0), 0.62) * smoothstep(0.0, 0.22, y + 0.06);
    float edge = smoothstep(halfWidth, halfWidth * 0.45, abs(x));
    if (edge <= 0.004) discard;

    // Core, body and the blue foot.
    float core = smoothstep(halfWidth * 0.5, 0.0, abs(x)) * smoothstep(0.85, 0.3, y);
    vec3 flame = mix(color, vec3(1.0, 0.92, 0.7), core * 0.85);
    flame = mix(flame, vec3(0.45, 0.65, 1.0), smoothstep(0.22, 0.0, y) * 0.75);
    flame += vec3(1.0, 0.95, 0.85) * core * 0.6;

    float a = edge * opacity * clamp(height * 2.0, 0.0, 1.0);
    gl_FragColor = vec4(flame * a, a);
  }
`;

const glowVertex = flameVertex;

const glowFragment = `
  varying vec2 vUv;
  uniform float opacity;
  uniform vec3 color;

  void main() {
    float d = length(vUv - vec2(0.5));
    float a = smoothstep(0.5, 0.0, d) * opacity;
    if (a <= 0.004) discard;
    gl_FragColor = vec4(color * a, a);
  }
`;

/** The wax, drawn once: a cylinder with a soft top and a drip or two. */
function candleTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 320;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const wax = ctx.createLinearGradient(28, 0, 100, 0);
    wax.addColorStop(0, '#f6efdd');
    wax.addColorStop(0.35, '#e3d7bb');
    wax.addColorStop(0.75, '#b9a983');
    wax.addColorStop(1, '#7d7052');
    ctx.fillStyle = wax;
    ctx.beginPath();
    ctx.moveTo(34, 40);
    ctx.lineTo(94, 40);
    ctx.lineTo(98, 310);
    ctx.lineTo(30, 310);
    ctx.closePath();
    ctx.fill();

    // The melted top, lit from above.
    ctx.fillStyle = '#fdf8ea';
    ctx.beginPath();
    ctx.ellipse(64, 40, 30, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(190, 170, 130, 0.65)';
    ctx.beginPath();
    ctx.ellipse(64, 42, 20, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // A drip down one side.
    ctx.fillStyle = 'rgba(253, 248, 234, 0.9)';
    ctx.beginPath();
    ctx.moveTo(88, 44);
    ctx.quadraticCurveTo(100, 90, 90, 130);
    ctx.quadraticCurveTo(84, 96, 80, 46);
    ctx.closePath();
    ctx.fill();

    // The wick.
    ctx.strokeStyle = '#2a2017';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(64, 42);
    ctx.lineTo(62, 18);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  // Drawn in screen colours, and said to be: the unlit layer converts nothing.
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

let waxTexture: THREE.CanvasTexture | null = null;
function wax(): THREE.CanvasTexture {
  waxTexture ??= candleTexture();
  return waxTexture;
}

/** The wax picture is this much taller than it is wide. */
const WAX_ASPECT = 128 / 320;

function setPose(mesh: THREE.Mesh, x: number, y: number, width: number, height: number): void {
  mesh.position.set(x, y, 0);
  mesh.scale.set(width, height, 1);
}

function setUniform(mesh: THREE.Mesh, name: string, value: number): void {
  (mesh.material as THREE.ShaderMaterial).uniforms[name].value = value;
}

function setOpacity(mesh: THREE.Mesh, value: number): void {
  (mesh.material as THREE.MeshBasicMaterial).opacity = value;
}

interface VFXCandlesProps extends CandlesParams {
  active?: boolean;
  /** Varies when each catches, and how each flame leans. See VFXSparkles. */
  seed?: number;
}

const VFXCandles: React.FC<VFXCandlesProps> = ({
  count = 1,
  center = [0.5, 0.3],
  size = 0.22,
  spread = 0.3,
  color = '#ffb03a',
  intensity = 1,
  fadeInDuration = 1,
  duration = 3,
  fadeDuration = 2,
  active = true,
  seed = 1,
}) => {
  const clock = useFadeClock(active, fadeInDuration, duration, fadeDuration);
  const frame = useThree((state) => state.size);
  const [centerX, centerY] = center;

  const candles = useMemo(() => {
    const random = seededRandom(seed * 3571 + 13);
    const many = Math.max(1, Math.round(count));
    return Array.from({ length: many }, (_, i) => ({
      place: many === 1 ? 0 : ((i / (many - 1)) - 0.5) * spread,
      // Each catches a moment after the one before it.
      catches: 0.25 + i * 0.35 + random() * 0.2,
      height: 0.88 + random() * 0.24,
      phase: random() * 40,
    }));
  }, [count, spread, seed]);

  const parts = useMemo(() => {
    const group = new THREE.Group();
    const quad = new THREE.PlaneGeometry(1, 1);
    const pieces = candles.map(() => {
      const body = new THREE.Mesh(
        quad,
        new THREE.MeshBasicMaterial({
          map: wax(),
          transparent: true,
          opacity: 0,
          depthTest: false,
          depthWrite: false,
          // The canvas turns tone mapping on, which would dull the wax.
          toneMapped: false,
        }),
      );
      body.renderOrder = 4;
      body.frustumCulled = false;

      const flame = new THREE.Mesh(
        quad,
        new THREE.ShaderMaterial({
          vertexShader: flameVertex,
          fragmentShader: flameFragment,
          uniforms: {
            time: { value: 0 },
            lit: { value: 0 },
            opacity: { value: 0 },
            color: { value: new THREE.Color(color) },
          },
          transparent: true,
          depthTest: false,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      flame.renderOrder = 6;
      flame.frustumCulled = false;

      const glow = new THREE.Mesh(
        quad,
        new THREE.ShaderMaterial({
          vertexShader: glowVertex,
          fragmentShader: glowFragment,
          uniforms: {
            opacity: { value: 0 },
            color: { value: new THREE.Color(color) },
          },
          transparent: true,
          depthTest: false,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      // Under the flame and the wax, so it reads as light around them.
      glow.renderOrder = 3;
      glow.frustumCulled = false;

      group.add(glow, body, flame);
      return { body, flame, glow };
    });
    return { group, pieces, quad };
  }, [candles, color]);

  const live = useRef<typeof parts | null>(null);
  useEffect(() => {
    live.current = parts;
    return () => {
      live.current = null;
    };
  }, [parts]);

  useEffect(
    () => () => {
      parts.quad.dispose();
      for (const piece of parts.pieces) {
        (piece.body.material as THREE.Material).dispose();
        (piece.flame.material as THREE.Material).dispose();
        (piece.glow.material as THREE.Material).dispose();
      }
    },
    [parts],
  );

  useFrame((state, delta) => {
    const current = live.current;
    if (!current) return;
    clock.tick(delta);
    const t = clock.elapsed.current;
    const fade = Math.min(1, clock.strength.current.value * 1.6) * intensity;
    const unit = state.viewport.width / state.size.width;
    // Measured against less of the height on a wide screen, as the hands
    // are: sized for a phone, a candle on a laptop stood up into the results.
    const height = size * Math.min(frame.width, frame.height * 0.62) * unit;
    const originX = (centerX - 0.5) * state.viewport.width;
    const originY = (centerY - 0.5) * state.viewport.height;

    current.pieces.forEach((piece, i) => {
      const candle = candles[i];
      const tall = height * candle.height;
      const wide = tall * WAX_ASPECT;
      const x = originX + candle.place * state.viewport.width;
      setPose(piece.body, x, originY, wide, tall);
      setOpacity(piece.body, fade);

      // Catches over about a third of a second, then burns.
      const lit = Math.min(1, Math.max(0, (t - candle.catches) / 0.35));
      const flameHeight = tall * 0.42;
      // The wick sits a little above the wax, in the picture's top eighth.
      setPose(piece.flame, x - wide * 0.02, originY + tall * 0.46 + flameHeight * 0.4, wide * 1.5, flameHeight);
      setUniform(piece.flame, 'time', t + candle.phase);
      setUniform(piece.flame, 'lit', lit);
      setUniform(piece.flame, 'opacity', fade);

      const breath = 0.88 + 0.12 * Math.sin(t * 7.3 + candle.phase);
      setPose(piece.glow, x, originY + tall * 0.5, tall * 2.1 * breath, tall * 2.1 * breath);
      setUniform(piece.glow, 'opacity', fade * lit * 0.5 * breath);
    });
  });

  return <primitive object={parts.group} />;
};

export default VFXCandles;
