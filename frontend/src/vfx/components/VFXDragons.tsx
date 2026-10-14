import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { DragonsParams } from '../types';
import { useFadeClock } from './fadeClock';
import {
  WESTERN_SHOULDER,
  WING_ASPECT,
  WING_PIVOT,
  dragonAspect,
  dragonTexture,
  dragonWing,
} from './dragons/textures';
import type { DragonKind } from './dragons/textures';

/**
 * Dragons: a Chinese one rippling across the screen, a western one flying
 * across on beating wings, or a head looking straight out.
 *
 * One kind per effect, as the clocks and the weapons are, so a sky with two
 * dragons in it is this effect twice over.
 *
 * Solid rather than light, like the hands and the weapons — they are drawn in
 * their own colours and the unlit layer shows exactly those. The cost is that
 * nothing here can glow, which is why the face's eyes are painted bright
 * instead of being left for the bloom to light.
 *
 * The Chinese one is the whale's trick: one straight picture on a strip that
 * a wave runs along. The bend is injected into a plain MeshBasicMaterial
 * rather than written as a shader of its own, so three.js goes on handling
 * the colour conversion — a hand-written shader samples an sRGB texture as
 * linear values and, in this layer, nothing converts them back. That is what
 * turned the eyes near black.
 */

/**
 * How far the wave carries the tail, as a fraction of the picture's height.
 * Larger than the whale's 0.16 because the serpent's strip is twice as long
 * for its height: measured against its length, this is about the same wave.
 */
const RIPPLE = 0.38;

function setPose(mesh: THREE.Object3D, x: number, y: number, turn: number, width: number, height: number): void {
  mesh.position.set(x, y, 0);
  mesh.rotation.z = turn;
  mesh.scale.set(width, height, 1);
}

function setOpacity(mesh: THREE.Mesh, value: number): void {
  (mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, value);
}

function setValue(target: { value: number }, value: number): void {
  target.value = value;
}

function solid(map: THREE.Texture, color: string, order: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    map,
    color: new THREE.Color(color),
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    // The canvas turns tone mapping on, which would dull the drawing.
    toneMapped: false,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: order,
  });
}

function plate(map: THREE.Texture, color: string, order: number, segments = 1): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, segments, 1), solid(map, color, order));
  mesh.renderOrder = order;
  mesh.frustumCulled = false;
  return mesh;
}

/**
 * The serpent, on a strip divided along its length so it can bend. The wave
 * is measured from the nose at uv.x = 1 and grows with the square of the
 * distance from it, so the head holds steady and the tail sweeps.
 */
function serpent(map: THREE.Texture, color: string): { mesh: THREE.Mesh; time: { value: number }; amp: { value: number } } {
  const time = { value: 0 };
  const amp = { value: RIPPLE };
  const material = solid(map, color, 2);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.time = time;
    shader.uniforms.amp = amp;
    shader.vertexShader = `uniform float time;\nuniform float amp;\n${shader.vertexShader}`.replace(
      '#include <project_vertex>',
      [
        'float fromHead = 1.0 - uv.x;',
        'transformed.y += amp * pow(fromHead, 2.0) * sin(time - fromHead * 3.4);',
        '#include <project_vertex>',
      ].join('\n'),
    );
  };
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 96, 1), material);
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  return { mesh, time, amp };
}

/** A wing, hinged at its shoulder rather than turning about its middle. */
function wing(color: string, order: number): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.translate(0, 0.5 - WING_PIVOT, 0);
  const mesh = new THREE.Mesh(geometry, solid(dragonWing(), color, order));
  mesh.renderOrder = order;
  mesh.frustumCulled = false;
  return mesh;
}

interface VFXDragonsProps extends DragonsParams {
  active?: boolean;
}

const VFXDragons: React.FC<VFXDragonsProps> = ({
  kind = 'chinese',
  direction = 'left',
  lane = 0.72,
  size = 0.7,
  speed = 1,
  color = '#ffffff',
  intensity = 1,
  fadeInDuration = 1,
  duration = 3,
  fadeDuration = 2,
  active = true,
}) => {
  const clock = useFadeClock(active, fadeInDuration, duration, fadeDuration);
  const frame = useThree((state) => state.size);

  const parts = useMemo(() => {
    const group = new THREE.Group();
    const map = dragonTexture(kind as DragonKind);
    if (kind === 'chinese') {
      const built = serpent(map, color);
      group.add(built.mesh);
      return { group, body: built.mesh, ripple: built, wings: null as null | { near: THREE.Mesh; far: THREE.Mesh } };
    }
    if (kind === 'western') {
      // The far wing is drawn first and darker, so it reads as the one on the
      // other side of the body rather than a copy laid on top.
      const far = wing('#6d6d6d', 1);
      const body = plate(map, color, 2);
      const near = wing(color, 3);
      group.add(far, body, near);
      return { group, body, ripple: null, wings: { near, far } };
    }
    const body = plate(map, color, 2);
    group.add(body);
    return { group, body, ripple: null, wings: null };
  }, [kind, color]);

  const live = useRef<typeof parts | null>(null);
  useEffect(() => {
    live.current = parts;
    return () => {
      live.current = null;
    };
  }, [parts]);

  useEffect(
    () => () => {
      for (const mesh of [parts.body, parts.wings?.near, parts.wings?.far]) {
        if (!mesh) continue;
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
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
    // Measured against less of the height on a wide screen, as the wings and
    // the whale are: a dragon sized for a phone fills a laptop's whole band
    // above the results.
    const long = size * Math.min(frame.width, frame.height * 0.62) * unit;
    const tall = long / dragonAspect(kind as DragonKind);
    const halfWidth = state.viewport.width / 2;
    const facing = direction === 'right' ? 1 : -1;
    const y = (lane - 0.5) * state.viewport.height;

    if (kind === 'face') {
      // It does not travel. It breathes, and turns its head a little, so it
      // is alive without ever leaving the one spot.
      const breath = 1 + Math.sin(t * 1.6 * speed) * 0.022;
      const sway = Math.sin(t * 0.7 * speed) * 0.035;
      setPose(current.body, 0, y + Math.sin(t * 1.6 * speed) * tall * 0.012, sway, long * breath, tall * breath);
      setOpacity(current.body, fade);
      return;
    }

    // One pass across the screen over the effect's whole life, in from beyond
    // one edge and out past the other.
    const life = Math.max(fadeInDuration + duration + fadeDuration, 0.5);
    const progress = Math.min(1, (t * speed) / life);
    const x = -facing * (1 - 2 * progress) * (halfWidth + long * 0.6);
    const rise = Math.sin(t * 0.8 * speed) * tall * 0.12;

    if (current.ripple) {
      // It pitches with its own rise and fall, the way the whale does.
      const pitch = Math.cos(t * 0.8 * speed) * 0.05 * -facing;
      setPose(current.body, x, y + rise, pitch, long * facing, tall);
      setValue(current.ripple.time, t * 2.4 * speed);
      setOpacity(current.body, fade);
      return;
    }

    const beat = Math.sin(t * 3.4 * speed);
    setPose(current.body, x, y + rise, beat * 0.04 * -facing, long * facing, tall);
    setOpacity(current.body, fade);

    if (current.wings) {
      // The wings hang off the shoulder in the body's picture, so they stay
      // attached whatever size the body is drawn at.
      const shoulderX = x + (WESTERN_SHOULDER.x - 0.5) * long * facing;
      const shoulderY = y + rise + (WESTERN_SHOULDER.y - 0.5) * tall;
      const span = long * 0.56;
      const height = span / WING_ASPECT;
      // Swept back rather than straight up: stood upright on the middle of
      // the back, one wing read as a sail, or a shell.
      const near = beat * 0.5 - 0.36;
      const far = Math.sin(t * 3.4 * speed - 0.5) * 0.42 - 0.22;
      // The far wing is set a little further down the body and beats on its
      // own angle. Hung at the same shoulder it sat exactly behind the near
      // one, and the pair read as a single wing.
      const behind = shoulderX - facing * long * 0.07;
      setPose(current.wings.near, shoulderX, shoulderY, -facing * near, span * facing, height);
      setPose(current.wings.far, behind, shoulderY - tall * 0.04, -facing * far, span * facing * 0.86, height * 0.86);
      setOpacity(current.wings.near, fade);
      setOpacity(current.wings.far, fade * 0.85);
    }
  });

  return <primitive object={parts.group} />;
};

export default VFXDragons;
