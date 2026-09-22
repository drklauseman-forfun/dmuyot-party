import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import gsap from 'gsap';

/**
 * The fade in, hold and fade out every effect goes through, for effects that
 * are driven frame by frame from JavaScript rather than by one shader: the
 * wings, the words and the memes.
 */

export interface FadeClock {
  /** 0–1, the fade in and out, driven by the effect's timing. */
  strength: RefObject<{ value: number }>;
  /** Seconds since the first frame was drawn. */
  elapsed: RefObject<number>;
  /** Call once per drawn frame. The first call starts the fade. */
  tick: (delta: number) => void;
}

/**
 * Built paused and started on the first drawn frame, as every effect's
 * timeline is — see VFXClock for why.
 */
export function useFadeClock(active: boolean, fadeInDuration: number, duration: number, fadeDuration: number): FadeClock {
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

/** Eases a pop in past full size and back: 0 at the start, 1 at the end. */
export function popOut(progress: number): number {
  const p = Math.min(Math.max(progress, 0), 1) - 1;
  return 1 + 2.70158 * p * p * p + 1.70158 * p * p;
}
