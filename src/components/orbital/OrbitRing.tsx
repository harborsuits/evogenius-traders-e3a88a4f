import React, { useRef, useCallback, useEffect, useState } from 'react';
import { useOrbital } from '@/contexts/OrbitalContext';
import { OrbitCapsule } from './OrbitCapsule';
import { cn } from '@/lib/utils';

export function OrbitRing() {
  const { orbitCards, rotationAngle, rotateOrbit, getCardById, isDragging } = useOrbital();
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingOrbit = useRef(false);
  const lastX = useRef(0);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Responsive radius calculation
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

  // Responsive radius: clamp(420, min(viewportW, viewportH)*0.45, 720)
  const radius = Math.max(320, Math.min(Math.min(dimensions.width, dimensions.height) * 0.42, 580));

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
    
    rotateOrbit(deltaX * 0.4);
  }, [rotateOrbit]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDraggingOrbit.current) return;
    isDraggingOrbit.current = false;
    containerRef.current?.releasePointerCapture(e.pointerId);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    rotateOrbit(e.deltaY * 0.2);
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
    >
      {/* Center anchor point (glowing dot) */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none">
        <div className="relative">
          <div className="absolute -inset-12 rounded-full bg-primary/5 blur-2xl" />
          <div className="absolute -inset-6 rounded-full bg-primary/10 blur-lg" />
          <div className="w-4 h-4 rounded-full bg-primary/80 shadow-[0_0_24px_6px] shadow-primary/40" />
        </div>
      </div>

      {/* Orbit ring visual (subtle circle) */}
      <div 
        className="absolute left-1/2 top-1/2 border border-border/20 rounded-full pointer-events-none"
        style={{
          width: radius * 2,
          height: radius * 2,
          transform: 'translate(-50%, -50%)',
        }}
      />
      
      {/* Secondary inner ring */}
      <div 
        className="absolute left-1/2 top-1/2 border border-border/10 rounded-full pointer-events-none"
        style={{
          width: radius * 1.2,
          height: radius * 1.2,
          transform: 'translate(-50%, -50%)',
        }}
      />

      {/* Capsules arranged around orbit ring */}
      {orbitCards.map((cardId, index) => {
        const card = getCardById(cardId);
        if (!card) return null;

        // Calculate angle for this card
        const angle = (index * angleStep) + rotationAngle;
        const angleRad = (angle * Math.PI) / 180;
        
        // Position on circle
        const x = Math.cos(angleRad) * radius;
        const y = Math.sin(angleRad) * radius;
        
        // Subtle depth effect (clamped tightly for visibility)
        // Front (bottom of screen) = angle ~90deg, back (top) = angle ~270deg
        const normalizedDepth = (Math.sin(angleRad) + 1) / 2; // 0 = back, 1 = front
        const scale = 0.88 + 0.12 * normalizedDepth; // 0.88 to 1.0
        const opacity = 0.88 + 0.12 * normalizedDepth; // 0.88 to 1.0
        const zIndex = Math.round(normalizedDepth * 100);

        return (
          <div
            key={cardId}
            className="absolute transition-transform duration-75"
            style={{
              left: '50%',
              top: '50%',
              transform: `translate(-50%, -50%) translate(${x}px, ${y}px) scale(${scale})`,
              zIndex,
              opacity,
            }}
          >
            <OrbitCapsule card={card} />
          </div>
        );
      })}

      {/* Rotation indicator */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2 rounded-full bg-card/80 backdrop-blur border border-border/50">
        <span className="text-xs text-muted-foreground font-mono">
          {Math.round(((rotationAngle % 360) + 360) % 360)}°
        </span>
        <span className="w-px h-3 bg-border" />
        <span className="text-xs text-muted-foreground font-mono">
          {cardCount} modules
        </span>
      </div>
    </div>
  );
}
