import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { 
  Agent, 
  Generation, 
  Trade, 
  MarketData, 
  SystemConfig 
} from '@/types/evotrader';
import { Tables } from '@/integrations/supabase/types';

// Fetch system state with current generation
export function useSystemState() {
  return useQuery({
    queryKey: ['system-state'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_state')
        .select(`
          *,
          generations:current_generation_id (*)
        `)
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
  });
}

// Fetch agents for current generation
export function useAgents(generationId: string | null) {
  return useQuery({
    queryKey: ['agents', generationId],
    queryFn: async () => {
      if (!generationId) return [];
      
      const { data, error } = await supabase
        .from('agents')
        .select('*')
        .eq('generation_id', generationId)
        .order('is_elite', { ascending: false })
        .order('capital_allocation', { ascending: false });
      
      if (error) throw error;
      
      return data.map(agent => ({
        ...agent,
        genes: agent.genes as unknown as Agent['genes'],
      }));
    },
    enabled: !!generationId,
  });
}

// Fetch recent trades
export function useTrades(generationId: string | null, limit = 50) {
  return useQuery({
    queryKey: ['trades', generationId, limit],
    queryFn: async () => {
      const query = supabase
        .from('trades')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(limit);
      
      if (generationId) {
        query.eq('generation_id', generationId);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      return data as Trade[];
    },
  });
}

// Fetch market data
export function useMarketData() {
  return useQuery({
    queryKey: ['market-data'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('market_data')
        .select('*');
      
      if (error) throw error;
      return data as MarketData[];
    },
  });
}

// Fetch generation history
export function useGenerationHistory(limit = 10) {
  return useQuery({
    queryKey: ['generation-history', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('generations')
        .select('*')
        .eq('is_active', false)
        .order('generation_number', { ascending: false })
        .limit(limit);
      
      if (error) throw error;
      return data as Generation[];
    },
  });
}

// Fetch system config
export function useSystemConfig() {
  return useQuery({
    queryKey: ['system-config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_config')
        .select('config')
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      
      if (data?.config) {
        return data.config as unknown as SystemConfig;
      }
      
      // Return default config if none exists
      return {
        trading: { symbols: ['BTC-USD', 'ETH-USD'], decision_interval_minutes: 60 },
        capital: { total: 10000, active_pool_pct: 0.40 },
        population: { size: 100, elite_count: 10, parent_count: 15 },
        generation: { max_days: 7, max_trades: 100, max_drawdown_pct: 0.15 },
        risk: { max_trades_per_agent_per_day: 5, max_trades_per_symbol_per_day: 50 },
      } as SystemConfig;
    },
  });
}

// Real-time subscriptions hook
export function useRealtimeSubscriptions() {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Subscribe to trades
    const tradesChannel = supabase
      .channel('trades-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trades' },
        () => {
          queryClient.invalidateQueries({ 
            predicate: (query) => query.queryKey[0] === 'trades' 
          });
        }
      )
      .subscribe();

    // Subscribe to system state
    const stateChannel = supabase
      .channel('system-state-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'system_state' },
        () => {
          queryClient.invalidateQueries({ 
            predicate: (query) => query.queryKey[0] === 'system-state' 
          });
        }
      )
      .subscribe();

    // Subscribe to market data
    const marketChannel = supabase
      .channel('market-data-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'market_data' },
        () => {
          queryClient.invalidateQueries({ 
            predicate: (query) => query.queryKey[0] === 'market-data' 
          });
        }
      )
      .subscribe();

    // Subscribe to agents
    const agentsChannel = supabase
      .channel('agents-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'agents' },
        () => {
          queryClient.invalidateQueries({ 
            predicate: (query) => query.queryKey[0] === 'agents' 
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(tradesChannel);
      supabase.removeChannel(stateChannel);
      supabase.removeChannel(marketChannel);
      supabase.removeChannel(agentsChannel);
    };
  }, [queryClient]);
}
