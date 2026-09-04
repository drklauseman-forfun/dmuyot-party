import React, { useEffect, useState, useRef, useMemo } from 'react';

interface CustomWheelProps {
  data: { label: string; color: string; weight: number }[];
  mustSpin: boolean;
  prizeIndex: number;
  spinDuration: number;
  onStopSpinning: () => void;
}

const CustomWheel: React.FC<CustomWheelProps> = ({ 
  data, 
  mustSpin, 
  prizeIndex, 
  spinDuration, 
  onStopSpinning 
}) => {
  const [rotation, setRotation] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const wheelRef = useRef<HTMLDivElement>(null);

  // Calculate slice geometry
  const slices = useMemo(() => {
    const totalWeight = data.reduce((acc, item) => acc + item.weight, 0);
    let cumulativeAngle = 0;

    return data.map((item) => {
      const angle = (item.weight / totalWeight) * 360;
      const startAngle = cumulativeAngle;
      const endAngle = cumulativeAngle + angle;
      const midAngle = startAngle + angle / 2;
      cumulativeAngle = endAngle;

      return {
        ...item,
        startAngle,
        endAngle,
        midAngle,
        // SVG path calculations
        path: getSlicePath(startAngle, endAngle)
      };
    });
  }, [data]);

  function getSlicePath(startAngle: number, endAngle: number) {
    const radius = 100;

    // A slice spanning the whole wheel (one character, or one with all the
    // weight) would put its start and end points on the same coordinate, and
    // an arc between identical points renders as nothing. Draw it as two
    // half-arcs instead so the wheel isn't just an empty outline.
    if (endAngle - startAngle >= 359.999) {
      return `M 0 100 a ${radius} ${radius} 0 1 0 ${radius * 2} 0 a ${radius} ${radius} 0 1 0 ${-radius * 2} 0 Z`;
    }

    const startRad = (startAngle - 90) * (Math.PI / 180);
    const endRad = (endAngle - 90) * (Math.PI / 180);
    
    const x1 = 100 + radius * Math.cos(startRad);
    const y1 = 100 + radius * Math.sin(startRad);
    const x2 = 100 + radius * Math.cos(endRad);
    const y2 = 100 + radius * Math.sin(endRad);
    
    const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;
    
    return `M 100 100 L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;
  }

  // A spin must start on the mustSpin false→true edge and nothing else. The
  // parent passes an inline onStopSpinning, whose identity changes on every
  // parent render, so depending on it directly would restart the spin
  // mid-flight. Everything the spin reads is taken from here instead.
  const latest = useRef({ slices, prizeIndex, spinDuration, onStopSpinning });
  useEffect(() => {
    latest.current = { slices, prizeIndex, spinDuration, onStopSpinning };
  });

  useEffect(() => {
    if (!mustSpin) return;

    const { slices, prizeIndex, spinDuration, onStopSpinning } = latest.current;

    // Nothing to land on. Throwing here would take the page down, so hand
    // control back and leave the app usable instead.
    const targetSlice = slices[prizeIndex];
    if (!targetSlice) {
      console.warn(`[wheel] No slice at index ${prizeIndex} of ${slices.length}`);
      onStopSpinning();
      return;
    }

    setIsAnimating(true);

    const extraRotations = 10 * 360; // More rotations for better feel

    // Calculate the precise angle needed to put the target slice at the top
    // (0 deg). Updated from the previous rotation rather than a captured one,
    // so the wheel always carries on from where it actually stopped.
    setRotation((current) => {
      const currentInternalAngle = current % 360;
      const targetAngle = (360 - (targetSlice.midAngle % 360)) % 360;

      // Distance to travel to reach the target angle from current position
      let distance = targetAngle - currentInternalAngle;
      if (distance <= 0) distance += 360; // Ensure we always rotate forward

      return current + extraRotations + distance;
    });

    // Wait for the transition to finish. Cleared on unmount so a wheel that
    // goes away mid-spin doesn't report a winner from a dead component.
    const timer = setTimeout(() => {
      setIsAnimating(false);
      onStopSpinning();
    }, spinDuration * 1000);
    return () => clearTimeout(timer);
  }, [mustSpin]);

  return (
    <div className="custom-wheel-container" style={{ position: 'relative', width: '400px', height: '400px' }}>
      {/* The Pointer */}
      <div style={{
        position: 'absolute',
        top: '-10px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10,
        width: '0',
        height: '0',
        borderLeft: '15px solid transparent',
        borderRight: '15px solid transparent',
        borderTop: '30px solid #ff64f2',
        filter: 'drop-shadow(0 0 5px rgba(255,100,242,0.5))'
      }} />

      <div 
        ref={wheelRef}
        style={{
          width: '100%',
          height: '100%',
          transition: isAnimating ? `transform ${spinDuration}s cubic-bezier(0.15, 0, 0.15, 1)` : 'none',
          transform: `rotate(${rotation}deg)`
        }}
      >
        <svg viewBox="0 0 200 200" style={{ width: '100%', height: '100%' }}>
          <g>
            {slices.map((slice, i) => (
              <path 
                key={i} 
                d={slice.path} 
                fill={i % 2 === 0 ? '#1e1e1e' : '#2c2c2c'} 
                stroke="#333" 
                strokeWidth="0.5" 
              />
            ))}
          </g>
          <g>
            {slices.map((slice, i) => {
              const rotation = slice.midAngle;
              const isTooMany = slices.length > 25;
              // Trust the label from data prop, but apply light truncation if it's exceptionally long
              const text = slice.label.length > 30 ? slice.label.substring(0, 27) + '...' : slice.label;
              
              return (
                <text
                  key={i}
                  x="100"
                  y="30"
                  fill={slice.color !== '#ffffff' ? slice.color : '#ffffff'}
                  fontSize={isTooMany && text.length > 5 ? "4" : isTooMany ? "5" : "7"}
                  fontWeight="bold"
                  textAnchor="middle"
                  transform={`rotate(${rotation}, 100, 100)`}
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {text}
                </text>
              );
            })}
          </g>
          {/* Outer Border */}
          <circle cx="100" cy="100" r="98" fill="none" stroke="#333" strokeWidth="4" />
        </svg>
      </div>
    </div>
  );
};

export default CustomWheel;
