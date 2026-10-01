import * as THREE from 'three';

/**
 * The time-telling machines, drawn once each on a canvas and shared
 * afterwards — the same idea as the wings' feather: a canvas affords shading,
 * bevels and a brushed rim that no shader would be worth writing, and once
 * drawn it costs nothing to show.
 *
 * Drawn in neutral greys so the effect's colour can tint them, with the light
 * coming from the top left throughout, so several machines on one screen look
 * like they are in the same room.
 */

function canvas2d(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return [canvas, ctx];
}

export function toTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  // Drawn in screen colours, and said to be: the unlit layer converts nothing.
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

/** Drawn on first use and kept: every machine of a kind shares one picture. */
const cache = new Map<string, THREE.CanvasTexture>();

function cached(key: string, draw: () => HTMLCanvasElement): THREE.CanvasTexture {
  const found = cache.get(key);
  if (found) return found;
  const texture = toTexture(draw());
  cache.set(key, texture);
  return texture;
}

/** A rounded rectangle path, which the 2D context only gained recently. */
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** The round case and the face inside it, marks and all. 384 square. */
export function clockFace(): THREE.CanvasTexture {
  return cached('clockFace', () => {
    const size = 384;
    const [canvas, ctx] = canvas2d(size, size);
    const mid = size / 2;
    const outer = size * 0.47;

    // The case: a brushed metal ring, lit from the top left.
    const ring = ctx.createLinearGradient(mid - outer, mid - outer, mid + outer, mid + outer);
    ring.addColorStop(0, '#f2f2f4');
    ring.addColorStop(0.35, '#b9bac0');
    ring.addColorStop(0.55, '#6e7078');
    ring.addColorStop(0.8, '#9a9ba2');
    ring.addColorStop(1, '#4a4c52');
    ctx.fillStyle = ring;
    ctx.beginPath();
    ctx.arc(mid, mid, outer, 0, Math.PI * 2);
    ctx.fill();

    // A dark seam where the case meets the glass, which is what reads as depth.
    ctx.strokeStyle = 'rgba(20, 20, 24, 0.55)';
    ctx.lineWidth = size * 0.012;
    ctx.beginPath();
    ctx.arc(mid, mid, outer * 0.86, 0, Math.PI * 2);
    ctx.stroke();

    // The face, slightly off-white and shaded towards the bottom right.
    const face = ctx.createRadialGradient(mid - outer * 0.3, mid - outer * 0.35, outer * 0.1, mid, mid, outer * 0.85);
    face.addColorStop(0, '#ffffff');
    face.addColorStop(0.7, '#eceae4');
    face.addColorStop(1, '#c9c7c1');
    ctx.fillStyle = face;
    ctx.beginPath();
    ctx.arc(mid, mid, outer * 0.84, 0, Math.PI * 2);
    ctx.fill();

    // Marks: long at the quarters, short between.
    ctx.strokeStyle = '#2b2d33';
    for (let i = 0; i < 60; i++) {
      const angle = (i / 60) * Math.PI * 2;
      const hour = i % 5 === 0;
      const quarter = i % 15 === 0;
      const from = outer * (hour ? 0.63 : 0.72);
      const to = outer * 0.78;
      ctx.lineWidth = size * (quarter ? 0.018 : hour ? 0.012 : 0.005);
      ctx.beginPath();
      ctx.moveTo(mid + Math.sin(angle) * from, mid - Math.cos(angle) * from);
      ctx.lineTo(mid + Math.sin(angle) * to, mid - Math.cos(angle) * to);
      ctx.stroke();
    }

    // Glass: a soft sheen across the top left, and nothing on the rest.
    const sheen = ctx.createLinearGradient(mid - outer, mid - outer, mid, mid);
    sheen.addColorStop(0, 'rgba(255, 255, 255, 0.5)');
    sheen.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = sheen;
    ctx.beginPath();
    ctx.arc(mid, mid, outer * 0.84, Math.PI * 0.75, Math.PI * 1.75);
    ctx.fill();

    return canvas;
  });
}

/**
 * One hand, pointing up from the bottom of the picture, so a mesh scaled to
 * the hand's length and turned about its base puts the tip where it belongs.
 */
export function clockHand(): THREE.CanvasTexture {
  return cached('clockHand', () => {
    const [canvas, ctx] = canvas2d(48, 256);
    const mid = 24;
    // Tapering from the hub to the tip, with a darker edge down one side.
    const body = ctx.createLinearGradient(0, 0, 48, 0);
    body.addColorStop(0, '#3b3d44');
    body.addColorStop(0.45, '#15161a');
    body.addColorStop(1, '#5a5d66');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(mid, 6);
    ctx.lineTo(mid + 9, 72);
    ctx.lineTo(mid + 6, 238);
    ctx.lineTo(mid - 6, 238);
    ctx.lineTo(mid - 9, 72);
    ctx.closePath();
    ctx.fill();

    // The hub it turns on.
    ctx.fillStyle = '#1b1d22';
    ctx.beginPath();
    ctx.arc(mid, 238, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#9a9ca4';
    ctx.beginPath();
    ctx.arc(mid - 3, 235, 6, 0, Math.PI * 2);
    ctx.fill();
    return canvas;
  });
}

/**
 * The hourglass, without its sand: two wooden caps, three posts and the glass.
 * The bulbs are left transparent, because the sand is drawn behind this.
 */
export function hourglassFrame(): THREE.CanvasTexture {
  return cached('hourglassFrame', () => {
    const [canvas, ctx] = canvas2d(320, 448);

    const wood = (y: number, h: number) => {
      const g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, '#9a6b3f');
      g.addColorStop(0.4, '#6f4624');
      g.addColorStop(1, '#3e2614');
      return g;
    };

    // Caps, top and bottom.
    ctx.fillStyle = wood(8, 44);
    roundRect(ctx, 26, 8, 268, 44, 12);
    ctx.fill();
    ctx.fillStyle = wood(396, 44);
    roundRect(ctx, 26, 396, 268, 44, 12);
    ctx.fill();

    // Posts down each side, and one behind the glass.
    ctx.fillStyle = wood(52, 344);
    for (const x of [40, 262]) {
      roundRect(ctx, x, 48, 18, 352, 8);
      ctx.fill();
    }

    // The glass: two bulbs meeting at a narrow waist.
    const glass = new Path2D();
    glass.moveTo(74, 56);
    glass.bezierCurveTo(74, 170, 150, 196, 160, 224);
    glass.bezierCurveTo(170, 196, 246, 170, 246, 56);
    glass.closePath();
    const lower = new Path2D();
    lower.moveTo(74, 392);
    lower.bezierCurveTo(74, 278, 150, 252, 160, 224);
    lower.bezierCurveTo(170, 252, 246, 278, 246, 392);
    lower.closePath();

    // Only the rim and a highlight are drawn: the inside has to stay clear.
    ctx.strokeStyle = 'rgba(226, 238, 246, 0.85)';
    ctx.lineWidth = 7;
    ctx.stroke(glass);
    ctx.stroke(lower);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(96, 70);
    ctx.bezierCurveTo(96, 150, 140, 186, 152, 214);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(100, 380);
    ctx.bezierCurveTo(100, 300, 140, 262, 152, 236);
    ctx.stroke();

    return canvas;
  });
}

/** The metronome's case: a wooden wedge with a scale up its front. */
export function metronomeBody(): THREE.CanvasTexture {
  return cached('metronomeBody', () => {
    const [canvas, ctx] = canvas2d(288, 384);

    const wood = ctx.createLinearGradient(40, 0, 248, 0);
    wood.addColorStop(0, '#8d5c33');
    wood.addColorStop(0.45, '#5e3a1e');
    wood.addColorStop(1, '#2f1c0e');
    ctx.fillStyle = wood;
    ctx.beginPath();
    ctx.moveTo(144, 18);
    ctx.lineTo(236, 352);
    ctx.quadraticCurveTo(236, 372, 216, 372);
    ctx.lineTo(72, 372);
    ctx.quadraticCurveTo(52, 372, 52, 352);
    ctx.closePath();
    ctx.fill();

    // The slot the arm swings in, with the scale beside it.
    ctx.fillStyle = '#1a1208';
    ctx.beginPath();
    ctx.moveTo(144, 40);
    ctx.lineTo(176, 340);
    ctx.lineTo(112, 340);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(236, 226, 206, 0.75)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 9; i++) {
      const y = 92 + i * 27;
      const half = 10 + i * 1.6;
      ctx.beginPath();
      ctx.moveTo(144 + half, y);
      ctx.lineTo(144 + half + 16, y);
      ctx.stroke();
    }

    // A lit edge down the left side, so the wedge reads as solid.
    ctx.strokeStyle = 'rgba(255, 226, 180, 0.45)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(144, 20);
    ctx.lineTo(56, 352);
    ctx.stroke();

    return canvas;
  });
}

/** The metronome's arm, pointing up from its pivot at the bottom. */
export function metronomeArm(): THREE.CanvasTexture {
  return cached('metronomeArm', () => {
    const [canvas, ctx] = canvas2d(48, 320);
    const rod = ctx.createLinearGradient(0, 0, 48, 0);
    rod.addColorStop(0, '#d8cdb6');
    rod.addColorStop(0.5, '#8d7f62');
    rod.addColorStop(1, '#4a4335');
    ctx.fillStyle = rod;
    roundRect(ctx, 18, 6, 12, 300, 6);
    ctx.fill();

    // The weight that slides up and down it.
    const weight = ctx.createLinearGradient(8, 0, 40, 0);
    weight.addColorStop(0, '#e6c88f');
    weight.addColorStop(0.5, '#a07a42');
    weight.addColorStop(1, '#53391c');
    ctx.fillStyle = weight;
    ctx.beginPath();
    ctx.moveTo(10, 96);
    ctx.lineTo(38, 96);
    ctx.lineTo(34, 150);
    ctx.lineTo(14, 150);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#1d1a14';
    ctx.beginPath();
    ctx.arc(24, 306, 11, 0, Math.PI * 2);
    ctx.fill();
    return canvas;
  });
}

/** The digital clock: a plastic case with a dark window to show digits in. */
export function digitalCase(): THREE.CanvasTexture {
  return cached('digitalCase', () => {
    const [canvas, ctx] = canvas2d(384, 224);

    const shell = ctx.createLinearGradient(0, 0, 0, 224);
    shell.addColorStop(0, '#5c5f69');
    shell.addColorStop(0.5, '#2f323a');
    shell.addColorStop(1, '#16181d');
    ctx.fillStyle = shell;
    roundRect(ctx, 6, 6, 372, 212, 26);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 3;
    roundRect(ctx, 12, 12, 360, 200, 22);
    ctx.stroke();

    // The window, darker than the case so the digits read as lit.
    const window_ = ctx.createLinearGradient(0, 40, 0, 184);
    window_.addColorStop(0, '#0b1412');
    window_.addColorStop(1, '#13201c');
    ctx.fillStyle = window_;
    roundRect(ctx, 34, 40, 316, 144, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.lineWidth = 4;
    roundRect(ctx, 34, 40, 316, 144, 14);
    ctx.stroke();

    return canvas;
  });
}

/** Where a digital clock's digits are drawn, and how they are lit. */
const SEGMENTS: Record<string, number[]> = {
  // top, top right, bottom right, bottom, bottom left, top left, middle
  '0': [1, 1, 1, 1, 1, 1, 0],
  '1': [0, 1, 1, 0, 0, 0, 0],
  '2': [1, 1, 0, 1, 1, 0, 1],
  '3': [1, 1, 1, 1, 0, 0, 1],
  '4': [0, 1, 1, 0, 0, 1, 1],
  '5': [1, 0, 1, 1, 0, 1, 1],
  '6': [1, 0, 1, 1, 1, 1, 1],
  '7': [1, 1, 1, 0, 0, 0, 0],
  '8': [1, 1, 1, 1, 1, 1, 1],
  '9': [1, 1, 1, 1, 0, 1, 1],
};

/**
 * Seven-segment digits on a transparent background, redrawn only when the
 * time shown changes — a few times a second rather than every frame.
 */
export function drawDigits(ctx: CanvasRenderingContext2D, text: string, color: string): void {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);
  const cells = text.length;
  const cellWidth = width / cells;
  const digitWidth = cellWidth * 0.62;
  const digitHeight = height * 0.72;
  const thickness = Math.max(2, digitHeight * 0.1);

  text.split('').forEach((ch, i) => {
    const left = i * cellWidth + (cellWidth - digitWidth) / 2;
    const top = (height - digitHeight) / 2;
    if (ch === ':') {
      ctx.fillStyle = color;
      for (const y of [top + digitHeight * 0.3, top + digitHeight * 0.68]) {
        ctx.beginPath();
        ctx.arc(left + digitWidth / 2, y, thickness * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }
    const lit = SEGMENTS[ch] ?? SEGMENTS['8'];
    const bars: [number, number, number, number][] = [
      [left, top, digitWidth, thickness],
      [left + digitWidth - thickness, top, thickness, digitHeight / 2],
      [left + digitWidth - thickness, top + digitHeight / 2, thickness, digitHeight / 2],
      [left, top + digitHeight - thickness, digitWidth, thickness],
      [left, top + digitHeight / 2, thickness, digitHeight / 2],
      [left, top, thickness, digitHeight / 2],
      [left, top + (digitHeight - thickness) / 2, digitWidth, thickness],
    ];
    bars.forEach((bar, s) => {
      // Unlit segments stay faintly visible, as they do on a real display.
      ctx.fillStyle = lit[s] ? color : 'rgba(255, 255, 255, 0.07)';
      roundRect(ctx, bar[0], bar[1], bar[2], bar[3], thickness * 0.35);
      ctx.fill();
    });
  });
}
