import React, { createContext, useContext, useMemo, useCallback, useEffect, useState, ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { isArmedNow, getArmedSecondsRemaining } from '@/hooks/useArmLive';

// ============================================
// UNIFIED SYSTEM SNAPSHOT
// Single source of truth for all dashboard data
// ============================================

export type TradeMode = 'paper' | 'live';
export type SystemStatus = 'running' | 'paused' | 'stopped' | 'error';
export type BrainStatus = 'candidate' | 'active' | 'retired' | 'blocked';

// System State
export interface SystemState {
  status: SystemStatus;
  tradeMode: TradeMode;
  isLive: boolean;
  isLiveArmed: boolean;
  armedSecondsRemaining: number;
  currentGenerationId: string | null;
  gateProfile: string;
  activeBrainVersionId: string | null;
  lastUpdated: string;
}

// Generation Info
export interface GenerationInfo {
  id: string;
  number: number;
  isActive: boolean;
  startTime: string;
  elapsedHours: number;
  cohortCount: number;
  eliteCount: number;
  totalTrades: number;
  totalPnl: number;
  maxDrawdown: number;
  regimeTag: string | null;
}

// Brain Snapshot
export interface BrainSnapshot {
  id: string;
  versionNumber: number;
  status: BrainStatus;
  isActive: boolean;
  sourceGenerationId: string | null;
  qualifiedCount: number;
  gatesPassed: Record<string, boolean>;
  promotedAt: string;
  notes: string | null;
}

// Pipeline Health
export interface PipelineHealth {
  tradeCycle: {
    lastRun: string | null;
    isStale: boolean;
    lastDecision: string | null;
  };
  fitnessCycle: {
    lastRun: string | null;
    isStale: boolean;
  };
  shadowOutcome: {
    lastRun: string | null;
    pendingCount: number;
  };
  marketPoll: {
    lastRun: string | null;
    isStale: boolean;
    symbolsUpdated: number;
  };
}

// Risk State
export interface RiskState {
  dailyLossPct: number;
  drawdownPct: number;
  consecutiveLossDays: number;
  shouldRollback: boolean;
  rollbackBreaches: string[];
}

// Staleness tracking
export interface StalenessMap {
  system: { stale: boolean; ageSeconds: number };
  generation: { stale: boolean; ageSeconds: number };
  brain: { stale: boolean; ageSeconds: number };
  pipeline: { stale: boolean; ageSeconds: number };
}

// Full snapshot
export interface SystemSnapshot {
  system: SystemState | null;
  generation: GenerationInfo | null;
  brain: BrainSnapshot | null;
  pipeline: PipelineHealth | null;
  risk: RiskState | null;
  staleness: StalenessMap;
  isLoading: boolean;
  hasError: boolean;
  error: Error | null;
  refetchAll: () => void;
}

// Staleness thresholds in seconds
const STALE_THRESHOLDS = {
  system: 30,
  generation: 300,
  brain: 300,
  pipeline: 120,
};

function calculateAge(timestamp: string | null): number {
  if (!timestamp) return Infinity;
  return Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
}

const SystemSnapshotContext = createContext<SystemSnapshot | undefined>(undefined);

export function SystemSnapshotProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [now, setNow] = useState(Date.now());

  // Tick for armed countdown
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // ============================================
  // SYSTEM STATE QUERY
  // ============================================
  const systemQuery = useQuery({
    queryKey: ['snapshot-system'],
    queryFn: async (): Promise<SystemState | null> => {
      const { data, error } = await supabase
        .from('system_state')
        .select('*')
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      if (!data) return null;

      const isArmed = isArmedNow(data.live_armed_until);
      const armedSecondsRemaining = getArmedSecondsRemaining(data.live_armed_until);

      return {
        status: data.status as SystemStatus,
        tradeMode: data.trade_mode as TradeMode,
        isLive: data.trade_mode === 'live',
        isLiveArmed: isArmed,
        armedSecondsRemaining,
        currentGenerationId: data.current_generation_id,
        gateProfile: data.gate_profile,
        activeBrainVersionId: data.active_brain_version_id,
        lastUpdated: data.updated_at,
      };
    },
    refetchInterval: 5000,
    staleTime: 3000,
  });

  // ============================================
  // GENERATION QUERY
  // ============================================
  const generationQuery = useQuery({
    queryKey: ['snapshot-generation', systemQuery.data?.currentGenerationId],
    queryFn: async (): Promise<GenerationInfo | null> => {
      const genId = systemQuery.data?.currentGenerationId;
      if (!genId) return null;

      // Fetch generation + cohort count in parallel
      const [genResult, cohortResult, eliteResult] = await Promise.all([
        supabase
          .from('generations')
          .select('*')
          .eq('id', genId)
          .maybeSingle(),
        supabase
          .from('generation_agents')
          .select('*', { count: 'exact', head: true })
          .eq('generation_id', genId),
        supabase
          .from('agents')
          .select('*', { count: 'exact', head: true })
          .eq('is_elite', true),
      ]);

      if (genResult.error) throw genResult.error;
      if (!genResult.data) return null;

      const gen = genResult.data;
      const elapsedMs = Date.now() - new Date(gen.start_time).getTime();

      return {
        id: gen.id,
        number: gen.generation_number,
        isActive: gen.is_active,
        startTime: gen.start_time,
        elapsedHours: elapsedMs / (1000 * 60 * 60),
        cohortCount: cohortResult.count ?? 0,
        eliteCount: eliteResult.count ?? 0,
        totalTrades: gen.total_trades,
        totalPnl: gen.total_pnl,
        maxDrawdown: gen.max_drawdown,
        regimeTag: gen.regime_tag,
      };
    },
    enabled: !!systemQuery.data?.currentGenerationId,
    refetchInterval: 30000,
    staleTime: 20000,
  });

  // ============================================
  // BRAIN SNAPSHOT QUERY
  // ============================================
  const brainQuery = useQuery({
    queryKey: ['snapshot-brain', systemQuery.data?.activeBrainVersionId],
    queryFn: async (): Promise<BrainSnapshot | null> => {
      // Fetch active brain (if any)
      const { data, error } = await supabase
        .from('live_brain_snapshots')
        .select('*')
        .eq('is_active', true)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      const agentSnapshots = data.agent_snapshots as Array<Record<string, unknown>> | null;
      const qualifiedCount = agentSnapshots?.length ?? 0;

      return {
        id: data.id,
        versionNumber: data.version_number,
        status: data.status as BrainStatus,
        isActive: data.is_active,
        sourceGenerationId: data.source_generation_id,
        qualifiedCount,
        gatesPassed: (data.gates_passed as Record<string, boolean>) ?? {},
        promotedAt: data.promoted_at,
        notes: data.notes,
      };
    },
    refetchInterval: 60000,
    staleTime: 30000,
  });

  // ============================================
  // PIPELINE HEALTH QUERY
  // ============================================
  const pipelineQuery = useQuery({
    queryKey: ['snapshot-pipeline'],
    queryFn: async (): Promise<PipelineHealth> => {
      // Fetch recent control events for each pipeline component
      const [tradeCycleResult, fitnessResult, shadowResult, marketPollResult, pendingShadowResult] = await Promise.all([
        supabase
          .from('control_events')
          .select('triggered_at, metadata')
          .eq('action', 'trade_decision')
          .order('triggered_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('control_events')
          .select('triggered_at')
          .eq('action', 'fitness_calculated')
          .order('triggered_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('control_events')
          .select('triggered_at')
          .eq('action', 'shadow_outcome_calc')
          .order('triggered_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('market_poll_runs')
          .select('ran_at, updated_count')
          .eq('status', 'success')
          .order('ran_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('shadow_trades')
          .select('*', { count: 'exact', head: true })
          .eq('outcome_status', 'pending'),
      ]);

      const tradeCycleTs = tradeCycleResult.data?.triggered_at ?? null;
      const tradeCycleAge = calculateAge(tradeCycleTs);
      const fitnessTs = fitnessResult.data?.triggered_at ?? null;
      const fitnessAge = calculateAge(fitnessTs);
      const marketPollTs = marketPollResult.data?.ran_at ?? null;
      const marketPollAge = calculateAge(marketPollTs);

      const metadata = tradeCycleResult.data?.metadata as Record<string, unknown> | null;

      return {
        tradeCycle: {
          lastRun: tradeCycleTs,
          isStale: tradeCycleAge > 420, // 7 minutes (cron runs every 5min)
          lastDecision: metadata?.decision as string ?? null,
        },
        fitnessCycle: {
          lastRun: fitnessTs,
          isStale: fitnessAge > 3600, // 1 hour
        },
        shadowOutcome: {
          lastRun: shadowResult.data?.triggered_at ?? null,
          pendingCount: pendingShadowResult.count ?? 0,
        },
        marketPoll: {
          lastRun: marketPollTs,
          isStale: marketPollAge > 120, // 2 minutes
          symbolsUpdated: marketPollResult.data?.updated_count ?? 0,
        },
      };
    },
    refetchInterval: 30000,
    staleTime: 15000,
  });

  // ============================================
  // RISK STATE QUERY (from performance_alerts)
  // ============================================
  const riskQuery = useQuery({
    queryKey: ['snapshot-risk'],
    queryFn: async (): Promise<RiskState> => {
      // Check for recent rollback-related alerts
      const { data: alerts } = await supabase
        .from('performance_alerts')
        .select('*')
        .in('type', ['rollback_triggered', 'rollback_check', 'risk_breach'])
        .eq('is_ack', false)
        .order('created_at', { ascending: false })
        .limit(5);

      // Extract risk metrics from most recent fitness calc control event
      const { data: fitnessEvent } = await supabase
        .from('control_events')
        .select('metadata')
        .eq('action', 'fitness_calculated')
        .order('triggered_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const metadata = fitnessEvent?.metadata as Record<string, unknown> | null;
      const riskMetrics = metadata?.brain_risk_metrics as Record<string, unknown> | null;

      const rollbackAlert = alerts?.find(a => a.type === 'rollback_triggered');
      const breaches = rollbackAlert?.metadata as Record<string, unknown> | null;

      return {
        dailyLossPct: (riskMetrics?.dailyLoss as number) ?? 0,
        drawdownPct: (riskMetrics?.drawdown as number) ?? 0,
        consecutiveLossDays: (riskMetrics?.consecutiveLossDays as number) ?? 0,
        shouldRollback: !!rollbackAlert,
        rollbackBreaches: (breaches?.breaches as string[]) ?? [],
      };
    },
    refetchInterval: 60000,
    staleTime: 30000,
  });

  // ============================================
  // REALTIME SUBSCRIPTIONS
  // ============================================
  useEffect(() => {
    const channel = supabase
      .channel('snapshot-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'system_state' }, () => {
        queryClient.invalidateQueries({ queryKey: ['snapshot-system'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'generations' }, () => {
        queryClient.invalidateQueries({ queryKey: ['snapshot-generation'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'generation_agents' }, () => {
        queryClient.invalidateQueries({ queryKey: ['snapshot-generation'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_brain_snapshots' }, () => {
        queryClient.invalidateQueries({ queryKey: ['snapshot-brain'] });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'control_events' }, () => {
        queryClient.invalidateQueries({ queryKey: ['snapshot-pipeline'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'market_poll_runs' }, () => {
        queryClient.invalidateQueries({ queryKey: ['snapshot-pipeline'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shadow_trades' }, () => {
        queryClient.invalidateQueries({ queryKey: ['snapshot-pipeline'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'performance_alerts' }, () => {
        queryClient.invalidateQueries({ queryKey: ['snapshot-risk'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // ============================================
  // STALENESS CALCULATION
  // ============================================
  const staleness = useMemo((): StalenessMap => {
    const calcStale = (timestamp: string | null, threshold: number) => {
      const age = calculateAge(timestamp);
      return { stale: age > threshold, ageSeconds: age };
    };

    return {
      system: calcStale(systemQuery.data?.lastUpdated ?? null, STALE_THRESHOLDS.system),
      generation: calcStale(generationQuery.data?.startTime ?? null, STALE_THRESHOLDS.generation),
      brain: calcStale(brainQuery.data?.promotedAt ?? null, STALE_THRESHOLDS.brain),
      pipeline: calcStale(pipelineQuery.data?.tradeCycle.lastRun ?? null, STALE_THRESHOLDS.pipeline),
    };
  }, [
    systemQuery.data?.lastUpdated,
    generationQuery.data?.startTime,
    brainQuery.data?.promotedAt,
    pipelineQuery.data?.tradeCycle.lastRun,
    now, // Force recalc on tick
  ]);

  // ============================================
  // REFETCH ALL
  // ============================================
  const refetchAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['snapshot-system'] });
    queryClient.invalidateQueries({ queryKey: ['snapshot-generation'] });
    queryClient.invalidateQueries({ queryKey: ['snapshot-brain'] });
    queryClient.invalidateQueries({ queryKey: ['snapshot-pipeline'] });
    queryClient.invalidateQueries({ queryKey: ['snapshot-risk'] });
  }, [queryClient]);

  const isLoading = systemQuery.isLoading || generationQuery.isLoading;
  const hasError = !!systemQuery.error || !!generationQuery.error;
  const error = systemQuery.error ?? generationQuery.error ?? null;

  const snapshot: SystemSnapshot = {
    system: systemQuery.data ?? null,
    generation: generationQuery.data ?? null,
    brain: brainQuery.data ?? null,
    pipeline: pipelineQuery.data ?? null,
    risk: riskQuery.data ?? null,
    staleness,
    isLoading,
    hasError,
    error: error instanceof Error ? error : null,
    refetchAll,
  };

  return (
    <SystemSnapshotContext.Provider value={snapshot}>
      {children}
    </SystemSnapshotContext.Provider>
  );
}

// Main hook
export function useSystemSnapshot(): SystemSnapshot {
  const context = useContext(SystemSnapshotContext);
  if (context === undefined) {
    throw new Error('useSystemSnapshot must be used within a SystemSnapshotProvider');
  }
  return context;
}

// Convenience selectors
export function useTradeModeBadge() {
  const { system } = useSystemSnapshot();
  return {
    mode: system?.tradeMode ?? 'paper',
    isLive: system?.isLive ?? false,
    isLiveArmed: system?.isLiveArmed ?? false,
    isLocked: (system?.isLive ?? false) && !(system?.isLiveArmed ?? false),
    armedSecondsRemaining: system?.armedSecondsRemaining ?? 0,
  };
}

export function useGenerationBadge() {
  const { generation, staleness } = useSystemSnapshot();
  return {
    number: generation?.number ?? null,
    cohortCount: generation?.cohortCount ?? 0,
    isActive: generation?.isActive ?? false,
    isStale: staleness.generation.stale,
    elapsedHours: generation?.elapsedHours ?? 0,
  };
}

export function useBrainBadge() {
  const { brain, system } = useSystemSnapshot();
  return {
    version: brain?.versionNumber ?? null,
    isActive: brain?.isActive ?? false,
    gateProfile: system?.gateProfile ?? 'warmup',
    qualifiedCount: brain?.qualifiedCount ?? 0,
  };
}

export function usePipelineHealth() {
  const { pipeline, staleness } = useSystemSnapshot();
  return {
    tradeCycleStale: pipeline?.tradeCycle.isStale ?? true,
    fitnessStale: pipeline?.fitnessCycle.isStale ?? true,
    marketPollStale: pipeline?.marketPoll.isStale ?? true,
    pendingShadow: pipeline?.shadowOutcome.pendingCount ?? 0,
    overallStale: staleness.pipeline.stale,
  };
}

export function useRiskState() {
  const { risk } = useSystemSnapshot();
  return {
    dailyLossPct: risk?.dailyLossPct ?? 0,
    drawdownPct: risk?.drawdownPct ?? 0,
    consecutiveLossDays: risk?.consecutiveLossDays ?? 0,
    shouldRollback: risk?.shouldRollback ?? false,
    breaches: risk?.rollbackBreaches ?? [],
  };
}
