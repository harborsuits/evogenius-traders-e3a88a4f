import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ArmResponse {
  success: boolean;
  armed_until: string | null;
}

export function useArmLive() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const armMutation = useMutation({
    mutationFn: async (): Promise<ArmResponse> => {
      const { data, error } = await supabase.functions.invoke('arm-live', {
        body: { action: 'arm' },
      });

      if (error) throw error;
      return data as ArmResponse;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'system-state' });
      toast({
        title: 'Live Mode Armed',
        description: 'You have 60 seconds to execute live trades.',
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
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'system-state' });
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

  return {
    arm: armMutation.mutate,
    disarm: disarmMutation.mutate,
    isArming: armMutation.isPending,
    isDisarming: disarmMutation.isPending,
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
