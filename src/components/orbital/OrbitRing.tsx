import React, { useRef, useCallback, useEffect, useState } from 'react';
import { useOrbital } from '@/contexts/OrbitalContext';
import { OrbitalCardComponent } from './OrbitalCard';
import { cn } from '@/lib/utils';

const ORBIT_RADIUS = 400;
const PERSPECTIVE = 2500;
const CARD_WIDTH = 300;
const CARD_HEIGHT = 200;

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
    
    // Rotate based on horizontal movement
    rotateOrbit(deltaX * 0.3);
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
        isDragging && 'pointer-events-none',
        isDraggingOrbit.current && 'cursor-grabbing'
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onWheel={handleWheel}
    >
      {/* Perspective container */}
      <div 
        className="relative"
        style={{
          perspective: `${PERSPECTIVE}px`,
          perspectiveOrigin: 'center center',
        }}
      >
        {/* Orbit stage - pushed back for depth */}
        <div
          className="relative"
          style={{
            transformStyle: 'preserve-3d',
            transform: `translateZ(-${ORBIT_RADIUS * 0.5}px)`,
          }}
        >
          {/* Center anchor point (glowing dot) */}
          <div 
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10"
            style={{ transformStyle: 'preserve-3d' }}
          >
            <div className="relative">
              {/* Outer glow */}
              <div className="absolute -inset-8 rounded-full bg-primary/10 blur-xl animate-pulse" />
              {/* Inner glow */}
              <div className="absolute -inset-4 rounded-full bg-primary/20 blur-md" />
              {/* Center dot */}
              <div className="w-3 h-3 rounded-full bg-primary shadow-[0_0_20px_4px] shadow-primary/50" />
            </div>
          </div>

          {/* Orbit ring visual (flat circle) */}
          <div 
            className="absolute left-1/2 top-1/2 border border-border/20 rounded-full pointer-events-none"
            style={{
              width: ORBIT_RADIUS * 2,
              height: ORBIT_RADIUS * 2,
              transform: 'translate(-50%, -50%) rotateX(75deg)',
              transformStyle: 'preserve-3d',
            }}
          />

          {/* Cards arranged around orbit ring */}
          {orbitCards.map((cardId, index) => {
            const card = getCardById(cardId);
            if (!card) return null;

            // Calculate angle for this card
            const angle = (index * angleStep) + rotationAngle;
            const angleRad = (angle * Math.PI) / 180;
            
            // Position on circle: x = cos(angle)*radius, z = sin(angle)*radius
            const x = Math.cos(angleRad) * ORBIT_RADIUS;
            const z = Math.sin(angleRad) * ORBIT_RADIUS;
            
            // Scale based on z position (front = larger, back = smaller)
            const normalizedZ = (z + ORBIT_RADIUS) / (2 * ORBIT_RADIUS); // 0 to 1
            const scale = 0.6 + 0.4 * normalizedZ;
            const opacity = 0.5 + 0.5 * normalizedZ;
            const zIndex = Math.round(normalizedZ * 100);

            return (
              <div
                key={cardId}
                data-orbital-card
                className="absolute transition-opacity duration-150"
                style={{
                  width: CARD_WIDTH,
                  left: '50%',
                  top: '50%',
                  transform: `
                    translate(-50%, -50%)
                    translate3d(${x}px, 0, ${z}px)
                    scale(${scale})
                  `,
                  transformStyle: 'preserve-3d',
                  zIndex,
                  opacity,
                }}
              >
                <OrbitalCardComponent card={card} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Rotation indicator */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2 rounded-full bg-card/80 backdrop-blur border border-border/50">
        <span className="text-xs text-muted-foreground font-mono">
          {Math.round(rotationAngle % 360)}°
        </span>
        <span className="w-px h-3 bg-border" />
        <span className="text-xs text-muted-foreground font-mono">
          {cardCount} cards
        </span>
      </div>
    </div>
  );
}
