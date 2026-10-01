import * as THREE from 'three';

/**
 * The creatures: a whale, and the small things that scurry along the edges.
 *
 * Drawn pale and soft rather than in their own colours, because they are
 * shown as light — the effect tints them and adds them to the frame, which is
 * what makes the whale read as a ghost of a whale rather than a picture of
 * one.
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

/** mulberry32, so the whale's inner lights fall in the same places every time. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WHALE_WIDTH = 1024;
const WHALE_HEIGHT = 320;
export const WHALE_ASPECT = WHALE_WIDTH / WHALE_HEIGHT;
export const CRITTER_ASPECT = 128 / 96;

/** The body's outline, nose to the right, flukes left off. */
function whaleOutline(): Path2D {
  const body = new Path2D();
  body.moveTo(1004, 150);
  // The top of the head, broad and flat, back to the blowholes.
  body.bezierCurveTo(992, 126, 952, 112, 900, 108);
  body.bezierCurveTo(848, 104, 790, 94, 740, 90);
  // The back, and the small dorsal fin set well back on it.
  body.bezierCurveTo(680, 86, 610, 86, 560, 90);
  body.bezierCurveTo(510, 94, 470, 100, 444, 104);
  body.bezierCurveTo(436, 92, 424, 80, 410, 78);
  body.bezierCurveTo(402, 90, 398, 102, 388, 110);
  // The tail stock, narrowing to where the flukes join.
  body.bezierCurveTo(336, 120, 274, 134, 222, 144);
  body.bezierCurveTo(204, 147, 190, 150, 178, 152);
  body.lineTo(178, 162);
  // Underneath: the tail stock, the belly, the grooved throat, the jaw.
  body.bezierCurveTo(232, 172, 294, 190, 364, 206);
  body.bezierCurveTo(436, 226, 506, 238, 570, 242);
  body.bezierCurveTo(650, 246, 730, 238, 790, 224);
  body.bezierCurveTo(866, 208, 942, 190, 986, 172);
  body.bezierCurveTo(998, 166, 1004, 158, 1004, 150);
  body.closePath();
  return body;
}

/**
 * The flukes, seen a little from below: the near blade broad and swept down,
 * the far one smaller and dimmer above it. Flukes lie flat, so a whale seen
 * side on shows them turned like this or not at all; drawn as two equal
 * blades, upright, they made the first whale a fish.
 */
function flukes(): { near: Path2D; far: Path2D } {
  // Both blades broad, as flukes are: the first near blade came back so
  // close along itself that once the tail bent it was a spike.
  const near = new Path2D();
  near.moveTo(186, 160);
  near.bezierCurveTo(156, 180, 104, 222, 44, 252);
  near.bezierCurveTo(70, 256, 100, 242, 118, 220);
  near.bezierCurveTo(126, 206, 130, 188, 140, 170);
  near.closePath();
  const far = new Path2D();
  far.moveTo(184, 150);
  far.bezierCurveTo(156, 132, 110, 100, 60, 74);
  far.bezierCurveTo(84, 72, 108, 88, 122, 110);
  far.bezierCurveTo(130, 124, 136, 138, 146, 150);
  far.closePath();
  return { near, far };
}

/** The long pectoral fin a humpback is known by, hanging back and down. */
function pectoral(): Path2D {
  const fin = new Path2D();
  fin.moveTo(764, 222);
  fin.bezierCurveTo(736, 250, 652, 280, 560, 294);
  fin.bezierCurveTo(520, 300, 486, 302, 466, 296);
  fin.bezierCurveTo(520, 282, 604, 260, 692, 234);
  fin.closePath();
  return fin;
}

/**
 * A humpback, side on and nose to the right, made of light: a pale body you
 * can half see through, an edge that glows, the grooves of its throat, a long
 * fin and its flukes, and small lights scattered inside it.
 */
export function whaleBody(): THREE.CanvasTexture {
  return cached('whale-humpback', () => {
    const [canvas, ctx] = canvas2d(WHALE_WIDTH, WHALE_HEIGHT);
    const body = whaleOutline();
    const { near, far } = flukes();
    const fin = pectoral();

    const glowing = (path: Path2D, fill: string | CanvasGradient, rim: string, width: number) => {
      ctx.save();
      ctx.fillStyle = fill;
      ctx.fill(path);
      ctx.shadowColor = 'rgba(160, 226, 255, 0.95)';
      ctx.shadowBlur = 18;
      ctx.strokeStyle = rim;
      ctx.lineWidth = width;
      ctx.stroke(path);
      ctx.restore();
    };

    // The far fluke first: it is behind everything.
    glowing(far, 'rgba(120, 186, 232, 0.28)', 'rgba(206, 240, 255, 0.6)', 3);

    // The body, lighter along the back than the belly, as if lit from above.
    const skin = ctx.createLinearGradient(0, 86, 0, 246);
    skin.addColorStop(0, 'rgba(214, 244, 255, 0.55)');
    skin.addColorStop(0.55, 'rgba(150, 208, 244, 0.38)');
    skin.addColorStop(1, 'rgba(110, 176, 228, 0.3)');
    glowing(body, skin, 'rgba(232, 250, 255, 0.95)', 4);

    // Inside the body: a soft light at the head, the grooves of the throat,
    // and small lights scattered through it, like something deep down.
    ctx.save();
    ctx.clip(body);
    const heart = ctx.createRadialGradient(800, 150, 10, 760, 160, 260);
    heart.addColorStop(0, 'rgba(236, 252, 255, 0.35)');
    heart.addColorStop(1, 'rgba(236, 252, 255, 0)');
    ctx.fillStyle = heart;
    ctx.fillRect(500, 60, 520, 200);

    // The throat's grooves run from the chin back along the belly, each a
    // little above the last, following its curve.
    ctx.strokeStyle = 'rgba(214, 244, 255, 0.38)';
    ctx.lineWidth = 2;
    for (let k = 0; k < 7; k++) {
      ctx.beginPath();
      ctx.moveTo(978 - k * 6, 168 - k * 2);
      ctx.quadraticCurveTo(790, 218 - k * 6, 586, 236 - k * 7);
      ctx.stroke();
    }

    const random = seededRandom(7);
    for (let i = 0; i < 90; i++) {
      const x = 200 + random() * 800;
      const y = 90 + random() * 150;
      const r = 0.8 + random() * 2.6;
      ctx.fillStyle = `rgba(240, 252, 255, ${0.35 + random() * 0.6})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // The knobs on its head and jaw.
    ctx.fillStyle = 'rgba(236, 252, 255, 0.75)';
    for (const [x, y, r] of [
      [982, 140, 3.5], [958, 128, 3.5], [932, 120, 3], [906, 116, 3], [880, 113, 2.5],
      [978, 168, 3], [952, 176, 3], [926, 182, 2.5],
    ] as const) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // The mouth line, sweeping back and down to its corner, and the eye
    // just above it.
    ctx.save();
    ctx.shadowColor = 'rgba(160, 226, 255, 0.9)';
    ctx.shadowBlur = 8;
    ctx.strokeStyle = 'rgba(232, 250, 255, 0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(1000, 154);
    ctx.bezierCurveTo(960, 164, 896, 174, 846, 182);
    ctx.quadraticCurveTo(816, 186, 800, 196);
    ctx.stroke();
    ctx.fillStyle = 'rgba(250, 254, 255, 0.95)';
    ctx.beginPath();
    ctx.arc(812, 174, 5, 0, Math.PI * 2);
    ctx.fill();
    // The blowhole.
    ctx.beginPath();
    ctx.moveTo(752, 92);
    ctx.quadraticCurveTo(762, 88, 772, 92);
    ctx.stroke();
    ctx.restore();

    // The long fin, in front of the body, with the knobbled leading edge a
    // humpback's has.
    glowing(fin, 'rgba(190, 232, 255, 0.42)', 'rgba(236, 252, 255, 0.9)', 3);
    ctx.fillStyle = 'rgba(236, 252, 255, 0.7)';
    for (let k = 1; k < 7; k++) {
      const t = k / 7;
      ctx.beginPath();
      ctx.arc(764 - t * 290, 222 + t * 72 + Math.sin(t * Math.PI) * 6, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // The near fluke, last, in front of the tail stock.
    glowing(near, 'rgba(176, 226, 255, 0.45)', 'rgba(236, 252, 255, 0.95)', 3);
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
