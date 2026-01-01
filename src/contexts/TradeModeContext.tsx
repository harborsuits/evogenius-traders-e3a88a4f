import React, { createContext, useContext, ReactNode } from 'react';
import { useTradeMode, setTradeMode } from '@/hooks/usePaperTrading';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { isArmedNow } from '@/hooks/useArmLive';

export type TradeMode = 'paper' | 'live';

interface TradeModeContextType {
  mode: TradeMode;
  isLoading: boolean;
  isPaper: boolean;
  isLive: boolean;
  isLiveArmed: boolean;
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
  const { data: mode = 'paper', isLoading: modeLoading } = useTradeMode();
  const queryClient = useQueryClient();

  // Check if live is armed
  const { data: systemState, isLoading: stateLoading } = useQuery({
    queryKey: ['system-state-armed'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_state')
        .select('live_armed_until')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchInterval: 1000, // Check every second when armed
  });

  const isLiveArmed = isArmedNow((systemState as any)?.live_armed_until ?? null);
  const isLoading = modeLoading || stateLoading;

  const handleSetMode = async (newMode: TradeMode) => {
    await setTradeMode(newMode);
    // Invalidate trade-mode query specifically, then all queries
    await queryClient.invalidateQueries({ queryKey: ['trade-mode'] });
    await queryClient.invalidateQueries({ queryKey: ['system-state-armed'] });
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
    isLiveArmed,
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
// DEFENSIVE: Returns safe paper/locked defaults if context is missing (e.g., HMR glitch)
export function useCurrentTradeMode() {
  const ctx = useContext(TradeModeContext);

  if (!ctx) {
    // Fail-safe: never allow live execution when context is missing
    console.warn('[TradeMode] Context missing — returning safe paper defaults');
    return {
      mode: 'paper' as TradeMode,
      isPaper: true,
      isLive: false,
      isLiveArmed: false,
      isLoading: false,
    };
  }

  const { mode, isPaper, isLive, isLiveArmed, isLoading } = ctx;
  return { mode, isPaper, isLive, isLiveArmed, isLoading };
}
