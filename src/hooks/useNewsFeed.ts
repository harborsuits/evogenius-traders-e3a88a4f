import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface NewsItem {
  id: string;
  source: string;
  outlet: string | null;
  title: string;
  url: string;
  published_at: string;
  symbols: string[];
  importance: number;
  created_at: string;
}

interface NewsFeedResponse {
  market_lane: NewsItem[];
  bot_lane: NewsItem[];
  bot_symbols: string[];
  recent_fills: Array<{
    symbol: string;
    timestamp: string;
    side: string;
    price: number;
  }>;
  news_intensity: Record<string, number>;
  top_volume_symbols: string[];
}

export function useNewsFeed() {
  return useQuery({
    queryKey: ['news-feed'],
    queryFn: async (): Promise<NewsFeedResponse> => {
      const { data, error } = await supabase.functions.invoke('news-feed');
      
      if (error) {
        console.error('[useNewsFeed] Error:', error);
        throw error;
      }
      
      return data;
    },
    refetchInterval: 60000, // Refresh every minute
    staleTime: 30000,
  });
}

export function useNewsItems(limit = 30) {
  return useQuery({
    queryKey: ['news-items', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('news_items')
        .select('*')
        .order('published_at', { ascending: false })
        .limit(limit);
      
      if (error) throw error;
      return data as NewsItem[];
    },
    refetchInterval: 60000,
  });
}
