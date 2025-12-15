import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface MissedMove {
  symbol: string;
  change_24h: number;
  price: number;
  had_signal: boolean;
  last_decision: string | null;
  last_decision_reason: string | null;
  decision_time: string | null;
  move_type: 'pump' | 'dump';
}

interface MissedMovesResponse {
  missed_moves: MissedMove[];
  thresholds: { pump: number; dump: number };
}

export function useMissedMoves() {
  return useQuery({
    queryKey: ["missed-moves"],
    queryFn: async (): Promise<MissedMovesResponse> => {
      const { data, error } = await supabase.functions.invoke("missed-moves");
      if (error) throw error;
      return data;
    },
    refetchInterval: 60000, // Every minute
    staleTime: 30000,
  });
}
