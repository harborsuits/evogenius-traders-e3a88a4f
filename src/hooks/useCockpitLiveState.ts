import { useEffect, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// ============================================
// UNIFIED COCKPIT LIVE STATE
// Single source of truth for all cockpit tiles
// ============================================

export interface AccountSnapshot {
  id: string;
  cash: number;
  startingCash: number;
  equity: number;
  pnl: number;
  pnlPct: number;
  peakEquity: number;
  positions: PositionSnapshot[];
  lastUpdated: string;
}

export interface PositionSnapshot {
  symbol: string;
  qty: number;
  avgEntryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  realizedPnl: number;
}

export interface GenerationState {
  id: string | null;
  number: number;
  isActive: boolean;
  startTime: string;
  elapsedHours: number;
  totalTrades: number;
  totalPnl: number;
  maxDrawdown: number;
  avgFitness: number | null;
  regimeTag: string | null;
  terminationReason: string | null;
  lastUpdated: string;
}

export interface AgentActivityState {
  totalAgents: number;
  eliteCount: number;
  activeTrading: number;
  holdingCount: number;
  strategyBreakdown: Record<string, number>;
  lastUpdated: string;
}

export interface ShadowStatsState {
  todayCount: number;
  pendingCount: number;
  calculatedLast24h: number;
  avgPnlPct: number | null;
  oldestPendingAge: number | null;
  lastCalcTimestamp: string | null;
  lastUpdated: string;
}

export interface DecisionStatsState {
  buyCount: number;
  sellCount: number;
  holdCount: number;
  blockedCount: number;
  topHoldReasons: string[];
  lastDecisionTime: string | null;
  lastUpdated: string;
}

export interface SystemHealthState {
  status: 'running' | 'paused' | 'stopped' | 'error';
  tradeMode: 'paper' | 'live';
  liveArmedUntil: string | null;
  lastUpdated: string;
}

export interface StalenessInfo {
  account: { stale: boolean; ageSeconds: number };
  generation: { stale: boolean; ageSeconds: number };
  agents: { stale: boolean; ageSeconds: number };
  shadow: { stale: boolean; ageSeconds: number };
  decisions: { stale: boolean; ageSeconds: number };
  system: { stale: boolean; ageSeconds: number };
}

export interface CockpitLiveState {
  account: AccountSnapshot | null;
  generation: GenerationState | null;
  agents: AgentActivityState | null;
  shadow: ShadowStatsState | null;
  decisions: DecisionStatsState | null;
  system: SystemHealthState | null;
  staleness: StalenessInfo;
  isLoading: boolean;
  refetchAll: () => void;
}

// Staleness thresholds in seconds
const STALE_THRESHOLDS = {
  account: 120,    // 2 minutes
  generation: 300, // 5 minutes
  agents: 120,     // 2 minutes
  shadow: 120,     // 2 minutes
  decisions: 120,  // 2 minutes
  system: 60,      // 1 minute
};

function calculateAge(timestamp: string | null): number {
  if (!timestamp) return Infinity;
  return Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
}

export function useCockpitLiveState(): CockpitLiveState {
  const queryClient = useQueryClient();

  // ============================================
  // ACCOUNT SNAPSHOT (polling - external truth)
  // ============================================
  const accountQuery = useQuery({
    queryKey: ['cockpit-account'],
    queryFn: async (): Promise<AccountSnapshot | null> => {
      const { data: account, error: accountError } = await supabase
        .from('paper_accounts')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (accountError) throw accountError;
      if (!account) return null;

      const { data: positions } = await supabase
        .from('paper_positions')
        .select('*')
        .eq('account_id', account.id);

      const { data: marketData } = await supabase
        .from('market_data')
        .select('symbol, price');

      const priceMap = new Map((marketData || []).map(m => [m.symbol, m.price]));
      
      const positionSnapshots: PositionSnapshot[] = (positions || []).map(pos => {
        const currentPrice = priceMap.get(pos.symbol) ?? pos.avg_entry_price;
        const unrealizedPnl = pos.qty * (currentPrice - pos.avg_entry_price);
        return {
          symbol: pos.symbol,
          qty: pos.qty,
          avgEntryPrice: pos.avg_entry_price,
          currentPrice,
          unrealizedPnl,
          realizedPnl: pos.realized_pnl,
        };
      });

      const totalPositionValue = positionSnapshots.reduce(
        (sum, p) => sum + (p.qty * p.currentPrice), 0
      );
      const equity = account.cash + totalPositionValue;
      const pnl = equity - account.starting_cash;
      const pnlPct = account.starting_cash > 0 ? (pnl / account.starting_cash) * 100 : 0;

      return {
        id: account.id,
        cash: account.cash,
        startingCash: account.starting_cash,
        equity,
        pnl,
        pnlPct,
        peakEquity: account.peak_equity,
        positions: positionSnapshots.filter(p => p.qty !== 0),
        lastUpdated: account.updated_at,
      };
    },
    refetchInterval: 15000, // Poll every 15s
    staleTime: 10000,
  });

  // ============================================
  // GENERATION STATE
  // ============================================
  const generationQuery = useQuery({
    queryKey: ['cockpit-generation'],
    queryFn: async (): Promise<GenerationState | null> => {
      const { data: systemState } = await supabase
        .from('system_state')
        .select('current_generation_id')
        .limit(1)
        .maybeSingle();

      if (!systemState?.current_generation_id) return null;

      const { data: gen } = await supabase
        .from('generations')
        .select('*')
        .eq('id', systemState.current_generation_id)
        .maybeSingle();

      if (!gen) return null;

      const elapsedMs = Date.now() - new Date(gen.start_time).getTime();
      const elapsedHours = elapsedMs / (1000 * 60 * 60);

      return {
        id: gen.id,
        number: gen.generation_number,
        isActive: gen.is_active,
        startTime: gen.start_time,
        elapsedHours,
        totalTrades: gen.total_trades,
        totalPnl: gen.total_pnl,
        maxDrawdown: gen.max_drawdown,
        avgFitness: gen.avg_fitness,
        regimeTag: gen.regime_tag,
        terminationReason: gen.termination_reason,
        lastUpdated: gen.created_at,
      };
    },
    refetchInterval: 30000,
    staleTime: 20000,
  });

  // ============================================
  // AGENT ACTIVITY STATE
  // ============================================
  const agentQuery = useQuery({
    queryKey: ['cockpit-agents', generationQuery.data?.id],
    queryFn: async (): Promise<AgentActivityState | null> => {
      const genId = generationQuery.data?.id;
      if (!genId) return null;

      // Get cohort count
      const { count: cohortCount } = await supabase
        .from('generation_agents')
        .select('*', { count: 'exact', head: true })
        .eq('generation_id', genId);

      // Get elite count
      const { count: eliteCount } = await supabase
        .from('agents')
        .select('*', { count: 'exact', head: true })
        .eq('is_elite', true);

      // Get unique trading agents this generation
      const { data: orders } = await supabase
        .from('paper_orders')
        .select('agent_id, tags')
        .eq('generation_id', genId)
        .eq('status', 'filled')
        .not('agent_id', 'is', null);

      const learnableOrders = (orders || []).filter(o => {
        const tags = o.tags as Record<string, unknown>;
        return !tags?.test_mode;
      });
      const uniqueAgentIds = [...new Set(learnableOrders.map(o => o.agent_id))];

      // Get strategy breakdown
      let strategyBreakdown: Record<string, number> = {};
      if (uniqueAgentIds.length > 0) {
        const { data: agents } = await supabase
          .from('agents')
          .select('strategy_template')
          .in('id', uniqueAgentIds);

        strategyBreakdown = (agents || []).reduce((acc, a) => {
          acc[a.strategy_template] = (acc[a.strategy_template] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
      }

      return {
        totalAgents: cohortCount || 0,
        eliteCount: eliteCount || 0,
        activeTrading: uniqueAgentIds.length,
        holdingCount: (cohortCount || 0) - uniqueAgentIds.length,
        strategyBreakdown,
        lastUpdated: new Date().toISOString(),
      };
    },
    enabled: !!generationQuery.data?.id,
    refetchInterval: 60000,
    staleTime: 30000,
  });

  // ============================================
  // SHADOW STATS STATE
  // ============================================
  const shadowQuery = useQuery({
    queryKey: ['cockpit-shadow'],
    queryFn: async (): Promise<ShadowStatsState> => {
      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const [
        todayResult,
        pendingResult,
        oldestPendingResult,
        calculatedResult,
        avgPnlResult,
        lastCalcResult,
      ] = await Promise.all([
        supabase
          .from('shadow_trades')
          .select('*', { count: 'exact', head: true })
          .gte('entry_time', todayStart.toISOString()),
        supabase
          .from('shadow_trades')
          .select('*', { count: 'exact', head: true })
          .eq('outcome_status', 'pending'),
        supabase
          .from('shadow_trades')
          .select('entry_time')
          .eq('outcome_status', 'pending')
          .order('entry_time', { ascending: true })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('shadow_trades')
          .select('*', { count: 'exact', head: true })
          .eq('outcome_status', 'calculated')
          .gte('outcome_calculated_at', last24h.toISOString()),
        supabase
          .from('shadow_trades')
          .select('simulated_pnl_pct')
          .eq('outcome_status', 'calculated')
          .gte('outcome_calculated_at', last24h.toISOString())
          .not('simulated_pnl_pct', 'is', null),
        supabase
          .from('control_events')
          .select('triggered_at')
          .eq('action', 'shadow_outcome_calc')
          .order('triggered_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      let oldestPendingAge: number | null = null;
      if (oldestPendingResult.data?.entry_time) {
        const entryTime = new Date(oldestPendingResult.data.entry_time);
        oldestPendingAge = Math.round((now.getTime() - entryTime.getTime()) / 60000);
      }

      let avgPnlPct: number | null = null;
      if (avgPnlResult.data && avgPnlResult.data.length > 0) {
        const sum = avgPnlResult.data.reduce((acc, row) => acc + (row.simulated_pnl_pct ?? 0), 0);
        avgPnlPct = sum / avgPnlResult.data.length;
      }

      return {
        todayCount: todayResult.count ?? 0,
        pendingCount: pendingResult.count ?? 0,
        calculatedLast24h: calculatedResult.count ?? 0,
        avgPnlPct,
        oldestPendingAge,
        lastCalcTimestamp: lastCalcResult.data?.triggered_at ?? null,
        lastUpdated: new Date().toISOString(),
      };
    },
    refetchInterval: 30000,
    staleTime: 15000,
  });

  // ============================================
  // DECISION STATS STATE
  // ============================================
  const decisionQuery = useQuery({
    queryKey: ['cockpit-decisions'],
    queryFn: async (): Promise<DecisionStatsState> => {
      const { data: events } = await supabase
        .from('control_events')
        .select('metadata, triggered_at')
        .eq('action', 'trade_decision')
        .order('triggered_at', { ascending: false })
        .limit(100);

      let buyCount = 0, sellCount = 0, holdCount = 0, blockedCount = 0;
      const reasonCounts: Record<string, number> = {};
      let lastDecisionTime: string | null = null;

      for (const e of events || []) {
        if (!lastDecisionTime) lastDecisionTime = e.triggered_at;
        
        const meta = e.metadata as Record<string, unknown>;
        const decision = (meta?.decision as string)?.toLowerCase();

        if (decision === 'buy') buyCount++;
        else if (decision === 'sell') sellCount++;
        else if (decision === 'hold') {
          holdCount++;
          const reasons = (meta?.top_hold_reasons || []) as string[];
          for (const r of reasons) {
            const match = r.match(/^([^:]+)/);
            if (match) {
              reasonCounts[match[1]] = (reasonCounts[match[1]] || 0) + 1;
            }
          }
        } else if (decision === 'blocked') blockedCount++;
      }

      const topHoldReasons = Object.entries(reasonCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([reason]) => reason.replace(/_/g, ' '));

      return {
        buyCount,
        sellCount,
        holdCount,
        blockedCount,
        topHoldReasons,
        lastDecisionTime,
        lastUpdated: new Date().toISOString(),
      };
    },
    refetchInterval: 30000,
    staleTime: 15000,
  });

  // ============================================
  // SYSTEM HEALTH STATE
  // ============================================
  const systemQuery = useQuery({
    queryKey: ['cockpit-system'],
    queryFn: async (): Promise<SystemHealthState | null> => {
      const { data } = await supabase
        .from('system_state')
        .select('status, trade_mode, live_armed_until, updated_at')
        .limit(1)
        .maybeSingle();

      if (!data) return null;

      return {
        status: data.status as SystemHealthState['status'],
        tradeMode: data.trade_mode as 'paper' | 'live',
        liveArmedUntil: data.live_armed_until,
        lastUpdated: data.updated_at,
      };
    },
    refetchInterval: 10000,
    staleTime: 5000,
  });

  // ============================================
  // REALTIME SUBSCRIPTIONS
  // ============================================
  useEffect(() => {
    const channel = supabase
      .channel('cockpit-realtime')
      // Paper accounts/positions for capital
      .on('postgres_changes', { event: '*', schema: 'public', table: 'paper_accounts' }, () => {
        queryClient.invalidateQueries({ queryKey: ['cockpit-account'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'paper_positions' }, () => {
        queryClient.invalidateQueries({ queryKey: ['cockpit-account'] });
      })
      // Shadow trades
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shadow_trades' }, () => {
        queryClient.invalidateQueries({ queryKey: ['cockpit-shadow'] });
      })
      // Control events (decisions, trade cycles)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'control_events' }, () => {
        queryClient.invalidateQueries({ queryKey: ['cockpit-decisions'] });
        queryClient.invalidateQueries({ queryKey: ['cockpit-shadow'] });
      })
      // Generation changes
      .on('postgres_changes', { event: '*', schema: 'public', table: 'generations' }, () => {
        queryClient.invalidateQueries({ queryKey: ['cockpit-generation'] });
      })
      // System state
      .on('postgres_changes', { event: '*', schema: 'public', table: 'system_state' }, () => {
        queryClient.invalidateQueries({ queryKey: ['cockpit-system'] });
        queryClient.invalidateQueries({ queryKey: ['cockpit-generation'] });
      })
      // Agents
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agents' }, () => {
        queryClient.invalidateQueries({ queryKey: ['cockpit-agents'] });
      })
      // Paper orders (affects agent activity)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'paper_orders' }, () => {
        queryClient.invalidateQueries({ queryKey: ['cockpit-agents'] });
        queryClient.invalidateQueries({ queryKey: ['cockpit-account'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // ============================================
  // STALENESS CALCULATION
  // ============================================
  const staleness = useMemo((): StalenessInfo => {
    const now = Date.now();
    
    const calcStale = (timestamp: string | null, threshold: number) => {
      const age = calculateAge(timestamp);
      return { stale: age > threshold, ageSeconds: age };
    };

    return {
      account: calcStale(accountQuery.data?.lastUpdated ?? null, STALE_THRESHOLDS.account),
      generation: calcStale(generationQuery.data?.lastUpdated ?? null, STALE_THRESHOLDS.generation),
      agents: calcStale(agentQuery.data?.lastUpdated ?? null, STALE_THRESHOLDS.agents),
      shadow: calcStale(shadowQuery.data?.lastUpdated ?? null, STALE_THRESHOLDS.shadow),
      decisions: calcStale(decisionQuery.data?.lastUpdated ?? null, STALE_THRESHOLDS.decisions),
      system: calcStale(systemQuery.data?.lastUpdated ?? null, STALE_THRESHOLDS.system),
    };
  }, [
    accountQuery.data?.lastUpdated,
    generationQuery.data?.lastUpdated,
    agentQuery.data?.lastUpdated,
    shadowQuery.data?.lastUpdated,
    decisionQuery.data?.lastUpdated,
    systemQuery.data?.lastUpdated,
  ]);

  // ============================================
  // REFETCH ALL
  // ============================================
  const refetchAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['cockpit-account'] });
    queryClient.invalidateQueries({ queryKey: ['cockpit-generation'] });
    queryClient.invalidateQueries({ queryKey: ['cockpit-agents'] });
    queryClient.invalidateQueries({ queryKey: ['cockpit-shadow'] });
    queryClient.invalidateQueries({ queryKey: ['cockpit-decisions'] });
    queryClient.invalidateQueries({ queryKey: ['cockpit-system'] });
  }, [queryClient]);

  const isLoading = 
    accountQuery.isLoading || 
    generationQuery.isLoading || 
    systemQuery.isLoading;

  return {
    account: accountQuery.data ?? null,
    generation: generationQuery.data ?? null,
    agents: agentQuery.data ?? null,
    shadow: shadowQuery.data ?? null,
    decisions: decisionQuery.data ?? null,
    system: systemQuery.data ?? null,
    staleness,
    isLoading,
    refetchAll,
  };
}
