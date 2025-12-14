import React from 'react';
import { useOrbital } from '@/contexts/OrbitalContext';
import { OrbitalCardComponent } from './OrbitalCard';
import { cn } from '@/lib/utils';

interface DockZoneProps {
  zone: 'top' | 'bottom';
}

const DOCK_CONFIG = {
  top: { maxCards: 3, height: 300 },
  bottom: { maxCards: 1, height: 300 },
};

export function DockZone({ zone }: DockZoneProps) {
  const { dockState, getCardById, hoverZone, isDragging } = useOrbital();
  
  const dockedCardIds = zone === 'top' ? dockState.top : dockState.bottom;
  const isActive = hoverZone === zone && isDragging;
  const config = DOCK_CONFIG[zone];
  const cardCount = dockedCardIds.length;

  // Determine layout class based on number of cards (matching prototype)
  const getCardStyle = (): React.CSSProperties => {
    if (cardCount === 1) return { width: '100%' };
    if (cardCount === 2) return { width: 'calc(50% - 10px)' };
    if (cardCount === 3) return { width: 'calc(33.333% - 14px)' };
    return { width: '100%' };
  };

  return (
    <div
      className={cn(
        'fixed left-0 right-0 flex gap-5 px-5 z-[500]',
        'pointer-events-none',
        isActive && 'bg-primary/5'
      )}
      style={{
        height: config.height,
        top: zone === 'top' ? 20 : undefined,
        bottom: zone === 'bottom' ? 80 : undefined,
      }}
    >
      {dockedCardIds.map((cardId) => {
        const card = getCardById(cardId);
        if (!card) return null;
        
        return (
          <div 
            key={cardId} 
            className="pointer-events-auto h-[240px] transition-all duration-500"
            style={getCardStyle()}
          >
            <OrbitalCardComponent 
              card={card} 
              isDocked 
              dockZone={zone}
            />
          </div>
        );
      })}
    </div>
  );
}
