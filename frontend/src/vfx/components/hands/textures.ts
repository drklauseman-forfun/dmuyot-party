import * as THREE from 'three';

/**
 * Hands, and the figure standing behind one of them, drawn once each on a
 * canvas — the same approach as the wings and the clocks.
 *
 * Every hand is built from the same bones: a palm, four fingers and a thumb,
 * laid out once and then dressed as skin, as machinery or as porcelain. That
 * is why three very different hands hold the same pose; only the surface
 * changes.
 *
 * Each is drawn upright, wrist at the bottom, so an effect can turn it to
 * reach in from whichever edge it likes.
 */

const WIDTH = 320;
const HEIGHT = 440;

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
  // Drawn in screen colours, and said to be: the unlit layer converts nothing.
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
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

interface Finger {
  /** Where it leaves the palm. */
  x: number;
  y: number;
  /** Lean, in radians, from straight up. */
  lean: number;
  length: number;
  width: number;
}

/** The pose every hand holds: four fingers spread, thumb out to the left. */
const FINGERS: Finger[] = [
  { x: 112, y: 232, lean: -0.22, length: 150, width: 34 }, // index
  { x: 152, y: 224, lean: -0.06, length: 168, width: 35 }, // middle
  { x: 192, y: 230, lean: 0.08, length: 152, width: 33 }, // ring
  { x: 228, y: 244, lean: 0.26, length: 118, width: 29 }, // little
];
const THUMB: Finger = { x: 96, y: 300, lean: -1.15, length: 118, width: 38 };

const PALM = { x: 88, y: 214, width: 160, height: 150, radius: 54 };

function capsule(ctx: CanvasRenderingContext2D, finger: Finger, fill: string | CanvasGradient): void {
  const tipX = finger.x + Math.sin(finger.lean) * finger.length;
  const tipY = finger.y - Math.cos(finger.lean) * finger.length;
  ctx.strokeStyle = fill;
  ctx.lineWidth = finger.width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(finger.x, finger.y);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Lit from the top left on every hand, so three of them share a light. */
function shading(ctx: CanvasRenderingContext2D, light: string, mid: string, dark: string): CanvasGradient {
  const g = ctx.createLinearGradient(60, 60, 280, 400);
  g.addColorStop(0, light);
  g.addColorStop(0.45, mid);
  g.addColorStop(1, dark);
  return g;
}

/** The parts every hand shares, in one fill. */
function handBody(ctx: CanvasRenderingContext2D, fill: string | CanvasGradient): void {
  ctx.fillStyle = fill;
  for (const finger of [...FINGERS, THUMB]) capsule(ctx, finger, fill);
  roundRect(ctx, PALM.x, PALM.y, PALM.width, PALM.height, PALM.radius);
  ctx.fill();
  // The wrist, running off the bottom of the picture.
  roundRect(ctx, PALM.x + 18, PALM.y + 110, PALM.width - 36, 120, 28);
  ctx.fill();
}

/** An open hand of flesh and blood, held out to be shaken. */
export function openHand(): THREE.CanvasTexture {
  return cached('hand-open', () => {
    const [canvas, ctx] = canvas2d(WIDTH, HEIGHT);
    handBody(ctx, shading(ctx, '#f0c9a8', '#d9a279', '#9c6442'));

    // Creases: where the fingers fold, and across the palm.
    ctx.strokeStyle = 'rgba(120, 68, 40, 0.35)';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    for (const finger of FINGERS) {
      for (const along of [0.34, 0.66]) {
        const x = finger.x + Math.sin(finger.lean) * finger.length * along;
        const y = finger.y - Math.cos(finger.lean) * finger.length * along;
        ctx.beginPath();
        ctx.moveTo(x - finger.width * 0.32, y);
        ctx.lineTo(x + finger.width * 0.32, y);
        ctx.stroke();
      }
    }
    ctx.beginPath();
    ctx.moveTo(110, 262);
    ctx.quadraticCurveTo(170, 292, 224, 268);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(104, 300);
    ctx.quadraticCurveTo(168, 330, 226, 302);
    ctx.stroke();

    // A highlight along the top of the hand, where the light falls.
    ctx.strokeStyle = 'rgba(255, 236, 214, 0.5)';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(104, 226);
    ctx.quadraticCurveTo(160, 206, 222, 236);
    ctx.stroke();
    return canvas;
  });
}

/** A machine's hand: plates, joints and a lit edge. */
export function roboticHand(): THREE.CanvasTexture {
  return cached('hand-robotic', () => {
    const [canvas, ctx] = canvas2d(WIDTH, HEIGHT);
    handBody(ctx, shading(ctx, '#d8dde6', '#878d99', '#3b4049'));

    // Gaps between the segments, which is what makes it read as built.
    ctx.strokeStyle = 'rgba(18, 20, 26, 0.85)';
    ctx.lineCap = 'butt';
    for (const finger of [...FINGERS, THUMB]) {
      for (const along of [0.3, 0.62]) {
        const x = finger.x + Math.sin(finger.lean) * finger.length * along;
        const y = finger.y - Math.cos(finger.lean) * finger.length * along;
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(x - finger.width * 0.52, y + finger.width * 0.1);
        ctx.lineTo(x + finger.width * 0.52, y - finger.width * 0.1);
        ctx.stroke();
      }
      // A pin through each knuckle.
      ctx.fillStyle = '#20242c';
      ctx.beginPath();
      ctx.arc(finger.x, finger.y, finger.width * 0.26, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#aeb6c2';
      ctx.beginPath();
      ctx.arc(finger.x - 2, finger.y - 2, finger.width * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }

    // A panel on the back of the hand, with a lit seam.
    ctx.fillStyle = 'rgba(28, 32, 40, 0.8)';
    roundRect(ctx, PALM.x + 34, PALM.y + 46, PALM.width - 68, 84, 18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(126, 220, 255, 0.85)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(PALM.x + 48, PALM.y + 90);
    ctx.lineTo(PALM.x + PALM.width - 48, PALM.y + 90);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(236, 246, 255, 0.55)';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(104, 230);
    ctx.quadraticCurveTo(160, 212, 220, 240);
    ctx.stroke();
    return canvas;
  });
}

/** Glazed porcelain: white, cool in the shadows, and finely cracked. */
export function porcelainHand(): THREE.CanvasTexture {
  return cached('hand-porcelain', () => {
    const [canvas, ctx] = canvas2d(WIDTH, HEIGHT);
    handBody(ctx, shading(ctx, '#ffffff', '#e4e8f0', '#9aa6bb'));

    // Hairline cracks, drawn from a fixed set so every visit matches.
    ctx.strokeStyle = 'rgba(120, 132, 154, 0.55)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    const cracks: [number, number, number, number, number, number][] = [
      [150, 120, 164, 170, 150, 214],
      [196, 150, 182, 196, 196, 240],
      [120, 250, 162, 268, 150, 316],
      [214, 262, 190, 300, 214, 338],
      [128, 196, 112, 232, 132, 268],
    ];
    for (const [x1, y1, cx, cy, x2, y2] of cracks) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo(cx, cy, x2, y2);
      ctx.stroke();
    }

    // The glaze: a hard highlight along the fingers and a soft one on the palm.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 7;
    for (const finger of FINGERS) {
      const tipX = finger.x + Math.sin(finger.lean) * finger.length * 0.82;
      const tipY = finger.y - Math.cos(finger.lean) * finger.length * 0.82;
      ctx.beginPath();
      ctx.moveTo(finger.x - finger.width * 0.2, finger.y - 10);
      ctx.lineTo(tipX - finger.width * 0.2, tipY);
      ctx.stroke();
    }
    const gloss = ctx.createRadialGradient(140, 250, 6, 150, 270, 90);
    gloss.addColorStop(0, 'rgba(255, 255, 255, 0.75)');
    gloss.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gloss;
    roundRect(ctx, PALM.x, PALM.y, PALM.width, PALM.height, PALM.radius);
    ctx.fill();
    return canvas;
  });
}

/**
 * The figure behind the handshake: a suit, shoulders to waist, with no face.
 * Drawn dark and flat on purpose — it belongs in the background, and the
 * effect fades it further.
 */
export function suitFigure(): THREE.CanvasTexture {
  return cached('figure-suit', () => {
    const [canvas, ctx] = canvas2d(420, 520);

    // The jacket: sloped shoulders either side of an open collar, and a
    // body that narrows a little to the waist. Drawn as one piece, because a
    // figure this far back is a shape before it is a person.
    const cloth = ctx.createLinearGradient(60, 100, 380, 520);
    cloth.addColorStop(0, '#4b515f');
    cloth.addColorStop(0.5, '#2b2f39');
    cloth.addColorStop(1, '#14161c');
    ctx.fillStyle = cloth;
    ctx.beginPath();
    ctx.moveTo(176, 104);
    ctx.lineTo(126, 118);
    ctx.quadraticCurveTo(54, 142, 40, 206);
    ctx.lineTo(24, 516);
    ctx.lineTo(396, 516);
    ctx.lineTo(380, 206);
    ctx.quadraticCurveTo(366, 142, 294, 118);
    ctx.lineTo(244, 104);
    ctx.closePath();
    ctx.fill();

    // Shirt, in the V the lapels leave open.
    ctx.fillStyle = '#dde1e9';
    ctx.beginPath();
    ctx.moveTo(176, 104);
    ctx.lineTo(244, 104);
    ctx.lineTo(234, 150);
    ctx.lineTo(210, 300);
    ctx.lineTo(186, 150);
    ctx.closePath();
    ctx.fill();

    // Collar, standing a little away from the neck.
    ctx.fillStyle = '#eef1f6';
    ctx.beginPath();
    ctx.moveTo(176, 104);
    ctx.lineTo(210, 138);
    ctx.lineTo(244, 104);
    ctx.lineTo(236, 98);
    ctx.lineTo(184, 98);
    ctx.closePath();
    ctx.fill();

    // Tie, knotted at the collar.
    const tie = ctx.createLinearGradient(190, 120, 230, 330);
    tie.addColorStop(0, '#8d2533');
    tie.addColorStop(1, '#3d0d14');
    ctx.fillStyle = tie;
    ctx.beginPath();
    ctx.moveTo(210, 132);
    ctx.lineTo(228, 150);
    ctx.lineTo(220, 168);
    ctx.lineTo(228, 300);
    ctx.lineTo(210, 322);
    ctx.lineTo(192, 300);
    ctx.lineTo(200, 168);
    ctx.lineTo(192, 150);
    ctx.closePath();
    ctx.fill();

    // Lapels, laid over the shirt, each catching a different amount of light.
    ctx.fillStyle = 'rgba(70, 76, 90, 0.96)';
    ctx.beginPath();
    ctx.moveTo(176, 104);
    ctx.lineTo(184, 150);
    ctx.lineTo(160, 320);
    ctx.lineTo(122, 124);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(46, 51, 62, 0.96)';
    ctx.beginPath();
    ctx.moveTo(244, 104);
    ctx.lineTo(236, 150);
    ctx.lineTo(260, 320);
    ctx.lineTo(298, 124);
    ctx.closePath();
    ctx.fill();

    // A seam of light down the left shoulder, so it is not a flat cut-out.
    ctx.strokeStyle = 'rgba(190, 200, 220, 0.25)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(126, 120);
    ctx.quadraticCurveTo(56, 146, 44, 212);
    ctx.stroke();
    return canvas;
  });
}

export const HAND_ASPECT = WIDTH / HEIGHT;
export const FIGURE_ASPECT = 420 / 520;
