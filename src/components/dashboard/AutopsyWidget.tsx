import { useMissedMoves } from "@/hooks/useMissedMoves";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { 
  Skull, 
  TrendingUp, 
  TrendingDown,
  AlertCircle,
  HelpCircle,
  GripHorizontal
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { NewsDock } from "@/components/orbital/OrbitalCommandCenter";
import { useRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";

const DOCK_THRESHOLD = 150;

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return '';
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: false })
      .replace('about ', '')
      .replace(' minutes', 'm')
      .replace(' minute', 'm')
      .replace(' hours', 'h')
      .replace(' hour', 'h')
      .replace('less than a', '<1');
  } catch {
    return '';
  }
}

function formatDecisionReason(reason: string | null): string {
  if (!reason) return '';
  // Truncate long reasons
  if (reason.length > 40) return reason.slice(0, 37) + '...';
  return reason;
}

interface AutopsyWidgetProps {
  dock?: NewsDock;
  onDockChange?: (dock: NewsDock) => void;
}

export function AutopsyWidget({ dock = "side", onDockChange }: AutopsyWidgetProps) {
  const { data: missedData, isLoading } = useMissedMoves();
  const headerRef = useRef<HTMLDivElement>(null);
  const [isBeingDragged, setIsBeingDragged] = useState(false);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const startPosRef = useRef({ x: 0, y: 0 });
  const initialRectRef = useRef<DOMRect | null>(null);
  const isDraggingRef = useRef(false);
  
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const rect = headerRef.current?.parentElement?.getBoundingClientRect();
    if (!rect) return;
    
    initialRectRef.current = rect;
    startPosRef.current = { x: e.clientX, y: e.clientY };
    isDraggingRef.current = true;
    
    setIsBeingDragged(true);
    setDragPos({ x: rect.left, y: rect.top });
    
    headerRef.current?.setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current || !initialRectRef.current) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const deltaX = e.clientX - startPosRef.current.x;
    const deltaY = e.clientY - startPosRef.current.y;
    
    const newX = initialRectRef.current.left + deltaX;
    const newY = initialRectRef.current.top + deltaY;
    
    setDragPos({ x: newX, y: newY });
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    isDraggingRef.current = false;
    setIsBeingDragged(false);
    
    headerRef.current?.releasePointerCapture(e.pointerId);
    
    // Check dock zones
    const y = e.clientY;
    const deltaY = e.clientY - startPosRef.current.y;
    
    if (onDockChange) {
      if (y < DOCK_THRESHOLD || deltaY < -DOCK_THRESHOLD) {
        onDockChange("top");
      } else if (y > window.innerHeight - DOCK_THRESHOLD || deltaY > DOCK_THRESHOLD) {
        onDockChange("bottom");
      } else if (dock !== "side") {
        // If dragged away from dock zones and currently docked, return to side
        onDockChange("side");
      }
    }
  }, [dock, onDockChange]);
  
  const missedMoves = missedData?.missed_moves || [];
  const pumpThreshold = missedData?.thresholds?.pump || 5;
  const dumpThreshold = missedData?.thresholds?.dump || -5;
  const monitoredCount = missedData?.monitored_count || 0;
  
  // Section A: Strict missed moves (crossed threshold with no signal)
  const strictMisses = missedMoves.filter(m => 
    Math.abs(m.change_24h) >= Math.max(Math.abs(pumpThreshold), Math.abs(dumpThreshold))
  );
  
  // Section B: Largest movers below threshold (informational)
  const allMonitored = missedData?.all_monitored || [];
  const largestMovers = allMonitored
    .filter(m => !strictMisses.some(s => s.symbol === m.symbol))
    .sort((a, b) => Math.abs(b.change_24h) - Math.abs(a.change_24h))
    .slice(0, 6);

  return (
    <>
      <Card className={cn(
        "w-full h-full max-h-full flex flex-col bg-card/95 backdrop-blur-sm border-border/50 shadow-lg overflow-hidden",
        isBeingDragged && "opacity-40"
      )}>
        <CardHeader 
          ref={headerRef}
          className="py-2 px-3 cursor-grab active:cursor-grabbing select-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
            <GripHorizontal className="h-3.5 w-3.5 text-muted-foreground/50" />
            <Skull className="h-3.5 w-3.5" />
            <span>Autopsy</span>
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 font-normal border-muted-foreground/30">
              ground truth
            </Badge>
            {strictMisses.length > 0 && (
              <Badge 
                variant="destructive" 
                className="text-[9px] px-1.5 py-0 h-4 font-mono ml-auto"
              >
                {strictMisses.length} miss{strictMisses.length !== 1 ? 'es' : ''}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
      <CardContent className="p-0 flex-1 min-h-0 overflow-hidden">
        {isLoading ? (
          <div className="px-4 py-6 text-xs text-muted-foreground animate-pulse text-center">
            Loading misses…
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="px-3 pb-3 space-y-3">
              {/* Section A: Missed Moves (Strict) */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-[10px] text-red-400/80 uppercase tracking-wide font-medium px-1 border-b border-red-500/20 pb-1">
                  <AlertCircle className="h-3 w-3" />
                  <span>Missed Moves (≥{pumpThreshold}%)</span>
                  <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 ml-auto border-red-500/30 text-red-400">
                    {strictMisses.length} found
                  </Badge>
                </div>
                
                {strictMisses.length > 0 ? (
                  <div className="space-y-1">
                    {strictMisses.map((m) => {
                      const timeAgo = formatTimeAgo(m.decision_time);
                      const reason = formatDecisionReason(m.last_decision_reason);
                      
                      return (
                        <div
                          key={m.symbol}
                          className="grid grid-cols-[1fr_50px_60px_1fr] gap-2 items-center px-2 py-1.5 rounded bg-red-500/10 border border-red-500/20 group"
                        >
                          <div className="flex items-center gap-1.5">
                            {m.move_type === 'pump' ? (
                              <TrendingUp className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
                            ) : (
                              <TrendingDown className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />
                            )}
                            <span className="text-[11px] font-semibold text-foreground font-mono">
                              {m.symbol.replace('-USD', '')}
                            </span>
                          </div>
                          
                          <span className={`text-[11px] font-mono text-right font-medium ${
                            m.move_type === 'pump' ? 'text-emerald-400' : 'text-red-400'
                          }`}>
                            {m.change_24h >= 0 ? '+' : ''}{m.change_24h.toFixed(1)}%
                          </span>
                          
                          <div className="flex justify-center">
                            <Badge 
                              variant={
                                m.last_decision === 'BUY' ? 'default' :
                                m.last_decision === 'SELL' ? 'destructive' :
                                'secondary'
                              }
                              className="text-[9px] px-1.5 py-0 h-4 font-mono"
                            >
                              {m.last_decision || 'no eval'}
                            </Badge>
                          </div>
                          
                          <div className="flex items-center gap-1 min-w-0">
                            <span className="text-[9px] text-muted-foreground truncate flex-1" title={m.last_decision_reason || ''}>
                              {reason || 'not evaluated'}
                            </span>
                            <button 
                              className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-muted rounded"
                              title={`Why? (${timeAgo} ago)`}
                            >
                              <HelpCircle className="h-3 w-3 text-muted-foreground/60 hover:text-primary" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-2 px-2 bg-muted/20 rounded-md">
                    <div className="text-[10px] text-muted-foreground/60">
                      None detected — no moves ≥{pumpThreshold}% without signal
                    </div>
                  </div>
                )}
              </div>
              
              {/* Section B: Largest Movers (Informational) */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60 uppercase tracking-wide px-1 border-b border-border/20 pb-1">
                  <TrendingUp className="h-3 w-3" />
                  <span>Largest Moves (Observed)</span>
                  <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 ml-auto border-muted-foreground/20">
                    informational
                  </Badge>
                </div>
                
                {largestMovers.length > 0 ? (
                  <div className="space-y-0.5">
                    {largestMovers.map((m) => (
                      <div
                        key={m.symbol}
                        className="grid grid-cols-[1fr_50px_1fr] gap-2 items-center px-2 py-1 rounded bg-muted/20"
                      >
                        <div className="flex items-center gap-1.5">
                          {m.change_24h >= 0 ? (
                            <TrendingUp className="h-3 w-3 text-muted-foreground/40 flex-shrink-0" />
                          ) : (
                            <TrendingDown className="h-3 w-3 text-muted-foreground/40 flex-shrink-0" />
                          )}
                          <span className="text-[10px] text-muted-foreground/80 font-mono">
                            {m.symbol.replace('-USD', '')}
                          </span>
                        </div>
                        
                        <span className={`text-[10px] font-mono text-right ${
                          m.change_24h >= 0 ? 'text-emerald-400/60' : 'text-red-400/60'
                        }`}>
                          {m.change_24h >= 0 ? '+' : ''}{m.change_24h.toFixed(1)}%
                        </span>
                        
                        <span className="text-[9px] text-muted-foreground/40">
                          {m.last_decision ? `${m.last_decision}` : 'no signal'}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-2 px-2 bg-muted/20 rounded-md">
                    <div className="text-[9px] text-muted-foreground/40">
                      No monitored symbols with price data
                    </div>
                  </div>
                )}
              </div>
              
              {/* Footer: thresholds info */}
              <div className="flex items-center justify-between px-2 pt-1 border-t border-border/30 text-[9px] text-muted-foreground/40">
                <span>Thresholds: ≥{pumpThreshold}% / ≤{dumpThreshold}%</span>
                <span>Monitoring: {monitoredCount} symbols</span>
              </div>
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>

    {/* Dragged ghost */}
    {isBeingDragged && (
      <div
        className="fixed z-[1000] w-[300px] h-[200px] rounded-lg bg-card border-2 border-primary/60 shadow-2xl shadow-primary/20 pointer-events-none flex items-center justify-center"
        style={{ left: dragPos.x, top: dragPos.y }}
      >
        <div className="flex items-center gap-2 text-foreground">
          <GripHorizontal className="h-4 w-4 text-primary/60" />
          <Skull className="h-4 w-4" />
          <span className="font-mono text-sm">Autopsy</span>
        </div>
      </div>
    )}
    </>
  );
}

export default AutopsyWidget;
