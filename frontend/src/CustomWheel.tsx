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
    const startRad = (startAngle - 90) * (Math.PI / 180);
    const endRad = (endAngle - 90) * (Math.PI / 180);
    
    const x1 = 100 + radius * Math.cos(startRad);
    const y1 = 100 + radius * Math.sin(startRad);
    const x2 = 100 + radius * Math.cos(endRad);
    const y2 = 100 + radius * Math.sin(endRad);
    
    const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;
    
    return `M 100 100 L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;
  }

  useEffect(() => {
    if (mustSpin && !isAnimating) {
      startSpin();
    }
  }, [mustSpin]);

  const startSpin = () => {
    setIsAnimating(true);
    
    // 1. Calculate target rotation
    const targetSlice = slices[prizeIndex];
    const extraRotations = 10 * 360; // More rotations for better feel
    
    // Calculate the precise angle needed to put the target slice at the top (0 deg)
    // currentRotation % 360 is where we are now.
    // (360 - targetSlice.midAngle) is where we WANT the 0-point to be.
    const currentInternalAngle = rotation % 360;
    const targetAngle = (360 - (targetSlice.midAngle % 360)) % 360;
    
    // Distance to travel to reach the target angle from current position
    let distance = targetAngle - currentInternalAngle;
    if (distance <= 0) distance += 360; // Ensure we always rotate forward
    
    const newRotation = rotation + extraRotations + distance;
    
    setRotation(newRotation);

    // 2. Wait for transition to finish
    setTimeout(() => {
      setIsAnimating(false);
      onStopSpinning();
    }, spinDuration * 1000);
  };

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
