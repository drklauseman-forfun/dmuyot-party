/**
 * The wheel's deceleration curve, and the one question the sound asks of it.
 *
 * Both the CSS transition and the spin sound read from here. That is the point:
 * the ticks only feel connected to the wheel while they are derived from the
 * same curve that moves it, so the curve gets one home rather than two copies.
 */

/** cubic-bezier control points: x1, y1, x2, y2. */
export const SPIN_EASING = [0.15, 0, 0.15, 1] as const;

/** The curve as CSS sees it. */
export const SPIN_EASING_CSS = `cubic-bezier(${SPIN_EASING.join(', ')})`;

function bezier(t: number, a: number, b: number): number {
  const inv = 1 - t;
  return 3 * inv * inv * t * a + 3 * inv * t * t * b + t * t * t;
}

/**
 * The fraction of the spin's duration at which the wheel has completed
 * `progress` of its rotation.
 *
 * The easing gives rotation as a function of time; scheduling a tick for the
 * moment a particular slice passes the pointer needs the inverse. The curve is
 * monotonic, so bisection converges and cannot overshoot.
 *
 * @param progress 0–1 of total rotation.
 * @returns 0–1 of total duration.
 */
export function timeAtProgress(progress: number): number {
  const [x1, y1, x2, y2] = SPIN_EASING;
  let low = 0;
  let high = 1;
  for (let i = 0; i < 30; i++) {
    const mid = (low + high) / 2;
    if (bezier(mid, y1, y2) < progress) low = mid;
    else high = mid;
  }
  return bezier((low + high) / 2, x1, x2);
}
