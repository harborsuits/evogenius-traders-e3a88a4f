import React, { useRef, useCallback, useEffect, useState } from 'react';
import { useOrbital } from '@/contexts/OrbitalContext';
import { OrbitalCardComponent } from './OrbitalCard';
import { cn } from '@/lib/utils';

export function OrbitRing() {
  const { orbitCards, rotationAngle, rotateOrbit, getCardById, isDragging } = useOrbital();
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingOrbit = useRef(false);
  const lastX = useRef(0);
  
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setContainerSize({ width: rect.width, height: rect.height });
      }
    };
    
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // Don't start orbit drag if clicking on a card
    if ((e.target as HTMLElement).closest('[data-orbital-card]')) return;
    
    isDraggingOrbit.current = true;
    lastX.current = e.clientX;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingOrbit.current) return;
    
    const deltaX = e.clientX - lastX.current;
    lastX.current = e.clientX;
    
    // Rotate based on horizontal movement
    rotateOrbit(deltaX * 0.3);
  }, [rotateOrbit]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    isDraggingOrbit.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    rotateOrbit(e.deltaY * 0.2);
  }, [rotateOrbit]);

  const cardCount = orbitCards.length;
  const radius = Math.min(containerSize.width, containerSize.height) * 0.35;
  const centerX = containerSize.width / 2;
  const centerY = containerSize.height / 2;

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative w-full h-full',
        'touch-none select-none',
        isDragging && 'pointer-events-none'
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onWheel={handleWheel}
    >
      {/* Center glow effect */}
      <div 
        className="absolute rounded-full bg-primary/5 blur-3xl"
        style={{
          left: centerX - radius * 0.5,
          top: centerY - radius * 0.5,
          width: radius,
          height: radius,
        }}
      />
      
      {/* Orbit ring visual */}
      <div 
        className="absolute border border-border/30 rounded-full"
        style={{
          left: centerX - radius,
          top: centerY - radius,
          width: radius * 2,
          height: radius * 2,
        }}
      />

      {/* Cards arranged in orbit */}
      {orbitCards.map((cardId, index) => {
        const card = getCardById(cardId);
        if (!card) return null;

        const anglePerCard = (2 * Math.PI) / cardCount;
        const angle = (index * anglePerCard) + (rotationAngle * Math.PI / 180);
        
        // Calculate position on the ellipse
        const x = centerX + radius * Math.cos(angle) - 160; // card width offset
        const y = centerY + radius * 0.6 * Math.sin(angle) - 100; // card height offset, ellipse ratio
        
        // Scale based on position (front = larger)
        const scale = 0.8 + 0.2 * ((Math.sin(angle) + 1) / 2);
        const zIndex = Math.round(100 + 50 * Math.sin(angle));
        const opacity = 0.7 + 0.3 * ((Math.sin(angle) + 1) / 2);

        return (
          <div
            key={cardId}
            data-orbital-card
            className="absolute transition-all duration-100 ease-out"
            style={{
              left: x,
              top: y,
              width: 320,
              transform: `scale(${scale})`,
              zIndex,
              opacity,
            }}
          >
            <OrbitalCardComponent card={card} />
          </div>
        );
      })}

      {/* Rotation indicator */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 text-xs text-muted-foreground font-mono">
        <span>Rotation: {Math.round(rotationAngle % 360)}°</span>
        <span className="text-muted-foreground/50">|</span>
        <span>Cards: {cardCount}</span>
      </div>
    </div>
  );
}
