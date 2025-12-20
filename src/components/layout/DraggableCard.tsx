import React from 'react';
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

export function DraggableCard({ 
  card, 
  lane, 
  isActive = false,
  onReturnToOrbit,
  compact = false,
}: DraggableCardProps) {
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
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
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
      ref={setNodeRef}
      style={style}
      className={cn(
        "transition-all duration-200",
        isDragging && "opacity-50 z-50",
        isActive && "scale-[1.02]",
        !isActive && lane === 'orbit' && "opacity-85 hover:opacity-95"
      )}
    >
      <Card 
        variant={isActive ? "glow" : "default"}
        className={cn(
          "transition-all duration-200 overflow-hidden",
          isDragging && "shadow-2xl ring-2 ring-primary/50",
          isActive && "ring-1 ring-primary/50 shadow-xl shadow-primary/15"
        )}
      >
        <CardHeader className={cn(
          "flex flex-row items-center justify-between border-b border-border/20",
          compact ? "py-2 px-3" : "py-3 px-4"
        )}>
          <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            {/* Drag handle */}
            <button
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing touch-none p-0.5 -ml-1 rounded hover:bg-muted/50"
              aria-label="Drag to reorder"
            >
              <Grip className="h-3 w-3 opacity-50" />
            </button>
            {card.title}
          </CardTitle>
          
          <div className="flex items-center gap-2">
            {/* Return to orbit button (only shown in A/B columns) */}
            {lane !== 'orbit' && onReturnToOrbit && (
              <button
                onClick={handleReturnToOrbit}
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                title="Return to Orbit"
              >
                <RotateCcw className="h-3 w-3" />
              </button>
            )}
            
            {card.type === 'drillable' && card.drilldownPath && (
              <button
                onClick={handleDrilldown}
                className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 transition-colors"
              >
                <span>View</span>
                <ChevronRight className="h-3 w-3" />
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent className={cn(
          compact ? "px-3 py-3" : "px-4 py-4"
        )}>
          <CardComponent compact />
        </CardContent>
      </Card>
    </div>
  );
}
