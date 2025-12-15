import { useMissedMoves } from "@/hooks/useMissedMoves";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { 
  Skull, 
  TrendingUp, 
  TrendingDown,
  AlertCircle,
  HelpCircle
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

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

export function AutopsyWidget() {
  const { data: missedData, isLoading } = useMissedMoves();
  
  const missedMoves = missedData?.missed_moves || [];
  const pumpThreshold = missedData?.thresholds?.pump || 5;
  const dumpThreshold = missedData?.thresholds?.dump || -5;
  const monitoredCount = missedData?.monitored_count || 0;

  return (
    <Card className="w-full bg-card/95 backdrop-blur-sm border-border/50 shadow-lg">
      <CardHeader className="py-2.5 px-4">
        <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
          <Skull className="h-3.5 w-3.5" />
          <span>Autopsy</span>
          <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 font-normal border-muted-foreground/30">
            ground truth
          </Badge>
          {missedMoves.length > 0 && (
            <Badge 
              variant="destructive" 
              className="ml-auto text-[9px] px-1.5 py-0 h-4 font-mono"
            >
              {missedMoves.length} miss{missedMoves.length !== 1 ? 'es' : ''}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="px-4 py-6 text-xs text-muted-foreground animate-pulse text-center">
            Loading misses…
          </div>
        ) : (
          <ScrollArea className="h-[280px]">
            <div className="px-3 pb-3">
              {missedMoves.length > 0 ? (
                <div className="space-y-1">
                  {/* Table header */}
                  <div className="grid grid-cols-[1fr_60px_70px_1fr] gap-2 px-2 py-1.5 text-[9px] text-muted-foreground/60 uppercase tracking-wide border-b border-border/30">
                    <span>Symbol</span>
                    <span className="text-right">Move</span>
                    <span className="text-center">Decision</span>
                    <span>Reason</span>
                  </div>
                  
                  {/* Table rows */}
                  {missedMoves.map((m) => {
                    const timeAgo = formatTimeAgo(m.decision_time);
                    const reason = formatDecisionReason(m.last_decision_reason);
                    
                    return (
                      <div
                        key={m.symbol}
                        className="grid grid-cols-[1fr_60px_70px_1fr] gap-2 items-center px-2 py-2 rounded bg-muted/30 hover:bg-muted/40 transition-colors group"
                      >
                        {/* Symbol + move icon */}
                        <div className="flex items-center gap-1.5">
                          {m.move_type === 'pump' ? (
                            <TrendingUp className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
                          ) : (
                            <TrendingDown className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />
                          )}
                          <span className="text-[12px] font-semibold text-foreground font-mono">
                            {m.symbol.replace('-USD', '')}
                          </span>
                        </div>
                        
                        {/* Move % */}
                        <span className={`text-[12px] font-mono text-right font-medium ${
                          m.move_type === 'pump' ? 'text-emerald-400' : 'text-red-400'
                        }`}>
                          {m.change_24h >= 0 ? '+' : ''}{m.change_24h.toFixed(1)}%
                        </span>
                        
                        {/* Decision badge */}
                        <div className="flex justify-center">
                          <Badge 
                            variant={
                              m.last_decision === 'BUY' ? 'default' :
                              m.last_decision === 'SELL' ? 'destructive' :
                              'secondary'
                            }
                            className="text-[9px] px-1.5 py-0 h-4 font-mono"
                          >
                            {m.last_decision === 'HOLD' ? 'HOLD' : 
                             m.last_decision === 'BUY' ? 'BUY' : 
                             m.last_decision === 'SELL' ? 'SELL' : 
                             'no eval'}
                          </Badge>
                        </div>
                        
                        {/* Reason + why link */}
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="text-[10px] text-muted-foreground truncate flex-1" title={m.last_decision_reason || ''}>
                            {reason || (m.last_decision ? 'no_signal' : 'not evaluated')}
                          </span>
                          <button 
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-muted rounded"
                            title={`Why did we miss ${m.symbol}? (${timeAgo} ago)`}
                          >
                            <HelpCircle className="h-3 w-3 text-muted-foreground/60 hover:text-primary" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  
                  {/* Thresholds footer */}
                  <div className="flex items-center justify-between px-2 pt-2 mt-2 border-t border-border/30 text-[9px] text-muted-foreground/50">
                    <span>Thresholds: ≥{pumpThreshold}% pump, ≤{dumpThreshold}% dump</span>
                    <span>Monitored: {monitoredCount} symbols</span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 px-4">
                  <AlertCircle className="h-6 w-6 text-muted-foreground/30 mb-2" />
                  <div className="text-[12px] text-muted-foreground font-medium">
                    No significant misses
                  </div>
                  <div className="text-[10px] text-muted-foreground/60 mt-1 text-center">
                    Moves ≥{pumpThreshold}% or ≤{dumpThreshold}% on monitored symbols
                  </div>
                  {monitoredCount > 0 && (
                    <div className="text-[9px] text-muted-foreground/40 mt-2">
                      Watching {monitoredCount} symbols
                    </div>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

export default AutopsyWidget;
