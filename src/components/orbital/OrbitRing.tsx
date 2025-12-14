import React, { useRef, useCallback, useEffect, useState } from 'react';
import { useOrbital } from '@/contexts/OrbitalContext';
import { OrbitalCardComponent } from './OrbitalCard';
import { cn } from '@/lib/utils';

const CARD_WIDTH = 400;
const CARD_HEIGHT = 320;
const SAFE_MARGIN = 0;
const PERSPECTIVE = 3000;
const ORBIT_SCALE = 0.92;

export function OrbitRing() {
  const { orbitCards, rotationAngle, rotateOrbit, getCardById, isDragging } = useOrbital();
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const isDraggingOrbit = useRef(false);
  const lastX = useRef(0);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Track container dimensions for responsive radius
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({ width: rect.width, height: rect.height });
      }
    };
    
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Safe radius: ensure cards don't clip off-screen
  // radius <= min((vw/2 - cardW/2 - margin), (vh/2 - cardH/2 - margin))
  const maxRadiusX = (dimensions.width / 2) - (CARD_WIDTH / 2) - SAFE_MARGIN;
  const maxRadiusY = (dimensions.height / 2) - (CARD_HEIGHT / 2) - SAFE_MARGIN;
  const safeRadius = Math.max(280, Math.min(maxRadiusX, maxRadiusY, 500));

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // Don't start orbit drag if clicking on a card
    if ((e.target as HTMLElement).closest('[data-orbital-card]')) return;
    
    isDraggingOrbit.current = true;
    lastX.current = e.clientX;
    containerRef.current?.setPointerCapture(e.pointerId);
    e.preventDefault();
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingOrbit.current) return;
    
    const deltaX = e.clientX - lastX.current;
    lastX.current = e.clientX;
    
    rotateOrbit(deltaX * 0.35);
  }, [rotateOrbit]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDraggingOrbit.current) return;
    isDraggingOrbit.current = false;
    containerRef.current?.releasePointerCapture(e.pointerId);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    rotateOrbit(e.deltaY * 0.15);
  }, [rotateOrbit]);

  const cardCount = orbitCards.length;
  const angleStep = cardCount > 0 ? 360 / cardCount : 0;

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative w-full h-full flex items-center justify-center',
        'touch-none select-none cursor-grab',
        isDragging && 'cursor-default'
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onWheel={handleWheel}
      style={{ perspective: `${PERSPECTIVE}px` }}
    >
      {/* Orbit Stage - scaled and pushed back in Z for depth */}
      <div 
        ref={stageRef}
        className="relative"
        style={{
          width: safeRadius * 2 + CARD_WIDTH,
          height: safeRadius * 2 + CARD_HEIGHT,
          transform: `translateZ(-400px) scale(${ORBIT_SCALE})`,
          transformStyle: 'preserve-3d',
        }}
      >
        {/* Center anchor point (glowing dot) */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-0 pointer-events-none">
          <div className="relative">
            <div className="absolute -inset-20 rounded-full bg-primary/5 blur-3xl" />
            <div className="absolute -inset-10 rounded-full bg-primary/10 blur-xl" />
            <div className="w-6 h-6 rounded-full bg-primary/70 shadow-[0_0_40px_10px] shadow-primary/40" />
          </div>
        </div>

        {/* Orbit ring visual (subtle circle) */}
        <div 
          className="absolute left-1/2 top-1/2 border border-border/30 rounded-full pointer-events-none"
          style={{
            width: safeRadius * 2,
            height: safeRadius * 2,
            transform: 'translate(-50%, -50%)',
          }}
        />

        {/* Full cards arranged around orbit ring using true 3D positioning */}
        {orbitCards.map((cardId, index) => {
          const card = getCardById(cardId);
          if (!card) return null;

          // Calculate angle for this card
          const angle = (index * angleStep) + rotationAngle;
          const angleRad = (angle * Math.PI) / 180;
          
          // True circular 3D positioning:
          // x = cos(angle) * radius (left-right)
          // z = sin(angle) * radius (depth)
          const x = Math.cos(angleRad) * safeRadius;
          const z = Math.sin(angleRad) * safeRadius;
          
          // Depth effect: normalize z position for scale/opacity
          // z ranges from -radius (back) to +radius (front)
          const normalizedDepth = (z + safeRadius) / (safeRadius * 2); // 0 = back, 1 = front
          
          // Clamped scale: 0.85 to 1.0
          const scale = 0.85 + 0.15 * normalizedDepth;
          // Clamped opacity: 0.7 to 1.0
          const opacity = 0.7 + 0.3 * normalizedDepth;
          // Z-index based on depth (front cards on top)
          const zIndex = Math.round(normalizedDepth * 100);

          return (
            <div
              key={cardId}
              data-orbital-card
              className="absolute transition-transform duration-75 ease-out"
              style={{
                width: CARD_WIDTH,
                height: CARD_HEIGHT,
                left: '50%',
                top: '50%',
                // translate3d(x, 0, z) for true 3D ring
                transform: `translate(-50%, -50%) translate3d(${x}px, 0px, ${z}px) scale(${scale})`,
                zIndex,
                opacity,
                transformStyle: 'preserve-3d',
              }}
            >
              <OrbitalCardComponent 
                card={card} 
                cardWidth={CARD_WIDTH}
                cardHeight={CARD_HEIGHT}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
