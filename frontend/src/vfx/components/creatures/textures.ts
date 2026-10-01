import * as THREE from 'three';

/**
 * The creatures: a whale, and the small things that scurry along the edges.
 *
 * Drawn pale and soft rather than in their own colours, because they are
 * shown as light — the effect tints them and adds them to the frame, which is
 * what makes the whale read as a ghost of a whale rather than a picture of
 * one. The body and its tail are separate pictures so the tail can beat.
 */

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

export const WHALE_ASPECT = 512 / 256;
export const FLUKE_ASPECT = 192 / 192;
export const CRITTER_ASPECT = 128 / 96;

/** A whale seen from the side, nose to the right, without its tail. */
export function whaleBody(): THREE.CanvasTexture {
  return cached('whale-body', () => {
    const [canvas, ctx] = canvas2d(512, 256);

    // The body: heavy at the head, tapering to the peduncle on the left.
    const body = new Path2D();
    body.moveTo(40, 126);
    body.bezierCurveTo(120, 58, 300, 36, 430, 92);
    body.bezierCurveTo(482, 118, 486, 150, 440, 176);
    body.bezierCurveTo(330, 232, 140, 214, 40, 142);
    body.closePath();

    const skin = ctx.createLinearGradient(0, 40, 0, 220);
    skin.addColorStop(0, 'rgba(226, 246, 255, 0.95)');
    skin.addColorStop(0.45, 'rgba(150, 206, 240, 0.8)');
    skin.addColorStop(1, 'rgba(70, 120, 170, 0.55)');
    ctx.fillStyle = skin;
    ctx.fill(body);

    // Its edge, brighter than the body, which is what makes it a ghost.
    ctx.strokeStyle = 'rgba(236, 252, 255, 0.95)';
    ctx.lineWidth = 4;
    ctx.stroke(body);

    // The belly's pleats.
    ctx.strokeStyle = 'rgba(210, 240, 255, 0.45)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 7; i++) {
      const x = 250 + i * 26;
      ctx.beginPath();
      ctx.moveTo(x, 150 + i * 2);
      ctx.lineTo(x + 14, 196 - i * 6);
      ctx.stroke();
    }

    // The mouth line and the eye.
    ctx.strokeStyle = 'rgba(236, 252, 255, 0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(470, 146);
    ctx.bezierCurveTo(420, 162, 350, 170, 290, 166);
    ctx.stroke();
    ctx.fillStyle = 'rgba(16, 36, 58, 0.9)';
    ctx.beginPath();
    ctx.arc(416, 132, 7, 0, Math.PI * 2);
    ctx.fill();

    // A pectoral fin, set back and down.
    const fin = new Path2D();
    fin.moveTo(300, 170);
    fin.quadraticCurveTo(286, 222, 236, 236);
    fin.quadraticCurveTo(268, 196, 268, 166);
    fin.closePath();
    ctx.fillStyle = 'rgba(160, 212, 244, 0.8)';
    ctx.fill(fin);
    ctx.strokeStyle = 'rgba(236, 252, 255, 0.8)';
    ctx.lineWidth = 3;
    ctx.stroke(fin);

    return canvas;
  });
}

/** The tail, drawn around the joint it beats about, at the picture's right. */
export function whaleFluke(): THREE.CanvasTexture {
  return cached('whale-fluke', () => {
    const [canvas, ctx] = canvas2d(192, 192);
    const fluke = new Path2D();
    fluke.moveTo(176, 96);
    fluke.bezierCurveTo(130, 86, 96, 60, 24, 20);
    fluke.bezierCurveTo(56, 70, 92, 92, 104, 96);
    fluke.bezierCurveTo(92, 100, 56, 122, 24, 172);
    fluke.bezierCurveTo(96, 132, 130, 106, 176, 96);
    fluke.closePath();

    const skin = ctx.createLinearGradient(0, 0, 0, 192);
    skin.addColorStop(0, 'rgba(206, 238, 255, 0.9)');
    skin.addColorStop(0.5, 'rgba(140, 200, 238, 0.8)');
    skin.addColorStop(1, 'rgba(206, 238, 255, 0.9)');
    ctx.fillStyle = skin;
    ctx.fill(fluke);
    ctx.strokeStyle = 'rgba(236, 252, 255, 0.95)';
    ctx.lineWidth = 4;
    ctx.stroke(fluke);
    return canvas;
  });
}

/**
 * A small scurrying thing, facing right. Three shapes, so a crowd of them is
 * not one creature copied.
 */
export function critter(variant: number): THREE.CanvasTexture {
  return cached(`critter-${variant % 3}`, () => {
    const [canvas, ctx] = canvas2d(128, 96);
    const glow = ctx.createRadialGradient(56, 48, 4, 60, 48, 46);
    glow.addColorStop(0, 'rgba(226, 248, 255, 0.95)');
    glow.addColorStop(0.6, 'rgba(150, 210, 245, 0.7)');
    glow.addColorStop(1, 'rgba(90, 150, 200, 0.25)');
    ctx.fillStyle = glow;

    if (variant % 3 === 0) {
      // Round and squat.
      ctx.beginPath();
      ctx.ellipse(62, 46, 34, 26, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (variant % 3 === 1) {
      // Long, with a raised back.
      ctx.beginPath();
      ctx.moveTo(22, 58);
      ctx.quadraticCurveTo(44, 14, 78, 22);
      ctx.quadraticCurveTo(104, 30, 100, 58);
      ctx.closePath();
      ctx.fill();
    } else {
      // Tufted, with a tail.
      ctx.beginPath();
      ctx.ellipse(66, 48, 28, 24, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(200, 236, 255, 0.8)';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(40, 40);
      ctx.quadraticCurveTo(14, 26, 18, 6);
      ctx.stroke();
    }

    // Legs, and two eyes looking the way it runs.
    ctx.strokeStyle = 'rgba(214, 242, 255, 0.85)';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    for (const [x, lean] of [[40, -8], [58, -2], [76, 4], [92, 10]] as const) {
      ctx.beginPath();
      ctx.moveTo(x, 64);
      ctx.lineTo(x + lean, 88);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(20, 40, 60, 0.9)';
    ctx.beginPath();
    ctx.arc(84, 38, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(70, 36, 4, 0, Math.PI * 2);
    ctx.fill();
    return canvas;
  });
}
