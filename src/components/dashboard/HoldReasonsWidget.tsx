import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PieChart, AlertCircle, TrendingDown, Clock, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HoldReasonCount {
  reason: string;
  ct: number;
}

interface SymbolReasonCount {
  reason: string;
  symbol: string;
  ct: number;
}

export function HoldReasonsWidget({ compact = false }: { compact?: boolean }) {
  // Reason histogram (last 6h)
  const { data: reasonCounts = [], isLoading: loadingReasons } = useQuery({
    queryKey: ['hold-reasons-histogram', '6h'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('control_events')
        .select('metadata')
        .eq('action', 'trade_decision')
        .gte('triggered_at', new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString())
        .order('triggered_at', { ascending: false })
        .limit(500);
      
      if (error) throw error;
      
      const counts: Record<string, number> = {};
      data?.forEach(row => {
        const meta = row.metadata as Record<string, unknown>;
        const reason = (meta?.reason as string) || 'unknown';
        counts[reason] = (counts[reason] || 0) + 1;
      });
      
      return Object.entries(counts)
        .map(([reason, ct]) => ({ reason, ct }))
        .sort((a, b) => b.ct - a.ct);
    },
    refetchInterval: 30000, // Refresh every 30s
  });

  // Top symbols by reason (last 6h)
  const { data: symbolReasons = [], isLoading: loadingSymbols } = useQuery({
    queryKey: ['hold-reasons-by-symbol', '6h'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('control_events')
        .select('metadata')
        .eq('action', 'trade_decision')
        .gte('triggered_at', new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString())
        .order('triggered_at', { ascending: false })
        .limit(500);
      
      if (error) throw error;
      
      const counts: Record<string, number> = {};
      data?.forEach(row => {
        const meta = row.metadata as Record<string, unknown>;
        const reason = (meta?.reason as string) || 'unknown';
        const symbol = (meta?.symbol as string) || '?';
        const key = `${reason}|${symbol}`;
        counts[key] = (counts[key] || 0) + 1;
      });
      
      return Object.entries(counts)
        .map(([key, ct]) => {
          const [reason, symbol] = key.split('|');
          return { reason, symbol, ct };
        })
        .sort((a, b) => b.ct - a.ct)
        .slice(0, 10);
    },
    refetchInterval: 30000,
  });

  const totalDecisions = reasonCounts.reduce((sum, r) => sum + r.ct, 0);
  const topReason = reasonCounts[0];

  const getReasonIcon = (reason: string) => {
    if (reason.includes('confidence')) return <TrendingDown className="h-3 w-3" />;
    if (reason.includes('cooldown')) return <Clock className="h-3 w-3" />;
    if (reason.includes('signal')) return <Filter className="h-3 w-3" />;
    return <AlertCircle className="h-3 w-3" />;
  };

  const getReasonColor = (reason: string): string => {
    if (reason.includes('confidence')) return 'text-amber-500 bg-amber-500/20';
    if (reason.includes('cooldown')) return 'text-blue-400 bg-blue-400/20';
    if (reason.includes('signal')) return 'text-muted-foreground bg-muted/30';
    if (reason.includes('blocked') || reason.includes('stopped')) return 'text-destructive bg-destructive/20';
    return 'text-foreground bg-muted/30';
  };

  const isLoading = loadingReasons || loadingSymbols;

  if (compact) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
            <PieChart className="h-3 w-3" />
            Hold Reasons (6h)
          </div>
          <span className="text-[10px] font-mono text-muted-foreground">{totalDecisions} decisions</span>
        </div>
        {isLoading ? (
          <div className="text-[10px] text-muted-foreground">Loading...</div>
        ) : reasonCounts.length === 0 ? (
          <div className="text-[10px] text-muted-foreground">No decisions in last 6h</div>
        ) : (
          <div className="flex flex-wrap gap-1">
            {reasonCounts.slice(0, 5).map((r, i) => (
              <Badge key={i} className={cn("text-[9px] font-mono gap-1", getReasonColor(r.reason))}>
                {getReasonIcon(r.reason)}
                {r.reason.replace('hold:', '').replace('_', ' ').slice(0, 20)}
                <span className="opacity-70">({r.ct})</span>
              </Badge>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2 font-mono">
            <PieChart className="h-4 w-4 text-primary" />
            Hold Reasons (6h)
          </div>
          <Badge variant="outline" className="text-[10px] font-mono">
            {totalDecisions} total
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading...</div>
        ) : reasonCounts.length === 0 ? (
          <div className="text-sm text-muted-foreground">No decisions in last 6h</div>
        ) : (
          <>
            {/* Reason bars */}
            <div className="space-y-2">
              {reasonCounts.slice(0, 6).map((r, i) => {
                const pct = totalDecisions > 0 ? (r.ct / totalDecisions) * 100 : 0;
                return (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <div className="flex items-center gap-1 text-muted-foreground font-mono">
                        {getReasonIcon(r.reason)}
                        {r.reason.replace('hold:', '')}
                      </div>
                      <span className="font-mono font-medium">{r.ct} ({pct.toFixed(0)}%)</span>
                    </div>
                    <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
                      <div 
                        className={cn(
                          "h-full rounded-full transition-all",
                          r.reason.includes('confidence') ? "bg-amber-500" :
                          r.reason.includes('signal') ? "bg-muted-foreground" :
                          r.reason.includes('cooldown') ? "bg-blue-400" :
                          "bg-primary"
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Top blocked symbols */}
            {symbolReasons.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-border/30">
                <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">
                  Top Blocked Symbols
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {symbolReasons.slice(0, 6).map((sr, i) => (
                    <div key={i} className="flex items-center justify-between p-1.5 bg-muted/20 rounded text-[9px] font-mono">
                      <span className="text-foreground">{sr.symbol || '?'}</span>
                      <span className="text-muted-foreground">{sr.reason.replace('hold:', '').slice(0, 12)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
