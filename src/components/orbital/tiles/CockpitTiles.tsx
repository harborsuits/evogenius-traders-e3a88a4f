// Cockpit Tiles - Small instrument cards that don't need drilldown
import { TradeCycleStatus } from '@/components/dashboard/TradeCycleStatus';
import { GenerationHealth } from '@/components/dashboard/GenerationHealth';
import { PollingHealth } from '@/components/dashboard/PollingHealth';
import { ControlPanel } from '@/components/dashboard/ControlPanel';
import { NewsPanel } from '@/components/dashboard/NewsPanel';
import { RolloverChecklist } from '@/components/dashboard/RolloverChecklist';
import { GenerationComparison } from '@/components/dashboard/GenerationComparison';
import { LineageWidget } from '@/components/dashboard/LineageWidget';
import { useSystemState, useMarketData } from '@/hooks/useEvoTraderData';
import { usePaperAccount, usePaperPositions, usePaperRealtimeSubscriptions } from '@/hooks/usePaperTrading';
import { SystemStatus } from '@/types/evotrader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { Badge } from '@/components/ui/badge';
import { 
  Wallet, 
  DollarSign, 
  Shield, 
  Users, 
  Activity, 
  TrendingUp,
  TrendingDown,
  Gauge,
  FlaskConical,
  BarChart3,
  Layers,
  PieChart
} from 'lucide-react';
import { useGenOrdersCount, useCohortCount } from '@/hooks/useGenOrders';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Trade Cycle Status Tile
export function TradeCycleTile({ compact }: { compact?: boolean }) {
  return <TradeCycleStatus />;
}

// Generation Health Tile
export function GenHealthTile({ compact }: { compact?: boolean }) {
  const { data: systemState } = useSystemState();
  return <GenerationHealth generationId={systemState?.current_generation_id ?? null} />;
}

// Polling Health Tile
export function PollingHealthTile({ compact }: { compact?: boolean }) {
  return <PollingHealth />;
}

// System Control Tile
export function SystemControlTile({ compact }: { compact?: boolean }) {
  const { data: systemState } = useSystemState();
  const status = (systemState?.status ?? 'stopped') as SystemStatus;
  
  return (
    <ControlPanel 
      status={status}
      generationId={systemState?.current_generation_id}
    />
  );
}

// Capital Overview Tile - Now shows REAL paper portfolio data
export function CapitalOverviewTile({ compact }: { compact?: boolean }) {
  const { data: systemState } = useSystemState();
  const { data: account } = usePaperAccount();
  const { data: positions = [] } = usePaperPositions(account?.id);
  const { data: marketData = [] } = useMarketData();
  const { data: genOrdersCount = 0 } = useGenOrdersCount(systemState?.current_generation_id ?? null);
  const { data: cohortCount = 0 } = useCohortCount(systemState?.current_generation_id ?? null);
  
  usePaperRealtimeSubscriptions();
  
  // Calculate real portfolio values
  const cash = account?.cash ?? 0;
  const startingCash = account?.starting_cash ?? 1000;
  
  const positionValues = positions.map(pos => {
    const market = marketData.find(m => m.symbol === pos.symbol);
    return pos.qty * (market?.price ?? pos.avg_entry_price);
  });
  
  const totalPositionValue = positionValues.reduce((sum, v) => sum + v, 0);
  const totalEquity = cash + totalPositionValue;
  const totalPnl = totalEquity - startingCash;
  const pnlPct = startingCash > 0 ? (totalPnl / startingCash) * 100 : 0;
  
  const activePositions = positions.filter(p => p.qty !== 0);
  
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground uppercase tracking-wider">
        <FlaskConical className="h-4 w-4 text-primary" />
        Paper Portfolio
        <Badge variant="glow" className="text-[8px] px-1 py-0 ml-auto">LIVE</Badge>
      </div>
      
      <div className={compact ? 'grid grid-cols-3 gap-2' : 'grid grid-cols-2 gap-3'}>
        <div className="bg-muted/30 rounded-lg p-2 space-y-1">
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Wallet className="h-3 w-3" />
            Equity
          </div>
          <div className="font-mono text-sm font-bold">
            ${totalEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
        
        <div className="bg-muted/30 rounded-lg p-2 space-y-1">
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <DollarSign className="h-3 w-3" />
            Cash
          </div>
          <div className="font-mono text-sm">
            ${cash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
        
        <div className="bg-muted/30 rounded-lg p-2 space-y-1">
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            {totalPnl >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            P&L
          </div>
          <div className={`font-mono text-sm font-bold ${totalPnl >= 0 ? 'text-success' : 'text-destructive'}`}>
            {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
            <span className="text-[10px] ml-1">({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%)</span>
          </div>
        </div>
        
        <div className="bg-muted/30 rounded-lg p-2 space-y-1">
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <BarChart3 className="h-3 w-3" />
            Positions
          </div>
          <div className="font-mono text-sm">{activePositions.length}</div>
        </div>
        
        <div className="bg-muted/30 rounded-lg p-2 space-y-1">
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Users className="h-3 w-3" />
            Cohort
          </div>
          <div className="font-mono text-sm">{cohortCount}</div>
        </div>
        
        <div className="bg-muted/30 rounded-lg p-2 space-y-1">
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Activity className="h-3 w-3" />
            Gen Orders
          </div>
          <div className="font-mono text-sm">{genOrdersCount}</div>
        </div>
      </div>
    </div>
  );
}

// News Feed Tile
export function NewsTile({ compact }: { compact?: boolean }) {
  return <NewsPanel />;
}

// Rollover Checklist Tile
export function RolloverTile({ compact }: { compact?: boolean }) {
  return <RolloverChecklist />;
}

// Generation Comparison Tile
export function GenComparisonTile({ compact }: { compact?: boolean }) {
  return <GenerationComparison />;
}

// Lineage Widget Tile
export function LineageTile({ compact }: { compact?: boolean }) {
  return <LineageWidget />;
}

// Decision Log Tile - Shows recent HOLD/BUY/SELL decisions with reasons
export function DecisionLogTile({ compact }: { compact?: boolean }) {
  const { data: systemState } = useSystemState();
  
  const { data: decisionStats, isLoading } = useQuery({
    queryKey: ['decision-log-summary', systemState?.current_generation_id],
    queryFn: async () => {
      if (!systemState?.current_generation_id) return null;
      
      // Query trade_decision events (the canonical decision source)
      const { data: events } = await supabase
        .from('control_events')
        .select('metadata')
        .eq('action', 'trade_decision')
        .order('triggered_at', { ascending: false })
        .limit(100);
      
      if (!events?.length) return { buy: 0, sell: 0, hold: 0, blocked: 0, topReasons: [] };
      
      // Count decisions by metadata.decision
      let buy = 0, sell = 0, hold = 0, blocked = 0;
      const reasonCounts: Record<string, number> = {};
      
      for (const e of events) {
        const meta = e.metadata as any;
        const decision = meta?.decision?.toLowerCase();
        
        if (decision === 'buy') buy++;
        else if (decision === 'sell') sell++;
        else if (decision === 'hold') {
          hold++;
          // Extract hold reasons from top_hold_reasons array
          const reasons = meta?.top_hold_reasons || [];
          for (const r of reasons) {
            // Format: "no_signal:3" -> extract reason name
            const match = typeof r === 'string' ? r.match(/^([^:]+)/) : null;
            if (match) {
              reasonCounts[match[1]] = (reasonCounts[match[1]] || 0) + 1;
            }
          }
        } else if (decision === 'blocked') blocked++;
      }
      
      // Get top 3 reasons
      const topReasons = Object.entries(reasonCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([reason]) => reason.replace(/_/g, ' '));
      
      return { buy, sell, hold, blocked, topReasons };
    },
    enabled: !!systemState?.current_generation_id,
    refetchInterval: 30000,
  });
  
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground uppercase tracking-wider">
        <Activity className="h-4 w-4 text-primary" />
        Recent Decisions
        <Badge variant="outline" className="text-[8px] px-1 py-0 ml-auto">LIVE</Badge>
      </div>
      
      {isLoading || !decisionStats ? (
        <div className="text-xs text-muted-foreground animate-pulse">Loading...</div>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-2">
            <div className="bg-success/10 border border-success/20 rounded-lg p-2 text-center">
              <div className="text-lg font-bold text-success">{decisionStats.buy}</div>
              <div className="text-[9px] text-muted-foreground">BUY</div>
            </div>
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-2 text-center">
              <div className="text-lg font-bold text-destructive">{decisionStats.sell}</div>
              <div className="text-[9px] text-muted-foreground">SELL</div>
            </div>
            <div className="bg-muted/30 rounded-lg p-2 text-center">
              <div className="text-lg font-bold text-muted-foreground">{decisionStats.hold}</div>
              <div className="text-[9px] text-muted-foreground">HOLD</div>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-2 text-center">
              <div className="text-lg font-bold text-amber-500">{decisionStats.blocked}</div>
              <div className="text-[9px] text-muted-foreground">BLOCKED</div>
            </div>
          </div>
          
          {decisionStats.topReasons.length > 0 && (
            <div className="text-[10px] text-muted-foreground">
              <span className="text-primary">Top hold reasons:</span>{' '}
              {decisionStats.topReasons.join(', ')}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Agent Inactivity Tile - Shows active vs inactive breakdown
export function AgentInactivityTile({ compact }: { compact?: boolean }) {
  const { data: systemState } = useSystemState();
  const { data: cohortCount = 0 } = useCohortCount(systemState?.current_generation_id ?? null);
  
  const { data: activityData, isLoading } = useQuery({
    queryKey: ['agent-activity-summary', systemState?.current_generation_id],
    queryFn: async () => {
      if (!systemState?.current_generation_id) return null;
      
      // Get unique agents who have traded this generation (excluding test_mode)
      const { data: orders } = await supabase
        .from('paper_orders')
        .select('agent_id, tags')
        .eq('generation_id', systemState.current_generation_id)
        .eq('status', 'filled')
        .not('agent_id', 'is', null);
      
      // Filter out test_mode orders
      const learnableOrders = (orders || []).filter(o => {
        const tags = o.tags as any;
        return !tags?.test_mode;
      });
      
      const uniqueAgents = new Set(learnableOrders.map(o => o.agent_id));
      
      // Get strategy breakdown for trading agents
      if (uniqueAgents.size > 0) {
        const { data: agents } = await supabase
          .from('agents')
          .select('strategy_template')
          .in('id', Array.from(uniqueAgents));
        
        const strategyBreakdown = (agents || []).reduce((acc, a) => {
          acc[a.strategy_template] = (acc[a.strategy_template] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        
        return {
          activeCount: uniqueAgents.size,
          strategyBreakdown,
        };
      }
      
      return { activeCount: 0, strategyBreakdown: {} };
    },
    enabled: !!systemState?.current_generation_id,
    refetchInterval: 60000,
  });
  
  const activeCount = activityData?.activeCount || 0;
  const inactiveCount = cohortCount - activeCount;
  const activePct = cohortCount > 0 ? (activeCount / cohortCount) * 100 : 0;
  const strategyBreakdown = activityData?.strategyBreakdown || {};
  
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground uppercase tracking-wider">
        <Users className="h-4 w-4 text-primary" />
        Agent Activity
        <Badge variant="outline" className="text-[8px] px-1 py-0 ml-auto">LIVE</Badge>
      </div>
      
      {isLoading ? (
        <div className="text-xs text-muted-foreground animate-pulse">Loading...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-success/10 border border-success/20 rounded-lg p-2 space-y-1">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Activity className="h-3 w-3" />
                Trading
              </div>
              <div className="font-mono text-lg font-bold text-success">{activeCount}</div>
              <div className="text-[9px] text-success/70">{activePct.toFixed(0)}% of cohort</div>
            </div>
            
            <div className="bg-muted/30 rounded-lg p-2 space-y-1">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Gauge className="h-3 w-3" />
                Holding
              </div>
              <div className="font-mono text-lg font-bold">{inactiveCount}</div>
              <div className="text-[9px] text-muted-foreground">{(100 - activePct).toFixed(0)}% waiting</div>
            </div>
          </div>
          
          {Object.keys(strategyBreakdown).length > 0 && (
            <div className="text-[10px] space-y-0.5">
              <div className="text-muted-foreground mb-1">By strategy:</div>
              {Object.entries(strategyBreakdown).map(([strat, count]) => (
                <div key={strat} className="flex justify-between">
                  <span className="text-muted-foreground">{strat.replace('_', ' ')}</span>
                  <span className="font-mono">{count}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Symbol Coverage Tile - Shows trading concentration and strategies
export function SymbolCoverageTile({ compact }: { compact?: boolean }) {
  const { data: systemState } = useSystemState();
  
  const { data: coverageData, isLoading } = useQuery({
    queryKey: ['symbol-coverage', systemState?.current_generation_id],
    queryFn: async () => {
      if (!systemState?.current_generation_id) return null;
      
      // Get filled orders for this generation (excluding test_mode)
      const { data: orders } = await supabase
        .from('paper_orders')
        .select('symbol, agent_id, tags')
        .eq('generation_id', systemState.current_generation_id)
        .eq('status', 'filled');
      
      // Filter out test_mode orders
      const learnableOrders = (orders || []).filter(o => {
        const tags = o.tags as any;
        return !tags?.test_mode;
      });
      
      if (learnableOrders.length === 0) {
        return { uniqueSymbols: 0, topSymbols: [], concentration: { top1: 0, top3: 0, top5: 0 }, strategyBySymbol: {} };
      }
      
      // Count fills per symbol
      const symbolCounts: Record<string, number> = {};
      const symbolAgents: Record<string, Set<string>> = {};
      
      for (const o of learnableOrders) {
        symbolCounts[o.symbol] = (symbolCounts[o.symbol] || 0) + 1;
        if (!symbolAgents[o.symbol]) symbolAgents[o.symbol] = new Set();
        if (o.agent_id) symbolAgents[o.symbol].add(o.agent_id);
      }
      
      const totalFills = learnableOrders.length;
      const uniqueSymbols = Object.keys(symbolCounts).length;
      
      // Sort by count descending
      const sorted = Object.entries(symbolCounts)
        .sort((a, b) => b[1] - a[1]);
      
      const topSymbols = sorted.slice(0, 10).map(([symbol, count]) => ({
        symbol,
        count,
        pct: (count / totalFills) * 100,
      }));
      
      // Concentration metrics
      const top1Pct = sorted[0] ? (sorted[0][1] / totalFills) * 100 : 0;
      const top3Total = sorted.slice(0, 3).reduce((sum, [, c]) => sum + c, 0);
      const top3Pct = (top3Total / totalFills) * 100;
      const top5Total = sorted.slice(0, 5).reduce((sum, [, c]) => sum + c, 0);
      const top5Pct = (top5Total / totalFills) * 100;
      
      // Get strategy breakdown for top symbols
      const allAgentIds = new Set(learnableOrders.map(o => o.agent_id).filter(Boolean));
      let strategyBySymbol: Record<string, Record<string, number>> = {};
      
      if (allAgentIds.size > 0) {
        const { data: agents } = await supabase
          .from('agents')
          .select('id, strategy_template')
          .in('id', Array.from(allAgentIds));
        
        const agentStrategyMap = new Map((agents || []).map(a => [a.id, a.strategy_template]));
        
        // Build strategy counts per symbol
        for (const o of learnableOrders) {
          if (!o.agent_id) continue;
          const strategy = agentStrategyMap.get(o.agent_id);
          if (!strategy) continue;
          
          if (!strategyBySymbol[o.symbol]) strategyBySymbol[o.symbol] = {};
          strategyBySymbol[o.symbol][strategy] = (strategyBySymbol[o.symbol][strategy] || 0) + 1;
        }
      }
      
      return {
        uniqueSymbols,
        topSymbols,
        concentration: { top1: top1Pct, top3: top3Pct, top5: top5Pct },
        strategyBySymbol,
      };
    },
    enabled: !!systemState?.current_generation_id,
    refetchInterval: 60000,
  });
  
  const getDominantStrategy = (symbol: string) => {
    const strategies = coverageData?.strategyBySymbol?.[symbol];
    if (!strategies) return null;
    const sorted = Object.entries(strategies).sort((a, b) => b[1] - a[1]);
    return sorted[0]?.[0]?.replace('_', ' ') || null;
  };
  
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground uppercase tracking-wider">
        <PieChart className="h-4 w-4 text-primary" />
        Symbol Coverage
        <Badge variant="outline" className="text-[8px] px-1 py-0 ml-auto">LIVE</Badge>
      </div>
      
      {isLoading || !coverageData ? (
        <div className="text-xs text-muted-foreground animate-pulse">Loading...</div>
      ) : coverageData.uniqueSymbols === 0 ? (
        <div className="text-xs text-muted-foreground">No fills this generation</div>
      ) : (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-4 gap-2">
            <div className="bg-muted/30 rounded-lg p-2 text-center">
              <div className="text-lg font-bold">{coverageData.uniqueSymbols}</div>
              <div className="text-[9px] text-muted-foreground">Symbols</div>
            </div>
            <div className="bg-muted/30 rounded-lg p-2 text-center">
              <div className="text-lg font-bold">{coverageData.concentration.top1.toFixed(0)}%</div>
              <div className="text-[9px] text-muted-foreground">Top 1</div>
            </div>
            <div className="bg-muted/30 rounded-lg p-2 text-center">
              <div className="text-lg font-bold">{coverageData.concentration.top3.toFixed(0)}%</div>
              <div className="text-[9px] text-muted-foreground">Top 3</div>
            </div>
            <div className="bg-muted/30 rounded-lg p-2 text-center">
              <div className="text-lg font-bold">{coverageData.concentration.top5.toFixed(0)}%</div>
              <div className="text-[9px] text-muted-foreground">Top 5</div>
            </div>
          </div>
          
          {/* Top symbols list */}
          <div className="space-y-1.5 max-h-[120px] overflow-y-auto">
            {coverageData.topSymbols.slice(0, 5).map(({ symbol, count, pct }) => {
              const dominantStrategy = getDominantStrategy(symbol);
              return (
                <div key={symbol} className="flex items-center gap-2 text-[10px]">
                  <span className="font-mono w-16 truncate">{symbol.replace('-USD', '')}</span>
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary/60 rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="font-mono w-8 text-right text-muted-foreground">{count}</span>
                  {dominantStrategy && (
                    <Badge variant="outline" className="text-[8px] px-1 py-0 h-4">{dominantStrategy}</Badge>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
