import React from 'react';
import { useOrbital } from '@/contexts/OrbitalContext';
import { OrbitalCardComponent } from './OrbitalCard';
import { cn } from '@/lib/utils';
import { ChevronUp, ChevronDown, Dock } from 'lucide-react';

interface DockZoneProps {
  zone: 'top' | 'bottom';
}

const DOCK_CONFIG = {
  top: { maxCards: 3, height: 'h-[280px]' },
  bottom: { maxCards: 1, height: 'h-[240px]' },
};

export function DockZone({ zone }: DockZoneProps) {
  const { dockState, getCardById, hoverZone, isDragging } = useOrbital();
  
  const dockedCardIds = zone === 'top' ? dockState.top : dockState.bottom;
  const isActive = hoverZone === zone && isDragging;
  const config = DOCK_CONFIG[zone];
  const isEmpty = dockedCardIds.length === 0;
  const cardCount = dockedCardIds.length;

  // Determine layout class based on number of cards
  const getLayoutClass = () => {
    if (zone === 'bottom') return 'grid-cols-1';
    switch (cardCount) {
      case 1: return 'grid-cols-1 max-w-2xl mx-auto';
      case 2: return 'grid-cols-2';
      case 3: return 'grid-cols-3';
      default: return 'grid-cols-1';
    }
  };

  return (
    <div
      className={cn(
        'w-full border-border/30 transition-all duration-300 relative',
        zone === 'top' ? 'border-b' : 'border-t',
        isEmpty ? 'h-16' : config.height,
        isActive && 'bg-primary/5 border-primary/40',
      )}
    >
      {/* Zone label */}
      <div className={cn(
        'absolute left-4 flex items-center gap-2 text-xs font-mono text-muted-foreground/60',
        zone === 'top' ? 'top-2' : 'bottom-2'
      )}>
        <Dock className="h-3 w-3" />
        <span>
          {zone === 'top' ? 'TOP' : 'BOTTOM'} DOCK ({cardCount}/{config.maxCards})
        </span>
      </div>

      {isEmpty ? (
        // Empty state with drop hint
        <div className={cn(
          'h-full flex items-center justify-center gap-3',
          'text-muted-foreground/40 transition-colors',
          isActive && 'text-primary/60'
        )}>
          {zone === 'top' ? (
            <>
              <ChevronUp className={cn('h-5 w-5', isActive && 'animate-bounce')} />
              <span className="text-sm font-mono">
                {isActive ? 'Release to dock' : 'Drag card here'}
              </span>
              <ChevronUp className={cn('h-5 w-5', isActive && 'animate-bounce')} />
            </>
          ) : (
            <>
              <ChevronDown className={cn('h-5 w-5', isActive && 'animate-bounce')} />
              <span className="text-sm font-mono">
                {isActive ? 'Release to dock' : 'Drag card here'}
              </span>
              <ChevronDown className={cn('h-5 w-5', isActive && 'animate-bounce')} />
            </>
          )}
        </div>
      ) : (
        // Docked cards grid
        <div className={cn(
          'h-full p-4 pt-8 grid gap-4',
          getLayoutClass()
        )}>
          {dockedCardIds.map((cardId) => {
            const card = getCardById(cardId);
            if (!card) return null;
            
            return (
              <div key={cardId} className="h-full">
                <OrbitalCardComponent 
                  card={card} 
                  isDocked 
                  dockZone={zone}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Active drop glow effect */}
      {isActive && (
        <div className={cn(
          'absolute inset-0 pointer-events-none',
          'bg-gradient-to-b from-primary/10 to-transparent',
          zone === 'bottom' && 'bg-gradient-to-t'
        )} />
      )}
    </div>
  );
}
