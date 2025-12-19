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
      
      // Get recent trade decisions for analysis
      const { data: recentDecisions } = await supabase
        .from('control_events')
        .select('metadata, triggered_at')
        .eq('action', 'trade_decision')
        .order('triggered_at', { ascending: false })
        .limit(200);
      
      // Parse decisions from metadata
      const shortHolds = (recentDecisions ?? []).filter(e => {
        const meta = e.metadata as Record<string, unknown> | null;
        return e.triggered_at >= shortWindowStart && meta?.decision === 'hold';
      }).length;
      
      const longHolds = (recentDecisions ?? []).filter(e => {
        const meta = e.metadata as Record<string, unknown> | null;
        return e.triggered_at >= longWindowStart && meta?.decision === 'hold';
      }).length;
      
      // Get orders from paper_orders
      const { data: shortOrders } = await supabase
        .from('paper_orders')
        .select('id')
        .gte('created_at', shortWindowStart)
        .eq('status', 'filled');
      
      const { data: longOrders } = await supabase
        .from('paper_orders')
        .select('id')
        .gte('created_at', longWindowStart)
        .eq('status', 'filled');
      
      const shortWindowOrders = shortOrders?.length ?? 0;
      const longWindowOrders = longOrders?.length ?? 0;
      
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
      
      // Get gate failures from most recent decision
      const latestDecision = (recentDecisions ?? [])[0];
      const latestMeta = latestDecision?.metadata as Record<string, unknown> | null;
      const gateFailures = (latestMeta?.gate_failures ?? {}) as Record<string, { count: number; avgMargin: number }>;
      const nearestPass = latestMeta?.nearest_pass as DroughtState['nearestPass'];
      const droughtState = latestMeta?.drought_state as { blocked?: boolean; block_reason?: string } | undefined;
      
      return {
        isActive,
        shortWindowHolds: shortHolds,
        shortWindowOrders,
        longWindowHolds: longHolds,
        longWindowOrders,
        reason,
        blocked: droughtState?.blocked ?? false,
        blockReason: droughtState?.block_reason,
        gateFailures,
        nearestPass,
      };
    },
    refetchInterval: 30000,
  });
}
