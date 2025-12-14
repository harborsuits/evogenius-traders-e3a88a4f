import React from 'react';
import { useOrbital } from '@/contexts/OrbitalContext';
import { OrbitalCardComponent } from './OrbitalCard';
import { cn } from '@/lib/utils';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface DockZoneProps {
  zone: 'top' | 'bottom';
}

export function DockZone({ zone }: DockZoneProps) {
  const { dockState, getCardById, hoverZone, isDragging } = useOrbital();
  
  const dockedCardIds = zone === 'top' ? dockState.top : dockState.bottom;
  const isActive = hoverZone === zone && isDragging;
  const maxCards = zone === 'top' ? 3 : 1;
  const isEmpty = dockedCardIds.length === 0;

  return (
    <div
      className={cn(
        'transition-all duration-200',
        zone === 'top' ? 'border-b border-border/50' : 'border-t border-border/50',
        isActive && 'bg-primary/10 border-primary/50',
        isEmpty && !isActive && 'bg-muted/20',
        isEmpty ? 'h-20' : zone === 'top' ? 'min-h-[180px]' : 'min-h-[200px]'
      )}
    >
      {isEmpty ? (
        <div className={cn(
          'h-full flex items-center justify-center gap-2 text-xs text-muted-foreground font-mono',
          isActive && 'text-primary'
        )}>
          {zone === 'top' ? (
            <>
              <ChevronUp className={cn('h-4 w-4', isActive && 'animate-bounce')} />
              <span>{isActive ? 'Drop to dock here' : `Top Dock (0/${maxCards})`}</span>
              <ChevronUp className={cn('h-4 w-4', isActive && 'animate-bounce')} />
            </>
          ) : (
            <>
              <ChevronDown className={cn('h-4 w-4', isActive && 'animate-bounce')} />
              <span>{isActive ? 'Drop to dock here' : `Bottom Dock (0/${maxCards})`}</span>
              <ChevronDown className={cn('h-4 w-4', isActive && 'animate-bounce')} />
            </>
          )}
        </div>
      ) : (
        <div className={cn(
          'h-full p-3',
          zone === 'top' ? 'flex gap-3' : 'grid'
        )}>
          {dockedCardIds.map((cardId) => {
            const card = getCardById(cardId);
            if (!card) return null;
            
            return (
              <div 
                key={cardId} 
                className={cn(
                  zone === 'top' ? 'flex-1 max-w-[400px]' : 'w-full'
                )}
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
    </div>
  );
}
