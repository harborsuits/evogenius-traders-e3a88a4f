import React, { forwardRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronRight, Grip, RotateCcw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { CommandCard } from './CommandCenter';
import type { Lane } from '@/hooks/useLayoutState';

interface DraggableCardProps {
  card: CommandCard;
  lane: Lane;
  isActive?: boolean;
  onReturnToOrbit?: () => void;
  compact?: boolean;
}

// Fixed card height - all cards MUST be this height
const CARD_HEIGHT = 240;

export const DraggableCard = forwardRef<HTMLDivElement, DraggableCardProps>(
  function DraggableCard({ 
    card, 
    lane, 
    isActive = false,
    onReturnToOrbit,
    compact = false,
  }, forwardedRef) {
    const navigate = useNavigate();
    const CardComponent = card.component;
    
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ 
      id: card.id,
      data: { card, lane },
    });
    
    // Combine refs
    const combinedRef = (node: HTMLDivElement | null) => {
      setNodeRef(node);
      if (typeof forwardedRef === 'function') {
        forwardedRef(node);
      } else if (forwardedRef) {
        forwardedRef.current = node;
      }
    };
    
    const style = {
      transform: CSS.Transform.toString(transform),
      transition: transition || 'transform 200ms',
    };
    
    const handleDrilldown = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (card.drilldownPath) {
        navigate(card.drilldownPath);
      }
    };
    
    const handleReturnToOrbit = (e: React.MouseEvent) => {
      e.stopPropagation();
      onReturnToOrbit?.();
    };

    return (
      <div
        ref={combinedRef}
        style={style}
        {...attributes}
        {...listeners}
        className={cn(
          "w-full touch-none cursor-grab active:cursor-grabbing",
          isDragging && "opacity-50 z-50"
        )}
      >
        {/* Card with FIXED height */}
        <Card 
          variant={isActive ? "glow" : "default"}
          className={cn(
            "w-full flex flex-col overflow-hidden",
            isDragging && "shadow-2xl ring-2 ring-primary/50",
            isActive && "ring-1 ring-primary/50 shadow-xl shadow-primary/15",
            !isActive && lane === 'orbit' && "opacity-85 hover:opacity-95"
          )}
          style={{
            height: CARD_HEIGHT,
            minHeight: CARD_HEIGHT,
            maxHeight: CARD_HEIGHT,
          }}
        >
          {/* Header - fixed, non-scrolling */}
          <CardHeader className="flex-none flex flex-row items-center justify-between border-b border-border/20 py-2 px-3">
            <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Grip className="h-3 w-3 opacity-50" />
              {card.title}
            </CardTitle>
            
            <div className="flex items-center gap-2" onPointerDown={(e) => e.stopPropagation()}>
              {/* Return to orbit button (only shown in A/B columns) */}
              {lane !== 'orbit' && onReturnToOrbit && (
                <button
                  onClick={handleReturnToOrbit}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  title="Return to Orbit"
                >
                  <RotateCcw className="h-3 w-3" />
                </button>
              )}
              
              {card.type === 'drillable' && card.drilldownPath && (
                <button
                  onClick={handleDrilldown}
                  className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 transition-colors cursor-pointer"
                >
                  <span>View</span>
                  <ChevronRight className="h-3 w-3" />
                </button>
              )}
            </div>
          </CardHeader>
          
          {/* Content - scrollable */}
          <CardContent 
            className="flex-1 min-h-0 overflow-y-auto px-3 py-3"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <CardComponent compact />
          </CardContent>
        </Card>
      </div>
    );
  }
);
