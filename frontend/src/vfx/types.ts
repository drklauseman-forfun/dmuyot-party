/**
 * The shape of a VFX module, as authored in a character's effect.
 *
 * Each module type declares its own parameters, and the components render them
 * from the same declarations — so what a registry entry may say and what the
 * component accepts cannot drift apart.
 */

/**
 * Timing every module shares. A module's life is three phases, and its total
 * on-screen time is the sum of all three, not `duration` alone.
 */
export interface VFXTiming {
  /** Seconds to ramp from invisible to full. Default 1. */
  fadeInDuration?: number;
  /** Seconds to hold at full — NOT the module's total lifetime. Default 3. */
  duration?: number;
  /** Seconds to fade back out. Default 2. */
  fadeDuration?: number;
}

/** A flat wash of colour across the whole frame. */
export interface GlowParams extends VFXTiming {
  color?: string;
  /** Peak opacity, 0–1. */
  intensity?: number;
}

/** A cloud of points, optionally travelling in one direction. */
export interface SparklesParams extends VFXTiming {
  color?: string;
  count?: number;
  /** Half-extent of the spawn volume; one number, or per axis. */
  scale?: number | [number, number, number];
  size?: number;
  speed?: number;
  direction?: 'up' | 'down' | 'left' | 'right' | 'random';
  gravity?: number;
  /** Sideways turbulence. */
  noise?: number;
  /**
   * 'add' brightens whatever is behind it, which is what makes particles read
   * as light — but it cannot draw anything darker than the frame, so black
   * added to the scene is simply invisible. 'normal' paints over instead, so a
   * dark particle shows as a silhouette against a lit background.
   */
  blend?: 'add' | 'normal';
  /**
   * Ceiling on a particle's on-screen size, in pixels.
   *
   * Size scales with nearness to the camera, without bound — a particle that
   * drifts close becomes vast. Added to the frame that reads as a soft bloom
   * and is left alone by default, but a dark particle blending normally
   * becomes a disc that swallows the picture.
   */
  maxPixelSize?: number;
}

/** A shader flame on a plane. */
export interface FireParams extends VFXTiming {
  color?: string;
  scale?: number | [number, number, number];
  position?: [number, number, number];
}

/** Light bleeding in from one edge, fading with distance from it. */
export interface EdgeGlowParams extends VFXTiming {
  color?: string;
  /** Peak brightness at the edge, 0–1. */
  intensity?: number;
  edge?: 'top' | 'bottom' | 'left' | 'right';
  /** How far across the frame it reaches, 0–1. */
  spread?: number;
  /**
   * 'add' brightens the frame — light coming in from an edge.
   *
   * 'normal' paints over it instead, so a black colour reads as darkness
   * closing in rather than as nothing at all. Adding black to a frame changes
   * nothing, so it is the only way to make an edge go dark.
   */
  blend?: 'add' | 'normal';
}

/** Soft vertical shafts of light across the top of the frame. */
export interface BeamsParams extends VFXTiming {
  color?: string;
}

/**
 * A black hole at the centre of the frame: dark core, accretion ring, and a
 * starfield falling into it.
 *
 * What bends is a field the shader draws for itself. The canvas sits above the
 * interface and cannot read the page behind it, so there is no lensing the
 * actual wheel — what sells it is that the light it does draw is visibly being
 * pulled in.
 */
export interface BlackHoleParams extends VFXTiming {
  /** The accretion ring. The core is always black. */
  color?: string;
  /** Event horizon, as a fraction of the frame's height. */
  radius?: number;
  /** How fast the field winds around it. Negative reverses the rotation. */
  spin?: number;
  /** Peak opacity, 0-1. Below 1 the interface shows through the core. */
  intensity?: number;
  /**
   * How much light there is to be pulled in, and so how many strands wrap the
   * hole. 1 is sparse; past about 4 they start to merge into a sheet.
   */
  strands?: number;
  /**
   * Seconds of swirl the field already has when the effect starts.
   *
   * The strands are stretched by the swirl, so they grow from specks into long
   * arcs over roughly twenty seconds. An effect that lives for five would
   * otherwise never leave the specks behind. Starting part-way in gives the
   * wound-up look immediately without having to spin it faster.
   */
  windUp?: number;
  /**
   * Where it sits, as fractions of the frame. The first number runs from the
   * left edge (0) to the right (1); the second from the **bottom** (0) to the
   * top (1), because three.js gives a plane's top edge v = 1 — so a smaller
   * second number moves it down, not up. Centred by default, which puts the
   * core over the middle of the results modal.
   */
  center?: [number, number];
}

/** One hand on a clock face. */
export interface ClockHand {
  /**
   * Steps per second. The hand holds still between them rather than sweeping
   * — a smooth rotation reads as a radar, only the jump reads as ticking.
   *
   * Negative runs it anticlockwise, the same way the black hole's `spin` does.
   */
  rate: number;
  /** How far it reaches, as a fraction of the face radius. */
  length: number;
  /** Width at the hub, as a fraction of the radius. It tapers to a point. */
  width?: number;
}

/**
 * A clock face drawn in light, with hands that jump between marks.
 */
export interface ClockParams extends VFXTiming {
  color?: string;
  /** Face radius, as a fraction of the frame's shorter side. */
  radius?: number;
  /**
   * Where it sits, as fractions of the frame: left (0) to right (1), then
   * bottom (0) to top (1). The second number runs up; see BlackHoleParams.
   */
  center?: [number, number];
  /** Marks around the face, and so the steps in one full revolution. */
  marks?: number;
  /** Up to four hands. Defaults to a single one stepping twice a second. */
  hands?: ClockHand[];
  /** Peak brightness. */
  intensity?: number;
}

/** Shells that rise, burst, and rain sparks. */
export interface FireworksParams extends VFXTiming {
  /** Up to four, one picked per burst. */
  colors?: string[];
  /** How many shells go up over the effect. */
  bursts?: number;
  sparksPerBurst?: number;
  /** How far a burst throws its sparks. */
  spread?: number;
  /** How hard they are pulled back down. */
  gravity?: number;
  size?: number;
  /** Seconds between one shell and the next. */
  interval?: number;
  /** Seconds a shell spends climbing before it opens. */
  riseTime?: number;
  /** Seconds a spark burns for after the burst. */
  life?: number;
  /** Ceiling on a spark's on-screen size, in pixels. See SparklesParams. */
  maxPixelSize?: number;
}

/** A pair of wings spreading out from behind the results. */
export interface WingsParams extends VFXTiming {
  /**
   * 'feathered' draws layered feathers in light, added to the frame.
   * 'leathery' paints dark membranes between bony ribs, and `color` becomes
   * the glow along their edges.
   */
  style?: 'feathered' | 'leathery';
  color?: string;
  /** How far each wing reaches, as a fraction of the frame's shorter side. */
  size?: number;
  /** Wingbeats per second once they have unfolded. 0 holds them still. */
  flap?: number;
  /**
   * Where the wings join, as fractions of the frame: left (0) to right (1),
   * then bottom (0) to top (1). The second number runs up; see BlackHoleParams.
   */
  center?: [number, number];
  /** Peak opacity, 0–1. */
  intensity?: number;
}

/** Eyes opening around the frame, looking about and blinking. */
export interface EyesParams extends VFXTiming {
  /** How many. They keep clear of the middle, where the winner's name is. */
  count?: number;
  /** Width of one eye, as a fraction of the frame's shorter side. */
  size?: number;
  irisColor?: string;
  /** 'winner' turns every eye towards the middle; 'wander' lets each look about. */
  gaze?: 'winner' | 'wander';
  /** Blinks per second for each eye, on average. 0 never blinks. */
  blinkRate?: number;
  /** Peak opacity, 0–1. */
  intensity?: number;
}

/** Cuts tearing across the frame one after another, left behind as scars. */
export interface SlashesParams extends VFXTiming {
  /**
   * 'claws' glow like fresh wounds, added to the frame. 'tears' paint dark
   * cuts with `color` glowing along their edges. 'blade' is a clean, bright
   * stroke with no ragged edge.
   */
  style?: 'claws' | 'tears' | 'blade';
  color?: string;
  /** How many slashes over the whole effect. */
  count?: number;
  /** Parallel marks in each claw slash. A blade always cuts once. */
  lines?: number;
  /** Thickness at the widest point, as a fraction of the frame's shorter side. */
  width?: number;
  /** Seconds between one slash and the next. */
  interval?: number;
  /** Seconds a slash takes to tear across. */
  swipe?: number;
  /** Peak opacity, 0–1. */
  intensity?: number;
}

/**
 * One module in an effect.
 *
 * A discriminated union rather than one interface with every field optional:
 * this way `{ type: 'glow', gravity: 5 }` is a compile error instead of a line
 * that silently does nothing, and an editor offers exactly the parameters the
 * chosen module understands.
 */
export type VFXModuleConfig =
  | ({ type: 'glow' } & GlowParams)
  | ({ type: 'sparkles' } & SparklesParams)
  | ({ type: 'fire' } & FireParams)
  | ({ type: 'beams' } & BeamsParams)
  | ({ type: 'edgeGlow' } & EdgeGlowParams)
  | ({ type: 'blackHole' } & BlackHoleParams)
  | ({ type: 'clock' } & ClockParams)
  | ({ type: 'fireworks' } & FireworksParams)
  | ({ type: 'wings' } & WingsParams)
  | ({ type: 'eyes' } & EyesParams)
  | ({ type: 'slashes' } & SlashesParams);

export type VFXModuleType = VFXModuleConfig['type'];

/** What the 3D layer needs to play one effect. Built from a registry entry. */
export interface EffectConfig {
  /** Registry id of the effect that produced this, for logging. */
  effectId: string;
  modules: VFXModuleConfig[];
  /** Bumped on every trigger so a repeat winner still restarts the canvas. */
  timestamp: number;
}
