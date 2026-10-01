import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { FigureParams } from '../types';
import { useFadeClock } from './fadeClock';
import { FIGURE_ASPECT, suitFigure } from './hands/textures';

/**
 * Someone standing behind everything else: at the moment a suit, shoulders to
 * waist, with no face.
 *
 * Meant to be turned well down — it is a presence behind the results, not a
 * picture of a person, and at full strength it simply blocks the screen.
 * Solid, so it is drawn after the bloom, and before the hands that belong to
 * it because its effect comes first in the animation.
 */

const TEXTURES = {
  suit: suitFigure,
};

function setOpacity(mesh: THREE.Mesh, value: number): void {
  (mesh.material as THREE.MeshBasicMaterial).opacity = value;
}

function setPose(mesh: THREE.Mesh, x: number, y: number, width: number, height: number): void {
  mesh.position.set(x, y, 0);
  mesh.scale.set(width, height, 1);
}

interface VFXFigureProps extends FigureParams {
  active?: boolean;
}

const VFXFigure: React.FC<VFXFigureProps> = ({
  style = 'suit',
  center = [0.5, 0.42],
  size = 0.8,
  color = '#ffffff',
  intensity = 0.3,
  fadeInDuration = 1,
  duration = 3,
  fadeDuration = 2,
  active = true,
}) => {
  const clock = useFadeClock(active, fadeInDuration, duration, fadeDuration);
  const frame = useThree((state) => state.size);
  const [centerX, centerY] = center;

  const mesh = useMemo(() => {
    const texture = (TEXTURES[style] ?? suitFigure)();
    const made = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
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
    // Behind the hands and everything else solid.
    made.renderOrder = 0;
    made.frustumCulled = false;
    return made;
  }, [style, color]);

  const live = useRef<THREE.Mesh | null>(null);
  useEffect(() => {
    live.current = mesh;
    return () => {
      live.current = null;
    };
  }, [mesh]);

  useEffect(
    () => () => {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    },
    [mesh],
  );

  useFrame((state, delta) => {
    const current = live.current;
    if (!current) return;
    clock.tick(delta);
    const fade = Math.min(1, clock.strength.current.value * 1.6) * intensity;
    const unit = state.viewport.width / state.size.width;
    const height = size * Math.min(frame.width, frame.height) * unit;
    setPose(
      current,
      (centerX - 0.5) * state.viewport.width,
      (centerY - 0.5) * state.viewport.height,
      height * FIGURE_ASPECT,
      height,
    );
    setOpacity(current, fade);
  });

  return <primitive object={mesh} />;
};

export default VFXFigure;
