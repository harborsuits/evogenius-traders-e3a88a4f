import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Shield, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  DollarSign,
  Lock,
  Unlock,
  Timer,
  Key,
  Activity,
  RefreshCw,
  Loader2,
  Power
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useArmLive, isArmedNow, getArmedSecondsRemaining } from '@/hooks/useArmLive';
import { useTradeModeContext } from '@/contexts/TradeModeContext';

interface CoinbaseBalance {
  currency: string;
  available: number;
  hold: number;
  total: number;
}

interface LiveSafetyState {
  // System state
  isArmed: boolean;
  armedUntil: string | null;
  secondsRemaining: number;
  tradeMode: 'paper' | 'live';
  
  // Coinbase state
  coinbaseConnected: boolean;
  coinbasePermissions: string[];
  canTrade: boolean;
  usdAvailable: number;
  usdHold: number;
  
  // Safety limits
  liveCap: number;
  maxAllowed: number;
  
  // Last action
  lastAttempt: {
    timestamp: string;
    action: string;
    result: 'success' | 'blocked';
    reason?: string;
  } | null;
}

export function LiveSafetyPanel() {
  const queryClient = useQueryClient();
  const { mode, setMode } = useTradeModeContext();
  const { arm, disarm, isArming, isDisarming } = useArmLive();
  const [secondsRemaining, setSecondsRemaining] = useState(0);

  // Fetch system state
  const { data: systemState, isLoading: stateLoading } = useQuery({
    queryKey: ['live-safety-system-state'],
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

  // Fetch system config for live cap
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

  // Fetch exchange connection
  const { data: exchangeConnection, isLoading: exchangeLoading } = useQuery({
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

  // Fetch Coinbase balances
  const { data: balances, isLoading: balancesLoading, refetch: refetchBalances } = useQuery({
    queryKey: ['live-safety-balances'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('coinbase-balances');
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000,
  });

  // Fetch last live trade attempt
  const { data: lastAttempt } = useQuery({
    queryKey: ['live-safety-last-attempt'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('control_events')
        .select('*')
        .in('action', ['live_trade_executed', 'live_trade_blocked', 'live_trade_error'])
        .order('triggered_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchInterval: 10000,
  });

  // Countdown timer
  const armedUntil = systemState?.live_armed_until;
  const isArmed = isArmedNow(armedUntil);

  useEffect(() => {
    if (!armedUntil) {
      setSecondsRemaining(0);
      return;
    }

    const updateCountdown = () => {
      setSecondsRemaining(getArmedSecondsRemaining(armedUntil));
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [armedUntil]);

  // Compute derived state
  const liveCap = (configData?.live_cap_usd as number) ?? 100;
  const usdBalance = balances?.accounts?.find((a: CoinbaseBalance) => a.currency === 'USD');
  const usdAvailable = usdBalance?.available ?? 0;
  const usdHold = usdBalance?.hold ?? 0;
  const maxAllowedByBalance = usdAvailable - usdHold;
  const maxAllowed = Math.min(maxAllowedByBalance, liveCap);

  const permissions = (exchangeConnection?.permissions as string[]) ?? [];
  const canTrade = permissions.includes('wallet:orders:create');
  const coinbaseConnected = exchangeConnection?.is_enabled ?? false;

  const isLoading = stateLoading || exchangeLoading || balancesLoading;

  // Status indicators
  const checks = [
    {
      label: 'Coinbase Connected',
      passed: coinbaseConnected,
      icon: <Key className="h-4 w-4" />,
      detail: coinbaseConnected ? 'API key authenticated' : 'Not connected',
    },
    {
      label: 'Trade Permission',
      passed: canTrade,
      icon: <Shield className="h-4 w-4" />,
      detail: canTrade ? 'wallet:orders:create granted' : 'Missing wallet:orders:create permission',
    },
    {
      label: 'Live Armed',
      passed: isArmed,
      icon: <Timer className="h-4 w-4" />,
      detail: isArmed ? `${secondsRemaining}s remaining` : 'Not armed',
    },
    {
      label: 'Cash Available',
      passed: maxAllowed > 0,
      icon: <DollarSign className="h-4 w-4" />,
      detail: `$${maxAllowed.toFixed(2)} available`,
    },
  ];

  const allChecksPassed = checks.every(c => c.passed);

  return (
    <div className="space-y-4">
      {/* Main Status Card */}
      <Card className={`border-2 ${allChecksPassed ? 'border-destructive/50 bg-destructive/5' : 'border-muted'}`}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {allChecksPassed ? (
                <Unlock className="h-6 w-6 text-destructive" />
              ) : (
                <Lock className="h-6 w-6 text-muted-foreground" />
              )}
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  Live Safety Panel
                  {isArmed ? (
                    <Badge variant="destructive" className="animate-pulse">
                      ARMED — {secondsRemaining}s
                    </Badge>
                  ) : allChecksPassed ? (
                    <Badge variant="outline" className="border-amber-500 text-amber-500">
                      READY TO ARM
                    </Badge>
                  ) : (
                    <Badge variant="secondary">LOCKED</Badge>
                  )}
                </CardTitle>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ['live-safety-system-state'] });
                queryClient.invalidateQueries({ queryKey: ['live-safety-exchange'] });
                refetchBalances();
              }}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Safety Checks Grid */}
          <div className="grid grid-cols-2 gap-2">
            {checks.map((check, i) => (
              <div
                key={i}
                className={`flex items-center gap-2 p-2 rounded-lg border ${
                  check.passed
                    ? 'bg-primary/5 border-primary/20'
                    : 'bg-muted/30 border-border'
                }`}
              >
                <div className={check.passed ? 'text-primary' : 'text-muted-foreground'}>
                  {check.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-medium truncate ${check.passed ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {check.label}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{check.detail}</p>
                </div>
                {check.passed ? (
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                )}
              </div>
            ))}
          </div>

          {/* Cash Overview */}
          <div className="p-3 rounded-lg border bg-card">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-mono text-muted-foreground">Live Trading Budget</span>
              <Badge variant="outline">${liveCap} cap</Badge>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-lg font-bold text-primary">${usdAvailable.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">Available</p>
              </div>
              <div>
                <p className="text-lg font-bold text-amber-500">${usdHold.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">On Hold</p>
              </div>
              <div>
                <p className="text-lg font-bold text-foreground">${maxAllowed.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">Max Allowed</p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            {isArmed ? (
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => disarm()}
                disabled={isDisarming}
              >
                {isDisarming ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Power className="h-4 w-4 mr-2" />
                )}
                Disarm Live
              </Button>
            ) : (
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => arm(30)}
                disabled={isArming || !coinbaseConnected}
              >
                {isArming ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Shield className="h-4 w-4 mr-2" />
                )}
                ARM Live (30m)
              </Button>
            )}
            <Button
              variant={mode === 'live' ? 'secondary' : 'outline'}
              onClick={() => setMode(mode === 'live' ? 'paper' : 'live')}
            >
              {mode === 'live' ? 'Switch to Paper' : 'Switch to Live'}
            </Button>
          </div>

          {/* Last Attempt */}
          {lastAttempt && (
            <div className={`p-2 rounded-lg border text-xs ${
              lastAttempt.action === 'live_trade_executed'
                ? 'bg-primary/5 border-primary/20'
                : 'bg-destructive/5 border-destructive/20'
            }`}>
              <div className="flex items-center gap-2">
                <Activity className="h-3 w-3" />
                <span className="font-mono">
                  {lastAttempt.action === 'live_trade_executed' ? '✅ Executed' : '❌ Blocked'}
                </span>
                <span className="text-muted-foreground ml-auto">
                  {new Date(lastAttempt.triggered_at).toLocaleTimeString()}
                </span>
              </div>
              {lastAttempt.action !== 'live_trade_executed' && (
                <p className="text-muted-foreground mt-1 truncate">
                  {(lastAttempt.metadata as Record<string, unknown>)?.block_reason as string || 'Unknown reason'}
                </p>
              )}
            </div>
          )}

          {/* Warning */}
          {!canTrade && coinbaseConnected && (
            <div className="flex items-start gap-2 p-2 rounded-lg border border-amber-500/20 bg-amber-500/5">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-500">
                Your Coinbase API key needs the <code className="font-mono">wallet:orders:create</code> permission to place trades.
                Create a new key in Coinbase with trade permissions.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Permissions Detail */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-mono">API Permissions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-1">
            {permissions.length > 0 ? (
              permissions.map((perm, i) => (
                <Badge key={i} variant="secondary" className="text-xs font-mono">
                  {perm}
                </Badge>
              ))
            ) : (
              <span className="text-xs text-muted-foreground">No permissions detected</span>
            )}
          </div>
          {!canTrade && (
            <p className="text-xs text-muted-foreground mt-2">
              Required for trading: <code className="text-destructive">wallet:orders:create</code>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
