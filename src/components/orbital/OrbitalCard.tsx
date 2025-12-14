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
  cardWidth = 350,
  cardHeight = 280,
}: OrbitalCardProps) {
  const navigate = useNavigate();
  const { startDrag, endDrag, dockCard, undockCard, setHoverZone } = useOrbital();
  const headerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [isBeingDragged, setIsBeingDragged] = useState(false);
  const [dragY, setDragY] = useState(0);
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
    
    headerRef.current.setPointerCapture(e.pointerId);
    
    // Disable text selection on body
    document.body.style.userSelect = 'none';
  }, [card.id, startDrag]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const dy = e.clientY - startPosRef.current.y;
    setDragY(dy);
    
    // Detect dock zones based on drag distance
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
    
    headerRef.current?.releasePointerCapture(e.pointerId);
    
    // Re-enable text selection
    document.body.style.userSelect = '';
    
    const dy = e.clientY - startPosRef.current.y;
    
    // Dock based on drag direction (matching prototype threshold)
    if (dy < -DOCK_THRESHOLD) {
      dockCard(card.id, 'top');
    } else if (dy > DOCK_THRESHOLD) {
      dockCard(card.id, 'bottom');
    }
    
    setDragY(0);
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

  // Drag transform - only Y offset while dragging in orbit
  const dragTransform = isBeingDragged && !isDocked ? `translateY(${dragY}px)` : undefined;

  return (
    <Card
      ref={cardRef}
      className={cn(
        'relative h-full overflow-hidden backdrop-blur-xl transition-all duration-300',
        'border-white/10 hover:border-primary/50',
        card.type === 'drillable' && 'cursor-pointer',
        isBeingDragged && 'opacity-80 cursor-grabbing z-[1000]',
        isDocked && 'z-[600]'
      )}
      style={{
        background: isDocked ? 'rgba(15, 15, 15, 0.98)' : 'rgba(15, 15, 15, 0.95)',
        boxShadow: isBeingDragged 
          ? '0 20px 60px rgba(59, 130, 246, 0.5)' 
          : '0 8px 32px rgba(0, 0, 0, 0.5)',
        transform: dragTransform,
        transition: isBeingDragged ? 'none' : 'all 0.3s ease',
      }}
    >
      {/* Header - drag handle */}
      <CardHeader 
        ref={headerRef}
        className={cn(
          'py-3 px-4 flex flex-row items-center justify-between select-none',
          'cursor-grab active:cursor-grabbing',
          'border-b border-white/5 rounded-t-xl'
        )}
        style={{ background: 'rgba(0, 0, 0, 0.3)' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div className="flex items-center gap-2">
          <GripHorizontal className="h-4 w-4 text-muted-foreground/50" />
          <CardTitle className="font-mono text-sm text-foreground font-semibold">
            {card.title}
          </CardTitle>
        </div>
        <div className="flex items-center gap-1">
          {card.type === 'drillable' && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground/50 hover:text-foreground"
              onClick={(e) => { e.stopPropagation(); handleDrilldown(); }}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          )}
          {isDocked && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-3 text-xs font-semibold bg-red-500/20 border border-red-500/40 text-red-500 hover:bg-red-500/30"
              onClick={handleUndock}
            >
              Undock
            </Button>
          )}
        </div>
      </CardHeader>
      
      {/* Content */}
      <CardContent 
        className={cn(
          'p-4 overflow-auto',
          isDocked ? 'h-[calc(100%-48px)]' : 'h-[225px]'
        )}
        onClick={handleContentClick}
      >
        <Component compact={!isDocked} />
      </CardContent>

      {/* Drillable indicator arrow */}
      {card.type === 'drillable' && (
        <div className="absolute right-4 top-3 text-lg opacity-50 hover:opacity-100 hover:translate-x-1 transition-all pointer-events-none">
          →
        </div>
      )}
    </Card>
  );
}
