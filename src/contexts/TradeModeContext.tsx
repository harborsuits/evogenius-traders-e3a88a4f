import React, { createContext, useContext, ReactNode } from 'react';
import { useTradeMode, setTradeMode } from '@/hooks/usePaperTrading';
import { useQueryClient } from '@tanstack/react-query';

export type TradeMode = 'paper' | 'live';

interface TradeModeContextType {
  mode: TradeMode;
  isLoading: boolean;
  isPaper: boolean;
  isLive: boolean;
  setMode: (mode: TradeMode) => Promise<void>;
  getTable: (baseTable: 'orders' | 'positions' | 'accounts' | 'fills') => string;
}

const TradeModeContext = createContext<TradeModeContextType | undefined>(undefined);

// Table mapping for paper vs live modes
const TABLE_MAP: Record<TradeMode, Record<string, string>> = {
  paper: {
    orders: 'paper_orders',
    positions: 'paper_positions',
    accounts: 'paper_accounts',
    fills: 'paper_fills',
  },
  live: {
    // Live mode would use different tables or the same tables with different filters
    // For now, live trading is blocked, so these map to paper tables
    orders: 'paper_orders', // Would be 'live_orders' or 'trades' when implemented
    positions: 'paper_positions',
    accounts: 'paper_accounts',
    fills: 'paper_fills',
  },
};

export function TradeModeProvider({ children }: { children: ReactNode }) {
  const { data: mode = 'paper', isLoading } = useTradeMode();
  const queryClient = useQueryClient();

  const handleSetMode = async (newMode: TradeMode) => {
    await setTradeMode(newMode);
    // Invalidate all mode-dependent queries
    queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'trade-mode' });
    queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'system-state' });
  };

  const getTable = (baseTable: 'orders' | 'positions' | 'accounts' | 'fills'): string => {
    return TABLE_MAP[mode][baseTable];
  };

  const value: TradeModeContextType = {
    mode,
    isLoading,
    isPaper: mode === 'paper',
    isLive: mode === 'live',
    setMode: handleSetMode,
    getTable,
  };

  return (
    <TradeModeContext.Provider value={value}>
      {children}
    </TradeModeContext.Provider>
  );
}

export function useTradeModeContext() {
  const context = useContext(TradeModeContext);
  if (context === undefined) {
    throw new Error('useTradeModeContext must be used within a TradeModeProvider');
  }
  return context;
}

// Convenience hook for components that just need to know the mode
export function useCurrentTradeMode() {
  const { mode, isPaper, isLive, isLoading } = useTradeModeContext();
  return { mode, isPaper, isLive, isLoading };
}
