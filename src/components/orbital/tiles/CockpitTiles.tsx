import React from 'react';
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
import { useDroughtState } from '@/hooks/useDroughtState';
import { SystemStatus } from '@/types/evotrader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  PieChart,
  Eye,
  Flame,
  Globe,
  Unlock,
  Wrench,
  AlertTriangle,
  Megaphone,
  Scale,
  Handshake,
  Skull,
  AlertCircle,
  LogOut,
  CheckCircle,
  XCircle,
  HelpCircle,
  Droplets
} from 'lucide-react';
import { useGenOrdersCount, useCohortCount } from '@/hooks/useGenOrders';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useNewsFeed } from '@/hooks/useNewsFeed';
import { useMissedMoves } from '@/hooks/useMissedMoves';
import { useExitEfficiency } from '@/hooks/useExitEfficiency';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

// Drought Monitor Tile - Shows signal drought state and gate failures with override controls
export function DroughtMonitorTile({ compact }: { compact?: boolean }) {
  const { data: droughtState, isLoading, refetch } = useDroughtState();
  const [isUpdating, setIsUpdating] = React.useState(false);
  
  const getStatusColor = () => {
    if (!droughtState) return 'text-muted-foreground';
    if (droughtState.killed) return 'text-destructive';
    if (droughtState.blocked) return 'text-amber-500';
    if (droughtState.isActive) return 'text-primary';
    return 'text-emerald-500';
  };
  
  const getStatusLabel = () => {
    if (!droughtState) return 'LOADING';
    if (droughtState.killed) return `KILLED: ${droughtState.killReason}`;
    if (droughtState.blocked) return `BLOCKED: ${droughtState.blockReason}`;
    if (droughtState.isActive) return 'DROUGHT ACTIVE';
    return 'NORMAL';
  };
  
  const handleOverrideChange = async (newOverride: 'auto' | 'force_off' | 'force_on') => {
    setIsUpdating(true);
    try {
      // Get current config
      const { data: configData } = await supabase
        .from('system_config')
        .select('id, config')
        .limit(1)
        .single();
      
      if (configData) {
        const currentConfig = (configData.config ?? {}) as Record<string, unknown>;
        await supabase
          .from('system_config')
          .update({ 
            config: { ...currentConfig, drought_override: newOverride },
            updated_at: new Date().toISOString(),
          })
          .eq('id', configData.id);
      }
      refetch();
    } finally {
      setIsUpdating(false);
    }
  };
  
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground uppercase tracking-wider">
        <Droplets className="h-4 w-4 text-primary" />
        Signal Drought
        <Badge variant="outline" className="text-[8px] px-1 py-0 ml-auto">LIVE</Badge>
      </div>
      
      {isLoading || !droughtState ? (
        <div className="text-xs text-muted-foreground animate-pulse">Loading...</div>
      ) : (
        <>
          {/* Status + Override */}
          <div className="flex items-center justify-between">
            <div className={`text-[10px] font-mono ${getStatusColor()} flex items-center gap-1`}>
              <span className={cn("w-1.5 h-1.5 rounded-full bg-current", droughtState.isActive && !droughtState.blocked && "animate-pulse")} />
              {getStatusLabel()}
            </div>
            
            {/* Override toggle */}
            <div className="flex gap-1">
              {(['auto', 'force_off', 'force_on'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => handleOverrideChange(mode)}
                  disabled={isUpdating}
                  className={cn(
                    "text-[8px] px-1.5 py-0.5 rounded font-mono transition-colors",
                    droughtState.override === mode 
                      ? "bg-primary text-primary-foreground" 
                      : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                  )}
                >
                  {mode === 'auto' ? 'AUTO' : mode === 'force_off' ? 'OFF' : 'ON'}
                </button>
              ))}
            </div>
          </div>
          
          {/* Cooldown warning */}
          {droughtState.cooldownUntil && (
            <div className="text-[10px] text-amber-500 font-mono">
              ⏱ Cooldown until {new Date(droughtState.cooldownUntil).toLocaleTimeString()}
            </div>
          )}
          
          {/* Equity drawdown (true P&L based) */}
          {droughtState.equityDrawdownPct !== undefined && (
            <div className={cn(
              "text-[10px] font-mono",
              droughtState.equityDrawdownPct > 1.5 ? 'text-amber-500' : 
              droughtState.equityDrawdownPct > 0 ? 'text-muted-foreground' : 'text-emerald-500'
            )}>
              Equity Drawdown: {droughtState.equityDrawdownPct.toFixed(2)}%
              {droughtState.equityDrawdownPct > 1.5 && ' ⚠️ approaching kill'}
            </div>
          )}
          
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-muted/30 rounded-lg p-2 space-y-1">
              <div className="text-[10px] text-muted-foreground">6h Window</div>
              <div className="font-mono text-sm">
                <span className="text-muted-foreground">{droughtState.shortWindowHolds}</span>
                <span className="text-[10px] text-muted-foreground mx-1">holds</span>
                <span className="text-primary">{droughtState.shortWindowOrders}</span>
                <span className="text-[10px] text-muted-foreground ml-1">orders</span>
              </div>
            </div>
            
            <div className="bg-muted/30 rounded-lg p-2 space-y-1">
              <div className="text-[10px] text-muted-foreground">48h Window</div>
              <div className="font-mono text-sm">
                <span className="text-muted-foreground">{droughtState.longWindowHolds}</span>
                <span className="text-[10px] text-muted-foreground mx-1">holds</span>
                <span className="text-primary">{droughtState.longWindowOrders}</span>
                <span className="text-[10px] text-muted-foreground ml-1">orders</span>
              </div>
            </div>
          </div>
          
          {droughtState.nearestPass && (
            <div className="text-[10px] text-muted-foreground">
              <span className="text-amber-500">Nearest pass:</span>{' '}
              <span className="font-mono">{droughtState.nearestPass.gate}</span>
              <span className="ml-1">({droughtState.nearestPass.margin.toFixed(4)} from threshold)</span>
            </div>
          )}
          
          {Object.keys(droughtState.gateFailures).length > 0 && (
            <div className="flex flex-wrap gap-1">
              {Object.entries(droughtState.gateFailures).slice(0, 3).map(([gate, stats]) => (
                <Badge key={gate} variant="secondary" className="text-[9px] px-1 py-0">
                  {gate}: {stats.count}×
                </Badge>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

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

// Decision Log Tile - Shows recent HOLD/BUY/SELL decisions with interpretive context
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
      
      if (!events?.length) return { buy: 0, sell: 0, hold: 0, blocked: 0, topReasons: [], total: 0 };
      
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
      
      return { buy, sell, hold, blocked, topReasons, total: events.length };
    },
    enabled: !!systemState?.current_generation_id,
    refetchInterval: 30000,
  });
  
  // Interpretive signals
  const getSignalQuality = () => {
    if (!decisionStats || decisionStats.total === 0) return null;
    const actionRate = ((decisionStats.buy + decisionStats.sell) / decisionStats.total) * 100;
    
    if (actionRate >= 10) return { label: 'HIGH CONVICTION', color: 'text-success', desc: 'System finding opportunities' };
    if (actionRate >= 3) return { label: 'SELECTIVE', color: 'text-primary', desc: 'Disciplined signal filtering' };
    if (actionRate >= 1) return { label: 'CAUTIOUS', color: 'text-amber-500', desc: 'Few setups passing thresholds' };
    return { label: 'SIGNAL DROUGHT', color: 'text-muted-foreground', desc: 'Market conditions not aligning' };
  };
  
  const signalQuality = getSignalQuality();
  
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
          {/* Interpretive signal */}
          {signalQuality && (
            <div className={`text-[10px] font-mono ${signalQuality.color}`}>
              <span className="font-bold">{signalQuality.label}</span>
              <span className="text-muted-foreground ml-1">— {signalQuality.desc}</span>
            </div>
          )}
          
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
              <span className="text-primary">Why holding:</span>{' '}
              {decisionStats.topReasons.join(', ')}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Agent Inactivity Tile - Shows active vs inactive breakdown with evolutionary context
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
      
      // Get strategy breakdown AND elite status for trading agents
      if (uniqueAgents.size > 0) {
        const { data: agents } = await supabase
          .from('agents')
          .select('id, strategy_template, is_elite')
          .in('id', Array.from(uniqueAgents));
        
        const strategyBreakdown = (agents || []).reduce((acc, a) => {
          acc[a.strategy_template] = (acc[a.strategy_template] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        
        const elitesTrading = (agents || []).filter(a => a.is_elite).length;
        
        return {
          activeCount: uniqueAgents.size,
          strategyBreakdown,
          elitesTrading,
        };
      }
      
      return { activeCount: 0, strategyBreakdown: {}, elitesTrading: 0 };
    },
    enabled: !!systemState?.current_generation_id,
    refetchInterval: 60000,
  });
  
  // Get total elite count
  const { data: totalElites = 0 } = useQuery({
    queryKey: ['elite-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('agents')
        .select('*', { count: 'exact', head: true })
        .eq('is_elite', true);
      return count || 0;
    },
  });
  
  const activeCount = activityData?.activeCount || 0;
  const inactiveCount = cohortCount - activeCount;
  const activePct = cohortCount > 0 ? (activeCount / cohortCount) * 100 : 0;
  const strategyBreakdown = activityData?.strategyBreakdown || {};
  const elitesTrading = activityData?.elitesTrading || 0;
  
  // Interpretive signals
  const getActivitySignal = () => {
    if (activePct >= 30) return { status: 'healthy', label: 'STRONG PARTICIPATION', color: 'text-success' };
    if (activePct >= 15) return { status: 'ok', label: 'NORMAL SPREAD', color: 'text-primary' };
    if (activePct >= 5) return { status: 'low', label: 'EARLY STAGE', color: 'text-amber-500' };
    return { status: 'cold', label: 'WAITING FOR SIGNALS', color: 'text-muted-foreground' };
  };
  
  const getEliteSignal = () => {
    if (totalElites === 0) return null;
    const elitePct = (elitesTrading / totalElites) * 100;
    if (elitePct >= 50) return { label: 'ELITES ACTIVE', color: 'text-success', icon: '✓' };
    if (elitePct > 0) return { label: `${elitesTrading}/${totalElites} ELITES`, color: 'text-amber-500', icon: '◐' };
    return { label: 'ELITES DORMANT', color: 'text-muted-foreground', icon: '○' };
  };
  
  const activitySignal = getActivitySignal();
  const eliteSignal = getEliteSignal();
  
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
          {/* Status signal */}
          <div className={`text-[10px] font-mono ${activitySignal.color} flex items-center gap-1`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
            {activitySignal.label}
          </div>
          
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
          
          {/* Elite activation signal */}
          {eliteSignal && (
            <div className={`text-[10px] font-mono ${eliteSignal.color} flex items-center gap-1 bg-muted/20 rounded px-2 py-1`}>
              <span>{eliteSignal.icon}</span>
              {eliteSignal.label}
              <span className="text-muted-foreground ml-1">— proven agents from prior gen</span>
            </div>
          )}
          
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

// ============================================
// CATALYST WATCH TILE (formerly side Intake widget)
// ============================================

function formatTimeAgo(dateStr: string): string {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: false })
      .replace('about ', '')
      .replace(' minutes', 'm')
      .replace(' minute', 'm')
      .replace(' hours', 'h')
      .replace(' hour', 'h')
      .replace(' days', 'd')
      .replace(' day', 'd')
      .replace('less than a', '<1');
  } catch {
    return '';
  }
}

function detectEventType(title: string): { icon: React.ReactNode; label: string; color: string } | null {
  const lower = title.toLowerCase();
  
  if (lower.includes('unlock') || lower.includes('vesting') || lower.includes('emission')) {
    return { icon: <Unlock className="h-3 w-3" />, label: 'unlock', color: 'text-amber-400' };
  }
  if (lower.includes('upgrade') || lower.includes('mainnet') || lower.includes('fork')) {
    return { icon: <Wrench className="h-3 w-3" />, label: 'upgrade', color: 'text-blue-400' };
  }
  if (lower.includes('outage') || lower.includes('bug') || lower.includes('exploit') || lower.includes('hack')) {
    return { icon: <AlertTriangle className="h-3 w-3" />, label: 'outage', color: 'text-red-400' };
  }
  if (lower.includes('listing') || lower.includes('delist') || lower.includes('binance') || lower.includes('coinbase adds')) {
    return { icon: <Megaphone className="h-3 w-3" />, label: 'listing', color: 'text-green-400' };
  }
  if (lower.includes('sec') || lower.includes('regulation') || lower.includes('lawsuit') || lower.includes('fine') || lower.includes('investigation')) {
    return { icon: <Scale className="h-3 w-3" />, label: 'legal', color: 'text-red-400' };
  }
  if (lower.includes('whale') || lower.includes('transfer') || lower.includes('moved') || lower.includes('wallet')) {
    return { icon: <Scale className="h-3 w-3" />, label: 'whale', color: 'text-purple-400' };
  }
  if (lower.includes('governance') || lower.includes('vote') || lower.includes('proposal') || lower.includes('dao')) {
    return { icon: <Scale className="h-3 w-3" />, label: 'gov', color: 'text-cyan-400' };
  }
  if (lower.includes('partner') || lower.includes('collab') || lower.includes('integration') || lower.includes('launch')) {
    return { icon: <Handshake className="h-3 w-3" />, label: 'partner', color: 'text-emerald-400' };
  }
  
  return null;
}

export function CatalystWatchTile({ compact }: { compact?: boolean }) {
  const { data: newsData, isLoading } = useNewsFeed();
  
  const newsIntensity = newsData?.news_intensity || {};
  const botSymbols = newsData?.bot_symbols || [];
  const catalystNews = (newsData?.bot_lane || []).slice(0, 6);
  const marketNews = (newsData?.market_lane || [])
    .filter((n: any) => !catalystNews.some((c: any) => c.id === n.id))
    .slice(0, 4);
  
  const hotSymbols = Object.entries(newsIntensity)
    .filter(([_, count]) => (count as number) >= 2)
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .slice(0, 4);
  
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground uppercase tracking-wider">
        <Eye className="h-4 w-4 text-primary" />
        Catalyst Watch
        {hotSymbols.length > 0 && (
          <div className="flex items-center gap-1">
            <Flame className="h-3.5 w-3.5 text-orange-500" />
            {hotSymbols.slice(0, 2).map(([symbol]) => (
              <Badge 
                key={symbol}
                variant="outline"
                className="text-[9px] px-1.5 py-0 h-4 font-mono border-orange-500/30 text-orange-400"
              >
                {symbol.replace('-USD', '')}
              </Badge>
            ))}
          </div>
        )}
        <Badge variant="outline" className="text-[8px] px-1 py-0 ml-auto">LIVE</Badge>
      </div>
      
      {isLoading ? (
        <div className="text-xs text-muted-foreground animate-pulse">Loading catalysts...</div>
      ) : (
        <ScrollArea className="h-[200px]">
          <div className="space-y-2">
            {/* Catalyst Watch (Strict) */}
            {catalystNews.length > 0 ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-[10px] text-primary/80 uppercase tracking-wide font-medium px-1 border-b border-border/30 pb-1">
                  <Eye className="h-3 w-3" />
                  <span>Monitored Symbols</span>
                  <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 ml-auto border-primary/30">
                    {catalystNews.length}
                  </Badge>
                </div>
                {catalystNews.map((n: any) => {
                  const eventType = detectEventType(n.title);
                  const symbols = n.symbols || [];
                  const timeAgo = formatTimeAgo(n.published_at);
                  
                  return (
                    <a
                      key={n.id}
                      href={n.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex flex-col gap-1 p-2 rounded-md bg-primary/5 hover:bg-primary/10 transition-colors group border border-primary/10 hover:border-primary/20"
                    >
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {symbols.slice(0, 2).map((s: string) => (
                          <Badge 
                            key={s} 
                            variant="secondary"
                            className="text-[10px] px-1.5 py-0 h-4 font-mono font-semibold"
                          >
                            {s.replace('-USD', '')}
                          </Badge>
                        ))}
                        {eventType && (
                          <span className={`flex items-center gap-0.5 text-[9px] ${eventType.color}`}>
                            {eventType.icon}
                            <span>{eventType.label}</span>
                          </span>
                        )}
                        <span className="text-[9px] text-muted-foreground/60 ml-auto">{timeAgo}</span>
                      </div>
                      <p className="text-[11px] leading-snug text-foreground/80 line-clamp-2 group-hover:text-primary transition-colors">
                        {n.title}
                      </p>
                    </a>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-2 px-2 bg-muted/20 rounded-md">
                <div className="text-[10px] text-muted-foreground/60">No monitored-coin catalysts detected</div>
                {botSymbols.length > 0 && (
                  <div className="text-[9px] text-muted-foreground/40 mt-0.5">
                    Watching: {botSymbols.slice(0, 5).map((s: string) => s.replace('-USD', '')).join(', ')}
                    {botSymbols.length > 5 && ` +${botSymbols.length - 5}`}
                  </div>
                )}
              </div>
            )}
            
            {/* Market Context (Fallback) */}
            {marketNews.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60 uppercase tracking-wide px-1 border-b border-border/20 pb-1">
                  <Globe className="h-3 w-3" />
                  <span>Market Context</span>
                </div>
                {marketNews.map((n: any) => {
                  const timeAgo = formatTimeAgo(n.published_at);
                  return (
                    <a
                      key={n.id}
                      href={n.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex flex-col gap-0.5 p-1.5 rounded bg-muted/20 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] text-muted-foreground/40 ml-auto">{timeAgo}</span>
                      </div>
                      <p className="text-[10px] leading-snug text-foreground/60 line-clamp-1 hover:text-foreground/80">
                        {n.title}
                      </p>
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

// ============================================
// AUTOPSY TILE (formerly side Autopsy widget)
// ============================================

function formatDecisionReason(reason: string | null): string {
  if (!reason) return '';
  if (reason.length > 40) return reason.slice(0, 37) + '...';
  return reason;
}

export function AutopsyTile({ compact }: { compact?: boolean }) {
  const { data: missedData, isLoading: missedLoading } = useMissedMoves();
  const { data: exitData, isLoading: exitLoading } = useExitEfficiency(24);
  
  const missedMoves = missedData?.missed_moves || [];
  const pumpThreshold = missedData?.thresholds?.pump || 5;
  const dumpThreshold = missedData?.thresholds?.dump || -5;
  
  const strictMisses = missedMoves.filter((m: any) => 
    Math.abs(m.change_24h) >= Math.max(Math.abs(pumpThreshold), Math.abs(dumpThreshold))
  );
  
  const exits = exitData?.exits || [];
  const avgMissedPct = exitData?.avg_missed_profit_pct || 0;
  const exitCount = exitData?.exit_count || 0;
  
  const goodExits = exits.filter((e: any) => e.was_profitable_exit);
  const missedProfitExits = exits.filter((e: any) => !e.was_profitable_exit && e.missed_profit_pct > 1);
  
  const isLoading = missedLoading || exitLoading;
  
  // Diagnostic signal
  const getDiagnosticSignal = () => {
    const hasExitIssues = missedProfitExits.length > 2 || avgMissedPct > 3;
    const hasMissedMoves = strictMisses.length > 2;
    
    if (hasExitIssues && hasMissedMoves) {
      return { label: 'NEEDS ATTENTION', color: 'text-destructive', desc: 'Exit timing and signal gaps detected' };
    }
    if (hasExitIssues) {
      return { label: 'EXIT REVIEW', color: 'text-amber-500', desc: 'Some early exits left profit on table' };
    }
    if (hasMissedMoves) {
      return { label: 'SIGNAL GAPS', color: 'text-amber-500', desc: 'Large moves without agent participation' };
    }
    if (exitCount > 0 && goodExits.length === exitCount) {
      return { label: 'CLEAN EXECUTION', color: 'text-success', desc: 'All exits well-timed' };
    }
    return { label: 'NOMINAL', color: 'text-muted-foreground', desc: 'No major issues detected' };
  };
  
  const signal = getDiagnosticSignal();
  
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground uppercase tracking-wider">
        <Skull className="h-4 w-4 text-amber-500" />
        Performance Autopsy
        {strictMisses.length > 0 && (
          <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-4 font-mono">
            {strictMisses.length} miss{strictMisses.length !== 1 ? 'es' : ''}
          </Badge>
        )}
        <Badge variant="outline" className="text-[8px] px-1 py-0 ml-auto">24h</Badge>
      </div>
      
      {isLoading ? (
        <div className="text-xs text-muted-foreground animate-pulse">Loading diagnostics...</div>
      ) : (
        <>
          {/* Diagnostic signal */}
          <div className={`text-[10px] font-mono ${signal.color}`}>
            <span className="font-bold">{signal.label}</span>
            <span className="text-muted-foreground ml-1">— {signal.desc}</span>
          </div>
          
          <ScrollArea className="h-[180px]">
            <div className="space-y-3">
              {/* Exit Efficiency Summary */}
              {exitCount > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[10px] text-amber-400/80 uppercase tracking-wide font-medium px-1 border-b border-amber-500/20 pb-1">
                    <LogOut className="h-3 w-3" />
                    <span>Exit Efficiency</span>
                    <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 ml-auto border-amber-500/30 text-amber-400">
                      {exitCount} exits
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 px-2 py-1.5 rounded bg-amber-500/10 border border-amber-500/20">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] text-muted-foreground">Avg:</span>
                      <span className={cn(
                        "text-[11px] font-mono font-medium",
                        avgMissedPct > 1 ? "text-red-400" : avgMissedPct < -1 ? "text-emerald-400" : "text-muted-foreground"
                      )}>
                        {avgMissedPct >= 0 ? '+' : ''}{avgMissedPct.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CheckCircle className="h-3 w-3 text-emerald-400/60" />
                      <span className="text-[10px] text-emerald-400/80">{goodExits.length} good</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <XCircle className="h-3 w-3 text-red-400/60" />
                      <span className="text-[10px] text-red-400/80">{missedProfitExits.length} early</span>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Missed Moves */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-[10px] text-red-400/80 uppercase tracking-wide font-medium px-1 border-b border-red-500/20 pb-1">
                  <AlertCircle className="h-3 w-3" />
                  <span>Missed Moves (≥{pumpThreshold}%)</span>
                  <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 ml-auto border-red-500/30 text-red-400">
                    {strictMisses.length}
                  </Badge>
                </div>
                
                {strictMisses.length > 0 ? (
                  <div className="space-y-1">
                    {strictMisses.slice(0, 4).map((m: any) => {
                      const reason = formatDecisionReason(m.last_decision_reason);
                      return (
                        <div
                          key={m.symbol}
                          className="grid grid-cols-[1fr_50px_60px] gap-2 items-center px-2 py-1.5 rounded bg-red-500/10 border border-red-500/20"
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
                          <Badge 
                            variant={m.last_decision === 'BUY' ? 'default' : m.last_decision === 'SELL' ? 'destructive' : 'secondary'}
                            className="text-[9px] px-1.5 py-0 h-4 font-mono"
                          >
                            {m.last_decision || 'no eval'}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-2 px-2 bg-muted/20 rounded-md">
                    <div className="text-[10px] text-muted-foreground/60">None — no large moves without signal</div>
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
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
  
  // Interpretive signals
  const getDiversitySignal = () => {
    if (!coverageData || coverageData.uniqueSymbols === 0) return null;
    const { uniqueSymbols, concentration } = coverageData;
    
    // Fixation warning: >60% in top 1 symbol
    if (concentration.top1 > 60) {
      return { 
        status: 'warning', 
        label: 'FIXATION RISK', 
        color: 'text-amber-500',
        desc: 'Heavy concentration in one symbol — diversity penalty will apply'
      };
    }
    
    // Good spread: 5+ symbols with reasonable distribution
    if (uniqueSymbols >= 5 && concentration.top3 < 80) {
      return { 
        status: 'healthy', 
        label: 'HEALTHY SPREAD', 
        color: 'text-success',
        desc: 'Good opportunity discovery across symbols'
      };
    }
    
    // Early exploration
    if (uniqueSymbols >= 3) {
      return { 
        status: 'ok', 
        label: 'EXPLORING', 
        color: 'text-primary',
        desc: 'Building diversity — evolution will favor broader coverage'
      };
    }
    
    // Limited
    return { 
      status: 'limited', 
      label: 'NARROW FOCUS', 
      color: 'text-muted-foreground',
      desc: 'Few symbols traded — may limit evolutionary signal quality'
    };
  };
  
  const diversitySignal = getDiversitySignal();
  
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
        <div className="text-xs text-muted-foreground">No fills this generation — awaiting first trades</div>
      ) : (
        <>
          {/* Interpretive signal */}
          {diversitySignal && (
            <div className={`text-[10px] font-mono ${diversitySignal.color}`}>
              <span className="font-bold">{diversitySignal.label}</span>
              <span className="text-muted-foreground ml-1">— {diversitySignal.desc}</span>
            </div>
          )}
          
          {/* KPI row */}
          <div className="grid grid-cols-4 gap-2">
            <div className="bg-muted/30 rounded-lg p-2 text-center">
              <div className="text-lg font-bold">{coverageData.uniqueSymbols}</div>
              <div className="text-[9px] text-muted-foreground">Symbols</div>
            </div>
            <div className={`rounded-lg p-2 text-center ${coverageData.concentration.top1 > 60 ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-muted/30'}`}>
              <div className={`text-lg font-bold ${coverageData.concentration.top1 > 60 ? 'text-amber-500' : ''}`}>{coverageData.concentration.top1.toFixed(0)}%</div>
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
