import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { HandsParams } from '../types';
import { useFadeClock } from './fadeClock';
import { HAND_ASPECT, openHand, porcelainHand, roboticHand } from './hands/textures';
import { seededRandom } from './scatter';

/**
 * Hands reaching in from an edge of the screen: an open one held out to be
 * shaken, machines' hands, or porcelain.
 *
 * They slide in one after another and then hold, swaying a little, rather
 * than arriving together — a row of hands appearing at once reads as a
 * pattern, and the stagger is what makes it read as reaching.
 *
 * Each hand is drawn wrist-down, and the whole thing is turned to suit the
 * edge it comes from, so one drawing serves all four. Solid, so they are
 * drawn after the bloom.
 */

/** Seconds one hand takes to reach in. */
const REACH_TIME = 0.55;

const TEXTURES = {
  open: openHand,
  robotic: roboticHand,
  porcelain: porcelainHand,
};

/** Turn, and which way is "in", for each edge. */
const EDGES = {
  bottom: { turn: 0, along: 'x' as const, sign: 1 },
  top: { turn: Math.PI, along: 'x' as const, sign: -1 },
  left: { turn: -Math.PI / 2, along: 'y' as const, sign: 1 },
  right: { turn: Math.PI / 2, along: 'y' as const, sign: -1 },
};

function setPose(mesh: THREE.Mesh, x: number, y: number, turn: number, width: number, height: number): void {
  mesh.position.set(x, y, 0);
  mesh.rotation.z = turn;
  mesh.scale.set(width, height, 1);
}

function setOpacity(mesh: THREE.Mesh, value: number): void {
  (mesh.material as THREE.MeshBasicMaterial).opacity = value;
}

interface VFXHandsProps extends HandsParams {
  active?: boolean;
  /** Varies the stagger and sway between runs. See VFXSparkles. */
  seed?: number;
}

const VFXHands: React.FC<VFXHandsProps> = ({
  style = 'open',
  edge = 'bottom',
  count = 1,
  size = 0.42,
  reach = 0.6,
  spread = 0.7,
  color = '#ffffff',
  intensity = 1,
  fadeInDuration = 1,
  duration = 3,
  fadeDuration = 2,
  active = true,
  seed = 1,
}) => {
  const clock = useFadeClock(active, fadeInDuration, duration, fadeDuration);
  const frame = useThree((state) => state.size);

  // Where along the edge each hand stands, when it arrives, and how it sways.
  const hands = useMemo(() => {
    const random = seededRandom(seed * 9173 + 41);
    const many = Math.max(1, Math.round(count));
    return Array.from({ length: many }, (_, i) => ({
      // Spread evenly, then nudged, so a row of them is not a comb.
      place: many === 1 ? 0.5 : 0.5 + ((i / (many - 1)) - 0.5) * spread + (random() - 0.5) * (spread / many) * 0.6,
      arrives: (i / many) * 0.5 + random() * 0.12,
      sway: 0.5 + random(),
      lean: (random() - 0.5) * 0.16,
      scale: 0.85 + random() * 0.3,
    }));
  }, [count, spread, seed]);

  const parts = useMemo(() => {
    const texture = (TEXTURES[style] ?? openHand)();
    // Wrist at the origin, so a hand turns about its wrist and reaches from
    // the edge it stands on.
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.translate(0, 0.5, 0);
    const group = new THREE.Group();
    const meshes = hands.map(() => {
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({
          map: texture,
          color: new THREE.Color(color),
          transparent: true,
          opacity: 0,
          depthTest: false,
          depthWrite: false,
          // The canvas turns tone mapping on, which would dull the drawing.
          toneMapped: false,
        }),
      );
      mesh.renderOrder = 2;
      mesh.frustumCulled = false;
      group.add(mesh);
      return mesh;
    });
    return { group, meshes, geometry };
  }, [style, color, hands]);

  const live = useRef<typeof parts | null>(null);
  useEffect(() => {
    live.current = parts;
    return () => {
      live.current = null;
    };
  }, [parts]);

  useEffect(
    () => () => {
      parts.geometry.dispose();
      for (const mesh of parts.meshes) (mesh.material as THREE.Material).dispose();
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
    const height = size * Math.min(frame.width, frame.height) * unit;
    const { turn, along, sign } = EDGES[edge] ?? EDGES.bottom;
    const half = { x: state.viewport.width / 2, y: state.viewport.height / 2 };

    current.meshes.forEach((mesh, i) => {
      const hand = hands[i];
      const tall = height * hand.scale;
      // Slides in over REACH_TIME, then holds.
      const arrived = Math.min(1, Math.max(0, (t - hand.arrives) / REACH_TIME));
      const eased = 1 - Math.pow(1 - arrived, 3);
      const shown = reach * eased;
      // The wrist sits outside the frame by whatever is not yet reaching in.
      const out = tall * (1 - shown);
      const sway = Math.sin(t * hand.sway + i) * 0.045;

      if (along === 'x') {
        const x = (hand.place - 0.5) * state.viewport.width;
        const y = sign > 0 ? -half.y - out : half.y + out;
        setPose(mesh, x, y, turn + hand.lean + sway, tall * HAND_ASPECT, tall);
      } else {
        const y = (hand.place - 0.5) * state.viewport.height;
        const x = sign > 0 ? -half.x - out : half.x + out;
        setPose(mesh, x, y, turn + hand.lean + sway, tall * HAND_ASPECT, tall);
      }
      setOpacity(mesh, fade * Math.min(1, arrived * 2.5));
    });
  });

  return <primitive object={parts.group} />;
};

export default VFXHands;
