import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { 
  DndContext, 
  DragOverlay, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  useDroppable,
} from '@dnd-kit/core';
import { 
  SortableContext, 
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ChevronRight, Grip, RotateCcw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLayoutState, Lane } from '@/hooks/useLayoutState';
import { DraggableCard } from './DraggableCard';
import { DropZone } from './DropZone';

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


// Orbit lane with vertical snap scrolling and 3D carousel effect
function OrbitLane({ 
  cardIds, 
  allCards,
  onReturnToOrbit,
}: { 
  cardIds: string[]; 
  allCards: CommandCard[];
  onReturnToOrbit: (cardId: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [activeIndex, setActiveIndex] = useState(0);
  
  // Make orbit a droppable zone
  const { isOver, setNodeRef } = useDroppable({
    id: 'orbit',
    data: { lane: 'orbit' },
  });
  
  const columnCards = cardIds
    .map(id => allCards.find(c => c.id === id))
    .filter((c): c is CommandCard => c !== undefined);
  
  // IntersectionObserver for detecting active card
  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    
    const observerOptions: IntersectionObserverInit = {
      root: scrollEl,
      threshold: [0, 0.3, 0.5, 0.7, 1],
      rootMargin: '-30% 0px -30% 0px',
    };
    
    const intersectionRatios = new Map<number, number>();
    
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const index = Number(entry.target.getAttribute('data-card-index'));
        if (!isNaN(index)) {
          intersectionRatios.set(index, entry.intersectionRatio);
        }
      });
      
      let maxRatio = 0;
      let maxIndex = 0;
      intersectionRatios.forEach((ratio, index) => {
        if (ratio > maxRatio) {
          maxRatio = ratio;
          maxIndex = index;
        }
      });
      
      if (maxRatio > 0) {
        setActiveIndex(maxIndex);
      }
    }, observerOptions);
    
    cardRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [columnCards.length]);
  
  const scrollToCard = useCallback((index: number) => {
    const cardEl = cardRefs.current.get(index);
    if (cardEl) {
      cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);
  
  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'j') {
        const newIndex = Math.min(activeIndex + 1, columnCards.length - 1);
        scrollToCard(newIndex);
      } else if (e.key === 'k') {
        const newIndex = Math.max(activeIndex - 1, 0);
        scrollToCard(newIndex);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeIndex, columnCards.length, scrollToCard]);
  
  if (columnCards.length === 0) {
    return (
      <div className="h-full min-h-0 flex flex-col">
        <div className="shrink-0 sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border/30 px-3 py-2">
          <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            Orbit
          </h2>
        </div>
        <div 
          ref={setNodeRef}
          className={cn(
            "flex-1 flex items-center justify-center text-muted-foreground text-sm",
            isOver && "bg-primary/5"
          )}
        >
          {isOver ? "Drop here to return" : "All cards placed"}
        </div>
      </div>
    );
  }
  
  return (
    <div className="h-full min-h-0 flex flex-col">
      {/* Header */}
      <div className="shrink-0 sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border/30 px-3 py-2">
        <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
          Orbit
        </h2>
      </div>
      
      {/* Scroll container - NO 3D transforms that block pointer events */}
      <div 
        ref={(el) => {
          scrollRef.current = el;
          setNodeRef(el);
        }}
        className={cn(
          "flex-1 min-h-0 overflow-y-auto overflow-x-hidden scroll-smooth",
          isOver && "bg-primary/5"
        )}
        style={{
          scrollSnapType: 'y mandatory',
          scrollPaddingBlock: '35%',
        }}
      >
        <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
          {/* Top spacer */}
          <div className="h-[25vh]" aria-hidden="true" />
          
          {columnCards.map((card, index) => {
            const distance = index - activeIndex;
            const absDistance = Math.abs(distance);
            const scale = Math.max(0.8, 1 - absDistance * 0.08);
            const opacity = Math.max(0.5, 1 - absDistance * 0.2);
            
            return (
              <div 
                key={card.id}
                ref={(el) => {
                  if (el) cardRefs.current.set(index, el);
                  else cardRefs.current.delete(index);
                }}
                data-card-index={index}
                className="min-h-[35vh] flex items-center px-3 py-2"
                style={{ scrollSnapAlign: 'center' }}
              >
                <div 
                  className="w-full transition-all duration-300"
                  style={{ 
                    transform: `scale(${scale})`,
                    opacity,
                  }}
                >
                  <DraggableCard 
                    card={card} 
                    lane="orbit"
                    isActive={index === activeIndex}
                    onReturnToOrbit={() => onReturnToOrbit(card.id)}
                  />
                </div>
              </div>
            );
          })}
          
          {/* Bottom spacer */}
          <div className="h-[25vh]" aria-hidden="true" />
        </SortableContext>
      </div>
      
      {/* Position indicator dots */}
      {columnCards.length > 1 && (
        <div className="flex justify-center gap-1.5 py-2 border-t border-border/30">
          {columnCards.map((_, index) => (
            <button
              key={index}
              onClick={() => scrollToCard(index)}
              aria-label={`Go to card ${index + 1}`}
              className={cn(
                "w-1.5 h-1.5 rounded-full transition-all duration-200",
                index === activeIndex 
                  ? "bg-primary w-4" 
                  : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Workspace column with drop zone
function WorkspaceColumn({ 
  lane,
  title,
  cardIds, 
  allCards,
  onReturnToOrbit,
}: { 
  lane: Lane;
  title: string;
  cardIds: string[]; 
  allCards: CommandCard[];
  onReturnToOrbit: (cardId: string) => void;
}) {
  const columnCards = cardIds
    .map(id => allCards.find(c => c.id === id))
    .filter((c): c is CommandCard => c !== undefined);
  
  return (
    <DropZone 
      lane={lane} 
      cardIds={cardIds} 
      title={title}
      isEmpty={columnCards.length === 0}
    >
      {columnCards.map(card => (
        <DraggableCard 
          key={card.id}
          card={card} 
          lane={lane}
          onReturnToOrbit={() => onReturnToOrbit(card.id)}
          compact
        />
      ))}
    </DropZone>
  );
}

// Layout toolbar
function LayoutToolbar({ onReset }: { onReset: () => void }) {
  return (
    <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-border/30 bg-background/95 backdrop-blur-sm">
      <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
        Command Center
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={onReset}
        className="h-7 px-2 text-xs gap-1"
      >
        <RotateCcw className="h-3 w-3" />
        Reset Layout
      </Button>
    </div>
  );
}

// Drag overlay card (shown while dragging)
function DragOverlayCard({ card }: { card: CommandCard }) {
  const CardComponent = card.component;
  
  return (
    <Card className="shadow-2xl ring-2 ring-primary/50 opacity-90 max-w-sm">
      <CardHeader className="py-2 px-3 border-b border-border/20">
        <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Grip className="h-3 w-3 opacity-50" />
          {card.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 py-3">
        <CardComponent compact />
      </CardContent>
    </Card>
  );
}

// Mobile section (unchanged from before)
function MobileSection({ 
  title, 
  cards, 
  allCards,
  defaultOpen = false 
}: { 
  title: string;
  cards: string[];
  allCards: CommandCard[];
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const navigate = useNavigate();
  
  const columnCards = cards
    .map(id => allCards.find(c => c.id === id))
    .filter((c): c is CommandCard => c !== undefined);
  
  return (
    <div className="border-b border-border/30">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm font-medium">{title}</span>
        <ChevronRight className={cn(
          "h-4 w-4 text-muted-foreground transition-transform",
          isOpen && "rotate-90"
        )} />
      </button>
      
      {isOpen && (
        <div className="px-4 pb-4 space-y-3">
          {columnCards.map(card => {
            const CardComponent = card.component;
            
            return (
              <Card key={card.id} variant="default">
                <CardHeader className="py-2 px-3 flex flex-row items-center justify-between">
                  <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                    {card.title}
                  </CardTitle>
                  {card.type === 'drillable' && card.drilldownPath && (
                    <button
                      onClick={() => navigate(card.drilldownPath!)}
                      className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 transition-colors"
                    >
                      <ChevronRight className="h-3 w-3" />
                    </button>
                  )}
                </CardHeader>
                <CardContent className="px-3 pb-3 pt-0">
                  <CardComponent compact />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function CommandCenter({ cards }: CommandCenterProps) {
  // Memoize card IDs to avoid unnecessary re-renders
  const allCardIds = useMemo(() => cards.map(c => c.id), [cards]);
  
  // Layout state with persistence
  const { layout, moveCard, reorderCard, resetLayout, returnToOrbit } = useLayoutState(allCardIds);
  
  // Track active drag
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeCard = activeId ? cards.find(c => c.id === activeId) : null;
  
  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor)
  );
  
  // Find which lane a card is in
  const findLane = (cardId: string): Lane | null => {
    if (layout.orbit.includes(cardId)) return 'orbit';
    if (layout.A.includes(cardId)) return 'A';
    if (layout.B.includes(cardId)) return 'B';
    return null;
  };
  
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };
  
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    
    if (!over) return;
    
    const activeCardId = active.id as string;
    const overId = over.id as string;
    
    const fromLane = findLane(activeCardId);
    if (!fromLane) return;
    
    // Determine target lane
    let toLane: Lane;
    let toIndex: number | undefined;
    
    // Check if dropped on a lane directly
    if (overId === 'orbit' || overId === 'A' || overId === 'B') {
      toLane = overId as Lane;
      toIndex = layout[toLane].length;
    } else {
      // Dropped on another card - find its lane
      const targetLane = findLane(overId);
      if (!targetLane) return;
      toLane = targetLane;
      toIndex = layout[toLane].indexOf(overId);
    }
    
    // Same lane reorder
    if (fromLane === toLane) {
      const fromIndex = layout[fromLane].indexOf(activeCardId);
      if (fromIndex !== toIndex && toIndex !== undefined) {
        reorderCard(fromLane, fromIndex, toIndex > fromIndex ? toIndex : toIndex);
      }
    } else {
      // Move between lanes
      moveCard(activeCardId, fromLane, toLane, toIndex);
    }
  };
  
  const handleReturnToOrbit = (cardId: string) => {
    const lane = findLane(cardId);
    if (lane && lane !== 'orbit') {
      returnToOrbit(cardId, lane);
    }
  };
  
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {/* Desktop: 3-column grid */}
      <div className="hidden lg:flex h-[100dvh] w-full flex-col bg-background overflow-hidden">
        <LayoutToolbar onReset={resetLayout} />
        
        <div className="flex-1 min-h-0 grid grid-cols-12 gap-0">
          {/* Left: Orbit (Card Tray) */}
          <div className="col-span-4 h-full min-h-0 border-r border-border/30 bg-muted/5">
            <OrbitLane 
              cardIds={layout.orbit} 
              allCards={cards}
              onReturnToOrbit={handleReturnToOrbit}
            />
          </div>
          
          {/* Middle: Column A (Workspace) */}
          <div className="col-span-4 h-full min-h-0 border-r border-border/30">
            <WorkspaceColumn 
              lane="A"
              title="Column A"
              cardIds={layout.A} 
              allCards={cards}
              onReturnToOrbit={handleReturnToOrbit}
            />
          </div>
          
          {/* Right: Column B (Workspace) */}
          <div className="col-span-4 h-full min-h-0">
            <WorkspaceColumn 
              lane="B"
              title="Column B"
              cardIds={layout.B} 
              allCards={cards}
              onReturnToOrbit={handleReturnToOrbit}
            />
          </div>
        </div>
      </div>
      
      {/* Tablet: 2-column grid */}
      <div className="hidden md:flex lg:hidden h-[100dvh] w-full flex-col bg-background overflow-hidden">
        <LayoutToolbar onReset={resetLayout} />
        
        <div className="flex-1 min-h-0 grid grid-cols-2 gap-0">
          {/* Left: Orbit */}
          <div className="h-full min-h-0 border-r border-border/30 bg-muted/5">
            <OrbitLane 
              cardIds={layout.orbit} 
              allCards={cards}
              onReturnToOrbit={handleReturnToOrbit}
            />
          </div>
          
          {/* Right: Combined columns */}
          <div className="h-full min-h-0 overflow-y-auto">
            <DropZone 
              lane="A"
              cardIds={[...layout.A, ...layout.B]} 
              title="Workspace"
              isEmpty={layout.A.length === 0 && layout.B.length === 0}
            >
              {[...layout.A, ...layout.B]
                .map(id => cards.find(c => c.id === id))
                .filter((c): c is CommandCard => c !== undefined)
                .map(card => (
                  <DraggableCard 
                    key={card.id}
                    card={card} 
                    lane={layout.A.includes(card.id) ? 'A' : 'B'}
                    onReturnToOrbit={() => handleReturnToOrbit(card.id)}
                    compact
                  />
                ))}
            </DropZone>
          </div>
        </div>
      </div>
      
      {/* Mobile: Single column (simplified, no DnD) */}
      <div className="md:hidden h-[100dvh] w-full bg-background overflow-y-auto">
        <MobileSection 
          title="All Cards" 
          cards={[...layout.orbit, ...layout.A, ...layout.B]} 
          allCards={cards} 
          defaultOpen={true} 
        />
      </div>
      
      {/* Drag overlay */}
      <DragOverlay>
        {activeCard ? <DragOverlayCard card={activeCard} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
