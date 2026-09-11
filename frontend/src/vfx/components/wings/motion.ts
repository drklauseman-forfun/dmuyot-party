import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import gsap from 'gsap';

/**
 * How the wings move, shared by both styles: the fade, how open they are at
 * each moment, and the wingbeat.
 */

export type WingMotion = 'burst' | 'gentle';

/** Seconds a bursting wing stays curled up before it springs open. */
export const BURST_DELAY = 0.12;

export interface WingClock {
  /** 0–1, the fade in and out, driven by the effect's timing. */
  strength: RefObject<{ value: number }>;
  /** Seconds since the first frame was drawn. */
  elapsed: RefObject<number>;
  /** Call once per drawn frame. The first call starts the fade. */
  tick: (delta: number) => void;
}

/** What a wing style needs to draw itself. */
export interface WingRigProps {
  color: string;
  size: number;
  flap: number;
  center: [number, number];
  intensity: number;
  motion: WingMotion;
  clock: WingClock;
  /** Seconds after the first frame at which the fade out begins. */
  holdEnds: number;
}

/**
 * The fade, built paused and started on the first drawn frame, as every
 * effect's is — see VFXClock for why.
 */
export function useWingClock(active: boolean, fadeInDuration: number, duration: number, fadeDuration: number): WingClock {
  const strength = useRef({ value: 0 });
  const elapsed = useRef(0);
  const timeline = useRef<gsap.core.Timeline | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!active) return;
    const tl = gsap.timeline({ paused: true });
    tl.to(strength.current, { value: 1, duration: fadeInDuration, ease: 'power1.inOut' });
    tl.to({}, { duration });
    tl.to(strength.current, { value: 0, duration: fadeDuration, ease: 'power2.inOut' });
    timeline.current = tl;
    return () => {
      tl.kill();
      timeline.current = null;
      started.current = false;
    };
  }, [active, fadeInDuration, duration, fadeDuration]);

  const tick = (delta: number) => {
    if (timeline.current && !started.current) {
      started.current = true;
      timeline.current.play();
    }
    elapsed.current += delta;
  };

  return { strength, elapsed, tick };
}

/**
 * How open the wings are: 0 curled up, 1 spread.
 *
 * A burst holds them curled for a moment, then lets them go like a spring —
 * past fully open and settling back, which is what makes it read as a snap
 * rather than a slide — and folds them away again as the effect fades. Gentle
 * wings are open from the start and stay open while they fade.
 */
export function openAmount(motion: WingMotion, elapsed: number, strength: number, fadingOut: boolean): number {
  if (motion === 'gentle') return 1;
  const t = Math.max(0, elapsed - BURST_DELAY);
  const open = 1 - Math.exp(-7 * t) * Math.cos(9 * t);
  return fadingOut ? open * strength : open;
}

/** The wingbeat, in radians at the shoulder. Gentle wings barely stir. */
export function wingbeat(motion: WingMotion, elapsed: number, flap: number, open: number): number {
  const amplitude = motion === 'gentle' ? 0.06 : 0.11;
  return Math.sin(elapsed * flap * Math.PI * 2) * amplitude * Math.min(Math.max(open, 0), 1);
}
