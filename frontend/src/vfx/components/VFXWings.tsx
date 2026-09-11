import React from 'react';
import type { WingsParams } from '../types';
import FeatheredWings from './wings/FeatheredWings';
import LeatheryWings from './wings/LeatheryWings';
import { useWingClock } from './wings/motion';

/**
 * A pair of realistic wings, feathered or leathery, that either burst open
 * from curled up or are spread above the results from the start and move
 * gently.
 *
 * Not a full-screen shader like the other effects. The first wings were one,
 * and did not look like wings: realism needs real feather shapes, which cost
 * too much to compute for every pixel. wings/textures.ts draws a feather, a
 * patch of skin and a bone once on a canvas, and each style places copies of
 * them along a skeleton (wings/pose.ts) every frame.
 */

interface VFXWingsProps extends WingsParams {
  active?: boolean;
}

const VFXWings: React.FC<VFXWingsProps> = ({
  style = 'feathered',
  motion = 'burst',
  color = '#ffffff',
  size = 0.34,
  flap = 0.5,
  center = [0.5, 0.62],
  intensity = 1,
  fadeInDuration = 1,
  duration = 3,
  fadeDuration = 2,
  active = true,
}) => {
  const clock = useWingClock(active, fadeInDuration, duration, fadeDuration);
  const rig = {
    color,
    size,
    flap,
    center,
    intensity,
    motion,
    clock,
    holdEnds: fadeInDuration + duration,
  };
  return style === 'leathery' ? <LeatheryWings {...rig} /> : <FeatheredWings {...rig} />;
};

export default VFXWings;
