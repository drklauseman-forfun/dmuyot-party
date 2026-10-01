import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { CurtainParams } from '../types';
import { useFadeClock } from './fadeClock';

/**
 * A heavy cloth falling across the screen — or rising up it — with folds down
 * its length and a hem that sways after it lands.
 *
 * Painted over the frame rather than added to it: a curtain is cloth, and
 * black added to a picture changes nothing. That is also why a black curtain
 * shows its folds only faintly; the colour has to be a little above black for
 * the shading to have anything to work with.
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
  uniform float drop;
  uniform float folds;
  uniform float opacity;
  uniform float rising;
  uniform vec3 color;

  void main() {
    // Measured from whichever edge the cloth comes from.
    float across = rising > 0.5 ? 1.0 - vUv.y : vUv.y;
    // The hem: a wavy line that sways once the cloth has landed.
    float hem = 1.0 - drop
      + 0.014 * sin(vUv.x * 9.0 + time * 1.2)
      + 0.008 * sin(vUv.x * 23.0 - time * 0.7);
    if (across < hem) discard;

    // Folds: bands of light and shade down the cloth, breathing slowly.
    float wave = sin(vUv.x * folds * 6.2831853 + sin(time * 0.5) * 0.2);
    float shade = 0.5 + 0.5 * (0.5 + 0.5 * wave);
    vec3 cloth = color * shade;

    // A lighter line along the hem, where the cloth catches the light.
    float edge = smoothstep(hem, hem + 0.015, across);
    cloth = mix(cloth * 2.2 + vec3(0.03), cloth, edge);

    gl_FragColor = vec4(cloth, opacity);
  }
`;

function setUniform(mesh: THREE.Mesh, name: string, value: number): void {
  const material = mesh.material as THREE.ShaderMaterial;
  material.uniforms[name].value = value;
}

interface VFXCurtainProps extends CurtainParams {
  active?: boolean;
}

const VFXCurtain: React.FC<VFXCurtainProps> = ({
  style = 'falling',
  color = '#0b0b0e',
  coverage = 1,
  fall = 0.9,
  folds = 9,
  intensity = 1,
  fadeInDuration = 0.3,
  duration = 3,
  fadeDuration = 2,
  active = true,
}) => {
  const clock = useFadeClock(active, fadeInDuration, duration, fadeDuration);

  const mesh = useMemo(() => {
    const made = new THREE.Mesh(
      // Clip-space quad: the vertex shader writes gl_Position from position.
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          time: { value: 0 },
          drop: { value: 0 },
          folds: { value: folds },
          opacity: { value: 0 },
          rising: { value: style === 'rising' ? 1 : 0 },
          color: { value: new THREE.Color(color) },
        },
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    );
    // Behind anything else solid: things stand in front of a curtain.
    made.renderOrder = 0;
    made.frustumCulled = false;
    return made;
  }, [color, folds, style]);

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

  useFrame((_state, delta) => {
    const current = live.current;
    if (!current) return;
    clock.tick(delta);
    const t = clock.elapsed.current;
    // Falls quickly and settles rather than easing to a stop: cloth has
    // weight, and a curtain that glides down reads as a wipe.
    const through = Math.min(1, t / Math.max(fall, 0.05));
    const landed = 1 - Math.pow(1 - through, 2.2);
    const settle = through >= 1 ? Math.exp(-(t - fall) * 3.4) * Math.sin((t - fall) * 11) * 0.012 : 0;
    setUniform(current, 'drop', Math.max(0, coverage * landed + settle));
    setUniform(current, 'time', t);
    setUniform(current, 'opacity', Math.min(1, clock.strength.current.value * 2.2) * intensity);
  });

  return <primitive object={mesh} />;
};

export default VFXCurtain;
