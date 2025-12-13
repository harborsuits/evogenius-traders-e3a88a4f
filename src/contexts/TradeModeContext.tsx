import React, { createContext, useContext, ReactNode } from 'react';
import { useTradeMode, setTradeMode } from '@/hooks/usePaperTrading';
import { useQueryClient } from '@tanstack/react-query';

export type TradeMode = 'paper' | 'live';

interface TradeModeContextType {
  mode: TradeMode;
  isLoading: boolean;
  isPaper: boolean;
  isLive: boolean;
  isLiveArmed: boolean; // Future: will be true only when live is armed
  setMode: (mode: TradeMode) => Promise<void>;
  getTable: (baseTable: 'orders' | 'positions' | 'accounts' | 'fills') => string;
}

const TradeModeContext = createContext<TradeModeContextType | undefined>(undefined);

// Table mapping for paper mode only - live mode is blocked
const PAPER_TABLE_MAP: Record<string, string> = {
  orders: 'paper_orders',
  positions: 'paper_positions',
  accounts: 'paper_accounts',
  fills: 'paper_fills',
};

export function TradeModeProvider({ children }: { children: ReactNode }) {
  const { data: mode = 'paper', isLoading } = useTradeMode();
  const queryClient = useQueryClient();

  const handleSetMode = async (newMode: TradeMode) => {
    await setTradeMode(newMode);
    // Invalidate ALL queries on mode switch to ensure clean UI flip
    queryClient.invalidateQueries();
  };

  const getTable = (baseTable: 'orders' | 'positions' | 'accounts' | 'fills'): string => {
    if (mode === 'live') {
      // Live mode is not armed - throw to prevent silently reading paper data
      throw new Error('LIVE_NOT_ARMED: Live mode tables not configured. Use paper mode.');
    }
    return PAPER_TABLE_MAP[baseTable];
  };

  const value: TradeModeContextType = {
    mode,
    isLoading,
    isPaper: mode === 'paper',
    isLive: mode === 'live',
    isLiveArmed: false, // Always false until ARM flow is implemented
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
  const { mode, isPaper, isLive, isLiveArmed, isLoading } = useTradeModeContext();
  return { mode, isPaper, isLive, isLiveArmed, isLoading };
}
