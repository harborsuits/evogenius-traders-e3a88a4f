// Unified portfolio data hook - returns Paper or Coinbase data based on trade mode
// CRITICAL: Paper data NEVER appears in Live mode. This is the safety boundary.
import { useQuery } from '@tanstack/react-query';
import { useCurrentTradeMode } from '@/contexts/TradeModeContext';
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

// DATA SOURCE CONTRACT - single source of truth
export type DataSource = 'paper' | 'coinbase' | 'locked' | 'error';

/**
 * Unified portfolio hook - switches between Paper and Coinbase data based on trade mode
 * 
 * SAFETY RULES (non-negotiable):
 * 1. Live mode + NOT armed = LOCKED (zero data, no paper fallback)
 * 2. Live mode + armed = COINBASE only (or ERROR if fetch fails)
 * 3. Paper mode = PAPER only
 * 
 * Paper hooks are DISABLED in live mode - they don't even run.
 */
export function usePortfolioData() {
  const { isLive, isLiveArmed, isPaper, mode, isLoading: modeLoading } = useCurrentTradeMode();
  const { data: marketData = [] } = useMarketData();

  // ========== PAPER DATA (only runs when isPaper === true) ==========
  const { data: paperAccount, isLoading: paperAccountLoading, error: paperAccountError } = useQuery({
    queryKey: ['paper-account-portfolio'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('paper_accounts')
        .select('*')
        .limit(1)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: isPaper, // DISABLED in live mode
    staleTime: 30000,
  });

  const { data: paperPositions = [], isLoading: paperPositionsLoading } = useQuery({
    queryKey: ['paper-positions-portfolio', paperAccount?.id],
    queryFn: async () => {
      if (!paperAccount?.id) return [];
      const { data, error } = await supabase
        .from('paper_positions')
        .select('*')
        .eq('account_id', paperAccount.id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: isPaper && !!paperAccount?.id, // DISABLED in live mode
    staleTime: 30000,
  });

  const { data: paperOrders = [], isLoading: paperOrdersLoading } = useQuery({
    queryKey: ['paper-orders-portfolio', paperAccount?.id],
    queryFn: async () => {
      if (!paperAccount?.id) return [];
      const { data, error } = await supabase
        .from('paper_orders')
        .select('*')
        .eq('account_id', paperAccount.id)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
    enabled: isPaper && !!paperAccount?.id, // DISABLED in live mode
    staleTime: 30000,
  });

  // ========== COINBASE DATA (only runs when isLive AND isLiveArmed) ==========
  const { 
    data: coinbaseData, 
    isLoading: coinbaseLoading, 
    error: coinbaseError,
    refetch: refetchCoinbase 
  } = useQuery({
    queryKey: ['coinbase-balances-live'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('coinbase-balances');
      if (error) throw error;
      return data as { ok: boolean; accounts?: CoinbaseAccount[]; error?: string };
    },
    enabled: isLive && isLiveArmed, // ONLY when live AND armed
    staleTime: 15000, // 15 seconds for live data
    refetchInterval: isLive && isLiveArmed ? 15000 : false, // Auto-refresh only when armed
    retry: 1, // Don't spam retries
  });

  // ========== DETERMINE DATA SOURCE (the single truth) ==========
  let dataSource: DataSource;
  
  if (isPaper) {
    dataSource = paperAccountError ? 'error' : 'paper';
  } else if (isLive) {
    if (!isLiveArmed) {
      dataSource = 'locked'; // Not armed = NO DATA
    } else if (coinbaseError || (coinbaseData && !coinbaseData.ok)) {
      dataSource = 'error'; // Armed but fetch failed
    } else {
      dataSource = 'coinbase';
    }
  } else {
    dataSource = 'locked'; // Fallback safety
  }

  // ========== BUILD UNIFIED DATA (based on dataSource) ==========
  
  // LOCKED or ERROR = null/empty data, never fallback to paper
  const account: PortfolioAccount | null = (() => {
    if (dataSource === 'paper' && paperAccount) {
      return {
        id: paperAccount.id,
        name: 'Paper Account',
        cash: paperAccount.cash,
        startingCash: paperAccount.starting_cash,
        baseCurrency: 'USD',
      };
    }
    if (dataSource === 'coinbase' && coinbaseData?.ok) {
      const usdAccount = coinbaseData.accounts?.find(a => a.currency === 'USD');
      return {
        id: 'coinbase-live',
        name: 'Coinbase Live',
        cash: usdAccount?.available ?? 0,
        startingCash: 0, // Unknown for live
        baseCurrency: 'USD',
      };
    }
    // LOCKED or ERROR = null
    return null;
  })();

  const positions: PortfolioPosition[] = (() => {
    if (dataSource === 'paper') {
      return paperPositions
        .filter(p => p.qty !== 0)
        .map(pos => {
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
        });
    }
    if (dataSource === 'coinbase' && coinbaseData?.ok) {
      return (coinbaseData.accounts || [])
        .filter(a => a.currency !== 'USD' && a.available > 0.0001)
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
        });
    }
    // LOCKED or ERROR = empty
    return [];
  })();

  const orders: PortfolioOrder[] = (() => {
    if (dataSource === 'paper') {
      return paperOrders.map(o => ({
        id: o.id,
        symbol: o.symbol,
        side: o.side,
        qty: o.qty,
        status: o.status,
        filledPrice: o.filled_price,
        createdAt: o.created_at,
      }));
    }
    // Live orders would come from a different source - empty for now
    // LOCKED or ERROR = empty
    return [];
  })();

  // ========== BUILD SUMMARY ==========
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

  // ========== LOADING STATE ==========
  const isLoading = modeLoading || (isPaper
    ? paperAccountLoading || paperPositionsLoading || paperOrdersLoading
    : isLiveArmed ? coinbaseLoading : false);

  // ========== ERROR INFO ==========
  const errorMessage = (() => {
    if (dataSource === 'error') {
      if (coinbaseError) return String(coinbaseError);
      if (coinbaseData && !coinbaseData.ok) return coinbaseData.error ?? 'Coinbase fetch failed';
      if (paperAccountError) return String(paperAccountError);
    }
    return null;
  })();

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
    // Data source contract - this is the ONLY truth
    dataSource,
    errorMessage,
    // Retry function for error recovery
    refetchCoinbase: dataSource === 'error' && isLive ? refetchCoinbase : undefined,
  };
}
