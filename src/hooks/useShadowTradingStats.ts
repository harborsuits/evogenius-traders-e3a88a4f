import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface ShadowTradingStats {
  todayCount: number;
  pendingCount: number;
  oldestPendingAge: number | null; // minutes
  calculatedLast24h: number;
  avgPnlPctLast24h: number | null;
  lastCalcRun: {
    timestamp: string;
    processed: number;
    calculated: number;
    skipped: number;
    errors: number;
    byReason: Record<string, number>;
  } | null;
}

export function useShadowTradingStats() {
  return useQuery({
    queryKey: ['shadow-trading-stats'],
    queryFn: async (): Promise<ShadowTradingStats> => {
      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // Parallel queries for efficiency
      const [
        todayResult,
        pendingResult,
        oldestPendingResult,
        calculatedResult,
        avgPnlResult,
        lastCalcResult,
      ] = await Promise.all([
        // Today's shadow trades count
        supabase
          .from('shadow_trades')
          .select('*', { count: 'exact', head: true })
          .gte('entry_time', todayStart.toISOString()),

        // Pending count
        supabase
          .from('shadow_trades')
          .select('*', { count: 'exact', head: true })
          .eq('outcome_status', 'pending'),

        // Oldest pending (for age calc)
        supabase
          .from('shadow_trades')
          .select('entry_time')
          .eq('outcome_status', 'pending')
          .order('entry_time', { ascending: true })
          .limit(1)
          .maybeSingle(),

        // Calculated in last 24h
        supabase
          .from('shadow_trades')
          .select('*', { count: 'exact', head: true })
          .eq('outcome_status', 'calculated')
          .gte('outcome_calculated_at', last24h.toISOString()),

        // Avg PnL % for calculated trades in last 24h
        supabase
          .from('shadow_trades')
          .select('simulated_pnl_pct')
          .eq('outcome_status', 'calculated')
          .gte('outcome_calculated_at', last24h.toISOString())
          .not('simulated_pnl_pct', 'is', null),

        // Last shadow_outcome_calc run
        supabase
          .from('control_events')
          .select('triggered_at, metadata')
          .eq('action', 'shadow_outcome_calc')
          .order('triggered_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      // Calculate oldest pending age in minutes
      let oldestPendingAge: number | null = null;
      if (oldestPendingResult.data?.entry_time) {
        const entryTime = new Date(oldestPendingResult.data.entry_time);
        oldestPendingAge = Math.round((now.getTime() - entryTime.getTime()) / 60000);
      }

      // Calculate average PnL %
      let avgPnlPctLast24h: number | null = null;
      if (avgPnlResult.data && avgPnlResult.data.length > 0) {
        const sum = avgPnlResult.data.reduce((acc, row) => acc + (row.simulated_pnl_pct ?? 0), 0);
        avgPnlPctLast24h = sum / avgPnlResult.data.length;
      }

      // Parse last calc run metadata
      let lastCalcRun: ShadowTradingStats['lastCalcRun'] = null;
      if (lastCalcResult.data) {
        const meta = lastCalcResult.data.metadata as Record<string, unknown> | null;
        if (meta) {
          lastCalcRun = {
            timestamp: lastCalcResult.data.triggered_at,
            processed: (meta.processed as number) ?? 0,
            calculated: (meta.calculated as number) ?? 0,
            skipped: (meta.skipped as number) ?? 0,
            errors: (meta.errors as number) ?? 0,
            byReason: (meta.by_reason as Record<string, number>) ?? {},
          };
        }
      }

      return {
        todayCount: todayResult.count ?? 0,
        pendingCount: pendingResult.count ?? 0,
        oldestPendingAge,
        calculatedLast24h: calculatedResult.count ?? 0,
        avgPnlPctLast24h,
        lastCalcRun,
      };
    },
    refetchInterval: 30000, // Refresh every 30s
    staleTime: 15000,
  });
}
