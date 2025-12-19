import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface DroughtState {
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
}

const DROUGHT_DETECTION = {
  min_holds_short_window: 20,
  min_holds_long_window: 80,
  max_orders_short_window: 3,
  max_orders_long_window: 10,
  short_window_hours: 6,
  long_window_hours: 48,
};

export function useDroughtState() {
  return useQuery({
    queryKey: ['drought-state'],
    queryFn: async (): Promise<DroughtState> => {
      const now = new Date();
      const shortWindowStart = new Date(now.getTime() - DROUGHT_DETECTION.short_window_hours * 60 * 60 * 1000).toISOString();
      const longWindowStart = new Date(now.getTime() - DROUGHT_DETECTION.long_window_hours * 60 * 60 * 1000).toISOString();
      
      // Use count-only queries to avoid dragging rows over network
      const [shortHoldsResult, longHoldsResult, shortOrdersResult, longOrdersResult] = await Promise.all([
        supabase
          .from('control_events')
          .select('*', { count: 'exact', head: true })
          .eq('action', 'trade_decision')
          .gte('triggered_at', shortWindowStart),
        supabase
          .from('control_events')
          .select('*', { count: 'exact', head: true })
          .eq('action', 'trade_decision')
          .gte('triggered_at', longWindowStart),
        supabase
          .from('paper_orders')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', shortWindowStart)
          .eq('status', 'filled'),
        supabase
          .from('paper_orders')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', longWindowStart)
          .eq('status', 'filled'),
      ]);
      
      // Get most recent decision for telemetry data
      const { data: latestDecisions } = await supabase
        .from('control_events')
        .select('metadata')
        .eq('action', 'trade_decision')
        .order('triggered_at', { ascending: false })
        .limit(1);
      
      const shortHolds = shortHoldsResult.count ?? 0;
      const longHolds = longHoldsResult.count ?? 0;
      const shortWindowOrders = shortOrdersResult.count ?? 0;
      const longWindowOrders = longOrdersResult.count ?? 0;
      
      // Determine drought state
      const shortDrought = shortHolds >= DROUGHT_DETECTION.min_holds_short_window && 
                           shortWindowOrders <= DROUGHT_DETECTION.max_orders_short_window;
      const longDrought = longHolds >= DROUGHT_DETECTION.min_holds_long_window && 
                          longWindowOrders <= DROUGHT_DETECTION.max_orders_long_window;
      
      const isActive = shortDrought || longDrought;
      
      let reason: string | undefined;
      if (shortDrought && longDrought) {
        reason = 'sustained_drought';
      } else if (shortDrought) {
        reason = 'short_drought_6h';
      } else if (longDrought) {
        reason = 'long_drought_48h';
      }
      
      // Get telemetry from most recent decision
      const latestMeta = (latestDecisions?.[0]?.metadata ?? {}) as Record<string, unknown>;
      const gateFailures = (latestMeta.gate_failures ?? {}) as Record<string, { count: number; avgMargin: number }>;
      const nearestPass = latestMeta.nearest_pass as DroughtState['nearestPass'];
      const droughtState = latestMeta.drought_state as { 
        blocked?: boolean; 
        block_reason?: string;
        killed?: boolean;
        kill_reason?: string;
        cooldown_until?: string;
        override?: 'auto' | 'force_off' | 'force_on';
      } | undefined;
      
      return {
        isActive,
        shortWindowHolds: shortHolds,
        shortWindowOrders,
        longWindowHolds: longHolds,
        longWindowOrders,
        reason,
        blocked: droughtState?.blocked ?? false,
        blockReason: droughtState?.block_reason,
        killed: droughtState?.killed ?? false,
        killReason: droughtState?.kill_reason,
        cooldownUntil: droughtState?.cooldown_until,
        override: droughtState?.override ?? 'auto',
        gateFailures,
        nearestPass,
      };
    },
    refetchInterval: 30000,
  });
}
