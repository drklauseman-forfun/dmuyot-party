import * as THREE from 'three';

/**
 * Dragons, drawn once each on a canvas — the same approach as the hands, the
 * weapons and the whale, and lit from the top left like all of them.
 *
 * Three of them, and they are built differently because they move
 * differently:
 *
 * - The **Chinese** dragon is one long picture laid out straight along a
 *   strip, head at the right, exactly as the whale is. It is the shader that
 *   makes it ripple, so nothing here is drawn curved; drawn with a curve
 *   already in it, a second one from the shader would fight it.
 * - The **face** is a head looking straight out, and the only one that does
 *   not travel.
 * - The **western** dragon is a side-on body with its wings as separate
 *   pictures, because they beat. The wing points straight up from a shoulder
 *   at the bottom edge of its canvas, so the component can hinge it there —
 *   the way a clock's hands turn about the hub.
 *
 * Everything stays inside its canvas. Nothing reports a clipped edge, and a
 * horn or a claw that runs off one is simply gone.
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

export type DragonKind = 'chinese' | 'face' | 'western';

const CHINESE_W = 2048;
const CHINESE_H = 320;
const FACE_W = 512;
const FACE_H = 512;
const WESTERN_W = 1024;
const WESTERN_H = 512;
const WING_W = 512;
const WING_H = 560;

export const CHINESE_ASPECT = CHINESE_W / CHINESE_H;
export const FACE_ASPECT = FACE_W / FACE_H;
export const WESTERN_ASPECT = WESTERN_W / WESTERN_H;
export const WING_ASPECT = WING_W / WING_H;
/**
 * Where the wing's shoulder sits in its picture, as a fraction up from the
 * bottom edge, and where the body's shoulder sits in its picture. The
 * component puts one on the other.
 */
export const WING_PIVOT = 22 / 560;
export const WESTERN_SHOULDER = { x: 0.68, y: 0.58 };

/** A line of spines along a back, from one end of it to the other. */
function spines(
  ctx: CanvasRenderingContext2D,
  from: number,
  to: number,
  edge: (x: number) => number,
  height: (t: number) => number,
  fill: string,
): void {
  const count = 26;
  ctx.fillStyle = fill;
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const x = from + (to - from) * t;
    const step = (to - from) / count;
    const tall = height(t);
    if (tall <= 1) continue;
    ctx.beginPath();
    ctx.moveTo(x - step * 0.42, edge(x));
    ctx.lineTo(x + step * 0.1, edge(x) - tall);
    ctx.lineTo(x + step * 0.42, edge(x));
    ctx.closePath();
    ctx.fill();
  }
}

/** Rows of overlapping scallops, the way scales sit on a hide. */
function scales(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  step: number,
  stroke: string,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = Math.max(1, step * 0.08);
  for (let row = 0; y + row * step * 0.6 < y + height + step; row++) {
    const offset = row % 2 === 0 ? 0 : step / 2;
    for (let column = -1; x + column * step + offset < x + width + step; column++) {
      ctx.beginPath();
      ctx.arc(x + column * step + offset, y + row * step * 0.6, step * 0.5, Math.PI * 0.08, Math.PI * 0.92);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ Chinese */

/**
 * The serpent's body: straight along the strip, and nearly even in thickness
 * rather than tapering like a lizard. The nose is at the right-hand end, as
 * the whale's is, because the bending shader measures its wave from there.
 *
 * The first one tapered from a fat neck to a stubby tail over a strip four
 * times as long as it was tall, and read as a newt. A Chinese dragon is a
 * snake with a lion's head: long, of one thickness for most of its length,
 * and only thinning right at the tail.
 */
function serpentBody(): Path2D {
  const mid = CHINESE_H / 2;
  const body = new Path2D();
  body.moveTo(1500, mid - 38);
  body.bezierCurveTo(1200, mid - 36, 900, mid - 32, 620, mid - 26);
  body.bezierCurveTo(420, mid - 21, 240, mid - 15, 120, mid - 8);
  // The tail, drawn to a point rather than cut off.
  body.lineTo(38, mid + 1);
  body.lineTo(120, mid + 11);
  body.bezierCurveTo(240, mid + 20, 420, mid + 27, 620, mid + 34);
  body.bezierCurveTo(900, mid + 42, 1200, mid + 48, 1500, mid + 52);
  body.closePath();
  return body;
}

/** A flame-shaped tuft, which is what the mane and the tail fin are made of. */
function flame(ctx: CanvasRenderingContext2D, x: number, y: number, length: number, angle: number, width: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, -width);
  ctx.quadraticCurveTo(length * 0.55, -width * 1.5, length, 0);
  ctx.quadraticCurveTo(length * 0.5, width * 0.6, 0, width);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function chineseCanvas(): HTMLCanvasElement {
  const [canvas, ctx] = canvas2d(CHINESE_W, CHINESE_H);
  const mid = CHINESE_H / 2;

  const hide = ctx.createLinearGradient(0, mid - 50, 0, mid + 60);
  hide.addColorStop(0, '#e05a3c');
  hide.addColorStop(0.45, '#bb3421');
  hide.addColorStop(1, '#75190f');

  // The dorsal ridge, drawn first so the body covers its roots.
  const back = (x: number) => mid - 38 + (1500 - x) * 0.0205;
  spines(ctx, 110, 1460, back, (t) => 4 + 12 * Math.sin(Math.PI * Math.min(1, t * 1.1)) * (0.75 + 0.25 * Math.sin(t * 37)), '#f3c84f');

  // The tail fin: a few blades off the last stretch of tail.
  ctx.fillStyle = '#f3c84f';
  flame(ctx, 150, mid + 4, 120, 2.5, 13);
  flame(ctx, 110, mid + 2, 96, 3.5, 11);
  flame(ctx, 185, mid + 6, 78, 1.9, 10);

  const body = serpentBody();
  ctx.fillStyle = hide;
  ctx.fill(body);

  ctx.save();
  ctx.clip(body);
  // A pale belly along the underside, rather than the row of spots the first
  // one had, which read as a salamander.
  ctx.fillStyle = 'rgba(240, 188, 120, 0.85)';
  ctx.beginPath();
  ctx.moveTo(60, mid + 2);
  ctx.bezierCurveTo(400, mid + 20, 1000, mid + 34, 1500, mid + 40);
  ctx.lineTo(1500, mid + 56);
  ctx.bezierCurveTo(1000, mid + 50, 400, mid + 30, 60, mid + 12);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(150, 90, 40, 0.5)';
  ctx.lineWidth = 2;
  for (let x = 140; x < 1480; x += 34) {
    const t = (x - 60) / 1440;
    ctx.beginPath();
    ctx.moveTo(x, mid + 4 + t * 36);
    ctx.lineTo(x + 6, mid + 16 + t * 38);
    ctx.stroke();
  }
  scales(ctx, 40, mid - 46, 1480, 60, 21, '#85210f');
  // The light is from the upper left, so the top of the coil catches it.
  ctx.strokeStyle = 'rgba(255, 160, 120, 0.75)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(1480, mid - 31);
  ctx.bezierCurveTo(1100, mid - 28, 640, mid - 20, 180, mid - 6);
  ctx.stroke();
  ctx.restore();

  // Two near legs, with claws spread as if swimming through the air.
  const leg = (x: number, scale: number) => {
    ctx.save();
    ctx.translate(x, mid + 34);
    ctx.scale(scale, scale);
    ctx.fillStyle = '#a62c1b';
    ctx.beginPath();
    ctx.moveTo(-18, -8);
    ctx.bezierCurveTo(-30, 22, -24, 48, -6, 60);
    ctx.bezierCurveTo(14, 52, 22, 24, 18, -8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#f2dca0';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    for (const [dx, dy] of [[-26, 78], [-6, 86], [14, 76]]) {
      ctx.beginPath();
      ctx.moveTo(-4, 54);
      ctx.quadraticCurveTo(dx * 0.6, 72, dx, dy);
      ctx.stroke();
    }
    ctx.restore();
  };
  leg(1180, 1.5);
  leg(650, 1.25);

  // Whiskers, streaming a long way back over the body. Drawn before the head
  // so they leave from under it.
  ctx.strokeStyle = '#f3c84f';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(1960, mid + side * 8 + 4);
    ctx.bezierCurveTo(1700, mid + side * 74, 1320, mid + side * 96, 980, mid + side * 52);
    ctx.stroke();
  }

  // The mane: flame tufts round the neck, above and below.
  ctx.fillStyle = '#f3c84f';
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const x = 1420 + t * 120;
    // Laid back along the neck rather than thrown out from it: spread round
    // the head, the first mane read as a sea urchin.
    flame(ctx, x, mid - 36 - t * 4, 44 + 18 * Math.sin(Math.PI * t), Math.PI - 0.5 + t * 0.26, 10);
    flame(ctx, x - 16, mid + 46 + t * 4, 40 + 16 * Math.sin(Math.PI * t), Math.PI + 0.5 - t * 0.26, 9);
  }

  // The head: a long snout to the right, jaw open.
  const head = new Path2D();
  head.moveTo(1500, mid - 44);
  head.bezierCurveTo(1600, mid - 64, 1720, mid - 68, 1820, mid - 56);
  head.bezierCurveTo(1900, mid - 46, 1968, mid - 30, 1996, mid - 12);
  head.bezierCurveTo(2008, mid - 2, 2002, mid + 8, 1980, mid + 10);
  head.bezierCurveTo(1900, mid + 14, 1800, mid + 18, 1716, mid + 26);
  head.bezierCurveTo(1620, mid + 38, 1540, mid + 50, 1500, mid + 58);
  head.closePath();
  ctx.fillStyle = '#cc4028';
  ctx.fill(head);

  // The lower jaw, dropped open under the snout.
  ctx.fillStyle = '#8d2317';
  ctx.beginPath();
  ctx.moveTo(1730, mid + 30);
  ctx.bezierCurveTo(1810, mid + 40, 1920, mid + 52, 1972, mid + 66);
  ctx.bezierCurveTo(1930, mid + 84, 1800, mid + 76, 1700, mid + 58);
  ctx.closePath();
  ctx.fill();

  // Teeth at the front of both jaws.
  ctx.fillStyle = '#f8f2de';
  for (let i = 0; i < 5; i++) {
    const x = 1856 + i * 26;
    ctx.beginPath();
    ctx.moveTo(x, mid + 10);
    ctx.lineTo(x + 6, mid + 30);
    ctx.lineTo(x + 13, mid + 10);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + 4, mid + 56);
    ctx.lineTo(x + 10, mid + 36);
    ctx.lineTo(x + 17, mid + 56);
    ctx.closePath();
    ctx.fill();
  }

  // Antlers, swept back over the neck, with a branch on each.
  ctx.strokeStyle = '#f2dca0';
  ctx.lineCap = 'round';
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(1800, mid - 58);
  ctx.bezierCurveTo(1740, mid - 112, 1640, mid - 140, 1540, mid - 138);
  ctx.stroke();
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(1690, mid - 122);
  ctx.bezierCurveTo(1670, mid - 150, 1640, mid - 158, 1606, mid - 152);
  ctx.stroke();
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(1862, mid - 52);
  ctx.bezierCurveTo(1830, mid - 92, 1770, mid - 110, 1712, mid - 106);
  ctx.stroke();

  // The eye, under a heavy brow.
  ctx.fillStyle = '#f9edc8';
  ctx.beginPath();
  ctx.ellipse(1866, mid - 26, 19, 14, -0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1d0c05';
  ctx.beginPath();
  ctx.ellipse(1872, mid - 25, 6, 12, -0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#8d2317';
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(1836, mid - 46);
  ctx.quadraticCurveTo(1872, mid - 54, 1900, mid - 34);
  ctx.stroke();

  // A nostril near the tip.
  ctx.fillStyle = '#5c160e';
  ctx.beginPath();
  ctx.ellipse(1968, mid - 14, 9, 6, 0.3, 0, Math.PI * 2);
  ctx.fill();

  return canvas;
}

/* --------------------------------------------------------------------- face */

function faceCanvas(): HTMLCanvasElement {
  const [canvas, ctx] = canvas2d(FACE_W, FACE_H);
  const cx = FACE_W / 2;

  // Horns first, so the skull covers where they enter it.
  const horn = (side: number) => {
    ctx.save();
    ctx.translate(cx, 150);
    ctx.scale(side, 1);
    const shape = new Path2D();
    shape.moveTo(78, -18);
    shape.bezierCurveTo(128, -40, 176, -78, 198, -126);
    shape.bezierCurveTo(206, -112, 204, -78, 186, -46);
    shape.bezierCurveTo(166, -10, 124, 16, 86, 22);
    shape.closePath();
    const grain = ctx.createLinearGradient(80, 20, 196, -120);
    grain.addColorStop(0, '#9c9078');
    grain.addColorStop(1, '#e6dcc0');
    ctx.fillStyle = grain;
    ctx.fill(shape);
    // Ridges across it.
    ctx.strokeStyle = '#7d7260';
    ctx.lineWidth = 4;
    for (let i = 1; i < 5; i++) {
      const t = i / 5;
      ctx.beginPath();
      ctx.moveTo(84 + t * 96, -10 - t * 86);
      ctx.lineTo(96 + t * 100, 14 - t * 92);
      ctx.stroke();
    }
    ctx.restore();
  };
  horn(1);
  horn(-1);

  // Cheek frills, behind the jaw on both sides.
  const frill = (side: number) => {
    ctx.save();
    ctx.translate(cx, 300);
    ctx.scale(side, 1);
    ctx.fillStyle = '#2c4434';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(110, -30 + i * 34);
      ctx.lineTo(196 + i * 10, 2 + i * 44);
      ctx.lineTo(112, 8 + i * 34);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  };
  frill(1);
  frill(-1);

  // The skull: broad across the brow, narrowing to the snout.
  const skull = new Path2D();
  skull.moveTo(cx - 128, 170);
  skull.bezierCurveTo(cx - 140, 120, cx - 96, 86, cx, 82);
  skull.bezierCurveTo(cx + 96, 86, cx + 140, 120, cx + 128, 170);
  skull.bezierCurveTo(cx + 124, 232, cx + 104, 282, cx + 80, 326);
  skull.bezierCurveTo(cx + 54, 374, cx + 28, 404, cx, 412);
  skull.bezierCurveTo(cx - 28, 404, cx - 54, 374, cx - 80, 326);
  skull.bezierCurveTo(cx - 104, 282, cx - 124, 232, cx - 128, 170);
  skull.closePath();
  const hide = ctx.createLinearGradient(cx - 120, 90, cx + 120, 400);
  hide.addColorStop(0, '#5c7d5f');
  hide.addColorStop(0.5, '#3f5f4a');
  hide.addColorStop(1, '#223729');
  ctx.fillStyle = hide;
  ctx.fill(skull);

  ctx.save();
  ctx.clip(skull);
  scales(ctx, cx - 140, 90, 280, 340, 30, '#2a4132');
  // The light is from the upper left, so that side of the muzzle is lifted.
  ctx.fillStyle = 'rgba(190, 220, 180, 0.16)';
  ctx.beginPath();
  ctx.ellipse(cx - 56, 180, 54, 120, 0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Brow ridges.
  ctx.fillStyle = '#2b4233';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + side * 26, 150);
    ctx.quadraticCurveTo(cx + side * 86, 132, cx + side * 116, 168);
    ctx.quadraticCurveTo(cx + side * 84, 160, cx + side * 30, 172);
    ctx.closePath();
    ctx.fill();
  }

  // The eyes. Bright, because this layer is drawn after the bloom and nothing
  // here can glow — what reads as a lit eye has to be painted as one.
  for (const side of [-1, 1]) {
    const ex = cx + side * 68;
    const ey = 190;
    ctx.fillStyle = '#20150a';
    ctx.beginPath();
    ctx.ellipse(ex, ey, 40, 27, side * 0.16, 0, Math.PI * 2);
    ctx.fill();
    const iris = ctx.createRadialGradient(ex - side * 6, ey - 6, 3, ex, ey, 30);
    iris.addColorStop(0, '#fff3c8');
    iris.addColorStop(0.45, '#ffb53d');
    iris.addColorStop(1, '#a4560c');
    ctx.fillStyle = iris;
    ctx.beginPath();
    ctx.ellipse(ex, ey, 32, 20, side * 0.16, 0, Math.PI * 2);
    ctx.fill();
    // A vertical slit, which is what makes it a reptile's eye.
    ctx.fillStyle = '#140c04';
    ctx.beginPath();
    ctx.ellipse(ex, ey, 6, 18, side * 0.16, 0, Math.PI * 2);
    ctx.fill();
  }

  // Nostrils.
  ctx.fillStyle = '#1a2a20';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + side * 26, 330, 12, 9, side * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // The mouth, open a little, with teeth in the gap.
  ctx.fillStyle = '#16100c';
  ctx.beginPath();
  ctx.moveTo(cx - 86, 372);
  ctx.quadraticCurveTo(cx, 352, cx + 86, 372);
  ctx.quadraticCurveTo(cx, 414, cx - 86, 372);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f2ecd8';
  for (let i = -3; i <= 3; i++) {
    const x = cx + i * 24;
    const drop = 12 + (3 - Math.abs(i)) * 3;
    ctx.beginPath();
    ctx.moveTo(x - 9, 366);
    ctx.lineTo(x, 366 + drop);
    ctx.lineTo(x + 9, 366);
    ctx.closePath();
    ctx.fill();
  }
  // Two fangs from the lower jaw, pointing up past the lip.
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + side * 74, 392);
    ctx.lineTo(cx + side * 80, 356);
    ctx.lineTo(cx + side * 88, 392);
    ctx.closePath();
    ctx.fill();
  }

  return canvas;
}

/* ------------------------------------------------------------------ western */

function westernCanvas(): HTMLCanvasElement {
  const [canvas, ctx] = canvas2d(WESTERN_W, WESTERN_H);

  const hide = ctx.createLinearGradient(0, 140, 0, 430);
  hide.addColorStop(0, '#7b8f66');
  hide.addColorStop(0.5, '#55683f');
  hide.addColorStop(1, '#2f3a22');

  // Spines down the back and along the tail, drawn under the body.
  const spineLine = (x: number) => 250 - (x - 120) * 0.075;
  spines(ctx, 150, 640, spineLine, (t) => 6 + 26 * t, '#cfc3a4');

  // The body: chest at the right, hips in the middle, a long tail to the left.
  const body = new Path2D();
  body.moveTo(760, 212);
  // Back, over the shoulders and hips, down the tail.
  body.bezierCurveTo(700, 186, 600, 190, 500, 212);
  body.bezierCurveTo(400, 234, 280, 258, 170, 284);
  body.bezierCurveTo(120, 296, 80, 308, 46, 320);
  // The tail's spade tip.
  body.lineTo(22, 300);
  body.lineTo(40, 338);
  body.lineTo(60, 346);
  // Underside, back up to the chest.
  body.bezierCurveTo(130, 332, 250, 310, 360, 300);
  body.bezierCurveTo(470, 290, 580, 300, 660, 320);
  body.bezierCurveTo(716, 334, 760, 318, 778, 276);
  body.closePath();
  ctx.fillStyle = hide;
  ctx.fill(body);

  ctx.save();
  ctx.clip(body);
  scales(ctx, 20, 170, 780, 190, 28, '#36452a');
  ctx.fillStyle = 'rgba(214, 232, 186, 0.18)';
  ctx.beginPath();
  ctx.ellipse(560, 232, 180, 34, -0.12, 0, Math.PI * 2);
  ctx.fill();
  // Belly plates.
  ctx.fillStyle = '#c9b183';
  for (let x = 120; x < 700; x += 40) {
    ctx.beginPath();
    ctx.ellipse(x, 316 - (x - 120) * 0.012, 16, 9, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Hind leg, tucked, and a foreleg under the chest.
  const limb = (x: number, y: number, scale: number, lean: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(lean);
    ctx.scale(scale, scale);
    ctx.fillStyle = '#44542f';
    ctx.beginPath();
    ctx.moveTo(-34, -10);
    ctx.bezierCurveTo(-52, 34, -36, 72, -4, 86);
    ctx.bezierCurveTo(26, 74, 36, 34, 24, -10);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ded3b8';
    for (const claw of [-24, -6, 14]) {
      ctx.beginPath();
      ctx.moveTo(claw - 7, 80);
      ctx.lineTo(claw - 2, 110);
      ctx.lineTo(claw + 8, 82);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  };
  limb(430, 300, 1, 0.22);
  limb(676, 312, 0.86, -0.12);

  // The neck, rising from the chest to the head.
  const neck = new Path2D();
  neck.moveTo(742, 230);
  neck.bezierCurveTo(776, 196, 806, 160, 836, 132);
  neck.bezierCurveTo(856, 114, 876, 104, 894, 102);
  neck.bezierCurveTo(900, 122, 892, 146, 876, 162);
  neck.bezierCurveTo(846, 192, 800, 234, 772, 268);
  neck.closePath();
  ctx.fillStyle = '#5e7246';
  ctx.fill(neck);

  // The head, snout to the upper right.
  const head = new Path2D();
  head.moveTo(862, 128);
  head.bezierCurveTo(880, 96, 920, 72, 968, 64);
  head.bezierCurveTo(992, 62, 1002, 74, 994, 88);
  head.bezierCurveTo(984, 104, 960, 116, 938, 124);
  head.bezierCurveTo(916, 132, 890, 142, 872, 152);
  head.closePath();
  ctx.fillStyle = '#6a8050';
  ctx.fill(head);
  // The jaw, open under it.
  ctx.fillStyle = '#3d4b2c';
  ctx.beginPath();
  ctx.moveTo(900, 138);
  ctx.bezierCurveTo(936, 140, 970, 134, 988, 122);
  ctx.bezierCurveTo(980, 146, 946, 164, 908, 162);
  ctx.closePath();
  ctx.fill();
  // Teeth.
  ctx.fillStyle = '#f2ecd8';
  for (let i = 0; i < 4; i++) {
    const x = 926 + i * 18;
    ctx.beginPath();
    ctx.moveTo(x, 126);
    ctx.lineTo(x + 5, 142);
    ctx.lineTo(x + 10, 126);
    ctx.closePath();
    ctx.fill();
  }
  // Horns, swept back off the skull.
  ctx.strokeStyle = '#ded3b8';
  ctx.lineWidth = 12;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(886, 96);
  ctx.bezierCurveTo(860, 70, 826, 60, 796, 64);
  ctx.stroke();
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(876, 112);
  ctx.bezierCurveTo(850, 96, 824, 92, 804, 96);
  ctx.stroke();
  // The eye.
  ctx.fillStyle = '#ffc24d';
  ctx.beginPath();
  ctx.ellipse(916, 104, 11, 8, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#18100a';
  ctx.beginPath();
  ctx.ellipse(918, 104, 3, 7, -0.3, 0, Math.PI * 2);
  ctx.fill();

  return canvas;
}

/**
 * One wing, rising from a shoulder at the bottom edge of the picture so the
 * component can hinge it there and beat it.
 *
 * Drawn as an arm up the leading edge to a wrist, four fingers fanning out of
 * that wrist, and membrane sagging between each pair. The first one was a
 * single triangle of skin and read as a sail: it is the finger bones dividing
 * it into panels, and the scallops they leave along the trailing edge, that
 * make it a wing.
 */
function wingCanvas(): HTMLCanvasElement {
  const [canvas, ctx] = canvas2d(WING_W, WING_H);
  // The arm runs up the RIGHT side — the leading edge, towards the head —
  // and every finger fans out to the LEFT of it, so the membrane they hold
  // trails back over the dragon. Fingers drawn on the same side as the arm
  // enclose almost nothing, and the whole wing comes out a sliver.
  const shoulder = { x: 356, y: WING_H - 22 };
  const elbow = { x: 420, y: 330 };
  const wrist = { x: 430, y: 96 };
  // Each finger ends in a point and they differ a lot in length, so the
  // outline is a spiked fan. Tips of nearly equal length, with the membrane
  // bellying between them, gave a rounded mass that read as a shell.
  const fingers = [
    { x: 92, y: 18 },
    { x: 36, y: 206 },
    { x: 84, y: 376 },
    { x: 176, y: 482 },
  ];

  // A panel of membrane sags away from the wrist between two fingers.
  const sag = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;
    return { x: midX + (midX - wrist.x) * 0.055, y: midY + (midY - wrist.y) * 0.055 };
  };

  const leadingEdge = (path: Path2D) => {
    path.moveTo(shoulder.x, shoulder.y);
    path.bezierCurveTo(elbow.x, elbow.y, wrist.x + 18, wrist.y + 92, wrist.x, wrist.y);
  };

  const membrane = new Path2D();
  leadingEdge(membrane);
  membrane.lineTo(fingers[0].x, fingers[0].y);
  for (let i = 0; i < fingers.length - 1; i++) {
    const control = sag(fingers[i], fingers[i + 1]);
    membrane.quadraticCurveTo(control.x, control.y, fingers[i + 1].x, fingers[i + 1].y);
  }
  // The last panel runs back down to the shoulder, along the dragon's flank.
  membrane.quadraticCurveTo(214, WING_H - 92, shoulder.x, shoulder.y);
  membrane.closePath();

  const skin = ctx.createLinearGradient(shoulder.x, shoulder.y, fingers[1].x, fingers[1].y);
  skin.addColorStop(0, '#5a3e2e');
  skin.addColorStop(0.55, '#8a6749');
  skin.addColorStop(1, '#b08a67');
  ctx.fillStyle = skin;
  ctx.fill(membrane);

  // Darker in the hollows, so the panels are not one flat sheet.
  ctx.strokeStyle = 'rgba(48, 29, 18, 0.5)';
  ctx.lineWidth = 4;
  for (let i = 0; i < fingers.length - 1; i++) {
    const control = sag(fingers[i], fingers[i + 1]);
    ctx.beginPath();
    ctx.moveTo(fingers[i].x, fingers[i].y);
    ctx.quadraticCurveTo(control.x, control.y, fingers[i + 1].x, fingers[i + 1].y);
    ctx.stroke();
  }

  // The bones: the arm up the leading edge, thickest, then each finger.
  ctx.strokeStyle = '#d8ccab';
  ctx.lineCap = 'round';
  ctx.lineWidth = 17;
  const arm = new Path2D();
  leadingEdge(arm);
  ctx.stroke(arm);
  for (let i = 0; i < fingers.length; i++) {
    ctx.lineWidth = 12 - i * 1.8;
    ctx.beginPath();
    ctx.moveTo(wrist.x, wrist.y);
    const bend = {
      x: (wrist.x + fingers[i].x) / 2 + (fingers[i].x - wrist.x) * 0.06,
      y: (wrist.y + fingers[i].y) / 2 + 14,
    };
    ctx.quadraticCurveTo(bend.x, bend.y, fingers[i].x, fingers[i].y);
    ctx.stroke();
  }

  // A claw at the wrist, as a bat has.
  ctx.fillStyle = '#ded3b8';
  ctx.beginPath();
  ctx.moveTo(wrist.x - 4, wrist.y + 10);
  ctx.lineTo(wrist.x + 30, wrist.y - 44);
  ctx.lineTo(wrist.x + 18, wrist.y + 22);
  ctx.closePath();
  ctx.fill();

  return canvas;
}

export function dragonTexture(kind: DragonKind): THREE.CanvasTexture {
  if (kind === 'chinese') return cached('chinese', chineseCanvas);
  if (kind === 'face') return cached('face', faceCanvas);
  return cached('western', westernCanvas);
}

export function dragonWing(): THREE.CanvasTexture {
  return cached('wing', wingCanvas);
}

export function dragonAspect(kind: DragonKind): number {
  if (kind === 'chinese') return CHINESE_ASPECT;
  if (kind === 'face') return FACE_ASPECT;
  return WESTERN_ASPECT;
}
