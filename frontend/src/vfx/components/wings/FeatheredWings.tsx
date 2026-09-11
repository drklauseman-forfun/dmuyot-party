import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { BURST_DELAY, openAmount, wingbeat } from './motion';
import type { WingRigProps } from './motion';
import { FEATHER_COUNT, armPose, hash01, layoutFeathers } from './pose';
import { featherTexture } from './textures';

/**
 * Realistic feathered wings: one detailed feather, drawn once, placed about
 * sixty times per wing along a bird's arm — flight feathers behind, coverts
 * over them — each shaded a little differently. Opening and folding moves
 * the bones and fans the feathers, rather than turning a flat picture.
 *
 * Instanced, so both wings are a single draw, and loose feathers a second.
 * Painted over the frame: real feathers are solid, not light.
 */

/** Feathers thrown off as a burst opens, and drifting down from gentle wings. */
const LOOSE_BURST = 22;
const LOOSE_GENTLE = 5;

/** Space between the two shoulders, in wing units. */
const SHOULDER_GAP = 0.1;

const vertexShader = `
  attribute float shade;
  attribute float fade;
  varying vec2 vUv;
  varying float vShade;
  varying float vFade;
  void main() {
    vUv = uv;
    vShade = shade;
    vFade = fade;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform sampler2D map;
  uniform vec3 tint;
  uniform float opacity;
  varying vec2 vUv;
  varying float vShade;
  varying float vFade;
  void main() {
    vec4 feather = texture2D(map, vUv);
    float alpha = feather.a * opacity * vFade;
    if (alpha < 0.01) discard;
    // Darker towards the root, where the next row of feathers lies over it.
    float depth = mix(0.7, 1.0, smoothstep(0.0, 0.6, vUv.y));
    gl_FragColor = vec4(feather.rgb * tint * vShade * depth, alpha);
  }
`;

/** A quad with its base at the origin, pointing up, plus per-feather shade and fade. */
function featherGeometry(count: number): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.translate(0, 0.5, 0);
  geometry.setAttribute('shade', new THREE.InstancedBufferAttribute(new Float32Array(count).fill(1), 1));
  geometry.setAttribute('fade', new THREE.InstancedBufferAttribute(new Float32Array(count).fill(1), 1));
  return geometry;
}

function featherMaterial(color: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      map: { value: featherTexture() },
      tint: { value: new THREE.Color(color) },
      opacity: { value: 0 },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    // The left wing is the right one mirrored, which turns its quads over.
    side: THREE.DoubleSide,
  });
}

const FeatheredWings: React.FC<WingRigProps> = ({ color, size, flap, center, intensity, motion, clock, holdEnds }) => {
  const [centerX, centerY] = center;
  const wingsRef = useRef<THREE.InstancedMesh>(null);
  const looseRef = useRef<THREE.InstancedMesh>(null);
  const scratch = useRef({ matrix: new THREE.Matrix4(), scale: new THREE.Vector3() });

  const looseCount = motion === 'burst' ? LOOSE_BURST : LOOSE_GENTLE;
  const wingGeometry = useMemo(() => featherGeometry(FEATHER_COUNT * 2), []);
  const looseGeometry = useMemo(() => featherGeometry(looseCount), [looseCount]);
  const wingMaterial = useMemo(() => featherMaterial(color), [color]);
  const looseMaterial = useMemo(() => featherMaterial(color), [color]);
  // Where loose feathers come from: the spread wing's own feathers.
  const openLayout = useMemo(() => layoutFeathers(armPose(1, 0), 1, () => 0), []);

  useEffect(
    () => () => {
      wingGeometry.dispose();
      looseGeometry.dispose();
      wingMaterial.dispose();
      looseMaterial.dispose();
    },
    [wingGeometry, looseGeometry, wingMaterial, looseMaterial],
  );

  useFrame((state, delta) => {
    const wings = wingsRef.current;
    if (!wings) return;
    clock.tick(delta);
    const elapsed = clock.elapsed.current;
    const strength = clock.strength.current.value;

    const open = openAmount(motion, elapsed, strength, elapsed > holdEnds);
    const pose = armPose(open, wingbeat(motion, elapsed, flap, open));
    const stir = (motion === 'gentle' ? 0.03 : 0.018) * Math.min(Math.max(open, 0), 1);
    const feathers = layoutFeathers(pose, open, (i) => Math.sin(elapsed * 2.3 + i * 1.7) * stir);

    const { viewport } = state;
    const unit = size * Math.min(viewport.width, viewport.height);
    const originX = (centerX - 0.5) * viewport.width;
    const originY = (centerY - 0.5) * viewport.height;
    const { matrix, scale } = scratch.current;
    const opacity = Math.min(1, strength * 1.6) * intensity;

    // One wing, then its mirror image.
    const shade = wings.geometry.getAttribute('shade') as THREE.InstancedBufferAttribute;
    let n = 0;
    for (const side of [1, -1]) {
      for (const feather of feathers) {
        const angle = side > 0 ? feather.angle : Math.PI - feather.angle;
        const width = feather.length * 0.25 * (feather.width / 0.08);
        matrix.makeRotationZ(angle - Math.PI / 2);
        matrix.scale(scale.set(width * unit * side, feather.length * unit, 1));
        matrix.setPosition(originX + side * (SHOULDER_GAP + feather.x) * unit, originY + feather.y * unit, 0);
        wings.setMatrixAt(n, matrix);
        shade.setX(n, feather.shade);
        n++;
      }
    }
    wings.instanceMatrix.needsUpdate = true;
    shade.needsUpdate = true;
    (wings.material as THREE.ShaderMaterial).uniforms.opacity.value = opacity;

    const loose = looseRef.current;
    if (!loose) return;
    const fade = loose.geometry.getAttribute('fade') as THREE.InstancedBufferAttribute;
    const burst = motion === 'burst';
    for (let i = 0; i < looseCount; i++) {
      const r = (k: number) => hash01(i * 13 + k * 7 + 101);
      const side = i % 2 === 0 ? 1 : -1;
      const source = openLayout[Math.floor(r(1) * openLayout.length)];
      // A burst throws them all off as the wings snap open; gentle wings shed
      // one now and then over the hold.
      const spawn = burst ? BURST_DELAY + 0.05 + r(2) * 0.18 : 0.4 + r(2) * Math.max(holdEnds - 0.4, 0.5);
      const life = burst ? 1.4 + r(3) : 2.5 + r(3) * 1.5;
      const age = elapsed - spawn;
      const alive = age > 0 && age < life;
      const travel = (1 - Math.exp(-2.2 * Math.max(age, 0))) / 2.2;
      const startX = source.x + Math.cos(source.angle) * source.length * 0.5;
      const startY = source.y + Math.sin(source.angle) * source.length * 0.5;
      const x = burst
        ? startX + (0.5 + r(4) * 1.3) * travel
        : startX + Math.sin(Math.max(age, 0) * 1.7 + i) * 0.08;
      const y = burst
        ? startY + (0.2 + r(5) * 1.1) * travel - 0.45 * Math.max(age, 0) ** 2
        : startY - 0.2 * Math.max(age, 0);
      const spin = source.angle + (r(6) - 0.5) * 8 * travel + Math.sin(Math.max(age, 0) * 3 + i) * 0.3;
      const length = (0.14 + r(7) * 0.12) * unit;
      const angle = side > 0 ? spin : Math.PI - spin;

      matrix.makeRotationZ(angle - Math.PI / 2);
      matrix.scale(scale.set(length * 0.25 * side, length, 1));
      matrix.setPosition(originX + side * (SHOULDER_GAP + x) * unit, originY + y * unit, 0);
      loose.setMatrixAt(i, matrix);
      fade.setX(i, alive ? Math.pow(1 - age / life, 1.3) * Math.min(1, age * 8) : 0);
    }
    loose.instanceMatrix.needsUpdate = true;
    fade.needsUpdate = true;
    (loose.material as THREE.ShaderMaterial).uniforms.opacity.value = opacity;
  });

  return (
    <>
      {/* Culling would use a single quad's bounds and could drop the whole wing. */}
      <instancedMesh
        ref={wingsRef}
        args={[wingGeometry, wingMaterial, FEATHER_COUNT * 2]}
        frustumCulled={false}
        renderOrder={1}
      />
      <instancedMesh
        ref={looseRef}
        args={[looseGeometry, looseMaterial, looseCount]}
        frustumCulled={false}
        renderOrder={2}
      />
    </>
  );
};

export default FeatheredWings;
