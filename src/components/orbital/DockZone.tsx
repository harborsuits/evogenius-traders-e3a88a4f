import React from 'react';
import { useOrbital } from '@/contexts/OrbitalContext';
import { OrbitalCardComponent } from './OrbitalCard';
import { cn } from '@/lib/utils';
import { ChevronUp, ChevronDown, Dock } from 'lucide-react';

interface DockZoneProps {
  zone: 'top' | 'bottom';
}

const DOCK_HEIGHT = 200;
const DOCK_HEIGHT_EMPTY = 16;

const DOCK_CONFIG = {
  top: { maxCards: 3 },
  bottom: { maxCards: 1 },
};

export function DockZone({ zone }: DockZoneProps) {
  const { dockState, getCardById, hoverZone, isDragging } = useOrbital();
  
  const dockedCardIds = zone === 'top' ? dockState.top : dockState.bottom;
  const isActive = hoverZone === zone && isDragging;
  const config = DOCK_CONFIG[zone];
  const isEmpty = dockedCardIds.length === 0;
  const cardCount = dockedCardIds.length;

  return (
    <div
      className={cn(
        'relative w-full border-border/30 transition-all duration-300',
        zone === 'top' ? 'border-b' : 'border-t',
        isActive && 'bg-primary/5 border-primary/50',
      )}
      style={{ 
        height: isEmpty ? DOCK_HEIGHT_EMPTY : DOCK_HEIGHT,
        // Dock containers don't capture pointer events except on docked cards
        pointerEvents: 'none',
      }}
    >

      {isEmpty ? (
        // Empty state with drop hint
        <div 
          className={cn(
            'h-full flex items-center justify-center gap-3',
            'text-muted-foreground/40 transition-colors',
            isActive && 'text-primary/60'
          )}
          style={{ pointerEvents: 'none' }}
        >
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
        // Docked cards - flex layout with gap, cards get pointer events
        <div 
          className="h-full p-4 pt-8 flex gap-4 justify-center"
          style={{ pointerEvents: 'none' }}
        >
          {dockedCardIds.map((cardId) => {
            const card = getCardById(cardId);
            if (!card) return null;
            
            // Calculate card width based on count
            // 1 card: ~100% of container (max-width limited)
            // 2 cards: ~50% each
            // 3 cards: ~33% each
            const widthPercent = zone === 'bottom' 
              ? '100%' 
              : cardCount === 1 
                ? '60%' 
                : cardCount === 2 
                  ? '45%' 
                  : '30%';
            
            return (
              <div 
                key={cardId} 
                className="h-full"
                style={{ 
                  width: widthPercent,
                  maxWidth: cardCount === 1 ? 700 : 500,
                  pointerEvents: 'auto', // Only docked cards get pointer events
                }}
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
      )}

      {/* Active drop glow effect */}
      {isActive && (
        <div 
          className={cn(
            'absolute inset-0',
            'bg-gradient-to-b from-primary/10 to-transparent',
            zone === 'bottom' && 'bg-gradient-to-t'
          )}
          style={{ pointerEvents: 'none' }}
        />
      )}
    </div>
  );
}
