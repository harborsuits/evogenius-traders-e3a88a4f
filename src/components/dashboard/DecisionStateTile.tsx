import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useSystemState } from '@/hooks/useEvoTraderData';
import { useDroughtState } from '@/hooks/useDroughtState';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { 
  Activity, 
  ChevronDown, 
  TrendingUp, 
  TrendingDown,
  Droplets,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Skull
} from 'lucide-react';

// Types for trade decision metadata
interface CostContext {
  estimated_fee_rate?: number;
  estimated_fee_pct?: number;
  estimated_slippage_bps?: number;
}

interface RegimeContext {
  regime?: string;
  gating_regime?: string;
  trend_strength?: number;
  volatility_level?: number;
}

interface RegimeGating {
  dominant_market_regime?: string;
  agent_preferred_regime?: string;
  regime_blocked_count?: number;
  regime_stats?: Record<string, number>;
}

interface Evaluation {
  symbol?: string;
  decision?: string;
  reasons?: string[];
  confidence?: number;
  signal_confidence?: number;
  maturity_multiplier?: number;
  gate_failures?: string[];
  regime_blocked?: boolean;
  cost_context?: CostContext;
  regime_context?: RegimeContext;
}

interface TradeDecisionMeta {
  decision?: string;
  symbol?: string;
  confidence?: number;
  signal_confidence?: number;
  maturity_multiplier?: number;
  top_hold_reasons?: string[];
  evaluations?: Evaluation[];
  cost_context?: CostContext;
  regime_context?: RegimeContext;
  regime_gating?: RegimeGating;
  reason?: string;  // Canonical reason string
}

export function DecisionStateTile({ compact }: { compact?: boolean }) {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const { data: systemState } = useSystemState();
  const { data: droughtState, isLoading: droughtLoading } = useDroughtState();
  
  // Fetch recent decisions
  const { data: decisionData, isLoading: decisionsLoading } = useQuery({
    queryKey: ['decision-state', systemState?.current_generation_id],
    queryFn: async () => {
      const { data: events } = await supabase
        .from('control_events')
        .select('triggered_at, metadata')
        .eq('action', 'trade_decision')
        .order('triggered_at', { ascending: false })
        .limit(100);
      
      if (!events?.length) return { 
        buy: 0, sell: 0, hold: 0, blocked: 0, 
        latestDecision: null, 
        topReasons: [], 
        recentTrades: [],
        latestEvaluations: []
      };
      
      let buy = 0, sell = 0, hold = 0, blocked = 0;
      const reasonCounts: Record<string, number> = {};
      let latestDecision: TradeDecisionMeta | null = null;
      const recentTrades: Array<{
        symbol: string;
        decision: string;
        confidence: number;
        signal_confidence?: number;
        maturity_multiplier?: number;
        triggered_at: string;
      }> = [];
      
      for (let i = 0; i < events.length; i++) {
        const e = events[i];
        const meta = e.metadata as TradeDecisionMeta;
        const decision = meta?.decision?.toLowerCase();
        
        if (i === 0) latestDecision = meta;
        
        if (decision === 'buy') {
          buy++;
          if (recentTrades.length < 5 && meta.symbol) {
            recentTrades.push({
              symbol: meta.symbol,
              decision: 'buy',
              confidence: meta.confidence ?? 0,
              signal_confidence: meta.signal_confidence,
              maturity_multiplier: meta.maturity_multiplier,
              triggered_at: e.triggered_at,
            });
          }
        } else if (decision === 'sell') {
          sell++;
          if (recentTrades.length < 5 && meta.symbol) {
            recentTrades.push({
              symbol: meta.symbol,
              decision: 'sell',
              confidence: meta.confidence ?? 0,
              signal_confidence: meta.signal_confidence,
              maturity_multiplier: meta.maturity_multiplier,
              triggered_at: e.triggered_at,
            });
          }
        } else if (decision === 'hold') {
          hold++;
          const reasons = meta?.top_hold_reasons || [];
          for (const r of reasons) {
            const match = typeof r === 'string' ? r.match(/^([^:]+)/) : null;
            if (match) {
              reasonCounts[match[1]] = (reasonCounts[match[1]] || 0) + 1;
            }
          }
        } else if (decision === 'blocked') {
          blocked++;
        }
      }
      
      const topReasons = Object.entries(reasonCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([reason]) => reason.replace(/_/g, ' '));
      
      // Extract latest evaluations for expanded view
      const latestEvaluations = latestDecision?.evaluations?.slice(0, 5) || [];
      
      // Extract regime info from latest decision
      const regimeGating = latestDecision?.regime_gating;
      const dominantRegime = regimeGating?.dominant_market_regime ?? 'unknown';
      const agentPreference = regimeGating?.agent_preferred_regime ?? 'any';
      const regimeBlocked = (regimeGating?.regime_blocked_count ?? 0) > 0;
      
      return { 
        buy, sell, hold, blocked, 
        latestDecision, 
        topReasons, 
        recentTrades,
        latestEvaluations,
        total: events.length,
        dominantRegime,
        agentPreference,
        regimeBlocked,
      };
    },
    refetchInterval: 15000,
  });
  
  const isLoading = droughtLoading || decisionsLoading;
  
  // Determine primary status
  const getStatusSummary = () => {
    if (!decisionData || !droughtState) return { label: 'Loading...', color: 'text-muted-foreground', desc: '' };
    
    // Check for kill/block states first
    if (droughtState.killed) {
      return { 
        label: 'KILLED', 
        color: 'text-destructive', 
        desc: droughtState.killReason || 'Drawdown limit hit',
        icon: Skull
      };
    }
    
    if (droughtState.blocked) {
      return { 
        label: 'BLOCKED', 
        color: 'text-amber-500', 
        desc: droughtState.blockReason || 'Temporary block active',
        icon: AlertTriangle
      };
    }
    
    // Check action rate
    const total = decisionData.total || 1;
    const actionRate = ((decisionData.buy + decisionData.sell) / total) * 100;
    
    if (actionRate >= 10) {
      return { 
        label: 'ACTIVE', 
        color: 'text-success', 
        desc: 'Finding opportunities',
        icon: CheckCircle
      };
    }
    
    if (actionRate >= 3) {
      return { 
        label: 'SELECTIVE', 
        color: 'text-primary', 
        desc: 'Disciplined filtering',
        icon: Activity
      };
    }
    
    if (droughtState.isActive) {
      return { 
        label: 'DROUGHT', 
        color: 'text-amber-500', 
        desc: 'Signal drought active',
        icon: Droplets
      };
    }
    
    // Default: healthy quiet
    const topReason = decisionData.topReasons[0] || 'No valid setups';
    return { 
      label: 'HOLD', 
      color: 'text-muted-foreground', 
      desc: topReason,
      icon: Activity
    };
  };
  
  const status = getStatusSummary();
  const StatusIcon = status.icon || Activity;
  
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground uppercase tracking-wider">
        <Activity className="h-4 w-4 text-primary" />
        Decision State
        <Badge variant="glow" className="text-[8px] px-1 py-0 ml-auto">HERO</Badge>
      </div>
      
      {isLoading ? (
        <div className="text-xs text-muted-foreground animate-pulse">Loading...</div>
      ) : (
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          {/* Collapsed: One sentence summary */}
          <div className="space-y-2">
            <div className={cn(
              "flex items-center gap-2 p-3 rounded-lg border",
              status.color === 'text-destructive' ? 'bg-destructive/10 border-destructive/30' :
              status.color === 'text-amber-500' ? 'bg-amber-500/10 border-amber-500/30' :
              status.color === 'text-success' ? 'bg-success/10 border-success/30' :
              status.color === 'text-primary' ? 'bg-primary/10 border-primary/30' :
              'bg-muted/30 border-border/30'
            )}>
              <StatusIcon className={cn("h-5 w-5", status.color)} />
              <div className="flex-1">
                <div className={cn("text-sm font-bold font-mono", status.color)}>
                  {status.label}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {status.desc}
                </div>
              </div>
              
              {/* Quick stats */}
              <div className="flex items-center gap-2 text-[10px] font-mono">
                <span className="text-success">{decisionData?.buy || 0}B</span>
                <span className="text-destructive">{decisionData?.sell || 0}S</span>
                <span className="text-muted-foreground">{decisionData?.hold || 0}H</span>
              </div>
            </div>
            
            {/* Regime indicator - single line as requested */}
            {decisionData?.dominantRegime && decisionData.dominantRegime !== 'unknown' && (
              <div className={cn(
                "text-[10px] font-mono px-3 py-1.5 rounded border",
                decisionData.regimeBlocked 
                  ? "text-amber-500 bg-amber-500/10 border-amber-500/30" 
                  : "text-muted-foreground bg-muted/20 border-border/30"
              )}>
                Market Regime: <span className="font-bold uppercase">{decisionData.dominantRegime}</span>
                {decisionData.regimeBlocked && decisionData.agentPreference !== 'any' && (
                  <span className="ml-1 text-amber-500">
                    ({decisionData.agentPreference} agents paused)
                  </span>
                )}
              </div>
            )}
            
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
          
          {/* Expanded: Full details */}
          <CollapsibleContent className="space-y-3 pt-2">
            {/* Recent trades */}
            {decisionData?.recentTrades && decisionData.recentTrades.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                  Recent Trades
                </div>
                <ScrollArea className="h-[80px]">
                  {decisionData.recentTrades.map((t, i) => (
                    <div key={i} className="flex items-center gap-2 py-1 border-b border-border/20 last:border-0">
                      <Badge 
                        variant={t.decision === 'buy' ? 'default' : 'destructive'} 
                        className="text-[8px] px-1.5 py-0"
                      >
                        {t.decision.toUpperCase()}
                      </Badge>
                      <span className="font-mono text-[10px] w-12 truncate">
                        {t.symbol.replace('-USD', '')}
                      </span>
                      <span className="text-[9px] text-muted-foreground ml-auto">
                        {(t.confidence * 100).toFixed(0)}%
                      </span>
                      {t.signal_confidence !== undefined && t.maturity_multiplier !== undefined && (
                        <span className="text-[8px] text-muted-foreground">
                          ({(t.signal_confidence * 100).toFixed(0)}×{t.maturity_multiplier.toFixed(2)})
                        </span>
                      )}
                    </div>
                  ))}
                </ScrollArea>
              </div>
            )}
            
            {/* Top hold reasons */}
            {decisionData?.topReasons && decisionData.topReasons.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                  Why Holding
                </div>
                <div className="flex flex-wrap gap-1">
                  {decisionData.topReasons.map((reason, i) => (
                    <Badge key={i} variant="secondary" className="text-[9px] px-1.5 py-0">
                      {reason}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            
            {/* Drought metrics */}
            {droughtState && (
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-muted/20 rounded-lg p-2 space-y-0.5">
                  <div className="text-[9px] text-muted-foreground uppercase">6h Window</div>
                  <div className="font-mono text-xs">
                    <span className="text-muted-foreground">{droughtState.shortWindowHolds} H</span>
                    <span className="mx-1">/</span>
                    <span className="text-primary">{droughtState.shortWindowOrders} O</span>
                  </div>
                </div>
                <div className="bg-muted/20 rounded-lg p-2 space-y-0.5">
                  <div className="text-[9px] text-muted-foreground uppercase">48h Window</div>
                  <div className="font-mono text-xs">
                    <span className="text-muted-foreground">{droughtState.longWindowHolds} H</span>
                    <span className="mx-1">/</span>
                    <span className="text-primary">{droughtState.longWindowOrders} O</span>
                  </div>
                </div>
              </div>
            )}
            
            {/* Drawdown warning */}
            {droughtState?.peakEquityDrawdownPct !== undefined && droughtState.peakEquityDrawdownPct > 1 && (
              <div className={cn(
                "text-[10px] font-mono flex items-center gap-1 p-2 rounded border",
                droughtState.peakEquityDrawdownPct > 1.5 
                  ? 'text-destructive bg-destructive/10 border-destructive/30' 
                  : 'text-amber-500 bg-amber-500/10 border-amber-500/30'
              )}>
                <Skull className="h-3 w-3" />
                <span>Peak DD: {droughtState.peakEquityDrawdownPct.toFixed(2)}%</span>
                {droughtState.peakEquityDrawdownPct > 1.5 && <span className="ml-1">KILL ZONE</span>}
              </div>
            )}
            
            {/* Latest evaluations preview */}
            {decisionData?.latestEvaluations && decisionData.latestEvaluations.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                  Latest Evaluations
                </div>
                <ScrollArea className="h-[60px]">
                  {decisionData.latestEvaluations.map((ev, i) => (
                    <div key={i} className="flex items-center gap-2 py-0.5 text-[9px]">
                      <span className="font-mono w-10 truncate">{ev.symbol?.replace('-USD', '') || '—'}</span>
                      <Badge 
                        variant={ev.decision === 'buy' ? 'default' : ev.decision === 'sell' ? 'destructive' : 'secondary'}
                        className="text-[7px] px-1 py-0"
                      >
                        {ev.decision?.toUpperCase() || 'HOLD'}
                      </Badge>
                      {ev.gate_failures && ev.gate_failures.length > 0 && (
                        <span className="text-destructive/70 truncate flex-1">
                          {ev.gate_failures.slice(0, 2).join(', ')}
                        </span>
                      )}
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
