import React, { useRef, useCallback, useEffect, useState } from 'react';
import { useOrbital } from '@/contexts/OrbitalContext';
import { OrbitalCardComponent } from './OrbitalCard';
import { cn } from '@/lib/utils';

// Match prototype exactly
const CARD_WIDTH = 350;
const CARD_HEIGHT = 280;
const ORBIT_RADIUS = 450;
const PERSPECTIVE = 3000;
const ORBIT_TRANSLATE_Z = -1200;
const ORBIT_SCALE = 0.65;

export function OrbitRing() {
  const { orbitCards, rotationAngle, rotateOrbit, getCardById, isDragging } = useOrbital();
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingOrbit = useRef(false);
  const lastX = useRef(0);

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
    
    // Rotate based on horizontal movement (match prototype sensitivity)
    rotateOrbit(-deltaX * 0.8);
  }, [rotateOrbit]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDraggingOrbit.current) return;
    isDraggingOrbit.current = false;
    containerRef.current?.releasePointerCapture(e.pointerId);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    rotateOrbit(-e.deltaY * 0.3);
  }, [rotateOrbit]);

  const cardCount = orbitCards.length;
  const angleStep = cardCount > 0 ? 360 / cardCount : 0;

  return (
    <div
      ref={containerRef}
      className={cn(
        'w-full h-full relative overflow-hidden flex items-center justify-center',
        'touch-none select-none cursor-grab',
        isDragging && 'cursor-default'
      )}
      style={{
        perspective: `${PERSPECTIVE}px`,
        perspectiveOrigin: '50% 50%',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onWheel={handleWheel}
    >
      {/* Orbit space - pushed back with perspective */}
      <div
        className="relative w-full h-full flex items-center justify-center"
        style={{
          transformStyle: 'preserve-3d',
          transform: `translateZ(${ORBIT_TRANSLATE_Z}px) scale(${ORBIT_SCALE})`,
        }}
      >
        {/* Center anchor point (glowing dot) - matches prototype exactly */}
        <div 
          className="absolute pointer-events-none z-[1]"
          style={{
            top: '50%',
            left: '50%',
            width: 20,
            height: 20,
            marginTop: -10,
            marginLeft: -10,
            borderRadius: '50%',
            background: 'rgba(59, 130, 246, 0.3)',
            border: '2px solid rgba(59, 130, 246, 0.6)',
            boxShadow: '0 0 40px rgba(59, 130, 246, 0.5)',
          }}
        />

        {/* Full cards arranged around orbit ring */}
        {orbitCards.map((cardId, index) => {
          const card = getCardById(cardId);
          if (!card) return null;

          // Calculate base angle for this card
          const baseAngle = index * angleStep;
          const totalAngle = baseAngle + rotationAngle;
          const angleRad = (totalAngle * Math.PI) / 180;
          
          // Position on circle using translate3d (x, 0, z)
          const x = Math.cos(angleRad) * ORBIT_RADIUS;
          const z = Math.sin(angleRad) * ORBIT_RADIUS;

          return (
            <div
              key={cardId}
              data-orbital-card
              className="absolute transition-transform duration-100"
              style={{
                width: CARD_WIDTH,
                height: CARD_HEIGHT,
                left: '50%',
                top: '50%',
                marginLeft: -CARD_WIDTH / 2,
                marginTop: -CARD_HEIGHT / 2,
                transformStyle: 'preserve-3d',
                transform: `translate3d(${x}px, 0, ${z}px)`,
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

      {/* Rotation indicator - fixed position */}
      <div 
        className="fixed top-8 right-8 z-50 px-5 py-3 rounded-lg backdrop-blur-xl"
        style={{
          background: 'rgba(10, 10, 10, 0.9)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        <span className="text-xs text-muted-foreground">Rotation: </span>
        <span className="text-primary font-mono font-semibold">
          {Math.round(((rotationAngle % 360) + 360) % 360)}°
        </span>
      </div>
    </div>
  );
}
