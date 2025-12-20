import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ChevronRight, Grip } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

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

// Card groupings for the three columns
const LEFT_COLUMN_IDS = [
  'decision-state',
  'market-conditions', 
  'capital',
  'gen-health',
  'agent-activity',
  'symbol-coverage',
];

const MIDDLE_COLUMN_IDS = [
  'trade-cycle',
  'control',
  'polling',
  'catalyst-watch',
  'autopsy',
  'system-audit',
];

const RIGHT_COLUMN_IDS = [
  'activity',
  'positions',
  'agents',
  'generations',
  'alerts',
  'gen-compare',
  'lineage',
  'rollover',
];

// Rolodex card component with emphasis effects - behaves exactly like orbit cards
function RolodexCard({ 
  card, 
  isActive, 
  onClick 
}: { 
  card: CommandCard; 
  isActive: boolean;
  onClick: () => void;
}) {
  const navigate = useNavigate();
  const CardComponent = card.component;
  
  const handleDrilldown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (card.drilldownPath) {
      navigate(card.drilldownPath);
    }
  };
  
  return (
    <div
      onClick={onClick}
      className={cn(
        "transition-all duration-300 cursor-pointer transform-gpu",
        // Active card: full visibility + subtle scale
        isActive 
          ? "scale-[1.02] opacity-100" 
          // Inactive: dimmed but still readable (not too dark)
          : "scale-[0.98] opacity-85 hover:opacity-95"
      )}
    >
      <Card 
        variant={isActive ? "glow" : "default"}
        className={cn(
          "transition-all duration-300 overflow-hidden",
          isActive && "ring-1 ring-primary/50 shadow-xl shadow-primary/15"
        )}
      >
        <CardHeader className="py-3 px-4 flex flex-row items-center justify-between border-b border-border/20">
          <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Grip className="h-3 w-3 opacity-50" />
            {card.title}
          </CardTitle>
          {card.type === 'drillable' && card.drilldownPath && (
            <button
              onClick={handleDrilldown}
              className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 transition-colors"
            >
              <span>View</span>
              <ChevronRight className="h-3 w-3" />
            </button>
          )}
        </CardHeader>
        <CardContent className="px-4 py-4">
          <CardComponent compact />
        </CardContent>
      </Card>
    </div>
  );
}

// Rolodex column with snap scrolling - true "one card viewport" experience
function RolodexColumn({ 
  cards, 
  allCards 
}: { 
  cards: string[]; 
  allCards: CommandCard[];
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [activeIndex, setActiveIndex] = useState(0);
  
  // Get card objects
  const columnCards = cards
    .map(id => allCards.find(c => c.id === id))
    .filter((c): c is CommandCard => c !== undefined);
  
  // IntersectionObserver for detecting active card (more reliable than scroll math)
  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    
    const observerOptions: IntersectionObserverInit = {
      root: scrollEl,
      threshold: [0, 0.3, 0.5, 0.7, 1],
      rootMargin: '-35% 0px -35% 0px', // Focus on center 30% of viewport
    };
    
    const intersectionRatios = new Map<number, number>();
    
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const index = Number(entry.target.getAttribute('data-card-index'));
        if (!isNaN(index)) {
          intersectionRatios.set(index, entry.intersectionRatio);
        }
      });
      
      // Find the card with highest intersection ratio
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
    
    // Observe all card wrappers
    cardRefs.current.forEach((el) => {
      observer.observe(el);
    });
    
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
      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        const newIndex = Math.min(activeIndex + 1, columnCards.length - 1);
        scrollToCard(newIndex);
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        const newIndex = Math.max(activeIndex - 1, 0);
        scrollToCard(newIndex);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeIndex, columnCards.length, scrollToCard]);
  
  return (
    <div className="h-full flex flex-col">
      {/* Scroll container - fixed viewport height with snap */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-hidden scroll-smooth"
        style={{
          scrollSnapType: 'y mandatory',
          scrollPaddingBlock: '12vh',
        }}
      >
        {/* Top spacer - allows first card to center */}
        <div className="h-[15vh]" aria-hidden="true" />
        
        {columnCards.map((card, index) => (
          <div 
            key={card.id}
            ref={(el) => {
              if (el) cardRefs.current.set(index, el);
              else cardRefs.current.delete(index);
            }}
            data-rolodex-card
            data-card-index={index}
            className="min-h-[70vh] flex items-center px-3 py-4"
            style={{ scrollSnapAlign: 'center' }}
          >
            <div className="w-full">
              <RolodexCard 
                card={card} 
                isActive={index === activeIndex}
                onClick={() => scrollToCard(index)}
              />
            </div>
          </div>
        ))}
        
        {/* Bottom spacer - allows last card to center */}
        <div className="h-[15vh]" aria-hidden="true" />
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

// Standard dock column (middle/right) with optional "More" section
function DockColumn({ 
  cards, 
  allCards,
  title,
  extraCards = [],
}: { 
  cards: string[]; 
  allCards: CommandCard[];
  title: string;
  extraCards?: string[];
}) {
  const navigate = useNavigate();
  
  const columnCards = cards
    .map(id => allCards.find(c => c.id === id))
    .filter((c): c is CommandCard => c !== undefined);
  
  const extraColumnCards = extraCards
    .map(id => allCards.find(c => c.id === id))
    .filter((c): c is CommandCard => c !== undefined);
  
  return (
    <div className="h-full flex flex-col">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border/30 px-3 py-2">
        <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
          {title}
        </h2>
      </div>
      
      {/* Scrollable content */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {columnCards.map(card => {
            const CardComponent = card.component;
            
            return (
              <Card key={card.id} variant="default" className="overflow-hidden">
                <CardHeader className="py-2 px-3 flex flex-row items-center justify-between border-b border-border/20">
                  <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                    {card.title}
                  </CardTitle>
                  {card.type === 'drillable' && card.drilldownPath && (
                    <button
                      onClick={() => navigate(card.drilldownPath!)}
                      className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 transition-colors"
                    >
                      <span>View</span>
                      <ChevronRight className="h-3 w-3" />
                    </button>
                  )}
                </CardHeader>
                <CardContent className="px-3 py-3">
                  <CardComponent compact />
                </CardContent>
              </Card>
            );
          })}
          
          {/* "More" section for extra/unassigned cards */}
          {extraColumnCards.length > 0 && (
            <>
              <div className="pt-4 pb-2 border-t border-border/30 mt-4">
                <h3 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
                  More
                </h3>
              </div>
              {extraColumnCards.map(card => {
                const CardComponent = card.component;
                
                return (
                  <Card key={card.id} variant="default" className="overflow-hidden">
                    <CardHeader className="py-2 px-3 flex flex-row items-center justify-between border-b border-border/20">
                      <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                        {card.title}
                      </CardTitle>
                      {card.type === 'drillable' && card.drilldownPath && (
                        <button
                          onClick={() => navigate(card.drilldownPath!)}
                          className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 transition-colors"
                        >
                          <span>View</span>
                          <ChevronRight className="h-3 w-3" />
                        </button>
                      )}
                    </CardHeader>
                    <CardContent className="px-3 py-3">
                      <CardComponent compact />
                    </CardContent>
                  </Card>
                );
              })}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// Mobile collapsible section
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
  // Build index map for O(1) lookups
  const byId = new Map(cards.map(c => [c.id, c]));
  
  // Build each column list using IDs that actually exist in the cards prop
  const leftCards = LEFT_COLUMN_IDS.filter(id => byId.has(id));
  const middleCards = MIDDLE_COLUMN_IDS.filter(id => byId.has(id));
  const rightCards = RIGHT_COLUMN_IDS.filter(id => byId.has(id));
  
  // Track which cards have been assigned
  const assigned = new Set([...leftCards, ...middleCards, ...rightCards]);
  
  // Find any cards NOT in the predefined lists (extras go to "More" section)
  const extraCards = cards.map(c => c.id).filter(id => !assigned.has(id));
  
  // Final right column includes extras under "More" section
  const finalRightCards = rightCards;
  const hasExtras = extraCards.length > 0;
  
  // Debug: log missing cards in development
  if (import.meta.env.DEV && extraCards.length > 0) {
    console.warn('[CommandCenter] Cards not in column lists:', extraCards);
  }
  
  return (
    <>
      {/* Desktop: 3-column grid */}
      <div className="hidden lg:grid h-[100dvh] w-full grid-cols-12 gap-0 bg-background">
        {/* Left: Rolodex (4 cols) */}
        <div className="col-span-4 border-r border-border/30 bg-muted/5">
          <RolodexColumn cards={leftCards} allCards={cards} />
        </div>
        
        {/* Middle: Operations Dock (4 cols) */}
        <div className="col-span-4 border-r border-border/30">
          <DockColumn cards={middleCards} allCards={cards} title="Operations" />
        </div>
        
        {/* Right: Activity Dock (4 cols) - includes "More" section for extras */}
        <div className="col-span-4">
          <DockColumn 
            cards={finalRightCards} 
            allCards={cards} 
            title="Activity" 
            extraCards={extraCards}
          />
        </div>
      </div>
      
      {/* Tablet: 2-column grid */}
      <div className="hidden md:grid lg:hidden h-[100dvh] w-full grid-cols-2 gap-0 bg-background">
        {/* Left: Rolodex */}
        <div className="border-r border-border/30 bg-muted/5">
          <RolodexColumn cards={leftCards} allCards={cards} />
        </div>
        
        {/* Right: Combined docks with extras */}
        <div className="overflow-y-auto">
          <DockColumn 
            cards={[...middleCards, ...finalRightCards]} 
            allCards={cards} 
            title="Dashboard" 
            extraCards={extraCards}
          />
        </div>
      </div>
      
      {/* Mobile: Single column with collapsible sections */}
      <div className="md:hidden h-[100dvh] w-full bg-background overflow-y-auto">
        <MobileSection 
          title="Status" 
          cards={leftCards} 
          allCards={cards} 
          defaultOpen={true} 
        />
        <MobileSection 
          title="Operations" 
          cards={middleCards} 
          allCards={cards} 
        />
        <MobileSection 
          title="Activity" 
          cards={finalRightCards} 
          allCards={cards} 
        />
        {/* Mobile: Show extras in their own section */}
        {extraCards.length > 0 && (
          <MobileSection 
            title="More" 
            cards={extraCards} 
            allCards={cards} 
          />
        )}
      </div>
    </>
  );
}
