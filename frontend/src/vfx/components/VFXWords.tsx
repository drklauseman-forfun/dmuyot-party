import React, { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { WordsParams } from '../types';
import { popOut, useFadeClock } from './fadeClock';
import { scatter, seededRandom, shuffle, turnedBox } from './scatter';

/**
 * Words popping up one after another at random spots around the frame, in the
 * heavy outlined lettering of a meme caption, each at its own tilt, wobbling a
 * little until the effect fades.
 *
 * Each word is lettered once on a canvas — that is what gets the outline, any
 * language and any font the phone has — and shown on a flat quad. Solid, so it
 * is drawn after the bloom: white letters sent through it would glow.
 */

const FONT_PX = 128;
/**
 * The meme-caption face where there is one. Impact has no Hebrew letters, so
 * Hebrew falls through to the phone's own heaviest font, as it would anywhere.
 */
const FONT = `900 ${FONT_PX}px Impact, 'Arial Black', 'Segoe UI Black', 'Helvetica Neue', system-ui, sans-serif`;
/** The outline, each side of the letter's edge, as a share of the font size. */
const EDGE = 0.12;
/** Seconds a word takes to pop in. */
const POP = 0.35;

interface Lettering {
  texture: THREE.CanvasTexture;
  /** Width over height of the lettered canvas. */
  aspect: number;
  /** Canvas height over font size: the room the outline and accents need. */
  tallness: number;
}

function letter(word: string, color: string, outline: string): Lettering {
  const edge = FONT_PX * EDGE;
  const canvas = document.createElement('canvas');
  const measure = canvas.getContext('2d');
  if (measure) measure.font = FONT;
  const textWidth = measure ? measure.measureText(word).width : word.length * FONT_PX * 0.6;
  canvas.width = Math.max(1, Math.ceil(textWidth + edge * 2 + FONT_PX * 0.1));
  canvas.height = Math.ceil(FONT_PX * 1.3 + edge * 2);

  // Resizing the canvas reset its state, so the font is set again.
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.font = FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = edge * 2;
    ctx.strokeStyle = outline;
    ctx.strokeText(word, canvas.width / 2, canvas.height / 2);
    ctx.fillStyle = color;
    ctx.fillText(word, canvas.width / 2, canvas.height / 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  // Drawn in screen colours; saying so makes three.js hand them back unchanged.
  texture.colorSpace = THREE.SRGBColorSpace;
  return { texture, aspect: canvas.width / canvas.height, tallness: canvas.height / FONT_PX };
}

interface VFXWordsProps extends WordsParams {
  active?: boolean;
  /** Varies where the words land between runs. See VFXSparkles. */
  seed?: number;
}

const DEFAULT_WORDS = ['WOW', 'OMG'];
const DEFAULT_COLORS = ['#ffffff'];

const VFXWords: React.FC<VFXWordsProps> = ({
  words = DEFAULT_WORDS,
  count = 12,
  colors = DEFAULT_COLORS,
  outlineColor = '#000000',
  size = 0.07,
  tilt = 20,
  intensity = 1,
  fadeInDuration = 1,
  duration = 3,
  fadeDuration = 2,
  active = true,
  seed = 1,
}) => {
  const clock = useFadeClock(active, fadeInDuration, duration, fadeDuration);
  const frame = useThree((state) => state.size);
  // Joined, so a new array holding the same words does not redraw them.
  const wordList = words.filter((word) => word.trim() !== '').join('\n') || DEFAULT_WORDS.join('\n');
  const colorList = (colors.length > 0 ? colors : DEFAULT_COLORS).join('\n');

  // What each word shown says, its colour and tilt, and when it pops in.
  const shown = useMemo(() => {
    const random = seededRandom(seed * 7919 + 17);
    const pool = wordList.split('\n');
    const palette = colorList.split('\n');
    const n = Math.max(0, Math.round(count));
    // Taking turns keeps every word about as common; the shuffle stops them
    // arriving in a strict alternation.
    const items = shuffle(
      Array.from({ length: n }, (_, i) => ({
        word: pool[i % pool.length],
        color: palette[Math.floor(random() * palette.length)],
        angle: (random() * 2 - 1) * ((tilt * Math.PI) / 180),
        phase: random() * Math.PI * 2,
      })),
      random,
    );
    // Spread over the fade in and most of the hold, so the screen fills up.
    const appear = Math.max(fadeInDuration, 0.2) + duration * 0.6;
    return items.map((item, k) => ({ ...item, start: ((k + 0.15 + random() * 0.7) / Math.max(n, 1)) * appear }));
  }, [wordList, colorList, count, tilt, seed, fadeInDuration, duration]);

  const letterings = useMemo(() => {
    const map = new Map<string, Lettering>();
    for (const { word, color } of shown) {
      const key = `${word}\n${color}`;
      if (!map.has(key)) map.set(key, letter(word, color, outlineColor));
    }
    return map;
  }, [shown, outlineColor]);
  useEffect(() => () => letterings.forEach(({ texture }) => texture.dispose()), [letterings]);

  // Where each lands, in pixels, from the frame's actual size.
  const layout = useMemo(() => {
    const random = seededRandom(seed * 104723 + 5);
    const shorter = Math.min(frame.width, frame.height);
    const boxes = shown.map((item) => {
      const lettering = letterings.get(`${item.word}\n${item.color}`)!;
      let height = size * shorter * lettering.tallness;
      let width = height * lettering.aspect;
      // A long word at a large size is shrunk to fit across the frame.
      const widest = frame.width * 0.9;
      if (width > widest) {
        height *= widest / width;
        width = widest;
      }
      return { width, height };
    });
    const spots = scatter(
      boxes.map((box, i) => turnedBox(box, shown[i].angle)),
      frame,
      random,
    );
    return shown.map((item, i) => ({ ...item, ...boxes[i], spot: spots[i] }));
  }, [shown, letterings, frame, size, seed]);

  const geometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const group = useMemo(() => {
    const g = new THREE.Group();
    for (const item of layout) {
      const material = new THREE.MeshBasicMaterial({
        map: letterings.get(`${item.word}\n${item.color}`)!.texture,
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
        // The canvas turns on tone mapping, which would dull the colours picked.
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.visible = false;
      mesh.renderOrder = 3;
      mesh.frustumCulled = false;
      g.add(mesh);
    }
    return g;
  }, [layout, letterings, geometry]);
  useEffect(
    () => () => group.children.forEach((child) => ((child as THREE.Mesh).material as THREE.Material).dispose()),
    [group],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((state, delta) => {
    clock.tick(delta);
    const t = clock.elapsed.current;
    const fade = Math.min(1, clock.strength.current.value * 1.6) * intensity;
    // World units per pixel, the same across and up.
    const unit = state.viewport.width / state.size.width;
    layout.forEach((item, i) => {
      const mesh = group.children[i] as THREE.Mesh;
      const since = (t - item.start) / POP;
      if (!item.spot || since <= 0) {
        mesh.visible = false;
        return;
      }
      const pop = popOut(since);
      mesh.visible = true;
      mesh.position.set(
        (item.spot.x - state.size.width / 2) * unit,
        (item.spot.y - state.size.height / 2) * unit,
        0,
      );
      const size = unit * pop * item.spot.scale;
      mesh.scale.set(item.width * size, item.height * size, 1);
      mesh.rotation.z = item.angle + Math.sin(t * 2.2 + item.phase) * 0.04;
      (mesh.material as THREE.MeshBasicMaterial).opacity = fade * Math.min(1, since * 3);
    });
  });

  return <primitive object={group} />;
};

export default VFXWords;
