import React from 'react';
import { cn } from '@/lib/utils';
import { Plus } from 'lucide-react';

interface DropZoneProps {
  lane: string;
  title: string;
  isEmpty: boolean;
  isOver: boolean;
  children: React.ReactNode;
}

// DropZone is now VISUAL ONLY - no useDroppable here
// The droppable ref is on the parent column container
export function DropZone({ 
  lane, 
  title,
  isEmpty,
  isOver,
  children,
}: DropZoneProps) {
  return (
    <div className="h-full min-h-0 flex flex-col">
      {/* Sticky header */}
      <div className="shrink-0 sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border/30 px-3 py-2">
        <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
          {title}
        </h2>
      </div>
      
      {/* Content area - takes full remaining height */}
      <div 
        className={cn(
          "flex-1 min-h-0 overflow-y-auto transition-colors duration-200",
          isOver && "bg-primary/10"
        )}
      >
        {isEmpty ? (
          <EmptyDropZone isOver={isOver} />
        ) : (
          <div className="p-3 space-y-3">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyDropZone({ isOver }: { isOver: boolean }) {
  return (
    <div 
      className={cn(
        "h-[60vh] flex flex-col items-center justify-center p-6 m-3",
        "border-2 border-dashed rounded-lg transition-all duration-200",
        isOver 
          ? "border-primary bg-primary/10 shadow-lg shadow-primary/20 ring-2 ring-primary/30" 
          : "border-muted-foreground/20 hover:border-muted-foreground/40"
      )}
    >
      <div className={cn(
        "w-10 h-10 rounded-full flex items-center justify-center mb-3 transition-colors",
        isOver ? "bg-primary/20" : "bg-muted"
      )}>
        <Plus className={cn(
          "h-5 w-5 transition-colors",
          isOver ? "text-primary" : "text-muted-foreground"
        )} />
      </div>
      <p className={cn(
        "text-sm font-medium transition-colors",
        isOver ? "text-primary" : "text-muted-foreground"
      )}>
        {isOver ? "Drop here" : "Drop cards here"}
      </p>
      <p className="text-xs text-muted-foreground/70 mt-1">
        Drag cards from Orbit
      </p>
    </div>
  );
}
