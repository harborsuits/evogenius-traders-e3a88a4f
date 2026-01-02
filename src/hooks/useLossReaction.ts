import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useSystemConfig, LossReactionConfig } from './useSystemConfig';

interface LossReactionSession {
  consecutive_losses: number;
  last_loss_at: string | null;
  cooldown_until: string | null;
  size_multiplier: number;
  day_stopped: boolean;
  day_stopped_reason: string | null;
}

export interface LossReactionState {
  session: LossReactionSession;
  config: {
    cooldown_minutes_after_loss: number;
    max_consecutive_losses: number;
    halve_size_drawdown_pct: number;
    day_stop_pct: number;
  };
  // Derived state
  isInCooldown: boolean;
  cooldownRemainingMs: number;
  isDayStopped: boolean;
  isSizeReduced: boolean;
}

export function useLossReaction() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: config } = useSystemConfig();

  // Get current loss reaction state
  const lossReaction = config?.loss_reaction as LossReactionConfig | undefined;
  
  // Calculate derived state with defaults
  const rawSession = lossReaction?.session;
  const session: LossReactionSession = {
    consecutive_losses: rawSession?.consecutive_losses ?? 0,
    last_loss_at: rawSession?.last_loss_at ?? null,
    cooldown_until: rawSession?.cooldown_until ?? null,
    size_multiplier: rawSession?.size_multiplier ?? 1,
    day_stopped: rawSession?.day_stopped ?? false,
    day_stopped_reason: rawSession?.day_stopped_reason ?? null,
  };

  const cooldownEnd = session.cooldown_until ? new Date(session.cooldown_until) : null;
  const isInCooldown = cooldownEnd ? cooldownEnd > new Date() : false;
  const cooldownRemainingMs = cooldownEnd ? Math.max(0, cooldownEnd.getTime() - Date.now()) : 0;

  const state: LossReactionState = {
    session,
    config: {
      cooldown_minutes_after_loss: lossReaction?.cooldown_minutes_after_loss ?? 15,
      max_consecutive_losses: lossReaction?.max_consecutive_losses ?? 3,
      halve_size_drawdown_pct: lossReaction?.halve_size_drawdown_pct ?? 2,
      day_stop_pct: lossReaction?.day_stop_pct ?? 5,
    },
    isInCooldown,
    cooldownRemainingMs,
    isDayStopped: session.day_stopped,
    isSizeReduced: session.size_multiplier < 1,
  };

  // Reset session mutation
  const resetSessionMutation = useMutation({
    mutationFn: async (reason?: string) => {
      const { data, error } = await supabase.functions.invoke('loss-reaction', {
        body: { action: 'reset_session', reason },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'system-config' });
      toast({
        title: 'Loss Reaction Reset',
        description: 'Session state has been reset.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Reset Failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    },
  });

  // Clear cooldown mutation
  const clearCooldownMutation = useMutation({
    mutationFn: async (reason?: string) => {
      const { data, error } = await supabase.functions.invoke('loss-reaction', {
        body: { action: 'clear_cooldown', reason },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'system-config' });
      toast({
        title: 'Cooldown Cleared',
        description: 'Trading cooldown has been manually cleared.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Clear Failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    },
  });

  return {
    state,
    resetSession: resetSessionMutation.mutate,
    clearCooldown: clearCooldownMutation.mutate,
    isResetting: resetSessionMutation.isPending,
    isClearing: clearCooldownMutation.isPending,
  };
}
