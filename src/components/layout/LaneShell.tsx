import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { cn } from '@/lib/utils';
import { Plus } from 'lucide-react';
import type { Lane } from '@/hooks/useLayoutState';

interface LaneShellProps {
  lane: Lane;
  title: string;
  cardIds: string[];
  children: React.ReactNode;
}

/**
 * LaneShell - Unified container for A and B lanes
 * 
 * CRITICAL: The outer div MUST receive setNodeRef for droppable to work.
 * The droppable ref must be on a sized element (h-full).
 */
export function LaneShell({ lane, title, cardIds, children }: LaneShellProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: `lane:${lane}`,
    data: { lane },
  });

  const isEmpty = React.Children.count(children) === 0;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "h-full min-h-0 flex flex-col overflow-hidden",
        isOver && "ring-2 ring-primary/60 bg-primary/5"
      )}
      style={{ transform: 'none' }} // NO transforms on droppable wrapper
    >
      {/* Header - non-scrolling */}
      <div className="flex-none sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border/30 px-3 py-2">
        <h2 className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
          {title}
        </h2>
      </div>

      {/* Body - THE ONLY scrolling element */}
      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
        <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
          {isEmpty ? (
            <EmptyState isOver={isOver} />
          ) : (
            children
          )}
        </SortableContext>
      </div>
    </div>
  );
}

function EmptyState({ isOver }: { isOver: boolean }) {
  return (
    <div
      className={cn(
        "min-h-[60vh] flex flex-col items-center justify-center",
        "border-2 border-dashed rounded-lg transition-all duration-200",
        isOver
          ? "border-primary bg-primary/10 shadow-lg shadow-primary/20"
          : "border-muted-foreground/20"
      )}
    >
      <div
        className={cn(
          "w-10 h-10 rounded-full flex items-center justify-center mb-3 transition-colors",
          isOver ? "bg-primary/20" : "bg-muted"
        )}
      >
        <Plus
          className={cn(
            "h-5 w-5 transition-colors",
            isOver ? "text-primary" : "text-muted-foreground"
          )}
        />
      </div>
      <p
        className={cn(
          "text-sm font-medium transition-colors",
          isOver ? "text-primary" : "text-muted-foreground"
        )}
      >
        {isOver ? "Drop here" : "Drop cards here"}
      </p>
      <p className="text-xs text-muted-foreground/70 mt-1">
        Drag cards from Orbit
      </p>
    </div>
  );
}
