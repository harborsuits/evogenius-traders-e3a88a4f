import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Circle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const CARD_HEIGHT = 240;

interface OrbCard {
  id: string;
  title: string;
  component: React.ComponentType<{ compact?: boolean }>;
}

interface OrbModalProps {
  isOpen: boolean;
  onClose: () => void;
  cards: OrbCard[];
  onSelectCard: (cardId: string) => void;
  armedSlotLabel?: string;
}

export function OrbModal({ isOpen, onClose, cards, onSelectCard, armedSlotLabel }: OrbModalProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [activeIndex, setActiveIndex] = useState(0);
  
  // IntersectionObserver for detecting active card
  useEffect(() => {
    if (!isOpen) return;
    
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
  }, [isOpen, cards.length]);
  
  const scrollToCard = useCallback((index: number) => {
    const cardEl = cardRefs.current.get(index);
    if (cardEl) {
      cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);
  
  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        const newIndex = Math.min(activeIndex + 1, cards.length - 1);
        scrollToCard(newIndex);
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        const newIndex = Math.max(activeIndex - 1, 0);
        scrollToCard(newIndex);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (cards[activeIndex]) {
          onSelectCard(cards[activeIndex].id);
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, activeIndex, cards, scrollToCard, onSelectCard, onClose]);
  
  if (!isOpen) return null;
  
  if (cards.length === 0) {
    return (
      <div 
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center"
        onClick={onClose}
      >
        <div className="text-center text-muted-foreground">
          <Circle className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-mono">All cards placed</p>
          <p className="text-sm mt-2">Remove cards from the grid to return them to orbit</p>
        </div>
      </div>
    );
  }
  
  return (
    <div 
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Close button */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-4 right-4 text-white/70 hover:text-white hover:bg-white/10"
        onClick={onClose}
      >
        <X className="h-6 w-6" />
      </Button>
      
      {/* Header */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 text-center">
        <h2 className="text-white font-mono text-lg uppercase tracking-widest">Orbit</h2>
        {armedSlotLabel && (
          <p className="text-primary text-sm mt-1">
            Placing into: {armedSlotLabel}
          </p>
        )}
        <p className="text-white/50 text-xs mt-1">
          Click a card to place • ESC to close
        </p>
      </div>
      
      {/* Rolodex scroll container */}
      <div 
        ref={scrollRef}
        className="h-full overflow-y-auto scroll-smooth pt-24 pb-24"
        style={{
          scrollSnapType: 'y mandatory',
          scrollPaddingBlock: '35%',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top spacer */}
        <div className="h-[30vh]" aria-hidden="true" />
        
        {cards.map((card, index) => {
          const distance = index - activeIndex;
          const absDistance = Math.abs(distance);
          const visualOpacity = Math.max(0.4, 1 - absDistance * 0.25);
          const CardComponent = card.component;
          
          return (
            <div 
              key={card.id}
              ref={(el) => {
                if (el) cardRefs.current.set(index, el);
                else cardRefs.current.delete(index);
              }}
              data-card-index={index}
              className="flex items-center justify-center px-4 w-full max-w-lg mx-auto cursor-pointer"
              style={{ 
                height: CARD_HEIGHT + 16,
                scrollSnapAlign: 'center',
                opacity: visualOpacity,
                transition: 'opacity 300ms',
              }}
              onClick={() => onSelectCard(card.id)}
            >
              <Card 
                variant={index === activeIndex ? "glow" : "default"}
                className={cn(
                  "w-full flex flex-col overflow-hidden transition-all",
                  index === activeIndex && "ring-2 ring-primary shadow-xl shadow-primary/20",
                  index !== activeIndex && "hover:ring-1 hover:ring-primary/50"
                )}
                style={{
                  height: CARD_HEIGHT,
                  minHeight: CARD_HEIGHT,
                  maxHeight: CARD_HEIGHT,
                }}
              >
                <CardHeader className="flex-none py-2 px-3 border-b border-border/20">
                  <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                    {card.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 min-h-0 overflow-y-auto px-3 py-2">
                  <CardComponent compact />
                </CardContent>
              </Card>
            </div>
          );
        })}
        
        {/* Bottom spacer */}
        <div className="h-[30vh]" aria-hidden="true" />
      </div>
      
      {/* Position indicator dots */}
      {cards.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
          {cards.map((_, index) => (
            <button
              key={index}
              onClick={(e) => {
                e.stopPropagation();
                scrollToCard(index);
              }}
              aria-label={`Go to card ${index + 1}`}
              className={cn(
                "w-1.5 h-1.5 rounded-full transition-all duration-200",
                index === activeIndex 
                  ? "bg-primary w-4" 
                  : "bg-white/30 hover:bg-white/50"
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
