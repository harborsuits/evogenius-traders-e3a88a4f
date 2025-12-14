import React, { useRef, useCallback, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrbital, OrbitalCard as OrbitalCardType } from '@/contexts/OrbitalContext';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { GripHorizontal, X, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

const DOCK_THRESHOLD = 150;
const HEADER_HEIGHT = 40; // Fixed header height in pixels

interface OrbitalCardProps {
  card: OrbitalCardType;
  isDocked?: boolean;
  dockZone?: 'top' | 'bottom';
  cardWidth?: number;
  cardHeight?: number;
}

export function OrbitalCardComponent({ 
  card, 
  isDocked = false,
  dockZone,
  cardWidth = 350,
  cardHeight = 280,
}: OrbitalCardProps) {
  const navigate = useNavigate();
  const { startDrag, endDrag, dockCard, undockCard, setHoverZone } = useOrbital();
  const cardRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [isBeingDragged, setIsBeingDragged] = useState(false);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [hasOverflow, setHasOverflow] = useState(false);
  const [isScrolledToBottom, setIsScrolledToBottom] = useState(false);
  const startPosRef = useRef({ x: 0, y: 0 });
  const initialRectRef = useRef<DOMRect | null>(null);
  const isDraggingRef = useRef(false);
  const hasDraggedRef = useRef(false);
  
  const Component = card.component;

  // Check for content overflow
  useEffect(() => {
    const checkOverflow = () => {
      if (bodyRef.current) {
        const hasScroll = bodyRef.current.scrollHeight > bodyRef.current.clientHeight;
        setHasOverflow(hasScroll);
        
        // Check if scrolled to bottom
        const atBottom = bodyRef.current.scrollTop + bodyRef.current.clientHeight >= bodyRef.current.scrollHeight - 5;
        setIsScrolledToBottom(atBottom);
      }
    };
    
    checkOverflow();
    // Recheck on resize
    window.addEventListener('resize', checkOverflow);
    return () => window.removeEventListener('resize', checkOverflow);
  }, [isDocked]);

  const handleBodyScroll = useCallback(() => {
    if (bodyRef.current) {
      const atBottom = bodyRef.current.scrollTop + bodyRef.current.clientHeight >= bodyRef.current.scrollHeight - 5;
      setIsScrolledToBottom(atBottom);
    }
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // Don't start drag on interactive elements
    const target = e.target as HTMLElement;
    if (
      target.closest('button') || 
      target.closest('a') || 
      target.closest('input') ||
      target.closest('textarea') ||
      target.closest('[role="button"]') ||
      target.closest('.scroll-area') ||
      target.tagName === 'BUTTON' ||
      target.tagName === 'A' ||
      target.tagName === 'INPUT'
    ) {
      return;
    }
    
    e.preventDefault();
    e.stopPropagation();
    
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    initialRectRef.current = rect;
    startPosRef.current = { x: e.clientX, y: e.clientY };
    isDraggingRef.current = true;
    hasDraggedRef.current = false;
    
    setIsBeingDragged(true);
    setDragPos({ x: rect.left, y: rect.top });
    startDrag(card.id);
    
    cardRef.current?.setPointerCapture(e.pointerId);
  }, [card.id, startDrag]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current || !initialRectRef.current) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const deltaX = e.clientX - startPosRef.current.x;
    const deltaY = e.clientY - startPosRef.current.y;
    
    // Mark as dragged if moved significantly
    if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
      hasDraggedRef.current = true;
    }
    
    // Calculate new position from initial rect
    let newX = initialRectRef.current.left + deltaX;
    let newY = initialRectRef.current.top + deltaY;
    
    // Clamp to viewport bounds (never off-screen)
    const margin = 12;
    const actualWidth = initialRectRef.current.width;
    const actualHeight = initialRectRef.current.height;
    
    // Also account for dock zones (top ~300px, bottom ~300px when docked)
    const topSafeZone = 56; // collapsed dock height
    const bottomSafeZone = 56;
    
    newX = Math.max(margin, Math.min(newX, window.innerWidth - actualWidth - margin));
    newY = Math.max(topSafeZone + margin, Math.min(newY, window.innerHeight - actualHeight - bottomSafeZone - margin));
    
    setDragPos({ x: newX, y: newY });
    
    // Detect dock zones based on vertical drag threshold
    const dy = e.clientY - startPosRef.current.y;
    if (dy < -DOCK_THRESHOLD) {
      setHoverZone('top');
    } else if (dy > DOCK_THRESHOLD) {
      setHoverZone('bottom');
    } else {
      setHoverZone(null);
    }
  }, [setHoverZone]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    isDraggingRef.current = false;
    setIsBeingDragged(false);
    
    cardRef.current?.releasePointerCapture(e.pointerId);
    
    const deltaY = e.clientY - startPosRef.current.y;
    
    // Dock based on vertical drag threshold
    if (deltaY < -DOCK_THRESHOLD) {
      dockCard(card.id, 'top');
    } else if (deltaY > DOCK_THRESHOLD) {
      dockCard(card.id, 'bottom');
    }
    // Otherwise: snap back to orbit (no action needed)
    
    endDrag();
  }, [card.id, dockCard, endDrag]);

  const handleUndock = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    undockCard(card.id);
  }, [card.id, undockCard]);

  const handleDrilldown = useCallback(() => {
    // Don't trigger drilldown if we just dragged
    if (hasDraggedRef.current) {
      hasDraggedRef.current = false;
      return;
    }
    if (card.type === 'drillable' && card.drilldownPath) {
      navigate(card.drilldownPath);
    }
  }, [card, navigate]);

  const handleContentClick = useCallback((e: React.MouseEvent) => {
    // Don't trigger on interactive elements
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('a') || target.closest('input')) {
      return;
    }
    
    // Don't trigger if we just dragged
    if (hasDraggedRef.current) {
      hasDraggedRef.current = false;
      return;
    }
    
    if (card.type === 'drillable' && card.drilldownPath) {
      handleDrilldown();
    }
  }, [card, handleDrilldown]);

  // For orbit cards: enforce exact dimensions from props
  // For docked cards: use h-full to fill dock container
  const cardStyle = isDocked 
    ? { touchAction: 'none' as const }
    : { 
        width: cardWidth, 
        height: cardHeight, 
        touchAction: 'none' as const 
      };

  // Body height for orbit cards = total height - header height
  const bodyHeight = isDocked ? undefined : cardHeight - HEADER_HEIGHT;

  return (
    <>
      {/* Main card */}
      <Card
        ref={cardRef}
        variant="terminal"
        className={cn(
          'relative transition-shadow duration-200 overflow-hidden flex flex-col',
          isDocked ? 'h-full w-full' : '',
          card.type === 'drillable' && !isDraggingRef.current && 'hover:border-primary/40 cursor-pointer',
          isBeingDragged && 'opacity-30'
        )}
        style={cardStyle}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Fixed height sticky header */}
        <CardHeader 
          className={cn(
            'flex flex-row items-center justify-between select-none shrink-0',
            'cursor-grab active:cursor-grabbing',
            'border-b border-border/30 bg-muted/20'
          )}
          style={{ height: HEADER_HEIGHT, minHeight: HEADER_HEIGHT, padding: '0 12px' }}
        >
          <div className="flex items-center gap-2">
            <GripHorizontal className="h-3 w-3 text-muted-foreground/50" />
            <CardTitle className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
              {card.title}
            </CardTitle>
          </div>
          <div className="flex items-center gap-1">
            {card.type === 'drillable' && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                onClick={(e) => { e.stopPropagation(); handleDrilldown(); }}
              >
                <ExternalLink className="h-3 w-3" />
              </Button>
            )}
            {isDocked && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                onClick={handleUndock}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        </CardHeader>
        
        {/* Scrollable body container with fixed height for orbit cards */}
        <div 
          ref={bodyRef}
          className={cn(
            "overflow-y-auto overflow-x-hidden px-3 py-2",
            "scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent",
            isDocked && "flex-1 min-h-0"
          )}
          style={isDocked ? undefined : { height: bodyHeight }}
          onClick={handleContentClick}
          onScroll={handleBodyScroll}
        >
          <Component compact={!isDocked} />
        </div>
        
        {/* Overflow hint gradient - shows when content is scrollable and not at bottom */}
        {hasOverflow && !isScrolledToBottom && (
          <div 
            className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-card to-transparent pointer-events-none"
          />
        )}
      </Card>

      {/* Dragged ghost (fixed, clamped to viewport) */}
      {isBeingDragged && initialRectRef.current && (
        <Card
          variant="terminal"
          className="fixed z-[1000] border-2 border-primary/60 shadow-2xl shadow-primary/20 pointer-events-none overflow-hidden"
          style={{
            width: initialRectRef.current.width,
            height: initialRectRef.current.height,
            left: dragPos.x,
            top: dragPos.y,
            opacity: 0.85,
          }}
        >
          <CardHeader className="pb-2 flex flex-row items-center gap-2 border-b border-border/30 bg-muted/20">
            <GripHorizontal className="h-4 w-4 text-primary/60" />
            <CardTitle className="font-mono text-xs text-foreground uppercase tracking-wider">
              {card.title}
            </CardTitle>
          </CardHeader>
          <div className="pt-3 px-3 overflow-hidden h-[calc(100%-48px)]">
            <Component compact={!isDocked} />
          </div>
        </Card>
      )}
    </>
  );
}
