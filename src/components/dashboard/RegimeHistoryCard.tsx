import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, TrendingUp, Minus, Activity } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface RegimeStats {
  trend: number;
  range: number;
  dead: number;
  unknown: number;
  total: number;
  regimeBlocked: number;
  regimeBlockedRate: number;
}

export function RegimeHistoryCard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['regime-history-24h'],
    queryFn: async (): Promise<RegimeStats> => {
      const { data, error } = await supabase
        .from('control_events')
        .select('metadata')
        .eq('action', 'trade_decision')
        .gte('triggered_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      if (error) throw error;

      let trend = 0;
      let range = 0;
      let dead = 0;
      let unknown = 0;
      let regimeBlocked = 0;

      for (const row of data || []) {
        const metadata = row.metadata as Record<string, unknown> | null;
        if (!metadata) {
          unknown++;
          continue;
        }

        // Get gating regime from evaluations or regime_gating
        const regimeGating = metadata.regime_gating as Record<string, unknown> | undefined;
        const evaluations = metadata.evaluations as Array<Record<string, unknown>> | undefined;
        
        let gatingRegime: string | null = null;
        let isBlocked = false;

        if (regimeGating) {
          gatingRegime = regimeGating.gating_regime as string || null;
        } else if (evaluations && evaluations.length > 0) {
          const regimeContext = evaluations[0].regime_context as Record<string, unknown> | undefined;
          gatingRegime = regimeContext?.gating_regime as string || null;
          isBlocked = evaluations[0].regime_blocked === true;
        }

        // Count regime blocked from reason
        const reason = metadata.reason as string | undefined;
        if (reason?.includes('wrong_regime') || isBlocked) {
          regimeBlocked++;
        }

        switch (gatingRegime) {
          case 'trend':
            trend++;
            break;
          case 'range':
            range++;
            break;
          case 'dead':
            dead++;
            break;
          default:
            unknown++;
        }
      }

      const total = trend + range + dead + unknown;

      return {
        trend,
        range,
        dead,
        unknown,
        total,
        regimeBlocked,
        regimeBlockedRate: total > 0 ? (regimeBlocked / total) * 100 : 0,
      };
    },
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!stats || stats.total === 0) {
    return (
      <div className="text-muted-foreground text-sm text-center">
        No decisions in last 24h
      </div>
    );
  }

  const trendPct = ((stats.trend / stats.total) * 100).toFixed(0);
  const rangePct = ((stats.range / stats.total) * 100).toFixed(0);
  const deadPct = ((stats.dead / stats.total) * 100).toFixed(0);

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground font-mono">
        Last 24h • {stats.total} decisions
      </div>

      {/* Stacked bar */}
      <div className="h-4 rounded-full overflow-hidden flex bg-muted/30">
        {stats.trend > 0 && (
          <div
            className="bg-chart-1 transition-all"
            style={{ width: `${trendPct}%` }}
            title={`Trend: ${trendPct}%`}
          />
        )}
        {stats.range > 0 && (
          <div
            className="bg-chart-2 transition-all"
            style={{ width: `${rangePct}%` }}
            title={`Range: ${rangePct}%`}
          />
        )}
        {stats.dead > 0 && (
          <div
            className="bg-muted-foreground/50 transition-all"
            style={{ width: `${deadPct}%` }}
            title={`Dead: ${deadPct}%`}
          />
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-chart-1" />
          <span className="text-muted-foreground">Trend</span>
          <span className="font-mono font-medium">{trendPct}%</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-chart-2" />
          <span className="text-muted-foreground">Range</span>
          <span className="font-mono font-medium">{rangePct}%</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/50" />
          <span className="text-muted-foreground">Dead</span>
          <span className="font-mono font-medium">{deadPct}%</span>
        </div>
      </div>

      {/* Regime blocked rate */}
      <div className="pt-2 border-t border-border/50">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Regime-blocked holds</span>
          <Badge 
            variant={stats.regimeBlockedRate > 30 ? 'destructive' : stats.regimeBlockedRate > 10 ? 'secondary' : 'outline'}
            className="font-mono text-xs"
          >
            {stats.regimeBlocked} ({stats.regimeBlockedRate.toFixed(1)}%)
          </Badge>
        </div>
      </div>
    </div>
  );
}
