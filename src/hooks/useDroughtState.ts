import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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
      };
    },
    refetchInterval: 30000,
  });
}
