import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface PollRun {
  id: string;
  ran_at: string;
  status: string;
  updated_count: number | null;
  error_message: string | null;
  duration_ms: number | null;
}

// Check last market data update
export function useMarketDataFreshness() {
  return useQuery({
    queryKey: ['market-data-freshness'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('market_data')
        .select('updated_at')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (error) throw error;
      
      const lastUpdate = new Date(data.updated_at);
      const now = new Date();
      const ageMs = now.getTime() - lastUpdate.getTime();
      const ageSeconds = Math.floor(ageMs / 1000);
      
      return {
        lastUpdate,
        ageSeconds,
        isStale: ageSeconds > 20,
        isCritical: ageSeconds > 60,
      };
    },
    refetchInterval: 5000, // Check every 5 seconds
  });
}

// Fetch recent poll runs for health display
export function useMarketPollRuns(limit = 20) {
  return useQuery({
    queryKey: ['market-poll-runs', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('market_poll_runs')
        .select('*')
        .order('ran_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data as PollRun[];
    },
    refetchInterval: 10000,
  });
}

// Trigger a manual poll
export function useTriggerMarketPoll() {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);

  const trigger = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('market-poll');
      
      if (error) {
        console.error('[useTriggerMarketPoll] Error:', error);
        throw error;
      }
      
      // Invalidate market data queries
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'market-data' });
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'market-poll-runs' });
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'market-data-freshness' });
      
      return data;
    } finally {
      setLoading(false);
    }
  }, [queryClient]);

  return { trigger, loading };
}

// Real-time subscription to market data updates
export function useMarketDataRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel('market-data-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'market_data' },
        () => {
          queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'market-data' });
          queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'market-data-freshness' });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
