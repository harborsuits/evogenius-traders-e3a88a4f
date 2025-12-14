import React, { useRef, useCallback, useState } from 'react';
import { useOrbital, OrbitalCard as OrbitalCardType } from '@/contexts/OrbitalContext';
import { GripHorizontal, Maximize2, Activity, Settings, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

const DOCK_THRESHOLD = 150;
const CAPSULE_WIDTH = 220;
const CAPSULE_HEIGHT = 56;

interface OrbitCapsuleProps {
  card: OrbitalCardType;
}

// Status badge based on card type
function CapsuleStatus({ type }: { type: 'cockpit' | 'drillable' }) {
  if (type === 'cockpit') {
    return (
      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-yellow-500/50 text-yellow-500">
        <Settings className="h-2.5 w-2.5 mr-0.5" />
        LIVE
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-primary/50 text-primary">
      <Zap className="h-2.5 w-2.5 mr-0.5" />
      VIEW
    </Badge>
  );
}

export function OrbitCapsule({ card }: OrbitCapsuleProps) {
  const { startDrag, endDrag, dockCard, setHoverZone } = useOrbital();
  const capsuleRef = useRef<HTMLDivElement>(null);
  const [isBeingDragged, setIsBeingDragged] = useState(false);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const startPosRef = useRef({ x: 0, y: 0 });
  const initialRectRef = useRef<DOMRect | null>(null);
  const isDraggingRef = useRef(false);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Store initial position from bounding rect
    const rect = capsuleRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    initialRectRef.current = rect;
    startPosRef.current = { x: e.clientX, y: e.clientY };
    isDraggingRef.current = true;
    
    setIsBeingDragged(true);
    setDragPos({ x: rect.left, y: rect.top });
    startDrag(card.id);
    
    capsuleRef.current?.setPointerCapture(e.pointerId);
  }, [card.id, startDrag]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current || !initialRectRef.current) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const deltaX = e.clientX - startPosRef.current.x;
    const deltaY = e.clientY - startPosRef.current.y;
    
    // Calculate new position
    let newX = initialRectRef.current.left + deltaX;
    let newY = initialRectRef.current.top + deltaY;
    
    // Clamp to viewport bounds (never go off-screen)
    const margin = 12;
    newX = Math.max(margin, Math.min(newX, window.innerWidth - CAPSULE_WIDTH - margin));
    newY = Math.max(margin, Math.min(newY, window.innerHeight - CAPSULE_HEIGHT - margin));
    
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
    
    capsuleRef.current?.releasePointerCapture(e.pointerId);
    
    // Check if should dock
    const deltaY = e.clientY - startPosRef.current.y;
    const y = e.clientY;
    
    if (y < DOCK_THRESHOLD || deltaY < -DOCK_THRESHOLD) {
      dockCard(card.id, 'top');
    } else if (y > window.innerHeight - DOCK_THRESHOLD || deltaY > DOCK_THRESHOLD) {
      dockCard(card.id, 'bottom');
    }
    
    endDrag();
  }, [card.id, dockCard, endDrag]);

  return (
    <>
      {/* Original capsule (stays in orbit, dims when dragging) */}
      <div
        ref={capsuleRef}
        data-orbital-card
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg',
          'bg-card/90 backdrop-blur border border-border/50',
          'cursor-grab active:cursor-grabbing select-none',
          'hover:border-primary/40 hover:bg-card transition-colors',
          isBeingDragged && 'opacity-40'
        )}
        style={{ width: CAPSULE_WIDTH, height: CAPSULE_HEIGHT }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <GripHorizontal className="h-4 w-4 text-muted-foreground/50 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-foreground truncate">
              {card.title}
            </span>
            <CapsuleStatus type={card.type} />
          </div>
        </div>
        {card.type === 'drillable' && (
          <Maximize2 className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0" />
        )}
      </div>

      {/* Dragged ghost (fixed position, clamped to viewport) */}
      {isBeingDragged && (
        <div
          className={cn(
            'fixed z-[1000] flex items-center gap-2 px-3 py-2 rounded-lg',
            'bg-card border-2 border-primary/60 shadow-2xl shadow-primary/20',
            'pointer-events-none'
          )}
          style={{
            width: CAPSULE_WIDTH,
            height: CAPSULE_HEIGHT,
            left: dragPos.x,
            top: dragPos.y,
          }}
        >
          <GripHorizontal className="h-4 w-4 text-primary/60 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-foreground truncate">
                {card.title}
              </span>
              <CapsuleStatus type={card.type} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
