// Unified portfolio data hook - returns Paper or Coinbase data based on trade mode
import { useQuery } from '@tanstack/react-query';
import { useCurrentTradeMode } from '@/contexts/TradeModeContext';
import { usePaperAccount, usePaperPositions, usePaperOrders, usePaperRealtimeSubscriptions } from './usePaperTrading';
import { useMarketData } from './useEvoTraderData';
import { supabase } from '@/integrations/supabase/client';

export interface PortfolioAccount {
  id: string;
  name: string;
  cash: number;
  startingCash: number;
  baseCurrency: string;
}

export interface PortfolioPosition {
  id: string;
  symbol: string;
  qty: number;
  avgEntryPrice: number;
  currentPrice: number;
  value: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
}

export interface PortfolioOrder {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  qty: number;
  status: string;
  filledPrice: number | null;
  createdAt: string;
}

export interface PortfolioSummary {
  totalEquity: number;
  cash: number;
  positionValue: number;
  unrealizedPnl: number;
  totalPnl: number;
  totalPnlPct: number;
  positionCount: number;
}

interface CoinbaseAccount {
  id: string;
  name: string;
  currency: string;
  available: number;
  hold: number;
  total: number;
  type: string;
}

// Fetch Coinbase balances when in live mode
function useCoinbaseBalances(enabled: boolean) {
  return useQuery({
    queryKey: ['coinbase-balances-live'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('coinbase-balances');
      if (error) throw error;
      return data as { ok: boolean; accounts?: CoinbaseAccount[]; error?: string };
    },
    enabled,
    staleTime: 30000, // 30 seconds for live data
    refetchInterval: 30000, // Auto-refresh every 30s when live
  });
}

/**
 * Unified portfolio hook - switches between Paper and Coinbase data based on trade mode
 */
export function usePortfolioData() {
  const { isLive, isLiveArmed, isPaper, mode } = useCurrentTradeMode();
  
  // Paper data hooks (always enabled but only used when in paper mode)
  const { data: paperAccount, isLoading: paperAccountLoading } = usePaperAccount();
  const { data: paperPositions = [], isLoading: paperPositionsLoading } = usePaperPositions(paperAccount?.id);
  const { data: paperOrders = [], isLoading: paperOrdersLoading } = usePaperOrders(paperAccount?.id, 10);
  const { data: marketData = [] } = useMarketData();
  
  // Coinbase data (only fetched when in live mode and armed)
  const { data: coinbaseData, isLoading: coinbaseLoading } = useCoinbaseBalances(isLive && isLiveArmed);
  
  // Enable realtime for paper mode
  usePaperRealtimeSubscriptions();

  // Build unified account data
  const account: PortfolioAccount | null = isPaper && paperAccount
    ? {
        id: paperAccount.id,
        name: 'Paper Account',
        cash: paperAccount.cash,
        startingCash: paperAccount.starting_cash,
        baseCurrency: 'USD',
      }
    : isLive && coinbaseData?.ok
    ? {
        id: 'coinbase-live',
        name: 'Coinbase Live',
        cash: coinbaseData.accounts?.find(a => a.currency === 'USD')?.available ?? 0,
        startingCash: 0, // Unknown for live
        baseCurrency: 'USD',
      }
    : null;

  // Build unified positions data
  const positions: PortfolioPosition[] = isPaper
    ? paperPositions.filter(p => p.qty !== 0).map(pos => {
        const market = marketData.find(m => m.symbol === pos.symbol);
        const currentPrice = market?.price ?? pos.avg_entry_price;
        const value = pos.qty * currentPrice;
        const cost = pos.qty * pos.avg_entry_price;
        const unrealizedPnl = value - cost;
        const unrealizedPnlPct = cost > 0 ? (unrealizedPnl / cost) * 100 : 0;
        return {
          id: pos.id,
          symbol: pos.symbol,
          qty: pos.qty,
          avgEntryPrice: pos.avg_entry_price,
          currentPrice,
          value,
          unrealizedPnl,
          unrealizedPnlPct,
        };
      })
    : isLive && coinbaseData?.ok
    ? (coinbaseData.accounts || [])
        .filter(a => a.currency !== 'USD' && a.available > 0)
        .map(a => {
          const symbol = `${a.currency}-USD`;
          const market = marketData.find(m => m.symbol === symbol);
          const currentPrice = market?.price ?? 0;
          const value = a.available * currentPrice;
          return {
            id: a.id,
            symbol,
            qty: a.available,
            avgEntryPrice: 0, // Unknown for live
            currentPrice,
            value,
            unrealizedPnl: 0, // Can't calculate without entry
            unrealizedPnlPct: 0,
          };
        })
    : [];

  // Build unified orders data
  const orders: PortfolioOrder[] = isPaper
    ? paperOrders.map(o => ({
        id: o.id,
        symbol: o.symbol,
        side: o.side,
        qty: o.qty,
        status: o.status,
        filledPrice: o.filled_price,
        createdAt: o.created_at,
      }))
    : []; // Live orders would come from a different source (trades table or Coinbase API)

  // Build summary
  const positionValue = positions.reduce((sum, p) => sum + p.value, 0);
  const unrealizedPnl = positions.reduce((sum, p) => sum + p.unrealizedPnl, 0);
  const cash = account?.cash ?? 0;
  const totalEquity = cash + positionValue;
  const startingCash = account?.startingCash ?? totalEquity;
  const totalPnl = totalEquity - startingCash;
  const totalPnlPct = startingCash > 0 ? (totalPnl / startingCash) * 100 : 0;

  const summary: PortfolioSummary = {
    totalEquity,
    cash,
    positionValue,
    unrealizedPnl,
    totalPnl,
    totalPnlPct,
    positionCount: positions.length,
  };

  const isLoading = isPaper
    ? paperAccountLoading || paperPositionsLoading || paperOrdersLoading
    : coinbaseLoading;

  return {
    mode,
    isPaper,
    isLive,
    isLiveArmed,
    account,
    positions,
    orders,
    summary,
    isLoading,
    // Source indicator for UI
    dataSource: isPaper ? 'paper' : isLiveArmed ? 'coinbase' : 'locked',
  };
}
