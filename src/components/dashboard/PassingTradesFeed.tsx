import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TrendingUp, TrendingDown, Activity, Gauge, ShieldCheck, ShieldAlert } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

// Proper typing for trade decision metadata
interface CostContext {
  estimated_fee_pct?: number;
  estimated_slippage_bps?: number;
}

interface RegimeContext {
  regime?: string;
  trend_strength?: number;
  volatility_level?: string;
}

interface ConfidenceComponents {
  signal_confidence?: number;
  maturity_multiplier?: number;
  final_confidence?: number;
}

interface TradeDecisionMeta {
  decision?: string;
  symbol?: string;
  confidence?: number;
  signal_confidence?: number;
  maturity_multiplier?: number;
  confidence_components?: ConfidenceComponents;
  reasons?: string[];
  entry_reason?: string[];
  cost_context?: CostContext;
  regime_context?: RegimeContext;
}

interface PassingTrade {
  id: string;
  triggered_at: string;
  metadata: unknown;
}

export function PassingTradesFeed({ compact }: { compact?: boolean }) {
  // Fetch last 50 trade_decision rows and filter client-side to buy/sell
  const { data: trades, isLoading } = useQuery({
    queryKey: ['passing-trades-feed'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('control_events')
        .select('id, triggered_at, metadata')
        .eq('action', 'trade_decision')
        .order('triggered_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      
      // Filter client-side to buy/sell decisions (normalize to lowercase)
      const filtered = (data ?? []).filter((row) => {
        const meta = row.metadata as TradeDecisionMeta | null;
        const d = (meta?.decision ?? '').toLowerCase();
        return d === 'buy' || d === 'sell';
      });
      
      return filtered.slice(0, 15) as PassingTrade[];
    },
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-4 text-center text-muted-foreground">
          Loading trades...
        </CardContent>
      </Card>
    );
  }

  if (!trades || trades.length === 0) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Passing Trades
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 text-center text-muted-foreground text-sm">
          No buy/sell decisions yet
        </CardContent>
      </Card>
    );
  }

  if (compact) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Passing Trades
            <Badge variant="outline" className="ml-auto text-xs">
              {trades.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3">
          <ScrollArea className="h-32">
            <div className="space-y-2">
              {trades.slice(0, 5).map((trade) => {
                const meta = trade.metadata as TradeDecisionMeta;
                const decision = meta.decision ?? '';
                const symbol = meta.symbol ?? '';
                const confidence = meta.confidence ?? 0;
                const signalConf = meta.signal_confidence ?? meta.confidence_components?.signal_confidence ?? confidence;
                const maturity = meta.maturity_multiplier ?? meta.confidence_components?.maturity_multiplier ?? 1;
                
                return (
                  <div key={trade.id} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      {decision === 'buy' ? (
                        <TrendingUp className="w-3 h-3 text-success" />
                      ) : (
                        <TrendingDown className="w-3 h-3 text-destructive" />
                      )}
                      <span className="font-mono font-medium">{symbol}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">
                        S:{signalConf?.toFixed(2)} M:{maturity?.toFixed(2)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="w-4 h-4" />
          Passing Trades Feed
          <Badge variant="outline" className="ml-auto text-xs">
            {trades.length} recent
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3">
        <ScrollArea className="h-64">
          <div className="space-y-3">
            {trades.map((trade) => {
              const meta = trade.metadata as TradeDecisionMeta;
              const decision = meta.decision ?? '';
              const symbol = meta.symbol ?? '';
              const reasons = meta.reasons ?? (typeof meta.entry_reason === 'string' ? [meta.entry_reason] : meta.entry_reason ?? []);
              const confidence = meta.confidence ?? 0;
              const signalConf = meta.signal_confidence ?? meta.confidence_components?.signal_confidence ?? confidence;
              const maturity = meta.maturity_multiplier ?? meta.confidence_components?.maturity_multiplier ?? 1;
              const costContext = meta.cost_context;
              const regimeContext = meta.regime_context;
              
              const feePct = costContext?.estimated_fee_pct;
              const slippageBps = costContext?.estimated_slippage_bps;
              const regime = regimeContext?.regime ?? 'unknown';
              
              return (
                <div key={trade.id} className="p-2 bg-muted/30 rounded-lg space-y-2">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {decision === 'buy' ? (
                        <Badge variant="default" className="bg-success text-success-foreground text-xs">
                          BUY
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="text-xs">
                          SELL
                        </Badge>
                      )}
                      <span className="font-mono font-medium text-sm">{symbol}</span>
                      <Badge variant="outline" className="text-xs capitalize">
                        {regime}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(trade.triggered_at), { addSuffix: true })}
                    </span>
                  </div>
                  
                  {/* Confidence breakdown */}
                  <div className="flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-1">
                      <Gauge className="w-3 h-3 text-muted-foreground" />
                      <span className="text-muted-foreground">Signal:</span>
                      <span className={cn(
                        "font-mono font-medium",
                        signalConf >= 0.6 ? "text-success" : signalConf >= 0.5 ? "text-warning" : "text-destructive"
                      )}>
                        {signalConf?.toFixed(2) ?? 'N/A'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {maturity >= 0.5 ? (
                        <ShieldCheck className="w-3 h-3 text-success" />
                      ) : (
                        <ShieldAlert className="w-3 h-3 text-warning" />
                      )}
                      <span className="text-muted-foreground">Maturity:</span>
                      <span className={cn(
                        "font-mono font-medium",
                        maturity >= 0.5 ? "text-success" : maturity >= 0.25 ? "text-warning" : "text-destructive"
                      )}>
                        {maturity?.toFixed(2) ?? 'N/A'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">Final:</span>
                      <span className="font-mono font-medium">
                        {confidence?.toFixed(3) ?? 'N/A'}
                      </span>
                    </div>
                  </div>
                  
                  {/* Cost context */}
                  {(feePct !== undefined || slippageBps !== undefined) && (
                    <div className="flex items-center gap-4 text-xs">
                      {feePct !== undefined && (
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground">Fee:</span>
                          <span className="font-mono">{(feePct * 100).toFixed(2)}%</span>
                        </div>
                      )}
                      {slippageBps !== undefined && (
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground">Slip:</span>
                          <span className="font-mono">{slippageBps}bps</span>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Reasons */}
                  <div className="flex flex-wrap gap-1">
                    {reasons.map((reason, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {reason}
                      </Badge>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
