import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Activity, AlertTriangle, CheckCircle, Clock, RefreshCw, Zap } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useSystemState } from '@/hooks/useEvoTraderData';
import { toast } from '@/hooks/use-toast';

interface PollRun {
  id: string;
  ran_at: string;
  status: string;
  updated_count: number;
  error_message: string | null;
  duration_ms: number | null;
}

export function PollingHealth() {
  const [secondsSinceUpdate, setSecondsSinceUpdate] = useState(0);
  const [showLogs, setShowLogs] = useState(false);
  const [polling, setPolling] = useState(false);
  const queryClient = useQueryClient();
  const { data: systemState } = useSystemState();

  const handleManualPoll = async () => {
    setPolling(true);
    try {
      const { data, error } = await supabase.functions.invoke('market-poll');
      if (error) throw error;
      
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'market-data' });
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'poll-runs' });
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'last-market-update' });
      
      toast({
        title: 'Market Data Updated',
        description: `Updated ${data.updated || 0} symbols in ${data.duration_ms || 0}ms`,
      });
    } catch (err) {
      console.error('[PollingHealth] Manual poll error:', err);
      toast({
        title: 'Poll Failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setPolling(false);
    }
  };

  // Fetch last market update time
  const { data: lastMarketUpdate } = useQuery({
    queryKey: ['last-market-update'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('market_data')
        .select('updated_at')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();
      
      if (error) return null;
      return data?.updated_at;
    },
    refetchInterval: 10000,
  });

  // Fetch poll run history
  const { data: pollRuns } = useQuery({
    queryKey: ['poll-runs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('market_poll_runs')
        .select('*')
        .order('ran_at', { ascending: false })
        .limit(20);
      
      if (error) throw error;
      return data as PollRun[];
    },
  });

  // Subscribe to realtime updates
  useEffect(() => {
    const channel = supabase
      .channel('poll-runs-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'market_poll_runs' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['poll-runs'] });
          queryClient.invalidateQueries({ queryKey: ['last-market-update'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Update seconds counter
  useEffect(() => {
    if (!lastMarketUpdate) return;
    
    const updateSeconds = () => {
      const diff = Math.floor((Date.now() - new Date(lastMarketUpdate).getTime()) / 1000);
      setSecondsSinceUpdate(diff);
    };
    
    updateSeconds();
    const interval = setInterval(updateSeconds, 1000);
    return () => clearInterval(interval);
  }, [lastMarketUpdate]);

  const isStale = secondsSinceUpdate > 120 && 
    (systemState?.status === 'running' || systemState?.status === 'paused');

  const lastRun = pollRuns?.[0];
  const successRate = pollRuns?.length 
    ? Math.round((pollRuns.filter(r => r.status === 'success').length / pollRuns.length) * 100)
    : 0;

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          Polling Health
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status Row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isStale ? (
              <AlertTriangle className="h-4 w-4 text-warning animate-pulse" />
            ) : (
              <CheckCircle className="h-4 w-4 text-success" />
            )}
            <span className="text-sm text-muted-foreground">
              {isStale ? 'Stale Data' : 'Healthy'}
            </span>
          </div>
          <Badge variant={isStale ? 'destructive' : 'outline'} className="font-mono text-xs">
            {secondsSinceUpdate}s ago
          </Badge>
        </div>

        {/* Last Update */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-3 w-3" />
            Last Update
          </div>
          <div className="font-mono text-right">
            {lastMarketUpdate 
              ? new Date(lastMarketUpdate).toLocaleTimeString() 
              : 'Never'}
          </div>
          
          <div className="text-muted-foreground">Last Run Status</div>
          <div className="text-right">
            <Badge 
              variant="outline" 
              className={cn(
                'text-xs',
                lastRun?.status === 'success' && 'text-success border-success/50',
                lastRun?.status === 'skipped' && 'text-warning border-warning/50',
                lastRun?.status === 'error' && 'text-destructive border-destructive/50'
              )}
            >
              {lastRun?.status || 'N/A'}
            </Badge>
          </div>

          <div className="text-muted-foreground">Success Rate</div>
          <div className="font-mono text-right">{successRate}%</div>

          {lastRun?.duration_ms && (
            <>
              <div className="text-muted-foreground">Last Duration</div>
              <div className="font-mono text-right">{lastRun.duration_ms}ms</div>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={handleManualPoll}
            disabled={polling}
          >
            <Zap className="h-3 w-3 mr-2" />
            {polling ? 'Polling...' : 'Poll Now'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => setShowLogs(!showLogs)}
          >
            <RefreshCw className="h-3 w-3 mr-2" />
            {showLogs ? 'Hide' : 'Show'} Logs
          </Button>
        </div>

        {/* Logs Table */}
        {showLogs && pollRuns && (
          <div className="max-h-48 overflow-y-auto border border-border rounded-md">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="px-2 py-1 text-left">Time</th>
                  <th className="px-2 py-1 text-left">Status</th>
                  <th className="px-2 py-1 text-right">Updated</th>
                  <th className="px-2 py-1 text-right">Duration</th>
                </tr>
              </thead>
              <tbody>
                {pollRuns.map((run) => (
                  <tr key={run.id} className="border-t border-border/50">
                    <td className="px-2 py-1 font-mono">
                      {new Date(run.ran_at).toLocaleTimeString()}
                    </td>
                    <td className="px-2 py-1">
                      <Badge 
                        variant="outline" 
                        className={cn(
                          'text-xs',
                          run.status === 'success' && 'text-success',
                          run.status === 'skipped' && 'text-warning',
                          run.status === 'error' && 'text-destructive'
                        )}
                      >
                        {run.status}
                      </Badge>
                    </td>
                    <td className="px-2 py-1 text-right font-mono">{run.updated_count}</td>
                    <td className="px-2 py-1 text-right font-mono">{run.duration_ms}ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}