import React, { useRef, useCallback, useEffect, useState } from 'react';
import { useOrbital } from '@/contexts/OrbitalContext';
import { OrbitalCardComponent } from './OrbitalCard';
import { cn } from '@/lib/utils';

const CARD_WIDTH = 340;
const CARD_HEIGHT = 260;

export function OrbitRing() {
  const { orbitCards, rotationAngle, rotateOrbit, getCardById, isDragging } = useOrbital();
  const containerRef = useRef<HTMLDivElement>(null);
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

  // Responsive radius: clamp(380, min(viewportW, viewportH) * 0.42, 640)
  const radius = Math.max(380, Math.min(Math.min(dimensions.width, dimensions.height) * 0.42, 640));
  
  // Safe padding to prevent card clipping at top/bottom
  const safePadding = CARD_HEIGHT / 2 + 40;

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
      style={{ padding: `${safePadding}px 0` }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onWheel={handleWheel}
    >
      {/* Center anchor point (glowing dot) */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-0 pointer-events-none">
        <div className="relative">
          <div className="absolute -inset-16 rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute -inset-8 rounded-full bg-primary/10 blur-xl" />
          <div className="w-5 h-5 rounded-full bg-primary/70 shadow-[0_0_30px_8px] shadow-primary/40" />
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

      {/* Full cards arranged around orbit ring */}
      {orbitCards.map((cardId, index) => {
        const card = getCardById(cardId);
        if (!card) return null;

        // Calculate angle for this card
        const angle = (index * angleStep) + rotationAngle;
        const angleRad = (angle * Math.PI) / 180;
        
        // Position on circle: x = cos(angle)*radius, y = sin(angle)*radius
        const x = Math.cos(angleRad) * radius;
        const y = Math.sin(angleRad) * radius;
        
        // Depth effect based on y position (top = back, bottom = front)
        // sin(angle) ranges from -1 (top/back) to +1 (bottom/front)
        const normalizedDepth = (Math.sin(angleRad) + 1) / 2; // 0 = back, 1 = front
        
        // Clamped scale: 0.85 to 1.0
        const scale = 0.85 + 0.15 * normalizedDepth;
        // Clamped opacity: 0.85 to 1.0
        const opacity = 0.85 + 0.15 * normalizedDepth;
        // Z-index based on depth
        const zIndex = Math.round(normalizedDepth * 100);

        return (
          <div
            key={cardId}
            data-orbital-card
            className="absolute transition-transform duration-100 ease-out"
            style={{
              width: CARD_WIDTH,
              height: CARD_HEIGHT,
              left: '50%',
              top: '50%',
              transform: `translate(-50%, -50%) translate(${x}px, ${y}px) scale(${scale})`,
              zIndex,
              opacity,
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

      {/* Rotation indicator */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2 rounded-full bg-card/80 backdrop-blur border border-border/50 z-50">
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
