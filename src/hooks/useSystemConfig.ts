import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ShadowTradingConfig {
  enabled?: boolean;
  shadow_threshold?: number;
  max_per_cycle?: number;
  default_stop_pct?: number;
  default_target_pct?: number;
  default_trailing_pct?: number;
  max_hold_hours?: number;
  min_hold_minutes?: number;
}

export interface AdaptiveTuningConfig {
  enabled?: boolean;
  mode?: 'drought_only' | 'always';
  window_decisions?: number;
  cooldown_minutes?: number;
  step_pct?: number;
  max_relax_pct?: number;
  decay_step_pct?: number;
  last_adjusted_at?: string | null;
  offsets?: Record<string, number>;
  // Phase 4A Guardrails
  frozen_until?: string | null;
  frozen_reason?: string | null;
  freeze_after_kill_hours?: number;
  freeze_peak_dd_pct?: number;
  max_total_relax_pct?: number;
  // Phase 4B Quality Filter
  min_conf_for_tuning?: number;
  min_quality_pct?: number;
  max_single_gate_pct?: number;
}

export interface LossReactionConfig {
  enabled?: boolean;
  // Cooldown: minutes to wait after a loss before next trade
  cooldown_minutes_after_loss?: number;
  // Consecutive losses: stop trading for day after N consecutive losses
  max_consecutive_losses?: number;
  // Drawdown size reduction: halve size when day drawdown exceeds this %
  halve_size_drawdown_pct?: number;
  // Day stop: stop trading for day when day PnL drops below this %
  day_stop_pct?: number;
  // Session state (updated by backend)
  session?: {
    consecutive_losses?: number;
    last_loss_at?: string | null;
    cooldown_until?: string | null;
    size_multiplier?: number;
    day_stopped?: boolean;
    day_stopped_reason?: string | null;
  };
}

export interface StrategyThresholdsConfig {
  use_config_thresholds?: boolean;
  baseline?: {
    trend_threshold?: number;
    pullback_pct?: number;
    min_confidence?: number;
    vol_contraction?: number;
  };
  drought?: {
    trend_threshold?: number;
    pullback_pct?: number;
    min_confidence?: number;
    vol_contraction?: number;
  };
}

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
  drought_override?: 'auto' | 'force_off' | 'force_on';
  drought_cooldown_until?: string;
  adaptive_tuning?: AdaptiveTuningConfig;
  shadow_trading?: ShadowTradingConfig;
  loss_reaction?: LossReactionConfig;
  live_cap_usd?: number;
  strategy_thresholds?: StrategyThresholdsConfig;
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