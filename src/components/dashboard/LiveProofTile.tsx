import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Shield, ShieldAlert, ShieldCheck, Clock, Database, Wallet } from 'lucide-react';
import { isArmedNow, getArmedSecondsRemaining } from '@/hooks/useArmLive';
import { useEffect, useState } from 'react';

interface LastLiveOrder {
  id: string;
  symbol: string;
  side: string;
  timestamp: string;
}

export function LiveProofTile() {
  const [secondsRemaining, setSecondsRemaining] = useState(0);

  // System state (mode + armed status)
  const { data: systemState, isLoading: stateLoading } = useQuery({
    queryKey: ['live-proof-system'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_state')
        .select('trade_mode, live_armed_until')
        .limit(1)
        .single();
      if (error) throw error;
      return data;
    },
    refetchInterval: 1000,
  });

  // Last live order (from control_events where mode=live and action=trade_executed)
  const { data: lastLiveOrder } = useQuery({
    queryKey: ['live-proof-last-order'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('control_events')
        .select('metadata, triggered_at')
        .eq('action', 'live_order_executed')
        .order('triggered_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const meta = data.metadata as Record<string, unknown>;
      return {
        id: (meta?.order_id as string) || 'unknown',
        symbol: (meta?.symbol as string) || 'unknown',
        side: (meta?.side as string) || 'unknown',
        timestamp: data.triggered_at,
      } as LastLiveOrder;
    },
    refetchInterval: 10000,
  });

  // Live balance timestamp (from coinbase-balances cached response)
  const { data: balanceData } = useQuery({
    queryKey: ['live-proof-balance'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('coinbase-balances');
      if (error) return null;
      return data;
    },
    refetchInterval: 30000,
    enabled: systemState?.trade_mode === 'live',
  });

  const tradeMode = systemState?.trade_mode ?? 'paper';
  const armedUntil = systemState?.live_armed_until;
  const isArmed = isArmedNow(armedUntil);

  // Countdown timer
  useEffect(() => {
    if (!isArmed) {
      setSecondsRemaining(0);
      return;
    }
    
    const updateRemaining = () => {
      setSecondsRemaining(getArmedSecondsRemaining(armedUntil));
    };
    
    updateRemaining();
    const interval = setInterval(updateRemaining, 1000);
    return () => clearInterval(interval);
  }, [armedUntil, isArmed]);

  // Derive execution state
  const isLive = tradeMode === 'live';
  const executionState = isLive ? (isArmed ? 'ARMED' : 'LOCKED') : 'PAPER';
  const broker = isLive ? 'coinbase-live' : 'paper-simulator';

  // Icon and colors based on state
  const getStateConfig = () => {
    if (!isLive) {
      return { 
        icon: Shield, 
        color: 'text-muted-foreground', 
        bgColor: 'bg-muted/50',
        badgeVariant: 'secondary' as const
      };
    }
    if (isArmed) {
      return { 
        icon: ShieldAlert, 
        color: 'text-destructive', 
        bgColor: 'bg-destructive/10',
        badgeVariant: 'destructive' as const
      };
    }
    return { 
      icon: ShieldCheck, 
      color: 'text-amber-500', 
      bgColor: 'bg-amber-500/10',
      badgeVariant: 'outline' as const
    };
  };

  const config = getStateConfig();
  const Icon = config.icon;

  if (stateLoading) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Live Proof
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`h-full ${config.bgColor} border-${isArmed ? 'destructive' : isLive ? 'amber-500' : 'border'}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Icon className={`h-4 w-4 ${config.color}`} />
            Live Proof
          </span>
          <Badge variant={config.badgeVariant} className="uppercase text-xs">
            {tradeMode}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Execution State */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Execution
          </span>
          <div className="flex items-center gap-2">
            <Badge 
              variant={executionState === 'ARMED' ? 'destructive' : executionState === 'LOCKED' ? 'outline' : 'secondary'}
              className="text-xs"
            >
              {executionState}
            </Badge>
            {isArmed && secondsRemaining > 0 && (
              <span className="text-xs font-mono text-destructive">
                {secondsRemaining}s
              </span>
            )}
          </div>
        </div>

        {/* Broker */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Database className="h-3 w-3" />
            Broker
          </span>
          <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
            {broker}
          </code>
        </div>

        {/* Last Live Order */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Last Live Order</span>
          <span className="text-xs font-mono truncate max-w-[120px]">
            {lastLiveOrder ? (
              <span title={lastLiveOrder.id}>
                {lastLiveOrder.side.toUpperCase()} {lastLiveOrder.symbol.split('-')[0]}
              </span>
            ) : (
              <span className="text-muted-foreground">none</span>
            )}
          </span>
        </div>

        {/* Live Balance Timestamp (only in live mode) */}
        {isLive && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Wallet className="h-3 w-3" />
              Balance Sync
            </span>
            <span className="text-xs font-mono">
              {balanceData?.fetched_at ? (
                new Date(balanceData.fetched_at).toLocaleTimeString()
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </span>
          </div>
        )}

        {/* Warning when ARMED */}
        {isArmed && (
          <div className="mt-2 p-2 bg-destructive/20 rounded-md border border-destructive/30">
            <p className="text-xs text-destructive font-medium text-center">
              ⚠️ REAL MONEY AT RISK
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
