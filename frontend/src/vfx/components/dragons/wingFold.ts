/**
 * How a wing folds, as plain arithmetic: a grid laid over the wing's picture,
 * each point of it belonging more or less to the hand, and the hand turning
 * about the wrist.
 *
 * The first beating wings were single pictures turned at the shoulder, and
 * read as stiff — two cards swinging. A real wing bends at the wrist: on the
 * upstroke the fingers fold back towards the body, and on the downstroke they
 * spread. Here the arm is the picture's own frame, and every point is turned
 * about the wrist by the fold times its share in the hand, so the membrane
 * between the last finger and the body stretches as it would, rather than
 * tearing at a seam.
 */

export interface Point {
  x: number;
  y: number;
}

export interface WingRig {
  /** The picture's size in pixels. */
  width: number;
  height: number;
  /** Where the wrist is in it. */
  wrist: Point;
}

const smooth = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

/**
 * How much of a point belongs to the hand, 0 to 1, by its direction from the
 * wrist. Measured in degrees clockwise from the right, as a canvas measures
 * them: the arm runs down from the wrist at about 93°, the body's edge of the
 * membrane at about 116°, the last finger at 132°, and the first finger at
 * 203°. Everything from the last finger round to the first, and on round over
 * the top of the wrist, is hand; the last panel shades from hand at its
 * finger to arm at the body; the arm is arm.
 */
export function handShare(rig: WingRig, x: number, y: number): number {
  let a = (Math.atan2(y - rig.wrist.y, x - rig.wrist.x) * 180) / Math.PI;
  if (a < 93) a += 360;
  if (a < 108) return 0;
  if (a < 132) return smooth((a - 108) / 24);
  if (a < 290) return 1;
  return 1 - smooth((a - 290) / 163);
}

/** The picture's pixel at each vertex of a `columns` by `rows` grid of cells. */
export function restGrid(rig: WingRig, columns: number, rows: number): { rest: Float32Array; share: Float32Array } {
  const count = (columns + 1) * (rows + 1);
  const rest = new Float32Array(count * 2);
  const share = new Float32Array(count);
  for (let iy = 0; iy <= rows; iy++) {
    for (let ix = 0; ix <= columns; ix++) {
      const i = iy * (columns + 1) + ix;
      const x = (ix / columns) * rig.width;
      const y = (iy / rows) * rig.height;
      rest[i * 2] = x;
      rest[i * 2 + 1] = y;
      share[i] = handShare(rig, x, y);
    }
  }
  return { rest, share };
}

/**
 * Writes the grid folded by `fold` radians — positive folds the fingers back
 * towards the body — with the hand drawn in towards the wrist by `shrink`, as
 * a folded hand is foreshortened. Out are vertex positions in a 1 by 1 plane
 * centred on the origin, as three.js lays a plane out.
 */
export function foldGrid(rig: WingRig, rest: Float32Array, share: Float32Array, fold: number, shrink: number, out: Float32Array): void {
  const count = share.length;
  for (let i = 0; i < count; i++) {
    const w = share[i];
    // In canvas coordinates y runs down, so turning the fingers back towards
    // the body is turning them anticlockwise on screen: a negative angle.
    const a = -fold * w;
    const s = 1 - shrink * w;
    const dx = (rest[i * 2] - rig.wrist.x) * s;
    const dy = (rest[i * 2 + 1] - rig.wrist.y) * s;
    const c = Math.cos(a);
    const n = Math.sin(a);
    const x = rig.wrist.x + dx * c - dy * n;
    const y = rig.wrist.y + dx * n + dy * c;
    out[i * 3] = x / rig.width - 0.5;
    out[i * 3 + 1] = 0.5 - y / rig.height;
    out[i * 3 + 2] = 0;
  }
}
