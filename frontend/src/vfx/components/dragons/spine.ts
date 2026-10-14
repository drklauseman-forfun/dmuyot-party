/**
 * Where a dragon's body is, frame by frame: a spine, as points from the head
 * to the tail, and the ribbon of vertices laid along it.
 *
 * Plain arithmetic, no three.js — the same reason as wings/pose.ts — so a pose
 * can be checked without drawing it.
 *
 * Why a spine at all: the first Chinese dragon was one straight picture with
 * a wave pushed up and down through it, as the whale is. That shears the body
 * rather than bending it — every column moves straight up, so where the wave
 * is steep the body thins and its scales lean. Laid along a spine, the body
 * keeps its thickness through every curve, because each column of it is set
 * square to the spine at that point.
 */

export interface Point {
  x: number;
  y: number;
}

export interface SpinePoint extends Point {
  /** Direction of the spine here, pointing towards the head. */
  angle: number;
}

/**
 * Walks a curve by arc length. `curve(t)` traces the body from the head at
 * t = 0 onwards; it is sampled densely and resampled, so the points come out
 * evenly spaced along the curve itself rather than along t. With `length`,
 * the body is cut off at that distance from the head, which is how a body
 * keeps the same length whatever the wave in it is doing.
 */
export function walk(curve: (t: number) => Point, count: number, length?: number, samples = 480): SpinePoint[] {
  const dense: Point[] = [];
  const along: number[] = [0];
  for (let i = 0; i <= samples; i++) dense.push(curve(i / samples));
  for (let i = 1; i < dense.length; i++) {
    along.push(along[i - 1] + Math.hypot(dense[i].x - dense[i - 1].x, dense[i].y - dense[i - 1].y));
  }
  const total = length === undefined ? along[along.length - 1] : Math.min(length, along[along.length - 1]);

  const points: Point[] = [];
  let j = 1;
  for (let i = 0; i < count; i++) {
    const target = (total * i) / Math.max(1, count - 1);
    while (j < along.length - 1 && along[j] < target) j++;
    const span = along[j] - along[j - 1] || 1;
    const t = Math.min(1, Math.max(0, (target - along[j - 1]) / span));
    points.push({
      x: dense[j - 1].x + (dense[j].x - dense[j - 1].x) * t,
      y: dense[j - 1].y + (dense[j].y - dense[j - 1].y) * t,
    });
  }

  return points.map((p, i) => {
    // Towards the head: from the point behind this one to the point ahead.
    const ahead = points[Math.max(0, i - 1)];
    const behind = points[Math.min(points.length - 1, i + 1)];
    return { x: p.x, y: p.y, angle: Math.atan2(ahead.y - behind.y, ahead.x - behind.x) };
  });
}

/** A smooth curve through points, at an even rate per segment. */
export function catmullRom(points: Point[]): (t: number) => Point {
  const n = points.length;
  return (t) => {
    const scaled = Math.min(0.999999, Math.max(0, t)) * (n - 1);
    const i = Math.floor(scaled);
    const u = scaled - i;
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[Math.min(n - 1, i + 1)];
    const p3 = points[Math.min(n - 1, i + 2)];
    const u2 = u * u;
    const u3 = u2 * u;
    const blend = (a: number, b: number, c: number, d: number) =>
      0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
    return { x: blend(p0.x, p1.x, p2.x, p3.x), y: blend(p0.y, p1.y, p2.y, p3.y) };
  };
}

/** The spine at a fraction of the way from the head to the tail. */
export function pointAt(spine: SpinePoint[], fraction: number): SpinePoint {
  const at = Math.min(spine.length - 1, Math.max(0, fraction * (spine.length - 1)));
  const i = Math.floor(at);
  const next = spine[Math.min(spine.length - 1, i + 1)];
  const t = at - i;
  const a = spine[i];
  // Angles are blended along the shorter way round.
  let turn = next.angle - a.angle;
  if (turn > Math.PI) turn -= Math.PI * 2;
  if (turn < -Math.PI) turn += Math.PI * 2;
  return { x: a.x + (next.x - a.x) * t, y: a.y + (next.y - a.y) * t, angle: a.angle + turn * t };
}

/**
 * A point offset square to the spine: positive towards the dragon's back,
 * negative towards its belly, whichever way it is facing.
 */
export function offsetFrom(point: SpinePoint, distance: number, facing: number): Point {
  return {
    x: point.x - Math.sin(point.angle) * distance * facing,
    y: point.y + Math.cos(point.angle) * distance * facing,
  };
}

/**
 * The vertices of a ribbon along a spine, for a plane of `spine.length`
 * columns and two rows, as three.js lays one out: the top row first, left to
 * right, then the bottom row. The head is at the right-hand end of the
 * picture, so column `j` is spine point `count - 1 - j`. The back stays
 * uppermost whichever way the dragon faces, which is what `facing` is for:
 * without it, a dragon flying left would be flying on its back.
 */
export function ribbon(
  spine: SpinePoint[],
  halfWidth: (fromHead: number) => number,
  facing: number,
  out: Float32Array,
): void {
  const count = spine.length;
  for (let j = 0; j < count; j++) {
    const i = count - 1 - j;
    const point = spine[i];
    const w = halfWidth(i / Math.max(1, count - 1));
    const top = offsetFrom(point, w, facing);
    const bottom = offsetFrom(point, -w, facing);
    out[j * 3] = top.x;
    out[j * 3 + 1] = top.y;
    out[j * 3 + 2] = 0;
    out[(count + j) * 3] = bottom.x;
    out[(count + j) * 3 + 1] = bottom.y;
    out[(count + j) * 3 + 2] = 0;
  }
}

/** How tight the spine's tightest bend is, as a radius — for checking folds. */
export function tightestBend(spine: SpinePoint[]): number {
  let tightest = Infinity;
  for (let i = 1; i < spine.length - 1; i++) {
    let turn = spine[i - 1].angle - spine[i + 1].angle;
    if (turn > Math.PI) turn -= Math.PI * 2;
    if (turn < -Math.PI) turn += Math.PI * 2;
    const run = Math.hypot(spine[i - 1].x - spine[i + 1].x, spine[i - 1].y - spine[i + 1].y);
    if (Math.abs(turn) > 1e-6) tightest = Math.min(tightest, run / Math.abs(turn));
  }
  return tightest;
}
