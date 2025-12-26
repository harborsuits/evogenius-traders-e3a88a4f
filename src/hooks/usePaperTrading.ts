import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface PaperAccount {
  id: string;
  name: string;
  base_currency: string;
  starting_cash: number;
  cash: number;
  created_at: string;
  updated_at: string;
}

export interface PaperPosition {
  id: string;
  account_id: string;
  symbol: string;
  qty: number;
  avg_entry_price: number;
  realized_pnl: number;
  updated_at: string;
}

export interface PaperOrder {
  id: string;
  account_id: string;
  agent_id: string | null;
  generation_id: string | null;
  symbol: string;
  side: 'buy' | 'sell';
  order_type: 'market' | 'limit';
  qty: number;
  limit_price: number | null;
  status: 'pending' | 'filled' | 'rejected' | 'cancelled';
  filled_price: number | null;
  filled_qty: number | null;
  slippage_pct: number | null;
  reason: string | null;
  created_at: string;
  filled_at: string | null;
}

export interface PaperFill {
  id: string;
  order_id: string;
  symbol: string;
  side: 'buy' | 'sell';
  qty: number;
  price: number;
  fee: number;
  timestamp: string;
}

// Fetch paper account
export function usePaperAccount() {
  return useQuery({
    queryKey: ['paper-account'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('paper_accounts')
        .select('*')
        .limit(1)
        .single();

      if (error) throw error;
      return data as PaperAccount;
    },
  });
}

// Fetch paper positions
export function usePaperPositions(accountId: string | undefined) {
  return useQuery({
    queryKey: ['paper-positions', accountId],
    queryFn: async () => {
      if (!accountId) return [];

      const { data, error } = await supabase
        .from('paper_positions')
        .select('*')
        .eq('account_id', accountId);

      if (error) throw error;
      return data as PaperPosition[];
    },
    enabled: !!accountId,
  });
}

// Fetch paper orders (recent)
export function usePaperOrders(accountId: string | undefined, limit = 20) {
  return useQuery({
    queryKey: ['paper-orders', accountId, limit],
    queryFn: async () => {
      if (!accountId) return [];

      const { data, error } = await supabase
        .from('paper_orders')
        .select('*')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data as PaperOrder[];
    },
    enabled: !!accountId,
  });
}

// Fetch paper fills for P&L calculation
export function usePaperFills(accountId: string | undefined) {
  return useQuery({
    queryKey: ['paper-fills', accountId],
    queryFn: async () => {
      if (!accountId) return [];

      // Get all fills for orders belonging to this account
      const { data: orders, error: ordersError } = await supabase
        .from('paper_orders')
        .select('id')
        .eq('account_id', accountId);

      if (ordersError) throw ordersError;

      const orderIds = orders?.map((o) => o.id) ?? [];
      if (orderIds.length === 0) return [];

      const { data, error } = await supabase
        .from('paper_fills')
        .select('*')
        .in('order_id', orderIds)
        .order('timestamp', { ascending: false });

      if (error) throw error;
      return data as PaperFill[];
    },
    enabled: !!accountId,
  });
}

// Get trade mode from system state
export function useTradeMode() {
  return useQuery({
    queryKey: ['trade-mode'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_state')
        .select('trade_mode')
        .limit(1)
        .single();

      if (error) throw error;
      return (data?.trade_mode ?? 'paper') as 'paper' | 'live';
    },
    staleTime: 0, // Always refetch when invalidated
    refetchOnWindowFocus: true,
  });
}

// Set trade mode
export async function setTradeMode(mode: 'paper' | 'live') {
  const { error } = await supabase
    .from('system_state')
    .update({ trade_mode: mode, updated_at: new Date().toISOString() })
    .neq('id', '00000000-0000-0000-0000-000000000000'); // Update all rows

  if (error) throw error;
}

// Execute paper trade
export async function executePaperTrade(params: {
  symbol: string;
  side: 'buy' | 'sell';
  qty: number;
  orderType?: 'market' | 'limit';
  limitPrice?: number;
  agentId?: string;
  generationId?: string;
}) {
  const { data, error } = await supabase.functions.invoke('paper-execute', {
    body: params,
  });

  if (error) throw error;
  return data;
}

// Reset paper account
export async function resetPaperAccount() {
  const { data, error } = await supabase.functions.invoke('paper-reset');

  if (error) throw error;
  return data;
}

// Real-time subscriptions for paper trading
export function usePaperRealtimeSubscriptions() {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Subscribe to paper orders
    const ordersChannel = supabase
      .channel('paper-orders-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'paper_orders' },
        () => {
          queryClient.invalidateQueries({
            predicate: (query) => query.queryKey[0] === 'paper-orders',
          });
        }
      )
      .subscribe();

    // Subscribe to paper positions
    const positionsChannel = supabase
      .channel('paper-positions-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'paper_positions' },
        () => {
          queryClient.invalidateQueries({
            predicate: (query) => query.queryKey[0] === 'paper-positions',
          });
          queryClient.invalidateQueries({
            predicate: (query) => query.queryKey[0] === 'paper-account',
          });
        }
      )
      .subscribe();

    // Subscribe to paper accounts (for cash updates)
    const accountsChannel = supabase
      .channel('paper-accounts-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'paper_accounts' },
        () => {
          queryClient.invalidateQueries({
            predicate: (query) => query.queryKey[0] === 'paper-account',
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(positionsChannel);
      supabase.removeChannel(accountsChannel);
    };
  }, [queryClient]);
}
