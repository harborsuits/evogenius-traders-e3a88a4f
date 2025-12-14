import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Fetches live count of learnable orders for the current generation
 * - Excludes test_mode orders
 * - Uses server-sourced generation_id from system_state
 */
export function useGenOrdersCount(generationId: string | null) {
  return useQuery({
    queryKey: ['gen-orders-count', generationId],
    queryFn: async () => {
      if (!generationId) return 0;
      
      const { count, error } = await supabase
        .from('paper_orders')
        .select('*', { count: 'exact', head: true })
        .eq('generation_id', generationId)
        .eq('status', 'filled')
        .or('tags->test_mode.is.null,tags->test_mode.eq.false');
      
      if (error) {
        console.error('[useGenOrdersCount] Error:', error);
        return 0;
      }
      
      return count ?? 0;
    },
    enabled: !!generationId,
    refetchInterval: 30000, // Refresh every 30s
  });
}

/**
 * Fetches cohort count from generation_agents table
 */
export function useCohortCount(generationId: string | null) {
  return useQuery({
    queryKey: ['cohort-count', generationId],
    queryFn: async () => {
      if (!generationId) return 0;
      
      const { count, error } = await supabase
        .from('generation_agents')
        .select('*', { count: 'exact', head: true })
        .eq('generation_id', generationId);
      
      if (error) {
        console.error('[useCohortCount] Error:', error);
        return 0;
      }
      
      return count ?? 0;
    },
    enabled: !!generationId,
    refetchInterval: 60000, // Refresh every 60s
  });
}
