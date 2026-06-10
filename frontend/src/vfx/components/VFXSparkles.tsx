
import React, { useRef, useEffect } from 'react';
import { Sparkles } from '@react-three/drei';
import gsap from 'gsap';

interface VFXSparklesProps {
  color?: string;
  count?: number;
  scale?: number;
  size?: number;
  speed?: number;
  duration?: number;
  fadeDuration?: number;
  active?: boolean;
}

const VFXSparkles: React.FC<VFXSparklesProps> = ({
  color = "#ffffff",
  count = 100,
  scale = 10,
  size = 2,
  speed = 1,
  duration = 3,
  fadeDuration = 2,
  active = true
}) => {
  const opacityState = useRef({ value: 0 });

  useEffect(() => {
    if (active) {
      const tl = gsap.timeline();
      tl.to(opacityState.current, { value: 1, duration: 1, ease: "power2.out" });
      tl.to({}, { duration });
      tl.to(opacityState.current, { value: 0, duration: fadeDuration, ease: "power2.inOut" });
      return () => { tl.kill(); };
    }
  }, [active, duration, fadeDuration]);

  return (
    <Sparkles
      count={count}
      scale={scale}
      size={size}
      speed={speed}
      color={color}
      opacity={opacityState.current.value}
    />
  );
};

export default VFXSparkles;
