import * as THREE from 'three';
import {
  canvas2d,
  css,
  darken,
  ellipse,
  eye,
  grain,
  lighten,
  mix,
  occlude,
  rim,
  scale,
  scaleField,
  seeded,
  shadeForm,
  smoothPath,
  strand,
  taperedPath,
  vary,
} from './paint';
import type { Point, RGB } from './paint';

/**
 * The dragons' pictures, painted once each on a canvas and cached.
 *
 * The first set were flat shapes in flat colours and read as cartoons. What
 * makes a painted creature read as solid is almost all light: every scale
 * domed and lit on its own, scales foreshortened towards the top and bottom
 * of a body the way they are on a cylinder, a shading pass over each form,
 * darkness where one form tucks under another, a thin rim where light
 * catches an edge, and grain so nothing is airbrushed. Hair — manes, beards,
 * whiskers — is hundreds of strands, never a shape.
 *
 * The two travelling dragons are not one picture each. Their bodies are a
 * band of scales laid along a moving spine (see spine.ts), with the head,
 * the legs, the tail's end and the wings as separate pictures pinned to
 * points on it. Each of those comes with a layout saying where on the
 * picture it is pinned, and how many of its pixels match the body's
 * thickness there, so the component can put it at the right size.
 *
 * Everything stays inside its canvas. Nothing reports a clipped edge, and a
 * horn or a claw that runs off one is simply gone.
 */

export type DragonKind = 'chinese' | 'face' | 'western';
export type Serpent = 'chinese' | 'western';

/** Where a picture is pinned, and how big it is drawn. */
export interface Layout {
  width: number;
  height: number;
  /** The pixel that sits on the spine point it is pinned to. */
  anchor: Point;
  /** How many of its pixels match one body thickness at that point. */
  ref: number;
}

function toTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  // Painted in screen colours, and said to be: the unlit layer converts nothing.
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.needsUpdate = true;
  return texture;
}

const cache = new Map<string, THREE.CanvasTexture>();

function cached(key: string, draw: () => HTMLCanvasElement): THREE.CanvasTexture {
  const found = cache.get(key);
  if (found) return found;
  const texture = toTexture(draw());
  cache.set(key, texture);
  return texture;
}

interface Palette {
  hide: RGB;
  back: RGB;
  belly: RGB;
  crest: RGB;
  crestDark: RGB;
  hairDark: RGB;
  hairLight: RGB;
  horn: RGB;
  hornBase: RGB;
  claw: RGB;
  mouth: RGB;
  iris: RGB;
  membrane: RGB;
}

const PALETTES: Record<Serpent | 'face', Palette> = {
  // Imperial red with a gold belly, a gold crest, and a mane going from
  // oxblood to gold.
  chinese: {
    hide: [168, 34, 24],
    back: [104, 16, 12],
    belly: [226, 176, 96],
    crest: [238, 158, 48],
    crestDark: [150, 64, 18],
    hairDark: [112, 22, 14],
    hairLight: [246, 194, 82],
    horn: [236, 220, 184],
    hornBase: [128, 98, 70],
    claw: [40, 30, 24],
    mouth: [96, 18, 20],
    iris: [255, 196, 60],
    membrane: [0, 0, 0],
  },
  // Slate green, a tan belly, horn and bone, leathery wings.
  western: {
    hide: [66, 86, 64],
    back: [36, 48, 38],
    belly: [178, 156, 108],
    crest: [196, 184, 150],
    crestDark: [92, 84, 64],
    hairDark: [0, 0, 0],
    hairLight: [0, 0, 0],
    horn: [226, 214, 182],
    hornBase: [86, 70, 52],
    claw: [34, 28, 22],
    mouth: [70, 16, 16],
    iris: [255, 176, 44],
    membrane: [112, 82, 62],
  },
  face: {
    hide: [56, 74, 60],
    back: [26, 36, 30],
    belly: [104, 112, 88],
    crest: [196, 184, 150],
    crestDark: [92, 84, 64],
    hairDark: [0, 0, 0],
    hairLight: [0, 0, 0],
    horn: [232, 222, 194],
    hornBase: [70, 56, 42],
    claw: [36, 30, 24],
    mouth: [40, 10, 10],
    iris: [255, 140, 26],
    membrane: [0, 0, 0],
  },
};

/* ------------------------------------------------------------------ bodies */

/**
 * How thick a body is along its length, from the head (0) to the tail tip
 * (1), as a fraction of its thickest point. The Chinese dragon is a snake
 * with a lion's head: one thickness for most of its length, thinning only
 * towards the tail — a body that tapered all the way read as a newt. The
 * western one has a slim neck, a deep chest and haunches, and a long tail.
 */
export function profile(kind: Serpent, fromHead: number): number {
  const s = Math.min(1, Math.max(0, fromHead));
  if (kind === 'chinese') {
    if (s < 0.45) return 1 - 0.12 * (s / 0.45);
    return 0.88 - 0.72 * Math.pow((s - 0.45) / 0.55, 1.25);
  }
  const keys: [number, number][] = [
    [0, 0.64],
    [0.1, 0.7],
    [0.22, 1],
    [0.32, 0.96],
    [0.42, 0.76],
    [0.6, 0.42],
    [0.8, 0.2],
    [1, 0.07],
  ];
  for (let i = 1; i < keys.length; i++) {
    if (s <= keys[i][0]) {
      const [s0, w0] = keys[i - 1];
      const [s1, w1] = keys[i];
      const t = (s - s0) / (s1 - s0);
      return w0 + (w1 - w0) * (0.5 - Math.cos(Math.PI * t) / 2);
    }
  }
  return keys[keys.length - 1][1];
}

const BAND_W = 3072;
const BAND_H = 384;
/**
 * Where the body sits in its band, top to bottom, as fractions of the band's
 * height. Above it is room for the crest. The ribbon spans the whole band, so
 * the spine runs through the middle of the band rather than of the body.
 */
export const BAND = { top: 0.21, bottom: 0.94 };

/** A Chinese dragon's crest: fin rays leaning back, with membrane between. */
function finCrest(ctx: CanvasRenderingContext2D, top: number, thickness: (x: number) => number, p: Palette, random: () => number): void {
  const tips: Point[] = [];
  const roots: number[] = [];
  let x = 6;
  while (x < BAND_W - 6) {
    const w = thickness(x);
    const tall = top * (0.55 + 0.4 * Math.sqrt(w)) * (0.85 + random() * 0.3);
    tips.push({ x: x - tall * 0.55, y: Math.max(4, top - tall) });
    roots.push(x);
    x += 54 * w + 10;
  }
  const membrane = new Path2D();
  membrane.moveTo(roots[0], top + 4);
  for (let i = 0; i < tips.length; i++) {
    membrane.lineTo(tips[i].x, tips[i].y);
    const next = i + 1 < tips.length ? tips[i + 1] : { x: roots[i] + 40, y: top };
    // Each panel dips between its rays.
    membrane.quadraticCurveTo((tips[i].x + next.x) / 2 + 6, (tips[i].y + next.y) / 2 + top * 0.32, next.x, next.y);
  }
  membrane.lineTo(BAND_W, top + 4);
  membrane.closePath();
  const fill = ctx.createLinearGradient(0, 0, 0, top + 4);
  fill.addColorStop(0, css(lighten(p.crest, 0.15), 0.92));
  fill.addColorStop(1, css(p.crestDark, 0.95));
  ctx.fillStyle = fill;
  ctx.fill(membrane);
  for (let i = 0; i < tips.length; i++) {
    const r = { x: roots[i], y: top + 6 };
    const ray = taperedPath(r, { x: r.x - 6, y: (r.y + tips[i].y) / 2 }, { x: tips[i].x + 8, y: tips[i].y + 8 }, tips[i], 7, 1.5);
    ctx.fillStyle = css(darken(p.crestDark, 0.25));
    ctx.fill(ray);
  }
  rim(ctx, membrane, css(lighten(p.crest, 0.5), 0.35), 3);
}

/** A western dragon's crest: bony plates leaning back. */
function bonyCrest(ctx: CanvasRenderingContext2D, top: number, thickness: (x: number) => number, p: Palette, random: () => number): void {
  let x = 8;
  while (x < BAND_W - 8) {
    const w = thickness(x);
    const tall = top * (0.35 + 0.6 * w) * (0.85 + random() * 0.25);
    const half = 16 * w + 6;
    const plate = new Path2D();
    plate.moveTo(x + half, top + 8);
    plate.quadraticCurveTo(x + half * 0.2, top - tall * 0.35, x - half * 0.9, top - tall);
    plate.quadraticCurveTo(x - half * 0.6, top - tall * 0.3, x - half, top + 8);
    plate.closePath();
    const light = ctx.createLinearGradient(x - half, top - tall, x + half, top);
    light.addColorStop(0, css(lighten(p.crest, 0.2)));
    light.addColorStop(1, css(p.crestDark));
    ctx.fillStyle = light;
    ctx.fill(plate);
    ctx.strokeStyle = css(darken(p.crestDark, 0.5), 0.6);
    ctx.lineWidth = 1.5;
    ctx.stroke(plate);
    x += half * 2.6;
  }
}

/**
 * The body as a band of scales, its full length laid out straight — the
 * spine bends it. Head at the right, tail at the left. Scales and belly
 * plates get narrower towards the tail as the body does, so they keep their
 * shape once the ribbon tapers.
 */
function bandCanvas(kind: Serpent): HTMLCanvasElement {
  const p = PALETTES[kind];
  const [canvas, ctx] = canvas2d(BAND_W, BAND_H);
  const random = seeded(kind === 'chinese' ? 11 : 23);
  const top = BAND_H * BAND.top;
  const bottom = BAND_H * BAND.bottom;
  const cy = (top + bottom) / 2;
  const radius = (bottom - top) / 2;
  const thickness = (x: number) => Math.max(0.22, profile(kind, 1 - x / BAND_W));

  if (kind === 'chinese') finCrest(ctx, top, thickness, p, random);
  else bonyCrest(ctx, top, thickness, p, random);

  const body = new Path2D();
  body.rect(0, top, BAND_W, bottom - top);
  ctx.fillStyle = css(p.hide);
  ctx.fill(body);

  ctx.save();
  ctx.clip(body);

  // The flank, row by row from the belly up. Rows are spaced by latitude
  // round the body, so near the back and the belly — where the body turns
  // away — they come closer together and the scales flatten, as they do on
  // anything round.
  const bellyLatitude = -0.36;
  for (let latitude = bellyLatitude; latitude <= 1.42; latitude += 0.165) {
    const y = cy - radius * Math.sin(latitude);
    const rowHeight = Math.max(3, radius * 0.165 * Math.cos(latitude) * 1.55);
    const shade = mix(p.hide, p.back, Math.max(0, Math.sin(latitude)) * 0.55);
    const stagger = Math.round(latitude / 0.165) % 2 === 0 ? 0 : 0.5;
    let x = -20 + stagger * 30;
    while (x < BAND_W + 30) {
      const step = 30 * thickness(x);
      scale(ctx, x, y, step * 1.55, rowHeight, Math.PI, vary(shade, 0.1, random));
      x += step;
    }
  }

  // Belly plates: narrow bands across the underside, overlapping tailwards.
  const bellyTop = cy - radius * Math.sin(bellyLatitude);
  let x = -10;
  while (x < BAND_W + 10) {
    const step = 26 * thickness(x);
    const plate = new Path2D();
    plate.roundRect(x - step * 1.1, bellyTop - 4, step * 1.15, bottom - bellyTop + 8, step * 0.4);
    const tone = vary(p.belly, 0.07, random);
    const light = ctx.createLinearGradient(0, bellyTop, 0, bottom);
    light.addColorStop(0, css(lighten(tone, 0.2)));
    light.addColorStop(0.6, css(tone));
    light.addColorStop(1, css(darken(tone, 0.45)));
    ctx.fillStyle = light;
    ctx.fill(plate);
    ctx.strokeStyle = css(darken(tone, 0.6), 0.65);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x - step * 1.1, bellyTop);
    ctx.lineTo(x - step * 1.1, bottom);
    ctx.stroke();
    x += step;
  }

  // The round of the body: lit high on the flank from the upper left, a core
  // shadow below the middle, and a little light bounced back up onto the
  // belly's edge.
  ctx.globalCompositeOperation = 'source-atop';
  const round = ctx.createLinearGradient(0, top, 0, bottom);
  round.addColorStop(0, 'rgba(0, 0, 0, 0.45)');
  round.addColorStop(0.1, 'rgba(0, 0, 0, 0.12)');
  round.addColorStop(0.26, 'rgba(255, 236, 214, 0.2)');
  round.addColorStop(0.42, 'rgba(255, 236, 214, 0.04)');
  round.addColorStop(0.64, 'rgba(0, 0, 0, 0.22)');
  round.addColorStop(0.86, 'rgba(0, 0, 0, 0.38)');
  round.addColorStop(0.95, 'rgba(255, 214, 170, 0.08)');
  round.addColorStop(1, 'rgba(0, 0, 0, 0.5)');
  ctx.fillStyle = round;
  ctx.fillRect(0, top, BAND_W, bottom - top);

  // Glints along the lit side, where a few scales catch the light squarely.
  for (let i = 0; i < 260; i++) {
    const gx = random() * BAND_W;
    const gy = cy - radius * (0.45 + random() * 0.32);
    const w = 6 + random() * 14 * thickness(gx);
    ctx.fillStyle = `rgba(255, 240, 220, ${0.08 + random() * 0.14})`;
    ctx.fill(ellipse(gx, gy, w, w * 0.28, -0.08));
  }
  ctx.restore();

  grain(ctx, BAND_W, BAND_H, random, 0.5);
  return canvas;
}

/* ------------------------------------------------------------------- hair */

/**
 * A mane, a beard or a tail's tuft: strands from a line of roots, flowing in
 * one direction, darker ones first and lighter ones over them, so it has
 * depth rather than reading as one shape.
 */
function hair(
  ctx: CanvasRenderingContext2D,
  random: () => number,
  roots: (t: number) => Point,
  flow: (t: number, root: Point) => { dx: number; dy: number; length: number },
  count: number,
  p: Palette,
  bounds: { width: number; height: number },
  thickness = 1,
): void {
  const keep = (q: Point): Point => ({
    x: Math.min(bounds.width - 6, Math.max(6, q.x)),
    y: Math.min(bounds.height - 6, Math.max(6, q.y)),
  });
  const layers = [
    { colour: darken(p.hairDark, 0.35), width: 4.2, alpha: 0.85, share: 0.4 },
    { colour: p.hairDark, width: 3.2, alpha: 0.8, share: 0.3 },
    { colour: mix(p.hairDark, p.hairLight, 0.55), width: 2.4, alpha: 0.75, share: 0.18 },
    { colour: p.hairLight, width: 1.7, alpha: 0.7, share: 0.12 },
  ];
  for (const layer of layers) {
    const n = Math.round(count * layer.share);
    for (let i = 0; i < n; i++) {
      const t = random();
      const root = roots(t);
      const { dx, dy, length } = flow(t, root);
      const norm = Math.hypot(dx, dy) || 1;
      const ux = dx / norm;
      const uy = dy / norm;
      const sway = (random() - 0.5) * length * 0.32;
      const end = keep({ x: root.x + ux * length, y: root.y + uy * length + length * 0.12 });
      const c1 = keep({ x: root.x + ux * length * 0.33 - uy * sway, y: root.y + uy * length * 0.33 + ux * sway });
      const c2 = keep({ x: root.x + ux * length * 0.7 + uy * sway * 0.8, y: root.y + uy * length * 0.7 - ux * sway * 0.8 });
      strand(ctx, root, c1, c2, end, layer.width * thickness * (0.7 + random() * 0.6), css(vary(layer.colour, 0.12, random), layer.alpha));
    }
  }
}

/** A horn, an antler beam or a spike: tapered, ridged, lit from the upper left. */
function horn(
  ctx: CanvasRenderingContext2D,
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  w0: number,
  w1: number,
  p: Palette,
  ridges = 0,
  dim = 0,
): Path2D {
  const shape = taperedPath(p0, p1, p2, p3, w0, w1);
  const along = ctx.createLinearGradient(p0.x, p0.y, p3.x, p3.y);
  along.addColorStop(0, css(darken(p.hornBase, dim)));
  along.addColorStop(0.45, css(darken(mix(p.hornBase, p.horn, 0.6), dim)));
  along.addColorStop(1, css(darken(p.horn, dim)));
  ctx.fillStyle = along;
  ctx.fill(shape);
  if (ridges > 0) {
    ctx.save();
    ctx.clip(shape);
    ctx.strokeStyle = css(darken(p.hornBase, 0.4 + dim), 0.5);
    const dx = p3.x - p0.x;
    const dy = p3.y - p0.y;
    const length = Math.hypot(dx, dy) || 1;
    for (let i = 1; i <= ridges; i++) {
      const t = (i / (ridges + 1)) * 0.75;
      const q = { x: p0.x + dx * t, y: p0.y + dy * t };
      const w = w0 + (w1 - w0) * t;
      ctx.lineWidth = Math.max(1, w * 0.08);
      ctx.beginPath();
      ctx.moveTo(q.x - (dy / length) * w * 2, q.y + (dx / length) * w * 2);
      ctx.lineTo(q.x + (dy / length) * w * 2, q.y - (dx / length) * w * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
  const middle = { x: (p0.x + p3.x) / 2, y: (p0.y + p3.y) / 2 };
  shadeForm(ctx, shape, { x: middle.x - w0 * 0.6, y: middle.y - w0 * 0.6 }, Math.max(w0 * 2.2, Math.hypot(p3.x - p0.x, p3.y - p0.y) * 0.7), 0.3, 0.55);
  rim(ctx, shape, 'rgba(255, 248, 230, 0.25)', 2);
  return shape;
}

/** A row of teeth along an edge, pointing one way, and any fangs among them. */
function teeth(
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  count: number,
  length: number,
  down: number,
  random: () => number,
  fangs: { at: number; length: number }[] = [],
): void {
  const tooth = (t: number, long: number, wide: number) => {
    const x = from.x + (to.x - from.x) * t;
    const y = from.y + (to.y - from.y) * t;
    const shape = new Path2D();
    shape.moveTo(x - wide, y);
    shape.quadraticCurveTo(x - wide * 0.4, y + long * 0.6 * down, x + wide * 0.15, y + long * down);
    shape.quadraticCurveTo(x + wide * 0.5, y + long * 0.5 * down, x + wide, y);
    shape.closePath();
    const light = ctx.createLinearGradient(x, y, x, y + long * down);
    light.addColorStop(0, 'rgb(150, 132, 100)');
    light.addColorStop(0.35, 'rgb(236, 228, 206)');
    light.addColorStop(1, 'rgb(250, 246, 234)');
    ctx.fillStyle = light;
    ctx.fill(shape);
    ctx.strokeStyle = 'rgba(60, 40, 30, 0.45)';
    ctx.lineWidth = 1.2;
    ctx.stroke(shape);
  };
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    tooth(t, length * (0.75 + random() * 0.4), length * 0.32);
  }
  for (const fang of fangs) tooth(fang.at, fang.length, fang.length * 0.2);
}

/* ------------------------------------------------------------------- heads */

const CHINESE_HEAD: Layout = { width: 1200, height: 760, anchor: { x: 300, y: 425 }, ref: 236 };
const WESTERN_HEAD: Layout = { width: 1100, height: 700, anchor: { x: 250, y: 405 }, ref: 206 };

function chineseHead(): HTMLCanvasElement {
  const { width: W, height: H } = CHINESE_HEAD;
  const [canvas, ctx] = canvas2d(W, H);
  const random = seeded(41);
  const p = PALETTES.chinese;
  const bounds = { width: W, height: H };

  // The mane, behind everything, flowing back over the neck from the crown
  // and from under the jaw.
  hair(
    ctx,
    random,
    // Round the back of the head, from the crown down to behind the jaw.
    (t) => ({ x: 560 - Math.sin(t * Math.PI * 0.5) * 300, y: 206 + t * 330 }),
    (t) => ({ dx: -1, dy: -0.25 + t * 0.85, length: 240 + random() * 200 }),
    900,
    p,
    bounds,
    1.35,
  );
  hair(
    ctx,
    random,
    (t) => ({ x: 560 - t * 220, y: 540 + t * 30 }),
    () => ({ dx: -1, dy: 0.55, length: 160 + random() * 120 }),
    260,
    p,
    bounds,
  );

  // The far antler, dimmed: it is on the other side of the head.
  horn(ctx, { x: 668, y: 236 }, { x: 640, y: 140 }, { x: 560, y: 70 }, { x: 430, y: 46 }, 34, 9, p, 3, 0.45);
  horn(ctx, { x: 600, y: 98 }, { x: 590, y: 70 }, { x: 600, y: 40 }, { x: 618, y: 18 }, 16, 4, p, 0, 0.45);

  // The neck, under the head, so the end of the body is hidden.
  const neck = smoothPath([
    { x: 210, y: 300 },
    { x: 420, y: 260 },
    { x: 560, y: 330 },
    { x: 560, y: 520 },
    { x: 400, y: 575 },
    { x: 200, y: 560 },
  ]);
  ctx.fillStyle = css(p.hide);
  ctx.fill(neck);
  scaleField(ctx, neck, { x: 180, y: 240, w: 420, h: 360 }, 26, Math.PI, p.hide, random, (_, y) => mix(p.hide, p.back, Math.max(0, (420 - y) / 200) * 0.5));

  // The lower jaw, dropped open.
  const jaw = smoothPath([
    { x: 540, y: 470 },
    { x: 700, y: 468 },
    { x: 860, y: 476 },
    { x: 1000, y: 494 },
    { x: 1068, y: 512 },
    { x: 1070, y: 552 },
    { x: 1000, y: 580 },
    { x: 860, y: 580 },
    { x: 700, y: 566 },
    { x: 560, y: 540 },
    { x: 500, y: 505 },
  ]);
  ctx.fillStyle = css(darken(p.hide, 0.1));
  ctx.fill(jaw);
  scaleField(ctx, jaw, { x: 490, y: 460, w: 600, h: 130 }, 16, Math.PI, darken(p.hide, 0.12), random);
  shadeForm(ctx, jaw, { x: 820, y: 470 }, 420, 0.18, 0.6);

  // Inside the mouth, and the tongue lolling out of it.
  const mouth = smoothPath([
    { x: 600, y: 452 },
    { x: 760, y: 440 },
    { x: 900, y: 428 },
    { x: 1060, y: 418 },
    { x: 1080, y: 470 },
    { x: 1030, y: 500 },
    { x: 880, y: 486 },
    { x: 720, y: 474 },
  ]);
  const inside = ctx.createLinearGradient(0, 420, 0, 500);
  inside.addColorStop(0, css(darken(p.mouth, 0.55)));
  inside.addColorStop(1, css(p.mouth));
  ctx.fillStyle = inside;
  ctx.fill(mouth);
  const tongue = taperedPath({ x: 720, y: 470 }, { x: 880, y: 450 }, { x: 1020, y: 500 }, { x: 1150, y: 470 }, 38, 12);
  ctx.fillStyle = 'rgb(196, 70, 80)';
  ctx.fill(tongue);
  shadeForm(ctx, tongue, { x: 900, y: 450 }, 260, 0.3, 0.5);
  teeth(ctx, { x: 700, y: 472 }, { x: 1040, y: 500 }, 9, 20, -1, random, [{ at: 0.92, length: 46 }]);

  // A frill of fin rays behind the hinge of the jaw, swept back. Drawn
  // before the skull, so only the rays' ends show past the cheek: laid over
  // it, the fan read as a glove.
  for (let i = 0; i < 6; i++) {
    const a = Math.PI * (0.86 + i * 0.07);
    const long = 150 + i * 10;
    const from = { x: 470, y: 486 };
    const tip = { x: from.x + Math.cos(a) * long, y: from.y + Math.sin(a) * long * 0.9 };
    const ray = taperedPath(from, { x: (from.x + tip.x) / 2, y: from.y }, { x: tip.x + 20, y: tip.y - 10 }, tip, 16, 2);
    const fill = ctx.createLinearGradient(from.x, from.y, tip.x, tip.y);
    fill.addColorStop(0, css(p.crestDark));
    fill.addColorStop(1, css(lighten(p.crest, 0.1)));
    ctx.fillStyle = fill;
    ctx.fill(ray);
  }

  // The skull and the long snout, curling up at the nose.
  const skull = smoothPath([
    { x: 240, y: 318 },
    { x: 330, y: 262 },
    { x: 440, y: 226 },
    { x: 540, y: 200 },
    { x: 630, y: 186 },
    { x: 710, y: 212 },
    { x: 770, y: 252 },
    { x: 870, y: 266 },
    { x: 970, y: 276 },
    { x: 1050, y: 270 },
    { x: 1112, y: 256 },
    { x: 1168, y: 300 },
    { x: 1170, y: 360 },
    { x: 1136, y: 404 },
    { x: 1060, y: 418 },
    { x: 940, y: 428 },
    { x: 800, y: 440 },
    { x: 660, y: 452 },
    { x: 560, y: 470 },
    { x: 480, y: 520 },
    { x: 380, y: 560 },
    { x: 260, y: 556 },
    { x: 210, y: 470 },
  ]);
  ctx.fillStyle = css(p.hide);
  ctx.fill(skull);
  scaleField(ctx, skull, { x: 200, y: 180, w: 980, h: 390 }, 17, Math.PI, p.hide, random, (_, y) => mix(p.hide, p.back, Math.max(0, (330 - y) / 160) * 0.45));
  // Plates down the bridge of the nose.
  for (let i = 0; i < 9; i++) {
    const x = 790 + i * 34;
    const y = 262 + Math.sin(i * 0.5) * 4;
    const plate = ellipse(x, y + 8, 22, 12, 0.08);
    ctx.fillStyle = css(vary(lighten(p.hide, 0.12), 0.08, random));
    ctx.fill(plate);
    shadeForm(ctx, plate, { x: x - 8, y: y }, 26, 0.35, 0.5);
  }
  teeth(ctx, { x: 660, y: 450 }, { x: 1110, y: 412 }, 13, 22, 1, random, [
    { at: 0.24, length: 46 },
    { at: 0.86, length: 64 },
  ]);
  shadeForm(ctx, skull, { x: 690, y: 176 }, 720, 0.34, 0.74);
  occlude(ctx, skull, 30, 0.6);

  // The nose swells at the tip, but as part of the snout: drawn as a ball of
  // its own, filled and outlined, it read as a clown's. Only light marks it.
  shadeForm(ctx, skull, { x: 1100, y: 302 }, 120, 0.2, 0);
  ctx.fillStyle = 'rgba(20, 4, 4, 0.92)';
  ctx.fill(ellipse(1126, 302, 22, 13, -0.45));
  ctx.strokeStyle = css(lighten(p.hide, 0.3), 0.55);
  ctx.lineWidth = 4;
  ctx.stroke(ellipse(1126, 300, 27, 17, -0.45));

  // A heavy brow over the eye, with spikes along it.
  const brow = smoothPath([
    { x: 520, y: 262 },
    { x: 560, y: 210 },
    { x: 640, y: 182 },
    { x: 730, y: 196 },
    { x: 784, y: 238 },
    { x: 700, y: 246 },
    { x: 620, y: 244 },
    { x: 560, y: 270 },
  ]);
  ctx.fillStyle = css(darken(p.hide, 0.12));
  ctx.fill(brow);
  scaleField(ctx, brow, { x: 510, y: 170, w: 290, h: 110 }, 15, Math.PI, darken(p.hide, 0.1), random);
  shadeForm(ctx, brow, { x: 620, y: 180 }, 170, 0.36, 0.55);
  for (const [sx, sy, long] of [
    [560, 214, 40],
    [620, 192, 52],
    [690, 192, 44],
  ] as const) {
    horn(ctx, { x: sx + 14, y: sy + 6 }, { x: sx, y: sy - long * 0.4 }, { x: sx - long * 0.5, y: sy - long * 0.8 }, { x: sx - long, y: sy - long }, 18, 2, p);
  }

  eye(ctx, 668, 284, 44, 30, -0.12, p.iris);
  // The brow's shadow falls across the top of the eye.
  ctx.save();
  ctx.clip(ellipse(668, 284, 46, 32, -0.12));
  const lid = ctx.createLinearGradient(0, 252, 0, 296);
  lid.addColorStop(0, 'rgba(0, 0, 0, 0.75)');
  lid.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = lid;
  ctx.fillRect(600, 250, 140, 60);
  ctx.restore();

  // The near antler: a branching beam swept back over the mane.
  horn(ctx, { x: 616, y: 226 }, { x: 572, y: 120 }, { x: 470, y: 58 }, { x: 330, y: 44 }, 40, 10, p, 4);
  horn(ctx, { x: 534, y: 96 }, { x: 520, y: 66 }, { x: 510, y: 36 }, { x: 494, y: 14 }, 20, 5, p, 1);
  horn(ctx, { x: 440, y: 62 }, { x: 412, y: 40 }, { x: 386, y: 28 }, { x: 356, y: 16 }, 16, 4, p);
  horn(ctx, { x: 586, y: 168 }, { x: 600, y: 120 }, { x: 612, y: 92 }, { x: 630, y: 66 }, 16, 4, p);

  // Whiskers from the upper lip, long and hanging back, and a beard.
  for (const [x0, y0, x3, y3, w] of [
    [1080, 402, 180, 600, 17],
    [1040, 414, 110, 702, 14],
  ] as const) {
    const whisker = taperedPath({ x: x0, y: y0 }, { x: x0 - 140, y: y0 + 180 }, { x: (x0 + x3) / 2 - 80, y: y3 + 20 }, { x: x3, y: y3 }, w, 2.5, 64);
    const fill = ctx.createLinearGradient(x0, y0, x3, y3);
    fill.addColorStop(0, css(p.hairLight));
    fill.addColorStop(1, css(mix(p.hairLight, p.hairDark, 0.5)));
    ctx.fillStyle = fill;
    ctx.fill(whisker);
    rim(ctx, whisker, 'rgba(255, 248, 220, 0.5)', 2);
  }
  hair(
    ctx,
    random,
    (t) => ({ x: 600 + t * 300, y: 568 + t * 8 }),
    (t) => ({ dx: -0.9 - t * 0.4, dy: 0.8, length: 90 + random() * 120 }),
    160,
    p,
    bounds,
    1.2,
  );

  // A few strands of mane falling forward over the crown, for depth.
  hair(
    ctx,
    random,
    (t) => ({ x: 520 - t * 140, y: 222 + t * 50 }),
    () => ({ dx: -1, dy: 0.25, length: 120 + random() * 110 }),
    110,
    p,
    bounds,
    0.9,
  );

  rim(ctx, skull, 'rgba(255, 200, 150, 0.22)', 4);
  grain(ctx, W, H, random, 0.5);
  return canvas;
}

function westernHead(): HTMLCanvasElement {
  const { width: W, height: H } = WESTERN_HEAD;
  const [canvas, ctx] = canvas2d(W, H);
  const random = seeded(57);
  const p = PALETTES.western;

  // The far horn, dimmed.
  horn(ctx, { x: 580, y: 214 }, { x: 500, y: 130 }, { x: 360, y: 70 }, { x: 170, y: 40 }, 46, 6, p, 5, 0.5);

  // Spikes down the back of the skull and neck, behind it.
  for (let i = 0; i < 5; i++) {
    const x = 300 + i * 52;
    const y = 290 - i * 16;
    horn(ctx, { x: x + 20, y: y + 12 }, { x: x - 10, y: y - 20 }, { x: x - 40, y: y - 40 }, { x: x - 66, y: y - 46 }, 30, 3, p, 0, 0.2);
  }

  const neck = smoothPath([
    { x: 200, y: 300 },
    { x: 380, y: 262 },
    { x: 520, y: 330 },
    { x: 520, y: 470 },
    { x: 380, y: 530 },
    { x: 200, y: 520 },
  ]);
  ctx.fillStyle = css(p.hide);
  ctx.fill(neck);
  scaleField(ctx, neck, { x: 180, y: 250, w: 360, h: 300 }, 24, Math.PI, p.hide, random, (_, y) => mix(p.hide, p.back, Math.max(0, (400 - y) / 160) * 0.5));

  // The lower jaw, a little open.
  const jaw = smoothPath([
    { x: 560, y: 420 },
    { x: 700, y: 414 },
    { x: 840, y: 404 },
    { x: 980, y: 392 },
    { x: 1030, y: 404 },
    { x: 1000, y: 432 },
    { x: 880, y: 450 },
    { x: 740, y: 462 },
    { x: 600, y: 468 },
    { x: 520, y: 450 },
  ]);
  ctx.fillStyle = css(darken(p.hide, 0.12));
  ctx.fill(jaw);
  scaleField(ctx, jaw, { x: 510, y: 380, w: 540, h: 100 }, 14, Math.PI, darken(p.hide, 0.12), random);
  // Throat plates along the underside.
  ctx.save();
  ctx.clip(jaw);
  for (let i = 0; i < 10; i++) {
    const x = 560 + i * 44;
    const y = 458 - i * 6;
    ctx.fillStyle = css(vary(p.belly, 0.06, random));
    ctx.fill(ellipse(x, y, 22, 9, -0.12));
  }
  ctx.restore();
  shadeForm(ctx, jaw, { x: 780, y: 404 }, 380, 0.16, 0.62);

  ctx.fillStyle = css(darken(p.mouth, 0.4));
  ctx.fill(
    smoothPath([
      { x: 600, y: 410 },
      { x: 800, y: 392 },
      { x: 1000, y: 368 },
      { x: 1010, y: 398 },
      { x: 820, y: 410 },
      { x: 620, y: 424 },
    ]),
  );
  teeth(ctx, { x: 640, y: 420 }, { x: 1000, y: 396 }, 10, 15, -1, random, [{ at: 0.9, length: 34 }]);

  const skull = smoothPath([
    { x: 220, y: 310 },
    { x: 330, y: 262 },
    { x: 440, y: 232 },
    { x: 540, y: 200 },
    { x: 620, y: 190 },
    { x: 700, y: 210 },
    { x: 790, y: 236 },
    { x: 890, y: 258 },
    { x: 990, y: 278 },
    { x: 1052, y: 300 },
    { x: 1060, y: 340 },
    { x: 1004, y: 360 },
    { x: 880, y: 374 },
    { x: 760, y: 388 },
    { x: 640, y: 402 },
    { x: 560, y: 418 },
    { x: 490, y: 452 },
    { x: 420, y: 494 },
    { x: 320, y: 512 },
    { x: 236, y: 500 },
    { x: 206, y: 410 },
  ]);
  ctx.fillStyle = css(p.hide);
  ctx.fill(skull);
  scaleField(ctx, skull, { x: 190, y: 180, w: 890, h: 350 }, 15, Math.PI, p.hide, random, (_, y) => mix(p.hide, p.back, Math.max(0, (320 - y) / 140) * 0.5));
  for (let i = 0; i < 7; i++) {
    const x = 800 + i * 34;
    const plate = ellipse(x, 252 + i * 5, 20, 10, 0.2);
    ctx.fillStyle = css(vary(lighten(p.hide, 0.1), 0.06, random));
    ctx.fill(plate);
    shadeForm(ctx, plate, { x: x - 8, y: 244 + i * 5 }, 24, 0.35, 0.5);
  }
  teeth(ctx, { x: 640, y: 400 }, { x: 1010, y: 356 }, 12, 17, 1, random, [
    { at: 0.28, length: 34 },
    { at: 0.9, length: 46 },
  ]);
  shadeForm(ctx, skull, { x: 640, y: 180 }, 700, 0.34, 0.76);
  occlude(ctx, skull, 28, 0.6);

  ctx.fillStyle = 'rgba(14, 6, 4, 0.92)';
  ctx.fill(ellipse(1014, 306, 17, 9, -0.3));
  ctx.strokeStyle = css(lighten(p.hide, 0.3), 0.5);
  ctx.lineWidth = 3;
  ctx.stroke(ellipse(1014, 304, 22, 13, -0.3));

  const brow = smoothPath([
    { x: 520, y: 238 },
    { x: 560, y: 194 },
    { x: 640, y: 170 },
    { x: 724, y: 186 },
    { x: 770, y: 226 },
    { x: 690, y: 226 },
    { x: 610, y: 228 },
    { x: 556, y: 250 },
  ]);
  ctx.fillStyle = css(darken(p.hide, 0.14));
  ctx.fill(brow);
  scaleField(ctx, brow, { x: 510, y: 160, w: 280, h: 100 }, 13, Math.PI, darken(p.hide, 0.14), random);
  shadeForm(ctx, brow, { x: 610, y: 168 }, 160, 0.34, 0.55);

  eye(ctx, 652, 258, 34, 22, -0.1, p.iris);
  ctx.save();
  ctx.clip(ellipse(652, 258, 36, 24, -0.1));
  const lid = ctx.createLinearGradient(0, 234, 0, 268);
  lid.addColorStop(0, 'rgba(0, 0, 0, 0.75)');
  lid.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = lid;
  ctx.fillRect(600, 230, 110, 50);
  ctx.restore();

  // Spikes at the back of the jaw, swept back.
  for (const [x, y, long] of [
    [470, 470, 110],
    [420, 494, 96],
    [370, 506, 80],
  ] as const) {
    horn(ctx, { x: x + 16, y }, { x: x - long * 0.4, y: y + 8 }, { x: x - long * 0.75, y: y + 26 }, { x: x - long, y: y + 44 }, 26, 3, p, 0, 0.1);
  }

  // The near horns: one great sweep back off the skull, and a lesser one.
  horn(ctx, { x: 530, y: 224 }, { x: 440, y: 146 }, { x: 290, y: 90 }, { x: 96, y: 70 }, 74, 8, p, 7);
  horn(ctx, { x: 480, y: 266 }, { x: 400, y: 238 }, { x: 290, y: 228 }, { x: 160, y: 214 }, 42, 5, p, 4);

  rim(ctx, skull, 'rgba(210, 236, 200, 0.2)', 4);
  grain(ctx, W, H, random, 0.5);
  return canvas;
}

/* -------------------------------------------------------------------- legs */

export type LegKind = 'chinese' | 'westernFore' | 'westernHind';

const LEGS: Record<LegKind, Layout> = {
  chinese: { width: 380, height: 560, anchor: { x: 190, y: 54 }, ref: 210 },
  westernFore: { width: 360, height: 520, anchor: { x: 180, y: 50 }, ref: 190 },
  westernHind: { width: 460, height: 600, anchor: { x: 230, y: 64 }, ref: 210 },
};

/** A clawed leg, hanging down from its shoulder, toes towards the head. */
function legCanvas(kind: LegKind): HTMLCanvasElement {
  const layout = LEGS[kind];
  const [canvas, ctx] = canvas2d(layout.width, layout.height);
  const random = seeded(kind.length * 31 + 7);
  const p = kind === 'chinese' ? PALETTES.chinese : PALETTES.western;

  const limb = (from: Point, to: Point, w0: number, w1: number, bend: number) => {
    const mid1 = { x: from.x + (to.x - from.x) * 0.33 + bend, y: from.y + (to.y - from.y) * 0.33 };
    const mid2 = { x: from.x + (to.x - from.x) * 0.66 + bend, y: from.y + (to.y - from.y) * 0.66 };
    const shape = taperedPath(from, mid1, mid2, to, w0, w1);
    ctx.fillStyle = css(p.hide);
    ctx.fill(shape);
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    scaleField(
      ctx,
      shape,
      { x: Math.min(from.x, to.x) - w0, y: Math.min(from.y, to.y) - w0, w: Math.abs(to.x - from.x) + w0 * 2, h: Math.abs(to.y - from.y) + w0 * 2 },
      13,
      angle,
      p.hide,
      random,
    );
    shadeForm(ctx, shape, { x: from.x - w0 * 0.5, y: from.y - w0 * 0.2 }, Math.hypot(to.x - from.x, to.y - from.y) * 1.1, 0.3, 0.6);
    occlude(ctx, shape, 18, 0.45);
    return shape;
  };

  const claw = (root: Point, tip: Point, w: number) => {
    const shape = taperedPath(
      root,
      { x: root.x + (tip.x - root.x) * 0.4, y: root.y + (tip.y - root.y) * 0.2 },
      { x: tip.x - (tip.x - root.x) * 0.1, y: tip.y - (tip.y - root.y) * 0.3 },
      tip,
      w,
      1.5,
    );
    const fill = ctx.createLinearGradient(root.x, root.y, tip.x, tip.y);
    fill.addColorStop(0, css(lighten(p.claw, 0.25)));
    fill.addColorStop(1, css(p.claw));
    ctx.fillStyle = fill;
    ctx.fill(shape);
    rim(ctx, shape, 'rgba(255, 240, 220, 0.35)', 1.5);
  };

  const toe = (root: Point, knuckle: Point, tip: Point, w: number) => {
    const shape = taperedPath(root, { x: (root.x + knuckle.x) / 2, y: root.y }, knuckle, knuckle, w, w * 0.7, 18);
    ctx.fillStyle = css(darken(p.hide, 0.05));
    ctx.fill(shape);
    shadeForm(ctx, shape, { x: root.x - w, y: root.y - w }, w * 4, 0.25, 0.55);
    claw(knuckle, tip, w * 0.62);
  };

  const mass = (x: number, y: number, rx: number, ry: number, tilt: number) => {
    const shape = ellipse(x, y, rx, ry, tilt);
    ctx.fillStyle = css(p.hide);
    ctx.fill(shape);
    scaleField(ctx, shape, { x: x - rx - 10, y: y - ry - 10, w: rx * 2 + 20, h: ry * 2 + 20 }, 14, Math.PI * 0.55, p.hide, random);
    shadeForm(ctx, shape, { x: x - rx * 0.45, y: y - ry * 0.5 }, Math.max(rx, ry) * 1.6, 0.32, 0.66);
  };

  if (kind === 'chinese') {
    limb({ x: 186, y: 100 }, { x: 160, y: 256 }, 118, 82, -10);
    mass(196, 96, 96, 70, 0.2);
    hair(
      ctx,
      random,
      (t) => ({ x: 150 + t * 20, y: 220 + t * 50 }),
      () => ({ dx: -1, dy: 0.65, length: 90 + random() * 60 }),
      120,
      p,
      { width: layout.width, height: layout.height },
      0.8,
    );
    limb({ x: 160, y: 244 }, { x: 214, y: 420 }, 86, 58, -10);
    toe({ x: 236, y: 418 }, { x: 300, y: 446 }, { x: 352, y: 482 }, 34);
    toe({ x: 232, y: 430 }, { x: 278, y: 488 }, { x: 304, y: 540 }, 32);
    toe({ x: 216, y: 434 }, { x: 222, y: 498 }, { x: 214, y: 548 }, 30);
    toe({ x: 196, y: 422 }, { x: 150, y: 470 }, { x: 116, y: 508 }, 26);
  } else if (kind === 'westernFore') {
    limb({ x: 178, y: 96 }, { x: 150, y: 238 }, 110, 74, -10);
    mass(184, 92, 88, 66, 0.25);
    limb({ x: 152, y: 230 }, { x: 244, y: 370 }, 76, 48, 16);
    toe({ x: 262, y: 372 }, { x: 314, y: 390 }, { x: 338, y: 432 }, 30);
    toe({ x: 254, y: 384 }, { x: 290, y: 430 }, { x: 288, y: 476 }, 28);
    toe({ x: 236, y: 384 }, { x: 236, y: 432 }, { x: 214, y: 470 }, 26);
  } else {
    // A heavy haunch, the shin folded back under it in flight.
    limb({ x: 226, y: 150 }, { x: 206, y: 276 }, 150, 110, 12);
    mass(232, 136, 124, 104, -0.2);
    limb({ x: 206, y: 262 }, { x: 128, y: 430 }, 108, 60, -18);
    toe({ x: 118, y: 438 }, { x: 72, y: 470 }, { x: 34, y: 514 }, 30);
    toe({ x: 126, y: 448 }, { x: 108, y: 506 }, { x: 80, y: 552 }, 30);
    toe({ x: 140, y: 446 }, { x: 160, y: 506 }, { x: 156, y: 560 }, 28);
    claw({ x: 150, y: 418 }, { x: 196, y: 440 }, 16);
  }

  grain(ctx, layout.width, layout.height, random, 0.5);
  return canvas;
}

/* --------------------------------------------------------------- tail ends */

const TAIL_ENDS: Record<Serpent, Layout> = {
  chinese: { width: 560, height: 360, anchor: { x: 540, y: 180 }, ref: 80 },
  western: { width: 340, height: 260, anchor: { x: 318, y: 130 }, ref: 44 },
};

function tailEndCanvas(kind: Serpent): HTMLCanvasElement {
  const layout = TAIL_ENDS[kind];
  const [canvas, ctx] = canvas2d(layout.width, layout.height);
  const random = seeded(kind === 'chinese' ? 73 : 79);
  const p = PALETTES[kind];
  const { x: ax, y: ay } = layout.anchor;

  if (kind === 'chinese') {
    // A tuft of hair fanning off the tail's tip, like a lion's.
    hair(
      ctx,
      random,
      (t) => ({ x: ax - 10, y: ay - 26 + t * 52 }),
      (t) => {
        const a = Math.PI + (t - 0.5) * 1.3;
        return { dx: Math.cos(a), dy: Math.sin(a), length: 260 + random() * 230 };
      },
      420,
      p,
      { width: layout.width, height: layout.height },
      1.1,
    );
    return canvas;
  }

  // A spade, the way a western dragon's tail is so often drawn.
  const spade = smoothPath([
    { x: ax, y: ay - 14 },
    { x: 220, y: ay - 30 },
    { x: 130, y: 30 },
    { x: 150, y: ay - 18 },
    { x: 26, y: ay },
    { x: 150, y: ay + 18 },
    { x: 130, y: 230 },
    { x: 220, y: ay + 30 },
    { x: ax, y: ay + 14 },
  ]);
  const fill = ctx.createLinearGradient(0, 40, 0, 220);
  fill.addColorStop(0, css(lighten(p.membrane, 0.2)));
  fill.addColorStop(1, css(darken(p.membrane, 0.4)));
  ctx.fillStyle = fill;
  ctx.fill(spade);
  shadeForm(ctx, spade, { x: 150, y: 90 }, 220, 0.25, 0.6);
  ctx.strokeStyle = css(darken(p.crestDark, 0.3), 0.8);
  ctx.lineWidth = 3;
  ctx.stroke(spade);
  // A bony spine down the middle of it.
  const bone = taperedPath({ x: ax, y: ay }, { x: 220, y: ay }, { x: 120, y: ay }, { x: 30, y: ay }, 18, 3);
  ctx.fillStyle = css(p.crest);
  ctx.fill(bone);
  shadeForm(ctx, bone, { x: 160, y: ay - 10 }, 160, 0.3, 0.5);
  grain(ctx, layout.width, layout.height, random, 0.5);
  return canvas;
}

/* -------------------------------------------------------------------- wing */

export const WING: Layout = { width: 1024, height: 1100, anchor: { x: 640, y: 1066 }, ref: 300 };
/** Where the wing's wrist is in its picture: the hand folds about it. */
export const WING_WRIST: Point = { x: 820, y: 232 };

/**
 * One wing, rising from a shoulder near the bottom of its picture so the
 * component can hinge it there and beat it.
 *
 * An arm runs up the leading edge to a wrist, and four long fingers fan out
 * from the wrist to the other side, with membrane between. Between each pair
 * of finger tips the trailing edge curves *in*, towards the wrist: that
 * scallop is the bat's wing. Bellied the other way, out between the tips,
 * the first ones rounded into a shell on the dragon's back.
 */
function wingCanvas(): HTMLCanvasElement {
  const { width: W, height: H } = WING;
  const [canvas, ctx] = canvas2d(W, H);
  const random = seeded(97);
  const p = PALETTES.western;
  const shoulder = { x: 640, y: 1066 };
  const elbow = { x: 794, y: 722 };
  const wrist = WING_WRIST;
  const fingers = [
    { knuckle: { x: 620, y: 128 }, tip: { x: 360, y: 36 } },
    { knuckle: { x: 520, y: 236 }, tip: { x: 104, y: 252 } },
    { knuckle: { x: 520, y: 400 }, tip: { x: 54, y: 566 } },
    { knuckle: { x: 600, y: 560 }, tip: { x: 232, y: 878 } },
  ];
  const flank = { x: 420, y: 1064 };

  const scallop = (from: Point, to: Point): Point => {
    const mx = (from.x + to.x) / 2;
    const my = (from.y + to.y) / 2;
    return { x: mx + (wrist.x - mx) * 0.24, y: my + (wrist.y - my) * 0.24 };
  };

  const membrane = new Path2D();
  membrane.moveTo(shoulder.x, shoulder.y);
  membrane.quadraticCurveTo(elbow.x + 30, elbow.y, elbow.x, elbow.y);
  membrane.quadraticCurveTo(wrist.x + 30, (elbow.y + wrist.y) / 2, wrist.x, wrist.y);
  membrane.lineTo(fingers[0].tip.x, fingers[0].tip.y);
  for (let i = 0; i < fingers.length - 1; i++) {
    const c = scallop(fingers[i].tip, fingers[i + 1].tip);
    membrane.quadraticCurveTo(c.x, c.y, fingers[i + 1].tip.x, fingers[i + 1].tip.y);
  }
  const last = scallop(fingers[fingers.length - 1].tip, flank);
  membrane.quadraticCurveTo(last.x, last.y, flank.x, flank.y);
  membrane.closePath();

  // The membrane: thick and dark near the arm and the body, thinner and
  // lighter out towards the edges, where light comes through it.
  ctx.save();
  ctx.globalAlpha = 0.94;
  const skin = ctx.createRadialGradient(wrist.x, wrist.y + 300, 60, wrist.x - 200, wrist.y + 260, 900);
  skin.addColorStop(0, css(darken(p.membrane, 0.35)));
  skin.addColorStop(0.5, css(p.membrane));
  skin.addColorStop(1, css(lighten(p.membrane, 0.22)));
  ctx.fillStyle = skin;
  ctx.fill(membrane);
  ctx.restore();

  ctx.save();
  ctx.clip(membrane);
  // Each panel billows between its fingers: lighter across the middle,
  // darker where it pulls taut along the bones and curls at its edge.
  const tips = [...fingers.map((f) => f.tip), flank];
  for (let i = 0; i < tips.length - 1; i++) {
    const a = tips[i];
    const b = tips[i + 1];
    const c = scallop(a, b);
    const centre = { x: (wrist.x + a.x + b.x) / 3, y: (wrist.y + a.y + b.y) / 3 };
    const billow = ctx.createRadialGradient(centre.x - 40, centre.y - 40, 20, centre.x, centre.y, Math.hypot(a.x - b.x, a.y - b.y) * 0.85);
    billow.addColorStop(0, 'rgba(255, 228, 200, 0.16)');
    billow.addColorStop(0.6, 'rgba(0, 0, 0, 0)');
    billow.addColorStop(1, 'rgba(0, 0, 0, 0.32)');
    ctx.fillStyle = billow;
    ctx.beginPath();
    ctx.moveTo(wrist.x, wrist.y);
    ctx.lineTo(a.x, a.y);
    ctx.quadraticCurveTo(c.x, c.y, b.x, b.y);
    ctx.closePath();
    ctx.fill();
    // Wrinkles following the trailing edge.
    ctx.strokeStyle = 'rgba(30, 18, 12, 0.14)';
    ctx.lineWidth = 2;
    for (let k = 1; k <= 4; k++) {
      const pull = 0.08 + k * 0.07;
      const from = { x: a.x + (wrist.x - a.x) * pull, y: a.y + (wrist.y - a.y) * pull };
      const to = { x: b.x + (wrist.x - b.x) * pull, y: b.y + (wrist.y - b.y) * pull };
      const mid = { x: c.x + (wrist.x - c.x) * pull, y: c.y + (wrist.y - c.y) * pull };
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.quadraticCurveTo(mid.x, mid.y, to.x, to.y);
      ctx.stroke();
    }
  }
  // Veins branching out from the bones.
  ctx.strokeStyle = 'rgba(46, 22, 18, 0.32)';
  for (const finger of fingers) {
    for (let k = 0; k < 6; k++) {
      const t = 0.2 + random() * 0.7;
      const start = { x: wrist.x + (finger.tip.x - wrist.x) * t, y: wrist.y + (finger.tip.y - wrist.y) * t };
      const a = Math.atan2(finger.tip.y - wrist.y, finger.tip.x - wrist.x) + (random() < 0.5 ? 1 : -1) * (0.5 + random() * 0.5);
      const long = 60 + random() * 120;
      ctx.lineWidth = 1 + random() * 2;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.quadraticCurveTo(start.x + Math.cos(a) * long * 0.5 + 10, start.y + Math.sin(a) * long * 0.5, start.x + Math.cos(a) * long, start.y + Math.sin(a) * long);
      ctx.stroke();
    }
  }
  ctx.restore();
  // A darker hem along the edge.
  ctx.strokeStyle = css(darken(p.membrane, 0.55), 0.8);
  ctx.lineWidth = 4;
  ctx.stroke(membrane);

  // The bones, thick at the arm and thinning out along each finger, with
  // knuckles where they bend.
  const boneColour: RGB = [192, 176, 146];
  const bone = (from: Point, to: Point, w0: number, w1: number) => {
    const shape = taperedPath(
      from,
      { x: from.x + (to.x - from.x) * 0.35, y: from.y + (to.y - from.y) * 0.35 + 6 },
      { x: from.x + (to.x - from.x) * 0.7, y: from.y + (to.y - from.y) * 0.7 + 6 },
      to,
      w0,
      w1,
    );
    ctx.fillStyle = css(boneColour);
    ctx.fill(shape);
    shadeForm(ctx, shape, { x: (from.x + to.x) / 2 - w0, y: (from.y + to.y) / 2 - w0 }, Math.hypot(to.x - from.x, to.y - from.y) * 0.6, 0.3, 0.6);
    rim(ctx, shape, 'rgba(255, 246, 226, 0.35)', 2);
  };
  const knuckle = (at: Point, r: number) => {
    const shape = ellipse(at.x, at.y, r, r * 0.85);
    ctx.fillStyle = css(boneColour);
    ctx.fill(shape);
    shadeForm(ctx, shape, { x: at.x - r * 0.4, y: at.y - r * 0.4 }, r * 1.6, 0.35, 0.6);
  };
  bone(shoulder, elbow, 70, 46);
  bone(elbow, wrist, 48, 32);
  for (let i = 0; i < fingers.length; i++) {
    const f = fingers[i];
    const w = 28 - i * 3;
    bone(wrist, f.knuckle, w, w * 0.7);
    bone(f.knuckle, f.tip, w * 0.7, 4);
    knuckle(f.knuckle, w * 0.5);
  }
  knuckle(elbow, 30);
  knuckle(wrist, 30);
  // A thumb at the wrist, ending in a hooked claw.
  bone(wrist, { x: 884, y: 176 }, 24, 14);
  const claw = taperedPath({ x: 884, y: 176 }, { x: 912, y: 150 }, { x: 930, y: 110 }, { x: 912, y: 82 }, 16, 2);
  ctx.fillStyle = css(PALETTES.western.claw);
  ctx.fill(claw);
  rim(ctx, claw, 'rgba(255, 240, 220, 0.4)', 1.5);

  grain(ctx, W, H, random, 0.45);
  return canvas;
}

/* -------------------------------------------------------------------- face */

export const FACE: Layout & { eyes: Point[] } = {
  width: 1024,
  height: 1024,
  anchor: { x: 512, y: 560 },
  ref: 1024,
  eyes: [
    { x: 362, y: 458 },
    { x: 662, y: 458 },
  ],
};

/**
 * A head looking straight out. Symmetric in shape and lit asymmetrically:
 * the key light warm from the upper left, and a cool rim along the
 * right-hand edge — the two together are most of what makes it read as lit
 * rather than coloured in. The brows slant down to the middle and overhang
 * deep sockets, and the eyes are painted burning.
 */
function faceCanvas(): HTMLCanvasElement {
  const { width: W, height: H } = FACE;
  const [canvas, ctx] = canvas2d(W, H);
  const random = seeded(131);
  const p = PALETTES.face;
  const cx = W / 2;
  /** An offset from the middle, onto one side: -1 left, 1 right. */
  const at = (side: number, dx: number, y: number): Point => ({ x: cx + side * dx, y });

  // The great horns, sweeping up and out, behind the head.
  for (const side of [-1, 1]) {
    horn(ctx, at(side, 120, 300), at(side, 150, 200), at(side, 200, 140), at(side, 236, 92), 64, 6, p, 3, 0.35);
    horn(ctx, at(side, 176, 330), at(side, 290, 250), at(side, 390, 170), at(side, 352, 22), 128, 9, p, 7, side > 0 ? 0.18 : 0);
  }

  // Spikes down the jaw on each side, behind the cheeks.
  for (const side of [-1, 1]) {
    for (const [dx, y, long, tilt] of [
      [296, 520, 130, 0.35],
      [284, 600, 124, 0.55],
      [256, 676, 112, 0.75],
      [218, 752, 96, 0.95],
    ] as const) {
      const root = at(side, dx - 30, y);
      const tip = at(side, dx + long * Math.cos(tilt), y + long * Math.sin(tilt));
      horn(ctx, root, at(side, dx + long * 0.3, y + 6), at(side, dx + long * 0.7, y + long * 0.4 * Math.sin(tilt)), tip, 40, 3, p, 0, side > 0 ? 0.35 : 0.1);
    }
  }

  const left: [number, number][] = [
    [0, 256],
    [96, 254],
    [190, 282],
    [262, 336],
    [294, 410],
    [306, 480],
    [290, 566],
    [258, 656],
    [212, 770],
    [154, 878],
    [84, 946],
    [0, 968],
  ];
  const outline: Point[] = left.map(([dx, y]) => at(-1, dx, y));
  for (let i = left.length - 2; i > 0; i--) outline.push(at(1, left[i][0], left[i][1]));
  const head = smoothPath(outline);
  ctx.fillStyle = css(p.hide);
  ctx.fill(head);
  // Scales over the whole head, flowing out and down from the middle.
  for (const side of [-1, 1]) {
    ctx.save();
    const half = new Path2D();
    half.rect(side < 0 ? 0 : cx, 0, cx, H);
    ctx.clip(half);
    scaleField(ctx, head, { x: side < 0 ? 180 : cx, y: 240, w: 340, h: 720 }, 20, side < 0 ? Math.PI * 0.62 : Math.PI * 0.38, p.hide, random, (x, y) =>
      mix(p.hide, p.back, Math.min(1, Math.abs(x - cx) / 340) * 0.35 + Math.max(0, (y - 700) / 300) * 0.3),
    );
    ctx.restore();
  }
  // Big plates across the forehead.
  for (let row = 0; row < 3; row++) {
    for (let k = -2; k <= 2; k++) {
      const x = cx + k * 58 + (row % 2) * 29 - 14;
      const y = 282 + row * 44;
      if (Math.abs(x - cx) > 170 - row * 20) continue;
      const plate = smoothPath([
        { x: x - 26, y: y - 16 },
        { x: x + 24, y: y - 18 },
        { x: x + 30, y: y + 14 },
        { x: x - 22, y: y + 18 },
      ]);
      ctx.fillStyle = css(vary(lighten(p.hide, 0.1), 0.07, random));
      ctx.fill(plate);
      shadeForm(ctx, plate, { x: x - 12, y: y - 12 }, 44, 0.35, 0.6);
    }
  }

  // The snout, coming out towards the viewer below the eyes.
  const snoutLeft: [number, number][] = [
    [0, 466],
    [110, 482],
    [152, 560],
    [164, 652],
    [152, 742],
    [118, 794],
    [58, 816],
    [0, 822],
  ];
  const snoutPoints: Point[] = snoutLeft.map(([dx, y]) => at(-1, dx, y));
  for (let i = snoutLeft.length - 2; i > 0; i--) snoutPoints.push(at(1, snoutLeft[i][0], snoutLeft[i][1]));
  const snout = smoothPath(snoutPoints);
  ctx.fillStyle = css(mix(p.hide, p.belly, 0.25));
  ctx.fill(snout);
  scaleField(ctx, snout, { x: cx - 170, y: 460, w: 340, h: 370 }, 15, Math.PI / 2, mix(p.hide, p.belly, 0.25), random);
  // Plates down the bridge of the nose — quiet, or they read as a zip.
  for (let i = 0; i < 6; i++) {
    const y = 500 + i * 42;
    const w = 44 - i * 3;
    const plate = ellipse(cx, y, w, 16, 0);
    ctx.fillStyle = css(vary(lighten(p.hide, 0.05), 0.04, random));
    ctx.fill(plate);
    shadeForm(ctx, plate, { x: cx - w * 0.5, y: y - 8 }, w * 1.4, 0.4, 0.55);
  }
  shadeForm(ctx, snout, { x: cx - 90, y: 500 }, 440, 0.3, 0.6);
  occlude(ctx, snout, 40, 0.65);

  // Nostrils, flared, near the end of the snout.
  for (const side of [-1, 1]) {
    const n = at(side, 76, 764);
    ctx.fillStyle = 'rgba(8, 4, 2, 0.95)';
    ctx.fill(ellipse(n.x, n.y, 34, 20, side * 0.45));
    ctx.strokeStyle = css(lighten(p.hide, 0.35), 0.5);
    ctx.lineWidth = 5;
    ctx.stroke(ellipse(n.x, n.y - 3, 40, 25, side * 0.45));
    const flare = taperedPath(at(side, 26, 712), at(side, 70, 708), at(side, 112, 728), at(side, 126, 756), 18, 4);
    ctx.fillStyle = css(lighten(p.hide, 0.12));
    ctx.fill(flare);
    shadeForm(ctx, flare, at(side, 40, 700), 90, 0.4, 0.5);
  }

  // The mouth: a snarl, with fangs over the lower lip.
  const mouthLeft: [number, number][] = [
    [0, 840],
    [90, 842],
    [170, 832],
    [226, 806],
    [204, 858],
    [124, 880],
    [0, 888],
  ];
  const mouthPoints: Point[] = mouthLeft.map(([dx, y]) => at(-1, dx, y));
  for (let i = mouthLeft.length - 2; i > 0; i--) mouthPoints.push(at(1, mouthLeft[i][0], mouthLeft[i][1]));
  ctx.fillStyle = css(p.mouth);
  ctx.fill(smoothPath(mouthPoints));
  for (const side of [-1, 1]) {
    teeth(ctx, at(side, 18, 838), at(side, 214, 812), 8, 22, 1, random, [{ at: 0.52, length: 96 }]);
    teeth(ctx, at(side, 30, 884), at(side, 196, 860), 6, 16, -1, random, [{ at: 0.9, length: 62 }]);
  }

  // Heavy brows, slanting down to the middle, over deep sockets.
  for (const side of [-1, 1]) {
    const socket = at(side, 150, 456);
    ctx.fillStyle = 'rgba(4, 4, 4, 0.82)';
    ctx.fill(ellipse(socket.x, socket.y, 104, 64, side * -0.3));
    const e = FACE.eyes[side < 0 ? 0 : 1];
    eye(ctx, e.x, e.y, 62, 25, side * -0.3, p.iris);
    // Down over the top of the eye, not above it: that overhang is the scowl.
    const brow = smoothPath([
      at(side, 30, 432),
      at(side, 90, 392),
      at(side, 170, 356),
      at(side, 252, 326),
      at(side, 304, 344),
      at(side, 278, 392),
      at(side, 196, 426),
      at(side, 110, 452),
      at(side, 48, 466),
    ]);
    ctx.fillStyle = css(darken(p.hide, 0.08));
    ctx.fill(brow);
    scaleField(ctx, brow, { x: side < 0 ? cx - 300 : cx + 30, y: 300, w: 280, h: 160 }, 14, side < 0 ? Math.PI : 0, darken(p.hide, 0.08), random);
    shadeForm(ctx, brow, at(side, side < 0 ? 200 : 120, 320), 240, side < 0 ? 0.42 : 0.2, 0.6);
    // The brow's shadow falling over the eye.
    ctx.save();
    ctx.clip(ellipse(socket.x, socket.y, 104, 64, side * -0.3));
    const shade = ctx.createLinearGradient(0, 400, 0, 470);
    shade.addColorStop(0, 'rgba(0, 0, 0, 0.8)');
    shade.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = shade;
    ctx.fillRect(socket.x - 110, 390, 220, 90);
    ctx.restore();
    for (const [dx, y, long] of [
      [120, 372, 54],
      [190, 344, 66],
      [256, 318, 58],
    ] as const) {
      horn(ctx, at(side, dx - 14, y + 8), at(side, dx, y - long * 0.4), at(side, dx + long * 0.3, y - long * 0.8), at(side, dx + long * 0.55, y - long), 24, 2, p, 0, side > 0 ? 0.3 : 0);
    }
  }

  // Light over the whole head: warm from the upper left...
  shadeForm(ctx, head, { x: cx - 300, y: 230 }, 1000, 0.3, 0.76);
  occlude(ctx, head, 40, 0.62);
  // ...and a cool rim catching its right-hand edge.
  ctx.save();
  const right = new Path2D();
  right.rect(cx + 120, 0, cx, H);
  ctx.clip(right);
  rim(ctx, head, 'rgba(150, 196, 255, 0.4)', 8);
  ctx.restore();

  grain(ctx, W, H, random, 0.55);
  return canvas;
}

/** A soft round glow, for the face's eyes to burn through. */
function glowCanvas(): HTMLCanvasElement {
  const [canvas, ctx] = canvas2d(128, 128);
  const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
  g.addColorStop(0, 'rgba(255, 255, 255, 1)');
  g.addColorStop(0.25, 'rgba(255, 255, 255, 0.55)');
  g.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return canvas;
}

/* ----------------------------------------------------------------- exports */

export const bandTexture = (kind: Serpent) => cached(`band-${kind}`, () => bandCanvas(kind));
export const headTexture = (kind: Serpent) => cached(`head-${kind}`, kind === 'chinese' ? chineseHead : westernHead);
export const headLayout = (kind: Serpent): Layout => (kind === 'chinese' ? CHINESE_HEAD : WESTERN_HEAD);
export const legTexture = (kind: LegKind) => cached(`leg-${kind}`, () => legCanvas(kind));
export const legLayout = (kind: LegKind): Layout => LEGS[kind];
export const tailEndTexture = (kind: Serpent) => cached(`tail-${kind}`, () => tailEndCanvas(kind));
export const tailEndLayout = (kind: Serpent): Layout => TAIL_ENDS[kind];
export const wingTexture = () => cached('wing', wingCanvas);
export const faceTexture = () => cached('face', faceCanvas);
export const glowTexture = () => cached('glow', glowCanvas);

/** Every picture, for checking them by eye one at a time. */
export const paintings = {
  band: (kind: Serpent) => bandCanvas(kind),
  head: (kind: Serpent) => (kind === 'chinese' ? chineseHead() : westernHead()),
  leg: (kind: LegKind) => legCanvas(kind),
  tail: (kind: Serpent) => tailEndCanvas(kind),
  wing: () => wingCanvas(),
  face: () => faceCanvas(),
};
