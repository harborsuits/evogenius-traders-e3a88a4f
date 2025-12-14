import React, { useRef, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrbital, OrbitalCard as OrbitalCardType } from '@/contexts/OrbitalContext';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { GripHorizontal, X, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const DOCK_THRESHOLD = 150; // pixels from edge to trigger dock

interface OrbitalCardProps {
  card: OrbitalCardType;
  isDocked?: boolean;
  dockZone?: 'top' | 'bottom';
  style?: React.CSSProperties;
  className?: string;
}

export function OrbitalCardComponent({ 
  card, 
  isDocked = false,
  dockZone,
  style,
  className 
}: OrbitalCardProps) {
  const navigate = useNavigate();
  const { startDrag, endDrag, dockCard, undockCard, setHoverZone } = useOrbital();
  const headerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [isBeingDragged, setIsBeingDragged] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const startPosRef = useRef({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  
  const Component = card.component;

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // Only start drag from header
    if (!headerRef.current?.contains(e.target as Node)) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    startPosRef.current = { x: e.clientX, y: e.clientY };
    isDraggingRef.current = true;
    
    setIsBeingDragged(true);
    startDrag(card.id);
    
    // Capture pointer on the header element
    headerRef.current.setPointerCapture(e.pointerId);
  }, [card.id, startDrag]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const deltaX = e.clientX - startPosRef.current.x;
    const deltaY = e.clientY - startPosRef.current.y;
    
    setDragOffset({ x: deltaX, y: deltaY });
    
    // Detect dock zones based on vertical position
    const windowHeight = window.innerHeight;
    const y = e.clientY;
    
    if (y < DOCK_THRESHOLD) {
      setHoverZone('top');
    } else if (y > windowHeight - DOCK_THRESHOLD) {
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
    
    // Release pointer
    headerRef.current?.releasePointerCapture(e.pointerId);
    
    // Calculate drag distance
    const deltaY = e.clientY - startPosRef.current.y;
    const windowHeight = window.innerHeight;
    const y = e.clientY;
    
    // Check if should dock based on position OR drag direction
    if (y < DOCK_THRESHOLD || deltaY < -DOCK_THRESHOLD) {
      dockCard(card.id, 'top');
    } else if (y > windowHeight - DOCK_THRESHOLD || deltaY > DOCK_THRESHOLD) {
      dockCard(card.id, 'bottom');
    }
    
    setDragOffset({ x: 0, y: 0 });
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
    // Don't trigger drilldown if clicking on interactive elements
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('a') || target.closest('input')) {
      return;
    }
    
    if (card.type === 'drillable' && card.drilldownPath) {
      handleDrilldown();
    }
  }, [card, handleDrilldown]);

  const dragStyle: React.CSSProperties = isBeingDragged ? {
    transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)`,
    zIndex: 1000,
    position: 'fixed' as const,
    left: startPosRef.current.x - 150,
    top: startPosRef.current.y - 20,
    width: 300,
    opacity: 0.95,
    pointerEvents: 'none' as const,
  } : {};

  return (
    <Card
      ref={cardRef}
      variant="terminal"
      className={cn(
        'relative transition-shadow duration-200 overflow-hidden',
        isDocked ? 'h-full' : '',
        card.type === 'drillable' && !isDocked && 'cursor-pointer hover:border-primary/50',
        isBeingDragged && 'shadow-2xl shadow-primary/20 border-primary/50',
        className
      )}
      style={isBeingDragged ? dragStyle : style}
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
          <GripHorizontal className="h-4 w-4 text-muted-foreground/60" />
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
              <Maximize2 className="h-3 w-3" />
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
          isDocked && 'h-[calc(100%-48px)]'
        )}
        onClick={handleContentClick}
      >
        <Component compact={!isDocked} />
      </CardContent>
    </Card>
  );
}
