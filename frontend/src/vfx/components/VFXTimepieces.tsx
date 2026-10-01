import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { TimepiecesParams } from '../types';
import { useFadeClock } from './fadeClock';
import {
  clockFace,
  clockHand,
  digitalCase,
  drawDigits,
  hourglassFrame,
  metronomeArm,
  metronomeBody,
  toTexture,
} from './timepieces/textures';

/**
 * One machine for telling the time: a clock, a digital one, an hourglass or a
 * metronome. Each is a drawing with its moving parts on top — hands turning,
 * sand running, an arm swinging — placed where the effect says.
 *
 * One at a time, on purpose: a screen full of them is several of these, each
 * with its own kind, place and size, rather than one effect inventing a
 * crowd. Solid objects, so they are drawn after the bloom.
 */

/** Of the drawn picture, where the glass sits, and where the arm pivots. */
const GLASS = { width: 172 / 320, height: 336 / 448, aspect: 320 / 448 };
const METRONOME = { aspect: 288 / 384, pivotY: (192 - 340) / 384, armHeight: 320 / 384, armWidth: 48 / 384 };
const FACE_ASPECT = 1;
const DIGITAL_ASPECT = 384 / 224;
/** Where the hub sits in the hand's picture, from its bottom edge. */
const HAND_HUB = 18 / 256;
const HAND_ASPECT = 48 / 256;

const sandVertex = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const sandFragment = `
  varying vec2 vUv;
  uniform float progress;
  uniform float opacity;
  uniform vec3 tint;

  void main() {
    // The bulbs: widest at the ends, pinched to nothing at the waist.
    float waist = 0.5;
    float halfWidth = mix(0.05, 0.46, abs(vUv.y - waist) / 0.5);
    float inside = step(abs(vUv.x - 0.5), halfWidth);

    float sand;
    if (vUv.y > waist) {
      // Above: the surface falls from the top of the bulb to the waist.
      sand = inside * step(vUv.y, mix(1.0, waist, progress));
    } else {
      // Below: a pile growing from the floor, heaped in the middle.
      float peak = mix(0.0, 0.46, progress);
      float heap = peak * (1.0 - 0.5 * abs(vUv.x - 0.5) / max(halfWidth, 0.001));
      sand = inside * step(vUv.y, heap);
    }

    // The stream, while there is still sand to fall.
    float running = step(0.004, progress) * step(progress, 0.996);
    float stream = running * step(abs(vUv.x - 0.5), 0.014) * step(abs(vUv.y - waist), 0.3);
    float a = max(sand, stream) * opacity;
    if (a < 0.01) discard;

    // Lighter in the middle than at the edges, so the pile has some body.
    vec3 grain = mix(vec3(0.88, 0.74, 0.45), vec3(0.6, 0.44, 0.22), abs(vUv.x - 0.5) * 2.0);
    gl_FragColor = vec4(grain * tint * a, a);
  }
`;

interface VFXTimepiecesProps extends TimepiecesParams {
  active?: boolean;
}

/**
 * How strongly a part is drawn. The sand is a shader and carries its own
 * uniform; everything else is a plain textured material.
 */
function setOpacity(mesh: THREE.Mesh, value: number): void {
  const material = mesh.material as THREE.Material & { uniforms?: Record<string, { value: number }> };
  if (material.uniforms) material.uniforms.opacity.value = value;
  else (material as THREE.MeshBasicMaterial).opacity = value;
}

/** Turns a part about its own pivot. */
function setTurn(mesh: THREE.Mesh, radians: number): void {
  mesh.rotation.z = radians;
}

/** How far the sand has run, 0 to 1. */
function setProgress(mesh: THREE.Mesh, value: number): void {
  const material = mesh.material as THREE.Material & { uniforms?: Record<string, { value: number }> };
  if (material.uniforms) material.uniforms.progress.value = value;
}

function solidMaterial(map: THREE.Texture, color: string): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    map,
    color: new THREE.Color(color),
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    // The canvas turns tone mapping on, which would dull the drawing.
    toneMapped: false,
  });
}

const VFXTimepieces: React.FC<VFXTimepiecesProps> = ({
  style = 'analogue',
  center = [0.5, 0.5],
  size = 0.2,
  color = '#ffffff',
  speed = 1,
  intensity = 1,
  fadeInDuration = 1,
  duration = 3,
  fadeDuration = 2,
  active = true,
}) => {
  const clock = useFadeClock(active, fadeInDuration, duration, fadeDuration);
  const frame = useThree((state) => state.size);
  const [centerX, centerY] = center;

  // The digits are redrawn as the time shown changes, so this one canvas is
  // the clock's own rather than shared.
  const digits = useMemo(() => {
    if (style !== 'digital') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 316;
    canvas.height = 144;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    return { ctx, texture: toTexture(canvas) };
  }, [style]);

  const parts = useMemo(() => {
    const quad = new THREE.PlaneGeometry(1, 1);
    const pieces: { mesh: THREE.Mesh; role: string }[] = [];
    const add = (geometry: THREE.BufferGeometry, map: THREE.Texture, role: string, order: number) => {
      const mesh = new THREE.Mesh(geometry, solidMaterial(map, color));
      mesh.renderOrder = order;
      mesh.frustumCulled = false;
      pieces.push({ mesh, role });
      return mesh;
    };

    if (style === 'analogue') {
      add(quad, clockFace(), 'face', 1);
      // Turned about the hub rather than their middle, so the geometry is
      // shifted until the hub sits at the origin.
      const hand = new THREE.PlaneGeometry(1, 1);
      hand.translate(0, 0.5 - HAND_HUB, 0);
      add(hand, clockHand(), 'hour', 2);
      add(hand, clockHand(), 'minute', 2);
      add(hand, clockHand(), 'second', 2);
    } else if (style === 'hourglass') {
      const sand = new THREE.Mesh(
        quad,
        new THREE.ShaderMaterial({
          vertexShader: sandVertex,
          fragmentShader: sandFragment,
          uniforms: {
            progress: { value: 0 },
            opacity: { value: 0 },
            tint: { value: new THREE.Color(color) },
          },
          transparent: true,
          depthTest: false,
          depthWrite: false,
        }),
      );
      sand.renderOrder = 1;
      sand.frustumCulled = false;
      pieces.push({ mesh: sand, role: 'sand' });
      add(quad, hourglassFrame(), 'frame', 2);
    } else if (style === 'metronome') {
      add(quad, metronomeBody(), 'body', 2);
      const arm = new THREE.PlaneGeometry(1, 1);
      arm.translate(0, 0.5 - 11 / 320, 0);
      add(arm, metronomeArm(), 'arm', 1);
    } else {
      add(quad, digitalCase(), 'case', 1);
      if (digits) add(quad, digits.texture, 'digits', 2);
    }

    const group = new THREE.Group();
    // The arm goes behind the case it swings in; everything else in order.
    for (const piece of pieces) group.add(piece.mesh);
    return { group, pieces };
  }, [style, color, digits]);

  // Held in a ref so the frame loop changes what is on screen rather than
  // what a hook handed back. Set once the parts exist, cleared with them.
  const live = useRef<{ parts: typeof parts; digits: typeof digits; shown: string } | null>(null);
  useEffect(() => {
    live.current = { parts, digits, shown: '' };
    return () => {
      live.current = null;
    };
  }, [parts, digits]);

  useEffect(
    () => () => {
      for (const { mesh } of parts.pieces) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
      digits?.texture.dispose();
    },
    [parts, digits],
  );

  useFrame((state, delta) => {
    const current = live.current;
    if (!current) return;
    const { parts: shown_parts, digits: shown_digits } = current;
    clock.tick(delta);
    const t = clock.elapsed.current;
    const fade = Math.min(1, clock.strength.current.value * 1.6) * intensity;
    const unit = state.viewport.width / state.size.width;
    // Height on screen, measured against the shorter side as every other
    // effect is, so a phone and a desktop show the same thing.
    const height = size * Math.min(frame.width, frame.height) * unit;
    shown_parts.group.position.set(
      (centerX - 0.5) * state.viewport.width,
      (centerY - 0.5) * state.viewport.height,
      0,
    );

    for (const { mesh, role } of shown_parts.pieces) {
      setOpacity(mesh, fade);

      switch (role) {
        case 'face':
          mesh.scale.set(height * FACE_ASPECT, height, 1);
          break;
        case 'hour':
        case 'minute':
        case 'second': {
          // The second hand steps from mark to mark; a sweeping line reads as
          // a radar. The others are driven from it, far faster than a real
          // clock, because nothing that moves once an hour reads as moving.
          const ticks = Math.floor(t * Math.max(speed, 0.01));
          const secondAngle = ticks * (Math.PI / 30);
          const turn = role === 'second' ? secondAngle : role === 'minute' ? secondAngle / 12 : secondAngle / 144;
          const reach = role === 'second' ? 0.86 : role === 'minute' ? 0.74 : 0.5;
          const armLength = (height / 2) * reach / (1 - HAND_HUB);
          mesh.scale.set(armLength * HAND_ASPECT, armLength, 1);
          setTurn(mesh, -turn);
          break;
        }
        case 'sand':
        case 'frame': {
          const width = height * GLASS.aspect;
          if (role === 'frame') {
            mesh.scale.set(width, height, 1);
          } else {
            mesh.scale.set(width * GLASS.width, height * GLASS.height, 1);
            // One turn of the glass over the effect's hold, so it is still
            // running when the fade takes it.
            setProgress(mesh, Math.min(1, (t * Math.max(speed, 0.01)) / Math.max(duration, 0.5)));
          }
          break;
        }
        case 'body':
          mesh.scale.set(height * METRONOME.aspect, height, 1);
          break;
        case 'arm': {
          const armHeight = height * METRONOME.armHeight;
          mesh.scale.set(armHeight * METRONOME.armWidth / METRONOME.armHeight, armHeight, 1);
          mesh.position.set(0, height * METRONOME.pivotY, 0);
          // A beat at each end of the swing, so one full swing is two beats.
          setTurn(mesh, 0.38 * Math.sin(Math.PI * Math.max(speed, 0.01) * t));
          break;
        }
        case 'case':
          mesh.scale.set(height * DIGITAL_ASPECT, height, 1);
          break;
        case 'digits': {
          mesh.scale.set(height * DIGITAL_ASPECT * (316 / 384), height * (144 / 224), 1);
          if (shown_digits) {
            const total = t * Math.max(speed, 0.01);
            const text = `${String(Math.floor(total / 60) % 100).padStart(2, '0')}:${String(Math.floor(total) % 60).padStart(2, '0')}`;
            if (text !== current.shown) {
              current.shown = text;
              drawDigits(shown_digits.ctx, text, '#7dffc4');
              shown_digits.texture.needsUpdate = true;
            }
          }
          break;
        }
      }
    }
  });

  return <primitive object={parts.group} />;
};

export default VFXTimepieces;
