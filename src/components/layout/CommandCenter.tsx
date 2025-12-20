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

// Rolodex card component with emphasis effects
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
        "scroll-snap-align-center transition-all duration-300 cursor-pointer",
        "transform-gpu",
        isActive 
          ? "scale-[1.02] opacity-100" 
          : "scale-100 opacity-70 hover:opacity-85"
      )}
    >
      <Card 
        variant={isActive ? "glow" : "default"}
        className={cn(
          "h-full transition-all duration-300",
          isActive && "ring-1 ring-primary/40 shadow-lg shadow-primary/10"
        )}
      >
        <CardHeader className="py-2 px-3 flex flex-row items-center justify-between">
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
        <CardContent className="px-3 pb-3 pt-0">
          <CardComponent compact />
        </CardContent>
      </Card>
    </div>
  );
}

// Rolodex column with snap scrolling
function RolodexColumn({ 
  cards, 
  allCards 
}: { 
  cards: string[]; 
  allCards: CommandCard[];
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  
  // Get card objects
  const columnCards = cards
    .map(id => allCards.find(c => c.id === id))
    .filter((c): c is CommandCard => c !== undefined);
  
  // Handle scroll to detect active card
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    
    const container = scrollRef.current;
    const containerRect = container.getBoundingClientRect();
    const containerCenter = containerRect.top + containerRect.height / 2;
    
    const cards = container.querySelectorAll('[data-rolodex-card]');
    let closestIndex = 0;
    let closestDistance = Infinity;
    
    cards.forEach((card, index) => {
      const rect = card.getBoundingClientRect();
      const cardCenter = rect.top + rect.height / 2;
      const distance = Math.abs(containerCenter - cardCenter);
      
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });
    
    setActiveIndex(closestIndex);
  }, []);
  
  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    
    scrollEl.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Initial check
    
    return () => scrollEl.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);
  
  const scrollToCard = (index: number) => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    
    const cards = scrollEl.querySelectorAll('[data-rolodex-card]');
    const card = cards[index];
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };
  
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
  }, [activeIndex, columnCards.length]);
  
  return (
    <div className="h-full flex flex-col">
      {/* Scroll container with snap */}
      <div 
        ref={scrollRef}
        className={cn(
          "flex-1 overflow-y-auto overflow-x-hidden",
          "scroll-smooth",
          "px-3 py-6"
        )}
        style={{
          scrollSnapType: 'y mandatory',
          scrollPaddingTop: '4rem',
          scrollPaddingBottom: '4rem',
        }}
      >
        {/* Spacer for peeking effect at top */}
        <div className="h-16" />
        
        <div className="space-y-6">
          {columnCards.map((card, index) => (
            <div 
              key={card.id}
              data-rolodex-card
              className="snap-center"
              style={{ scrollSnapAlign: 'center' }}
            >
              <RolodexCard 
                card={card} 
                isActive={index === activeIndex}
                onClick={() => scrollToCard(index)}
              />
            </div>
          ))}
        </div>
        
        {/* Spacer for peeking effect at bottom */}
        <div className="h-16" />
      </div>
      
      {/* Position indicator dots */}
      {columnCards.length > 1 && (
        <div className="flex justify-center gap-1.5 py-2 border-t border-border/30">
          {columnCards.map((_, index) => (
            <button
              key={index}
              onClick={() => scrollToCard(index)}
              className={cn(
                "w-1.5 h-1.5 rounded-full transition-all",
                index === activeIndex 
                  ? "bg-primary w-3" 
                  : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Standard dock column (middle/right)
function DockColumn({ 
  cards, 
  allCards,
  title 
}: { 
  cards: string[]; 
  allCards: CommandCard[];
  title: string;
}) {
  const navigate = useNavigate();
  
  const columnCards = cards
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
  // Filter cards into columns, falling back to reasonable defaults
  const leftCards = LEFT_COLUMN_IDS.filter(id => cards.some(c => c.id === id));
  const middleCards = MIDDLE_COLUMN_IDS.filter(id => cards.some(c => c.id === id));
  const rightCards = RIGHT_COLUMN_IDS.filter(id => cards.some(c => c.id === id));
  
  // Any cards not in the predefined lists go to the right column
  const assignedIds = [...LEFT_COLUMN_IDS, ...MIDDLE_COLUMN_IDS, ...RIGHT_COLUMN_IDS];
  const unassignedCards = cards.filter(c => !assignedIds.includes(c.id)).map(c => c.id);
  const finalRightCards = [...rightCards, ...unassignedCards];
  
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
        
        {/* Right: Activity Dock (4 cols) */}
        <div className="col-span-4">
          <DockColumn cards={finalRightCards} allCards={cards} title="Activity" />
        </div>
      </div>
      
      {/* Tablet: 2-column grid */}
      <div className="hidden md:grid lg:hidden h-[100dvh] w-full grid-cols-2 gap-0 bg-background">
        {/* Left: Rolodex */}
        <div className="border-r border-border/30 bg-muted/5">
          <RolodexColumn cards={leftCards} allCards={cards} />
        </div>
        
        {/* Right: Combined docks with tabs could go here, for now stacked */}
        <div className="overflow-y-auto">
          <DockColumn 
            cards={[...middleCards, ...finalRightCards]} 
            allCards={cards} 
            title="Dashboard" 
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
      </div>
    </>
  );
}
