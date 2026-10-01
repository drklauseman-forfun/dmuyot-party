import * as THREE from 'three';

/**
 * The weapons, and what each one fires, drawn once on a canvas and shared.
 *
 * Every weapon is drawn pointing right, muzzle at the right edge of its
 * picture, so an effect can put one on either side by turning it. Every shot
 * is drawn flying right for the same reason.
 *
 * Neutral metals and woods, lit from above, so the effect's colour can tint
 * them without fighting the shading.
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

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function metal(ctx: CanvasRenderingContext2D, y: number, h: number, light = '#cfd4dd', dark = '#2a2e36'): CanvasGradient {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, light);
  g.addColorStop(0.45, '#6b717c');
  g.addColorStop(1, dark);
  return g;
}

export type WeaponKind = 'pistol' | 'rifle' | 'cannon' | 'laser' | 'bow' | 'missile';

/** Width over height of each weapon's picture, for placing it on screen. */
export const WEAPON_ASPECT: Record<WeaponKind, number> = {
  pistol: 256 / 192,
  rifle: 384 / 160,
  cannon: 320 / 192,
  laser: 288 / 160,
  bow: 192 / 256,
  missile: 320 / 176,
};

export function weaponTexture(kind: WeaponKind): THREE.CanvasTexture {
  switch (kind) {
    case 'rifle':
      return rifle();
    case 'cannon':
      return cannon();
    case 'laser':
      return laser();
    case 'bow':
      return bow();
    case 'missile':
      return missile();
    default:
      return pistol();
  }
}

function pistol(): THREE.CanvasTexture {
  return cached('weapon-pistol', () => {
    const [canvas, ctx] = canvas2d(256, 192);
    // Slide and barrel, muzzle at the right.
    ctx.fillStyle = metal(ctx, 48, 44);
    roundRect(ctx, 40, 48, 208, 44, 8);
    ctx.fill();
    ctx.fillStyle = '#15181d';
    roundRect(ctx, 196, 60, 52, 20, 4);
    ctx.fill();
    // Grip, angled back.
    ctx.fillStyle = metal(ctx, 92, 92, '#8b6a46', '#2d2016');
    ctx.beginPath();
    ctx.moveTo(74, 88);
    ctx.lineTo(132, 88);
    ctx.lineTo(112, 180);
    ctx.lineTo(48, 180);
    ctx.closePath();
    ctx.fill();
    // Trigger guard.
    ctx.strokeStyle = '#3a3f49';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(146, 104, 26, Math.PI * 0.1, Math.PI * 0.95);
    ctx.stroke();
    // A lit edge along the top.
    ctx.strokeStyle = 'rgba(236, 244, 255, 0.5)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(44, 53);
    ctx.lineTo(244, 53);
    ctx.stroke();
    return canvas;
  });
}

function rifle(): THREE.CanvasTexture {
  return cached('weapon-rifle', () => {
    const [canvas, ctx] = canvas2d(384, 160);
    // Stock.
    ctx.fillStyle = metal(ctx, 48, 72, '#9c7044', '#32210f');
    ctx.beginPath();
    ctx.moveTo(10, 56);
    ctx.lineTo(96, 48);
    ctx.lineTo(104, 124);
    ctx.lineTo(28, 132);
    ctx.closePath();
    ctx.fill();
    // Body and barrel.
    ctx.fillStyle = metal(ctx, 52, 40);
    roundRect(ctx, 92, 52, 150, 40, 6);
    ctx.fill();
    ctx.fillStyle = metal(ctx, 62, 22);
    roundRect(ctx, 236, 62, 140, 22, 6);
    ctx.fill();
    // Scope.
    ctx.fillStyle = '#1b1f26';
    roundRect(ctx, 130, 22, 96, 26, 10);
    ctx.fill();
    ctx.fillStyle = '#6ecbff';
    ctx.beginPath();
    ctx.arc(220, 35, 9, 0, Math.PI * 2);
    ctx.fill();
    // Magazine and grip.
    ctx.fillStyle = metal(ctx, 92, 56, '#555b66', '#1b1e24');
    roundRect(ctx, 150, 90, 34, 62, 6);
    ctx.fill();
    roundRect(ctx, 104, 90, 30, 50, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(236, 244, 255, 0.45)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(96, 56);
    ctx.lineTo(372, 66);
    ctx.stroke();
    return canvas;
  });
}

function cannon(): THREE.CanvasTexture {
  return cached('weapon-cannon', () => {
    const [canvas, ctx] = canvas2d(320, 192);
    // Barrel, widening towards the muzzle.
    ctx.fillStyle = metal(ctx, 44, 72, '#8e949f', '#23272e');
    ctx.beginPath();
    ctx.moveTo(24, 58);
    ctx.lineTo(276, 44);
    ctx.lineTo(276, 128);
    ctx.lineTo(24, 114);
    ctx.closePath();
    ctx.fill();
    // Reinforcing bands.
    ctx.fillStyle = '#3c424c';
    for (const x of [86, 150, 214]) {
      roundRect(ctx, x, 42, 18, 88, 5);
      ctx.fill();
    }
    // Muzzle ring and bore.
    ctx.fillStyle = '#4b525d';
    roundRect(ctx, 268, 36, 28, 104, 8);
    ctx.fill();
    ctx.fillStyle = '#0c0e12';
    ctx.beginPath();
    ctx.ellipse(288, 88, 8, 44, 0, 0, Math.PI * 2);
    ctx.fill();
    // Carriage.
    ctx.fillStyle = metal(ctx, 120, 60, '#7b5a35', '#241709');
    roundRect(ctx, 40, 118, 170, 26, 8);
    ctx.fill();
    ctx.fillStyle = '#2b2f37';
    ctx.beginPath();
    ctx.arc(96, 158, 32, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#596170';
    ctx.beginPath();
    ctx.arc(96, 158, 12, 0, Math.PI * 2);
    ctx.fill();
    return canvas;
  });
}

function laser(): THREE.CanvasTexture {
  return cached('weapon-laser', () => {
    const [canvas, ctx] = canvas2d(288, 160);
    ctx.fillStyle = metal(ctx, 40, 80, '#e2e8f2', '#232831');
    roundRect(ctx, 16, 40, 200, 80, 14);
    ctx.fill();
    // Emitter, narrowing to the lens.
    ctx.fillStyle = metal(ctx, 56, 48, '#aab2bf', '#1a1e25');
    ctx.beginPath();
    ctx.moveTo(210, 56);
    ctx.lineTo(268, 70);
    ctx.lineTo(268, 90);
    ctx.lineTo(210, 104);
    ctx.closePath();
    ctx.fill();
    const lens = ctx.createRadialGradient(268, 80, 2, 268, 80, 22);
    lens.addColorStop(0, '#ffffff');
    lens.addColorStop(0.4, '#7ad8ff');
    lens.addColorStop(1, 'rgba(60, 180, 255, 0)');
    ctx.fillStyle = lens;
    ctx.beginPath();
    ctx.arc(268, 80, 22, 0, Math.PI * 2);
    ctx.fill();
    // Cooling fins and a charge light.
    ctx.fillStyle = '#39404b';
    for (const x of [48, 76, 104]) {
      roundRect(ctx, x, 28, 14, 18, 4);
      ctx.fill();
    }
    ctx.fillStyle = '#7dffc4';
    roundRect(ctx, 44, 92, 54, 12, 6);
    ctx.fill();
    return canvas;
  });
}

function bow(): THREE.CanvasTexture {
  return cached('weapon-bow', () => {
    const [canvas, ctx] = canvas2d(192, 256);
    // Limbs, curving away from the string.
    ctx.strokeStyle = metal(ctx, 20, 216, '#b98b50', '#3a2410');
    ctx.lineWidth = 16;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(56, 24);
    ctx.quadraticCurveTo(140, 128, 56, 232);
    ctx.stroke();
    // Grip.
    ctx.fillStyle = '#2f2112';
    roundRect(ctx, 86, 104, 22, 48, 8);
    ctx.fill();
    // String, drawn back.
    ctx.strokeStyle = 'rgba(240, 240, 240, 0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(56, 24);
    ctx.lineTo(44, 128);
    ctx.lineTo(56, 232);
    ctx.stroke();
    return canvas;
  });
}

function missile(): THREE.CanvasTexture {
  return cached('weapon-missile', () => {
    const [canvas, ctx] = canvas2d(320, 176);
    // Launch tubes.
    ctx.fillStyle = metal(ctx, 28, 56, '#6f7a68', '#1d231b');
    roundRect(ctx, 20, 28, 250, 56, 10);
    ctx.fill();
    ctx.fillStyle = metal(ctx, 92, 56, '#6f7a68', '#1d231b');
    roundRect(ctx, 20, 92, 250, 56, 10);
    ctx.fill();
    ctx.fillStyle = '#0c0f0b';
    for (const y of [40, 104]) {
      ctx.beginPath();
      ctx.ellipse(266, y + 16, 9, 20, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Mount.
    ctx.fillStyle = '#2b3129';
    roundRect(ctx, 44, 20, 26, 136, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(226, 236, 220, 0.4)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(26, 34);
    ctx.lineTo(262, 34);
    ctx.stroke();
    return canvas;
  });
}

/** Width over height of each shot's picture. */
export const SHOT_ASPECT: Record<WeaponKind, number> = {
  pistol: 128 / 32,
  rifle: 160 / 28,
  cannon: 64 / 64,
  laser: 256 / 40,
  bow: 192 / 48,
  missile: 160 / 56,
};

export function shotTexture(kind: WeaponKind): THREE.CanvasTexture {
  return cached(`shot-${kind}`, () => {
    if (kind === 'cannon') {
      const [canvas, ctx] = canvas2d(64, 64);
      const ball = ctx.createRadialGradient(24, 22, 3, 32, 32, 30);
      ball.addColorStop(0, '#8c929c');
      ball.addColorStop(0.6, '#33383f');
      ball.addColorStop(1, '#0d0f12');
      ctx.fillStyle = ball;
      ctx.beginPath();
      ctx.arc(32, 32, 28, 0, Math.PI * 2);
      ctx.fill();
      return canvas;
    }
    if (kind === 'bow') {
      const [canvas, ctx] = canvas2d(192, 48);
      ctx.fillStyle = '#8a6334';
      roundRect(ctx, 20, 20, 140, 8, 4);
      ctx.fill();
      // Head.
      ctx.fillStyle = '#c9d2de';
      ctx.beginPath();
      ctx.moveTo(186, 24);
      ctx.lineTo(154, 10);
      ctx.lineTo(154, 38);
      ctx.closePath();
      ctx.fill();
      // Fletching.
      ctx.fillStyle = '#d8d8d8';
      ctx.beginPath();
      ctx.moveTo(18, 24);
      ctx.lineTo(48, 6);
      ctx.lineTo(54, 24);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(18, 24);
      ctx.lineTo(48, 42);
      ctx.lineTo(54, 24);
      ctx.closePath();
      ctx.fill();
      return canvas;
    }
    if (kind === 'missile') {
      const [canvas, ctx] = canvas2d(160, 56);
      // Flame trail behind it.
      const flame = ctx.createLinearGradient(0, 28, 70, 28);
      flame.addColorStop(0, 'rgba(255, 170, 40, 0)');
      flame.addColorStop(0.5, 'rgba(255, 180, 60, 0.85)');
      flame.addColorStop(1, 'rgba(255, 240, 200, 0.95)');
      ctx.fillStyle = flame;
      ctx.beginPath();
      ctx.moveTo(0, 28);
      ctx.lineTo(70, 10);
      ctx.lineTo(70, 46);
      ctx.closePath();
      ctx.fill();
      // Body and nose.
      ctx.fillStyle = metal(ctx, 16, 24, '#e6e9ee', '#333941');
      roundRect(ctx, 62, 16, 72, 24, 10);
      ctx.fill();
      ctx.fillStyle = '#b4252f';
      ctx.beginPath();
      ctx.moveTo(130, 16);
      ctx.lineTo(156, 28);
      ctx.lineTo(130, 40);
      ctx.closePath();
      ctx.fill();
      // Fins.
      ctx.fillStyle = '#5b626d';
      ctx.beginPath();
      ctx.moveTo(74, 16);
      ctx.lineTo(62, 2);
      ctx.lineTo(90, 16);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(74, 40);
      ctx.lineTo(62, 54);
      ctx.lineTo(90, 40);
      ctx.closePath();
      ctx.fill();
      return canvas;
    }
    // Bullets and the laser bolt: a bright head with a tail drawn behind it.
    const long = kind === 'laser';
    const [canvas, ctx] = canvas2d(long ? 256 : kind === 'rifle' ? 160 : 128, long ? 40 : kind === 'rifle' ? 28 : 32);
    const { width, height } = canvas;
    const trail = ctx.createLinearGradient(0, 0, width, 0);
    trail.addColorStop(0, 'rgba(255, 255, 255, 0)');
    trail.addColorStop(0.75, long ? 'rgba(130, 220, 255, 0.85)' : 'rgba(255, 210, 120, 0.8)');
    trail.addColorStop(1, '#ffffff');
    ctx.fillStyle = trail;
    roundRect(ctx, 0, height * 0.3, width, height * 0.4, height * 0.2);
    ctx.fill();
    const head = ctx.createRadialGradient(width - height * 0.5, height / 2, 1, width - height * 0.5, height / 2, height * 0.6);
    head.addColorStop(0, '#ffffff');
    head.addColorStop(1, long ? 'rgba(120, 210, 255, 0)' : 'rgba(255, 190, 90, 0)');
    ctx.fillStyle = head;
    ctx.beginPath();
    ctx.arc(width - height * 0.5, height / 2, height * 0.6, 0, Math.PI * 2);
    ctx.fill();
    return canvas;
  });
}

/** The flash at the muzzle, drawn pointing right. */
export function flashTexture(): THREE.CanvasTexture {
  return cached('weapon-flash', () => {
    const [canvas, ctx] = canvas2d(128, 128);
    const glow = ctx.createRadialGradient(40, 64, 2, 40, 64, 60);
    glow.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    glow.addColorStop(0.35, 'rgba(255, 214, 120, 0.75)');
    glow.addColorStop(1, 'rgba(255, 150, 40, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(40, 64, 60, 0, Math.PI * 2);
    ctx.fill();
    // Spikes, so it reads as a flash rather than a lamp.
    ctx.fillStyle = 'rgba(255, 236, 190, 0.85)';
    for (const angle of [0, 0.5, -0.5, 1.1, -1.1]) {
      ctx.beginPath();
      ctx.moveTo(40, 64);
      ctx.lineTo(40 + Math.cos(angle) * 84, 64 + Math.sin(angle) * 84);
      ctx.lineTo(40 + Math.cos(angle + 0.16) * 30, 64 + Math.sin(angle + 0.16) * 30);
      ctx.closePath();
      ctx.fill();
    }
    return canvas;
  });
}
