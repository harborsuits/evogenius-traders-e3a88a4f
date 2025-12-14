import React from 'react';
import { useOrbital } from '@/contexts/OrbitalContext';
import { OrbitalCardComponent } from './OrbitalCard';
import { cn } from '@/lib/utils';
import { ChevronUp, ChevronDown, Dock } from 'lucide-react';

interface DockZoneProps {
  zone: 'top' | 'bottom';
}

const DOCK_HEIGHT = 260;
const DOCK_HEIGHT_EMPTY = 8;

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
        // Empty state - minimal hint only when dragging
        <div 
          className={cn(
            'h-full flex items-center justify-center',
            'text-muted-foreground/30 transition-colors',
            isActive && 'text-primary/60'
          )}
          style={{ pointerEvents: 'none' }}
        >
          {isActive && (
            zone === 'top' ? (
              <ChevronUp className="h-4 w-4 animate-bounce" />
            ) : (
              <ChevronDown className="h-4 w-4 animate-bounce" />
            )
          )}
        </div>
      ) : (
        // Docked cards - minimal padding
        <div 
          className="h-full px-2 py-1 flex gap-2 justify-center items-stretch"
          style={{ pointerEvents: 'none' }}
        >
          {dockedCardIds.map((cardId) => {
            const card = getCardById(cardId);
            if (!card) return null;
            
            // Full width cards, split evenly
            const widthPercent = cardCount === 1 
              ? '100%' 
              : cardCount === 2 
                ? '50%' 
                : '33.33%';
            
            return (
              <div 
                key={cardId} 
                className="h-full"
                style={{ 
                  width: widthPercent,
                  flex: 1,
                  pointerEvents: 'auto',
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
