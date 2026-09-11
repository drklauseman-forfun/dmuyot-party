import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { openAmount, wingbeat } from './motion';
import type { WingRigProps } from './motion';
import { armPose, fingers, joints, membraneOutline } from './pose';
import type { ArmPose, Vec2 } from './pose';
import { boneTexture, membraneTexture } from './textures';

/**
 * Realistic leathery wings: skin stretched between an arm and four long
 * fingers, sagging between the fingertips, with the bones showing through.
 *
 * The skin is a mesh whose corners are moved to the bones every frame, so
 * folding really does gather it in rather than shrinking a picture. The bones
 * are instanced quads laid over it. Painted over the frame: skin is solid.
 */

/** Space between the two shoulders, in wing units. */
const SHOULDER_GAP = 0.1;

/** Upper arm, forearm, and four fingers. */
const BONES_PER_WING = 6;

function tipsOf(pose: ArmPose, open: number): Vec2[] {
  const { wrist } = joints(pose);
  return fingers(pose, open).map((finger) => ({
    x: wrist.x + Math.cos(finger.angle) * finger.length,
    y: wrist.y + Math.sin(finger.angle) * finger.length,
  }));
}

/** How far the free edges sag towards the wrist: taut when spread, slack as it folds. */
function sagFor(open: number): number {
  return 0.3 - 0.12 * Math.min(Math.max(open, 0), 1);
}

const membraneVertex = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const membraneFragment = `
  uniform sampler2D map;
  uniform vec3 tint;
  uniform float opacity;
  varying vec2 vUv;
  void main() {
    vec4 skin = texture2D(map, vUv);
    gl_FragColor = vec4(skin.rgb * tint, 0.96 * opacity);
  }
`;

const boneVertex = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;

const boneFragment = `
  uniform sampler2D map;
  uniform vec3 tint;
  uniform float opacity;
  varying vec2 vUv;
  void main() {
    vec4 bone = texture2D(map, vUv);
    float alpha = bone.a * opacity;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(bone.rgb * tint, alpha);
  }
`;

function material(vertexShader: string, fragmentShader: string, map: THREE.Texture, color: string) {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: { map: { value: map }, tint: { value: new THREE.Color(color) }, opacity: { value: 0 } },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    // The left wing is the right one mirrored, which turns its triangles over.
    side: THREE.DoubleSide,
  });
}

const LeatheryWings: React.FC<WingRigProps> = ({ color, size, flap, center, intensity, motion, clock, holdEnds }) => {
  const [centerX, centerY] = center;
  const membraneRef = useRef<THREE.Mesh>(null);
  const bonesRef = useRef<THREE.InstancedMesh>(null);
  const scratch = useRef({ matrix: new THREE.Matrix4(), scale: new THREE.Vector3() });

  // The skin picture is stretched over the spread wing once. Folding then
  // moves the corners, and the picture gathers with them.
  const membraneGeometry = useMemo(() => {
    const spread = armPose(1, 0);
    const { points } = membraneOutline(joints(spread), tipsOf(spread, 1), sagFor(1));
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const spanX = Math.max(...xs) - minX;
    const spanY = Math.max(...ys) - minY;
    const uvs = points.flatMap((p) => [(p.x - minX) / spanX, (p.y - minY) / spanY]);
    const count = points.length;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 2 * 3), 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([...uvs, ...uvs]), 2));
    const indices: number[] = [];
    for (const offset of [0, count]) {
      const wrist = offset + 2;
      const body = offset + count - 1;
      // Between the arm and the body, then a fan from the wrist round every fingertip.
      indices.push(offset, offset + 1, wrist, offset, wrist, body);
      for (let k = 3; k < count - 1; k++) indices.push(wrist, offset + k, offset + k + 1);
    }
    geometry.setIndex(indices);
    return geometry;
  }, []);

  const boneGeometry = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.translate(0, 0.5, 0);
    return geometry;
  }, []);
  const membraneMaterial = useMemo(() => material(membraneVertex, membraneFragment, membraneTexture(), color), [color]);
  const boneMaterial = useMemo(() => material(boneVertex, boneFragment, boneTexture(), color), [color]);

  useEffect(
    () => () => {
      membraneGeometry.dispose();
      boneGeometry.dispose();
      membraneMaterial.dispose();
      boneMaterial.dispose();
    },
    [membraneGeometry, boneGeometry, membraneMaterial, boneMaterial],
  );

  useFrame((state, delta) => {
    const membrane = membraneRef.current;
    const bones = bonesRef.current;
    if (!membrane || !bones) return;
    clock.tick(delta);
    const elapsed = clock.elapsed.current;
    const strength = clock.strength.current.value;

    const open = openAmount(motion, elapsed, strength, elapsed > holdEnds);
    const pose = armPose(open, wingbeat(motion, elapsed, flap, open));
    const j = joints(pose);
    const tips = tipsOf(pose, open);
    const { points } = membraneOutline(j, tips, sagFor(open));

    const { viewport } = state;
    const unit = size * Math.min(viewport.width, viewport.height);
    const originX = (centerX - 0.5) * viewport.width;
    const originY = (centerY - 0.5) * viewport.height;

    const position = membrane.geometry.getAttribute('position') as THREE.BufferAttribute;
    const count = points.length;
    points.forEach((p, k) => {
      position.setXYZ(k, originX + (SHOULDER_GAP + p.x) * unit, originY + p.y * unit, 0);
      position.setXYZ(k + count, originX - (SHOULDER_GAP + p.x) * unit, originY + p.y * unit, 0);
    });
    position.needsUpdate = true;

    const segments = [
      { from: j.shoulder, to: j.elbow, width: 0.05 },
      { from: j.elbow, to: j.wrist, width: 0.04 },
      ...tips.map((tip, i) => ({ from: j.wrist, to: tip, width: 0.024 - i * 0.003 })),
    ];
    const { matrix, scale } = scratch.current;
    let n = 0;
    for (const side of [1, -1]) {
      for (const bone of segments) {
        const dx = bone.to.x - bone.from.x;
        const dy = bone.to.y - bone.from.y;
        matrix.makeRotationZ(Math.atan2(dy, side * dx) - Math.PI / 2);
        matrix.scale(scale.set(bone.width * unit, Math.hypot(dx, dy) * unit, 1));
        matrix.setPosition(originX + side * (SHOULDER_GAP + bone.from.x) * unit, originY + bone.from.y * unit, 0);
        bones.setMatrixAt(n++, matrix);
      }
    }
    bones.instanceMatrix.needsUpdate = true;

    const opacity = Math.min(1, strength * 1.6) * intensity;
    (membrane.material as THREE.ShaderMaterial).uniforms.opacity.value = opacity;
    (bones.material as THREE.ShaderMaterial).uniforms.opacity.value = opacity;
  });

  return (
    <>
      {/* Never culled: the bounds three.js would use are not where the wing is drawn. */}
      <mesh ref={membraneRef} geometry={membraneGeometry} material={membraneMaterial} frustumCulled={false} renderOrder={1} />
      <instancedMesh
        ref={bonesRef}
        args={[boneGeometry, boneMaterial, BONES_PER_WING * 2]}
        frustumCulled={false}
        renderOrder={2}
      />
    </>
  );
};

export default LeatheryWings;
