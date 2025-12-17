import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ExitEfficiencyData {
  symbol: string;
  exit_price: number;
  exit_time: string;
  current_price: number;
  missed_profit_pct: number; // (current - exit) / exit * 100
  missed_profit_usd: number; // (current - exit) * qty
  qty: number;
  was_profitable_exit: boolean; // true if exit was profitable (vs entry)
  agent_id: string | null;
}

export interface ExitEfficiencyResult {
  exits: ExitEfficiencyData[];
  avg_missed_profit_pct: number;
  total_missed_profit_usd: number;
  exit_count: number;
}

// Fetch recent SELL fills and compute exit efficiency vs current prices
export function useExitEfficiency(lookbackHours = 24) {
  return useQuery({
    queryKey: ['exit-efficiency', lookbackHours],
    queryFn: async (): Promise<ExitEfficiencyResult> => {
      // Get paper account first
      const { data: account, error: accountError } = await supabase
        .from('paper_accounts')
        .select('id')
        .limit(1)
        .single();

      if (accountError || !account) {
        return { exits: [], avg_missed_profit_pct: 0, total_missed_profit_usd: 0, exit_count: 0 };
      }

      // Get recent SELL orders with fills from last N hours
      const cutoff = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();
      
      const { data: sellOrders, error: ordersError } = await supabase
        .from('paper_orders')
        .select('id, symbol, filled_price, filled_qty, filled_at, agent_id')
        .eq('account_id', account.id)
        .eq('side', 'sell')
        .eq('status', 'filled')
        .gte('filled_at', cutoff)
        .order('filled_at', { ascending: false })
        .limit(50);

      if (ordersError || !sellOrders || sellOrders.length === 0) {
        return { exits: [], avg_missed_profit_pct: 0, total_missed_profit_usd: 0, exit_count: 0 };
      }

      // Get current market prices for sold symbols
      const symbols = [...new Set(sellOrders.map(o => o.symbol))];
      
      const { data: marketData, error: marketError } = await supabase
        .from('market_data')
        .select('symbol, price')
        .in('symbol', symbols);

      if (marketError) {
        return { exits: [], avg_missed_profit_pct: 0, total_missed_profit_usd: 0, exit_count: 0 };
      }

      // Build price map
      const priceMap = new Map<string, number>();
      marketData?.forEach(m => priceMap.set(m.symbol, m.price));

      // Compute exit efficiency for each sell
      const exits: ExitEfficiencyData[] = sellOrders
        .filter(order => order.filled_price && order.filled_qty && priceMap.has(order.symbol))
        .map(order => {
          const exitPrice = order.filled_price!;
          const currentPrice = priceMap.get(order.symbol)!;
          const qty = order.filled_qty!;
          
          // MFE-based efficiency: how much more we could have gotten
          // Positive = price went up after we sold (we missed profit)
          // Negative = price went down after we sold (good exit)
          const missedProfitPct = ((currentPrice - exitPrice) / exitPrice) * 100;
          const missedProfitUsd = (currentPrice - exitPrice) * qty;
          
          return {
            symbol: order.symbol,
            exit_price: exitPrice,
            exit_time: order.filled_at!,
            current_price: currentPrice,
            missed_profit_pct: missedProfitPct,
            missed_profit_usd: missedProfitUsd,
            qty,
            was_profitable_exit: missedProfitPct <= 0, // Good if price dropped after exit
            agent_id: order.agent_id,
          };
        });

      // Aggregate stats
      const exitCount = exits.length;
      const avgMissedProfitPct = exitCount > 0
        ? exits.reduce((sum, e) => sum + e.missed_profit_pct, 0) / exitCount
        : 0;
      const totalMissedProfitUsd = exits.reduce((sum, e) => sum + e.missed_profit_usd, 0);

      return {
        exits,
        avg_missed_profit_pct: avgMissedProfitPct,
        total_missed_profit_usd: totalMissedProfitUsd,
        exit_count: exitCount,
      };
    },
    refetchInterval: 60000, // Refresh every minute to update current prices
    staleTime: 30000,
  });
}
