import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface SystemConfig {
  capital?: {
    active_pool_pct?: number;
    total?: number;
  };
  generation?: {
    max_days?: number;
    max_drawdown_pct?: number;
    max_trades?: number;
  };
  population?: {
    elite_count?: number;
    parent_count?: number;
    size?: number;
  };
  risk?: {
    max_trades_per_agent_per_day?: number;
    max_trades_per_symbol_per_day?: number;
    paper?: {
      fee_pct?: number;
      max_position_pct?: number;
      max_trade_pct?: number;
      slippage_max_pct?: number;
      slippage_min_pct?: number;
    };
  };
  trading?: {
    decision_interval_minutes?: number;
    symbols?: string[];
  };
  strategy_test_mode?: boolean;
}

export function useSystemConfig() {
  return useQuery({
    queryKey: ['system-config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_config')
        .select('config')
        .limit(1)
        .single();

      if (error) throw error;
      return (data?.config ?? {}) as SystemConfig;
    },
  });
}

export function useStrategyTestMode() {
  const { data: config } = useSystemConfig();
  return config?.strategy_test_mode === true;
}

export function useSystemConfigRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel('system-config-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'system_config' },
        () => {
          queryClient.invalidateQueries({
            predicate: (query) => query.queryKey[0] === 'system-config',
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}