import * as THREE from 'three';

/**
 * Hands, and the figure standing behind one of them, drawn once each on a
 * canvas — the same approach as the wings and the clocks.
 *
 * Three of the hands are built from the same bones: a palm, four fingers and
 * a thumb, laid out once and then dressed as skin, as machinery or as
 * porcelain. That is why they hold the same pose; only the surface changes.
 * The fourth, the handshake, is a different pose altogether — held out side
 * on, thumb up, from a suit sleeve — because an open palm facing the viewer
 * reads as "stop" or a wave, and was not taken for an offer.
 *
 * Each is drawn upright with its forearm running off the bottom edge, so an
 * effect can turn it to reach in from whichever edge it likes, and reach a
 * long way in without the arm ending in a cut.
 */

const WIDTH = 400;
const HEIGHT = 640;

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

/**
 * The pose the open, machine and porcelain hands share: four fingers spread,
 * thumb out to the left. Laid out about the middle of the picture with room
 * for the thumb — the first layout ran it past the left edge, and every hand
 * was drawn missing the end of its thumb.
 */
const FINGERS: Finger[] = [
  { x: 144, y: 232, lean: -0.22, length: 150, width: 34 }, // index
  { x: 184, y: 224, lean: -0.06, length: 168, width: 35 }, // middle
  { x: 224, y: 230, lean: 0.08, length: 152, width: 33 }, // ring
  { x: 260, y: 244, lean: 0.26, length: 118, width: 29 }, // little
];
const THUMB: Finger = { x: 128, y: 300, lean: -1.05, length: 112, width: 38 };

const PALM = { x: 120, y: 214, width: 160, height: 150, radius: 54 };

/** The wrist and forearm, from under the palm off the bottom edge. */
const ARM = { top: 330, wristLeft: 140, wristRight: 260, bottomLeft: 124, bottomRight: 276 };

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

function forearm(): Path2D {
  const arm = new Path2D();
  const middle = (ARM.top + HEIGHT) / 2;
  arm.moveTo(ARM.wristLeft, ARM.top);
  arm.lineTo(ARM.wristRight, ARM.top);
  arm.quadraticCurveTo(ARM.wristRight + 8, middle, ARM.bottomRight, HEIGHT);
  arm.lineTo(ARM.bottomLeft, HEIGHT);
  arm.quadraticCurveTo(ARM.wristLeft - 8, middle, ARM.wristLeft, ARM.top);
  arm.closePath();
  return arm;
}

/** Lit from the top left on every hand, so several of them share a light. */
function shading(ctx: CanvasRenderingContext2D, light: string, mid: string, dark: string): CanvasGradient {
  const g = ctx.createLinearGradient(70, 60, 340, 620);
  g.addColorStop(0, light);
  g.addColorStop(0.45, mid);
  g.addColorStop(1, dark);
  return g;
}

/** The parts the spread-fingered hands share, in one fill. */
function handBody(ctx: CanvasRenderingContext2D, fill: string | CanvasGradient): void {
  ctx.fillStyle = fill;
  ctx.fill(forearm());
  for (const finger of [...FINGERS, THUMB]) capsule(ctx, finger, fill);
  roundRect(ctx, PALM.x, PALM.y, PALM.width, PALM.height, PALM.radius);
  ctx.fill();
}

/** Shade down the far side of the forearm, so it reads as round. */
function armShade(ctx: CanvasRenderingContext2D, color: string): void {
  const g = ctx.createLinearGradient(ARM.wristLeft, 0, ARM.bottomRight, 0);
  g.addColorStop(0, 'rgba(0, 0, 0, 0)');
  g.addColorStop(0.65, 'rgba(0, 0, 0, 0)');
  g.addColorStop(1, color);
  ctx.fillStyle = g;
  ctx.fill(forearm());
}

/** A line across a finger at some way along it, square to the finger. */
function across(ctx: CanvasRenderingContext2D, finger: Finger, along: number, reach: number): void {
  const x = finger.x + Math.sin(finger.lean) * finger.length * along;
  const y = finger.y - Math.cos(finger.lean) * finger.length * along;
  const dx = Math.cos(finger.lean) * finger.width * reach;
  const dy = Math.sin(finger.lean) * finger.width * reach;
  ctx.beginPath();
  ctx.moveTo(x - dx, y - dy);
  ctx.lineTo(x + dx, y + dy);
  ctx.stroke();
}

/** An open hand of flesh and blood, palm out. */
export function openHand(): THREE.CanvasTexture {
  return cached('hand-open', () => {
    const [canvas, ctx] = canvas2d(WIDTH, HEIGHT);
    handBody(ctx, shading(ctx, '#f0c9a8', '#d9a279', '#9c6442'));
    armShade(ctx, 'rgba(90, 48, 26, 0.45)');

    // Creases: where the fingers fold, and across the palm.
    ctx.strokeStyle = 'rgba(120, 68, 40, 0.35)';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    for (const finger of [...FINGERS, THUMB]) {
      for (const along of [0.34, 0.66]) across(ctx, finger, along, 0.32);
    }
    ctx.beginPath();
    ctx.moveTo(142, 262);
    ctx.quadraticCurveTo(202, 292, 256, 268);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(136, 300);
    ctx.quadraticCurveTo(200, 330, 258, 302);
    ctx.stroke();

    // A highlight along the top of the hand, where the light falls.
    ctx.strokeStyle = 'rgba(255, 236, 214, 0.5)';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(136, 226);
    ctx.quadraticCurveTo(192, 206, 254, 236);
    ctx.stroke();
    return canvas;
  });
}

/** A machine's hand: plates, joints and a lit edge, on a jointed forearm. */
export function roboticHand(): THREE.CanvasTexture {
  return cached('hand-robotic', () => {
    const [canvas, ctx] = canvas2d(WIDTH, HEIGHT);
    handBody(ctx, shading(ctx, '#d8dde6', '#878d99', '#3b4049'));
    armShade(ctx, 'rgba(10, 12, 18, 0.55)');

    // Gaps between the segments, which is what makes it read as built.
    ctx.strokeStyle = 'rgba(18, 20, 26, 0.85)';
    ctx.lineCap = 'butt';
    ctx.lineWidth = 7;
    for (const finger of [...FINGERS, THUMB]) {
      for (const along of [0.3, 0.62]) across(ctx, finger, along, 0.52);
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

    // The forearm: a ring at the wrist, plates down its length, and a piston
    // either side.
    ctx.fillStyle = '#2a2f38';
    roundRect(ctx, ARM.wristLeft - 6, ARM.top + 6, ARM.wristRight - ARM.wristLeft + 12, 26, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(16, 18, 24, 0.85)';
    ctx.lineWidth = 6;
    for (const y of [410, 480, 550, 620]) {
      ctx.beginPath();
      ctx.moveTo(ARM.wristLeft - 2, y);
      ctx.lineTo(ARM.wristRight + 4, y + 6);
      ctx.stroke();
    }
    ctx.strokeStyle = '#c3c9d4';
    ctx.lineWidth = 8;
    for (const [x, out] of [[ARM.wristLeft + 14, -10], [ARM.wristRight - 14, 10]] as const) {
      ctx.beginPath();
      ctx.moveTo(x, ARM.top + 40);
      ctx.lineTo(x + out, HEIGHT);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(236, 246, 255, 0.55)';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(136, 230);
    ctx.quadraticCurveTo(192, 212, 252, 240);
    ctx.stroke();
    return canvas;
  });
}

/** Glazed porcelain: white, cool in the shadows, and finely cracked. */
export function porcelainHand(): THREE.CanvasTexture {
  return cached('hand-porcelain', () => {
    const [canvas, ctx] = canvas2d(WIDTH, HEIGHT);
    handBody(ctx, shading(ctx, '#ffffff', '#e4e8f0', '#9aa6bb'));
    armShade(ctx, 'rgba(90, 104, 130, 0.4)');

    // Hairline cracks, drawn from a fixed set so every visit matches.
    ctx.strokeStyle = 'rgba(120, 132, 154, 0.55)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    const cracks: [number, number, number, number, number, number][] = [
      [182, 120, 196, 170, 182, 214],
      [228, 150, 214, 196, 228, 240],
      [152, 250, 194, 268, 182, 316],
      [246, 262, 222, 300, 246, 338],
      [160, 196, 144, 232, 164, 268],
      [190, 400, 206, 470, 186, 560],
    ];
    for (const [x1, y1, cx, cy, x2, y2] of cracks) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo(cx, cy, x2, y2);
      ctx.stroke();
    }

    // The glaze: a hard highlight along the fingers and soft ones elsewhere.
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
    ctx.beginPath();
    ctx.moveTo(ARM.wristLeft + 22, ARM.top + 30);
    ctx.lineTo(ARM.bottomLeft + 26, HEIGHT - 10);
    ctx.stroke();
    const gloss = ctx.createRadialGradient(172, 250, 6, 182, 270, 90);
    gloss.addColorStop(0, 'rgba(255, 255, 255, 0.75)');
    gloss.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gloss;
    roundRect(ctx, PALM.x, PALM.y, PALM.width, PALM.height, PALM.radius);
    ctx.fill();
    return canvas;
  });
}

/**
 * The handshake's own pose: fingers held together and straight, the thumb
 * raised away from them. Seen palm on, as a hand offered across a table is
 * seen from the side — the first version was drawn edge on, and read as a
 * paddle with a stick for a thumb.
 *
 * Index on the right and the thumb beyond it, so that turned to come in from
 * the right edge the hand points left with the thumb on top.
 */
const DEAL_FINGERS: Finger[] = [
  { x: 158, y: 238, lean: -0.05, length: 138, width: 34 }, // little
  { x: 189, y: 230, lean: -0.02, length: 160, width: 35 }, // ring
  { x: 221, y: 228, lean: 0.01, length: 168, width: 35 }, // middle
  { x: 252, y: 234, lean: 0.04, length: 154, width: 34 }, // index
];
const DEAL_THUMB: Finger = { x: 268, y: 322, lean: 0.62, length: 110, width: 40 };
const DEAL_PALM = { x: 140, y: 222, width: 146, height: 190, radius: 52 };

/**
 * A hand held out to shake on a deal, coming out of a white cuff and a suit
 * sleeve. Drawn pointing up, so turned to come in from the right edge it
 * points left, palm towards the viewer and thumb on top.
 */
export function dealHand(): THREE.CanvasTexture {
  return cached('hand-deal', () => {
    const [canvas, ctx] = canvas2d(WIDTH, HEIGHT);

    // The sleeve first, so the cuff and the hand sit in front of it.
    const sleeve = new Path2D();
    sleeve.moveTo(128, 440);
    sleeve.lineTo(292, 440);
    sleeve.quadraticCurveTo(300, 540, 308, HEIGHT);
    sleeve.lineTo(108, HEIGHT);
    sleeve.quadraticCurveTo(118, 540, 128, 440);
    sleeve.closePath();
    const cloth = ctx.createLinearGradient(108, 0, 308, 0);
    cloth.addColorStop(0, '#565d6c');
    cloth.addColorStop(0.45, '#2c313b');
    cloth.addColorStop(1, '#14171d');
    ctx.fillStyle = cloth;
    ctx.fill(sleeve);
    // A crease across the sleeve, and light along its near edge.
    ctx.strokeStyle = 'rgba(10, 12, 16, 0.6)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(136, 524);
    ctx.quadraticCurveTo(206, 546, 286, 518);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(200, 210, 228, 0.3)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(132, 450);
    ctx.quadraticCurveTo(122, 540, 114, 636);
    ctx.stroke();

    // The hand: palm, the fingers together, and the thumb raised.
    const skin = shading(ctx, '#f3cfb0', '#dda77e', '#a66a46');
    ctx.fillStyle = skin;
    roundRect(ctx, DEAL_PALM.x, DEAL_PALM.y, DEAL_PALM.width, DEAL_PALM.height, DEAL_PALM.radius);
    ctx.fill();
    for (const finger of [...DEAL_FINGERS, DEAL_THUMB]) capsule(ctx, finger, skin);

    // The cushion of the thumb, rounding the palm out towards it.
    ctx.beginPath();
    ctx.ellipse(262, 350, 36, 52, -0.35, 0, Math.PI * 2);
    ctx.fill();

    // Where the fingers meet, so they read as four held together.
    ctx.strokeStyle = 'rgba(122, 68, 42, 0.55)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (let i = 0; i < DEAL_FINGERS.length - 1; i++) {
      const a = DEAL_FINGERS[i];
      const b = DEAL_FINGERS[i + 1];
      const x = (a.x + b.x) / 2;
      const top = Math.max(a.y - a.length, b.y - b.length) + 18;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x + 1, (a.y + b.y) / 2 + 6);
      ctx.stroke();
    }

    // Creases across the fingers and the thumb, and the lines of the palm.
    ctx.strokeStyle = 'rgba(120, 66, 40, 0.38)';
    ctx.lineWidth = 4;
    for (const finger of DEAL_FINGERS) {
      for (const along of [0.34, 0.66]) across(ctx, finger, along, 0.3);
    }
    across(ctx, DEAL_THUMB, 0.5, 0.3);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(146, 262);
    ctx.quadraticCurveTo(200, 288, 266, 262);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(146, 300);
    ctx.quadraticCurveTo(206, 318, 250, 300);
    ctx.stroke();
    // The life line, curving round the base of the thumb.
    ctx.beginPath();
    ctx.moveTo(244, 284);
    ctx.quadraticCurveTo(214, 348, 236, 406);
    ctx.stroke();

    // Fingernails just showing over the tips, and light along the index.
    ctx.fillStyle = 'rgba(255, 230, 214, 0.55)';
    for (const finger of [DEAL_FINGERS[3], DEAL_THUMB]) {
      const tipX = finger.x + Math.sin(finger.lean) * (finger.length - 6);
      const tipY = finger.y - Math.cos(finger.lean) * (finger.length - 6);
      ctx.beginPath();
      ctx.ellipse(tipX, tipY, finger.width * 0.24, finger.width * 0.32, finger.lean, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255, 240, 226, 0.5)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(262, 220);
    ctx.lineTo(258, 96);
    ctx.stroke();
    // Shade down the little-finger side, the far edge of the hand.
    const far = ctx.createLinearGradient(DEAL_PALM.x, 0, DEAL_PALM.x + 50, 0);
    far.addColorStop(0, 'rgba(90, 46, 24, 0.35)');
    far.addColorStop(1, 'rgba(90, 46, 24, 0)');
    ctx.fillStyle = far;
    roundRect(ctx, DEAL_PALM.x, DEAL_PALM.y - 150, 50, DEAL_PALM.height + 150, 20);
    ctx.fill();

    // The shirt cuff, white, with a cufflink.
    const cuff = ctx.createLinearGradient(136, 0, 284, 0);
    cuff.addColorStop(0, '#ffffff');
    cuff.addColorStop(0.6, '#e2e6ee');
    cuff.addColorStop(1, '#aab2c2');
    ctx.fillStyle = cuff;
    roundRect(ctx, 136, 400, 148, 50, 10);
    ctx.fill();
    ctx.fillStyle = '#d6b45a';
    ctx.beginPath();
    ctx.arc(256, 425, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 246, 210, 0.9)';
    ctx.beginPath();
    ctx.arc(253, 422, 3.5, 0, Math.PI * 2);
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
