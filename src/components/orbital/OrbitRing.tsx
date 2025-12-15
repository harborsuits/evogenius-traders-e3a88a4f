import React, { useRef, useCallback, useEffect, useState } from 'react';
import { useOrbital } from '@/contexts/OrbitalContext';
import { OrbitalCardComponent } from './OrbitalCard';
import { cn } from '@/lib/utils';
import { DOCK_HEIGHT, DOCK_HEIGHT_EMPTY } from './DockZone';

// Fixed uniform dimensions for ALL orbit cards
const ORBIT_CARD_W = 340;
const ORBIT_CARD_H = 280;
const PERSPECTIVE = 1500;
const CARD_MARGIN = 16;
const MIN_RADIUS = 120;
const MAX_RADIUS = 450;

export function OrbitRing() {
  const { orbitCards, rotationAngle, rotateOrbit, getCardById, isDragging, dockState } = useOrbital();
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const isDraggingOrbit = useRef(false);
  const lastX = useRef(0);
  const [safeArea, setSafeArea] = useState({ width: 0, height: 0, radius: MIN_RADIUS });

  // Calculate safe area and radius based on container and dock state
  useEffect(() => {
    const updateSafeArea = () => {
      if (!containerRef.current) return;
      
      const rect = containerRef.current.getBoundingClientRect();
      const safeWidth = rect.width;
      const safeHeight = rect.height;
      
      // Clamp radius so full card never exits safe box
      const radiusXMax = (safeWidth / 2) - (ORBIT_CARD_W / 2) - CARD_MARGIN;
      const radiusYMax = (safeHeight / 2) - (ORBIT_CARD_H / 2) - CARD_MARGIN;
      const radius = Math.max(MIN_RADIUS, Math.min(radiusXMax, radiusYMax, MAX_RADIUS));
      
      setSafeArea({ width: safeWidth, height: safeHeight, radius });
    };
    
    updateSafeArea();
    window.addEventListener('resize', updateSafeArea);
    return () => window.removeEventListener('resize', updateSafeArea);
  }, [dockState]); // Recompute when dock state changes

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
      {/* Orbit Stage - sized to fit cards at current radius */}
      <div 
        ref={stageRef}
        data-orbit-stage
        className="relative"
        style={{
          width: safeArea.radius * 2 + ORBIT_CARD_W,
          height: safeArea.radius * 2 + ORBIT_CARD_H,
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
            width: safeArea.radius * 2,
            height: safeArea.radius * 2,
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
          const x = Math.cos(angleRad) * safeArea.radius;
          const z = Math.sin(angleRad) * safeArea.radius;
          
          // Depth effect: z-index ordering only, NO size scaling
          const normalizedDepth = (z + safeArea.radius) / (safeArea.radius * 2); // 0 = back, 1 = front
          
          // Subtle opacity for depth hint only
          const opacity = 0.8 + 0.2 * normalizedDepth;
          // Z-index based on depth (front cards layer above back cards)
          const zIndex = Math.round(normalizedDepth * 100);

          return (
            <div
              key={cardId}
              data-orbital-card
              className="absolute"
              style={{
                // HARD FIXED dimensions - no exceptions
                width: ORBIT_CARD_W,
                height: ORBIT_CARD_H,
                maxWidth: ORBIT_CARD_W,
                maxHeight: ORBIT_CARD_H,
                minWidth: ORBIT_CARD_W,
                minHeight: ORBIT_CARD_H,
                left: '50%',
                top: '50%',
                // translate3d(x, 0, z) for true 3D ring - scale is ALWAYS 1.0
                transform: `translate(-50%, -50%) translate3d(${x}px, 0px, ${z}px)`,
                zIndex,
                opacity,
                transformStyle: 'preserve-3d',
              }}
            >
              <OrbitalCardComponent 
                card={card} 
                cardWidth={ORBIT_CARD_W}
                cardHeight={ORBIT_CARD_H}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
