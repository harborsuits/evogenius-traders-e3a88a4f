import React, { useRef, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrbital, OrbitalCard as OrbitalCardType } from '@/contexts/OrbitalContext';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { GripHorizontal, X, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

const DOCK_THRESHOLD = 150;

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
  cardWidth = 340,
  cardHeight = 260,
}: OrbitalCardProps) {
  const navigate = useNavigate();
  const { startDrag, endDrag, dockCard, undockCard, setHoverZone } = useOrbital();
  const headerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [isBeingDragged, setIsBeingDragged] = useState(false);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const startPosRef = useRef({ x: 0, y: 0 });
  const initialRectRef = useRef<DOMRect | null>(null);
  const isDraggingRef = useRef(false);
  
  const Component = card.component;

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // Only start drag from header
    if (!headerRef.current?.contains(e.target as Node)) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    initialRectRef.current = rect;
    startPosRef.current = { x: e.clientX, y: e.clientY };
    isDraggingRef.current = true;
    
    setIsBeingDragged(true);
    setDragPos({ x: rect.left, y: rect.top });
    startDrag(card.id);
    
    headerRef.current.setPointerCapture(e.pointerId);
  }, [card.id, startDrag]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current || !initialRectRef.current) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const deltaX = e.clientX - startPosRef.current.x;
    const deltaY = e.clientY - startPosRef.current.y;
    
    // Calculate new position from initial rect
    let newX = initialRectRef.current.left + deltaX;
    let newY = initialRectRef.current.top + deltaY;
    
    // Clamp to viewport bounds using actual card dimensions
    const margin = 12;
    const actualWidth = initialRectRef.current.width;
    const actualHeight = initialRectRef.current.height;
    
    newX = Math.max(margin, Math.min(newX, window.innerWidth - actualWidth - margin));
    newY = Math.max(margin, Math.min(newY, window.innerHeight - actualHeight - margin));
    
    setDragPos({ x: newX, y: newY });
    
    // Detect dock zones
    const y = e.clientY;
    if (y < DOCK_THRESHOLD) {
      setHoverZone('top');
    } else if (y > window.innerHeight - DOCK_THRESHOLD) {
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
    
    headerRef.current?.releasePointerCapture(e.pointerId);
    
    const deltaY = e.clientY - startPosRef.current.y;
    const y = e.clientY;
    
    if (y < DOCK_THRESHOLD || deltaY < -DOCK_THRESHOLD) {
      dockCard(card.id, 'top');
    } else if (y > window.innerHeight - DOCK_THRESHOLD || deltaY > DOCK_THRESHOLD) {
      dockCard(card.id, 'bottom');
    }
    
    endDrag();
  }, [card.id, dockCard, endDrag]);

  const handleUndock = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    undockCard(card.id);
  }, [card.id, undockCard]);

  const handleDrilldown = useCallback(() => {
    if (card.type === 'drillable' && card.drilldownPath) {
      navigate(card.drilldownPath);
    }
  }, [card, navigate]);

  const handleContentClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('a') || target.closest('input')) {
      return;
    }
    
    if (card.type === 'drillable' && card.drilldownPath) {
      handleDrilldown();
    }
  }, [card, handleDrilldown]);

  return (
    <>
      {/* Main card (dims when dragging) */}
      <Card
        ref={cardRef}
        variant="terminal"
        className={cn(
          'relative transition-shadow duration-200 overflow-hidden h-full',
          card.type === 'drillable' && 'hover:border-primary/40 cursor-pointer',
          isBeingDragged && 'opacity-30'
        )}
      >
        <CardHeader 
          ref={headerRef}
          className={cn(
            'pb-2 flex flex-row items-center justify-between select-none',
            'cursor-grab active:cursor-grabbing',
            'border-b border-border/30 bg-muted/20'
          )}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <div className="flex items-center gap-2">
            <GripHorizontal className="h-4 w-4 text-muted-foreground/50" />
            <CardTitle className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
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
        <CardContent 
          className={cn(
            'pt-3 overflow-auto',
            isDocked ? 'h-[calc(100%-48px)]' : 'h-[calc(100%-48px)]'
          )}
          onClick={handleContentClick}
        >
          <Component compact={!isDocked} />
        </CardContent>
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
          }}
        >
          <CardHeader className="pb-2 flex flex-row items-center gap-2 border-b border-border/30 bg-muted/20">
            <GripHorizontal className="h-4 w-4 text-primary/60" />
            <CardTitle className="font-mono text-xs text-foreground uppercase tracking-wider">
              {card.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-3 overflow-hidden h-[calc(100%-48px)]">
            <Component compact={!isDocked} />
          </CardContent>
        </Card>
      )}
    </>
  );
}
