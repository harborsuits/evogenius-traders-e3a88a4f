import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { RotateCcw, Circle } from 'lucide-react';
import { useGridState } from '@/hooks/useGridState';
import { GridSlot } from '@/components/dashboard/GridSlot';
import { OrbModal } from '@/components/dashboard/OrbModal';
import { PriceTicker } from '@/components/dashboard/PriceTicker';

const CARD_HEIGHT = 240;

export interface CommandCard {
  id: string;
  title: string;
  type: 'cockpit' | 'drillable';
  drilldownPath?: string;
  component: React.ComponentType<{ compact?: boolean }>;
}

interface CommandCenterProps {
  cards: CommandCard[];
}

export function CommandCenter({ cards }: CommandCenterProps) {
  const allCardIds = useMemo(() => cards.map(c => c.id), [cards]);
  const [orbOpen, setOrbOpen] = useState(false);
  
  const {
    orbitIds,
    rowCount,
    armedSlot,
    placeIntoArmedOrFirst,
    removeCard,
    armSlot,
    clearArmedSlot,
    reset,
    getCardAt,
    isArmed,
  } = useGridState(allCardIds);
  
  // Cards available in orbit
  const orbitCards = useMemo(() => {
    return orbitIds
      .map(id => cards.find(c => c.id === id))
      .filter((c): c is CommandCard => c !== undefined);
  }, [orbitIds, cards]);
  
  // Handle card selection from orb
  const handleSelectCard = (cardId: string) => {
    placeIntoArmedOrFirst(cardId);
    setOrbOpen(false);
  };
  
  // Handle slot click
  const handleSlotClick = (row: number, col: 'A' | 'B') => {
    armSlot(row, col);
    setOrbOpen(true);
  };
  
  // Get armed slot label for modal
  const armedSlotLabel = armedSlot 
    ? `Row ${parseInt(armedSlot.split('-')[0]) + 1}, Column ${armedSlot.split('-')[1]}`
    : undefined;
  
  // Generate rows for the grid
  const rows = Array.from({ length: rowCount }, (_, i) => i);
  
  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      {/* Price + News Tickers */}
      <PriceTicker />
      
      {/* Toolbar */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-border/30">
        <div className="flex items-center gap-3">
          {/* Orb button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOrbOpen(true)}
            className="h-8 gap-2 font-mono text-xs"
          >
            <Circle className="h-4 w-4 text-primary" />
            Orbit
            {orbitCards.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-primary/20 text-primary rounded text-[10px]">
                {orbitCards.length}
              </span>
            )}
          </Button>
        </div>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={reset}
          className="h-7 px-2 text-xs gap-1"
        >
          <RotateCcw className="h-3 w-3" />
          Reset
        </Button>
      </div>
      
      {/* Grid workspace */}
      <div className="flex-1 overflow-y-auto p-4">
        <div 
          className="grid grid-cols-2 gap-3 max-w-5xl mx-auto"
          style={{ gridAutoRows: CARD_HEIGHT }}
        >
          {rows.map((row) => (
            <React.Fragment key={row}>
              {/* Column A */}
              <GridSlot
                row={row}
                col="A"
                card={(() => {
                  const cardId = getCardAt(row, 'A');
                  return cardId ? cards.find(c => c.id === cardId) || null : null;
                })()}
                isArmed={isArmed(row, 'A')}
                onArmSlot={() => handleSlotClick(row, 'A')}
                onRemoveCard={() => removeCard(row, 'A')}
              />
              
              {/* Column B */}
              <GridSlot
                row={row}
                col="B"
                card={(() => {
                  const cardId = getCardAt(row, 'B');
                  return cardId ? cards.find(c => c.id === cardId) || null : null;
                })()}
                isArmed={isArmed(row, 'B')}
                onArmSlot={() => handleSlotClick(row, 'B')}
                onRemoveCard={() => removeCard(row, 'B')}
              />
            </React.Fragment>
          ))}
        </div>
      </div>
      
      {/* Orb Modal */}
      <OrbModal
        isOpen={orbOpen}
        onClose={() => {
          setOrbOpen(false);
          clearArmedSlot();
        }}
        cards={orbitCards}
        onSelectCard={handleSelectCard}
        armedSlotLabel={armedSlotLabel}
      />
    </div>
  );
}
