import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { CreaturesParams } from '../types';
import { useFadeClock } from './fadeClock';
import { seededRandom } from './scatter';
import { CRITTER_ASPECT, WHALE_ASPECT, critter, whaleBody } from './creatures/textures';

/**
 * Creatures made of light: a whale crossing the screen, or a crowd of small
 * things scurrying along an edge.
 *
 * Added to the frame rather than painted over it, so they read as apparitions
 * — which also means they go through the bloom and glow at their edges.
 *
 * The whale is one picture on a strip that bends as it swims: a wave runs
 * from the head to the tail, small at the head and growing towards the
 * flukes, up and down rather than side to side, because that is how a whale
 * swims and a fish does not. The first whale slid across rigid, with its tail
 * a separate picture hinged on, and read as a sticker.
 */

const whaleVertex = `
  uniform float time;
  uniform float amp;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    // The picture's nose is at uv.x = 1. Measured from there, the wave grows
    // with the square of the distance, so the head holds steady and the
    // flukes sweep.
    float fromHead = 1.0 - uv.x;
    p.y += amp * pow(fromHead, 2.0) * sin(time - fromHead * 2.8);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const whaleFragment = `
  uniform sampler2D map;
  uniform vec3 tint;
  uniform float opacity;
  varying vec2 vUv;
  void main() {
    vec4 c = texture2D(map, vUv);
    float a = c.a * opacity;
    if (a < 0.003) discard;
    // Added to the frame: strength goes in alpha alone, or it ramps as its
    // square on the way in.
    gl_FragColor = vec4(c.rgb * tint, a);
  }
`;

function setPose(mesh: THREE.Mesh, x: number, y: number, turn: number, width: number, height: number): void {
  mesh.position.set(x, y, 0);
  mesh.rotation.z = turn;
  mesh.scale.set(width, height, 1);
}

function setOpacity(mesh: THREE.Mesh, value: number): void {
  (mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, value);
}

function setUniform(mesh: THREE.Mesh, name: string, value: number): void {
  (mesh.material as THREE.ShaderMaterial).uniforms[name].value = value;
}

function glowing(map: THREE.Texture, color: string, order: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
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

function whaleMesh(color: string): THREE.Mesh {
  const mesh = new THREE.Mesh(
    // Divided along its length so it can bend; one row is enough across it.
    new THREE.PlaneGeometry(1, 1, 64, 1),
    new THREE.ShaderMaterial({
      vertexShader: whaleVertex,
      fragmentShader: whaleFragment,
      uniforms: {
        map: { value: whaleBody() },
        tint: { value: new THREE.Color(color) },
        opacity: { value: 0 },
        time: { value: 0 },
        amp: { value: 0.16 },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  mesh.renderOrder = 2;
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
      const whale = whaleMesh(color);
      group.add(whale);
      return { group, whale, critters: [] as THREE.Mesh[] };
    }
    const critters = crowd.map((one) => {
      const mesh = glowing(critter(one.variant), color, 2);
      group.add(mesh);
      return mesh;
    });
    return { group, whale: null, critters };
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
      for (const mesh of [parts.whale, ...parts.critters]) {
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

    if (current.whale) {
      // One unhurried pass across the screen over the effect's whole life,
      // in from beyond one edge and out past the other.
      const whale = crowd[0];
      const life = Math.max(fadeInDuration + duration + fadeDuration, 0.5);
      const progress = Math.min(1, (t * speed) / life);
      // Measured against less of the height on a wide screen, as the wings
      // are, so a whale sized for a phone does not fill a laptop's whole
      // band above the results.
      const long = size * Math.min(frame.width, frame.height * 0.62) * unit;
      const tall = long / WHALE_ASPECT;
      const x = -facing * (1 - 2 * progress) * (halfWidth + long * 0.55);
      const y = (lane - 0.5) * state.viewport.height + Math.sin(t * 0.6 + whale.bob) * tall * 0.25;
      // It pitches gently with its own rise and fall.
      const pitch = Math.cos(t * 0.6 + whale.bob) * 0.04 * -facing;
      setPose(current.whale, x, y, pitch, long * facing, tall);
      setUniform(current.whale, 'time', t * 1.9 * speed + whale.bob);
      setUniform(current.whale, 'opacity', fade);
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
