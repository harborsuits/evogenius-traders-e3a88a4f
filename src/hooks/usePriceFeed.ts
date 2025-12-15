import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PriceRow {
  symbol: string;
  price: number | null;
  change_24h: number | null;
  volume_24h?: number | null;
  updated_at?: string;
}

export function usePriceFeed() {
  return useQuery({
    queryKey: ["price-feed"],
    queryFn: async (): Promise<{ symbols: PriceRow[] }> => {
      const { data, error } = await supabase.functions.invoke("price-feed");
      if (error) throw error;
      return data;
    },
    refetchInterval: 8000,
    staleTime: 4000,
  });
}
