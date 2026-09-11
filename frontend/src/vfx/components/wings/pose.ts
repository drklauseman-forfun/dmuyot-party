/**
 * The skeleton of a wing, how it folds and opens, and where its feathers grow.
 *
 * Everything is in wing units, for the right-hand wing: the shoulder at the
 * origin, x outwards, y up, and 1 roughly the length of the whole wing. The
 * left wing is the same numbers mirrored. Plain arithmetic with no three.js,
 * so a shape can be checked without drawing it.
 */

export interface Vec2 {
  x: number;
  y: number;
}

/** Absolute angles of the three arm bones, in radians anticlockwise from +x. */
export interface ArmPose {
  humerus: number;
  forearm: number;
  hand: number;
}

export interface Joints {
  shoulder: Vec2;
  elbow: Vec2;
  wrist: Vec2;
  tip: Vec2;
}

const BONES = { humerus: 0.26, forearm: 0.34, hand: 0.36 } as const;

/** Held tight against the body, as a resting bird holds them: a Z-fold. */
const FOLDED: ArmPose = { humerus: -1.35, forearm: 1.75, hand: -1.45 };

/**
 * Spread up and out, above the results. Raised well above level: nearer flat,
 * on a tall phone, the wings read as a band across the screen.
 */
const OPEN: ArmPose = { humerus: 1.2, forearm: 0.75, hand: 0.45 };

/** Which way a folded feather lies: straight down along the body. */
const FOLDED_FEATHER_ANGLE = -1.5;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function along(from: Vec2, angle: number, length: number): Vec2 {
  return { x: from.x + Math.cos(angle) * length, y: from.y + Math.sin(angle) * length };
}

function mixPoint(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

/** A deterministic 0–1 value per index, so each feather keeps its own look. */
export function hash01(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * The arm between folded (0) and open (1). `open` may overshoot a little,
 * which is how a burst snaps past fully spread and settles back. `beat` is
 * the wingbeat, in radians, felt mostly at the shoulder.
 */
export function armPose(open: number, beat: number): ArmPose {
  return {
    humerus: lerp(FOLDED.humerus, OPEN.humerus, open) + beat,
    forearm: lerp(FOLDED.forearm, OPEN.forearm, open) + beat * 0.6,
    hand: lerp(FOLDED.hand, OPEN.hand, open) + beat * 0.35,
  };
}

export function joints(pose: ArmPose): Joints {
  const shoulder = { x: 0, y: 0 };
  const elbow = along(shoulder, pose.humerus, BONES.humerus);
  const wrist = along(elbow, pose.forearm, BONES.forearm);
  const tip = along(wrist, pose.hand, BONES.hand);
  return { shoulder, elbow, wrist, tip };
}

/** One feather: where its base sits, which way it points, and its size. */
export interface FeatherPlacement {
  x: number;
  y: number;
  angle: number;
  length: number;
  width: number;
  /** 0–1 brightness, varied per feather so the rows do not look stamped. */
  shade: number;
}

interface Row {
  /** Which bone the row grows along. */
  bone: 'humerus' | 'forearm' | 'hand';
  count: number;
  /** Portion of the bone the row covers, 0 at its start to 1 at its end. */
  from: number;
  to: number;
  /** Length at the first and last feather of the row. */
  lengths: [number, number];
  width: number;
  /** Angle from the bone when open, at the first and last feather. */
  offsets: [number, number];
  /** Pushes the row's roots towards the leading edge, so it overlaps the one behind. */
  lift: number;
  shade: number;
}

/**
 * Back to front: flight feathers first, so each shorter row of coverts lies
 * over the roots of the row behind it, as on a real wing.
 */
const ROWS: Row[] = [
  { bone: 'hand', count: 10, from: 0.05, to: 1, lengths: [0.52, 0.66], width: 0.085, offsets: [-1.25, -0.12], lift: 0, shade: 0.97 },
  { bone: 'forearm', count: 12, from: 0, to: 1, lengths: [0.46, 0.5], width: 0.08, offsets: [-1.62, -1.32], lift: 0, shade: 0.95 },
  { bone: 'humerus', count: 4, from: 0.45, to: 1, lengths: [0.3, 0.38], width: 0.08, offsets: [-1.85, -1.7], lift: 0, shade: 0.93 },
  { bone: 'forearm', count: 11, from: 0.02, to: 0.98, lengths: [0.22, 0.24], width: 0.07, offsets: [-1.5, -1.3], lift: 0.035, shade: 0.9 },
  { bone: 'hand', count: 6, from: 0, to: 0.5, lengths: [0.2, 0.16], width: 0.06, offsets: [-0.95, -0.6], lift: 0.03, shade: 0.9 },
  { bone: 'humerus', count: 7, from: 0.1, to: 1, lengths: [0.13, 0.15], width: 0.065, offsets: [-1.5, -1.35], lift: 0.05, shade: 0.86 },
  { bone: 'forearm', count: 12, from: 0, to: 1, lengths: [0.1, 0.11], width: 0.055, offsets: [-1.3, -1.15], lift: 0.06, shade: 0.84 },
];

/** How many feathers one wing has. Fixed, so an instanced mesh can be sized once. */
export const FEATHER_COUNT = ROWS.reduce((total, row) => total + row.count, 0);

/**
 * Every feather of one wing, in drawing order. A feather's angle runs from
 * lying down along the body when folded to its fanned-out place when open.
 * `flutter` adds a small angle per feather, for feathers stirring in the air.
 */
export function layoutFeathers(pose: ArmPose, open: number, flutter: (index: number) => number): FeatherPlacement[] {
  const j = joints(pose);
  const ends = {
    humerus: [j.shoulder, j.elbow, pose.humerus],
    forearm: [j.elbow, j.wrist, pose.forearm],
    hand: [j.wrist, j.tip, pose.hand],
  } as const;
  const fan = Math.min(Math.max(open, 0), 1.15);

  const feathers: FeatherPlacement[] = [];
  let index = 0;
  for (const row of ROWS) {
    const [start, end, boneAngle] = ends[row.bone];
    const normal = boneAngle + Math.PI / 2;
    for (let i = 0; i < row.count; i++) {
      const t = row.count === 1 ? 0 : i / (row.count - 1);
      const root = mixPoint(start, end, lerp(row.from, row.to, t));
      const openAngle = boneAngle + lerp(row.offsets[0], row.offsets[1], t);
      feathers.push({
        x: root.x + Math.cos(normal) * row.lift,
        y: root.y + Math.sin(normal) * row.lift,
        angle: lerp(FOLDED_FEATHER_ANGLE, openAngle, fan) + flutter(index),
        length: lerp(row.lengths[0], row.lengths[1], t) * (0.94 + 0.12 * hash01(index)),
        width: row.width,
        shade: row.shade * (0.9 + 0.1 * hash01(index + 50)),
      });
      index++;
    }
  }
  return feathers;
}

/** One finger of a membrane wing: its angle from the wrist and its length. */
export interface Finger {
  angle: number;
  length: number;
}

const FINGER_LENGTHS = [0.6, 0.68, 0.6, 0.5];
/** Open, the fingers spread from pointing up and out to pointing down and back. */
const FINGER_SPREAD = [0.55, 0, -0.6, -1.15];

/** Folded, the fingers close into one bundle along the hand. */
export function fingers(pose: ArmPose, open: number): Finger[] {
  const fan = Math.min(Math.max(open, 0), 1.1);
  return FINGER_LENGTHS.map((length, i) => ({ angle: pose.hand + FINGER_SPREAD[i] * fan, length }));
}

/**
 * Where the membrane meets the body. Higher than on a real bat, whose skin
 * runs down to its legs: that far down, the dark membrane covered the middle
 * of the screen, where the winner's name is.
 */
export const BODY_ANCHOR: Vec2 = { x: 0.02, y: -0.34 };

/**
 * The membrane's edge, in order round the wing: along the arm, out to each
 * fingertip, and back to the body, with each free edge between tips sagging
 * inwards as stretched skin does. Also returns which outline points are the
 * wrist and the fingertips, for triangulating.
 */
export function membraneOutline(j: Joints, tips: Vec2[], sag: number): { points: Vec2[]; wristIndex: number } {
  const points: Vec2[] = [j.shoulder, j.elbow, j.wrist];
  const wristIndex = 2;
  const edges = [...tips, BODY_ANCHOR];
  points.push(edges[0]);
  for (let e = 0; e < edges.length - 1; e++) {
    const a = edges[e];
    const b = edges[e + 1];
    const mid = mixPoint(a, b, 0.5);
    const control = mixPoint(mid, j.wrist, sag);
    for (let s = 1; s <= 4; s++) {
      const t = s / 4;
      const u = 1 - t;
      points.push({
        x: u * u * a.x + 2 * u * t * control.x + t * t * b.x,
        y: u * u * a.y + 2 * u * t * control.y + t * t * b.y,
      });
    }
  }
  return { points, wristIndex };
}
