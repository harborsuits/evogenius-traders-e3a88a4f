import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Clock, Activity, AlertTriangle, CheckCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface TradeCycleData {
  triggered_at: string;
  metadata: {
    symbol?: string;
    decision?: string;
    generation_id?: string;
    agent_id?: string;
  };
}

export function TradeCycleStatus() {
  const { data, isLoading } = useQuery({
    queryKey: ['last-trade-cycle'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('control_events')
        .select('triggered_at, metadata')
        .eq('action', 'trade_decision')
        .order('triggered_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as TradeCycleData | null;
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Clock className="h-3 w-3 animate-pulse" />
        <span>Loading...</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <AlertTriangle className="h-3 w-3 text-warning" />
        <span>No trade-cycle data</span>
      </div>
    );
  }

  const triggeredAt = new Date(data.triggered_at);
  const now = new Date();
  const minutesAgo = Math.floor((now.getTime() - triggeredAt.getTime()) / 60000);
  const isStale = minutesAgo > 7; // Cron runs every 5 min, so 7+ is stale

  const decision = data.metadata?.decision?.toUpperCase() || 'UNKNOWN';
  const symbol = data.metadata?.symbol || '???';
  const genId = data.metadata?.generation_id?.slice(0, 8) || '????????';
  const isPlaceholder = data.metadata?.generation_id?.startsWith('11111111');

  const getDecisionColor = (d: string) => {
    switch (d) {
      case 'BUY': return 'text-emerald-400';
      case 'SELL': return 'text-red-400';
      default: return 'text-muted-foreground';
    }
  };

  return (
    <div className="flex flex-col gap-1 text-xs font-mono border border-border/50 rounded-md p-2 bg-card/50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Activity className="h-3 w-3 text-primary" />
          <span className="text-muted-foreground">Trade Cycle</span>
        </div>
        {isStale ? (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-warning/10 text-warning border-warning/30">
            <AlertTriangle className="h-2.5 w-2.5 mr-1" />
            STALE {minutesAgo}m
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
            <CheckCircle className="h-2.5 w-2.5 mr-1" />
            OK
          </Badge>
        )}
      </div>
      
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-1">
        <div className="text-muted-foreground">Last run:</div>
        <div className={isStale ? 'text-warning' : 'text-foreground'}>
          {triggeredAt.toLocaleTimeString()} ({minutesAgo}m ago)
        </div>
        
        <div className="text-muted-foreground">Decision:</div>
        <div className={getDecisionColor(decision)}>
          {decision} {symbol}
        </div>
        
        <div className="text-muted-foreground">Gen ID:</div>
        <div className={isPlaceholder ? 'text-destructive' : 'text-foreground'}>
          {genId}{isPlaceholder && ' ⚠'}
        </div>
      </div>
    </div>
  );
}
