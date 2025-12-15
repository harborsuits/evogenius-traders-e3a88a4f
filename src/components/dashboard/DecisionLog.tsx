import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Brain, CheckCircle, XCircle, Clock, ChevronDown, ChevronRight, TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface SymbolEvaluation {
  symbol: string;
  decision: 'buy' | 'sell' | 'hold';
  reasons: string[];
  confidence: number;
  market: {
    price: number;
    change_24h: number;
    ema_slope: number;
    atr: number;
    regime: string;
  };
}

interface TradeDecision {
  id: string;
  triggered_at: string;
  action: string;
  metadata: {
    symbol?: string;
    side?: string;
    qty?: number;
    decision?: string;
    decision_type?: 'trade' | 'hold' | 'blocked';
    block_reason?: string;
    market_age_seconds?: number;
    trades_today?: number;
    max_allowed?: number;
    fill_price?: number;
    order_id?: string;
    agent_id?: string;
    generation_id?: string;
    mode?: 'paper' | 'live';
    strategy_template?: string;
    evaluations?: SymbolEvaluation[];
    symbols_evaluated?: number | string[]; // Can be count or array
    top_hold_reasons?: string[]; // For minimal HOLD logging
    all_hold?: boolean;
    thresholds_used?: {
      trend: number;
      pullback: number;
      rsi: number;
      vol_contraction: number;
    };
    entry_reason?: string[];
    confidence?: number;
    market_snapshot?: {
      price: number;
      change_24h: number;
      ema_50_slope: number;
      atr_ratio: number;
    };
  } | null;
}

function ExpandableDecision({ decision }: { decision: TradeDecision }) {
  const [expanded, setExpanded] = useState(false);
  const metadata = decision.metadata;
  const evaluations = metadata?.evaluations || [];
  const isMinimalHold = metadata?.all_hold && evaluations.length === 0;
  const symbolCount = typeof metadata?.symbols_evaluated === 'number' 
    ? metadata.symbols_evaluated 
    : Array.isArray(metadata?.symbols_evaluated) 
      ? metadata.symbols_evaluated.length 
      : 0;
  
  const getDecisionIcon = () => {
    if (decision.action === 'trade_blocked') {
      return <XCircle className="h-3.5 w-3.5 text-destructive" />;
    }
    if (decision.action === 'trade_executed') {
      return <CheckCircle className="h-3.5 w-3.5 text-primary" />;
    }
    if (metadata?.decision === 'buy' || metadata?.decision === 'sell') {
      return <Activity className="h-3.5 w-3.5 text-primary" />;
    }
    return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
  };

  const getDecisionBadge = () => {
    if (decision.action === 'trade_blocked') {
      return <Badge variant="destructive" className="text-[10px] px-1.5">BLOCKED</Badge>;
    }
    if (decision.action === 'trade_executed') {
      return <Badge variant="default" className="text-[10px] px-1.5">EXECUTED</Badge>;
    }
    if (metadata?.decision === 'buy') {
      return <Badge className="text-[10px] px-1.5 bg-primary">BUY</Badge>;
    }
    if (metadata?.decision === 'sell') {
      return <Badge variant="destructive" className="text-[10px] px-1.5">SELL</Badge>;
    }
    return <Badge variant="secondary" className="text-[10px] px-1.5">HOLD</Badge>;
  };

  const getStrategyBadge = () => {
    const strategy = metadata?.strategy_template;
    if (!strategy) return null;
    const colors: Record<string, string> = {
      trend_pullback: 'bg-blue-500/20 text-blue-400',
      mean_reversion: 'bg-purple-500/20 text-purple-400',
      breakout: 'bg-orange-500/20 text-orange-400',
    };
    return (
      <Badge className={cn('text-[9px] px-1', colors[strategy] || 'bg-muted')}>
        {strategy.replace('_', ' ')}
      </Badge>
    );
  };

  return (
    <div className="rounded bg-muted/30 text-xs overflow-hidden">
      <div 
        className="flex items-center gap-2 p-2 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {(evaluations.length > 0 || isMinimalHold) ? (
          expanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />
        ) : (
          <span className="w-3" />
        )}
        
        {getDecisionIcon()}
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {metadata?.symbol && (
              <span className="font-mono font-medium">{metadata.symbol}</span>
            )}
            {getStrategyBadge()}
            {metadata?.entry_reason && (
              <span className="text-muted-foreground text-[10px]">
                {metadata.entry_reason.filter(r => r !== 'test_mode').join(', ')}
              </span>
            )}
            {metadata?.confidence && metadata.decision !== 'hold' && (
              <span className="text-muted-foreground text-[10px]">
                conf: {(metadata.confidence * 100).toFixed(0)}%
              </span>
            )}
          </div>
          {metadata?.block_reason && (
            <div className="text-destructive text-[10px] mt-0.5 truncate">
              {metadata.block_reason}
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-1">
          {getDecisionBadge()}
          <span className="text-[10px] text-muted-foreground">
            {formatDistanceToNow(new Date(decision.triggered_at), { addSuffix: true })}
          </span>
        </div>
      </div>
      
      {/* Expanded per-symbol evaluations (full details for trades) */}
      {expanded && evaluations.length > 0 && (
        <div className="border-t border-border/50 bg-background/50 p-2 space-y-1.5">
          <div className="text-[10px] text-muted-foreground mb-2">
            Per-symbol evaluation (top {evaluations.length}):
          </div>
          {evaluations.map((ev, idx) => (
            <div 
              key={idx} 
              className={cn(
                'flex items-center gap-2 p-1.5 rounded text-[10px]',
                ev.decision === 'buy' && 'bg-primary/10 border border-primary/20',
                ev.decision === 'sell' && 'bg-destructive/10 border border-destructive/20',
                ev.decision === 'hold' && 'bg-muted/50'
              )}
            >
              <div className="flex items-center gap-1 min-w-[80px]">
                {ev.decision === 'buy' && <TrendingUp className="h-3 w-3 text-primary" />}
                {ev.decision === 'sell' && <TrendingDown className="h-3 w-3 text-destructive" />}
                {ev.decision === 'hold' && <Clock className="h-3 w-3 text-muted-foreground" />}
                <span className="font-mono font-medium">{ev.symbol}</span>
              </div>
              
              <Badge 
                variant={ev.decision === 'buy' ? 'default' : ev.decision === 'sell' ? 'destructive' : 'secondary'}
                className="text-[9px] px-1"
              >
                {ev.decision.toUpperCase()}
              </Badge>
              
              <div className="flex-1 text-muted-foreground truncate">
                {ev.reasons.join(', ')}
              </div>
              
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className={cn(
                  ev.market.change_24h > 0 ? 'text-primary' : ev.market.change_24h < 0 ? 'text-destructive' : ''
                )}>
                  {ev.market.change_24h > 0 ? '+' : ''}{ev.market.change_24h.toFixed(2)}%
                </span>
                <span>slope: {ev.market.ema_slope.toFixed(4)}</span>
                <span>atr: {ev.market.atr.toFixed(2)}</span>
              </div>
              
              {ev.confidence > 0.5 && (
                <span className="text-primary">{(ev.confidence * 100).toFixed(0)}%</span>
              )}
            </div>
          ))}
          
          {/* Thresholds used */}
          {metadata?.thresholds_used && (
            <div className="mt-2 pt-2 border-t border-border/30 text-[9px] text-muted-foreground">
              <span className="opacity-70">Thresholds: </span>
              trend={metadata.thresholds_used.trend}, 
              pullback={metadata.thresholds_used.pullback}%, 
              rsi={metadata.thresholds_used.rsi}, 
              vol={metadata.thresholds_used.vol_contraction}
            </div>
          )}
        </div>
      )}
      
      {/* Minimal HOLD summary (lightweight) */}
      {expanded && isMinimalHold && (
        <div className="border-t border-border/50 bg-background/50 p-2 text-[10px]">
          <div className="text-muted-foreground mb-1">
            Evaluated {symbolCount} symbols — all HOLD
          </div>
          {metadata?.top_hold_reasons && metadata.top_hold_reasons.length > 0 && (
            <div className="text-muted-foreground">
              <span className="opacity-70">Top reasons: </span>
              {metadata.top_hold_reasons.join(', ')}
            </div>
          )}
          {metadata?.thresholds_used && (
            <div className="mt-1.5 pt-1.5 border-t border-border/30 text-[9px] text-muted-foreground">
              <span className="opacity-70">Thresholds: </span>
              trend={metadata.thresholds_used.trend}, 
              pullback={metadata.thresholds_used.pullback}%, 
              rsi={metadata.thresholds_used.rsi}, 
              vol={metadata.thresholds_used.vol_contraction}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function DecisionLog() {
  const [showHolds, setShowHolds] = useState(false);
  
  const { data: decisions = [], isLoading } = useQuery({
    queryKey: ['trade-decisions', showHolds],
    queryFn: async () => {
      const actions = showHolds 
        ? ['trade_decision', 'trade_blocked', 'trade_executed']
        : ['trade_blocked', 'trade_executed'];
      
      const { data, error } = await supabase
        .from('control_events')
        .select('*')
        .in('action', actions)
        .order('triggered_at', { ascending: false })
        .limit(30);

      if (error) throw error;
      return data as TradeDecision[];
    },
    refetchInterval: 5000,
  });

  return (
    <Card variant="default">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          <CardTitle className="font-mono text-sm text-muted-foreground uppercase tracking-wider">
            Decision Reasoning
          </CardTitle>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setShowHolds(!showHolds)}
              className={cn(
                'text-[10px] px-2 py-0.5 rounded transition-colors font-mono',
                showHolds 
                  ? 'bg-primary/20 text-primary' 
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              {showHolds ? 'All' : 'Trades Only'}
            </button>
            <Badge variant="outline" className="text-xs font-mono">
              {decisions.length}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-4 text-xs text-muted-foreground font-mono">
            Loading decisions...
          </div>
        ) : decisions.length === 0 ? (
          <div className="text-center py-4 text-xs text-muted-foreground font-mono">
            {showHolds 
              ? 'No trade decisions yet. Start the system to generate decisions.'
              : 'No executed/blocked trades yet. Toggle "All" to see HOLD decisions.'}
          </div>
        ) : (
          <ScrollArea className="h-[280px]">
            <div className="space-y-1.5 pr-3">
              {decisions.map((decision) => (
                <ExpandableDecision key={decision.id} decision={decision} />
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
