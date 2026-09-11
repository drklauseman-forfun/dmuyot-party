import * as THREE from 'three';

/**
 * The pictures the realistic wings are made from, each drawn once on a canvas
 * and shared by every wing afterwards: a single feather, a patch of membrane
 * skin, and a bone.
 *
 * A canvas can afford far more detail than a shader could compute for every
 * pixel of every frame — hundreds of barbs, soft down, splits in the vane —
 * and once drawn it costs nothing to show. The wings then place copies of
 * these, which is how a real wing is built too.
 *
 * Pale and neutral on purpose: the wing tints them, so one drawing serves any
 * colour.
 */

/** mulberry32, so every visit draws the same feather. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas2d(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return [canvas, ctx];
}

function toTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

let featherCache: THREE.CanvasTexture | null = null;
let membraneCache: THREE.CanvasTexture | null = null;
let boneCache: THREE.CanvasTexture | null = null;

/**
 * One flight feather, base at the bottom and tip at the top, on a
 * transparent ground. The shaft bows slightly; the trailing vane is wider
 * than the leading one, as on a real flight feather.
 */
export function featherTexture(): THREE.CanvasTexture {
  if (featherCache) return featherCache;
  const W = 128;
  const H = 512;
  const [canvas, ctx] = canvas2d(W, H);
  const random = seededRandom(7);

  const base = H * 0.98;
  const tip = H * 0.02;
  const shaft = (t: number) => ({ x: W / 2 + Math.sin(t * Math.PI * 0.85) * W * 0.04, y: base - (base - tip) * t });
  // Width of one side of the vane at t, 0 at the base to 1 at the tip.
  const vane = (t: number, maxWidth: number) => {
    const grow = Math.min(1, Math.max(0, (t - 0.04) / 0.14));
    const taper = 1 - Math.pow(Math.max(0, (t - 0.5) / 0.5), 2.4);
    const ragged = 1 + 0.035 * Math.sin(t * 97) + 0.02 * Math.sin(t * 211);
    return maxWidth * Math.sqrt(grow) * Math.max(taper, 0) * ragged;
  };
  const leading = W * 0.27;
  const trailing = W * 0.42;

  const outline = new Path2D();
  const steps = 90;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const s = shaft(t);
    const x = s.x - vane(t, leading);
    if (i === 0) outline.moveTo(x, s.y);
    else outline.lineTo(x, s.y);
  }
  for (let i = steps; i >= 0; i--) {
    const t = i / steps;
    const s = shaft(t);
    outline.lineTo(s.x + vane(t, trailing), s.y);
  }
  outline.closePath();

  // The vane: pale, a touch greyer at the base and warmer towards the tip.
  const fill = ctx.createLinearGradient(0, base, 0, tip);
  fill.addColorStop(0, 'rgba(214, 208, 200, 0.95)');
  fill.addColorStop(0.35, 'rgba(246, 243, 237, 1)');
  fill.addColorStop(1, 'rgba(236, 231, 222, 1)');
  ctx.fillStyle = fill;
  ctx.fill(outline);

  ctx.save();
  ctx.clip(outline);
  // Barbs: fine lines sweeping from the shaft out towards the tip.
  for (let i = 0; i < 170; i++) {
    const t = 0.06 + (i / 170) * 0.93;
    const s = shaft(t);
    for (const side of [-1, 1]) {
      const reach = side < 0 ? leading : trailing;
      const x = s.x + side * reach * 1.1;
      const y = s.y - reach * 0.62;
      ctx.strokeStyle = `rgba(118, 108, 98, ${0.1 + random() * 0.14})`;
      ctx.lineWidth = 0.8 + random() * 0.5;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.quadraticCurveTo(s.x + side * reach * 0.5, s.y - reach * 0.18, x, y);
      ctx.stroke();
      if (random() < 0.5) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y - 1.5);
        ctx.quadraticCurveTo(s.x + side * reach * 0.5, s.y - reach * 0.18 - 1.5, x, y - 1.5);
        ctx.stroke();
      }
    }
  }
  // Shading towards the edges, so the vane reads as curved rather than flat.
  const across = ctx.createLinearGradient(W / 2 - trailing, 0, W / 2 + trailing, 0);
  across.addColorStop(0, 'rgba(90, 82, 74, 0.28)');
  across.addColorStop(0.45, 'rgba(90, 82, 74, 0)');
  across.addColorStop(0.55, 'rgba(90, 82, 74, 0)');
  across.addColorStop(1, 'rgba(90, 82, 74, 0.2)');
  ctx.fillStyle = across;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  // A few splits in the vane, where barbs have come apart.
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  for (let k = 0; k < 4; k++) {
    const t = 0.3 + random() * 0.55;
    const s = shaft(t);
    const side = random() < 0.6 ? 1 : -1;
    const reach = side < 0 ? leading : trailing;
    ctx.lineWidth = 1.6 + random() * 1.4;
    ctx.beginPath();
    ctx.moveTo(s.x + side * reach * 0.35, s.y - reach * 0.08);
    ctx.quadraticCurveTo(s.x + side * reach * 0.7, s.y - reach * 0.3, s.x + side * reach * 1.15, s.y - reach * 0.66);
    ctx.stroke();
  }
  ctx.restore();

  // Down at the base: loose, soft strands spilling past the vane.
  for (let i = 0; i < 120; i++) {
    const t = random() * 0.16;
    const s = shaft(t);
    const side = random() < 0.5 ? -1 : 1;
    const len = W * (0.1 + random() * 0.3);
    ctx.strokeStyle = `rgba(240, 235, 228, ${0.08 + random() * 0.18})`;
    ctx.lineWidth = 0.6 + random() * 0.8;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.bezierCurveTo(
      s.x + side * len * 0.4, s.y - len * (0.1 + random() * 0.3),
      s.x + side * len * 0.8, s.y + len * (random() - 0.5) * 0.4,
      s.x + side * len, s.y - len * random() * 0.5,
    );
    ctx.stroke();
  }

  // The shaft, thick at the base and fine at the tip, lit along one side.
  for (let i = 0; i < 60; i++) {
    const t0 = i / 60;
    const t1 = (i + 1) / 60;
    const a = shaft(t0);
    const b = shaft(t1);
    const width = 3.4 * (1 - t0) + 0.6;
    ctx.strokeStyle = 'rgba(150, 138, 122, 0.55)';
    ctx.lineWidth = width + 1;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(250, 246, 238, 0.95)';
    ctx.lineWidth = width * 0.55;
    ctx.beginPath();
    ctx.moveTo(a.x - width * 0.15, a.y);
    ctx.lineTo(b.x - width * 0.15, b.y);
    ctx.stroke();
  }

  featherCache = toTexture(canvas);
  return featherCache;
}

/**
 * Membrane skin: dark and leathery, lighter where it stretches thin, with
 * veins branching through it and fine wrinkles. It tiles no further than the
 * wing it is stretched over, so none of it needs to repeat.
 */
export function membraneTexture(): THREE.CanvasTexture {
  if (membraneCache) return membraneCache;
  const S = 512;
  const [canvas, ctx] = canvas2d(S, S);
  const random = seededRandom(11);

  const skin = ctx.createRadialGradient(S * 0.35, S * 0.55, S * 0.05, S * 0.45, S * 0.5, S * 0.75);
  skin.addColorStop(0, 'rgb(112, 92, 86)');
  skin.addColorStop(0.55, 'rgb(74, 60, 56)');
  skin.addColorStop(1, 'rgb(44, 36, 34)');
  ctx.fillStyle = skin;
  ctx.fillRect(0, 0, S, S);

  // Mottling.
  for (let i = 0; i < 900; i++) {
    const shade = random() < 0.5 ? '20, 14, 12' : '140, 118, 110';
    ctx.fillStyle = `rgba(${shade}, ${0.03 + random() * 0.05})`;
    ctx.beginPath();
    ctx.ellipse(random() * S, random() * S, 2 + random() * 10, 1 + random() * 6, random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  // Veins, branching outwards from the lower left, where the wrist maps.
  const vein = (x: number, y: number, angle: number, length: number, width: number, depth: number) => {
    let px = x;
    let py = y;
    let a = angle;
    const segments = 14;
    ctx.lineCap = 'round';
    for (let s = 0; s < segments; s++) {
      a += (random() - 0.5) * 0.35;
      const nx = px + Math.cos(a) * (length / segments);
      const ny = py + Math.sin(a) * (length / segments);
      const w = width * (1 - s / segments) + 0.4;
      ctx.strokeStyle = `rgba(28, 16, 16, ${0.35 * (1 - s / segments) + 0.1})`;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(nx, ny);
      ctx.stroke();
      ctx.strokeStyle = `rgba(150, 110, 100, ${0.12 * (1 - s / segments)})`;
      ctx.lineWidth = w * 0.4;
      ctx.beginPath();
      ctx.moveTo(px - 0.6, py - 0.6);
      ctx.lineTo(nx - 0.6, ny - 0.6);
      ctx.stroke();
      if (depth > 0 && random() < 0.22) {
        vein(nx, ny, a + (random() < 0.5 ? -1 : 1) * (0.5 + random() * 0.6), length * 0.45, w * 0.7, depth - 1);
      }
      px = nx;
      py = ny;
    }
  };
  for (let i = 0; i < 9; i++) {
    vein(S * 0.12, S * 0.82, -1.35 + (i / 8) * 1.45, S * (0.7 + random() * 0.25), 3.2, 2);
  }

  // Wrinkles running round, across the veins.
  for (let i = 0; i < 70; i++) {
    const r = S * (0.2 + random() * 0.8);
    const start = -1.4 + random() * 1.2;
    ctx.strokeStyle = `rgba(22, 16, 14, ${0.06 + random() * 0.08})`;
    ctx.lineWidth = 0.8 + random();
    ctx.beginPath();
    ctx.arc(S * 0.12, S * 0.82, r, start, start + 0.08 + random() * 0.2);
    ctx.stroke();
  }

  membraneCache = toTexture(canvas);
  return membraneCache;
}

/** A bone: a rounded rod, lit down its middle, on a transparent ground. */
export function boneTexture(): THREE.CanvasTexture {
  if (boneCache) return boneCache;
  const W = 32;
  const H = 256;
  const [canvas, ctx] = canvas2d(W, H);
  const across = ctx.createLinearGradient(0, 0, W, 0);
  across.addColorStop(0, 'rgb(26, 20, 18)');
  across.addColorStop(0.42, 'rgb(104, 88, 80)');
  across.addColorStop(0.58, 'rgb(84, 70, 64)');
  across.addColorStop(1, 'rgb(22, 17, 15)');
  ctx.fillStyle = across;
  const r = W / 2;
  ctx.beginPath();
  ctx.moveTo(0, r);
  ctx.arc(r, r, r, Math.PI, 0);
  ctx.lineTo(W, H - r);
  ctx.arc(r, H - r, r, 0, Math.PI);
  ctx.closePath();
  ctx.fill();
  boneCache = toTexture(canvas);
  return boneCache;
}
