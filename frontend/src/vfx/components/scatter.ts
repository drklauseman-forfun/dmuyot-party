/**
 * Random spots around the frame for things that must not cover the winner's
 * name: the words and the memes.
 */

/** mulberry32 — the same generator the sparkles and the eyes use. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates, in place, driven by a seeded generator. */
export function shuffle<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export interface Size {
  width: number;
  height: number;
}

/**
 * A placed box: its centre, in pixels from the left and from the bottom, and
 * how much it was shrunk to find room.
 */
export interface Spot {
  x: number;
  y: number;
  scale: number;
}

/**
 * The middle of the frame, where the results show the title, the winner's name
 * and the button, as half-widths from the centre in fractions of the frame.
 * The eyes keep clear of the same area.
 */
const KEEP_CLEAR = { x: 0.3, y: 0.17 };

const ATTEMPTS = 120;

/**
 * Sizes tried in turn when a box cannot be placed clear of the middle at all.
 * On a landscape screen the bands above and below the results are short, and
 * a tilted meme at full size fitted in neither: every one was dropped, and
 * the effect showed nothing.
 */
const SHRINK = [1, 0.85, 0.72, 0.6, 0.5, 0.4];

function overlap(a: Spot, sa: Size, b: Spot, sb: Size, pad: number): number {
  const w = Math.min(a.x + sa.width / 2, b.x + sb.width / 2) - Math.max(a.x - sa.width / 2, b.x - sb.width / 2) + pad;
  const h = Math.min(a.y + sa.height / 2, b.y + sb.height / 2) - Math.max(a.y - sa.height / 2, b.y - sb.height / 2) + pad;
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * A spot for each box, in order, or null where none fits even shrunk. Every
 * spot is inside the frame and clear of the middle. Boxes are kept apart when
 * there is room, and once there is not, each takes the spot it overlaps least
 * — a crowded screen is the point of a meme, a missing word is not.
 */
export function scatter(boxes: Size[], frame: Size, random: () => number): (Spot | null)[] {
  const margin = 0.02 * Math.min(frame.width, frame.height);
  const placed: { spot: Spot; size: Size }[] = [];
  return boxes.map((full) => {
    for (const scale of SHRINK) {
      const size = { width: full.width * scale, height: full.height * scale };
      const roomX = frame.width - 2 * margin - size.width;
      const roomY = frame.height - 2 * margin - size.height;
      if (roomX < 0 || roomY < 0) continue;
      const pad = 0.12 * Math.min(size.width, size.height);
      let best: Spot | null = null;
      let bestOverlap = Infinity;
      for (let attempt = 0; attempt < ATTEMPTS && bestOverlap > 0; attempt++) {
        const spot = {
          x: margin + size.width / 2 + random() * roomX,
          y: margin + size.height / 2 + random() * roomY,
          scale,
        };
        const inMiddle =
          Math.abs(spot.x - frame.width / 2) < KEEP_CLEAR.x * frame.width + size.width / 2 &&
          Math.abs(spot.y - frame.height / 2) < KEEP_CLEAR.y * frame.height + size.height / 2;
        if (inMiddle) continue;
        const covered = placed.reduce((sum, other) => sum + overlap(spot, size, other.spot, other.size, pad), 0);
        if (covered < bestOverlap) {
          best = spot;
          bestOverlap = covered;
        }
      }
      if (best) {
        placed.push({ spot: best, size });
        return best;
      }
    }
    return null;
  });
}

/** The upright box a rotated one needs. */
export function turnedBox(size: Size, angle: number): Size {
  const cos = Math.abs(Math.cos(angle));
  const sin = Math.abs(Math.sin(angle));
  return { width: size.width * cos + size.height * sin, height: size.width * sin + size.height * cos };
}
