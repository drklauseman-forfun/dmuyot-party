import { sanitizeValue } from './params';
import type {
  ColorListSpec,
  ColorSpec,
  HandListSpec,
  NumberSpec,
  ParamSpec,
  PointSpec,
  ScaleSpec,
  SelectOption,
  SelectSpec,
  Vec3Spec,
} from './params';
import type { ClockHand, VFXModuleConfig, VFXModuleType } from './types';

/**
 * Every effect, described for the animation builder: what each parameter is
 * called, what it does, what it starts at, and how far it may go.
 *
 * This is the fourth thing an effect needs, beside its component, its entry
 * in VFXModuleConfig and its line in modules.tsx. It is not optional: the type
 * below is derived from each effect's own parameter interface, so an effect
 * with no schema, a parameter left undescribed, one described that does not
 * exist, or a colour field given to a number all fail the build.
 *
 * The defaults copy the components' own. A saved animation always carries
 * every parameter explicitly, so a default that drifted from its component
 * could not change what a saved animation renders — but it would make the
 * builder's starting values lie about what an untouched effect looks like.
 *
 * The bounds are about safety first and taste second. Anything that sizes an
 * array is capped so a saved animation cannot allocate its way into freezing a
 * phone, and anything the shaders divide by has a floor above zero.
 */

type ParamsOf<K extends VFXModuleType> = Omit<Extract<VFXModuleConfig, { type: K }>, 'type'>;

/**
 * The spec a parameter's TypeScript type allows. The tuples are tested before
 * the scale union, which a three-number tuple would otherwise also satisfy.
 */
type SpecFor<V> = [V] extends [number]
  ? NumberSpec
  : [V] extends [[number, number, number]]
    ? Vec3Spec
    : [V] extends [number | [number, number, number]]
      ? ScaleSpec
      : [V] extends [[number, number]]
        ? PointSpec
        : [V] extends [ClockHand[]]
          ? HandListSpec
          : [V] extends [string[]]
            ? ColorListSpec
            : [V] extends [string]
              ? ColorSpec | SelectSpec<V>
              : never;

export interface EffectSchema<K extends VFXModuleType> {
  /** Name shown in the effects panel. */
  label: string;
  /** One line on what it looks like. */
  description: string;
  params: { [P in keyof ParamsOf<K>]-?: SpecFor<NonNullable<ParamsOf<K>[P]>> };
}

type EffectSchemas = { [K in VFXModuleType]: EffectSchema<K> };

/**
 * Shared by every effect. The defaults are the ones EffectCanvas assumes too.
 * An animation's shared timing uses the same fields — see animations/timing.ts.
 */
export const TIMING_SCHEMA = {
  fadeInDuration: {
    kind: 'number',
    label: 'Fade in',
    guide: 'How long it takes to appear, in seconds. Below about 0.3 it pops in rather than fading.',
    default: 1,
    min: 0,
    max: 10,
    step: 0.1,
    unit: 's',
  },
  duration: {
    kind: 'number',
    label: 'Hold',
    guide:
      'How long it stays at full strength, in seconds. This is not the total — the fade in and fade out are added on top.',
    default: 3,
    min: 0,
    max: 15,
    step: 0.1,
    unit: 's',
  },
  fadeDuration: {
    kind: 'number',
    label: 'Fade out',
    guide: 'How long it takes to disappear, in seconds.',
    default: 2,
    min: 0,
    max: 10,
    step: 0.1,
    unit: 's',
  },
} satisfies Record<'fadeInDuration' | 'duration' | 'fadeDuration', NumberSpec>;

const BLEND_OPTIONS: SelectOption<'add' | 'normal'>[] = [
  { value: 'add', label: 'Add light' },
  { value: 'normal', label: 'Paint over' },
];

/**
 * The black hole and the clock place themselves the same way. The second
 * number runs from the bottom up: three.js gives a plane's top edge v = 1.
 */
const CENTER: PointSpec = {
  kind: 'point',
  label: 'Position',
  guide:
    'Where it sits. 0.5, 0.5 is the middle of the screen. The first number goes from the left edge (0) to the right (1); the second from the bottom (0) to the top (1) — so a smaller second number moves it down.',
  default: [0.5, 0.5],
};

/** Declared in the order the effects panel lists them. */
export const EFFECT_SCHEMAS: EffectSchemas = {
  edgeGlow: {
    label: 'Edge light',
    description: 'Light, or darkness, coming in from one edge of the screen.',
    params: {
      color: {
        kind: 'color',
        label: 'Colour',
        guide: 'The colour at the edge. For darkness closing in, use black with Blend set to Paint over.',
        default: '#ffffff',
      },
      intensity: {
        kind: 'number',
        label: 'Strength',
        guide: 'How strong it is right at the edge, from 0 (nothing) to 1 (full colour).',
        default: 0.6,
        min: 0,
        max: 1,
        step: 0.05,
      },
      edge: {
        kind: 'select',
        label: 'Edge',
        guide: 'Which side of the screen it comes from.',
        default: 'bottom',
        options: [
          { value: 'top', label: 'Top' },
          { value: 'bottom', label: 'Bottom' },
          { value: 'left', label: 'Left' },
          { value: 'right', label: 'Right' },
        ],
      },
      spread: {
        kind: 'number',
        label: 'Reach',
        guide: 'How far across the screen it reaches before fading out. 0.5 is halfway; 1 crosses the whole screen.',
        default: 0.45,
        min: 0.01,
        max: 1,
        step: 0.01,
      },
      blend: {
        kind: 'select',
        label: 'Blend',
        guide:
          'Add light brightens the screen, which is what makes it glow — but adding black changes nothing, so dark colours are invisible. Paint over lays the colour on top instead, and is the only way to make an edge go dark.',
        default: 'add',
        options: BLEND_OPTIONS,
      },
      ...TIMING_SCHEMA,
    },
  },

  glow: {
    label: 'Screen flash',
    description: 'A wash of colour over the whole screen. Short and strong reads as a flash.',
    params: {
      color: {
        kind: 'color',
        label: 'Colour',
        guide: 'The colour the whole screen is tinted. It adds light, so dark colours barely show.',
        default: '#ff2200',
      },
      intensity: {
        kind: 'number',
        label: 'Strength',
        guide: 'From 0 (invisible) to 1 (the screen turns this colour).',
        default: 0.5,
        min: 0,
        max: 1,
        step: 0.05,
      },
      ...TIMING_SCHEMA,
    },
  },

  sparkles: {
    label: 'Particles',
    description: 'Glowing points that drift in place, or stream in one direction.',
    params: {
      color: {
        kind: 'color',
        label: 'Colour',
        guide: "The particles' colour. With Blend on Add light, black is invisible — switch to Paint over for dark particles.",
        default: '#ffffff',
      },
      count: {
        kind: 'number',
        label: 'Amount',
        guide: 'How many particles. A few hundred is plenty; very large numbers slow phones down.',
        default: 100,
        min: 1,
        max: 2000,
        step: 5,
        integer: true,
      },
      scale: {
        kind: 'scale',
        label: 'Spread area',
        guide: 'How far out they are scattered. One number spreads them evenly; three set width, height and depth separately.',
        default: 10,
        min: 0.1,
        max: 30,
      },
      size: {
        kind: 'number',
        label: 'Size',
        guide: 'How big each particle is. They grow as they drift towards you, so a large size wants a Size limit.',
        default: 2,
        min: 0.1,
        max: 10,
        step: 0.1,
      },
      speed: {
        kind: 'number',
        label: 'Speed',
        guide: 'How fast they move. With Direction on Drift, it is how quickly they wander.',
        default: 1,
        min: 0,
        max: 20,
        step: 0.1,
      },
      direction: {
        kind: 'select',
        label: 'Direction',
        guide: 'Which way they travel. Drift keeps them floating in place.',
        default: 'random',
        options: [
          { value: 'random', label: 'Drift' },
          { value: 'up', label: 'Up' },
          { value: 'down', label: 'Down' },
          { value: 'left', label: 'Left' },
          { value: 'right', label: 'Right' },
        ],
      },
      gravity: {
        kind: 'number',
        label: 'Gravity',
        guide: 'Pulls moving particles down over time. 0 for none; negative makes them rise.',
        default: 0,
        min: -10,
        max: 10,
        step: 0.1,
      },
      noise: {
        kind: 'number',
        label: 'Wobble',
        guide: 'Side-to-side turbulence on moving particles. 0 keeps their paths straight.',
        default: 0,
        min: 0,
        max: 5,
        step: 0.1,
      },
      blend: {
        kind: 'select',
        label: 'Blend',
        guide:
          'Add light makes particles glow, but cannot draw anything darker than the screen. Paint over draws them as solid colour — the only way to get black particles.',
        default: 'add',
        options: BLEND_OPTIONS,
      },
      maxPixelSize: {
        kind: 'number',
        label: 'Size limit',
        guide:
          'The largest a particle can look, in pixels. They grow as they come closer, so without a limit a dark particle can become a disc that covers everything.',
        default: 4096,
        min: 4,
        max: 4096,
        step: 4,
        integer: true,
        unit: 'px',
      },
      ...TIMING_SCHEMA,
    },
  },

  fireworks: {
    label: 'Fireworks',
    description: 'Shells that rise, burst, and rain sparks.',
    params: {
      colors: {
        kind: 'colorList',
        label: 'Colours',
        guide: 'Up to four. Each shell takes the next one in turn.',
        default: ['#ffd76b', '#ff5f6d', '#6bc9ff', '#8dff6b'],
        maxItems: 4,
      },
      bursts: {
        kind: 'number',
        label: 'Shells',
        guide: 'How many fireworks go up in total.',
        default: 14,
        min: 1,
        max: 40,
        step: 1,
        integer: true,
      },
      sparksPerBurst: {
        kind: 'number',
        label: 'Sparks per shell',
        guide: "How full each burst is. Lots of shells with lots of sparks can white out the screen and hide the winner's name.",
        default: 55,
        min: 5,
        max: 150,
        step: 5,
        integer: true,
      },
      spread: {
        kind: 'number',
        label: 'Burst size',
        guide: 'How far each shell throws its sparks.',
        default: 1.6,
        min: 0.1,
        max: 5,
        step: 0.1,
      },
      gravity: {
        kind: 'number',
        label: 'Gravity',
        guide: 'How hard the sparks are pulled back down. 0 lets them hang in the air.',
        default: 1.5,
        min: -2,
        max: 6,
        step: 0.1,
      },
      size: {
        kind: 'number',
        label: 'Spark size',
        guide: 'How big each spark is.',
        default: 1.2,
        min: 0.2,
        max: 5,
        step: 0.1,
      },
      interval: {
        kind: 'number',
        label: 'Time between shells',
        guide: 'Seconds between one firework and the next. Smaller packs more into the same time.',
        default: 0.28,
        min: 0.05,
        max: 3,
        step: 0.01,
        unit: 's',
      },
      riseTime: {
        kind: 'number',
        label: 'Climb',
        guide: 'Seconds a shell spends rising before it bursts.',
        default: 0.55,
        min: 0.05,
        max: 3,
        step: 0.05,
        unit: 's',
      },
      life: {
        kind: 'number',
        label: 'Burn time',
        guide: 'Seconds each spark keeps glowing after the burst.',
        default: 1.7,
        min: 0.2,
        max: 6,
        step: 0.1,
        unit: 's',
      },
      maxPixelSize: {
        kind: 'number',
        label: 'Size limit',
        guide: 'The largest a spark can look, in pixels. Stops sparks turning into blobs as they drift closer.',
        default: 42,
        min: 4,
        max: 256,
        step: 2,
        integer: true,
        unit: 'px',
      },
      ...TIMING_SCHEMA,
    },
  },

  blackHole: {
    label: 'Black hole',
    description: 'A black core with a glowing ring, and strands of light being pulled in.',
    params: {
      color: {
        kind: 'color',
        label: 'Ring colour',
        guide: 'The colour of the glowing ring. The centre is always black.',
        default: '#454b55',
      },
      radius: {
        kind: 'number',
        label: 'Size',
        guide: "How big the black centre is. Around 0.15 to 0.2 looks right; much larger covers the winner's name.",
        default: 0.16,
        min: 0.02,
        max: 0.5,
        step: 0.01,
      },
      spin: {
        kind: 'number',
        label: 'Spin',
        guide: 'How fast the light swirls around it. Negative spins the other way.',
        default: 1,
        min: -5,
        max: 5,
        step: 0.1,
      },
      intensity: {
        kind: 'number',
        label: 'Strength',
        guide: 'At 1 the centre is solid black; lower lets the screen show faintly through.',
        default: 1,
        min: 0,
        max: 1,
        step: 0.05,
      },
      strands: {
        kind: 'number',
        label: 'Strands',
        guide: 'How many streaks of light wrap around it. 1 is sparse; past about 4 they blur into a sheet.',
        default: 1,
        min: 0.2,
        max: 6,
        step: 0.1,
      },
      windUp: {
        kind: 'number',
        label: 'Wind-up',
        guide:
          'How swirled the strands already are when it appears. Near 0 they start as specks and never have time to stretch; around 18 gives long curved streaks straight away.',
        default: 18,
        min: 0,
        max: 60,
        step: 1,
      },
      center: CENTER,
      ...TIMING_SCHEMA,
    },
  },

  clock: {
    label: 'Clock',
    description: 'A clock face drawn in light, with hands that tick from mark to mark.',
    params: {
      color: {
        kind: 'color',
        label: 'Colour',
        guide: 'The colour of the face and hands.',
        default: '#7dffb0',
      },
      radius: {
        kind: 'number',
        label: 'Size',
        guide: 'How big the face is, compared to the screen.',
        default: 0.28,
        min: 0.05,
        max: 0.5,
        step: 0.01,
      },
      center: CENTER,
      marks: {
        kind: 'number',
        label: 'Marks',
        guide: 'How many marks go round the face. It also sets how far a hand moves on each tick — 12 marks means a twelfth of a turn.',
        default: 12,
        min: 1,
        max: 60,
        step: 1,
        integer: true,
      },
      hands: {
        kind: 'handList',
        label: 'Hands',
        guide:
          'Up to four. For each one: Speed is ticks per second, and a negative speed runs anticlockwise. Length goes from the centre (0) to the rim (1). Width is how thick it is at the centre — it tapers to a point.',
        default: [{ rate: 2, length: 0.74, width: 0.03 }],
        maxItems: 4,
        bounds: {
          rate: { min: -30, max: 30 },
          // Above zero, or the hand has no length and the shader divides by it.
          length: { min: 0.05, max: 1 },
          width: { min: 0.005, max: 0.2 },
        },
        defaultWidth: 0.03,
      },
      intensity: {
        kind: 'number',
        label: 'Brightness',
        guide: 'From 0 (invisible) to 1 (full).',
        default: 1,
        min: 0,
        max: 1,
        step: 0.05,
      },
      ...TIMING_SCHEMA,
    },
  },

  wings: {
    label: 'Wings',
    description: 'A pair of realistic wings that burst open, or spread above the results and move gently.',
    params: {
      style: {
        kind: 'select',
        label: 'Style',
        guide: 'Feathered wings, like a bird or an angel, or leathery wings, like a bat or a dragon.',
        default: 'feathered',
        options: [
          { value: 'feathered', label: 'Feathered' },
          { value: 'leathery', label: 'Leathery' },
        ],
      },
      motion: {
        kind: 'select',
        label: 'Movement',
        guide:
          'Burst open starts with the wings curled up and snaps them open, throwing off feathers. Open above has them spread from the start, moving gently.',
        default: 'burst',
        options: [
          { value: 'burst', label: 'Burst open' },
          { value: 'gentle', label: 'Open above' },
        ],
      },
      color: {
        kind: 'color',
        label: 'Colour',
        guide: 'Tints the feathers or skin. White keeps their natural colour.',
        default: '#ffffff',
      },
      size: {
        kind: 'number',
        label: 'Size',
        guide: 'How big the wings are, compared to the screen. Around 0.35 spans a phone from edge to edge; larger runs off the sides. On a wide screen the same size is a little smaller, so the wings fit above the results.',
        default: 0.34,
        min: 0.1,
        max: 1,
        step: 0.01,
      },
      flap: {
        kind: 'number',
        label: 'Wingbeats',
        guide: 'Beats per second once they have opened. 0 holds them still.',
        default: 0.5,
        min: 0,
        max: 4,
        step: 0.1,
        unit: '/s',
      },
      center: { ...CENTER, default: [0.5, 0.76] },
      intensity: {
        kind: 'number',
        label: 'Strength',
        guide: 'From 0 (invisible) to 1 (full).',
        default: 1,
        min: 0,
        max: 1,
        step: 0.05,
      },
      ...TIMING_SCHEMA,
    },
  },

  eyes: {
    label: 'Eyes',
    description: 'Eyes that open around the screen, look about and blink.',
    params: {
      count: {
        kind: 'number',
        label: 'Amount',
        guide: 'How many eyes. They keep clear of the middle of the screen, so if there is not room for them all, fewer appear.',
        default: 9,
        min: 1,
        max: 24,
        step: 1,
        integer: true,
      },
      size: {
        kind: 'number',
        label: 'Size',
        guide: 'How wide each eye is, compared to the screen. Each one varies a little around this.',
        default: 0.12,
        min: 0.04,
        max: 0.3,
        step: 0.01,
      },
      irisColor: {
        kind: 'color',
        label: 'Eye colour',
        guide: 'The colour of the iris, around the black pupil.',
        default: '#c98a2a',
      },
      gaze: {
        kind: 'select',
        label: 'Looking',
        guide: 'At the winner turns every eye towards the middle of the screen. Around lets each one glance about on its own.',
        default: 'winner',
        options: [
          { value: 'winner', label: 'At the winner' },
          { value: 'wander', label: 'Around' },
        ],
      },
      blinkRate: {
        kind: 'number',
        label: 'Blinking',
        guide: 'Roughly how often each eye blinks, per second. 0 never blinks.',
        default: 0.25,
        min: 0,
        max: 2,
        step: 0.05,
        unit: '/s',
      },
      intensity: {
        kind: 'number',
        label: 'Strength',
        guide: 'From 0 (invisible) to 1 (solid).',
        default: 1,
        min: 0,
        max: 1,
        step: 0.05,
      },
      ...TIMING_SCHEMA,
    },
  },

  slashes: {
    label: 'Slashes',
    description: 'Cuts that tear across the screen one after another and stay as scars.',
    params: {
      style: {
        kind: 'select',
        label: 'Style',
        guide:
          'Glowing claws look like fresh wounds of light. Dark claws tear black cuts with a glowing edge. Blade cuts are one clean, bright stroke each.',
        default: 'claws',
        options: [
          { value: 'claws', label: 'Glowing claws' },
          { value: 'tears', label: 'Dark claws' },
          { value: 'blade', label: 'Blade cuts' },
        ],
      },
      color: {
        kind: 'color',
        label: 'Colour',
        guide: 'The colour of the glow.',
        default: '#ff2a2a',
      },
      count: {
        kind: 'number',
        label: 'Slashes',
        guide: 'How many slashes appear, one after another.',
        default: 3,
        min: 1,
        max: 8,
        step: 1,
        integer: true,
      },
      lines: {
        kind: 'number',
        label: 'Marks per slash',
        guide: 'Parallel marks in each claw slash. Blade cuts always make a single cut, whatever this is set to.',
        default: 3,
        min: 1,
        max: 5,
        step: 1,
        integer: true,
      },
      width: {
        kind: 'number',
        label: 'Thickness',
        guide: 'How thick each cut is at its widest, compared to the screen.',
        default: 0.012,
        min: 0.002,
        max: 0.05,
        step: 0.001,
      },
      interval: {
        kind: 'number',
        label: 'Time between slashes',
        guide: 'Seconds between one slash and the next.',
        default: 0.35,
        min: 0.05,
        max: 3,
        step: 0.05,
        unit: 's',
      },
      swipe: {
        kind: 'number',
        label: 'Tear speed',
        guide: 'Seconds each slash takes to tear across. Smaller is faster and sharper.',
        default: 0.16,
        min: 0.02,
        max: 2,
        step: 0.01,
        unit: 's',
      },
      intensity: {
        kind: 'number',
        label: 'Strength',
        guide: 'From 0 (invisible) to 1 (full).',
        default: 1,
        min: 0,
        max: 1,
        step: 0.05,
      },
      ...TIMING_SCHEMA,
    },
  },

  beams: {
    label: 'Light beams',
    description: 'Soft shafts of light across the top of the screen.',
    params: {
      color: {
        kind: 'color',
        label: 'Colour',
        guide: 'The colour of the light.',
        default: '#fff2b2',
      },
      ...TIMING_SCHEMA,
    },
  },

  fire: {
    label: 'Flame',
    description: 'A flickering flame drawn on a flat panel.',
    params: {
      color: {
        kind: 'color',
        label: 'Colour',
        guide: "The flame's colour. Brighter colours burn hotter at the core.",
        default: '#ff4400',
      },
      scale: {
        kind: 'scale',
        label: 'Size',
        guide: 'How big the flame is. One number grows it evenly; three set width, height and depth.',
        default: 1,
        min: 0.1,
        max: 10,
      },
      position: {
        kind: 'vec3',
        label: 'Position',
        guide:
          'Where the flame sits: left and right, down and up, then towards you. 0, 0, 0 is the middle of the screen; the default puts it near the bottom.',
        default: [0, -2, 0],
        min: -10,
        max: 10,
      },
      ...TIMING_SCHEMA,
    },
  },
};

/**
 * Effects kept out of the builder's list. Their schemas stay, so an animation
 * already saved with one still loads, plays and can be edited — removing the
 * type outright would make the sanitiser drop those animations.
 */
const RETIRED_EFFECTS = new Set<VFXModuleType>([
  // It did not look like flames. Something else will take its place.
  'fire',
]);

/** In panel order. Object key order is insertion order for string keys. */
export const EFFECT_TYPES = (Object.keys(EFFECT_SCHEMAS) as VFXModuleType[]).filter(
  (type) => !RETIRED_EFFECTS.has(type),
);

/**
 * Own properties only. `'constructor' in EFFECT_SCHEMAS` is true, and a saved
 * animation claiming to be a `constructor` effect must not get past this.
 */
export function isEffectType(value: unknown): value is VFXModuleType {
  return typeof value === 'string' && Object.hasOwn(EFFECT_SCHEMAS, value);
}

function build(type: VFXModuleType, source: Record<string, unknown>): VFXModuleConfig {
  const params = EFFECT_SCHEMAS[type].params as Record<string, ParamSpec>;
  const out: Record<string, unknown> = { type };
  for (const [key, spec] of Object.entries(params)) {
    out[key] = sanitizeValue(spec, source[key]);
  }
  // Safe to assert: the loop wrote exactly the keys the schema lists for
  // this type, and the schema's type is derived from this type's parameters.
  return out as unknown as VFXModuleConfig;
}

/**
 * Turn anything — a saved animation, an imported code, a form's state — into
 * an effect that is safe to render, or null if it is not an effect at all.
 *
 * Every parameter comes out present and in range: keys the effect does not
 * take are dropped, missing or malformed values become the default, and
 * numbers are clamped. That is what keeps one bad value from freezing the
 * phone of whoever's spin lands on it — a saved animation cannot ask for ten
 * million sparks.
 */
export function sanitizeModule(input: unknown): VFXModuleConfig | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null;
  const { type } = input as { type?: unknown };
  if (!isEffectType(type)) return null;
  return build(type, input as Record<string, unknown>);
}

/** An effect with every parameter at its default — what a new one in the builder starts as. */
export function defaultModule(type: VFXModuleType): VFXModuleConfig {
  return build(type, {});
}
