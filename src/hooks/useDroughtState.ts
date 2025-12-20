import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AdaptiveTuningState {
  enabled: boolean;
  mode: 'drought_only' | 'always' | string;
  offsets: Record<string, number>;
  lastAdjustedAt: string | null;
  cooldownMinutes: number | null;
  baselineThresholds?: Record<string, number>;
  effectiveThresholds?: Record<string, number>;
  applied: boolean;
  cooldownRemainingSec: number | null;
  // Phase 4A Guardrails
  frozenUntil: string | null;
  frozenReason: string | null;
}

export interface DroughtState {
  detected: boolean;
  isActive: boolean;
  shortWindowHolds: number;
  shortWindowOrders: number;
  longWindowHolds: number;
  longWindowOrders: number;
  reason?: string;
  blocked: boolean;
  blockReason?: string;
  killed: boolean;
  killReason?: string;
  cooldownUntil?: string;
  override: 'auto' | 'force_off' | 'force_on';
  gateFailures: Record<string, { count: number; avgMargin: number }>;
  nearestPass?: {
    gate: string;
    actual: number;
    threshold: number;
    margin: number;
  };
  // Equity metrics
  equity?: number;
  peakEquity?: number;
  equityDrawdownPct?: number;      // vs starting cash
  peakEquityDrawdownPct?: number;  // vs peak equity (kill metric)
  // Adaptive tuning
  adaptiveTuning?: AdaptiveTuningState;
}

export function useDroughtState() {
  return useQuery({
    queryKey: ['drought-state'],
    queryFn: async (): Promise<DroughtState> => {
      // Get most recent decision for complete drought state (single source of truth)
      const { data: latestDecisions } = await supabase
        .from('control_events')
        .select('metadata')
        .eq('action', 'trade_decision')
        .order('triggered_at', { ascending: false })
        .limit(1);
      
      // Extract unified drought state from latest decision metadata
      const latestMeta = (latestDecisions?.[0]?.metadata ?? {}) as Record<string, unknown>;
      const droughtState = latestMeta.drought_state as { 
        detected?: boolean;
        active?: boolean;
        blocked?: boolean; 
        block_reason?: string;
        killed?: boolean;
        kill_reason?: string;
        cooldown_until?: string;
        override?: 'auto' | 'force_off' | 'force_on';
        reason?: string;
        holds_6h?: number;
        orders_6h?: number;
        holds_48h?: number;
        orders_48h?: number;
        // Equity metrics
        equity?: number;
        peak_equity?: number;
        equity_drawdown_pct?: number;
        peak_equity_drawdown_pct?: number;
      } | undefined;
      
      const adaptiveTuningRaw = latestMeta.adaptive_tuning as {
        enabled?: boolean;
        mode?: string;
        offsets?: Record<string, number>;
        last_adjusted_at?: string | null;
        cooldown_minutes?: number | null;
        baseline_thresholds?: Record<string, number>;
        effective_thresholds?: Record<string, number>;
        applied?: boolean;
        cooldown_remaining_sec?: number | null;
        frozen_until?: string | null;
        frozen_reason?: string | null;
      } | undefined;
      
      const gateFailures = (latestMeta.gate_failures ?? {}) as Record<string, { count: number; avgMargin: number }>;
      const nearestPass = latestMeta.nearest_pass as DroughtState['nearestPass'];
      
      return {
        detected: droughtState?.detected ?? false,
        isActive: droughtState?.active ?? false,
        shortWindowHolds: droughtState?.holds_6h ?? 0,
        shortWindowOrders: droughtState?.orders_6h ?? 0,
        longWindowHolds: droughtState?.holds_48h ?? 0,
        longWindowOrders: droughtState?.orders_48h ?? 0,
        reason: droughtState?.reason,
        blocked: droughtState?.blocked ?? false,
        blockReason: droughtState?.block_reason,
        killed: droughtState?.killed ?? false,
        killReason: droughtState?.kill_reason,
        cooldownUntil: droughtState?.cooldown_until,
        override: droughtState?.override ?? 'auto',
        gateFailures,
        nearestPass,
        // Equity metrics
        equity: droughtState?.equity,
        peakEquity: droughtState?.peak_equity,
        equityDrawdownPct: droughtState?.equity_drawdown_pct,
        peakEquityDrawdownPct: droughtState?.peak_equity_drawdown_pct,
        // Adaptive tuning
        adaptiveTuning: adaptiveTuningRaw ? {
          enabled: adaptiveTuningRaw.enabled ?? false,
          mode: adaptiveTuningRaw.mode ?? 'drought_only',
          offsets: adaptiveTuningRaw.offsets ?? {},
          lastAdjustedAt: adaptiveTuningRaw.last_adjusted_at ?? null,
          cooldownMinutes: adaptiveTuningRaw.cooldown_minutes ?? null,
          baselineThresholds: adaptiveTuningRaw.baseline_thresholds,
          effectiveThresholds: adaptiveTuningRaw.effective_thresholds,
          applied: adaptiveTuningRaw.applied ?? false,
          cooldownRemainingSec: adaptiveTuningRaw.cooldown_remaining_sec ?? null,
          frozenUntil: adaptiveTuningRaw.frozen_until ?? null,
          frozenReason: adaptiveTuningRaw.frozen_reason ?? null,
        } : undefined,
      };
    },
    refetchInterval: 30000,
  });
}
