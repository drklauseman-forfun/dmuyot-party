/**
 * A small painting kit for the dragons: scales, hair, and the passes of light
 * and shadow that make a flat shape read as a solid one.
 *
 * Everything is lit from the upper left of the canvas, as every drawn effect
 * in this repository is. Shading passes are painted with `source-atop`, so
 * they land only on what is already there and never change an outline.
 */

export type RGB = readonly [number, number, number];

export interface Point {
  x: number;
  y: number;
}

/** mulberry32, so a dragon is painted the same way every time. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function canvas2d(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return [canvas, ctx];
}

export const css = (c: RGB, alpha = 1): string =>
  `rgba(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}, ${alpha})`;

export const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

export const lighten = (c: RGB, t: number): RGB => mix(c, [255, 248, 236], t);
export const darken = (c: RGB, t: number): RGB => mix(c, [6, 4, 4], t);

/** A colour nudged lighter or darker at random, so no two scales match. */
export function vary(c: RGB, amount: number, random: () => number): RGB {
  const t = (random() - 0.5) * 2 * amount;
  return t >= 0 ? lighten(c, t) : darken(c, -t);
}

/** A point on a cubic Bézier. */
export function bezier(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
}

/**
 * The outline of a cubic curve thickened from `w0` at its start to `w1` at
 * its end — a horn, a whisker, a bone, a claw. Canvas strokes cannot taper,
 * and almost nothing on a living thing is the same width all along.
 */
export function taperedPath(p0: Point, p1: Point, p2: Point, p3: Point, w0: number, w1: number, steps = 36): Path2D {
  const left: Point[] = [];
  const right: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = bezier(p0, p1, p2, p3, t);
    const q = bezier(p0, p1, p2, p3, Math.min(1, t + 0.01));
    const r = bezier(p0, p1, p2, p3, Math.max(0, t - 0.01));
    const dx = q.x - r.x;
    const dy = q.y - r.y;
    const length = Math.hypot(dx, dy) || 1;
    const w = (w0 + (w1 - w0) * t) / 2;
    left.push({ x: p.x - (dy / length) * w, y: p.y + (dx / length) * w });
    right.push({ x: p.x + (dy / length) * w, y: p.y - (dx / length) * w });
  }
  const path = new Path2D();
  path.moveTo(left[0].x, left[0].y);
  for (const p of left) path.lineTo(p.x, p.y);
  for (let i = right.length - 1; i >= 0; i--) path.lineTo(right[i].x, right[i].y);
  path.closePath();
  return path;
}

/** One hair: a thin stroke along a curve. A mane is hundreds of them. */
export function strand(
  ctx: CanvasRenderingContext2D,
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  width: number,
  color: string,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  ctx.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
  ctx.stroke();
}

/**
 * One scale, its root at (x, y) and its free edge pointing along `angle`.
 * Domed: lit towards the upper left of the canvas whatever way it points,
 * with a dark line along its free edge where it lies over the next one —
 * that line is most of what makes a field of scales read as overlapping.
 */
export function scale(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  length: number,
  width: number,
  angle: number,
  base: RGB,
): void {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const at = (along: number, across: number): Point => ({
    x: x + cos * along - sin * across,
    y: y + sin * along + cos * across,
  });
  const rootA = at(0, -width / 2);
  const rootB = at(0, width / 2);
  const tip = at(length, 0);
  const shoulderA = at(length * 0.62, -width * 0.56);
  const shoulderB = at(length * 0.62, width * 0.56);

  const shape = new Path2D();
  shape.moveTo(rootA.x, rootA.y);
  shape.quadraticCurveTo(shoulderA.x, shoulderA.y, tip.x, tip.y);
  shape.quadraticCurveTo(shoulderB.x, shoulderB.y, rootB.x, rootB.y);
  shape.closePath();

  const middle = at(length * 0.5, 0);
  const size = Math.max(length, width);
  const light = ctx.createRadialGradient(
    middle.x - size * 0.28,
    middle.y - size * 0.3,
    size * 0.05,
    middle.x,
    middle.y,
    size * 0.75,
  );
  light.addColorStop(0, css(lighten(base, 0.32)));
  light.addColorStop(0.55, css(base));
  light.addColorStop(1, css(darken(base, 0.42)));
  ctx.fillStyle = light;
  ctx.fill(shape);

  // The free edge, darkened where it overhangs the scale behind it.
  ctx.strokeStyle = css(darken(base, 0.62), 0.75);
  ctx.lineWidth = Math.max(0.8, size * 0.07);
  ctx.beginPath();
  ctx.moveTo(shoulderA.x, shoulderA.y);
  ctx.quadraticCurveTo(tip.x + (shoulderA.x - tip.x) * 0.1, tip.y + (shoulderA.y - tip.y) * 0.1, tip.x, tip.y);
  ctx.quadraticCurveTo(shoulderB.x, shoulderB.y, rootB.x, rootB.y);
  ctx.stroke();
}

/**
 * Covers a region with scales flowing along `angle`, in a staggered grid.
 * Drawn from the tail end towards the head end, because a scale nearer the
 * head lies over the root of the one behind it.
 */
export function scaleField(
  ctx: CanvasRenderingContext2D,
  outline: Path2D,
  box: { x: number; y: number; w: number; h: number },
  step: number,
  angle: number,
  base: RGB,
  random: () => number,
  tone?: (x: number, y: number) => RGB,
): void {
  ctx.save();
  ctx.clip(outline);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const reach = Math.hypot(box.w, box.h) / 2 + step * 2;
  const cells: { x: number; y: number; along: number }[] = [];
  for (let row = -reach; row <= reach; row += step * 0.62) {
    const stagger = Math.round(row / (step * 0.62)) % 2 === 0 ? 0 : step / 2;
    for (let along = -reach; along <= reach; along += step) {
      const a = along + stagger;
      const x = cx + cos * a - sin * row;
      const y = cy + sin * a + cos * row;
      if (x < box.x - step || x > box.x + box.w + step || y < box.y - step || y > box.y + box.h + step) continue;
      cells.push({ x, y, along: a });
    }
  }
  // Furthest along the flow — the tail end — first.
  cells.sort((p, q) => q.along - p.along);
  for (const cell of cells) {
    const colour = vary(tone ? tone(cell.x, cell.y) : base, 0.09, random);
    scale(ctx, cell.x, cell.y, step * 1.35, step * 0.95, angle, colour);
  }
  ctx.restore();
}

/**
 * Light and shadow over a form: within its outline, lifted towards one point
 * and sunk away from it. Painted over what is there, never changing it.
 */
export function shadeForm(
  ctx: CanvasRenderingContext2D,
  outline: Path2D,
  light: Point,
  radius: number,
  lift = 0.28,
  sink = 0.5,
): void {
  ctx.save();
  ctx.clip(outline);
  ctx.globalCompositeOperation = 'source-atop';
  const gradient = ctx.createRadialGradient(light.x, light.y, radius * 0.04, light.x, light.y, radius);
  gradient.addColorStop(0, `rgba(255, 246, 230, ${lift})`);
  gradient.addColorStop(0.35, 'rgba(255, 246, 230, 0)');
  gradient.addColorStop(0.62, 'rgba(0, 0, 0, 0)');
  gradient.addColorStop(1, `rgba(0, 0, 0, ${sink})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(light.x - radius * 2, light.y - radius * 2, radius * 4, radius * 4);
  ctx.restore();
}

/**
 * Darkens just inside an outline's edge, softly — where one form tucks under
 * another and the light cannot reach.
 */
export function occlude(ctx: CanvasRenderingContext2D, outline: Path2D, blur: number, alpha: number): void {
  ctx.save();
  ctx.clip(outline);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.shadowColor = `rgba(0, 0, 0, ${alpha})`;
  ctx.shadowBlur = blur;
  ctx.strokeStyle = `rgba(0, 0, 0, ${alpha})`;
  ctx.lineWidth = blur * 0.6;
  ctx.stroke(outline);
  ctx.restore();
}

/** A thin bright line just inside an outline, where light catches the edge. */
export function rim(ctx: CanvasRenderingContext2D, outline: Path2D, color: string, width: number): void {
  ctx.save();
  ctx.clip(outline);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke(outline);
  ctx.restore();
}

/** Fine grain over everything already painted, so no surface is airbrushed. */
export function grain(ctx: CanvasRenderingContext2D, width: number, height: number, random: () => number, amount = 0.6): void {
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  const count = Math.round((width * height) / 26 * amount);
  for (let i = 0; i < count; i++) {
    const light = random() < 0.5;
    ctx.fillStyle = light ? `rgba(255, 240, 220, ${0.03 + random() * 0.05})` : `rgba(0, 0, 0, ${0.04 + random() * 0.07})`;
    const size = 1 + random() * 1.6;
    ctx.fillRect(random() * width, random() * height, size, size);
  }
  ctx.restore();
}

/** An ellipse as a path, for eyes, nostrils and joints. */
export function ellipse(x: number, y: number, rx: number, ry: number, rotation = 0): Path2D {
  const path = new Path2D();
  path.ellipse(x, y, rx, ry, rotation, 0, Math.PI * 2);
  return path;
}

/** A smooth closed outline through points, as one would draw it by hand. */
export function smoothPath(points: Point[]): Path2D {
  const path = new Path2D();
  const n = points.length;
  const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const start = mid(points[n - 1], points[0]);
  path.moveTo(start.x, start.y);
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const next = mid(p, points[(i + 1) % n]);
    path.quadraticCurveTo(p.x, p.y, next.x, next.y);
  }
  path.closePath();
  return path;
}

/**
 * A reptilian eye: socket shadow, a lit iris, a slit pupil and a glint. It is
 * painted bright because this layer is drawn after the bloom — nothing here
 * can glow, so a lit eye has to be painted as one.
 */
export function eye(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  rotation: number,
  iris: RGB,
): void {
  ctx.fillStyle = 'rgba(8, 4, 2, 0.75)';
  ctx.fill(ellipse(x, y + ry * 0.1, rx * 1.35, ry * 1.55, rotation));
  const ball = ellipse(x, y, rx, ry, rotation);
  const glow = ctx.createRadialGradient(x - rx * 0.1, y - ry * 0.05, rx * 0.04, x, y, rx);
  glow.addColorStop(0, css(lighten(iris, 0.85)));
  glow.addColorStop(0.3, css(lighten(iris, 0.35)));
  glow.addColorStop(0.75, css(iris));
  glow.addColorStop(1, css(darken(iris, 0.7)));
  ctx.fillStyle = glow;
  ctx.fill(ball);
  // Fine radial streaks in the iris.
  ctx.save();
  ctx.clip(ball);
  ctx.strokeStyle = css(darken(iris, 0.45), 0.35);
  ctx.lineWidth = Math.max(1, rx * 0.025);
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * rx * 0.18, y + Math.sin(a) * ry * 0.18);
    ctx.lineTo(x + Math.cos(a) * rx, y + Math.sin(a) * ry);
    ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = 'rgb(10, 6, 4)';
  ctx.fill(ellipse(x, y, Math.max(1.5, rx * 0.13), ry * 0.86, rotation));
  ctx.fillStyle = 'rgba(255, 252, 240, 0.9)';
  ctx.fill(ellipse(x - rx * 0.32, y - ry * 0.35, rx * 0.13, ry * 0.12, rotation));
  // The lids: a dark line round it, heavier along the top.
  ctx.strokeStyle = 'rgba(14, 8, 6, 0.85)';
  ctx.lineWidth = Math.max(1.5, ry * 0.14);
  ctx.stroke(ball);
}
