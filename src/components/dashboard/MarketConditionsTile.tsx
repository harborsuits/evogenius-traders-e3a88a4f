import React from 'react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentTradeMode } from '@/contexts/TradeModeContext';
import { cn } from '@/lib/utils';
import { 
  Globe, 
  ChevronDown, 
  TrendingUp, 
  TrendingDown,
  Activity,
  Flame,
  HelpCircle,
  Scale
} from 'lucide-react';

export function MarketConditionsTile({ compact }: { compact?: boolean }) {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const { mode, isLive } = useCurrentTradeMode();
  
  // Combined query for regime + cost data - filtered by mode
  const { data, isLoading } = useQuery({
    queryKey: ['market-conditions-combined', mode],
    queryFn: async () => {
      const { data: events } = await supabase
        .from('control_events')
        .select('triggered_at, metadata')
        .eq('action', 'trade_decision')
        .order('triggered_at', { ascending: false })
        .limit(100);
      
      // Filter by current mode
      const modeFilteredEvents = (events || []).filter(e => {
        const meta = e.metadata as Record<string, unknown>;
        const eventMode = meta?.mode as string;
        return eventMode === mode;
      }).slice(0, 50);
      
      if (!modeFilteredEvents?.length) return null;
      
      // Regime extraction
      const regimesBySymbol: Record<string, {
        regime: string;
        strength: number;
        volatility_level: string;
      }> = {};
      
      // Cost extraction
      const trades: Array<{
        symbol: string;
        decision: string;
        confidence: number;
        fee_pct: number;
        slippage_bps: number;
        net_edge: number;
      }> = [];
      
      for (const e of modeFilteredEvents) {
        const meta = e.metadata as Record<string, unknown>;
        const decision = (meta?.decision as string)?.toLowerCase();
        
        // Extract regimes from evaluations or candidates_context
        if (decision === 'hold') {
          const candidates = (meta?.candidates_context as Array<Record<string, unknown>>) || 
                            (meta?.evaluations as Array<Record<string, unknown>>) || [];
          for (const c of candidates) {
            const symbol = c.symbol as string;
            const regimeCtx = c.regime_context as Record<string, unknown> | undefined;
            if (regimeCtx && symbol && !regimesBySymbol[symbol]) {
              regimesBySymbol[symbol] = {
                regime: (regimeCtx.regime as string) ?? 'unknown',
                strength: (regimeCtx.trend_strength as number) ?? 0,
                volatility_level: (regimeCtx.volatility_level as string) ?? 'normal',
              };
            }
          }
        }
        
        if (decision === 'buy' || decision === 'sell') {
          const symbol = meta?.symbol as string;
          const regimeCtx = meta?.regime_context as Record<string, unknown> | undefined;
          const costCtx = meta?.cost_context as Record<string, unknown> | undefined;
          const confidence = (meta?.confidence as number) ?? 0;
          
          // Regime
          if (regimeCtx && symbol && !regimesBySymbol[symbol]) {
            regimesBySymbol[symbol] = {
              regime: (regimeCtx.regime as string) ?? 'unknown',
              strength: (regimeCtx.trend_strength as number) ?? 0,
              volatility_level: (regimeCtx.volatility_level as string) ?? 'normal',
            };
          }
          
          // Costs
          if (symbol && costCtx) {
            const feeFraction = (costCtx.estimated_fee_rate as number) ?? (costCtx.estimated_fee_pct as number) ?? 0.006;
            const slippageBps = (costCtx.estimated_slippage_bps as number) ?? 0;
            const feeDisplayPct = feeFraction * 100;
            const slippageDisplayPct = slippageBps / 100;
            const netEdge = (confidence * 100) - (feeDisplayPct + slippageDisplayPct);
            
            trades.push({
              symbol,
              decision,
              confidence,
              fee_pct: feeDisplayPct,
              slippage_bps: slippageBps,
              net_edge: netEdge,
            });
          }
        }
      }
      
      // Aggregate regime counts
      const regimeCounts: Record<string, number> = {};
      for (const [, data] of Object.entries(regimesBySymbol)) {
        regimeCounts[data.regime] = (regimeCounts[data.regime] || 0) + 1;
      }
      
      const dominantRegime = Object.entries(regimeCounts)
        .sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'unknown';
      
      // Aggregate costs
      const avgFeePct = trades.length > 0 
        ? trades.reduce((sum, t) => sum + t.fee_pct, 0) / trades.length 
        : 0.6;
      const avgSlippageBps = trades.length > 0 
        ? trades.reduce((sum, t) => sum + t.slippage_bps, 0) / trades.length 
        : 5;
      const avgNetEdge = trades.length > 0 
        ? trades.reduce((sum, t) => sum + t.net_edge, 0) / trades.length 
        : 0;
      
      const positiveEdgeTrades = trades.filter(t => t.net_edge > 0).length;
      const edgeRatio = trades.length > 0 ? (positiveEdgeTrades / trades.length) * 100 : 0;
      
      return {
        regime: {
          dominant: dominantRegime,
          counts: regimeCounts,
          symbols: regimesBySymbol,
          symbolCount: Object.keys(regimesBySymbol).length,
        },
        costs: {
          avgFeePct,
          avgSlippageBps,
          avgNetEdge,
          edgeRatio,
          totalTrades: trades.length,
          trades: trades.slice(0, 5),
        },
      };
    },
    refetchInterval: 30000,
  });
  
  const getRegimeColor = (regime: string) => {
    switch (regime?.toLowerCase()) {
      case 'trend': return 'text-success';
      case 'chop': return 'text-amber-500';
      case 'volatile': return 'text-destructive';
      case 'dead': return 'text-muted-foreground';
      default: return 'text-muted-foreground';
    }
  };
  
  const getRegimeIcon = (regime: string) => {
    switch (regime?.toLowerCase()) {
      case 'trend': return TrendingUp;
      case 'chop': return Activity;
      case 'volatile': return Flame;
      case 'dead': return HelpCircle;
      default: return Globe;
    }
  };
  
  const getConditionSummary = () => {
    if (!data) return { label: 'Loading...', desc: '', color: 'text-muted-foreground' };
    
    const regime = data.regime.dominant;
    const netEdge = data.costs.avgNetEdge;
    
    if (regime === 'trend' && netEdge > 0) {
      return { label: 'FAVORABLE', desc: 'Trending markets with positive edge', color: 'text-success' };
    }
    if (regime === 'trend' && netEdge <= 0) {
      return { label: 'MIXED', desc: 'Trends visible but costs eating edge', color: 'text-amber-500' };
    }
    if (regime === 'chop') {
      return { label: 'CHOPPY', desc: 'No directional edge — costs matter more', color: 'text-amber-500' };
    }
    if (regime === 'volatile') {
      return { label: 'VOLATILE', desc: 'High risk environment', color: 'text-destructive' };
    }
    if (netEdge < 0) {
      return { label: 'UNFAVORABLE', desc: 'Costs exceed expected edge', color: 'text-destructive' };
    }
    return { label: 'NEUTRAL', desc: 'Market lacks clear direction', color: 'text-muted-foreground' };
  };
  
  const condition = getConditionSummary();
  const RegimeIcon = data ? getRegimeIcon(data.regime.dominant) : Globe;
  
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground uppercase tracking-wider">
        <Globe className="h-4 w-4 text-primary" />
        Market Conditions
        <Badge 
          variant={isLive ? 'glow' : 'outline'} 
          className={cn("text-[8px] px-1 py-0 ml-auto", isLive && "bg-amber-500/20 text-amber-400 border-amber-500/50")}
        >
          {isLive ? 'LIVE' : 'PAPER'}
        </Badge>
      </div>
      
      {isLoading ? (
        <div className="text-xs text-muted-foreground animate-pulse">Loading...</div>
      ) : !data ? (
        <div className="text-xs text-muted-foreground">Awaiting trade decisions...</div>
      ) : (
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          {/* Collapsed summary */}
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              {/* Regime */}
              <div className={cn(
                "rounded-lg p-2 border text-center",
                data.regime.dominant === 'trend' ? 'bg-success/10 border-success/20' :
                data.regime.dominant === 'chop' ? 'bg-amber-500/10 border-amber-500/20' :
                data.regime.dominant === 'volatile' ? 'bg-destructive/10 border-destructive/20' :
                'bg-muted/30 border-border/30'
              )}>
                <RegimeIcon className={cn("h-4 w-4 mx-auto mb-1", getRegimeColor(data.regime.dominant))} />
                <div className={cn("text-xs font-bold font-mono", getRegimeColor(data.regime.dominant))}>
                  {data.regime.dominant.toUpperCase()}
                </div>
                <div className="text-[8px] text-muted-foreground">Regime</div>
              </div>
              
              {/* Cost drag */}
              <div className={cn(
                "rounded-lg p-2 border text-center",
                data.costs.avgFeePct + (data.costs.avgSlippageBps / 100) > 1 
                  ? 'bg-amber-500/10 border-amber-500/20' 
                  : 'bg-muted/30 border-border/30'
              )}>
                <Scale className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                <div className="text-xs font-bold font-mono">
                  {(data.costs.avgFeePct + (data.costs.avgSlippageBps / 100)).toFixed(2)}%
                </div>
                <div className="text-[8px] text-muted-foreground">Cost Drag</div>
              </div>
              
              {/* Net edge */}
              <div className={cn(
                "rounded-lg p-2 border text-center",
                data.costs.avgNetEdge > 0 
                  ? 'bg-success/10 border-success/20' 
                  : 'bg-destructive/10 border-destructive/20'
              )}>
                {data.costs.avgNetEdge > 0 
                  ? <TrendingUp className="h-4 w-4 mx-auto mb-1 text-success" />
                  : <TrendingDown className="h-4 w-4 mx-auto mb-1 text-destructive" />
                }
                <div className={cn(
                  "text-xs font-bold font-mono",
                  data.costs.avgNetEdge > 0 ? 'text-success' : 'text-destructive'
                )}>
                  {data.costs.avgNetEdge >= 0 ? '+' : ''}{data.costs.avgNetEdge.toFixed(1)}%
                </div>
                <div className="text-[8px] text-muted-foreground">Net Edge</div>
              </div>
            </div>
            
            {/* One-line summary */}
            <div className={cn("text-[10px] font-mono", condition.color)}>
              <span className="font-bold">{condition.label}</span>
              <span className="text-muted-foreground ml-1">— {condition.desc}</span>
            </div>
            
            {/* Expand trigger */}
            <CollapsibleTrigger asChild>
              <button className="w-full flex items-center justify-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors py-1">
                <span>{isExpanded ? 'Less' : 'Details'}</span>
                <ChevronDown className={cn(
                  "h-3 w-3 transition-transform",
                  isExpanded && "rotate-180"
                )} />
              </button>
            </CollapsibleTrigger>
          </div>
          
          {/* Expanded details */}
          <CollapsibleContent className="space-y-3 pt-2">
            {/* Regime distribution */}
            <div className="grid grid-cols-4 gap-1">
              {['trend', 'chop', 'volatile', 'dead'].map(regime => {
                const count = data.regime.counts[regime] || 0;
                const pct = data.regime.symbolCount > 0 ? (count / data.regime.symbolCount) * 100 : 0;
                return (
                  <div key={regime} className={cn(
                    "rounded p-1.5 text-center border",
                    count > 0 ? (
                      regime === 'trend' ? 'bg-success/10 border-success/20 text-success' :
                      regime === 'chop' ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' :
                      regime === 'volatile' ? 'bg-destructive/10 border-destructive/20 text-destructive' :
                      'bg-muted/30 border-muted/20 text-muted-foreground'
                    ) : "bg-muted/10 border-transparent text-muted-foreground/50"
                  )}>
                    <div className="text-sm font-bold">{count}</div>
                    <div className="text-[7px] uppercase">{regime}</div>
                    {pct > 0 && <div className="text-[7px] opacity-70">{pct.toFixed(0)}%</div>}
                  </div>
                );
              })}
            </div>
            
            {/* Cost breakdown */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-muted/20 rounded-lg p-2 text-center">
                <div className="text-sm font-bold font-mono">{data.costs.avgFeePct.toFixed(2)}%</div>
                <div className="text-[8px] text-muted-foreground">Avg Fee</div>
              </div>
              <div className="bg-muted/20 rounded-lg p-2 text-center">
                <div className="text-sm font-bold font-mono">{data.costs.avgSlippageBps.toFixed(0)}bps</div>
                <div className="text-[8px] text-muted-foreground">Avg Slip</div>
              </div>
              <div className={cn(
                "rounded-lg p-2 text-center",
                data.costs.edgeRatio >= 50 ? "bg-success/10" : "bg-amber-500/10"
              )}>
                <div className={cn(
                  "text-sm font-bold font-mono",
                  data.costs.edgeRatio >= 50 ? "text-success" : "text-amber-500"
                )}>
                  {data.costs.edgeRatio.toFixed(0)}%
                </div>
                <div className="text-[8px] text-muted-foreground">+Edge Rate</div>
              </div>
            </div>
            
            {/* Symbol regimes */}
            {data.regime.symbolCount > 0 && (
              <div className="space-y-1">
                <div className="text-[9px] text-muted-foreground uppercase">By Symbol</div>
                <ScrollArea className="h-[60px]">
                  {Object.entries(data.regime.symbols).slice(0, 5).map(([symbol, d]) => (
                    <div key={symbol} className="flex items-center gap-2 text-[9px] py-0.5">
                      <span className="font-mono w-10 truncate">{symbol.replace('-USD', '')}</span>
                      <Badge variant="outline" className={cn("text-[7px] px-1 py-0", getRegimeColor(d.regime))}>
                        {d.regime}
                      </Badge>
                      <span className="text-muted-foreground">
                        str:{typeof d.strength === 'number' ? (d.strength * 100).toFixed(0) : '0'}%
                      </span>
                    </div>
                  ))}
                </ScrollArea>
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
