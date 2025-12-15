import { useMissedMoves } from "@/hooks/useMissedMoves";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Skull, 
  TrendingUp, 
  TrendingDown,
  AlertCircle
} from "lucide-react";

export function AutopsyWidget() {
  const { data: missedData, isLoading } = useMissedMoves();
  
  const missedMoves = missedData?.missed_moves || [];
  const pumpThreshold = missedData?.thresholds?.pump || 5;
  const dumpThreshold = missedData?.thresholds?.dump || -5;

  return (
    <Card className="w-56 bg-card/90 backdrop-blur-sm border-border/50 shadow-lg">
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground">
          <Skull className="h-3 w-3" />
          Autopsy
          <span className="text-[8px] text-muted-foreground/60 ml-1">ground truth</span>
          {missedMoves.length > 0 && (
            <span className="ml-auto text-[9px] font-mono text-amber-400">
              {missedMoves.length} miss{missedMoves.length !== 1 ? 'es' : ''}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="px-3 py-4 text-xs text-muted-foreground animate-pulse">
            Loading…
          </div>
        ) : (
          <ScrollArea className="h-48">
            <div className="space-y-0.5 px-2 pb-2">
              {missedMoves.length > 0 ? (
                <>
                  {missedMoves.map((m) => (
                    <div
                      key={m.symbol}
                      className="flex items-center gap-1.5 p-1.5 rounded bg-muted/30"
                    >
                      {m.move_type === 'pump' ? (
                        <TrendingUp className="h-3 w-3 text-emerald-400 flex-shrink-0" />
                      ) : (
                        <TrendingDown className="h-3 w-3 text-red-400 flex-shrink-0" />
                      )}
                      <span className="text-[10px] font-semibold text-foreground font-mono">
                        {m.symbol.replace('-USD', '')}
                      </span>
                      <span className={`text-[10px] font-mono ${
                        m.move_type === 'pump' ? 'text-emerald-400' : 'text-red-400'
                      }`}>
                        {m.change_24h >= 0 ? '+' : ''}{m.change_24h.toFixed(1)}%
                      </span>
                      <div className="ml-auto flex flex-col items-end">
                        <span className="text-[8px] text-muted-foreground">
                          {m.last_decision === 'HOLD' ? 'no signal' : 
                           m.last_decision === 'BUY' ? 'signaled' : 
                           m.last_decision ? m.last_decision : 'no eval'}
                        </span>
                        {m.had_signal && (
                          <span className="text-[7px] text-amber-400">had signal</span>
                        )}
                      </div>
                    </div>
                  ))}
                  
                  <div className="h-px bg-border/30 my-2" />
                  
                  <div className="text-[8px] text-muted-foreground/60 px-1 space-y-0.5">
                    <div className="flex justify-between">
                      <span>Pump threshold</span>
                      <span className="font-mono text-emerald-400/60">≥{pumpThreshold}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Dump threshold</span>
                      <span className="font-mono text-red-400/60">≤{dumpThreshold}%</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="px-1 py-4 text-center">
                  <AlertCircle className="h-4 w-4 text-muted-foreground/40 mx-auto mb-1" />
                  <div className="text-[10px] text-muted-foreground">
                    No significant misses
                  </div>
                  <div className="text-[8px] text-muted-foreground/60 mt-1">
                    Moves ≥{pumpThreshold}% or ≤{dumpThreshold}%
                  </div>
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
