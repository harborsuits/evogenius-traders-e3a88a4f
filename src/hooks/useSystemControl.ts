import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

type ControlAction = 'start' | 'pause' | 'stop';

interface ControlResponse {
  success: boolean;
  status: string;
  previousStatus: string;
  message: string;
}

export function useSystemControl() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (action: ControlAction): Promise<ControlResponse> => {
      const { data, error } = await supabase.functions.invoke('system-control', {
        body: { action },
      });

      if (error) throw error;
      return data as ControlResponse;
    },
    onSuccess: (data) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] === 'system-state',
      });
      queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] === 'control-events',
      });

      toast({
        title: data.message,
        description: `Status: ${data.previousStatus} → ${data.status}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Control action failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
