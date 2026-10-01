import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { CreaturesParams } from '../types';
import { useFadeClock } from './fadeClock';
import { seededRandom } from './scatter';
import { CRITTER_ASPECT, FLUKE_ASPECT, WHALE_ASPECT, critter, whaleBody, whaleFluke } from './creatures/textures';

/**
 * Creatures made of light: a whale drifting across the screen with its tail
 * beating, or a crowd of small things scurrying along an edge.
 *
 * Added to the frame rather than painted over it, so they read as apparitions
 * — which also means they go through the bloom and glow at their edges. The
 * whale's tail is a second picture, hinged where it meets the body, because a
 * whale that slides across without moving reads as a sticker.
 */

function setPose(mesh: THREE.Mesh, x: number, y: number, turn: number, width: number, height: number): void {
  mesh.position.set(x, y, 0);
  mesh.rotation.z = turn;
  mesh.scale.set(width, height, 1);
}

function setOpacity(mesh: THREE.Mesh, value: number): void {
  (mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, value);
}

/**
 * Where the tail hinges, as a fraction of each picture: the body's narrow end,
 * and the stalk of the fluke. Measured off the drawings in creatures/textures.
 */
const PEDUNCLE = { x: 40 / 512 - 0.5, y: 0.5 - 134 / 256 };
const FLUKE_HINGE = 176 / 192 - 0.5;

function glowing(map: THREE.Texture, color: string, order: number, pivotX = 0): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(1, 1);
  // Turned about its hinge rather than its middle, as the clock hands are.
  if (pivotX !== 0) geometry.translate(-pivotX, 0, 0);
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      map,
      color: new THREE.Color(color),
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  mesh.renderOrder = order;
  mesh.frustumCulled = false;
  return mesh;
}

interface VFXCreaturesProps extends CreaturesParams {
  active?: boolean;
  /** Varies the crowd and the whale's course. See VFXSparkles. */
  seed?: number;
}

const VFXCreatures: React.FC<VFXCreaturesProps> = ({
  style = 'whale',
  edge = 'bottom',
  direction = 'left',
  lane = 0.6,
  count = 10,
  size = 0.45,
  speed = 1,
  color = '#bfe8ff',
  intensity = 1,
  fadeInDuration = 1,
  duration = 3,
  fadeDuration = 2,
  active = true,
  seed = 1,
}) => {
  const clock = useFadeClock(active, fadeInDuration, duration, fadeDuration);
  const frame = useThree((state) => state.size);

  const crowd = useMemo(() => {
    const random = seededRandom(seed * 8231 + 17);
    const many = style === 'whale' ? 1 : Math.max(1, Math.round(count));
    return Array.from({ length: many }, (_, i) => ({
      variant: i % 3,
      start: random(),
      pace: 0.7 + random() * 0.8,
      scale: 0.75 + random() * 0.5,
      bob: random() * Math.PI * 2,
      // A few run the other way, so the crowd is not a parade.
      against: style === 'critters' && random() < 0.25,
    }));
  }, [style, count, seed]);

  const parts = useMemo(() => {
    const group = new THREE.Group();
    if (style === 'whale') {
      const body = glowing(whaleBody(), color, 2);
      const fluke = glowing(whaleFluke(), color, 1, FLUKE_HINGE);
      group.add(fluke, body);
      return { group, body, fluke, critters: [] as THREE.Mesh[] };
    }
    const critters = crowd.map((one) => {
      const mesh = glowing(critter(one.variant), color, 2);
      group.add(mesh);
      return mesh;
    });
    return { group, body: null, fluke: null, critters };
  }, [style, color, crowd]);

  const live = useRef<typeof parts | null>(null);
  useEffect(() => {
    live.current = parts;
    return () => {
      live.current = null;
    };
  }, [parts]);

  useEffect(
    () => () => {
      for (const mesh of [parts.body, parts.fluke, ...parts.critters]) {
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
    const span = size * Math.min(frame.width, frame.height) * unit;
    const halfWidth = state.viewport.width / 2;
    const halfHeight = state.viewport.height / 2;
    const facing = direction === 'right' ? 1 : -1;

    if (current.body && current.fluke) {
      // One slow pass across the whole screen over the effect's life.
      const whale = crowd[0];
      const across = (t * speed * 0.16) % 1;
      const travel = (across - 0.5) * (state.viewport.width + span * 2.4);
      const x = facing > 0 ? travel : -travel;
      const y = (lane - 0.5) * state.viewport.height + Math.sin(t * 0.7 + whale.bob) * halfHeight * 0.12;
      const long = span;
      const tall = long / WHALE_ASPECT;
      // Tilts into its own rise and fall, as a swimming thing does.
      const tilt = Math.cos(t * 0.7 + whale.bob) * 0.1 * facing;
      setPose(current.body, x, y, tilt, long * facing, tall);
      setOpacity(current.body, fade);

      // The tail hinges exactly where the body narrows, and beats about it.
      // The hinge is found in the body's own frame and then turned with it,
      // so the join holds however the whale tilts.
      const flukeSize = tall * 1.05;
      const beat = Math.sin(t * 1.9 * speed + whale.bob) * 0.34;
      const localX = PEDUNCLE.x * long * facing;
      const localY = PEDUNCLE.y * tall;
      const hx = x + localX * Math.cos(tilt) - localY * Math.sin(tilt);
      const hy = y + localX * Math.sin(tilt) + localY * Math.cos(tilt);
      setPose(current.fluke, hx, hy, tilt + beat * facing, flukeSize * FLUKE_ASPECT * facing, flukeSize);
      setOpacity(current.fluke, fade);
      return;
    }

    current.critters.forEach((mesh, i) => {
      const one = crowd[i];
      const tall = span * one.scale;
      const wide = tall * CRITTER_ASPECT;
      const way = one.against ? -facing : facing;
      // Round and round the edge they run on, each at its own pace.
      const along = (one.start + t * speed * 0.17 * one.pace * way + 2) % 1;
      // A quick bob, which at this size is what reads as scurrying.
      const step = Math.abs(Math.sin(t * 9 * one.pace + one.bob)) * tall * 0.18;
      if (edge === 'left' || edge === 'right') {
        const x = (edge === 'left' ? -halfWidth : halfWidth) + (edge === 'left' ? wide * 0.55 : -wide * 0.55) + step * (edge === 'left' ? 1 : -1);
        setPose(mesh, x, (along - 0.5) * state.viewport.height, edge === 'left' ? -Math.PI / 2 : Math.PI / 2, wide * way, tall);
      } else {
        const y = (edge === 'bottom' ? -halfHeight : halfHeight) + (edge === 'bottom' ? tall * 0.55 : -tall * 0.55) + step * (edge === 'bottom' ? 1 : -1);
        setPose(mesh, (along - 0.5) * state.viewport.width, y, edge === 'top' ? Math.PI : 0, wide * way, tall);
      }
      setOpacity(mesh, fade);
    });
  });

  return <primitive object={parts.group} />;
};

export default VFXCreatures;
