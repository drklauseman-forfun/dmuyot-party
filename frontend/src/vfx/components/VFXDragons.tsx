import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { DragonsParams } from '../types';
import { useFadeClock } from './fadeClock';
import { catmullRom, offsetFrom, pointAt, ribbon, walk } from './dragons/spine';
import { foldGrid, restGrid } from './dragons/wingFold';
import type { Point, SpinePoint } from './dragons/spine';
import {
  BAND,
  FACE,
  WING,
  WING_WRIST,
  bandTexture,
  faceTexture,
  glowTexture,
  headLayout,
  headTexture,
  legLayout,
  legTexture,
  profile,
  tailEndLayout,
  tailEndTexture,
  wingTexture,
} from './dragons/textures';
import type { Layout, LegKind, Serpent } from './dragons/textures';

/**
 * Dragons: a Chinese one coiling across the screen, a western one flying
 * across on beating wings, or a head looking straight out.
 *
 * One kind per effect, as the clocks and the weapons are, so a sky with two
 * dragons in it is this effect twice over.
 *
 * The two that travel are built on a spine, recomputed every frame (see
 * dragons/spine.ts). The body is a ribbon of scales laid along it — every
 * column of the ribbon square to the spine, so the body keeps its thickness
 * through every curve — and the head, the legs, the tail's end and the wings
 * are separate pictures pinned to points on it. The first version pushed a
 * wave up and down through one flat picture; that shears a body instead of
 * bending it, and could not coil at all.
 *
 * Solid rather than light, like the hands and the weapons: drawn after the
 * bloom, in exactly the colours they were painted in. Only the face's eyes
 * are added rather than painted over, so they burn.
 */

/** Columns in a body's ribbon. Enough that a coil reads as a curve. */
const COLUMNS = 120;
/** Where in its band the body's middle is, and its belly: see BAND. */
const BODY_MIDDLE = (BAND.top + BAND.bottom) / 2;
const BODY_SHARE = BAND.bottom - BAND.top;
/** A band's height fraction, as an offset from the spine in half-widths. */
const fromSpine = (fractionDown: number) => 1 - 2 * fractionDown;

function material(map: THREE.Texture, color: THREE.Color, additive = false): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    map,
    color,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    // The canvas turns tone mapping on, which would dull the painting.
    toneMapped: false,
    side: THREE.DoubleSide,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

function sprite(map: THREE.Texture, color: THREE.Color, order: number, additive = false): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material(map, color, additive));
  mesh.renderOrder = order;
  mesh.frustumCulled = false;
  return mesh;
}

/**
 * Puts a picture's anchor on a point, turned to `angle` and mirrored to face
 * the way the dragon does. The picture is painted facing right; facing left,
 * it is flipped and turned half round, which keeps its top uppermost.
 */
function pin(
  mesh: THREE.Mesh,
  layout: Layout,
  at: Point,
  angle: number,
  facing: number,
  pixel: number,
  stretch = 1,
): void {
  const w = layout.width * pixel;
  const h = layout.height * pixel * stretch;
  const turn = facing > 0 ? angle : angle - Math.PI;
  const ox = (layout.anchor.x - layout.width / 2) * pixel * facing;
  const oy = (layout.height / 2 - layout.anchor.y) * pixel * stretch;
  const c = Math.cos(turn);
  const s = Math.sin(turn);
  mesh.position.set(at.x - (c * ox - s * oy), at.y - (s * ox + c * oy), 0);
  mesh.rotation.z = turn;
  mesh.scale.set(w * facing, h, 1);
}

function setOpacity(mesh: THREE.Mesh | null, value: number): void {
  if (mesh) (mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, Math.min(1, value));
}

/** Cells across and down the wing's grid: enough for the fold to bend smoothly. */
const WING_GRID = 18;
const WING_RIG = { width: WING.width, height: WING.height, wrist: WING_WRIST };

/** A wing that can fold at the wrist: a grid, not a single card. */
function foldingWing(color: THREE.Color, order: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, WING_GRID, WING_GRID), material(wingTexture(), color));
  mesh.renderOrder = order;
  mesh.frustumCulled = false;
  mesh.userData.rig = restGrid(WING_RIG, WING_GRID, WING_GRID);
  return mesh;
}

function fold(mesh: THREE.Mesh, angle: number, shrink: number): void {
  const { rest, share } = mesh.userData.rig as ReturnType<typeof restGrid>;
  const attribute = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
  foldGrid(WING_RIG, rest, share, angle, shrink, attribute.array as Float32Array);
  attribute.needsUpdate = true;
}

function writeRibbon(mesh: THREE.Mesh, spine: SpinePoint[], halfWidth: (s: number) => number, facing: number): void {
  const attribute = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
  ribbon(spine, halfWidth, facing, attribute.array as Float32Array);
  attribute.needsUpdate = true;
}

interface Leg {
  mesh: THREE.Mesh;
  kind: LegKind;
  /** Where along the body, from the head. */
  at: number;
  phase: number;
}

interface Parts {
  group: THREE.Group;
  body: THREE.Mesh | null;
  head: THREE.Mesh | null;
  tail: THREE.Mesh | null;
  legs: Leg[];
  wings: { near: THREE.Mesh; far: THREE.Mesh } | null;
  face: THREE.Mesh | null;
  glows: THREE.Mesh[];
}

function build(kind: DragonsParams['kind'], color: string): Parts {
  const group = new THREE.Group();
  const tint = new THREE.Color(color);
  // What is on the far side of the body is in its shadow.
  const far = tint.clone().multiplyScalar(0.5);

  if (kind === 'face') {
    const face = sprite(faceTexture(), tint, 2);
    const glows = FACE.eyes.map(() => sprite(glowTexture(), new THREE.Color('#ff7a1a'), 3, true));
    group.add(face, ...glows);
    return { group, body: null, head: null, tail: null, legs: [], wings: null, face, glows };
  }

  const serpent: Serpent = kind === 'western' ? 'western' : 'chinese';
  const order = serpent === 'western' ? { far: 2, tail: 3, body: 4, near: 5, head: 6 } : { far: 1, tail: 2, body: 3, near: 4, head: 5 };
  const body = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, COLUMNS - 1, 1), material(bandTexture(serpent), tint));
  body.renderOrder = order.body;
  body.frustumCulled = false;
  const head = sprite(headTexture(serpent), tint, order.head);
  const tail = sprite(tailEndTexture(serpent), tint, order.tail);
  const legSpecs: { kind: LegKind; at: number; far: boolean; phase: number }[] =
    serpent === 'chinese'
      ? [
          { kind: 'chinese', at: 0.17, far: true, phase: 1.6 },
          { kind: 'chinese', at: 0.14, far: false, phase: 0 },
          { kind: 'chinese', at: 0.56, far: true, phase: 4.2 },
          { kind: 'chinese', at: 0.53, far: false, phase: 2.6 },
        ]
      : [
          { kind: 'westernFore', at: 0.21, far: true, phase: 0.8 },
          { kind: 'westernFore', at: 0.24, far: false, phase: 0 },
          { kind: 'westernHind', at: 0.39, far: true, phase: 2.2 },
          { kind: 'westernHind', at: 0.42, far: false, phase: 1.4 },
        ];
  const legs = legSpecs.map((spec) => ({
    mesh: sprite(legTexture(spec.kind), spec.far ? far : tint, spec.far ? order.far : order.near),
    kind: spec.kind,
    at: spec.at,
    phase: spec.phase,
  }));
  let wings: Parts['wings'] = null;
  if (serpent === 'western') {
    wings = { near: foldingWing(tint, 7), far: foldingWing(far, 1) };
    group.add(wings.far, wings.near);
  }
  group.add(tail, body, head, ...legs.map((leg) => leg.mesh));
  return { group, body, head, tail, legs, wings, face: null, glows: [] };
}

interface VFXDragonsProps extends DragonsParams {
  active?: boolean;
}

const VFXDragons: React.FC<VFXDragonsProps> = ({
  kind = 'chinese',
  direction = 'left',
  lane = 0.72,
  size = 1,
  speed = 1,
  color = '#ffffff',
  intensity = 1,
  fadeInDuration = 1,
  duration = 3,
  fadeDuration = 2,
  active = true,
}) => {
  const clock = useFadeClock(active, fadeInDuration, duration, fadeDuration);

  const parts = useMemo(() => build(kind, color), [kind, color]);

  const live = useRef<Parts | null>(null);
  useEffect(() => {
    live.current = parts;
    return () => {
      live.current = null;
    };
  }, [parts]);

  useEffect(
    () => () => {
      parts.group.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      });
    },
    [parts],
  );

  useFrame((state, delta) => {
    const current = live.current;
    if (!current) return;
    clock.tick(delta);
    const t = clock.elapsed.current;
    const fade = Math.min(1, clock.strength.current.value * 1.6) * intensity;
    const width = state.viewport.width;
    const height = state.viewport.height;
    const facing = direction === 'right' ? 1 : -1;
    const laneY = (lane - 0.5) * height;

    if (current.face) {
      // Sized against the shorter side on a phone, and against less of the
      // height on a wide screen, where the band above the results is short.
      const tall = size * 0.6 * Math.min(width, height * 0.62);
      const pixel = tall / FACE.height;
      // It does not travel. It breathes, and turns its head a little.
      const breath = 1 + Math.sin(t * 1.5 * speed) * 0.018;
      const sway = Math.sin(t * 0.6 * speed) * 0.03;
      const at = { x: Math.sin(t * 0.6 * speed) * tall * 0.01, y: laneY };
      pin(current.face, FACE, at, sway, 1, pixel * breath);
      setOpacity(current.face, fade);
      current.glows.forEach((glow, i) => {
        const eye = FACE.eyes[i];
        const local = { x: (eye.x - FACE.anchor.x) * pixel * breath, y: (FACE.anchor.y - eye.y) * pixel * breath };
        const c = Math.cos(sway);
        const s = Math.sin(sway);
        const across = tall * 0.2;
        glow.position.set(at.x + c * local.x - s * local.y, at.y + s * local.x + c * local.y, 0);
        glow.scale.set(across, across * 0.62, 1);
        glow.rotation.z = sway + (i === 0 ? -0.3 : 0.3);
        // A slow, uneven smoulder rather than a pulse.
        const smoulder = 0.42 + 0.16 * Math.sin(t * 2.3 + i) + 0.08 * Math.sin(t * 5.1 + i * 2);
        setOpacity(glow, fade * smoulder);
      });
      return;
    }

    const serpent: Serpent = kind === 'western' ? 'western' : 'chinese';
    const reach = Math.min(width, height * 1.6);
    const long = size * (serpent === 'chinese' ? 0.9 : 0.62) * reach;
    const half = long * (serpent === 'chinese' ? 0.055 : 0.078);
    const halfWidth = (s: number) => half * profile(serpent, s);
    const thickness = (s: number) => 2 * halfWidth(s) * BODY_SHARE;

    // One pass across the screen over the effect's whole life, the head in
    // from beyond one edge and the tail out past the other.
    const life = Math.max(fadeInDuration + duration + fadeDuration, 0.5);
    const progress = Math.min(1, (t * speed) / life);
    const headX = facing * (-(width / 2 + long * 0.3) + progress * (width + long * 1.55));

    let spine: SpinePoint[];
    let beat = 0;
    let warped = 0;
    let bodyPitch = 0;
    if (serpent === 'chinese') {
      // A travelling wave, quiet at the head and full along the body, its
      // crests running back towards the tail as a swimming snake's do.
      const amplitude = long * 0.075;
      const wavelength = long * 0.5;
      const pace = 2.4 * speed;
      const headY = laneY + Math.sin(t * 0.7 * speed) * long * 0.02;
      spine = walk(
        (u) => {
          const d = u * long * 1.6;
          const settle = 0.3 + 0.7 * Math.min(1, d / (long * 0.35));
          return {
            x: headX - facing * d,
            y: headY + amplitude * settle * Math.sin((Math.PI * 2 * d) / wavelength - t * pace),
          };
        },
        COLUMNS,
        long,
      );
    } else {
      // Faster on the downstroke than the up, which is how wings push.
      const phase = t * 3 * speed;
      warped = phase + 0.35 * Math.sin(phase);
      beat = Math.cos(warped);
      // The wings carry the body, so it moves with every beat: it rises after
      // each downstroke and sinks between, and noses up as the wings push
      // down. Each part takes the movement a little after the one ahead of
      // it, so the neck and the tail follow through like a whip. Held rigid
      // and only bobbed, the first one moved as one plank.
      const heaveAt = (lag: number) => -Math.cos(warped - 0.3 - lag) * 0.042;
      bodyPitch = 0.075 * Math.sin(warped) + 0.04 * Math.sin(t * 0.45 * speed);
      const glide = Math.sin(t * 0.45 * speed + 1) * 0.03;
      const swish = t * 2.1 * speed;
      // The body's shape in body lengths, towards the head from the chest,
      // and how late each part moves.
      const shape: [number, number, number][] = [
        [0.24, 0.17, -0.5],
        [0.17, 0.12, -0.3],
        [0.09, 0.04, -0.15],
        [0, 0, 0],
        [-0.16, -0.01, 0.25],
        [-0.32, -0.02, 0.6],
        [-0.48, 0, 1],
        [-0.63, 0.03, 1.4],
        [-0.76, 0.05, 1.8],
      ];
      const chestX = headX - facing * 0.24 * long;
      const c = Math.cos(bodyPitch);
      const s = Math.sin(bodyPitch);
      const keys: Point[] = shape.map(([x, y, lag], i) => {
        const px = x * c - y * s;
        let py = x * s + y * c;
        // The head takes less of the heave than the body: the neck flexes
        // to hold it steady, as a bird's does.
        const steady = i === 0 ? 0.45 : i === 1 ? 0.7 : 1;
        py += heaveAt(lag) * steady + glide;
        // The tail's own sway, growing towards the tip.
        if (i >= 5) py += Math.sin(swish - (i - 4) * 0.95) * 0.016 * Math.pow(i - 4, 1.3);
        return { x: chestX + facing * px * long, y: laneY + py * long };
      });
      spine = walk(catmullRom(keys), COLUMNS);
    }

    if (current.body) {
      writeRibbon(current.body, spine, halfWidth, facing);
      setOpacity(current.body, fade);
    }

    // The head, on the body's middle at the front of the spine.
    if (current.head) {
      const layout = headLayout(serpent);
      const neck = spine[0];
      const at = offsetFrom(neck, halfWidth(0) * fromSpine(BODY_MIDDLE), facing);
      // The western head is held lower than its neck, as a heron's is.
      // It also turns against the body's pitch, so it keeps looking where it
      // is going, and looks about a little.
      const pitch = serpent === 'western' ? -0.3 - bodyPitch * 0.6 + Math.sin(t * 0.8 * speed) * 0.07 : 0;
      // A western head drawn only as deep as its neck came out small for the
      // body behind it; a dragon's skull is broader than its throat.
      const grow = serpent === 'western' ? 1.3 : 1;
      pin(current.head, layout, at, neck.angle + facing * pitch, facing, (thickness(0) * grow) / layout.ref);
      setOpacity(current.head, fade);
    }

    // The tail's end, on the last point.
    if (current.tail) {
      const layout = tailEndLayout(serpent);
      const tip = spine[spine.length - 1];
      const at = offsetFrom(tip, halfWidth(1) * fromSpine(BODY_MIDDLE), facing);
      const pixel = serpent === 'chinese' ? (thickness(0.8) * 1.3) / layout.ref : (long * 0.11) / layout.width;
      pin(current.tail, layout, at, tip.angle, facing, pixel);
      setOpacity(current.tail, fade);
    }

    for (const leg of current.legs) {
      const layout = legLayout(leg.kind);
      const root = pointAt(spine, leg.at);
      // Hung a little above the belly's edge, so the shoulder sits on the
      // flank rather than below it.
      const at = offsetFrom(root, halfWidth(leg.at) * fromSpine(0.78), facing);
      const swing =
        serpent === 'chinese'
          ? Math.sin(t * 2.4 * speed + leg.phase) * 0.28 + 0.1
          : // Hanging loose, they swing a moment after each heave of the body.
            (leg.kind === 'westernHind' ? 0.35 : -0.15) +
            Math.sin(warped - 1.5 + leg.phase * 0.25) * 0.17 +
            Math.sin(t * 1.2 * speed + leg.phase) * 0.04;
      const pixel = (thickness(leg.at) * (serpent === 'chinese' ? 0.62 : 0.64)) / layout.ref;
      pin(leg.mesh, layout, at, root.angle + facing * swing, facing, pixel);
      setOpacity(leg.mesh, fade);
    }

    if (current.wings) {
      const shoulder = pointAt(spine, 0.2);
      const at = offsetFrom(shoulder, halfWidth(0.2) * fromSpine(0.32), facing);
      const pixel = (long * 0.62) / WING.height;
      // Up and back: near vertical at the top of the stroke, swept back and
      // down past the body at the bottom, and seen at its fullest span at
      // the top, foreshortened below.
      const sweep = 0.72 - 0.7 * beat;
      const stretch = 0.84 + 0.16 * beat;
      // The hand folds back on the upstroke and spreads on the way down.
      const folding = (w: number) => Math.pow(Math.max(0, -Math.sin(w)), 1.4) * 0.75;
      fold(current.wings.near, folding(warped), folding(warped) * 0.25);
      pin(current.wings.near, WING, at, shoulder.angle + facing * sweep, facing, pixel, stretch);
      // The far wing further back and higher, raised a little less and a
      // moment later. Hung beside the near one, it sat exactly behind it and
      // the pair read as one wing.
      const lag = Math.cos(warped - 0.45);
      fold(current.wings.far, folding(warped - 0.45), folding(warped - 0.45) * 0.25);
      const farAt = offsetFrom(pointAt(spine, 0.27), halfWidth(0.27) * fromSpine(0.05), facing);
      pin(current.wings.far, WING, farAt, shoulder.angle + facing * (0.98 - 0.58 * lag), facing, pixel * 0.88, 0.84 + 0.14 * lag);
      setOpacity(current.wings.near, fade);
      setOpacity(current.wings.far, fade);
    }
  });

  return <primitive object={parts.group} />;
};

export default VFXDragons;
