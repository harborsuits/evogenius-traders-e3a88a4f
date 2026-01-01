import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useState, useCallback } from 'react';

interface ArmResponse {
  success: boolean;
  armed_until: string | null;
  session_id: string | null;
  max_orders?: number;
}

interface ArmSession {
  id: string;
  mode: string;
  created_at: string;
  expires_at: string;
  spent_at: string | null;
  spent_by_request_id: string | null;
  max_live_orders: number;
  orders_executed: number;
}

export function useArmLive() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  // Query current session state
  const { data: currentSession, refetch: refetchSession } = useQuery({
    queryKey: ['arm-session', currentSessionId],
    queryFn: async () => {
      if (!currentSessionId) return null;
      
      const { data, error } = await supabase
        .from('arm_sessions')
        .select('*')
        .eq('id', currentSessionId)
        .single();
      
      if (error) {
        console.error('Failed to fetch arm session:', error);
        return null;
      }
      
      return data as ArmSession;
    },
    enabled: !!currentSessionId,
    refetchInterval: currentSessionId ? 2000 : false, // Poll while session is active
  });

  const armMutation = useMutation({
    mutationFn: async (): Promise<ArmResponse> => {
      const { data, error } = await supabase.functions.invoke('arm-live', {
        body: { action: 'arm' },
      });

      if (error) throw error;
      return data as ArmResponse;
    },
    onSuccess: (data) => {
      setCurrentSessionId(data.session_id);
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'system-state' });
      toast({
        title: 'Live Mode Armed',
        description: `You have 60 seconds. Session: ${data.session_id?.slice(0, 8)}... (1 order max)`,
        variant: 'destructive',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to arm',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const disarmMutation = useMutation({
    mutationFn: async (): Promise<ArmResponse> => {
      const { data, error } = await supabase.functions.invoke('arm-live', {
        body: { action: 'disarm' },
      });

      if (error) throw error;
      return data as ArmResponse;
    },
    onSuccess: () => {
      // Clear session state FIRST
      setCurrentSessionId(null);
      // Nuke ALL arm-session queries (regardless of session ID suffix)
      queryClient.removeQueries({
        predicate: (q) => q.queryKey[0] === 'arm-session',
      });
      // Refresh system-state so isArmed updates immediately
      queryClient.invalidateQueries({ queryKey: ['system-state'] });
      toast({
        title: 'Live Mode Disarmed',
        description: 'Live trading is now locked.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to disarm',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Generate a unique request ID for idempotent execution
  const generateRequestId = useCallback(() => {
    return crypto.randomUUID();
  }, []);

  // Check if the current session has been spent
  const isSessionSpent = currentSession?.spent_at !== null;
  const isSessionExpired = currentSession ? new Date(currentSession.expires_at) < new Date() : true;
  const canExecute = currentSessionId && !isSessionSpent && !isSessionExpired;

  return {
    arm: armMutation.mutate,
    disarm: disarmMutation.mutate,
    isArming: armMutation.isPending,
    isDisarming: disarmMutation.isPending,
    // New canary hard-lock fields
    currentSessionId,
    currentSession,
    isSessionSpent,
    isSessionExpired,
    canExecute,
    generateRequestId,
    refetchSession,
  };
}

// Helper to check if armed based on timestamp
export function isArmedNow(armedUntil: string | null): boolean {
  if (!armedUntil) return false;
  return new Date(armedUntil) > new Date();
}

// Helper to get remaining seconds
export function getArmedSecondsRemaining(armedUntil: string | null): number {
  if (!armedUntil) return 0;
  const remaining = Math.floor((new Date(armedUntil).getTime() - Date.now()) / 1000);
  return Math.max(0, remaining);
}