import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { isArmedNow, getArmedSecondsRemaining } from './useArmLive';

export interface LiveSafetyStatus {
  // System
  isArmed: boolean;
  secondsRemaining: number;
  tradeMode: 'paper' | 'live';
  
  // Coinbase
  coinbaseConnected: boolean;
  canTrade: boolean;
  permissions: string[];
  
  // Cash
  usdAvailable: number;
  usdHold: number;
  liveCap: number;
  maxAllowed: number;
  
  // Ready state
  isReady: boolean;
  blockers: string[];
}

export function useLiveSafety() {
  const queryClient = useQueryClient();

  // System state
  const { data: systemState, isLoading: stateLoading } = useQuery({
    queryKey: ['live-safety-system'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_state')
        .select('trade_mode, live_armed_until')
        .limit(1)
        .single();
      if (error) throw error;
      return data;
    },
    refetchInterval: 5000,
  });

  // Config
  const { data: configData } = useQuery({
    queryKey: ['live-safety-config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_config')
        .select('config')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.config as Record<string, unknown> | null;
    },
  });

  // Exchange connection
  const { data: exchange, isLoading: exchangeLoading } = useQuery({
    queryKey: ['live-safety-exchange'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('exchange_connections')
        .select('*')
        .eq('provider', 'coinbase')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Balances
  const { data: balancesData, isLoading: balancesLoading } = useQuery({
    queryKey: ['live-safety-balances'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('coinbase-balances');
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000,
  });

  // Compute status
  const armedUntil = systemState?.live_armed_until;
  const isArmed = isArmedNow(armedUntil);
  const secondsRemaining = getArmedSecondsRemaining(armedUntil);
  const tradeMode = (systemState?.trade_mode as 'paper' | 'live') ?? 'paper';

  const coinbaseConnected = exchange?.is_enabled ?? false;
  const permissions = (exchange?.permissions as string[]) ?? [];
  const canTrade = permissions.includes('wallet:orders:create');

  const usdBalance = balancesData?.accounts?.find((a: { currency: string }) => a.currency === 'USD');
  const usdAvailable = usdBalance?.available ?? 0;
  const usdHold = usdBalance?.hold ?? 0;
  const liveCap = (configData?.live_cap_usd as number) ?? 100;
  const maxAllowed = Math.min(usdAvailable - usdHold, liveCap);

  // Calculate blockers
  const blockers: string[] = [];
  if (!coinbaseConnected) blockers.push('Coinbase not connected');
  if (!canTrade) blockers.push('Missing trade permission');
  if (!isArmed) blockers.push('Live not armed');
  if (maxAllowed <= 0) blockers.push('No cash available');

  const isReady = blockers.length === 0;

  return {
    status: {
      isArmed,
      secondsRemaining,
      tradeMode,
      coinbaseConnected,
      canTrade,
      permissions,
      usdAvailable,
      usdHold,
      liveCap,
      maxAllowed,
      isReady,
      blockers,
    } as LiveSafetyStatus,
    isLoading: stateLoading || exchangeLoading || balancesLoading,
    refresh: () => {
      queryClient.invalidateQueries({ queryKey: ['live-safety-system'] });
      queryClient.invalidateQueries({ queryKey: ['live-safety-exchange'] });
      queryClient.invalidateQueries({ queryKey: ['live-safety-balances'] });
    },
  };
}
