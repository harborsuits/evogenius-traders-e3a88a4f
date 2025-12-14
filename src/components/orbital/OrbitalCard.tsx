import React, { useRef, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrbital, OrbitalCard as OrbitalCardType } from '@/contexts/OrbitalContext';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { GripHorizontal, X, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  const { startDrag, endDrag, dockCard, undockCard, hoverZone, setHoverZone, isDragging, draggedCardId } = useOrbital();
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
    
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    startPosRef.current = { x: e.clientX, y: e.clientY };
    isDraggingRef.current = true;
    
    setIsBeingDragged(true);
    startDrag(card.id);
    
    // Capture pointer
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [card.id, startDrag]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    
    e.preventDefault();
    
    const deltaX = e.clientX - startPosRef.current.x;
    const deltaY = e.clientY - startPosRef.current.y;
    
    setDragOffset({ x: deltaX, y: deltaY });
    
    // Detect dock zones based on vertical position
    const windowHeight = window.innerHeight;
    const y = e.clientY;
    
    if (y < 150) {
      setHoverZone('top');
    } else if (y > windowHeight - 150) {
      setHoverZone('bottom');
    } else {
      setHoverZone(null);
    }
  }, [setHoverZone]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    
    isDraggingRef.current = false;
    setIsBeingDragged(false);
    setDragOffset({ x: 0, y: 0 });
    
    // Release pointer
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    
    // Check if should dock
    const windowHeight = window.innerHeight;
    const y = e.clientY;
    
    if (y < 150) {
      dockCard(card.id, 'top');
    } else if (y > windowHeight - 150) {
      dockCard(card.id, 'bottom');
    }
    
    endDrag();
  }, [card.id, dockCard, endDrag]);

  const handleUndock = useCallback(() => {
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
    opacity: 0.9,
    cursor: 'grabbing',
  } : {};

  return (
    <Card
      ref={cardRef}
      variant="terminal"
      className={cn(
        'relative transition-shadow duration-200',
        isDocked ? 'h-full' : '',
        card.type === 'drillable' && 'cursor-pointer hover:border-primary/50',
        isBeingDragged && 'shadow-intense pointer-events-none',
        className
      )}
      style={{ ...style, ...dragStyle }}
    >
      <CardHeader 
        ref={headerRef}
        className={cn(
          'pb-2 flex flex-row items-center justify-between cursor-grab select-none',
          isBeingDragged && 'cursor-grabbing'
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div className="flex items-center gap-2">
          <GripHorizontal className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="font-mono text-sm text-muted-foreground uppercase tracking-wider">
            {card.title}
          </CardTitle>
        </div>
        <div className="flex items-center gap-1">
          {card.type === 'drillable' && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handleDrilldown}
            >
              <Maximize2 className="h-3 w-3" />
            </Button>
          )}
          {isDocked && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handleUndock}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent 
        className="pt-0"
        onClick={handleContentClick}
      >
        <Component compact={isDocked} />
      </CardContent>
    </Card>
  );
}
